import { ConnectParticipantUseCase } from "@application/connect-participant"
import { InMemoryNetworkRepository } from "@infrastructure/in-memory-network-repository"
import { DisconnectParticipantUseCase } from "@application/disconnect-participant"
import { CreateNetworkUseCase } from "@application/create-network"
import { CreateParticipantUseCase } from "@application/create-participant"
import { ParticipantRole } from "@domain/participant-role"
import { SendEnvelopeUseCase } from "@application/send-envelope"
import { EnvelopeDistribution } from "@application/services/envelope-distribution"
import { NetworkRepository } from "@domain/network-repository"
import { WebSocketEnvelopeDelivery } from "@infrastructure/web-socket-envelope-delivery"
import { ParticipantRepository } from "@domain/participant-repository"
import { EnvelopeRepository } from "@domain/envelope-repositories"
import { InMemoryEnvelopeRepository } from "@infrastructure/in-memory-envelope-repository"
import { InMemoryParticipantRepository } from "@infrastructure/in-memory-participant-repository"
import { ParticipantJoined, ParticipantLeft } from "@domain/built-in-envelopers"

type NetworkModule = {
	networkRepository: NetworkRepository
	participantRepository: ParticipantRepository
	envelopeRepository: EnvelopeRepository
	envelopeDelivery: WebSocketEnvelopeDelivery
}

type NetworkModuleConfig = {
	networkRepository?: NetworkRepository
	participantRepository?: ParticipantRepository
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
	const participantRepository = config.participantRepository ?? new InMemoryParticipantRepository()
	const envelopeRepository = config.envelopeRepository ?? new InMemoryEnvelopeRepository()

	module = {
		networkRepository,
		participantRepository,
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

const createParticipant = async (name: string, role: ParticipantRole, capabilities: readonly string[] = []) => {
	const { participantRepository } = resolveNetworkModule()
	const createParticipantUseCase = new CreateParticipantUseCase(participantRepository)
	return await createParticipantUseCase.execute(name, role, capabilities)
}

function createEnvelopeDistribution(): EnvelopeDistribution {
	const { envelopeDelivery } = resolveNetworkModule()
	return new EnvelopeDistribution(envelopeDelivery)
}

const connect = async (networkId: string, participantId: string): Promise<ParticipantJoined> => {
	const { networkRepository, participantRepository } = resolveNetworkModule()
	const participantJoinUseCase = new ConnectParticipantUseCase(
		networkRepository,
		participantRepository,
		createEnvelopeDistribution(),
	)
	return await participantJoinUseCase.execute(networkId, participantId)
}

const disconnect = async (networkId: string, participantId: string): Promise<ParticipantLeft> => {
	const { networkRepository } = resolveNetworkModule()
	const participantLeaveUseCase = new DisconnectParticipantUseCase(networkRepository, createEnvelopeDistribution())
	return await participantLeaveUseCase.execute(networkId, participantId)
}

const send = async (networkId: string, senderId: string, message: string) => {
	const { networkRepository } = resolveNetworkModule()
	const sendEnvelopeUseCase = new SendEnvelopeUseCase(networkRepository, createEnvelopeDistribution())
	return await sendEnvelopeUseCase.execute(networkId, senderId, message)
}

export { createNetwork, createParticipant, connect, disconnect, send, initNetworkModule }
