import { Condition, directiveRegistry, Input } from "@client/index"
import { BehaviorPolicyDefinition } from "@client/network-client"
import { ConditionSpecification } from "@client/peer/condition-specification"
import { Directive } from "@client/peer/directive"
import { Envelope } from "@client/peer/envelope"
import { InputResolver } from "@client/peer/input-resolver"
import { Channel } from "./channel"
import { Message, NetworkView, PeerInfo } from "./network-view"

type MessageSent = Envelope<{ message: string; to?: string }>

type Refusal = { code: string; message: string }

/** How a Claude Code session acts on what happens in the network. */
export const claudeCodePolicy: BehaviorPolicyDefinition = {
	rules: [
		{ condition: "message.received", input: "message", directive: "claude_code.notify" },
		{ condition: "membership.changed", input: "envelope", directive: "network.observe" },
		{ condition: "request.refused", input: "refusal", directive: "claude_code.report" },
	],
}

@Condition({ name: "message.received" })
export class MessageReceivedCondition extends ConditionSpecification {
	isSatisfiedBy(envelope: Envelope<any>) {
		return envelope.type === "message.sent"
	}
}

@Condition({ name: "membership.changed" })
export class MembershipChangedCondition extends ConditionSpecification {
	isSatisfiedBy(envelope: Envelope<any>) {
		return ["peer.welcomed", "peer.joined", "peer.left"].includes(envelope.type)
	}
}

@Condition({ name: "request.refused" })
export class RequestRefusedCondition extends ConditionSpecification {
	isSatisfiedBy(envelope: Envelope<any>) {
		return envelope.type === "error"
	}
}

@Input({ name: "message" })
export class MessageInput implements InputResolver<MessageSent, Message> {
	resolve(envelope: MessageSent): Promise<Message> {
		return Promise.resolve(toMessage(envelope))
	}
}

@Input({ name: "envelope" })
export class EnvelopeInput implements InputResolver<Envelope<unknown>, Envelope<unknown>> {
	resolve(envelope: Envelope<unknown>): Promise<Envelope<unknown>> {
		return Promise.resolve(envelope)
	}
}

@Input({ name: "refusal" })
export class RefusalInput implements InputResolver<Envelope<Refusal>, Refusal> {
	resolve(envelope: Envelope<Refusal>): Promise<Refusal> {
		return Promise.resolve(envelope.payload)
	}
}

/** Shows a peer's message to Claude and keeps it for read_messages. */
export class NotifyClaudeCode implements Directive {
	readonly id = "claude_code.notify"

	constructor(
		private readonly view: NetworkView,
		private readonly channel: Channel,
	) {}

	async invoke(input: unknown): Promise<void> {
		const message = input as Message

		this.view.heard(message)
		await show(this.channel, this.view, message)
	}
}

/** Keeps up with who is in the network. Nobody's coming or going is shown to Claude: list_peers answers that. */
export class ObserveNetwork implements Directive {
	readonly id = "network.observe"

	constructor(
		private readonly view: NetworkView,
		private readonly channel: Channel,
	) {}

	async invoke(input: unknown): Promise<void> {
		const envelope = input as Envelope<any>

		switch (envelope.type) {
			case "peer.welcomed": {
				const { peers, messages } = envelope.payload as { peers: PeerInfo[]; messages: MessageSent[] }
				// Welcomed again after the connection dropped: what was said meanwhile is shown now.
				const missed = this.view.welcomed(peers, messages.map(toMessage))
				for (const message of missed) await show(this.channel, this.view, message)
				break
			}

			case "peer.joined":
				this.view.joined(envelope.payload as PeerInfo)
				break

			case "peer.left":
				this.view.left((envelope.payload as { peerId: string }).peerId)
				break
		}
	}
}

/** Tells Claude what the network refused: a message that wasn't sent would otherwise look sent. */
export class ReportRefusal implements Directive {
	readonly id = "claude_code.report"

	constructor(private readonly channel: Channel) {}

	async invoke(input: unknown): Promise<void> {
		const { code, message } = input as Refusal
		await this.channel.push(`The network refused the last request: ${message}`, { kind: "error", code })
	}
}

export function registerDirectives(view: NetworkView, channel: Channel): void {
	const directives = [
		new NotifyClaudeCode(view, channel),
		new ObserveNetwork(view, channel),
		new ReportRefusal(channel),
	]

	for (const directive of directives) directiveRegistry.register(directive.id, directive)
}

function toMessage(envelope: MessageSent): Message {
	return {
		id: envelope.id,
		senderId: envelope.senderId,
		text: envelope.payload.message,
		to: envelope.payload.to,
		at: new Date(envelope.createdAt),
	}
}

/** A message as Claude gets it: the text, with who sent it and whether it was for this session only. */
function show(channel: Channel, view: NetworkView, message: Message): Promise<void> {
	return channel.push(message.text, {
		kind: "message",
		from: view.nameOf(message.senderId),
		from_id: message.senderId,
		direct: String(message.to !== undefined),
	})
}
