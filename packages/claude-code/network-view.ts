export type PeerInfo = { id: string; name: string; role?: string }

export type Message = { id: string; senderId: string; text: string; to?: string; at: Date }

/** How many of the latest messages are kept. */
const KEPT_MESSAGES = 200

/** What this session knows of the network: who is in it and what was said lately. */
export class NetworkView {
	/** Everyone seen so far, also those who left: their messages keep a name. */
	private readonly known = new Map<string, PeerInfo>()
	private present = new Set<string>()
	private messages: Message[] = []
	private welcomedBefore = false

	/**
	 * Takes in who is here and what was said lately. Returns the messages that were sent while
	 * this session was away: none the first time, when everything said before is only history.
	 */
	welcomed(peers: PeerInfo[], messages: Message[]): Message[] {
		this.present = new Set(peers.map((peer) => peer.id))
		for (const peer of peers) this.known.set(peer.id, peer)

		const missed = messages.filter((message) => !this.messages.some((kept) => kept.id === message.id))
		for (const message of missed) this.heard(message)

		const wasAway = this.welcomedBefore
		this.welcomedBefore = true
		return wasAway ? missed : []
	}

	joined(peer: PeerInfo): void {
		this.known.set(peer.id, peer)
		this.present.add(peer.id)
	}

	left(peerId: string): void {
		this.present.delete(peerId)
	}

	heard(message: Message): void {
		this.messages.push(message)
		if (this.messages.length > KEPT_MESSAGES) this.messages.shift()
	}

	clear(): void {
		this.known.clear()
		this.present.clear()
		this.messages = []
		this.welcomedBefore = false
	}

	peers(): PeerInfo[] {
		return [...this.present].map((id) => this.known.get(id)!)
	}

	recent(limit: number): Message[] {
		return limit > 0 ? this.messages.slice(-limit) : []
	}

	/** A name is what its peer chose to be called: it is shown without anything that could pass for markup. */
	nameOf(peerId: string): string {
		const name = this.known.get(peerId)?.name ?? `unknown-${peerId.slice(0, 8)}`
		return name.replace(/[^\w@.\- ]/g, "?").slice(0, 64)
	}

	/** A peer that is here, by its id or by the name it is shown under. */
	find(idOrName: string): PeerInfo | undefined {
		return this.peers().find((peer) => peer.id === idOrName || this.nameOf(peer.id) === idOrName)
	}
}
