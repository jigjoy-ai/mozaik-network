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
import { PeerLeft, PeerWelcomed } from "@domain/built-in-envelopers"
import { Accounts } from "@domain/accounts"
import { Metering } from "@domain/metering"
import { Peer } from "@domain/peer"
import { Network } from "@domain/network"
import { CreateInviteUseCase } from "@application/create-invite"
import { RevokeInvitesUseCase } from "@application/revoke-invites"
import { AcceptInviteUseCase } from "@application/accept-invite"
import { OpenAccounts, Unmetered } from "@infrastructure/open-access"

type NetworkModule = {
	networkRepository: NetworkRepository
	peerRepository: PeerRepository
	envelopeRepository: EnvelopeRepository
	envelopeDelivery: WebSocketEnvelopeDelivery
	accounts: Accounts
	metering: Metering
}

type NetworkModuleConfig = Partial<NetworkModule>

let module: NetworkModule | undefined

function initNetworkModule(config: NetworkModuleConfig = {}) {
	if (module) {
		throw new Error("Network module already initialized")
	}

	module = {
		networkRepository: config.networkRepository ?? new InMemoryNetworkRepository(),
		peerRepository: config.peerRepository ?? new InMemoryPeerRepository(),
		envelopeRepository: config.envelopeRepository ?? new InMemoryEnvelopeRepository(),
		envelopeDelivery: config.envelopeDelivery ?? new WebSocketEnvelopeDelivery(),
		// Self-hosted by default: no keys, nothing counted.
		accounts: config.accounts ?? new OpenAccounts(),
		metering: config.metering ?? new Unmetered(),
	}
}

export function resolveNetworkModule(): NetworkModule {
	if (!module) {
		throw new Error("Network module is not initialized")
	}

	return module
}

const accountFor = async (apiKey: string | undefined): Promise<string | undefined> => {
	return await resolveNetworkModule().accounts.accountFor(apiKey)
}

const createNetwork = async (name: string, ownerId: string) => {
	const { networkRepository } = resolveNetworkModule()
	const createNetworkUseCase = new CreateNetworkUseCase(networkRepository)
	return await createNetworkUseCase.execute(name, ownerId)
}

const createInvite = async (networkId: string, ownerId: string): Promise<string> => {
	const { networkRepository } = resolveNetworkModule()
	const createInviteUseCase = new CreateInviteUseCase(networkRepository)
	return await createInviteUseCase.execute(networkId, ownerId)
}

const revokeInvites = async (networkId: string, ownerId: string): Promise<void> => {
	const { networkRepository } = resolveNetworkModule()
	const revokeInvitesUseCase = new RevokeInvitesUseCase(networkRepository)
	return await revokeInvitesUseCase.execute(networkId, ownerId)
}

const acceptInvite = async (invite: unknown): Promise<Network> => {
	const { networkRepository } = resolveNetworkModule()
	const acceptInviteUseCase = new AcceptInviteUseCase(networkRepository)
	return await acceptInviteUseCase.execute(invite)
}

const createPeer = async (
	name: string,
	role: PeerRole,
	capabilities: readonly string[],
	ownerId: string,
	networkId?: string,
) => {
	const { peerRepository } = resolveNetworkModule()
	const createPeerUseCase = new CreatePeerUseCase(peerRepository)
	return await createPeerUseCase.execute(name, role, capabilities, ownerId, networkId)
}

function createEnvelopeDistribution(): EnvelopeDistribution {
	const { envelopeDelivery } = resolveNetworkModule()
	return new EnvelopeDistribution(envelopeDelivery)
}

function createConnectPeerUseCase(): ConnectPeerUseCase {
	const { networkRepository, peerRepository, envelopeRepository } = resolveNetworkModule()
	return new ConnectPeerUseCase(networkRepository, peerRepository, envelopeRepository, createEnvelopeDistribution())
}

const identify = async (token: unknown): Promise<Peer> => {
	return await createConnectPeerUseCase().identify(token)
}

const connect = async (networkId: string, peer: Peer): Promise<PeerWelcomed> => {
	return await createConnectPeerUseCase().execute(networkId, peer)
}

const disconnect = async (networkId: string, peerId: string): Promise<PeerLeft> => {
	const { networkRepository } = resolveNetworkModule()
	const disconnectPeerUseCase = new DisconnectPeerUseCase(networkRepository, createEnvelopeDistribution())
	return await disconnectPeerUseCase.execute(networkId, peerId)
}

const send = async (networkId: string, senderId: string, message: string, recipientId?: string) => {
	const { networkRepository, envelopeRepository, metering } = resolveNetworkModule()
	const sendEnvelopeUseCase = new SendEnvelopeUseCase(
		networkRepository,
		envelopeRepository,
		createEnvelopeDistribution(),
		metering,
	)
	return await sendEnvelopeUseCase.execute(networkId, senderId, message, recipientId)
}

export {
	accountFor,
	createNetwork,
	createInvite,
	revokeInvites,
	acceptInvite,
	createPeer,
	identify,
	connect,
	disconnect,
	send,
	initNetworkModule,
}
