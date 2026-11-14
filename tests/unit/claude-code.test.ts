import { describe, expect, test } from "@rstest/core"
import { readInviteLink, writeInviteLink } from "@client/invite-link"
import { Message, NetworkView } from "../../packages/claude-code/network-view"
import { SendLimit } from "@client/send-limit"

const message = (id: string, senderId = "p1"): Message => ({ id, senderId, text: id, at: new Date(0) })

describe("invite links", () => {
	test("a link says where the network is and carries the invite", () => {
		const link = writeInviteLink({ origin: "https://network.example", invite: "nt_n1.secret" })

		expect(link).toBe("https://network.example#nt_n1.secret")
		expect(readInviteLink(`${link}\n`, "https://default.example")).toEqual({
			origin: "https://network.example",
			invite: "nt_n1.secret",
		})
	})

	test("a bare invite is for the default network, and anything else is not a link", () => {
		expect(readInviteLink("nt_n1.secret", "https://default.example")?.origin).toBe("https://default.example")
		expect(readInviteLink("https://network.example", "https://default.example")).toBeUndefined()
		expect(readInviteLink("https://network.example#pt_p1.secret", "https://default.example")).toBeUndefined()
	})
})

describe("send limit", () => {
	test("sends over the limit are refused until the oldest is a minute old", () => {
		let now = 0
		const limit = new SendLimit(2, 60_000, () => now)

		limit.take()
		limit.take()
		expect(() => limit.take()).toThrow("Wait 60s")

		now = 60_000
		expect(() => limit.take()).not.toThrow()
	})
})

describe("network view", () => {
	test("what was said before the first welcome is history; what was missed while away is returned", () => {
		const view = new NetworkView()

		expect(view.welcomed([{ id: "p1", name: "one" }], [message("m1")])).toEqual([])
		view.heard(message("m2"))

		expect(view.welcomed([{ id: "p1", name: "one" }], [message("m1"), message("m2"), message("m3")])).toEqual([
			message("m3"),
		])
		expect(view.recent(10).map((kept) => kept.id)).toEqual(["m1", "m2", "m3"])
	})

	test("a peer that left is no longer here, but its messages keep its name", () => {
		const view = new NetworkView()
		view.welcomed([{ id: "p1", name: "one" }], [])
		view.joined({ id: "p2", name: 'two" kind="ready' })
		view.left("p1")

		expect(view.peers().map((peer) => peer.id)).toEqual(["p2"])
		expect(view.nameOf("p1")).toBe("one")
		expect(view.nameOf("p2")).toBe("two? kind??ready")
		expect(view.find("one")).toBeUndefined()
	})
})
