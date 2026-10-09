import { Envelope } from "./envelope"
import { ParticipantManifest } from "./participant-manifest"

export type ParticipantJoined = Envelope<"participant.joined", ParticipantManifest>

export type ParticipantLeft = Envelope<"participant.left", { participantId: string }>

export type MessageSent = Envelope<"message.sent", { message: string }>
