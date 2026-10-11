import { Envelope } from "@domain/envelope"
import { PeerManifest } from "@domain/peer-manifest"

export type PeerRecord = {
	manifest: PeerManifest
	inbox: Envelope[]
}

export class Peer {
	private manifest: PeerManifest
	private inbox: Envelope[]

	private constructor(manifest: PeerManifest, inbox: Envelope[] = []) {
		this.manifest = { ...manifest }
		this.inbox = [...inbox]
	}

	getId(): string {
		return this.manifest.id
	}

	getManifest(): PeerManifest {
		return { ...this.manifest }
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
			inbox: this.getInbox(),
		}
	}

	static create(manifest: PeerManifest): Peer {
		return new Peer(manifest)
	}

	static rehydrate(record: PeerRecord): Peer {
		return new Peer(record.manifest, record.inbox)
	}
}
