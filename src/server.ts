import { createApp } from "src/app"
import { initNetworkModule } from "src/network-module"
import { MozaikCloudAccounts, MozaikCloudMetering } from "@infrastructure/mozaik-cloud-access"
import { DynamoTable } from "@infrastructure/dynamo-table"
import { StoredNetworkRepository } from "@infrastructure/stored-network-repository"
import { StoredPeerRepository } from "@infrastructure/stored-peer-repository"
import { StoredEnvelopeRepository } from "@infrastructure/stored-envelope-repository"

const PORT = Number(process.env.PORT ?? 3000)

// Hosted: MOZAIK_CLOUD_URL (and the service token it trusts) make keys required and messages
// counted against each account. Without it, self-hosted: no keys, nothing counted.
const cloudUrl = process.env.MOZAIK_CLOUD_URL?.replace(/\/+$/, "")
const serviceToken = process.env.NETWORK_SERVICE_TOKEN

if (cloudUrl && !serviceToken) {
	console.error("MOZAIK_CLOUD_URL is set but NETWORK_SERVICE_TOKEN isn't: usage can't be reported")
	process.exit(1)
}

const metering = cloudUrl && serviceToken ? new MozaikCloudMetering(cloudUrl, serviceToken) : undefined

// NETWORK_TABLE names the DynamoDB table networks, peers and messages are kept in. Without it
// they live in this process's memory, and are gone when it stops.
const table = process.env.NETWORK_TABLE ? new DynamoTable(process.env.NETWORK_TABLE) : undefined
const stored = table
	? {
			networkRepository: new StoredNetworkRepository(table),
			peerRepository: new StoredPeerRepository(table),
			envelopeRepository: new StoredEnvelopeRepository(table),
		}
	: {}

initNetworkModule({
	...stored,
	...(cloudUrl ? { accounts: new MozaikCloudAccounts(cloudUrl, { serviceToken }), metering } : {}),
})

const server = createApp().listen(PORT, () => {
	console.log(
		`HTTP and WebSocket listening on port ${PORT}${cloudUrl ? `, billing through ${cloudUrl}` : ", self-hosted"}${table ? ", kept in a table" : ", kept in memory"}`,
	)
})

// A deploy stops the task with SIGTERM: report what was counted before going.
process.once("SIGTERM", () => {
	server.close()
	void (metering?.flush() ?? Promise.resolve())
		.catch((error) => console.error("Final usage report failed", error))
		.finally(() => process.exit(0))
})
