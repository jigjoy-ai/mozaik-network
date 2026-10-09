import { EnvelopeDelivery } from "@domain/envelope-delivery"
import { NetworkRepository } from "@domain/network-repository"

export class ParticipantLeaveUseCase {
	private readonly networkRepository: NetworkRepository
	private readonly envelopeDelivery: EnvelopeDelivery

	constructor(networkRepository: NetworkRepository, envelopeDelivery: EnvelopeDelivery) {
		this.networkRepository = networkRepository
		this.envelopeDelivery = envelopeDelivery
	}

	async execute(networkId: string, participantId: string): Promise<void> {
		const network = await this.networkRepository.findById(networkId)
		if (!network) {
			throw new Error("Network not found")
		}

		const envelope = network.removeParticipant(participantId)

		await this.envelopeDelivery.broadcast(networkId, envelope)
		await this.networkRepository.save(network)
	}
}
