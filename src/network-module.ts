import { ParticipantJoinUseCase } from "@application/paricipant-join"
import { InMemoryNetworkRepository } from "@infrastructure/in-memory-network-repository"
import { ParticipantLeaveUseCase } from "@application/participant-leave"
import { CreateNetworkUseCase } from "@application/create-network"
import { SendEnvelopeUseCase } from "@application/send-envelope"
import { NetworkRepository } from "@domain/network-repository"
import { Envelope } from "@domain/envelope"
import { WebSocketEnvelopeDelivery } from "@infrastructure/web-socket-envelope-delivery"

type NetworkModule = {
	networkRepository: NetworkRepository
	envelopeDelivery: WebSocketEnvelopeDelivery
}

type NetworkModuleConfig = {
	networkRepository?: NetworkRepository
	envelopeDelivery?: WebSocketEnvelopeDelivery
}

let module: NetworkModule | undefined

function initNetworkModule(config: NetworkModuleConfig = {}) {
	if (module) {
		throw new Error("Network module already initialized")
	}

	const networkRepository = config.networkRepository ?? new InMemoryNetworkRepository()
	const envelopeDelivery = config.envelopeDelivery ?? new WebSocketEnvelopeDelivery()

	module = {
		networkRepository,
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

const join = async (name: string, capabilities: readonly string[], networkId: string) => {
	const { networkRepository, envelopeDelivery } = resolveNetworkModule()
	const participantJoinUseCase = new ParticipantJoinUseCase(networkRepository, envelopeDelivery)
	return await participantJoinUseCase.execute(name, capabilities, networkId)
}

const leave = async (networkId: string, participantId: string) => {
	const { networkRepository, envelopeDelivery } = resolveNetworkModule()
	const participantLeaveUseCase = new ParticipantLeaveUseCase(networkRepository, envelopeDelivery)
	return await participantLeaveUseCase.execute(networkId, participantId)
}

const send = async (networkId: string, senderId: string, envelope: Envelope) => {
	const { networkRepository, envelopeDelivery } = resolveNetworkModule()
	const sendEnvelopeUseCase = new SendEnvelopeUseCase(networkRepository, envelopeDelivery)
	return await sendEnvelopeUseCase.execute(networkId, senderId, envelope)
}

export { createNetwork, join, leave, send, initNetworkModule }
