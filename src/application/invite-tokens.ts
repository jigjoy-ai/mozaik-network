import { issueToken, readToken } from "@application/secret-tokens"

/**
 * An invite is `nt_<network id>.<secret>`. Whoever holds it may make a peer for that one
 * network, on the account of the network's owner, without a key of their own.
 */
export function issueInvite(networkId: string): { invite: string; hash: string } {
	const { token, hash } = issueToken("nt", networkId)
	return { invite: token, hash }
}

export function readInvite(invite: unknown): { networkId: string; secret: string } | undefined {
	const parsed = readToken("nt", invite)
	return parsed && { networkId: parsed.id, secret: parsed.secret }
}
