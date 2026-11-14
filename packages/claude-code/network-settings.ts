import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { InviteLink } from "./invite-link"

/** The network this machine's sessions join: where it is, the invite that lets them in, and what it is called. */
export type SavedNetwork = InviteLink & { name?: string }

function defaultFile(): string {
	const stateDir =
		process.env.MOZAIK_NETWORK_STATE_DIR ??
		join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "channels", "mozaik-network")

	return join(stateDir, "network.json")
}

/** Keeps the network between sessions, so a new session joins without being given the invite again. */
export class NetworkSettings {
	constructor(private readonly file: string = defaultFile()) {}

	read(): SavedNetwork | undefined {
		try {
			const saved = JSON.parse(readFileSync(this.file, "utf8")) as Partial<SavedNetwork>
			return typeof saved.origin === "string" && typeof saved.invite === "string"
				? (saved as SavedNetwork)
				: undefined
		} catch {
			return undefined
		}
	}

	/** Only its owner can read the file: whoever holds the invite can join, on the network owner's account. */
	save(network: SavedNetwork): void {
		mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
		writeFileSync(this.file, JSON.stringify(network, null, "\t") + "\n", { mode: 0o600 })
	}

	forget(): void {
		rmSync(this.file, { force: true })
	}
}
