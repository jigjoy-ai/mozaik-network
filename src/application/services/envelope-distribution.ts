import { Envelope } from "@domain/envelope"
import { EnvelopeDelivery } from "@domain/envelope-delivery"
import { Network } from "@domain/network"

export class EnvelopeDistribution {
	constructor(private readonly delivery: EnvelopeDelivery) {}

	async toAllParticipants(network: Network, envelope: Envelope): Promise<void> {
		await this.delivery.deliver(envelope, network.getParticipantIds())
	}

	async toOtherParticipants(network: Network, envelope: Envelope, senderId: string): Promise<void> {
		const recipientIds = network.getParticipantIds().filter((id) => id !== senderId)
		await this.delivery.deliver(envelope, recipientIds)
	}
}
