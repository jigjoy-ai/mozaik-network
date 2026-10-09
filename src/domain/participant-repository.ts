import { Participant } from "./participant"

export interface ParticipantRepository {
	save(participant: Participant): Promise<void>
	findById(id: string): Promise<Participant | undefined>
}
