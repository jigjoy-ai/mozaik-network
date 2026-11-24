import { afterAll, beforeAll, beforeEach, describe, expect, test } from "@rstest/core"
import { AddressInfo } from "node:net"
import { Server } from "node:http"
import { WebSocket } from "ws"
import { createApp } from "src/app"
import { initNetworkModule } from "src/network-module"
import { Accounts } from "@domain/accounts"
import { Allowance, Metering } from "@domain/metering"
import { Envelope } from "@domain/envelope"
import { InMemoryEnvelopeRepository } from "@infrastructure/in-memory-envelope-repository"

const keys: Record<string, string> = { pk_a: "account-a", pk_b: "account-b" }

class FakeAccounts implements Accounts {
	async accountFor(apiKey: string | undefined, actingFor?: string) {
		if (actingFor !== undefined) return apiKey === "svc-secret" ? actingFor : undefined
		return apiKey ? keys[apiKey] : undefined
	}
}

class FakeMetering implements Metering {
	readonly sent = new Map<string, number>()
	limit = Infinity

	async allowance(accountId: string): Promise<Allowance> {
		return (this.sent.get(accountId) ?? 0) < this.limit
			? { allowed: true }
			: { allowed: false, reason: "Your free messages are used up: add balance in Mozaik Cloud" }
	}

	async record(accountId: string, messages: number) {
		this.sent.set(accountId, (this.sent.get(accountId) ?? 0) + messages)
	}
}

class FaultInjectingEnvelopeRepository extends InMemoryEnvelopeRepository {
	shouldThrowOnRecent = false

	override async findRecent(networkId: string, limit: number): Promise<Envelope[]> {
		if (this.shouldThrowOnRecent) {
			throw new Error("Simulated storage failure on findRecent")
		}
		return super.findRecent(networkId, limit)
	}
}

const metering = new FakeMetering()
const envelopes = new FaultInjectingEnvelopeRepository()
let server: Server
let base: string
const sockets: WebSocket[] = []

beforeAll(async () => {
	initNetworkModule({ accounts: new FakeAccounts(), metering, envelopeRepository: envelopes })
	server = createApp()
	await new Promise<void>((resolve) => server.listen(0, resolve))
	base = `127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
	for (const socket of sockets) socket.terminate()
	await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
	metering.sent.clear()
	metering.limit = Infinity
	envelopes.shouldThrowOnRecent = false
})

async function request(method: string, path: string, body: unknown, key?: string) {
	const res = await fetch(`http://${base}${path}`, {
		method,
		headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
		body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
	})
	return { status: res.status, body: (await res.json()) as Record<string, any> }
}

const post = (path: string, body: unknown, key?: string) => request("POST", path, body, key)

async function network(key: string): Promise<string> {
	return (await post("/networks", { name: "team" }, key)).body.id
}

async function peer(key: string, name: string): Promise<{ id: string; token: string }> {
	return (await post("/peers", { name, role: "agent" }, key)).body as { id: string; token: string }
}

async function invite(key: string, networkId: string): Promise<string> {
	return (await post(`/networks/${networkId}/invites`, {}, key)).body.invite
}

type Client = { socket: WebSocket; next(type: string): Promise<Record<string, any>>; received: Record<string, any>[] }

async function client(): Promise<Client> {
	const socket = new WebSocket(`ws://${base}`)
	sockets.push(socket)
	const received: Record<string, any>[] = []
	const waiting: { type: string; resolve: (message: Record<string, any>) => void }[] = []

	socket.on("message", (data) => {
		const message = JSON.parse(data.toString())
		const at = waiting.findIndex((w) => w.type === message.type)
		if (at >= 0) waiting.splice(at, 1)[0].resolve(message)
		else received.push(message)
	})
	await new Promise((resolve) => socket.once("open", resolve))

	return {
		socket,
		received,
		next(type) {
			const at = received.findIndex((m) => m.type === type)
			if (at >= 0) return Promise.resolve(received.splice(at, 1)[0])
			return new Promise((resolve, reject) => {
				waiting.push({ type, resolve })
				setTimeout(() => reject(new Error(`no ${type} within 2s`)), 2000)
			})
		},
	}
}

async function joined(networkId: string, token: string): Promise<Client> {
	const c = await client()
	c.socket.send(JSON.stringify({ type: "peer.join", networkId, token }))
	await c.next("peer.joined")
	return c
}

const messagesTo = (c: Client) => c.received.filter((m) => m.type === "message.sent")

const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

describe("HTTP", () => {
	test("creating networks and peers needs an API key", async () => {
		expect((await post("/networks", { name: "team" })).status).toBe(401)
		expect((await post("/peers", { name: "x", role: "agent" }, "pk_unknown")).status).toBe(401)
	})

	test("a peer's token is returned once, with its manifest", async () => {
		const { status, body } = await post("/peers", { name: "planner", role: "agent" }, "pk_a")
		expect(status).toBe(201)
		expect(body.token).toMatch(new RegExp(`^pt_${body.id}\\.`))
		expect(body.ownerId).toBeUndefined()
	})

	test("a peer's name is on one line and cut to 64 characters: it goes with every message the peer sends", async () => {
		expect((await post("/peers", { name: "two\nlines", role: "agent" }, "pk_a")).status).toBe(400)
		const long = await post("/peers", { name: `  ${"x".repeat(70)}  `, role: "agent" }, "pk_a")
		expect(long.status).toBe(201)
		expect(long.body.name).toBe("x".repeat(64))
	})

	test("bodies are limited in size and must be JSON", async () => {
		expect((await post("/networks", { name: "x".repeat(70_000) }, "pk_a")).status).toBe(413)
		expect((await post("/networks", "{not json", "pk_a")).status).toBe(400)
	})

	test("an account lists the networks it made, without their invites", async () => {
		const mine = (await post("/networks", { name: "listed" }, "pk_a")).body.id
		await post(`/networks/${mine}/invites`, {}, "pk_a")
		const theirs = (await post("/networks", { name: "theirs" }, "pk_b")).body.id

		const { status, body } = await request("GET", "/networks", undefined, "pk_a")
		expect(status).toBe(200)
		const listed = body.networks.find((network: { id: string }) => network.id === mine)
		expect(listed).toEqual({ id: mine, name: "listed", ownerId: "account-a", peerIds: [] })
		expect(body.networks.some((network: { id: string }) => network.id === theirs)).toBe(false)
		expect((await request("GET", "/networks", undefined)).status).toBe(401)
	})

	test("a request made for an account names it in a header, and counts as that account's", async () => {
		const acting = async (method: string, path: string, body: unknown, secret: string, account: string) => {
			const res = await fetch(`http://${base}${path}`, {
				method,
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${secret}`,
					"x-mozaik-account": account,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			})
			return { status: res.status, body: (await res.json()) as Record<string, any> }
		}

		const made = await acting("POST", "/networks", { name: "from the cloud" }, "svc-secret", "account-a")
		expect(made.status).toBe(201)
		expect(made.body.ownerId).toBe("account-a")
		// The account sees it with its own key too.
		const mine = (await request("GET", "/networks", undefined, "pk_a")).body.networks
		expect(mine.some((network: { id: string }) => network.id === made.body.id)).toBe(true)
		// A key cannot name another account.
		expect((await acting("POST", "/networks", { name: "x" }, "pk_a", "account-b")).status).toBe(401)
	})

	test("an invite is made by the network's owner only, and is shown once", async () => {
		const networkId = await network("pk_a")

		const { status, body } = await post(`/networks/${networkId}/invites`, {}, "pk_a")
		expect(status).toBe(201)
		expect(body.invite).toMatch(new RegExp(`^nt_${networkId}\\.`))

		expect((await post(`/networks/${networkId}/invites`, {})).status).toBe(401)
		expect((await post(`/networks/${networkId}/invites`, {}, "pk_b")).status).toBe(404)
		expect((await post("/networks", { name: "team" }, "pk_a")).body.inviteHashes).toBeUndefined()
	})

	test("an invite makes peers for its network, in place of an API key, and nothing else", async () => {
		const networkId = await network("pk_a")
		const guest = await invite("pk_a", networkId)

		const { status, body } = await post("/peers", { name: "guest", role: "agent" }, guest)
		expect(status).toBe(201)
		expect(body.networkId).toBe(networkId)
		expect(body.token).toMatch(new RegExp(`^pt_${body.id}\\.`))

		expect((await post("/peers", { name: "guest", role: "agent" }, `nt_${networkId}.wrong`)).status).toBe(401)
		expect((await post("/networks", { name: "theirs" }, guest)).status).toBe(401)
		expect((await post(`/networks/${networkId}/invites`, {}, guest)).status).toBe(401)
	})

	test("revoked invites make no more peers", async () => {
		const networkId = await network("pk_a")
		const guest = await invite("pk_a", networkId)

		expect((await request("DELETE", `/networks/${networkId}/invites`, {}, "pk_b")).status).toBe(404)
		expect((await request("DELETE", `/networks/${networkId}/invites`, {}, "pk_a")).status).toBe(200)
		expect((await post("/peers", { name: "guest", role: "agent" }, guest)).status).toBe(401)
	})
})

describe("WebSocket", () => {
	test("a message reaches the other peers, from the peer the connection joined as, and is counted once", async () => {
		const networkId = await network("pk_a")
		const [one, two, three] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two"), peer("pk_a", "three")])
		const a = await joined(networkId, one.token)
		const b = await joined(networkId, two.token)
		const c = await joined(networkId, three.token)

		// It says it is peer two, in another network: neither is believed.
		a.socket.send(JSON.stringify({ type: "message.send", networkId: "elsewhere", senderId: two.id, payload: "hi" }))

		for (const receiver of [b, c]) {
			const message = await receiver.next("message.sent")
			expect(message.senderId).toBe(one.id)
			expect(message.payload).toEqual({ message: "hi", senderName: "one" })
		}
		expect(metering.sent.get("account-a")).toBe(1)
	})

	test("an unknown token is refused, and the connection stays open", async () => {
		const networkId = await network("pk_a")
		const { id } = await peer("pk_a", "one")
		const c = await client()

		c.socket.send(JSON.stringify({ type: "peer.join", networkId, token: `pt_${id}.wrong` }))
		expect(await c.next("error")).toMatchObject({ code: "unauthorized" })

		c.socket.send(JSON.stringify({ type: "message.send", payload: "hi" }))
		expect(await c.next("error")).toMatchObject({ code: "forbidden" })
		expect(c.socket.readyState).toBe(WebSocket.OPEN)
	})

	test("another account's network can't be joined, and looks like none", async () => {
		const networkId = await network("pk_a")
		const stranger = await peer("pk_b", "stranger")
		const c = await client()

		c.socket.send(JSON.stringify({ type: "peer.join", networkId, token: stranger.token }))
		expect(await c.next("error")).toMatchObject({ code: "not_found", message: "Network not found" })
	})

	test("out of credit, a message is refused and not delivered; the connection stays open", async () => {
		const networkId = await network("pk_a")
		const [one, two] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two")])
		const a = await joined(networkId, one.token)
		const b = await joined(networkId, two.token)
		metering.limit = 0

		a.socket.send(JSON.stringify({ type: "message.send", payload: "hi" }))
		expect(await a.next("error")).toMatchObject({ code: "payment_required" })
		await settle()
		expect(b.received.filter((m) => m.type === "message.sent")).toEqual([])
		expect(metering.sent.get("account-a")).toBeUndefined()

		// Topped up, the same connection goes on.
		metering.limit = Infinity
		a.socket.send(JSON.stringify({ type: "message.send", payload: "again" }))
		expect((await b.next("message.sent")).payload).toEqual({ message: "again", senderName: "one" })
	})

	test("a guest joins the network it was invited to and no other, and its messages are counted against the owner", async () => {
		const [networkId, another] = await Promise.all([network("pk_a"), network("pk_a")])
		const host = await joined(networkId, (await peer("pk_a", "host")).token)
		const guest = await post("/peers", { name: "guest", role: "agent" }, await invite("pk_a", networkId))

		const elsewhere = await client()
		elsewhere.socket.send(JSON.stringify({ type: "peer.join", networkId: another, token: guest.body.token }))
		expect(await elsewhere.next("error")).toMatchObject({ code: "not_found", message: "Network not found" })

		const g = await joined(networkId, guest.body.token)
		g.socket.send(JSON.stringify({ type: "message.send", payload: "hi" }))

		expect((await host.next("message.sent")).senderId).toBe(guest.body.id)
		expect(metering.sent.get("account-a")).toBe(1)
	})

	test("a peer that joins is told who is here and what was said lately", async () => {
		const networkId = await network("pk_a")
		const [one, two] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two")])
		const a = await joined(networkId, one.token)
		a.socket.send(JSON.stringify({ type: "message.send", payload: "before you came" }))
		await settle()

		const b = await joined(networkId, two.token)
		const welcome = await b.next("peer.welcomed")

		expect(welcome.payload.peers.map((p: { name: string }) => p.name)).toEqual(["one", "two"])
		expect(welcome.payload.messages).toMatchObject([{ senderId: one.id, payload: { message: "before you came" } }])
	})

	test("a peer that joins after the sender has left still sees who said what", async () => {
		const networkId = await network("pk_a")
		const [one, two] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two")])
		const a = await joined(networkId, one.token)
		a.socket.send(JSON.stringify({ type: "message.send", payload: "I was here" }))
		await settle()
		a.socket.send(JSON.stringify({ type: "peer.leave" }))
		await new Promise((resolve) => a.socket.once("close", resolve))

		const b = await joined(networkId, two.token)
		const welcome = await b.next("peer.welcomed")

		expect(welcome.payload.peers.map((p: { name: string }) => p.name)).toEqual(["two"])
		expect(welcome.payload.messages).toMatchObject([
			{ senderId: one.id, payload: { message: "I was here", senderName: "one" } },
		])
	})

	test("a message to one peer reaches only that peer, and isn't kept for those who join later", async () => {
		const networkId = await network("pk_a")
		const [one, two, three, four] = await Promise.all(["one", "two", "three", "four"].map((n) => peer("pk_a", n)))
		const a = await joined(networkId, one.token)
		const b = await joined(networkId, two.token)
		const c = await joined(networkId, three.token)

		a.socket.send(JSON.stringify({ type: "message.send", payload: "just you", to: two.id }))
		expect((await b.next("message.sent")).payload).toEqual({ message: "just you", senderName: "one", to: two.id })

		a.socket.send(JSON.stringify({ type: "message.send", payload: "anyone?", to: four.id }))
		expect(await a.next("error")).toMatchObject({ code: "not_found", message: "Peer not in this network" })

		const d = await joined(networkId, four.token)
		expect((await d.next("peer.welcomed")).payload.messages).toEqual([])
		expect(messagesTo(c)).toEqual([])
		expect(metering.sent.get("account-a")).toBe(1)
	})

	test("a peer's newer connection takes the place of its older one, and the peer hasn't left", async () => {
		const networkId = await network("pk_a")
		const [one, two] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two")])
		const older = await joined(networkId, one.token)
		const b = await joined(networkId, two.token)
		await older.next("peer.joined")
		const closed = new Promise<number>((resolve) => older.socket.once("close", resolve))

		const newer = await client()
		newer.socket.send(JSON.stringify({ type: "peer.join", networkId, token: one.token }))
		await newer.next("peer.welcomed")
		expect(await closed).toBe(4001)

		b.socket.send(JSON.stringify({ type: "message.send", payload: "still there?" }))
		expect((await newer.next("message.sent")).payload).toEqual({ message: "still there?", senderName: "two" })
		await settle()
		expect(messagesTo(older)).toEqual([])
		expect(b.received.filter((m) => m.type === "peer.left" || m.type === "peer.joined")).toEqual([])
	})

	test("when connect fails on a reconnect, the older socket stays in the delivery map and still gets messages", async () => {
		const networkId = await network("pk_a")
		const [one, two] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two")])
		const older = await joined(networkId, one.token)
		const b = await joined(networkId, two.token)

		envelopes.shouldThrowOnRecent = true
		const newer = await client()
		try {
			newer.socket.send(JSON.stringify({ type: "peer.join", networkId, token: one.token }))
			expect(await newer.next("error")).toMatchObject({
				code: "invalid_request",
				message: "Simulated storage failure on findRecent",
			})
		} finally {
			envelopes.shouldThrowOnRecent = false
		}

		expect(older.socket.readyState).toBe(WebSocket.OPEN)

		b.socket.send(JSON.stringify({ type: "message.send", payload: "still there after reconnect failure?" }))
		expect((await older.next("message.sent")).payload).toEqual({
			message: "still there after reconnect failure?",
			senderName: "two",
		})
	})

	test("closing a restored socket does not delete the network connections entry for remaining peers", async () => {
		const networkId = await network("pk_a")
		const [one, two, three] = await Promise.all([peer("pk_a", "one"), peer("pk_a", "two"), peer("pk_a", "three")])

		// 1. Start with a network containing only one connected peer
		const original = await joined(networkId, one.token)

		// 2. Trigger a failed reconnect and restore its original socket
		envelopes.shouldThrowOnRecent = true
		const reconnecting = await client()
		try {
			reconnecting.socket.send(JSON.stringify({ type: "peer.join", networkId, token: one.token }))
			expect(await reconnecting.next("error")).toMatchObject({ code: "invalid_request" })
		} finally {
			envelopes.shouldThrowOnRecent = false
		}
		expect(original.socket.readyState).toBe(WebSocket.OPEN)

		// 3. Connect additional peers after restoration
		const peerTwo = await joined(networkId, two.token)
		const peerThree = await joined(networkId, three.token)

		// 4. Close the restored original socket
		const closed = new Promise((resolve) => original.socket.once("close", resolve))
		original.socket.close(1000, "Normal closure")
		await closed
		await settle()

		// 5. Verify the remaining peers can still exchange messages successfully
		peerTwo.socket.send(JSON.stringify({ type: "message.send", payload: "can you hear me, three?" }))
		expect((await peerThree.next("message.sent")).payload).toEqual({
			message: "can you hear me, three?",
			senderName: "two",
		})
	})

	test("malformed frames are answered, not fatal", async () => {
		const c = await client()
		c.socket.send("{not json")
		expect(await c.next("error")).toMatchObject({ code: "invalid_request" })
		c.socket.send(JSON.stringify({ type: "nope" }))
		expect(await c.next("error")).toMatchObject({ code: "invalid_request" })
		expect(c.socket.readyState).toBe(WebSocket.OPEN)
	})
})
