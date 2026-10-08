import { Envelope } from "./envelope"

export interface EnvelopeDelivery {
	broadcast(networkId: string, envelope: Envelope): Promise<void>
}
