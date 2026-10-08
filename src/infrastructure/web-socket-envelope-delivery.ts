import { WebSocket } from "ws"
import { Envelope } from "@domain/envelope"
import { EnvelopeDelivery } from "@domain/envelope-delivery"

export class WebSocketEnvelopeDelivery implements EnvelopeDelivery {
	private readonly connections = new Map<string, Set<WebSocket>>()

	attach(networkId: string, socket: WebSocket): void {
		let sockets = this.connections.get(networkId)

		if (!sockets) {
			sockets = new Set()
			this.connections.set(networkId, sockets)
		}

		if (sockets.has(socket)) return

		sockets.add(socket)

		socket.once("close", () => {
			sockets.delete(socket)

			if (sockets.size === 0) {
				this.connections.delete(networkId)
			}
		})
	}

	detach(networkId: string, socket: WebSocket): void {
		const sockets = this.connections.get(networkId)
		if (!sockets) return

		sockets.delete(socket)

		if (sockets.size === 0) {
			this.connections.delete(networkId)
		}
	}

	async broadcast(networkId: string, envelope: Envelope): Promise<void> {
		const sockets = this.connections.get(networkId)
		if (!sockets) return

		const message = JSON.stringify(envelope)

		await Promise.all([...sockets].map((socket) => this.send(socket, message)))
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
