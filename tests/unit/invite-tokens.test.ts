import { describe, expect, test } from "@rstest/core"
import { issueInvite, readInvite } from "@application/invite-tokens"
import { readPeerToken, secretMatches } from "@application/peer-tokens"

describe("invites", () => {
	test("an invite names its network, and only its own secret matches the kept hash", () => {
		const { invite, hash } = issueInvite("network-1")
		const parsed = readInvite(invite)

		expect(parsed?.networkId).toBe("network-1")
		expect(secretMatches(parsed!.secret, hash)).toBe(true)
		expect(secretMatches("something-else", hash)).toBe(false)
	})

	test("an invite is not a peer token, nor a peer token an invite", () => {
		expect(readPeerToken(issueInvite("network-1").invite)).toBeUndefined()
		expect(readInvite("pt_peer-1.secret")).toBeUndefined()
	})
})
