import { ParticipantRole } from "@domain/participant-role"

export type ParticipantManifest = {
	readonly id: string
	readonly name: string
	readonly role: ParticipantRole
	readonly capabilities?: readonly string[]
}
