import { resolveAgentModule } from "@mozaik-ai/core"
import type { Agent, ToolDefinition } from "@mozaik-ai/core"
import { directiveRegistry, join, leave, sendMessage } from "@client/index"
import { HOSTED_NETWORK, readInviteLink } from "@client/invite-link"
import { NetworkClient } from "@client/network-client"
import { Peer } from "@client/peer/peer"
import { SendLimit } from "@client/send-limit"
import { agentPolicy } from "./rules"
import { RunLoop } from "./run-loop"

export type AgentPeerOptions = {
	/** The invite link of the network the agent joins. */
	invite: string
	name: string
	instruction: string
	/** The name of one of the agent module's models. */
	model: string
	/** What the agent may call; each tool is registered with the agent module's `registerTool`. */
	tools?: ToolDefinition[]
}

export type AgentPeer = {
	agent: Agent
	peer: Peer
	networkId: string
	leave(): Promise<void>
}

/**
 * Makes an agent and a peer for it in the invite's network. A message sent to the peer runs a
 * loop of the agent, and the answer goes back to the peer that asked. The agent module has to
 * be initialized first: the application decides its models and where agents and loops are kept.
 */
export async function joinAsAgent(options: AgentPeerOptions): Promise<AgentPeer> {
	const link = readInviteLink(options.invite, process.env.NETWORK_ORIGIN || HOSTED_NETWORK)
	if (!link) throw new Error("That is not an invite link")

	const { name, instruction, model, tools = [] } = options
	const agent = await resolveAgentModule().createAgent({ name, instruction, tools })

	// Each agent has a directive of its own, so several can run in one process.
	const directive = `mozaik_agent.run_loop:${agent.id}`
	const client = new NetworkClient({ origin: link.origin })
	const peer = await client.createPeer({
		name,
		role: "agent",
		capabilities: ["message"],
		invite: link.invite,
		policy: agentPolicy(directive),
	})
	if (!peer.invitedTo) throw new Error("The network didn't say which network the invite is for")
	const networkId = peer.invitedTo

	// Two agents that keep answering each other would run through the messages the network's owner pays for.
	const limit = new SendLimit()
	directiveRegistry.register(
		directive,
		new RunLoop(directive, agent, model, async (request, answer) => {
			limit.take()
			await sendMessage(peer, request.networkId, answer, request.senderId)
		}),
	)

	await join(peer, networkId, client)

	return { agent, peer, networkId, leave: () => leave(peer, networkId) }
}
