import { Participant } from "@domain/participant"
import { ParticipantRepository } from "@domain/participant-repository"
import { ParticipantRole } from "@domain/participant-role"

export class CreateParticipantUseCase {
	private readonly participantRepository: ParticipantRepository

	constructor(participantRepository: ParticipantRepository) {
		this.participantRepository = participantRepository
	}

	async execute(name: string, role: ParticipantRole, capabilities: readonly string[]): Promise<Participant> {
		const id = crypto.randomUUID()
		const manifest = { id, name, role, capabilities }
		const participant = Participant.create(manifest)
		await this.participantRepository.save(participant)
		return participant
	}
}
