import {
	connect,
	createNetwork,
	createParticipant,
	disconnect,
	initNetworkModule,
	resolveNetworkModule,
	send,
} from "src/network-module"
import { ParticipantRole } from "@domain/participant-role"
import { createServer, IncomingMessage, ServerResponse } from "node:http"
import { WebSocketServer } from "ws"

type ConnectionContext = {
	networkId: string
	participantId: string
}

const PORT = 3000

const participantRoles = new Set<ParticipantRole>(["user", "agent", "external"])

initNetworkModule()

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json" })
	res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []

	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
	}

	const text = Buffer.concat(chunks).toString("utf8").trim()
	if (!text) return {}

	return JSON.parse(text)
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
	if (req.method !== "POST") {
		sendJson(res, 405, { error: "Method not allowed" })
		return
	}

	try {
		if (req.url === "/networks") {
			const body = (await readJsonBody(req)) as { name?: unknown }
			if (typeof body.name !== "string" || !body.name.trim()) {
				sendJson(res, 400, { error: "name is required" })
				return
			}

			const network = await createNetwork(body.name.trim())
			sendJson(res, 201, network.toRecord())
			return
		}

		if (req.url === "/participants") {
			const body = (await readJsonBody(req)) as {
				name?: unknown
				role?: unknown
				capabilities?: unknown
			}

			if (typeof body.name !== "string" || !body.name.trim()) {
				sendJson(res, 400, { error: "name is required" })
				return
			}

			if (typeof body.role !== "string" || !participantRoles.has(body.role as ParticipantRole)) {
				sendJson(res, 400, { error: "role must be user, agent, or external" })
				return
			}

			const capabilities = Array.isArray(body.capabilities)
				? body.capabilities.filter((item): item is string => typeof item === "string")
				: []

			const participant = await createParticipant(body.name.trim(), body.role as ParticipantRole, capabilities)
			sendJson(res, 201, participant.getManifest())
			return
		}

		sendJson(res, 404, { error: "Not found" })
	} catch (error) {
		console.error(error)
		sendJson(res, 500, { error: "Internal server error" })
	}
}

const httpServer = createServer((req, res) => {
	handleHttpRequest(req, res).catch((error) => {
		console.error(error)
		sendJson(res, 500, { error: "Internal server error" })
	})
})

const wss = new WebSocketServer({ server: httpServer })

wss.on("connection", (socket) => {
	const { envelopeDelivery } = resolveNetworkModule()

	let context: ConnectionContext | undefined
	let pending = Promise.resolve()

	async function leave(): Promise<void> {
		if (!context) return

		const { networkId, participantId } = context
		context = undefined

		envelopeDelivery.detach(networkId, socket)
		await disconnect(networkId, participantId)
	}

	socket.on("message", (data) => {
		pending = pending
			.then(async () => {
				const message = JSON.parse(data.toString())

				switch (message.type) {
					case "participant.join": {
						const { networkId, senderId } = message

						envelopeDelivery.attach(networkId, socket, senderId)

						try {
							await connect(networkId, senderId)

							context = { networkId, participantId: senderId }
						} catch (error) {
							envelopeDelivery.detach(networkId, socket)
							throw error
						}

						break
					}

					case "message.send": {
						if (!context) {
							throw new Error("Connection has no participant identity")
						}

						const { networkId, senderId, payload } = message

						await send(networkId, senderId, payload as string)

						break
					}

					case "participant.leave":
						await leave()
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
		pending = pending.then(leave).catch(console.error)
	})

	socket.on("error", (error) => {
		console.error(error)
	})
})

httpServer.listen(PORT, () => {
	console.log(`HTTP and WebSocket listening on port ${PORT}`)
})
