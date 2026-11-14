import { Envelope } from "./envelope"
import { BehaviorPolicy } from "./behavior-policy"
import { PeerManifest } from "./peer-manifest"
import { reactToMessage } from "../index"

export type PeerRole = "agent" | "application" | "device"

export class Peer {
	readonly id: string
	/** What the peer joins a network with. The network shows it once, when the peer is created. */
	readonly token: string
	/** The network the peer was invited to, when it was created with an invite. */
	readonly invitedTo: string | undefined
	private policy: BehaviorPolicy
	private manifest: PeerManifest

	constructor(id: string, manifest: PeerManifest, policy: BehaviorPolicy, token: string, invitedTo?: string) {
		this.id = id
		this.policy = policy
		this.manifest = manifest
		this.token = token
		this.invitedTo = invitedTo
	}

	getPolicy(): BehaviorPolicy {
		return this.policy
	}

	getManifest(): PeerManifest {
		return { ...this.manifest }
	}

	async receive(envelope: Envelope<any>): Promise<void> {
		await reactToMessage(this, envelope.networkId, envelope)
	}
}
