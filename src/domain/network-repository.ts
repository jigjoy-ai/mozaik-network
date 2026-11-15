import { Network } from "@domain/network"

export interface NetworkRepository {
	save(network: Network): Promise<void>
	delete(id: string): Promise<void>
	findById(id: string): Promise<Network | undefined>
	/** The networks that belong to an account. */
	findByOwner(ownerId: string): Promise<Network[]>
}
