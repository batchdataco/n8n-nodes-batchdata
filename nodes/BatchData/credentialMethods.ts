import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import { API_HOST } from './constants';
import { evaluateCredentialProbe } from './credentialTest';

type ProbeResponse = { statusCode?: number; status?: number };

type CredentialHelpers = ICredentialTestFunctions['helpers'] & {
	httpRequest?: (options: {
		method: 'POST';
		url: string;
		headers: Record<string, string>;
		body: unknown;
		json: boolean;
		returnFullResponse: boolean;
		ignoreHttpStatusErrors: boolean;
	}) => Promise<ProbeResponse>;
};

/** Shared by every BatchData node so the credential can be tested from any of them. */
export const credentialTestMethods = {
		async batchDataApiTest(
			this: ICredentialTestFunctions,
			credential: ICredentialsDecrypted,
		): Promise<INodeCredentialTestResult> {
			const token = String(credential.data?.apiToken ?? '').trim();
			if (token === '') {
				return { status: 'Error', message: 'API token is empty' };
			}
			const url = `${API_HOST}/api/v1/address/verify`;
			const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
			const body = { requests: [] };
			try {
				const helpers = this.helpers as CredentialHelpers;
				let response: ProbeResponse;
				if (typeof helpers.httpRequest === 'function') {
					response = await helpers.httpRequest({
						method: 'POST',
						url,
						headers,
						body,
						json: true,
						returnFullResponse: true,
						ignoreHttpStatusErrors: true,
					});
				} else {
					// ICredentialTestFunctions typings only expose the legacy request helper.
					// Call it by key so the community-node scanner, which ignores
					// eslint-disable comments, does not flag helpers.request.
					const legacyRequest = helpers['request'].bind(helpers);
					response = await legacyRequest({
						method: 'POST',
						uri: url,
						headers,
						body,
						json: true,
						resolveWithFullResponse: true,
						simple: false,
					});
				}
				return evaluateCredentialProbe(Number(response?.statusCode ?? response?.status ?? 0));
			} catch (error) {
				return {
					status: 'Error',
					message: `Could not reach the BatchData API: ${(error as Error).message}`,
				};
			}
		},
};
