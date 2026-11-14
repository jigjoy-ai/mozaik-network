import { NetworkSession } from "./network-session"
import { Message, NetworkView } from "./network-view"

export type Tool = {
	name: string
	description: string
	inputSchema: { type: "object"; properties: Record<string, object>; required?: string[] }
	call(args: Record<string, unknown>): Promise<string>
}

/** What Claude can do in the network. Each tool answers with text for Claude to read. */
export function networkTools(session: NetworkSession, view: NetworkView): Tool[] {
	const peerList = () => {
		const me = session.getMembership()?.peer.id
		return view
			.peers()
			.map((peer) => `- ${view.nameOf(peer.id)} (${peer.id})${peer.id === me ? " — this session" : ""}`)
			.join("\n")
	}

	const line = (message: Message) => {
		const to = message.to === undefined ? "" : ` → ${view.nameOf(message.to)}`
		return `${message.at.toISOString()} ${view.nameOf(message.senderId)}${to}: ${message.text}`
	}

	return [
		{
			name: "join_network",
			description:
				"Connect this session to a Mozaik network. Pass the invite link the user was given; with no arguments the network saved on this machine is joined. The network is saved, so later sessions can join it without the link.",
			inputSchema: { type: "object", properties: { invite: { type: "string", description: "Invite link" } } },
			async call({ invite }) {
				await session.join(typeof invite === "string" ? invite : undefined)
				return `Joined the network. In it now:\n${peerList()}`
			},
		},
		{
			name: "create_network",
			description:
				"Make a new Mozaik network, join it, and get the invite link to share. Whoever has the link can join, and the messages of everyone in the network are paid for by the one who made it. On the hosted network this needs a Mozaik Cloud API key: MOZAIK_API_KEY, or `npx @mozaik-ai/cloud-sdk pair`.",
			inputSchema: {
				type: "object",
				properties: { name: { type: "string", description: "What the network is called" } },
				required: ["name"],
			},
			async call({ name }) {
				if (typeof name !== "string" || !name.trim()) throw new Error("name is required")
				const link = await session.create(name.trim())
				return `Made and joined "${name.trim()}". Invite link, to give to the people who should join:\n${link}`
			},
		},
		{
			name: "leave_network",
			description:
				"Disconnect this session from the network. With forget, the saved network is removed too, so later sessions don't join it.",
			inputSchema: { type: "object", properties: { forget: { type: "boolean" } } },
			async call({ forget }) {
				await session.leave(forget === true)
				return forget === true ? "Left, and the saved network is forgotten." : "Left the network."
			},
		},
		{
			name: "send_message",
			description:
				"Send a message to the peers in the network. Pass `to` (a peer's id or name) to reach that peer only; without it every peer gets the message.",
			inputSchema: {
				type: "object",
				properties: { text: { type: "string" }, to: { type: "string", description: "Peer id or name" } },
				required: ["text"],
			},
			async call({ text, to }) {
				if (typeof text !== "string" || !text.trim()) throw new Error("text is required")
				await session.send(text, typeof to === "string" ? to : undefined)
				return "Sent."
			},
		},
		{
			name: "list_peers",
			description: "Who is in the network now.",
			inputSchema: { type: "object", properties: {} },
			async call() {
				return session.getMembership() ? peerList() : "Not in a network."
			},
		},
		{
			name: "read_messages",
			description:
				"The latest messages in the network, oldest first, also those sent before this session joined.",
			inputSchema: {
				type: "object",
				properties: { limit: { type: "number", description: "How many; 20 by default" } },
			},
			async call({ limit }) {
				const messages = view.recent(typeof limit === "number" ? limit : 20)
				return messages.length > 0 ? messages.map(line).join("\n") : "No messages."
			},
		},
	]
}
