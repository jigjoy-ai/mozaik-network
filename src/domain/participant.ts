import { Envelope } from "@domain/envelope"
import { ParticipantManifest } from "@domain/participant-manifest"

export type ParticipantRecord = {
	manifest: ParticipantManifest
	inbox: Envelope[]
}

export class Participant {
	private manifest: ParticipantManifest
	private inbox: Envelope[]

	private constructor(manifest: ParticipantManifest, inbox: Envelope[] = []) {
		this.manifest = { ...manifest }
		this.inbox = [...inbox]
	}

	getId(): string {
		return this.manifest.id
	}

	getManifest(): ParticipantManifest {
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

	toRecord(): ParticipantRecord {
		return {
			manifest: this.getManifest(),
			inbox: this.getInbox(),
		}
	}

	static create(manifest: ParticipantManifest): Participant {
		return new Participant(manifest)
	}

	static rehydrate(record: ParticipantRecord): Participant {
		return new Participant(record.manifest, record.inbox)
	}
}
