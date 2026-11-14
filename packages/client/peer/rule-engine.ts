import { BehaviorPolicy } from "./behavior-policy"
import { RuleRegistry } from "./rule-registry"
import { Envelope } from "./envelope"
import { Rule } from "./rule"

export class RuleEngine {
	constructor(private readonly specificationRegistry: RuleRegistry) {}

	/** The rule to act on: of those whose condition holds, the one with the smallest priority. */
	async decide(policy: BehaviorPolicy, envelope: Envelope<any>): Promise<Rule | undefined> {
		const satisfiedRules = []

		for (const rule of policy.getRules()) {
			const specification = this.specificationRegistry.get(rule.condition)
			if (await specification?.isSatisfiedBy(envelope)) {
				satisfiedRules.push(rule)
			}
		}

		if (satisfiedRules.length === 0) {
			return undefined
		}

		return satisfiedRules.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0]
	}
}
