import { Envelope } from "./envelope"
import { PeerManifest } from "./peer-manifest"

export type PeerJoined = Envelope<"peer.joined", PeerManifest>

export type PeerLeft = Envelope<"peer.left", { peerId: string }>

/** Sent only to the peer that joined: who is in the network, and its latest messages, oldest first. */
export type PeerWelcomed = Envelope<"peer.welcomed", { peers: PeerManifest[]; messages: Envelope[] }>

/** With `to`, the message went to that peer only. */
export type MessageSent = Envelope<"message.sent", { message: string; to?: string }>
