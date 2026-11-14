import { Peer } from "../peer/peer"
import { Envelope } from "../peer/envelope"
import { RuleEngine } from "../peer/rule-engine"
import { InputResolverRegistry } from "../peer/input-resolver-registry"
import { DirectiveProcessor } from "../peer/directive-processor"
import { DirectiveResult } from "../peer/directive-result"

export class ReactToMessageUseCase {
	constructor(
		private readonly ruleEngine: RuleEngine,
		private readonly inputResolverRegistry: InputResolverRegistry,
		private readonly directiveProcessor: DirectiveProcessor,
	) {}

	/** The rule that matches says what the peer reads from the envelope and what it does with it. No rule, nothing done. */
	async execute(
		peer: Peer,
		networkId: string,
		envelope: Envelope<any>,
	): Promise<DirectiveResult<unknown> | undefined> {
		const rule = await this.ruleEngine.decide(peer.getPolicy(), envelope)
		if (!rule) {
			return undefined
		}

		const inputResolver = this.inputResolverRegistry.get(rule.input)
		if (!inputResolver) {
			throw new Error(`Input ${rule.input} not found`)
		}

		const input = await inputResolver.resolve(envelope)
		return await this.directiveProcessor.process({ id: rule.directive, input })
	}
}
