import { RequestError } from "@application/errors"
import { NetworkRepository } from "@domain/network-repository"

export class RevokeInvitesUseCase {
	constructor(private readonly networks: NetworkRepository) {}

	/** No invite of the network is good after this. Peers already made with one keep their own tokens. */
	async execute(networkId: string, ownerId: string): Promise<void> {
		const network = await this.networks.findById(networkId)
		if (!network || network.getOwnerId() !== ownerId) {
			throw new RequestError("not_found", "Network not found")
		}

		network.revokeInvites()

		await this.networks.save(network)
	}
}
