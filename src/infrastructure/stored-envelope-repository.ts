import { Envelope, EnvelopeRecord } from "@domain/envelope"
import { EnvelopeRepository } from "@domain/envelope-repositories"
import { Item, Table } from "@infrastructure/table"

/** An envelope is kept this long: a session that joins reads what was said lately, not everything ever. */
const KEPT_SECONDS = 30 * 24 * 60 * 60

type Kept = Omit<EnvelopeRecord, "createdAt"> & { createdAt: string }

const envelope = (item: Item): Envelope => {
	const { id, networkId, type, senderId, createdAt, payload } = item as Kept
	return new Envelope(id, networkId, type, senderId, new Date(createdAt), payload)
}

/** Envelopes kept in a table, in the order they were made within their network. */
export class StoredEnvelopeRepository implements EnvelopeRepository {
	constructor(
		private readonly table: Table,
		private readonly now: () => number = Date.now,
	) {}

	async save(saved: Envelope): Promise<void> {
		const record: Kept = {
			id: saved.getId(),
			networkId: saved.getNetworkId(),
			type: saved.getType(),
			senderId: saved.getSenderId(),
			createdAt: saved.getCreatedAt().toISOString(),
			payload: saved.getPayload(),
		}
		const expiresAt = Math.floor(this.now() / 1000) + KEPT_SECONDS
		const at = `${record.createdAt}#${record.id}`

		await this.table.put(`envelopes#${record.networkId}`, at, record, expiresAt)
		// Where the envelope is, for the one that asks for it by id.
		await this.table.put(`envelope#${record.id}`, "envelope", { networkId: record.networkId, at }, expiresAt)
	}

	async findById(id: string): Promise<Envelope | undefined> {
		const where = await this.table.get(`envelope#${id}`, "envelope")
		const item = where && (await this.table.get(`envelopes#${where.networkId}`, String(where.at)))
		return item ? envelope(item) : undefined
	}

	async findByNetworkId(networkId: string, options: { offset: number; limit: number }): Promise<Envelope[]> {
		const items = await this.table.query(`envelopes#${networkId}`, { limit: options.offset + options.limit })
		return items.slice(options.offset).map(envelope)
	}

	async findRecent(networkId: string, limit: number): Promise<Envelope[]> {
		if (limit <= 0) return []

		const latest = await this.table.query(`envelopes#${networkId}`, { limit, backwards: true })
		return latest.reverse().map(envelope)
	}
}
