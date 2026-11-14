/**
 * Lets through a number of sends in a stretch of time and refuses the rest: two agents that
 * keep answering each other would otherwise run through the messages the network's owner pays for.
 */
export class SendLimit {
	private sentAt: number[] = []

	constructor(
		private readonly limit: number = 10,
		private readonly windowMs: number = 60_000,
		private readonly now: () => number = Date.now,
	) {}

	take(): void {
		const now = this.now()
		this.sentAt = this.sentAt.filter((at) => now - at < this.windowMs)

		if (this.sentAt.length >= this.limit) {
			const seconds = Math.ceil((this.windowMs - (now - this.sentAt[0])) / 1000)
			throw new Error(`Too many messages: ${this.limit} were sent in the last minute. Wait ${seconds}s.`)
		}

		this.sentAt.push(now)
	}
}
