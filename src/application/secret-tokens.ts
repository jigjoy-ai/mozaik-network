import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * A token is `<prefix>_<id>.<secret>`: the id says what it is for, the secret proves it.
 * Only the secret's hash is kept, so a token is shown once, when it is issued.
 */
export function issueToken(prefix: string, id: string): { token: string; hash: string } {
	const secret = randomBytes(32).toString("base64url")
	return { token: `${prefix}_${id}.${secret}`, hash: hashSecret(secret) }
}

export function readToken(prefix: string, token: unknown): { id: string; secret: string } | undefined {
	if (typeof token !== "string" || !token.startsWith(`${prefix}_`)) return undefined
	const dot = token.indexOf(".")
	if (dot < 0) return undefined
	const id = token.slice(prefix.length + 1, dot)
	const secret = token.slice(dot + 1)
	return id && secret ? { id, secret } : undefined
}

export function secretMatches(secret: string, hash: string): boolean {
	const given = Buffer.from(hashSecret(secret), "hex")
	const kept = Buffer.from(hash, "hex")
	return given.length === kept.length && timingSafeEqual(given, kept)
}

function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex")
}
