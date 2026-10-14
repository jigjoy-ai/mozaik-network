import {
	connect,
	createNetwork,
	createPeer,
	disconnect,
	initNetworkModule,
	resolveNetworkModule,
	send,
} from "src/network-module"
import { PeerRole } from "@domain/peer-role"
import { createServer, IncomingMessage, ServerResponse } from "node:http"
import { WebSocket, WebSocketServer } from "ws"

type ConnectionContext = {
	networkId: string
	peerId: string
}

const PORT = Number(process.env.PORT ?? 3000)

/** How often each socket is pinged; one that hasn't answered since the last ping is closed. Load balancers drop idle connections (AWS's after 60 seconds). */
const PING_INTERVAL_MS = 30_000

const peerRoles = new Set<PeerRole>(["user", "agent", "external"])

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
	// For the load balancer's health checks.
	if (req.method === "GET" && req.url === "/healthz") {
		sendJson(res, 200, { ok: true })
		return
	}

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

		if (req.url === "/peers") {
			const body = (await readJsonBody(req)) as {
				name?: unknown
				role?: unknown
				capabilities?: unknown
			}

			if (typeof body.name !== "string" || !body.name.trim()) {
				sendJson(res, 400, { error: "name is required" })
				return
			}

			if (typeof body.role !== "string" || !peerRoles.has(body.role as PeerRole)) {
				sendJson(res, 400, { error: "role must be user, agent, or external" })
				return
			}

			const capabilities = Array.isArray(body.capabilities)
				? body.capabilities.filter((item): item is string => typeof item === "string")
				: []

			const peer = await createPeer(body.name.trim(), body.role as PeerRole, capabilities)
			sendJson(res, 201, peer.getManifest())
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

const alive = new WeakSet<WebSocket>()

const heartbeat = setInterval(() => {
	for (const socket of wss.clients) {
		if (!alive.has(socket)) {
			socket.terminate()
			continue
		}

		alive.delete(socket)
		socket.ping()
	}
}, PING_INTERVAL_MS)

wss.on("close", () => clearInterval(heartbeat))

wss.on("connection", (socket) => {
	const { envelopeDelivery } = resolveNetworkModule()

	alive.add(socket)
	socket.on("pong", () => alive.add(socket))

	let context: ConnectionContext | undefined
	let pending = Promise.resolve()

	async function leave(): Promise<void> {
		if (!context) return

		const { networkId, peerId } = context
		context = undefined

		envelopeDelivery.detach(networkId, socket)
		await disconnect(networkId, peerId)
	}

	socket.on("message", (data) => {
		pending = pending
			.then(async () => {
				const message = JSON.parse(data.toString())

				switch (message.type) {
					case "peer.join": {
						const { networkId, senderId } = message

						envelopeDelivery.attach(networkId, socket, senderId)

						try {
							await connect(networkId, senderId)

							context = { networkId, peerId: senderId }
						} catch (error) {
							envelopeDelivery.detach(networkId, socket)
							throw error
						}

						break
					}

					case "message.send": {
						if (!context) {
							throw new Error("Connection has no peer identity")
						}

						const { networkId, senderId, payload } = message

						await send(networkId, senderId, payload as string)

						break
					}

					case "peer.leave":
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
