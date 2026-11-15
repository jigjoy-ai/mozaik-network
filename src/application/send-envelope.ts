import { EnvelopeDistribution } from "@application/services/envelope-distribution"
import { RequestError } from "@application/errors"
import { EnvelopeFactory } from "@domain/envelope-factory"
import { EnvelopeRepository } from "@domain/envelope-repositories"
import { Metering } from "@domain/metering"
import { NetworkRepository } from "@domain/network-repository"

/** Who sends: the peer this connection joined as. */
export type Sender = { readonly id: string; readonly name: string }

export class SendEnvelopeUseCase {
	constructor(
		private readonly networks: NetworkRepository,
		private readonly envelopes: EnvelopeRepository,
		private readonly distribution: EnvelopeDistribution,
		private readonly metering: Metering,
	) {}

	/**
	 * One message sent is one message counted, against the network's owner, however many peers it reaches.
	 * With a recipient it reaches that peer only, and isn't kept for those who join later.
	 * The sender's name goes with the message, so it is still known after the sender has left.
	 */
	async execute(networkId: string, sender: Sender, message: string, recipientId?: string): Promise<void> {
		const network = await this.networks.findById(networkId)
		if (!network) throw new RequestError("not_found", "Network not found")

		const envelope = EnvelopeFactory.messageSent(networkId, sender, message, recipientId)
		network.validateEnvelope(envelope)

		if (recipientId !== undefined && !network.hasPeer(recipientId)) {
			throw new RequestError("not_found", "Peer not in this network")
		}

		const ownerId = network.getOwnerId()
		const allowance = await this.metering.allowance(ownerId)
		if (!allowance.allowed) throw new RequestError("payment_required", allowance.reason)

		await this.metering.record(ownerId, 1)

		if (recipientId !== undefined) {
			await this.distribution.toPeer(envelope, recipientId)
			return
		}

		await this.envelopes.save(envelope)
		await this.distribution.toOtherPeers(network, envelope, sender.id)
	}
}
