import { Envelope } from "./envelope"
import { Peer } from "./peer"
import { Frame, Refusal, WebSocketTransport } from "./websocket-transport"

/** How long the network is given to answer a join. */
const JOIN_TIMEOUT_MS = 10_000

export class Connection {
	private readonly transport: WebSocketTransport
	private joined = false
	private joining: { resolve: () => void; reject: (error: Error) => void } | undefined
	private pending = Promise.resolve()

	constructor(
		private readonly peer: Peer,
		wsUrl: string,
	) {
		this.transport = new WebSocketTransport(wsUrl, peer.id)
	}

	/** Resolves once the network has welcomed the peer, and fails with the network's answer if it refused. */
	async join(networkId: string): Promise<void> {
		if (!this.joined) {
			this.transport.onMessage((frame) => {
				// One at a time, in the order they came.
				this.pending = this.pending.then(() => this.receive(networkId, frame)).catch(console.error)
			})
			// A connection that dropped and came back has to join again: the network saw the peer leave.
			this.transport.onReconnect(() => this.sendJoin(networkId))
			this.joined = true
		}

		await this.transport.whenConnected()

		const welcomed = this.welcomed()
		this.sendJoin(networkId)

		try {
			await welcomed
		} catch (error) {
			// A connection that wasn't let in has nothing to stay open for.
			this.transport.close()
			throw error
		}
	}

	leave(networkId: string): void {
		this.transport.send(
			this.envelope(networkId, "peer.leave", {
				peerId: this.peer.id,
			}),
		)
		this.transport.close()
	}

	/** With `to`, the message goes to that peer only. */
	sendMessage(networkId: string, message: string, to?: string): void {
		this.transport.send({ ...this.envelope(networkId, "message.send", message), to })
	}

	private welcomed(): Promise<void> {
		let timeout: ReturnType<typeof setTimeout>

		return new Promise<void>((resolve, reject) => {
			this.joining = { resolve, reject }
			timeout = setTimeout(() => reject(new Error("The network didn't answer the join")), JOIN_TIMEOUT_MS)
		}).finally(() => {
			clearTimeout(timeout)
			this.joining = undefined
		})
	}

	private sendJoin(networkId: string): void {
		this.transport.send({
			...this.envelope(networkId, "peer.join", {
				peerId: this.peer.id,
			}),
			// Who the peer is comes from its token: the network believes nothing else.
			token: this.peer.token,
		})
	}

	private async receive(networkId: string, frame: Frame): Promise<void> {
		if (frame.type === "error" && this.joining) {
			this.joining.reject(new Error((frame as Refusal).message))
			return
		}

		const envelope =
			frame.type === "error" ? this.refused(networkId, frame as Refusal) : (frame as Envelope<unknown>)
		await this.peer.receive(envelope)

		if (envelope.type === "peer.welcomed") this.joining?.resolve()
	}

	/** What the network refused, as an envelope, so the peer's rules can react to it like to anything else. */
	private refused(networkId: string, refusal: Refusal): Envelope<{ code: string; message: string }> {
		return this.envelope(networkId, "error", { code: refusal.code, message: refusal.message })
	}

	private envelope<TPayload>(networkId: string, type: string, payload: TPayload): Envelope<TPayload> {
		return {
			type,
			payload,
			id: crypto.randomUUID(),
			networkId,
			senderId: this.peer.id,
			createdAt: new Date(),
		}
	}
}
