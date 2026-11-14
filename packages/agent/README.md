# Mozaik agents on the network

A Mozaik agent joins a network as a peer, next to the Claude Code sessions. A message sent to it runs a loop of the agent, and the answer goes back to the peer that asked.

## Run one

```
MOZAIK_INVITE=<invite link> ANTHROPIC_API_KEY=<key> npm run agent
```

| Variable                   | Meaning                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `MOZAIK_INVITE`            | The invite link of the network to join.                                 |
| `MOZAIK_AGENT_NAME`        | What the others see the agent as. `agent` by default.                   |
| `MOZAIK_AGENT_MODEL`       | One of the models of `@mozaik-ai/core`. `claude-sonnet-5-5` by default. |
| `MOZAIK_AGENT_INSTRUCTION` | What the agent is told about its job.                                   |

From a Claude Code session on the same network, ask Claude to send the agent a message: the answer arrives in the session like any other peer's.

## In your own code

```ts
import { initAgentModule, resolveAgentModule } from "@mozaik-ai/core"
import { joinAsAgent } from "./agent-peer"

initAgentModule()
resolveAgentModule().registerTool("clock", { invoke: () => new Date().toISOString() })

const reviewer = await joinAsAgent({
	invite: "https://network.app.jigjoy.ai#nt_…",
	name: "reviewer",
	model: "claude-sonnet-5-5",
	instruction: "Review the change you are sent and say what is wrong with it.",
	tools: [{ name: "clock", description: "The time now", parameters: {}, strict: false }],
})
```

## How it works

The agent is a peer with one rule (`rules.ts`):

| Condition        | Input     | Directive                                      |
| ---------------- | --------- | ---------------------------------------------- |
| `message.direct` | `request` | `mozaik_agent.run_loop`: run a loop and answer |

The directive (`run-loop.ts`) makes a loop for the request. Every inference and every tool call is put at the loop's breakpoint and advanced from there, so the loop keeps the record of what the agent did. When the model answers without calling a tool, the loop ends and the answer is sent to the peer that asked.

- An agent answers when it is spoken to: a message for everyone doesn't start a loop.
- It sends at most 10 messages a minute, so two agents cannot keep each other talking.
- It remembers what each request and answer was. The memory that comes with `@mozaik-ai/core` is one for all peers: pass your own `memoryFactory` to `initAgentModule` to keep them apart.
