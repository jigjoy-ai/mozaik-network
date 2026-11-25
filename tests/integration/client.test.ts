import { afterAll, beforeAll, describe, expect, test } from "@rstest/core"
import { AddressInfo } from "node:net"
import { Server } from "node:http"
import { Duplex } from "node:stream"
import { createApp } from "src/app"
import { initNetworkModule } from "src/network-module"
import { Accounts } from "@domain/accounts"
import { commandRegistry, ConditionContract, conditionRegistry, inputResolverRegistry } from "@jigjoy/mozaik-rule-engine"
import { join, leave, sendMessage } from "@client/index"
import { NetworkClient } from "@client/network-client"
import { Envelope } from "@client/envelope"

const keys: Record<string, string> = { pk_a: "account-a", pk_b: "account-b" }

class FakeAccounts implements Accounts {
	async accountFor(apiKey: string | undefined) {
		return apiKey ? keys[apiKey] : undefined
	}
}

class TypeIs extends ConditionContract<Envelope<any>> {
	constructor(private readonly type: string) {
		super()
	}

	isSatisfiedBy(envelope: Envelope<any>) {
		return envelope.type === this.type
	}
}

conditionRegistry.register("message.received", new TypeIs("message.sent"))
conditionRegistry.register("request.refused", new TypeIs("error"))
inputResolverRegistry.register("envelope", { resolve: async (envelope: Envelope<any>) => envelope })

let server: Server
let origin: string
let owner: NetworkClient
const connections: Duplex[] = []

beforeAll(async () => {
	initNetworkModule({ accounts: new FakeAccounts() })
	server = createApp()
	server.on("upgrade", (_req, socket) => connections.push(socket))
	await new Promise<void>((resolve) => server.listen(0, resolve))
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
	owner = new NetworkClient({ origin, apiKey: "pk_a" })
})

afterAll(async () => {
	for (const connection of connections) connection.destroy()
	await new Promise((resolve) => server.close(resolve))
})

/** A peer whose rules keep what it hears and what the network refuses it. */
async function listener(client: NetworkClient, name: string, invite?: string) {
	const heard: Envelope<any>[] = []
	const refused: Envelope<any>[] = []
	commandRegistry.register(`hear.${name}`, { invoke: (envelope: Envelope<any>) => heard.push(envelope) })
	commandRegistry.register(`refused.${name}`, { invoke: (envelope: Envelope<any>) => refused.push(envelope) })

	const peer = await client.createPeer({
		name,
		role: "agent",
		capabilities: ["message"],
		invite,
		policy: {
			rules: [
				{ condition: "message.received", inputResolver: "envelope", command: `hear.${name}` },
				{ condition: "request.refused", inputResolver: "envelope", command: `refused.${name}` },
			],
		},
	})

	return { peer, heard, refused }
}

async function until(condition: () => boolean): Promise<void> {
	for (let waited = 0; !condition(); waited += 20) {
		if (waited > 3000) throw new Error("waited 3s for nothing")
		await new Promise((resolve) => setTimeout(resolve, 20))
	}
}

describe("client", () => {
	test("a guest made with an invite joins, and each peer hears the other through its rules", async () => {
		const network = await owner.createNetwork({ name: "team" })
		const guests = new NetworkClient({ origin })
		const host = await listener(owner, "host")
		const guest = await listener(guests, "guest", await owner.createInvite(network.id))
		expect(guest.peer.invitedTo).toBe(network.id)

		await join(host.peer, network.id, owner)
		await join(guest.peer, network.id, guests)

		await sendMessage(host.peer, network.id, "hello")
		await until(() => guest.heard.length === 1)
		expect(guest.heard[0]).toMatchObject({ senderId: host.peer.id, payload: { message: "hello" } })

		await sendMessage(guest.peer, network.id, "only you", host.peer.id)
		await until(() => host.heard.length === 1)
		expect(host.heard[0].payload).toEqual({ message: "only you", senderName: "guest", to: host.peer.id })

		await leave(host.peer, network.id)
		await leave(guest.peer, network.id)
	})

	test("a join the network refuses fails with the network's answer", async () => {
		const network = await owner.createNetwork({ name: "team" })
		const strangers = new NetworkClient({ origin, apiKey: "pk_b" })
		const stranger = await listener(strangers, "stranger")

		await expect(join(stranger.peer, network.id, strangers)).rejects.toThrow("Network not found")
		await expect(new NetworkClient({ origin }).createNetwork({ name: "no key" })).rejects.toThrow("401")
	})

	test("what the network refuses later reaches the peer's rules", async () => {
		const network = await owner.createNetwork({ name: "team" })
		const alone = await listener(owner, "alone")
		await join(alone.peer, network.id, owner)

		await sendMessage(alone.peer, network.id, "anyone?", "nobody")
		await until(() => alone.refused.length === 1)
		expect(alone.refused[0].payload).toEqual({ code: "not_found", message: "Peer not in this network" })

		await leave(alone.peer, network.id)
	})

	test("a connection that dropped comes back and joins again", async () => {
		const network = await owner.createNetwork({ name: "team" })
		const one = await listener(owner, "one")
		const two = await listener(owner, "two")
		await join(one.peer, network.id, owner)
		await join(two.peer, network.id, owner)

		for (const connection of connections) connection.destroy()
		await until(() => connections.filter((connection) => !connection.destroyed).length === 2)
		await new Promise((resolve) => setTimeout(resolve, 200))

		await sendMessage(one.peer, network.id, "back?")
		await until(() => two.heard.length === 1)
		expect(two.heard[0].payload).toEqual({ message: "back?", senderName: "one" })

		await leave(one.peer, network.id)
		await leave(two.peer, network.id)
	})
})
