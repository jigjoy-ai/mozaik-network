import { describe, expect, test } from "@rstest/core"
import { Envelope } from "@domain/envelope"
import { EnvelopeFactory } from "@domain/envelope-factory"
import { Network } from "@domain/network"
import { Peer } from "@domain/peer"
import { StoredEnvelopeRepository } from "@infrastructure/stored-envelope-repository"
import { StoredNetworkRepository } from "@infrastructure/stored-network-repository"
import { StoredPeerRepository } from "@infrastructure/stored-peer-repository"
import { Item, MemoryTable } from "@infrastructure/table"

/** A table that also remembers what was written to it, and when each item may go. */
class WatchedTable extends MemoryTable {
	readonly writes: string[] = []
	readonly expiry = new Map<string, number | undefined>()

	async put(partition: string, sort: string, item: Item, expiresAt?: number): Promise<void> {
		this.writes.push(`${partition}/${sort}`)
		this.expiry.set(`${partition}/${sort}`, expiresAt)
		await super.put(partition, sort, item)
	}
}

const ana = { id: "peer-ana", name: "ana@api", role: "agent" as const }
const THIRTY_DAYS = 30 * 24 * 60 * 60

describe("stored networks", () => {
	test("a network is the same after a restart, with nobody in it", async () => {
		const table = new MemoryTable()
		const network = Network.create("team", "account-a")
		network.invite("hash-1")
		network.connect(ana)
		await new StoredNetworkRepository(table).save(network)

		// A new repository over the same table: the process after a restart.
		const found = await new StoredNetworkRepository(table).findById(network.getId())
		expect(found?.toRecord()).toEqual({
			id: network.getId(),
			name: "team",
			ownerId: "account-a",
			peerIds: [],
			inviteHashes: ["hash-1"],
		})
		expect(await new StoredNetworkRepository(table).findById("no-such-network")).toBeUndefined()
	})

	test("while the process lives a network is one object, with the peers connected to it", async () => {
		const networks = new StoredNetworkRepository(new MemoryTable())
		const network = Network.create("team", "account-a")
		await networks.save(network)
		network.connect(ana)

		expect(await networks.findById(network.getId())).toBe(network)
		expect((await networks.findById(network.getId()))?.getPeerIds()).toEqual(["peer-ana"])
	})

	test("peers coming and going write nothing; a new invite does", async () => {
		const table = new WatchedTable()
		const networks = new StoredNetworkRepository(table)
		const network = Network.create("team", "account-a")
		await networks.save(network)
		const afterCreating = table.writes.length

		network.connect(ana)
		await networks.save(network)
		network.disconnect("peer-ana")
		await networks.save(network)
		expect(table.writes.length).toBe(afterCreating)

		network.invite("hash-1")
		await networks.save(network)
		expect(table.writes.length).toBeGreaterThan(afterCreating)

		// A loaded network that only changes who is in it is not written again either.
		const reloaded = new StoredNetworkRepository(table)
		const found = (await reloaded.findById(network.getId()))!
		const afterLoading = table.writes.length
		found.connect(ana)
		await reloaded.save(found)
		expect(table.writes.length).toBe(afterLoading)
	})

	test("an account's networks are listed, and a deleted one is gone", async () => {
		const table = new MemoryTable()
		const networks = new StoredNetworkRepository(table)
		const first = Network.create("first", "account-a")
		const second = Network.create("second", "account-a")
		const theirs = Network.create("theirs", "account-b")
		for (const network of [first, second, theirs]) await networks.save(network)

		const names = async (ownerId: string) =>
			(await new StoredNetworkRepository(table).findByOwner(ownerId)).map((network) => network.getName()).sort()
		expect(await names("account-a")).toEqual(["first", "second"])
		expect(await names("account-b")).toEqual(["theirs"])
		expect(await names("account-c")).toEqual([])

		await networks.delete(first.getId())
		expect(await names("account-a")).toEqual(["second"])
		expect(await new StoredNetworkRepository(table).findById(first.getId())).toBeUndefined()
	})
})

describe("stored peers", () => {
	test("a peer's token still names it after a restart", async () => {
		const table = new WatchedTable()
		const now = Date.parse("2026-11-15T10:00:00Z")
		const peer = Peer.create(ana, "account-a", "token-hash", "network-1")
		await new StoredPeerRepository(table, () => now).save(peer)

		const found = await new StoredPeerRepository(table).findById("peer-ana")
		expect(found?.toRecord()).toEqual({
			manifest: ana,
			ownerId: "account-a",
			tokenHash: "token-hash",
			networkId: "network-1",
			inbox: [],
		})
		expect(table.expiry.get("peer#peer-ana/peer")).toBe(now / 1000 + THIRTY_DAYS)
		expect(await new StoredPeerRepository(table).findById("peer-nobody")).toBeUndefined()
	})

	test("a peer that may join any of its owner's networks is kept without a network", async () => {
		const table = new MemoryTable()
		await new StoredPeerRepository(table).save(Peer.create(ana, "account-a", "token-hash"))

		const found = await new StoredPeerRepository(table).findById("peer-ana")
		expect(found?.mayJoin("any-network")).toBe(true)
	})
})

describe("stored envelopes", () => {
	const said = (text: string, at: string, networkId = "network-1") =>
		new Envelope(crypto.randomUUID(), networkId, "message.sent", "peer-ana", new Date(at), { message: text })

	test("the latest messages come back oldest first, also after a restart", async () => {
		const table = new WatchedTable()
		const now = Date.parse("2026-11-15T10:00:00Z")
		const envelopes = new StoredEnvelopeRepository(table, () => now)
		// Saved out of order: they are kept by when they were said.
		await envelopes.save(said("second", "2026-11-15T09:00:02Z"))
		await envelopes.save(said("first", "2026-11-15T09:00:01Z"))
		await envelopes.save(said("third", "2026-11-15T09:00:03Z"))
		await envelopes.save(said("elsewhere", "2026-11-15T09:00:04Z", "network-2"))

		const texts = async (limit: number) =>
			(await new StoredEnvelopeRepository(table).findRecent("network-1", limit)).map(
				(envelope) => (envelope.getPayload() as { message: string }).message,
			)
		expect(await texts(2)).toEqual(["second", "third"])
		expect(await texts(20)).toEqual(["first", "second", "third"])
		expect(await texts(0)).toEqual([])
		expect([...table.expiry.values()].every((expiresAt) => expiresAt === now / 1000 + THIRTY_DAYS)).toBe(true)
	})

	test("an envelope is found by its id, and a network's are read a page at a time", async () => {
		const envelopes = new StoredEnvelopeRepository(new MemoryTable())
		const first = said("first", "2026-11-15T09:00:01Z")
		const second = said("second", "2026-11-15T09:00:02Z")
		const third = said("third", "2026-11-15T09:00:03Z")
		for (const envelope of [first, second, third]) await envelopes.save(envelope)

		const found = await envelopes.findById(second.getId())
		expect(found?.getId()).toBe(second.getId())
		expect(found?.getType()).toBe("message.sent")
		expect(found?.getSenderId()).toBe("peer-ana")
		expect(found?.getCreatedAt()).toEqual(new Date("2026-11-15T09:00:02Z"))
		expect(await envelopes.findById("no-such-envelope")).toBeUndefined()

		const page = await envelopes.findByNetworkId("network-1", { offset: 1, limit: 5 })
		expect(page.map((envelope) => envelope.getId())).toEqual([second.getId(), third.getId()])
	})

	test("a message still names its sender after a restart, though the sender has left", async () => {
		const table = new MemoryTable()
		await new StoredEnvelopeRepository(table).save(EnvelopeFactory.messageSent("network-1", ana, "hello"))

		const [found] = await new StoredEnvelopeRepository(table).findRecent("network-1", 20)
		expect(found.getSenderId()).toBe("peer-ana")
		expect(found.getPayload()).toEqual({ message: "hello", senderName: "ana@api" })
	})
})
