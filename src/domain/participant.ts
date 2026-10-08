export type ParticipantRole = "agent" | "external"

export type ParticipantManifest = {
	readonly id: string
	readonly name: string
	readonly role: ParticipantRole
	readonly capabilities?: readonly string[]
}

export class Participant {
	private manifest: ParticipantManifest

	constructor(manifest: ParticipantManifest) {
		this.manifest = manifest
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
}
