import { PeerWelcomed } from "@domain/built-in-envelopers"
import { EnvelopeFactory } from "@domain/envelope-factory"
import { EnvelopeRepository } from "@domain/envelope-repositories"
import { Network } from "@domain/network"
import { NetworkRepository } from "@domain/network-repository"
import { Peer } from "@domain/peer"
import { PeerManifest } from "@domain/peer-manifest"
import { PeerRepository } from "@domain/peer-repository"
import { EnvelopeDistribution } from "@application/services/envelope-distribution"
import { RequestError } from "@application/errors"
import { readPeerToken, secretMatches } from "@application/peer-tokens"

/** How many of the network's latest messages a peer is shown when it joins. */
const RECENT_MESSAGES = 20

export class ConnectPeerUseCase {
	constructor(
		private readonly networks: NetworkRepository,
		private readonly peers: PeerRepository,
		private readonly envelopes: EnvelopeRepository,
		private readonly distribution: EnvelopeDistribution,
	) {}

	/** The peer whose token this is, or an error: who a connection is comes only from its token. */
	async identify(token: unknown): Promise<Peer> {
		const parsed = readPeerToken(token)
		const peer = parsed && (await this.peers.findById(parsed.peerId))
		if (!parsed || !peer || !secretMatches(parsed.secret, peer.getTokenHash())) {
			throw new RequestError("unauthorized", "Unknown peer token")
		}
		return peer
	}

	/** The others learn that the peer joined; the peer itself is told who is here and what was said lately. */
	async execute(networkId: string, peer: Peer): Promise<PeerWelcomed> {
		const network = await this.networks.findById(networkId)
		// The same answer for someone else's network as for none, so ids can't be probed.
		if (!network || network.getOwnerId() !== peer.getOwnerId() || !peer.mayJoin(networkId)) {
			throw new RequestError("not_found", "Network not found")
		}

		// A peer that is already here has reconnected: nobody is told it joined again.
		if (!network.hasPeer(peer.getId())) {
			const joined = network.connect(peer.getManifest())

			await this.networks.save(network)
			await this.distribution.toAllPeers(network, joined)
		}

		const welcome = EnvelopeFactory.peerWelcomed(
			networkId,
			peer.getId(),
			await this.manifests(network),
			await this.envelopes.findRecent(networkId, RECENT_MESSAGES),
		)
		await this.distribution.toPeer(welcome, peer.getId())

		return welcome
	}

	private async manifests(network: Network): Promise<PeerManifest[]> {
		const peers = await Promise.all(network.getPeerIds().map((id) => this.peers.findById(id)))
		return peers.filter((peer) => peer !== undefined).map((peer) => peer.getManifest())
	}
}
