import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import { API_HOST } from './constants';
import { evaluateCredentialProbe } from './credentialTest';

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
			try {
				// ICredentialTestFunctions only exposes the legacy `request` helper (no `httpRequest`).
				// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
				const response = await this.helpers.request({
					method: 'POST',
					uri: `${API_HOST}/api/v1/address/verify`,
					headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
					body: { requests: [] },
					json: true,
					resolveWithFullResponse: true,
					simple: false,
				});
				return evaluateCredentialProbe(Number(response?.statusCode));
			} catch (error) {
				return {
					status: 'Error',
					message: `Could not reach the BatchData API: ${(error as Error).message}`,
				};
			}
		},
};
