import { Server } from "@modelcontextprotocol/sdk/server/index.js"

/** Puts something in front of Claude in the running session, as a `<channel>` event with `meta` as its attributes. */
export interface Channel {
	push(content: string, meta: Record<string, string>): Promise<void>
}

export class ClaudeCodeChannel implements Channel {
	constructor(private readonly mcp: Server) {}

	/** Claude Code doesn't say whether it took the event: a session that wasn't started with this channel drops it. */
	async push(content: string, meta: Record<string, string>): Promise<void> {
		await this.mcp.notification({ method: "notifications/claude/channel", params: { content, meta } })
	}
}
