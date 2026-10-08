import { Envelope, ParticipantJoined, ParticipantLeft } from "@domain/envelope"
import { Participant } from "@domain/participant"

export type NetworkRecord = {
	id: string
	name: string
	participants: Participant[]
	envelopes: Envelope[]
}

export class Network {
	private readonly id: string
	private name: string
	private participants: Participant[]
	private envelopes: Envelope[]

	constructor(id: string, name: string, participants: Participant[], envelopes: Envelope[] = []) {
		this.id = id
		this.name = name
		this.participants = participants
		this.envelopes = envelopes
	}

	getId(): string {
		return this.id
	}

	getName(): string {
		return this.name
	}

	addParticipant(participant: Participant) {
		const alreadyExists = this.participants.find((p) => p.getId() === participant.getId())

		if (alreadyExists) return

		this.participants.push(participant)

		const envelope: ParticipantJoined = {
			type: "participant.joined",
			senderId: participant.getId(),
			createdAt: new Date(),
			payload: participant.getManifest(),
		}

		this.envelopes.push(envelope)

		return envelope
	}

	getParticipant(id: string): Participant | undefined {
		const participant = this.getParticipants().find((p) => p.getId() === id)
		return participant
	}

	removeParticipant(id: string) {
		const participant = this.getParticipant(id)
		if (!participant) {
			throw new Error("Participant not found")
		}

		this.participants = this.participants.filter((p) => p.getId() !== participant.getId())
		const envelope: ParticipantLeft = {
			type: "participant.left",
			senderId: participant.getId(),
			createdAt: new Date(),
			payload: participant.getManifest(),
		}

		this.envelopes.push(envelope)

		return envelope
	}

	sendEnvelope(envelope: Envelope) {
		const participant = this.getParticipant(envelope.senderId)
		if (!participant) {
			throw new Error("Sender not found")
		}

		this.envelopes.push(envelope)

		return envelope
	}

	getEnvelopes(): Envelope[] {
		return [...this.envelopes]
	}

	getParticipants(): Participant[] {
		return [...this.participants]
	}

	static create(name: string, participants: Participant[] = []): Network {
		const id = crypto.randomUUID()
		return new Network(id, name, participants)
	}

	static rehydrate({ id, name, participants, envelopes }: NetworkRecord): Network {
		return new Network(id, name, participants, envelopes)
	}
}
