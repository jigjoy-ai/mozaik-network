import { Peer } from "@domain/peer"
import { PeerRepository } from "@domain/peer-repository"
import { PeerRole } from "@domain/peer-role"

export class InMemoryPeerRepository implements PeerRepository {
	private peers: Peer[] = [
		Peer.rehydrate({
			manifest: { id: "1", name: "Peer 1", capabilities: [], role: "user" as PeerRole },
			inbox: [],
		}),
	]

	async save(peer: Peer): Promise<void> {
		this.peers.push(peer)
	}

	async findById(id: string): Promise<Peer | undefined> {
		console.log(`Finding peer by id: ${id}`)
		return this.peers.find((peer) => peer.getId() === id)
	}
}
