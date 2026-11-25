import { Envelope } from "./envelope"
import { PeerManifest } from "./peer-manifest"

export type PeerJoined = Envelope<"peer.joined", PeerManifest>

export type PeerLeft = Envelope<"peer.left", { peerId: string }>

/** Sent only to the peer that joined: which network it is, who is in it, and its latest messages, oldest first. */
export type PeerWelcomed = Envelope<
	"peer.welcomed",
	{ network: { id: string; name: string }; peers: PeerManifest[]; messages: Envelope[] }
>

/**
 * With `to`, the message went to that peer only. `senderName` is the sender's name when it sent the message,
 * kept with it so those who join after the sender has left still know who said it. Messages kept from
 * before names were sent with them have none.
 */
export type MessageSent = Envelope<"message.sent", { message: string; senderName?: string; to?: string }>
