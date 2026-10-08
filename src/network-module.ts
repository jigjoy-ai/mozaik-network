import { ParticipantJoinUseCase } from "@application/paricipant-join"
import { InMemoryNetworkRepository } from "@infrastructure/in-memory-network-repository"
import { ParticipantLeaveUseCase } from "@application/participant-leave"
import { CreateNetworkUseCase } from "@application/create-network"
import { SendEnvelopeUseCase } from "@application/send-envelope"
import { NetworkRepository } from "@domain/network-repository"
import { Envelope } from "@domain/envelope"
import { SituationSpecification } from "./domain/situation-specification"

type NetworkModule = {
	networkRepository: NetworkRepository
	//eventPublisher: EventPublisher
}

type NetworkModuleConfig = {
	networkRepository?: NetworkRepository
	//eventPublisher?: EventPublisher
}

let module: NetworkModule | undefined

function initNetworkModule(config: NetworkModuleConfig = {}) {
	if (module) {
		throw new Error("Space module already initialized")
	}

	const networkRepository = config.networkRepository ?? new InMemoryNetworkRepository()
	//const eventPublisher = config.eventPublisher ?? new EventPublisher()

	module = {
		networkRepository,
		//eventPublisher,
	}
}

export function resolveNetworkModule(): NetworkModule {
	if (!module) {
		throw new Error("Space module is not initialized")
	}

	return module
}

const createSpace = async (name: string) => {
	const { networkRepository } = resolveNetworkModule()
	const createNetworkUseCase = new CreateNetworkUseCase(networkRepository)
	return await createNetworkUseCase.execute(name)
}

const join = async <TParticipant>(
	name: string,
	capabilities: readonly string[],
	handlers: SituationSpecification[],
	spaceId: string,
) => {
	const { networkRepository } = resolveNetworkModule()
	const participantJoinUseCase = new ParticipantJoinUseCase(networkRepository)
	return await participantJoinUseCase.execute(name, capabilities, handlers, spaceId)
}

const leave = async (networkId: string, participantId: string) => {
	const { networkRepository } = resolveNetworkModule()
	const participantLeaveUseCase = new ParticipantLeaveUseCase(networkRepository)
	return await participantLeaveUseCase.execute(networkId, participantId)
}

const sendEnvelope = async (networkId: string, senderId: string, envelope: Envelope) => {
	const { networkRepository } = resolveNetworkModule()
	const sendEnvelopeUseCase = new SendEnvelopeUseCase(networkRepository)
	return await sendEnvelopeUseCase.execute(networkId, senderId, envelope)
}

export { createSpace, join, leave, sendEnvelope, initNetworkModule }
