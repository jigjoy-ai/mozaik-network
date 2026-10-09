import { EnvelopeDistribution } from "@application/services/envelope-distribution"
import { EnvelopeFactory } from "@domain/envelope-factory"
import { NetworkRepository } from "@domain/network-repository"

export class SendEnvelopeUseCase {
	constructor(
		private readonly networks: NetworkRepository,
		private readonly distribution: EnvelopeDistribution,
	) {}

	async execute(networkId: string, senderId: string, message: string): Promise<void> {
		const network = await this.networks.findById(networkId)
		if (!network) throw new Error("Network not found")

		const envelope = EnvelopeFactory.messageSent(networkId, senderId, message)
		network.validateEnvelope(envelope)

		await this.distribution.toOtherParticipants(network, envelope, senderId)
	}
}
