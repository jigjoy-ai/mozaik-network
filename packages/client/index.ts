import { JoinNetworkUseCase } from "./use-cases/join"
import { ConnectionRegistry } from "./connection-registry"
import { Peer } from "./peer/peer"
import { LeaveNetworkUseCase } from "./use-cases/leave"
import { SendMessageUseCase } from "./use-cases/send-message"
import { ReactToMessageUseCase } from "./use-cases/react"
import { Envelope } from "./peer/envelope"
import { ConditionSpecification } from "./peer/condition-specification"
import { InputResolver } from "./peer/input-resolver"
import { DirectiveRegistry } from "./peer/directive-registry"
import { InputResolverRegistry } from "./peer/input-resolver-registry"
import { RuleRegistry } from "./peer/rule-registry"
import { RuleEngine } from "./peer/rule-engine"
import { DirectiveProcessor } from "./peer/directive-processor"
import { DirectiveResult } from "./peer/directive-result"
import { NetworkClient } from "./network-client"

const connectionRegistry = new ConnectionRegistry()

/** Joins on the network the client talks to: the one NETWORK_ORIGIN names, unless another client is given. */
export async function join(peer: Peer, networkId: string, client: NetworkClient = new NetworkClient()): Promise<void> {
	const useCase = new JoinNetworkUseCase(connectionRegistry, client)
	return await useCase.execute(peer, networkId)
}

export async function leave(peer: Peer, networkId: string): Promise<void> {
	const useCase = new LeaveNetworkUseCase(connectionRegistry)
	return await useCase.execute(peer, networkId)
}

/** With `to`, the message goes to that peer only. */
export function sendMessage(peer: Peer, networkId: string, message: string, to?: string): Promise<void> {
	const useCase = new SendMessageUseCase(connectionRegistry)
	return useCase.execute(peer, networkId, message, to)
}

export async function reactToMessage(
	peer: Peer,
	networkId: string,
	envelope: Envelope<any>,
): Promise<DirectiveResult<unknown> | undefined> {
	const useCase = new ReactToMessageUseCase(
		new RuleEngine(specificationRegistry),
		inputResolverRegistry,
		new DirectiveProcessor(directiveRegistry),
	)
	return await useCase.execute(peer, networkId, envelope)
}

export const inputResolverRegistry = new InputResolverRegistry()

export const specificationRegistry = new RuleRegistry()
export const directiveRegistry = new DirectiveRegistry()

// directiveRegistry.register("inference", inferenceOperation)

// const directiveProcessor = config.directiveProcessor ?? new DirectiveProcessor(directiveRegistry)

export function Input(options: { name: string }) {
	return function <T extends new () => InputResolver<unknown, unknown>>(
		ResolverClass: T,
		_context: ClassDecoratorContext,
	): void {
		inputResolverRegistry.register(options.name, new ResolverClass())
	}
}

export function Condition(options: { name: string }) {
	return function <T extends new () => ConditionSpecification>(
		SpecificationClass: T,
		_context: ClassDecoratorContext,
	): void {
		specificationRegistry.register(options.name, new SpecificationClass())
	}
}
