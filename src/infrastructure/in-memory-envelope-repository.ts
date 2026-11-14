import { Envelope } from "@domain/envelope"
import { EnvelopeRepository } from "@domain/envelope-repositories"

/** How many envelopes are kept for each network: they live in this task's memory, so the oldest make room. */
const KEPT_PER_NETWORK = 100

export class InMemoryEnvelopeRepository implements EnvelopeRepository {
	private readonly envelopes = new Map<string, Envelope[]>()

	async save(envelope: Envelope): Promise<void> {
		const kept = this.envelopes.get(envelope.getNetworkId()) ?? []

		kept.push(envelope)
		if (kept.length > KEPT_PER_NETWORK) kept.shift()

		this.envelopes.set(envelope.getNetworkId(), kept)
	}

	async findById(id: string): Promise<Envelope | undefined> {
		for (const kept of this.envelopes.values()) {
			const envelope = kept.find((item) => item.getId() === id)
			if (envelope) return envelope
		}

		return undefined
	}

	async findByNetworkId(networkId: string, options: { offset: number; limit: number }): Promise<Envelope[]> {
		const kept = this.envelopes.get(networkId) ?? []
		return kept.slice(options.offset, options.offset + options.limit)
	}

	async findRecent(networkId: string, limit: number): Promise<Envelope[]> {
		const kept = this.envelopes.get(networkId) ?? []
		return limit > 0 ? kept.slice(-limit) : []
	}
}
