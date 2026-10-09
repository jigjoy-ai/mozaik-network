import { Envelope } from "@domain/envelope"
import { EnvelopeRepository } from "@domain/envelope-repositories"

export class InMemoryEnvelopeRepository implements EnvelopeRepository {
	save(envelope: Envelope): Promise<void> {
		throw new Error("Method not implemented.")
	}
	findById(id: string): Promise<Envelope | undefined> {
		throw new Error("Method not implemented.")
	}
	findByNetworkId(networkId: string, options: { offset: number; limit: number }): Promise<Envelope[]> {
		throw new Error("Method not implemented.")
	}
}
