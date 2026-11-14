import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const MOZAIK_CLOUD_ENDPOINT = "https://api.app.jigjoy.ai"

/**
 * The Mozaik Cloud API key networks are made with on the hosted network: MOZAIK_API_KEY,
 * or the one `npx @mozaik-ai/cloud-sdk pair` saved. A self-hosted network asks for none.
 */
export function mozaikCloudKey(): string | undefined {
	if (process.env.MOZAIK_API_KEY) return process.env.MOZAIK_API_KEY

	const file = process.env.MOZAIK_CREDENTIALS_FILE ?? join(homedir(), ".mozaik", "credentials.json")
	const endpoint = (process.env.MOZAIK_CLOUD_ENDPOINT ?? MOZAIK_CLOUD_ENDPOINT).replace(/\/$/, "")

	try {
		const paired = JSON.parse(readFileSync(file, "utf8")) as Record<string, { projectKey?: unknown }>
		const key = paired[endpoint]?.projectKey
		return typeof key === "string" ? key : undefined
	} catch {
		return undefined
	}
}
