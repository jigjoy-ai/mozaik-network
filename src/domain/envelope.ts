import { ParticipantManifest } from "@domain/participant"

export type Envelope<TType extends string = string, TPayload = unknown> = {
	readonly type: TType
	readonly senderId: string
	readonly createdAt: Date
	readonly payload: TPayload
}

export type ParticipantJoined = Envelope<"participant.joined", ParticipantManifest>

export type ParticipantLeft = Envelope<"participant.left", ParticipantManifest>

export type MessageSent = Envelope<"message.sent", { message: string }>
