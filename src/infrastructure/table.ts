export type Item = Record<string, unknown>

/**
 * What the stored repositories need of a database: items kept under a partition and a sort
 * key. An item given `expiresAt` (seconds since the epoch) may be dropped after that.
 */
export interface Table {
	get(partition: string, sort: string): Promise<Item | undefined>
	put(partition: string, sort: string, item: Item, expiresAt?: number): Promise<void>
	delete(partition: string, sort: string): Promise<void>
	/** A partition's items in the order of their sort keys, or from the last one back; at most `limit` of them. */
	query(partition: string, options?: { limit?: number; backwards?: boolean }): Promise<Item[]>
}

/** A table in this process's memory: for tests, and for running the stored repositories without a database. */
export class MemoryTable implements Table {
	private readonly partitions = new Map<string, Map<string, Item>>()

	async get(partition: string, sort: string): Promise<Item | undefined> {
		const item = this.partitions.get(partition)?.get(sort)
		return item && structuredClone(item)
	}

	async put(partition: string, sort: string, item: Item): Promise<void> {
		const items = this.partitions.get(partition) ?? new Map<string, Item>()
		items.set(sort, structuredClone(item))
		this.partitions.set(partition, items)
	}

	async delete(partition: string, sort: string): Promise<void> {
		this.partitions.get(partition)?.delete(sort)
	}

	async query(partition: string, options: { limit?: number; backwards?: boolean } = {}): Promise<Item[]> {
		const sorted = [...(this.partitions.get(partition) ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		const ordered = options.backwards ? sorted.reverse() : sorted
		return ordered.slice(0, options.limit).map(([, item]) => structuredClone(item))
	}
}
