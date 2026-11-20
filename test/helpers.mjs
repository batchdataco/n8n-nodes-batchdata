import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BatchData } from '../dist/nodes/BatchData/BatchData.node.js';

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
	return JSON.parse(readFileSync(join(here, 'fixtures', `${name}.json`), 'utf8'));
}

/**
 * Runs the node's execute() against a fake n8n context.
 * `params` is an array (one object per input item) of parameter values.
 * `responses` is an array of values or Error objects returned by the fake HTTP helper, in order.
 */
export async function runNode({ params, responses, continueOnFail = false }) {
	const calls = [];
	let n = 0;
	const items = params.map(() => ({ json: {} }));
	const context = {
		getInputData: () => items,
		getNode: () => ({
			id: 'test',
			name: 'BatchData',
			type: 'n8n-nodes-batchdata.batchData',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		continueOnFail: () => continueOnFail,
		getNodeParameter: (name, i, fallback) => {
			const value = params[i][name];
			if (value === undefined) {
				if (fallback !== undefined) return fallback;
				throw new Error(`Missing parameter in test: ${name}`);
			}
			return value;
		},
		helpers: {
			httpRequestWithAuthentication: async (credentialType, options) => {
				calls.push({ credentialType, ...options });
				const next = responses[n++];
				if (next instanceof Error) throw next;
				return next;
			},
		},
	};
	const output = await new BatchData().execute.call(context);
	return { output: output[0], calls };
}

export function httpError(status, body) {
	const error = new Error(`Request failed with status code ${status}`);
	error.httpCode = String(status);
	error.response = { status, data: body };
	return error;
}

const triggerNode = {
	id: 't',
	name: 'BatchData',
	type: 'x',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export function pollContext({ event, params = {}, mode = 'trigger', responses, staticData = {} }) {
	const calls = [];
	let n = 0;
	const context = {
		getNode: () => triggerNode,
		getMode: () => mode,
		getWorkflowStaticData: () => staticData,
		getNodeParameter: (name, fallback) => {
			if (name === 'event') return event;
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`Missing ${name}`);
		},
		helpers: {
			httpRequestWithAuthentication: async (credentialType, options) => {
				calls.push({ credentialType, ...options });
				return responses[n++];
			},
		},
	};
	return { context, calls, staticData };
}

export function hookContext({ params = {}, staticData = {}, responses = [], body = {} }) {
	const calls = [];
	let n = 0;
	const context = {
		getNode: () => triggerNode,
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc/batchdata-monitor',
		getBodyData: () => body,
		getNodeParameter: (name, fallback) => {
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`Missing ${name}`);
		},
		helpers: {
			httpRequestWithAuthentication: async (credentialType, options) => {
				calls.push({ credentialType, ...options });
				const next = responses[n++];
				if (next instanceof Error) throw next;
				return next;
			},
		},
	};
	return { context, calls, staticData };
}
