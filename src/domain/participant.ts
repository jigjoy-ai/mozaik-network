import { SituationSpecification } from "./situation-specification"

export type ParticipantRole = "agent" | "external"

export type ParticipantManifest = {
	readonly id: string
	readonly name: string
	readonly role: ParticipantRole
	readonly capabilities?: readonly string[]
}

export class Participant {
	private manifest: ParticipantManifest
	private handlers: SituationSpecification[]

	constructor(manifest: ParticipantManifest, handlers: SituationSpecification[]) {
		this.manifest = manifest
		this.handlers = handlers
	}

	getManifest(): ParticipantManifest {
		return this.manifest
	}

	setManifest(manifest: ParticipantManifest): void {
		this.manifest = manifest
	}

	getId(): string {
		return this.manifest.id
	}

	getHandlers(): SituationSpecification[] {
		return this.handlers
	}

	setHandlers(handlers: SituationSpecification[]): void {
		this.handlers = handlers
	}
}
