import { Envelope } from "./envelope"

/** What the network answers with when it refuses something. */
export type Refusal = { type: "error"; code: string; message: string }

export type Frame = Envelope<unknown> | Refusal

/** What the network closes a connection with when a newer one of the same peer took its place. */
const REPLACED_CLOSE_CODE = 4001

/** How often the network is asked whether the connection still works, and how long its silence is taken before the connection is given up. */
const PING_INTERVAL_MS = 25_000
const SILENCE_LIMIT_MS = 60_000

/** How long to wait before each try to come back; the last one repeats. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 15_000, 30_000]

export class WebSocketTransport {
	private socket: WebSocket | null = null
	private connectedPromise: Promise<void> | null = null
	private readonly messageHandlers: ((frame: Frame) => void)[] = []
	private readonly reconnectHandlers: (() => void)[] = []
	private hasConnected = false
	private closed = false
	private failedTries = 0
	private heardAt = 0
	private heartbeat: ReturnType<typeof setInterval> | undefined
	private retry: ReturnType<typeof setTimeout> | undefined

	constructor(
		private readonly wsUrl: string,
		private readonly label: string,
	) {}

	whenConnected(): Promise<void> {
		if (this.socket?.readyState === WebSocket.OPEN) {
			return Promise.resolve()
		}

		if (!this.connectedPromise) {
			this.connectedPromise = this.open()
		}

		return this.connectedPromise
	}

	onMessage(handler: (frame: Frame) => void): void {
		this.messageHandlers.push(handler)
	}

	/** Called each time the connection is back after it dropped: what was said on the old one has to be said again. */
	onReconnect(handler: () => void): void {
		this.reconnectHandlers.push(handler)
	}

	send(frame: object): void {
		if (this.socket?.readyState !== WebSocket.OPEN) {
			throw new Error("Socket is not connected")
		}

		this.socket.send(JSON.stringify(frame))
	}

	/** Closes for good: a transport closed on purpose doesn't come back. */
	close(): void {
		this.closed = true
		clearTimeout(this.retry)
		clearInterval(this.heartbeat)
		this.socket?.close(1000)
	}

	private open(): Promise<void> {
		const socket = new WebSocket(this.wsUrl)
		this.socket = socket

		return new Promise((resolve, reject) => {
			socket.addEventListener("open", () => {
				this.hasConnected = true
				this.failedTries = 0
				this.watch(socket)
				resolve()
			})

			socket.addEventListener("message", (event) => {
				this.heardAt = Date.now()
				const frame = JSON.parse(event.data) as Frame | { type: "pong" }
				if (frame.type === "pong") return

				for (const handler of this.messageHandlers) handler(frame as Frame)
			})

			socket.addEventListener("close", (event) => {
				// A socket that was given up on closes late: by then it is no longer this transport's.
				if (this.socket !== socket) return

				reject(new Error("WebSocket connection failed"))
				this.dropped(event.code)
			})

			socket.addEventListener("error", () => {
				console.error(`WebSocket error (${this.label})`)
			})
		})
	}

	/** Pings the network, and gives the socket up when nothing has been heard from it for too long. */
	private watch(socket: WebSocket): void {
		this.heardAt = Date.now()

		this.heartbeat = setInterval(() => {
			if (Date.now() - this.heardAt > SILENCE_LIMIT_MS) {
				socket.close()
				this.dropped()
				return
			}

			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }))
		}, PING_INTERVAL_MS)
	}

	/**
	 * A transport that has been connected comes back by itself; one that never got through has
	 * already said so. Neither does when it was closed on purpose or the peer's place was taken.
	 */
	private dropped(closeCode?: number): void {
		clearInterval(this.heartbeat)
		this.socket = null
		this.connectedPromise = null

		if (this.closed || closeCode === REPLACED_CLOSE_CODE || !this.hasConnected) return

		const delay = RECONNECT_DELAYS_MS[Math.min(this.failedTries, RECONNECT_DELAYS_MS.length - 1)]
		this.failedTries += 1

		this.retry = setTimeout(() => {
			this.connectedPromise = this.open()
			this.connectedPromise.then(
				() => this.reconnectHandlers.forEach((handler) => handler()),
				() => {},
			)
		}, delay)
	}
}
