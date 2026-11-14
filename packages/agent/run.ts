// Runs one agent on a network until it is stopped.
//
//   MOZAIK_INVITE=<invite link> ANTHROPIC_API_KEY=<key> npm run agent
import { initAgentModule } from "@mozaik-ai/core"
import { joinAsAgent } from "./agent-peer"

async function main() {
	const invite = process.env.MOZAIK_INVITE
	if (!invite) throw new Error("MOZAIK_INVITE is required: the invite link of the network to join")

	initAgentModule()

	const { peer, networkId, leave } = await joinAsAgent({
		invite,
		name: process.env.MOZAIK_AGENT_NAME ?? "agent",
		model: process.env.MOZAIK_AGENT_MODEL ?? "claude-sonnet-5-5",
		instruction:
			process.env.MOZAIK_AGENT_INSTRUCTION ??
			"You are an agent on a Mozaik network, working with other people's agents. Answer what you are asked, briefly.",
	})

	console.log(`Joined network ${networkId} as ${peer.getManifest().name} (${peer.id})`)

	const stop = () => {
		void leave()
			.catch(() => {})
			.finally(() => process.exit(0))
	}
	process.on("SIGINT", stop)
	process.on("SIGTERM", stop)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
