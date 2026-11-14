import { Peer } from "../peer/peer"
import { ConnectionRegistry } from "../connection-registry"
import { NetworkClient } from "../network-client"

export class JoinNetworkUseCase {
	constructor(
		private readonly connectionRegistry: ConnectionRegistry,
		private readonly networkClient: NetworkClient,
	) {}

	async execute(peer: Peer, networkId: string): Promise<void> {
		const connection = this.networkClient.connection(peer)
		await connection.join(networkId)
		this.connectionRegistry.register(peer.id, connection)
	}
}
