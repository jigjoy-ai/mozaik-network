import { RequestError } from "@application/errors"
import { issueInvite } from "@application/invite-tokens"
import { NetworkRepository } from "@domain/network-repository"

export class CreateInviteUseCase {
	constructor(private readonly networks: NetworkRepository) {}

	/** The invite is returned only here. A network can have several: each stays good until all are revoked. */
	async execute(networkId: string, ownerId: string): Promise<string> {
		const network = await this.networks.findById(networkId)
		// The same answer for someone else's network as for none, so ids can't be probed.
		if (!network || network.getOwnerId() !== ownerId) {
			throw new RequestError("not_found", "Network not found")
		}

		const { invite, hash } = issueInvite(networkId)
		network.invite(hash)

		await this.networks.save(network)
		return invite
	}
}
