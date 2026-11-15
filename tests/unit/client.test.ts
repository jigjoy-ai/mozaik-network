import { describe, expect, test } from "@rstest/core"
import { readInviteLink, writeInviteLink } from "@client/invite-link"
import { SendLimit } from "@client/send-limit"

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
