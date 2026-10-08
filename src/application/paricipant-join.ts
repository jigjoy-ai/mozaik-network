import { NetworkRepository } from "@domain/network-repository"
import { Participant, ParticipantManifest } from "@domain/participant"
import { SituationSpecification } from "@domain/situation-specification"

export class ParticipantJoinUseCase {
	private readonly networkRepository: NetworkRepository

	constructor(networkRepository: NetworkRepository) {
		this.networkRepository = networkRepository
	}

	async execute(
		name: string,
		capabilities: readonly string[],
		specifications: SituationSpecification[],
		networkId: string,
	): Promise<void> {
		const network = await this.networkRepository.findById(networkId)
		if (!network) {
			throw new Error("Network not found")
		}

		const manifest: ParticipantManifest = {
			id: crypto.randomUUID(),
			name,
			capabilities,
			role: "external",
		}
		const participant = new Participant(manifest, specifications)

		const event = network.addParticipant(participant)
		// TODO: publish event
		await this.networkRepository.save(network)
	}
}
