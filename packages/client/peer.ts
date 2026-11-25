import { Envelope } from "./envelope"
import { applyPolicy, PolicyDefinition } from "@jigjoy/mozaik-rule-engine"
import { PeerManifest } from "./peer-manifest"

export type PeerRole = "agent" | "application" | "device"

export class Peer {
	readonly id: string
	/** What the peer joins a network with. The network shows it once, when the peer is created. */
	readonly token: string
	/** The network the peer was invited to, when it was created with an invite. */
	readonly invitedTo: string | undefined
	private policy: PolicyDefinition
	private manifest: PeerManifest

	constructor(id: string, manifest: PeerManifest, policy: PolicyDefinition, token: string, invitedTo?: string) {
		this.id = id
		this.policy = policy
		this.manifest = manifest
		this.token = token
		this.invitedTo = invitedTo
	}

	getPolicy(): PolicyDefinition {
		return this.policy
	}

	getManifest(): PeerManifest {
		return { ...this.manifest }
	}

	async receive(envelope: Envelope<any>): Promise<void> {
		await applyPolicy(this.policy, envelope)
	}
}
