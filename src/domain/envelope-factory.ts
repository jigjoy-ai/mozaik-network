import { MessageSent, PeerJoined, PeerLeft, PeerWelcomed } from "./built-in-envelopers"
import { Envelope } from "./envelope"
import { PeerManifest } from "./peer-manifest"

export class EnvelopeFactory {
	static create<TType extends string, TPayload>(
		networkId: string,
		senderId: string,
		type: TType,
		payload: TPayload,
	): Envelope<TType, TPayload> {
		const id = crypto.randomUUID()
		const createdAt = new Date()
		return new Envelope(id, networkId, type, senderId, createdAt, payload)
	}

	static peerJoined(networkId: string, manifest: PeerManifest): PeerJoined {
		return this.create(networkId, manifest.id, "peer.joined", manifest)
	}

	static peerLeft(networkId: string, peerId: string): PeerLeft {
		return this.create(networkId, peerId, "peer.left", { peerId })
	}

	static peerWelcomed(networkId: string, peerId: string, peers: PeerManifest[], messages: Envelope[]): PeerWelcomed {
		return this.create(networkId, peerId, "peer.welcomed", { peers, messages })
	}

	static messageSent(
		networkId: string,
		sender: { id: string; name: string },
		message: string,
		recipientId?: string,
	): MessageSent {
		const payload = { message, senderName: sender.name, ...(recipientId === undefined ? {} : { to: recipientId }) }
		return this.create(networkId, sender.id, "message.sent", payload)
	}
}
