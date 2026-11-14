import { resolveAgentModule } from "@mozaik-ai/core"
import type {
	Agent,
	ContextItem,
	InferenceResult,
	InstructionRecord,
	ToolCallItem,
	ToolCallResult,
} from "@mozaik-ai/core"
import { Directive } from "@client/peer/directive"
import { Request } from "./rules"

/** How many inferences one request may take: a model that keeps calling tools is stopped. */
const MAX_INFERENCES = 12

/**
 * Answers a request with a loop of the agent's own: every inference and tool call is put at
 * the loop's breakpoint and advanced from there, so the loop keeps the record of what was done.
 */
export class RunLoop implements Directive {
	constructor(
		readonly id: string,
		private readonly agent: Agent,
		private readonly model: string,
		private readonly reply: (request: Request, answer: string) => Promise<void>,
	) {}

	async invoke(input: unknown): Promise<void> {
		const request = input as Request

		try {
			await this.reply(request, await this.answer(request))
		} catch (error) {
			// What went wrong stays here: the peer that asked is only told that it did.
			console.error(error)
			await this.reply(request, "I ran into an error and couldn't answer.")
		}
	}

	private async answer(request: Request): Promise<string> {
		const { createLoop, endLoop } = resolveAgentModule()

		const asked: ContextItem = { type: "user_message", text: request.text }
		const context: ContextItem[] = [
			{ type: "developer_message", text: this.agent.instruction },
			...(await this.agent.memory.recall(request.text, request.senderId)),
			asked,
		]
		const tools = this.agent.tools.length > 0 ? this.agent.tools : undefined
		const loop = await createLoop({ agentId: this.agent.id, goal: request.text })

		for (let inference = 0; inference < MAX_INFERENCES; inference++) {
			const parameters = { model: this.model, tools, context: { items: [...context] } }
			const output = (await this.advance(loop.id, { type: "inference", parameters })) as InferenceResult
			context.push(...output.items)

			const calls = output.items.filter((item): item is ToolCallItem => item.type === "tool_call")
			if (calls.length === 0) {
				const answer = output.items
					.flatMap((item) => (item.type === "model_message" ? [item.text] : []))
					.join("\n")

				await endLoop({ loopId: loop.id, message: answer })
				await this.agent.memory.remember([asked, { type: "model_message", text: answer }], request.senderId)
				return answer
			}

			for (const call of calls) {
				const parameters = { toolName: call.toolName, toolArguments: call.toolArguments }
				const { result } = (await this.advance(loop.id, { type: "tool_call", parameters })) as ToolCallResult
				context.push({
					type: "tool_call_result",
					requestId: call.requestId,
					result: { type: "input_text", text: result },
				})
			}
		}

		const answer = `I stopped after ${MAX_INFERENCES} steps without an answer.`
		await endLoop({ loopId: loop.id, message: answer })
		return answer
	}

	/** Puts the instruction at the loop's breakpoint, runs it, and returns what it gave. */
	private async advance(loopId: string, instruction: InstructionRecord): Promise<InstructionRecord["result"]> {
		const { setBreakpoint, advanceLoop, getLoop } = resolveAgentModule()

		await setBreakpoint({ loopId, instruction })
		await advanceLoop({ loopId })

		const { completedInstructions } = await getLoop(loopId)
		return completedInstructions[completedInstructions.length - 1].result
	}
}
