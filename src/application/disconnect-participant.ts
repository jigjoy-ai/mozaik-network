import { NetworkRepository } from "@domain/network-repository"
import { ParticipantLeft } from "@domain/built-in-envelopers"
import { EnvelopeDistribution } from "@application/services/envelope-distribution"

export class DisconnectParticipantUseCase {
	constructor(
		private readonly networks: NetworkRepository,
		private readonly distribution: EnvelopeDistribution,
	) {}

	async execute(networkId: string, participantId: string): Promise<ParticipantLeft> {
		const network = await this.networks.findById(networkId)
		if (!network) throw new Error("Network not found")

		const envelope = network.disconnect(participantId)

		await this.networks.save(network)
		await this.distribution.toAllParticipants(network, envelope)

		return envelope
	}
}
