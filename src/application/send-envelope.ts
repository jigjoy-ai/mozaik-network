import { NetworkRepository } from "@domain/network-repository"
import { Envelope } from "@domain/envelope"

export class SendEnvelopeUseCase {
	constructor(private readonly networkRepository: NetworkRepository) {}

	async execute(networkId: string, senderId: string, envelope: Envelope): Promise<void> {
		const network = await this.networkRepository.findById(networkId)
		if (!network) {
			throw new Error("Network not found")
		}
		const sender = network.getParticipant(senderId)
		if (!sender) {
			throw new Error("Sender not found")
		}

		network.sendEnvelope(envelope)
		// TODO: publish event
		await this.networkRepository.save(network)
	}
}
