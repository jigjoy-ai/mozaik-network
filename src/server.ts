import { join, send, leave, resolveNetworkModule } from "src/network-module"
import { WebSocketServer } from "ws"

type ConnectionContext = {
	networkId: string
	participantId: string
}

const server = new WebSocketServer({ port: 8080 })

server.on("connection", (socket) => {
	const { envelopeDelivery } = resolveNetworkModule()

	let context: ConnectionContext | undefined
	let pending = Promise.resolve()

	async function disconnect(): Promise<void> {
		if (!context) return

		const { networkId, participantId } = context
		context = undefined

		envelopeDelivery.detach(networkId, socket)
		await leave(participantId, networkId)
	}

	socket.on("message", (data) => {
		// Process messages in order, including asynchronous operations.
		pending = pending
			.then(async () => {
				const message = JSON.parse(data.toString())

				switch (message.type) {
					case "join": {
						const { networkId, manifest } = message

						envelopeDelivery.attach(networkId, socket)

						try {
							const participantId = await join(manifest.name, manifest.capabilities, [], networkId)

							context = { networkId, participantId }
						} catch (error) {
							envelopeDelivery.detach(networkId, socket)
							throw error
						}

						break
					}

					case "send": {
						if (!context) {
							throw new Error("Connection has no participant identity")
						}

						await send(context.networkId, context.participantId, message.envelope)

						break
					}

					case "leave":
						await disconnect()
						socket.close(1000, "Left network")
						break

					default:
						throw new Error("Unknown message type")
				}
			})
			.catch((error) => {
				console.error(error)
				socket.close(1008, "Could not process message")
			})
	})

	socket.once("close", () => {
		pending = pending.then(disconnect).catch(console.error)
	})

	socket.on("error", (error) => {
		console.error(error)
	})
})
