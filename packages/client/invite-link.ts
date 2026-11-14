export type InviteLink = { origin: string; invite: string }

/** The network JigJoy hosts: where a bare invite is for when nothing else is said. */
export const HOSTED_NETWORK = "https://network.app.jigjoy.ai"

/** An invite link is `<network origin>#<invite>`: one string says where the network is and lets its holder in. */
export function writeInviteLink({ origin, invite }: InviteLink): string {
	return `${origin}#${invite}`
}

/** A bare invite, without an origin, is for the network at `defaultOrigin`. */
export function readInviteLink(link: string, defaultOrigin: string): InviteLink | undefined {
	const [before, after] = link.trim().split("#")
	const origin = after === undefined ? defaultOrigin : before.replace(/\/+$/, "")
	const invite = after ?? before

	return origin && invite.startsWith("nt_") ? { origin, invite } : undefined
}
