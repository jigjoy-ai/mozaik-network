import { Envelope } from "./envelope"

export interface EnvelopeRepository {
	save(envelope: Envelope): Promise<void>
	findById(id: string): Promise<Envelope | undefined>
	findByNetworkId(networkId: string, options: { offset: number; limit: number }): Promise<Envelope[]>
	/** The network's latest envelopes, at most `limit` of them, oldest first. */
	findRecent(networkId: string, limit: number): Promise<Envelope[]>
}
