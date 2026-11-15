/** Says which account a credential stands for. Networks and peers belong to the account that created them. */
export interface Accounts {
	/**
	 * The account an API key belongs to. `actingFor` names an account outright: only the service
	 * that knows the accounts may do that (Mozaik Cloud, for someone signed in to it), with its own secret.
	 */
	accountFor(credential: string | undefined, actingFor?: string): Promise<string | undefined>
}
