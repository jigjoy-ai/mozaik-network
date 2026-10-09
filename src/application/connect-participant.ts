import { ParticipantJoined } from "@domain/built-in-envelopers"
import { NetworkRepository } from "@domain/network-repository"
import { ParticipantRepository } from "@domain/participant-repository"
import { EnvelopeDistribution } from "@application/services/envelope-distribution"

export class ConnectParticipantUseCase {
	constructor(
		private readonly networks: NetworkRepository,
		private readonly participants: ParticipantRepository,
		private readonly distribution: EnvelopeDistribution,
	) {}

	async execute(networkId: string, participantId: string): Promise<ParticipantJoined> {
		const network = await this.networks.findById(networkId)
		if (!network) throw new Error("Network not found")

		const participant = await this.participants.findById(participantId)
		if (!participant) throw new Error("Participant not found")

		const envelope = network.connect(participant.getManifest())

		await this.networks.save(network)
		await this.distribution.toAllParticipants(network, envelope)

		return envelope
	}
}
