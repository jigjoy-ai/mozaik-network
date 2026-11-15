import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { Item, Table } from "@infrastructure/table"

/**
 * A DynamoDB table with the keys `pk` and `sk`, and `expiresAt` as its time-to-live attribute.
 * The item is kept whole under `item`, so its own fields never meet the table's.
 */
export class DynamoTable implements Table {
	private readonly documents: DynamoDBDocumentClient

	constructor(
		private readonly name: string,
		client: DynamoDBClient = new DynamoDBClient({}),
	) {
		this.documents = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })
	}

	async get(partition: string, sort: string): Promise<Item | undefined> {
		const found = await this.documents.send(
			new GetCommand({ TableName: this.name, Key: { pk: partition, sk: sort } }),
		)
		return found.Item?.item as Item | undefined
	}

	async put(partition: string, sort: string, item: Item, expiresAt?: number): Promise<void> {
		await this.documents.send(
			new PutCommand({ TableName: this.name, Item: { pk: partition, sk: sort, item, expiresAt } }),
		)
	}

	async delete(partition: string, sort: string): Promise<void> {
		await this.documents.send(new DeleteCommand({ TableName: this.name, Key: { pk: partition, sk: sort } }))
	}

	async query(partition: string, options: { limit?: number; backwards?: boolean } = {}): Promise<Item[]> {
		const items: Item[] = []
		let from: Record<string, unknown> | undefined

		do {
			const page = await this.documents.send(
				new QueryCommand({
					TableName: this.name,
					KeyConditionExpression: "pk = :partition",
					ExpressionAttributeValues: { ":partition": partition },
					ScanIndexForward: !options.backwards,
					Limit: options.limit === undefined ? undefined : options.limit - items.length,
					ExclusiveStartKey: from,
				}),
			)
			items.push(...(page.Items ?? []).map((stored) => stored.item as Item))
			from = page.LastEvaluatedKey
		} while (from && (options.limit === undefined || items.length < options.limit))

		return items
	}
}
