import { JoinNetworkUseCase } from "./use-cases/join"
import { ConnectionRegistry } from "./connection-registry"
import { Peer } from "./peer"
import { LeaveNetworkUseCase } from "./use-cases/leave"
import { SendMessageUseCase } from "./use-cases/send-message"
import { NetworkClient } from "./network-client"

const connectionRegistry = new ConnectionRegistry()

/** Joins on the network the client talks to: the one NETWORK_ORIGIN names, unless another client is given. */
export async function join(peer: Peer, networkId: string, client: NetworkClient = new NetworkClient()): Promise<void> {
	const useCase = new JoinNetworkUseCase(connectionRegistry, client)
	return await useCase.execute(peer, networkId)
}

export async function leave(peer: Peer, networkId: string): Promise<void> {
	const useCase = new LeaveNetworkUseCase(connectionRegistry)
	return await useCase.execute(peer, networkId)
}

/** With `to`, the message goes to that peer only. */
export function sendMessage(peer: Peer, networkId: string, message: string, to?: string): Promise<void> {
	const useCase = new SendMessageUseCase(connectionRegistry)
	return useCase.execute(peer, networkId, message, to)
}
