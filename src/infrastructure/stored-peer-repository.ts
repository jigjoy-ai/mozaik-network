import { Peer, PeerRecord } from "@domain/peer"
import { PeerRepository } from "@domain/peer-repository"
import { Table } from "@infrastructure/table"

/** A peer is kept this long after it was made: one that is still used is made again by its client. */
const KEPT_SECONDS = 30 * 24 * 60 * 60

type Kept = Omit<PeerRecord, "inbox">

/** Peers kept in a table, so the token a client holds still names its peer after a restart. */
export class StoredPeerRepository implements PeerRepository {
	private readonly peers = new Map<string, Peer>()

	constructor(
		private readonly table: Table,
		private readonly now: () => number = Date.now,
	) {}

	async save(peer: Peer): Promise<void> {
		const { inbox: _inbox, ...record } = peer.toRecord()

		this.peers.set(peer.getId(), peer)
		await this.table.put(`peer#${peer.getId()}`, "peer", record, Math.floor(this.now() / 1000) + KEPT_SECONDS)
	}

	async findById(id: string): Promise<Peer | undefined> {
		const known = this.peers.get(id)
		if (known) return known

		const record = (await this.table.get(`peer#${id}`, "peer")) as Kept | undefined
		if (!record) return undefined

		const loaded = this.peers.get(id) ?? Peer.rehydrate({ ...record, inbox: [] })
		this.peers.set(id, loaded)
		return loaded
	}
}
