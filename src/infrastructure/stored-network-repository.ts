import { Network, NetworkRecord } from "@domain/network"
import { NetworkRepository } from "@domain/network-repository"
import { Table } from "@infrastructure/table"

/** What outlives the process: who is connected does not, so a network comes back with nobody in it. */
type Kept = Omit<NetworkRecord, "peerIds">

const kept = ({ id, name, ownerId, inviteHashes }: NetworkRecord): Kept => ({ id, name, ownerId, inviteHashes })

/**
 * Networks kept in a table. The networks this process has seen stay in its memory with the
 * peers connected to them; the table has what a network is, and is written when that changes.
 */
export class StoredNetworkRepository implements NetworkRepository {
	private readonly networks = new Map<string, Network>()
	private readonly written = new Map<string, string>()

	constructor(private readonly table: Table) {}

	async save(network: Network): Promise<void> {
		const record = kept(network.toRecord())
		const written = JSON.stringify(record)

		this.networks.set(record.id, network)
		// Peers coming and going save the network too: there is nothing to write for that.
		if (this.written.get(record.id) === written) return

		await this.table.put(`network#${record.id}`, "network", record)
		await this.table.put(`owner#${record.ownerId}`, record.id, { id: record.id })
		this.written.set(record.id, written)
	}

	async findById(id: string): Promise<Network | undefined> {
		const known = this.networks.get(id)
		if (known) return known

		const record = (await this.table.get(`network#${id}`, "network")) as Kept | undefined
		if (!record) return undefined

		// Another request may have loaded it meanwhile: there is one Network for an id.
		const loaded = this.networks.get(id) ?? Network.rehydrate({ ...record, peerIds: [] })
		this.networks.set(id, loaded)
		this.written.set(id, JSON.stringify(record))
		return loaded
	}

	async findByOwner(ownerId: string): Promise<Network[]> {
		const owned = await this.table.query(`owner#${ownerId}`)
		const networks = await Promise.all(owned.map((item) => this.findById(String(item.id))))
		return networks.filter((network): network is Network => network !== undefined)
	}

	async delete(id: string): Promise<void> {
		const network = await this.findById(id)
		if (!network) return

		await this.table.delete(`network#${id}`, "network")
		await this.table.delete(`owner#${network.getOwnerId()}`, id)
		this.networks.delete(id)
		this.written.delete(id)
	}
}
