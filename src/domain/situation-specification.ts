import { Envelope } from "@domain/envelope"
import { Participant } from "@domain/participant"

export type SituationContext = {
	readonly envelope: Envelope
	readonly participant: Participant
}

export abstract class SituationSpecification {
	abstract isSatisfiedBy(situationContext: SituationContext): boolean

	and(other: SituationSpecification): SituationSpecification {
		return new AndSituationSpecification(this, other)
	}

	or(other: SituationSpecification): SituationSpecification {
		return new OrSituationSpecification(this, other)
	}

	not(): SituationSpecification {
		return new NotSituationSpecification(this)
	}
}

class AndSituationSpecification extends SituationSpecification {
	constructor(
		private readonly left: SituationSpecification,
		private readonly right: SituationSpecification,
	) {
		super()
	}

	isSatisfiedBy(situationContext: SituationContext): boolean {
		return this.left.isSatisfiedBy(situationContext) && this.right.isSatisfiedBy(situationContext)
	}
}

class OrSituationSpecification extends SituationSpecification {
	constructor(
		private readonly left: SituationSpecification,
		private readonly right: SituationSpecification,
	) {
		super()
	}

	isSatisfiedBy(situationContext: SituationContext): boolean {
		return this.left.isSatisfiedBy(situationContext) || this.right.isSatisfiedBy(situationContext)
	}
}

class NotSituationSpecification extends SituationSpecification {
	constructor(private readonly rule: SituationSpecification) {
		super()
	}

	isSatisfiedBy(situationContext: SituationContext): boolean {
		return !this.rule.isSatisfiedBy(situationContext)
	}
}
