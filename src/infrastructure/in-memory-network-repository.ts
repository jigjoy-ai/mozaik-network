import { Network } from "@domain/network"
import { NetworkRepository } from "@domain/network-repository"

export class InMemoryNetworkRepository implements NetworkRepository {
	private networks: Network[] = []

	async save(network: Network): Promise<void> {
		this.networks.push(network)
	}

	async findById(id: string): Promise<Network | undefined> {
		return this.networks.find((network) => network.getId() === id)
	}

	async delete(id: string): Promise<void> {
		this.networks = this.networks.filter((network) => network.getId() !== id)
	}
}
