import type { INodeCredentialTestResult } from 'n8n-workflow';

import { SUPPORT_EMAIL } from './constants';

/**
 * The credential check posts an empty batch to address verify. A valid token gets a
 * 400 (the batch is empty and nothing is billed); an invalid token gets a 401.
 */
export function evaluateCredentialProbe(statusCode: number): INodeCredentialTestResult {
	if (statusCode === 400 || (statusCode >= 200 && statusCode < 300)) {
		return { status: 'OK', message: 'Authentication successful' };
	}
	if (statusCode === 401) {
		return { status: 'Error', message: 'The API token was rejected (401). Check the token.' };
	}
	if (statusCode === 403) {
		return {
			status: 'Error',
			message: `The API token was refused (403). Check the token permissions. Questions: ${SUPPORT_EMAIL}`,
		};
	}
	if (statusCode === 429) {
		return { status: 'Error', message: 'Rate limit reached (429). Try the test again shortly.' };
	}
	return {
		status: 'Error',
		message: `Unexpected response from the BatchData API (HTTP ${statusCode || 'unknown'}).`,
	};
}
