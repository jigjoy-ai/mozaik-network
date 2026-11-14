import { afterAll, beforeAll, describe, expect, test } from "@rstest/core"
import { AddressInfo } from "node:net"
import { Server } from "node:http"
import { initAgentModule, resolveAgentModule } from "@mozaik-ai/core"
import type { GenerativeModel, InferenceParams, InferenceResult } from "@mozaik-ai/core"
import { createApp } from "src/app"
import { initNetworkModule } from "src/network-module"
import {
	directiveRegistry,
	inputResolverRegistry,
	join,
	leave,
	sendMessage,
	specificationRegistry,
} from "@client/index"
import { writeInviteLink } from "@client/invite-link"
import { NetworkClient } from "@client/network-client"
import { ConditionSpecification } from "@client/peer/condition-specification"
import { Envelope } from "@client/peer/envelope"
import { AgentPeer, joinAsAgent } from "../../packages/agent/agent-peer"

// A model that asks for the clock once, then answers with what the clock said and how much it was told before.
const scripted: GenerativeModel = {
	specification: {
		name: "scripted",
		provider: "test",
		supportsReasoningEffort: false,
		supportedReasoningEfforts: [],
		supportsStreaming: false,
		contextWindowSize: 1000,
		supportedContextItemTypes: [
			"developer_message",
			"user_message",
			"model_message",
			"tool_call",
			"tool_call_result",
		],
		maxOutputTokens: 1000,
		supportsFunctionCalling: true,
		supportsStructuredOutput: false,
	},
	endpoint: {
		async infer(params: InferenceParams): Promise<InferenceResult> {
			const told = params.context.items.find((item) => item.type === "tool_call_result")
			const asked = params.context.items.filter((item) => item.type === "user_message").length
			return {
				type: "inference_output",
				rawResponse: undefined,
				items: told
					? [{ type: "model_message", text: `It is ${told.result.text}. You have asked ${asked} times.` }]
					: [{ type: "tool_call", requestId: "call-1", toolName: "clock", toolArguments: "{}" }],
			}
		},
		async *stream() {},
	},
}

class AnyMessage extends ConditionSpecification {
	isSatisfiedBy(envelope: Envelope<any>) {
		return envelope.type === "message.sent"
	}
}

let server: Server
let origin: string
let invite: string
let networkId: string
let timekeeper: AgentPeer
const heard: Envelope<any>[] = []

beforeAll(async () => {
	initNetworkModule()
	server = createApp()
	await new Promise<void>((resolve) => server.listen(0, resolve))
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

	const owner = new NetworkClient({ origin })
	networkId = (await owner.createNetwork({ name: "team" })).id
	invite = writeInviteLink({ origin, invite: await owner.createInvite(networkId) })

	initAgentModule({ inferenceRunnerConfig: { supportedModels: [scripted] } })
	resolveAgentModule().registerTool("clock", { invoke: () => "noon" })
	timekeeper = await joinAsAgent({
		invite,
		name: "timekeeper",
		instruction: "Tell the time.",
		model: "scripted",
		tools: [{ name: "clock", description: "The time now", parameters: {}, strict: false }],
	})
})

afterAll(async () => {
	await timekeeper.leave()
	await new Promise((resolve) => server.close(resolve))
})

async function until(condition: () => boolean): Promise<void> {
	for (let waited = 0; !condition(); waited += 20) {
		if (waited > 3000) throw new Error("waited 3s for nothing")
		await new Promise((resolve) => setTimeout(resolve, 20))
	}
}

describe("agent on the network", () => {
	test("a message to the agent runs a loop with its tools, and the answer comes back to the peer that asked", async () => {
		const client = new NetworkClient({ origin })
		specificationRegistry.register("message.any", new AnyMessage())
		inputResolverRegistry.register("envelope", { resolve: async (envelope: Envelope<any>) => envelope })
		directiveRegistry.register("hear", { id: "hear", invoke: (envelope) => heard.push(envelope as Envelope<any>) })
		const asker = await client.createPeer({
			name: "asker",
			role: "agent",
			capabilities: [],
			policy: { rules: [{ condition: "message.any", input: "envelope", directive: "hear" }] },
		})
		await join(asker, networkId, client)

		await sendMessage(asker, networkId, "What time is it?", timekeeper.peer.id)
		await until(() => heard.length === 1)
		expect(heard[0]).toMatchObject({
			senderId: timekeeper.peer.id,
			payload: { message: "It is noon. You have asked 1 times.", to: asker.id },
		})

		// The agent remembers what it was asked before.
		await sendMessage(asker, networkId, "And now?", timekeeper.peer.id)
		await until(() => heard.length === 2)
		expect(heard[1].payload.message).toBe("It is noon. You have asked 2 times.")

		// A message for everyone isn't the agent's to answer.
		await sendMessage(asker, networkId, "Anyone?")
		await new Promise((resolve) => setTimeout(resolve, 300))
		expect(heard.length).toBe(2)

		await leave(asker, networkId)
	})
})
