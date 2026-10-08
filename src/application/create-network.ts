import { Network } from "@domain/network"
import { NetworkRepository } from "@domain/network-repository"
import { Participant } from "@domain/participant"

export class CreateNetworkUseCase {
	private readonly networkRepository: NetworkRepository

	constructor(networkRepository: NetworkRepository) {
		this.networkRepository = networkRepository
	}

	async execute(name: string): Promise<Network> {
		const participants: Participant[] = []
		const network = Network.create(name, participants)

		await this.networkRepository.save(network)
		return network
	}
}
