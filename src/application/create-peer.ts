import { Peer } from "@domain/peer"
import { PeerRepository } from "@domain/peer-repository"
import { PeerRole } from "@domain/peer-role"

export class CreatePeerUseCase {
	private readonly peerRepository: PeerRepository

	constructor(peerRepository: PeerRepository) {
		this.peerRepository = peerRepository
	}

	async execute(name: string, role: PeerRole, capabilities: readonly string[]): Promise<Peer> {
		const id = crypto.randomUUID()
		const manifest = { id, name, role, capabilities }
		const peer = Peer.create(manifest)
		await this.peerRepository.save(peer)
		return peer
	}
}
