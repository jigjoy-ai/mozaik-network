import { afterAll, beforeAll, describe, expect, test } from "@rstest/core"
import { existsSync, mkdtempSync } from "node:fs"
import { AddressInfo } from "node:net"
import { Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { createApp } from "src/app"
import { initNetworkModule } from "src/network-module"

type ChannelEvent = { content: string; meta: Record<string, string> }

type Session = {
	events: ChannelEvent[]
	call(tool: string, args?: Record<string, unknown>): Promise<{ text: string; failed: boolean }>
}

let server: Server
let origin: string
const clients: Client[] = []

beforeAll(async () => {
	initNetworkModule()
	server = createApp()
	await new Promise<void>((resolve) => server.listen(0, resolve))
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
	await Promise.all(clients.map((client) => client.close()))
	await new Promise((resolve) => server.close(resolve))
})

const stateDir = () => mkdtempSync(join(tmpdir(), "mozaik-network-"))

/** The plugin's server as Claude Code runs it: over stdio, with what it pushes into the session kept in `events`. */
async function session(name: string, dir: string): Promise<Session> {
	const client = new Client({ name: "claude-code", version: "0.0.0" })
	const events: ChannelEvent[] = []
	client.fallbackNotificationHandler = async (notification) => {
		if (notification.method === "notifications/claude/channel") events.push(notification.params as ChannelEvent)
	}

	await client.connect(
		new StdioClientTransport({
			command: "node_modules/.bin/tsx",
			args: ["packages/claude-code/server.ts"],
			env: {
				...(process.env as Record<string, string>),
				NETWORK_ORIGIN: origin,
				MOZAIK_PEER_NAME: name,
				MOZAIK_NETWORK_STATE_DIR: dir,
			},
		}),
	)
	clients.push(client)

	return {
		events,
		async call(tool, args = {}) {
			const result = await client.callTool({ name: tool, arguments: args })
			const [{ text }] = result.content as { text: string }[]
			return { text, failed: result.isError === true }
		},
	}
}

async function until(condition: () => boolean): Promise<void> {
	for (let waited = 0; !condition(); waited += 20) {
		if (waited > 3000) throw new Error("waited 3s for nothing")
		await new Promise((resolve) => setTimeout(resolve, 20))
	}
}

describe("Claude Code plugin", () => {
	test("one session makes a network, another joins with its link, and each is shown what the other says", async () => {
		const [ana, marko] = await Promise.all([session("ana@api", stateDir()), session("marko@web", stateDir())])

		const made = await ana.call("create_network", { name: "team" })
		const link = made.text.split("\n").pop()!
		expect(link).toMatch(new RegExp(`^${origin}#nt_`))

		const joined = await marko.call("join_network", { invite: link })
		expect(joined.text).toContain("ana@api")
		expect(joined.text).toContain("marko@web")

		await ana.call("send_message", { text: "who is on the login bug?" })
		await until(() => marko.events.length === 1)
		expect(marko.events[0]).toMatchObject({
			content: "who is on the login bug?",
			meta: { kind: "message", from: "ana@api", direct: "false" },
		})

		await marko.call("send_message", { text: "me", to: "ana@api" })
		await until(() => ana.events.length === 1)
		expect(ana.events[0]).toMatchObject({ content: "me", meta: { from: "marko@web", direct: "true" } })

		expect((await ana.call("read_messages")).text).toMatch(
			/ana@api: who is on the login bug\?\n.* marko@web → ana@api: me$/,
		)
		expect((await marko.call("send_message", { text: "hi", to: "nobody" })).failed).toBe(true)
	})

	test("a later session on the same machine is told a network is saved, and joins it without the link", async () => {
		const dir = stateDir()
		const first = await session("ana@api", dir)
		await first.call("create_network", { name: "team" })
		await first.call("send_message", { text: "said before you came" })

		const later = await session("ana@docs", dir)
		await until(() => later.events.length === 1)
		expect(later.events[0]).toMatchObject({ meta: { kind: "ready" } })

		expect((await later.call("join_network")).text).toContain("ana@api")
		expect((await later.call("read_messages")).text).toContain("ana@api: said before you came")

		await later.call("leave_network", { forget: true })
		expect((await later.call("list_peers")).text).toBe("Not in a network.")
		expect(existsSync(join(dir, "network.json"))).toBe(false)
	})

	test("without a saved network or a link there is nothing to join", async () => {
		const alone = await session("ana@api", stateDir())

		expect(await alone.call("join_network")).toMatchObject({ failed: true })
		expect(await alone.call("join_network", { invite: "not a link" })).toMatchObject({ failed: true })
		expect(await alone.call("send_message", { text: "anyone?" })).toMatchObject({ failed: true })
		expect(alone.events).toEqual([])
	})
})
