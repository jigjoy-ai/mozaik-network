import { MessageSent, ParticipantJoined, ParticipantLeft } from "./built-in-envelopers"
import { Envelope } from "./envelope"
import { ParticipantManifest } from "./participant-manifest"

export class EnvelopeFactory {
	static create<TType extends string, TPayload>(
		networkId: string,
		senderId: string,
		type: TType,
		payload: TPayload,
	): Envelope<TType, TPayload> {
		const id = crypto.randomUUID()
		const createdAt = new Date()
		return new Envelope(id, networkId, type, senderId, createdAt, payload)
	}

	static participantJoined(networkId: string, manifest: ParticipantManifest): ParticipantJoined {
		return this.create(networkId, manifest.id, "participant.joined", manifest)
	}

	static participantLeft(networkId: string, participantId: string): ParticipantLeft {
		return this.create(networkId, participantId, "participant.left", { participantId })
	}

	static messageSent(networkId: string, senderId: string, message: string): MessageSent {
		return this.create(networkId, senderId, "message.sent", { message })
	}
}
