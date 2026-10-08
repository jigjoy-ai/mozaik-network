import { NetworkRepository } from "@domain/network-repository"

export class ParticipantLeaveUseCase {
	private readonly networkRepository: NetworkRepository

	constructor(networkRepository: NetworkRepository) {
		this.networkRepository = networkRepository
	}

	async execute(networkId: string, participantId: string): Promise<void> {
		const network = await this.networkRepository.findById(networkId)
		if (!network) {
			throw new Error("Network not found")
		}

		const envelope = network.removeParticipant(participantId)

		// TODO: publish event
		await this.networkRepository.save(network)
	}
}
