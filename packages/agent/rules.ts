import { Condition, Input } from "@client/index"
import { BehaviorPolicyDefinition } from "@client/network-client"
import { ConditionSpecification } from "@client/peer/condition-specification"
import { Envelope } from "@client/peer/envelope"
import { InputResolver } from "@client/peer/input-resolver"

type MessageSent = Envelope<{ message: string; senderName?: string; to?: string }>

/** What a peer asked of the agent: the text, who asked, and in which network. */
export type Request = { networkId: string; senderId: string; text: string }

/** An agent answers when it is spoken to: a message for everyone doesn't start a loop. */
export function agentPolicy(directive: string): BehaviorPolicyDefinition {
	return { rules: [{ condition: "message.direct", input: "request", directive }] }
}

@Condition({ name: "message.direct" })
export class DirectMessageCondition extends ConditionSpecification {
	// The network gives a message with `to` only to the peer it names.
	isSatisfiedBy(envelope: Envelope<any>) {
		return envelope.type === "message.sent" && envelope.payload.to !== undefined
	}
}

@Input({ name: "request" })
export class RequestInput implements InputResolver<MessageSent, Request> {
	resolve(envelope: MessageSent): Promise<Request> {
		return Promise.resolve({
			networkId: envelope.networkId,
			senderId: envelope.senderId,
			text: envelope.payload.message,
		})
	}
}
