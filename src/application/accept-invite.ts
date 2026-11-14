import { RequestError } from "@application/errors"
import { readInvite } from "@application/invite-tokens"
import { secretMatches } from "@application/secret-tokens"
import { Network } from "@domain/network"
import { NetworkRepository } from "@domain/network-repository"

export class AcceptInviteUseCase {
	constructor(private readonly networks: NetworkRepository) {}

	/** The network this invite is for, or an error: where a guest may make a peer comes only from its invite. */
	async execute(invite: unknown): Promise<Network> {
		const parsed = readInvite(invite)
		const network = parsed && (await this.networks.findById(parsed.networkId))
		if (!parsed || !network || !network.getInviteHashes().some((hash) => secretMatches(parsed.secret, hash))) {
			throw new RequestError("unauthorized", "Unknown invite")
		}
		return network
	}
}
