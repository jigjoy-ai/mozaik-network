import { Envelope } from "@domain/envelope"
import { PeerManifest } from "@domain/peer-manifest"

export type PeerRecord = {
	manifest: PeerManifest
	/** The account the peer belongs to. Not in the manifest, which other peers see. */
	ownerId: string
	/** The hash of the secret in the peer's token. */
	tokenHash: string
	/** The only network the peer may join, when it was made with an invite; any of its owner's otherwise. */
	networkId?: string
	inbox: Envelope[]
}

export class Peer {
	private manifest: PeerManifest
	private readonly ownerId: string
	private readonly tokenHash: string
	private readonly networkId: string | undefined
	private inbox: Envelope[]

	private constructor(
		manifest: PeerManifest,
		ownerId: string,
		tokenHash: string,
		networkId?: string,
		inbox: Envelope[] = [],
	) {
		this.manifest = { ...manifest }
		this.ownerId = ownerId
		this.tokenHash = tokenHash
		this.networkId = networkId
		this.inbox = [...inbox]
	}

	getId(): string {
		return this.manifest.id
	}

	getOwnerId(): string {
		return this.ownerId
	}

	getTokenHash(): string {
		return this.tokenHash
	}

	getManifest(): PeerManifest {
		return { ...this.manifest }
	}

	mayJoin(networkId: string): boolean {
		return this.networkId === undefined || this.networkId === networkId
	}

	receive(envelope: Envelope): void {
		const alreadyReceived = this.inbox.some((item) => item.getId() === envelope.getId())

		if (alreadyReceived) return

		this.inbox.push(envelope)
	}

	getInbox(): Envelope[] {
		return [...this.inbox]
	}

	toRecord(): PeerRecord {
		return {
			manifest: this.getManifest(),
			ownerId: this.ownerId,
			tokenHash: this.tokenHash,
			networkId: this.networkId,
			inbox: this.getInbox(),
		}
	}

	static create(manifest: PeerManifest, ownerId: string, tokenHash: string, networkId?: string): Peer {
		return new Peer(manifest, ownerId, tokenHash, networkId)
	}

	static rehydrate(record: PeerRecord): Peer {
		return new Peer(record.manifest, record.ownerId, record.tokenHash, record.networkId, record.inbox)
	}
}
