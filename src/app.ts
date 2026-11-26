import {
	acceptInvite,
	accountFor,
	connect,
	createInvite,
	createNetwork,
	listNetworks,
	createPeer,
	disconnect,
	identify,
	resolveNetworkModule,
	revokeInvites,
	send,
} from "src/network-module"
import { RequestError } from "@application/errors"
import { readInvite } from "@application/invite-tokens"
import { NetworkRecord } from "@domain/network"
import { PeerRole } from "@domain/peer-role"
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http"
import { WebSocket, WebSocketServer } from "ws"

type ConnectionContext = {
	networkId: string
	peerId: string
	peerName: string
}

/** How often each socket is pinged; one that hasn't answered since the last ping is closed. Load balancers drop idle connections (AWS's after 60 seconds). */
const PING_INTERVAL_MS = 30_000

/** The largest HTTP body and WebSocket frame taken; everything lives in one task's memory. */
const MAX_BODY_BYTES = 64 * 1024
const MAX_FRAME_BYTES = 256 * 1024

/** A peer's name goes with every message it sends and is kept with it: on one line, and cut to this length (clients that send longer names still join). */
const MAX_PEER_NAME_LENGTH = 64
const CONTROL_CHARACTERS = /\p{Cc}/u

/** What an older connection is closed with when a newer one of the same peer takes its place: a client shouldn't come back on it. */
const REPLACED_CLOSE_CODE = 4001

/** Names the account a request is made for, when Mozaik Cloud makes it with its own secret. */
const ACTING_FOR_HEADER = "x-mozaik-account"

const INVITES_PATH = /^\/networks\/([^/]+)\/invites$/

const httpStatus: Record<RequestError["code"], number> = {
	unauthorized: 401,
	forbidden: 403,
	not_found: 404,
	payment_required: 402,
}

const peerRoles = new Set<PeerRole>(["user", "agent", "external"])

class BodyTooLarge extends Error {}

function withoutInvites({
	inviteHashes: _inviteHashes,
	...record
}: NetworkRecord): Omit<NetworkRecord, "inviteHashes"> {
	return record
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json" })
	res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let size = 0

	for await (const chunk of req) {
		const buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer)
		size += buffer.length
		if (size > MAX_BODY_BYTES) throw new BodyTooLarge()
		chunks.push(buffer)
	}

	const text = Buffer.concat(chunks).toString("utf8").trim()
	if (!text) return {}

	return JSON.parse(text)
}

function bearer(req: IncomingMessage): string | undefined {
	const header = req.headers.authorization ?? ""
	return header.startsWith("Bearer ") ? header.slice(7).trim() || undefined : undefined
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
	// For the load balancer's health checks.
	if (req.method === "GET" && req.url === "/healthz") {
		sendJson(res, 200, { ok: true })
		return
	}

	const invitesOf = req.url?.match(INVITES_PATH)?.[1]

	if (req.url !== "/networks" && req.url !== "/peers" && !invitesOf) {
		sendJson(res, 404, { error: "Not found" })
		return
	}

	const listing = req.method === "GET" && req.url === "/networks"

	// Networks can also be listed and invites revoked; everything else is only made.
	if (req.method !== "POST" && !(req.method === "DELETE" && invitesOf) && !listing) {
		sendJson(res, 405, { error: "Method not allowed" })
		return
	}

	const credential = bearer(req)
	// A peer can be made with an invite in place of an API key: on the account of the invite's network, for that network only.
	const invitedTo = req.url === "/peers" && readInvite(credential) ? await acceptInvite(credential) : undefined
	const actingFor = req.headers[ACTING_FOR_HEADER]
	const accountId = invitedTo
		? invitedTo.getOwnerId()
		: await accountFor(credential, typeof actingFor === "string" ? actingFor : undefined)
	if (!accountId) {
		sendJson(res, 401, { error: "A Mozaik Cloud API key is required (Authorization: Bearer <key>)" })
		return
	}

	if (listing) {
		const networks = await listNetworks(accountId)
		// The hashes of their invites stay here.
		sendJson(res, 200, { networks: networks.map((network) => withoutInvites(network.toRecord())) })
		return
	}

	if (invitesOf && req.method === "DELETE") {
		await revokeInvites(invitesOf, accountId)
		sendJson(res, 200, { networkId: invitesOf, revoked: true })
		return
	}

	if (invitesOf) {
		// The invite is shown only now: whoever holds it can make peers in this network.
		sendJson(res, 201, { networkId: invitesOf, invite: await createInvite(invitesOf, accountId) })
		return
	}

	let body: unknown
	try {
		body = await readJsonBody(req)
	} catch (error) {
		if (error instanceof BodyTooLarge) sendJson(res, 413, { error: "Body too large" })
		else sendJson(res, 400, { error: "Body is not JSON" })
		return
	}

	if (req.url === "/networks") {
		const { name } = body as { name?: unknown }
		if (typeof name !== "string" || !name.trim()) {
			sendJson(res, 400, { error: "name is required" })
			return
		}

		const network = await createNetwork(name.trim(), accountId)
		// The hashes of its invites stay here.
		sendJson(res, 201, withoutInvites(network.toRecord()))
		return
	}

	const { name, role, capabilities } = body as { name?: unknown; role?: unknown; capabilities?: unknown }

	if (typeof name !== "string" || !name.trim()) {
		sendJson(res, 400, { error: "name is required" })
		return
	}

	if (CONTROL_CHARACTERS.test(name)) {
		sendJson(res, 400, { error: "name must be on one line" })
		return
	}

	if (typeof role !== "string" || !peerRoles.has(role as PeerRole)) {
		sendJson(res, 400, { error: "role must be user, agent, or external" })
		return
	}

	const capabilityList = Array.isArray(capabilities)
		? capabilities.filter((item): item is string => typeof item === "string")
		: []

	const networkId = invitedTo?.getId()
	const network = invitedTo && { id: invitedTo.getId(), name: invitedTo.getName() }
	const { peer, token } = await createPeer([...name.trim()].slice(0, MAX_PEER_NAME_LENGTH).join("").trim(), role as PeerRole, capabilityList, accountId, networkId)
	// The token is shown only now: the peer joins networks with it. A guest is told which network its invite is for, and its name.
	sendJson(res, 201, { ...peer.getManifest(), token, networkId, network })
}

/** An HTTP server with the WebSocket server on it; not yet listening. */
export function createApp(): Server {
	const httpServer = createServer((req, res) => {
		handleHttpRequest(req, res).catch((error) => {
			if (error instanceof RequestError) {
				sendJson(res, httpStatus[error.code], { error: error.message, code: error.code })
				return
			}
			console.error(error)
			sendJson(res, 500, { error: "Internal server error" })
		})
	})

	const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_FRAME_BYTES })

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

	httpServer.on("close", () => {
		clearInterval(heartbeat)
		for (const socket of wss.clients) socket.terminate()
		wss.close()
	})

	wss.on("connection", (socket) => {
		const { envelopeDelivery } = resolveNetworkModule()

		alive.add(socket)
		socket.on("pong", () => alive.add(socket))

		let context: ConnectionContext | undefined
		let pending = Promise.resolve()

		/** Errors are answered on the socket, which stays open: a client out of credit can top up and go on. */
		function reportError(error: unknown): void {
			const code = error instanceof RequestError ? error.code : "invalid_request"
			const message = error instanceof Error ? error.message : "Could not process message"
			if (!(error instanceof RequestError)) console.error(error)
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "error", code, message }))
		}

		async function leave(): Promise<void> {
			if (!context) return

			const { networkId, peerId } = context
			context = undefined

			envelopeDelivery.detach(networkId, socket)
			// A newer connection of the same peer has taken this one's place: the peer hasn't left.
			if (envelopeDelivery.isAttached(networkId, peerId)) return

			await disconnect(networkId, peerId)
		}

		async function handle(data: string): Promise<void> {
			const message = JSON.parse(data) as Record<string, unknown>

			switch (message.type) {
				case "peer.join": {
					if (context) throw new RequestError("forbidden", "This connection has already joined a network")
					if (typeof message.networkId !== "string") throw new Error("networkId is required")

					// Who the peer is comes from its token, never from the message.
					const peer = await identify(message.token)
					const networkId = message.networkId

					const replaced = envelopeDelivery.attach(networkId, socket, peer.getId())

					try {
						await connect(networkId, peer)
						context = { networkId, peerId: peer.getId(), peerName: peer.getManifest().name }
					} catch (error) {
						envelopeDelivery.detach(networkId, socket)
						if (replaced && replaced.readyState === WebSocket.OPEN) {
							envelopeDelivery.attach(networkId, replaced, peer.getId())
						}
						throw error
					}

					replaced?.close(REPLACED_CLOSE_CODE, "Replaced by a newer connection")

					break
				}

				case "message.send": {
					if (!context) throw new RequestError("forbidden", "Join a network first (peer.join)")
					if (typeof message.payload !== "string") throw new Error("payload must be a string")
					if (message.to !== undefined && typeof message.to !== "string") {
						throw new Error("to must be a peer id")
					}

					// The network and sender are the ones this connection joined as, whatever the message says.
					await send(context.networkId, { id: context.peerId, name: context.peerName }, message.payload, message.to)

					break
				}

				case "peer.leave":
					await leave()
					socket.close(1000, "Left network")
					break

				// A client asks whether the connection still works: one that died in silence gets no answer.
				case "ping":
					socket.send(JSON.stringify({ type: "pong" }))
					break

				default:
					throw new Error("Unknown message type")
			}
		}

		socket.on("message", (data) => {
			pending = pending.then(() => handle(data.toString())).catch(reportError)
		})

		socket.once("close", () => {
			pending = pending.then(leave).catch(console.error)
		})

		socket.on("error", (error) => {
			console.error(error)
		})
	})

	return httpServer
}
