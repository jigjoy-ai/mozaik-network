import { Network } from "@domain/network"
import { NetworkRepository } from "@domain/network-repository"

export class ListNetworksUseCase {
	constructor(private readonly networks: NetworkRepository) {}

	/** The networks an account made. */
	async execute(ownerId: string): Promise<Network[]> {
		return await this.networks.findByOwner(ownerId)
	}
}
