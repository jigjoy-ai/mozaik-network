import { PeerJoined } from "@domain/built-in-envelopers"
import { NetworkRepository } from "@domain/network-repository"
import { PeerRepository } from "@domain/peer-repository"
import { EnvelopeDistribution } from "@application/services/envelope-distribution"

export class ConnectPeerUseCase {
	constructor(
		private readonly networks: NetworkRepository,
		private readonly peers: PeerRepository,
		private readonly distribution: EnvelopeDistribution,
	) {}

	async execute(networkId: string, peerId: string): Promise<PeerJoined> {
		const network = await this.networks.findById(networkId)
		if (!network) throw new Error("Network not found")

		const peer = await this.peers.findById(peerId)
		if (!peer) throw new Error("Peer not found")

		const envelope = network.connect(peer.getManifest())

		await this.networks.save(network)
		await this.distribution.toAllPeers(network, envelope)

		return envelope
	}
}
