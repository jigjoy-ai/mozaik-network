import { Participant } from "@domain/participant"
import { ParticipantRepository } from "@domain/participant-repository"
import { ParticipantRole } from "@domain/participant-role"

export class InMemoryParticipantRepository implements ParticipantRepository {
	private participants: Participant[] = [
		Participant.rehydrate({
			manifest: { id: "1", name: "Participant 1", capabilities: [], role: "user" as ParticipantRole },
			inbox: [],
		}),
	]

	async save(participant: Participant): Promise<void> {
		this.participants.push(participant)
	}

	async findById(id: string): Promise<Participant | undefined> {
		console.log(`Finding participant by id: ${id}`)
		return this.participants.find((participant) => participant.getId() === id)
	}
}
