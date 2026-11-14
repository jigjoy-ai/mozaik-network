import { join, leave, sendMessage } from "@client/index"
import { NetworkClient } from "@client/network-client"
import { Peer } from "@client/peer/peer"
import { readInviteLink, writeInviteLink } from "./invite-link"
import { mozaikCloudKey } from "./mozaik-cloud-key"
import { NetworkSettings, SavedNetwork } from "./network-settings"
import { NetworkView } from "./network-view"
import { claudeCodePolicy } from "./rules"
import { SendLimit } from "./send-limit"

type Membership = { peer: Peer; networkId: string }

/** This Claude Code session in a network: it is a peer of its own, there for as long as the session runs. */
export class NetworkSession {
	private membership: Membership | undefined

	constructor(
		private readonly settings: NetworkSettings,
		private readonly view: NetworkView,
		private readonly limit: SendLimit,
		private readonly peerName: string,
		private readonly defaultOrigin: string,
	) {}

	getMembership(): Membership | undefined {
		return this.membership
	}

	/** Makes a network, joins it, and returns the link that lets others in. */
	async create(name: string): Promise<string> {
		this.mustBeOutside()

		const origin = this.defaultOrigin
		const client = new NetworkClient({ origin, apiKey: mozaikCloudKey() })
		const network = await client.createNetwork({ name })
		const invite = await client.createInvite(network.id)

		await this.enter({ origin, invite, name })
		return writeInviteLink({ origin, invite })
	}

	/** Joins the network of an invite link, or the saved one when there is no link. */
	async join(link?: string): Promise<void> {
		this.mustBeOutside()

		const network = link ? readInviteLink(link, this.defaultOrigin) : this.settings.read()
		if (!network) {
			throw new Error(
				link ? "That is not an invite link" : "No network is saved: pass an invite link, or create a network",
			)
		}

		await this.enter(network)
	}

	/** Leaves for this session; with `forget`, the sessions to come don't join either. */
	async leave(forget: boolean): Promise<void> {
		if (this.membership) {
			await leave(this.membership.peer, this.membership.networkId)
			this.membership = undefined
			this.view.clear()
		}

		if (forget) this.settings.forget()
	}

	/** With `to`, a peer's id or name, the message goes to that peer only. */
	async send(text: string, to?: string): Promise<void> {
		if (!this.membership) throw new Error("Not in a network: join one first")
		const { peer, networkId } = this.membership

		const recipient = to === undefined ? undefined : this.view.find(to)
		if (to !== undefined && !recipient) throw new Error(`No peer "${to}" in the network`)

		this.limit.take()
		await sendMessage(peer, networkId, text, recipient?.id)

		// The network doesn't send a peer its own messages back.
		this.view.heard({ id: crypto.randomUUID(), senderId: peer.id, text, to: recipient?.id, at: new Date() })
	}

	/** The invite makes a new peer for this session, and the network is saved for the sessions to come. */
	private async enter(network: SavedNetwork): Promise<void> {
		const client = new NetworkClient({ origin: network.origin })
		const peer = await client.createPeer({
			name: this.peerName,
			role: "agent",
			capabilities: ["message"],
			invite: network.invite,
			policy: claudeCodePolicy,
		})
		if (!peer.invitedTo) throw new Error("The network didn't say which network the invite is for")

		await join(peer, peer.invitedTo, client)

		this.membership = { peer, networkId: peer.invitedTo }
		this.settings.save(network)
	}

	private mustBeOutside(): void {
		if (this.membership) throw new Error("Already in a network: leave it first")
	}
}
