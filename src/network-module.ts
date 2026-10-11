import { ConnectPeerUseCase } from "@application/connect-peer"
import { DisconnectPeerUseCase } from "@application/disconnect-peer"
import { CreatePeerUseCase } from "@application/create-peer"
import { InMemoryNetworkRepository } from "@infrastructure/in-memory-network-repository"
import { CreateNetworkUseCase } from "@application/create-network"
import { PeerRole } from "@domain/peer-role"
import { SendEnvelopeUseCase } from "@application/send-envelope"
import { EnvelopeDistribution } from "@application/services/envelope-distribution"
import { NetworkRepository } from "@domain/network-repository"
import { WebSocketEnvelopeDelivery } from "@infrastructure/web-socket-envelope-delivery"
import { PeerRepository } from "@domain/peer-repository"
import { EnvelopeRepository } from "@domain/envelope-repositories"
import { InMemoryEnvelopeRepository } from "@infrastructure/in-memory-envelope-repository"
import { InMemoryPeerRepository } from "@infrastructure/in-memory-peer-repository"
import { PeerJoined, PeerLeft } from "@domain/built-in-envelopers"

type NetworkModule = {
	networkRepository: NetworkRepository
	peerRepository: PeerRepository
	envelopeRepository: EnvelopeRepository
	envelopeDelivery: WebSocketEnvelopeDelivery
}

type NetworkModuleConfig = {
	networkRepository?: NetworkRepository
	peerRepository?: PeerRepository
	envelopeRepository?: EnvelopeRepository
	envelopeDelivery?: WebSocketEnvelopeDelivery
}

let module: NetworkModule | undefined

function initNetworkModule(config: NetworkModuleConfig = {}) {
	if (module) {
		throw new Error("Network module already initialized")
	}

	const networkRepository = config.networkRepository ?? new InMemoryNetworkRepository()
	const envelopeDelivery = config.envelopeDelivery ?? new WebSocketEnvelopeDelivery()
	const peerRepository = config.peerRepository ?? new InMemoryPeerRepository()
	const envelopeRepository = config.envelopeRepository ?? new InMemoryEnvelopeRepository()

	module = {
		networkRepository,
		peerRepository,
		envelopeRepository,
		envelopeDelivery,
	}
}

export function resolveNetworkModule(): NetworkModule {
	if (!module) {
		throw new Error("Network module is not initialized")
	}

	return module
}

const createNetwork = async (name: string) => {
	const { networkRepository } = resolveNetworkModule()
	const createNetworkUseCase = new CreateNetworkUseCase(networkRepository)
	return await createNetworkUseCase.execute(name)
}

const createPeer = async (name: string, role: PeerRole, capabilities: readonly string[] = []) => {
	const { peerRepository } = resolveNetworkModule()
	const createPeerUseCase = new CreatePeerUseCase(peerRepository)
	return await createPeerUseCase.execute(name, role, capabilities)
}

function createEnvelopeDistribution(): EnvelopeDistribution {
	const { envelopeDelivery } = resolveNetworkModule()
	return new EnvelopeDistribution(envelopeDelivery)
}

const connect = async (networkId: string, peerId: string): Promise<PeerJoined> => {
	const { networkRepository, peerRepository } = resolveNetworkModule()
	const connectPeerUseCase = new ConnectPeerUseCase(networkRepository, peerRepository, createEnvelopeDistribution())
	return await connectPeerUseCase.execute(networkId, peerId)
}

const disconnect = async (networkId: string, peerId: string): Promise<PeerLeft> => {
	const { networkRepository } = resolveNetworkModule()
	const disconnectPeerUseCase = new DisconnectPeerUseCase(networkRepository, createEnvelopeDistribution())
	return await disconnectPeerUseCase.execute(networkId, peerId)
}

const send = async (networkId: string, senderId: string, message: string) => {
	const { networkRepository } = resolveNetworkModule()
	const sendEnvelopeUseCase = new SendEnvelopeUseCase(networkRepository, createEnvelopeDistribution())
	return await sendEnvelopeUseCase.execute(networkId, senderId, message)
}

export { createNetwork, createPeer, connect, disconnect, send, initNetworkModule }
