import { EnvelopeDelivery } from "@domain/envelope-delivery"
import { NetworkRepository } from "@domain/network-repository"
import { Participant, ParticipantManifest } from "@domain/participant"
import { SituationSpecification } from "@domain/situation-specification"

export class ParticipantJoinUseCase {
	private readonly networkRepository: NetworkRepository
	private readonly envelopeDelivery: EnvelopeDelivery

	constructor(networkRepository: NetworkRepository, envelopeDelivery: EnvelopeDelivery) {
		this.networkRepository = networkRepository
		this.envelopeDelivery = envelopeDelivery
	}

	async execute(
		name: string,
		capabilities: readonly string[],
		specifications: SituationSpecification[],
		networkId: string,
	): Promise<string> {
		const network = await this.networkRepository.findById(networkId)
		if (!network) {
			throw new Error("Network not found")
		}

		const manifest: ParticipantManifest = {
			id: crypto.randomUUID(),
			name,
			capabilities,
			role: "external",
		}
		const participant = new Participant(manifest, specifications)

		const envelope = network.addParticipant(participant)
		await this.networkRepository.save(network)
		await this.envelopeDelivery.broadcast(networkId, envelope)

		return manifest.id
	}
}
