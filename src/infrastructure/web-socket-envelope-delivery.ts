import { WebSocket } from "ws"
import { Envelope } from "@domain/envelope"
import { EnvelopeDelivery } from "@domain/envelope-delivery"

export class WebSocketEnvelopeDelivery implements EnvelopeDelivery {
	private readonly connections = new Map<string, Set<WebSocket>>()
	private readonly peerBySocket = new WeakMap<WebSocket, string>()

	/**
	 * A peer has one connection in a network: a newer one takes the place of the older one,
	 * which is returned (a client that came back before its old socket was seen to be gone).
	 */
	attach(networkId: string, socket: WebSocket, peerId: string): WebSocket | undefined {
		let sockets = this.connections.get(networkId)

		if (!sockets) {
			sockets = new Set()
			this.connections.set(networkId, sockets)
		}

		if (sockets.has(socket)) return undefined

		const replaced = this.socketOf(networkId, peerId)

		sockets.add(socket)
		this.peerBySocket.set(socket, peerId)

		if (replaced) this.detach(networkId, replaced)

		socket.once("close", () => {
			this.peerBySocket.delete(socket)
			sockets.delete(socket)

			if (sockets.size === 0 && this.connections.get(networkId) === sockets) {
				this.connections.delete(networkId)
			}
		})

		return replaced
	}

	detach(networkId: string, socket: WebSocket): void {
		const sockets = this.connections.get(networkId)
		if (!sockets) return

		sockets.delete(socket)
		this.peerBySocket.delete(socket)

		if (sockets.size === 0) {
			this.connections.delete(networkId)
		}
	}

	/** Whether the peer has a connection in the network. */
	isAttached(networkId: string, peerId: string): boolean {
		return this.socketOf(networkId, peerId) !== undefined
	}

	async deliver(envelope: Envelope, recipientIds: readonly string[]): Promise<void> {
		const networkId = envelope.getNetworkId()
		const sockets = this.connections.get(networkId)
		if (!sockets || recipientIds.length === 0) return

		const recipients = new Set(recipientIds)
		const message = JSON.stringify(envelope)

		await Promise.all(
			[...sockets]
				.filter((socket) => {
					const peerId = this.peerBySocket.get(socket)
					return peerId !== undefined && recipients.has(peerId)
				})
				// A socket that broke misses the envelope, like one that is closed: the others still get it.
				.map((socket) => this.send(socket, message).catch(() => {})),
		)
	}

	private socketOf(networkId: string, peerId: string): WebSocket | undefined {
		const sockets = this.connections.get(networkId) ?? []
		return [...sockets].find((socket) => this.peerBySocket.get(socket) === peerId)
	}

	private send(socket: WebSocket, message: string): Promise<void> {
		if (socket.readyState !== WebSocket.OPEN) {
			return Promise.resolve()
		}

		return new Promise<void>((resolve, reject) => {
			socket.send(message, (error) => {
				if (error) reject(error)
				else resolve()
			})
		})
	}
}
