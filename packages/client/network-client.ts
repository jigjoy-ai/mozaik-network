import { Peer } from "./peer/peer"
import { Connection } from "./connection"
import { BehaviorPolicy } from "./peer/behavior-policy"
import { RuleDefinition } from "./peer/rule"

export type Network = {
	id: string
}

export type CreateNetworkPayload = {
	name: string
}

export type BehaviorPolicyDefinition = {
	rules: RuleDefinition[]
}

export type CreatePeerPayload = {
	name: string
	capabilities: string[]
	networkId?: string
	role: "agent" | "user"
	policy: BehaviorPolicyDefinition
	/** In place of an API key: the peer is made for the invite's network, on its owner's account. */
	invite?: string
}

export type NetworkClientOptions = {
	/** Where the network is; NETWORK_ORIGIN by default. */
	origin?: string
	/** The Mozaik Cloud API key networks and peers are made with. A self-hosted network asks for none. */
	apiKey?: string
}

const origin = process.env.NETWORK_ORIGIN || "http://localhost:3000"

export class NetworkClient {
	private readonly httpOrigin: string
	private readonly wsUrl: string
	private readonly apiKey: string | undefined

	constructor(options: NetworkClientOptions = {}) {
		const resolved = this.resolveOrigins(options.origin ?? origin)
		this.httpOrigin = resolved.httpOrigin
		this.wsUrl = resolved.wsUrl
		this.apiKey = options.apiKey
	}

	private resolveOrigins(origin: string): { httpOrigin: string; wsUrl: string } {
		const trimmed = origin.replace(/\/$/, "")

		if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
			return {
				wsUrl: trimmed,
				httpOrigin: trimmed.replace(/^ws(s)?/, "http$1"),
			}
		}

		return {
			httpOrigin: trimmed,
			wsUrl: trimmed.replace(/^http(s)?/, "ws$1"),
		}
	}

	async createNetwork(payload: CreateNetworkPayload): Promise<Network> {
		return this.post<Network>("/networks", payload, this.apiKey)
	}

	/** An invite lets whoever holds it make peers in the network without an API key. It is shown only now. */
	async createInvite(networkId: string): Promise<string> {
		const response = await this.post<{ invite: string }>(`/networks/${networkId}/invites`, {}, this.apiKey)
		return response.invite
	}

	async createPeer(payload: CreatePeerPayload): Promise<Peer> {
		const { name, role, capabilities } = payload
		const response = await this.post<{ id: string; token: string; networkId?: string }>(
			"/peers",
			{ name, role, capabilities },
			payload.invite ?? this.apiKey,
		)

		const policy = BehaviorPolicy.create(payload.policy)
		return new Peer(
			response.id,
			{
				id: response.id,
				name: payload.name,
				capabilities: payload.capabilities,
			},
			policy,
			response.token,
			response.networkId,
		)
	}

	connection(peer: Peer): Connection {
		return new Connection(peer, this.wsUrl)
	}

	private async post<T>(path: string, body: unknown, credential?: string): Promise<T> {
		const response = await fetch(`${this.httpOrigin}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(credential ? { Authorization: `Bearer ${credential}` } : {}),
			},
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			const detail = await response.text()
			throw new Error(`POST ${path} failed (${response.status}): ${detail || response.statusText}`)
		}

		return response.json() as Promise<T>
	}
}
