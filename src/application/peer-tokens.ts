import { issueToken, readToken } from "@application/secret-tokens"

export { secretMatches } from "@application/secret-tokens"

/**
 * A peer token is `pt_<peer id>.<secret>`. It is shown once, when the peer is created,
 * and is what the peer joins a network with.
 */
export function issuePeerToken(peerId: string): { token: string; hash: string } {
	return issueToken("pt", peerId)
}

export function readPeerToken(token: unknown): { peerId: string; secret: string } | undefined {
	const parsed = readToken("pt", token)
	return parsed && { peerId: parsed.id, secret: parsed.secret }
}
