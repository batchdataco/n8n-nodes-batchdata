import type {
	INode,
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IPollFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { catalog } from './catalogProperties';
import { checkApiRequest } from './catalogEngine';
import { API_HOST, FORBIDDEN_BODY_KEYS, SUPPORT_EMAIL } from './constants';

export function isPlainObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge where `override` wins on conflict. Arrays are replaced, not concatenated. */
export function deepMerge(base: IDataObject, override: IDataObject): IDataObject {
	const result: IDataObject = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const existing = result[key];
		if (isPlainObject(existing) && isPlainObject(value)) {
			result[key] = deepMerge(existing, value);
		} else {
			result[key] = value;
		}
	}
	return result;
}

/** Remove callback keys (webhookUrl, errorWebhookUrl) at any depth. */
export function stripForbiddenKeys<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((entry) => stripForbiddenKeys(entry)) as unknown as T;
	}
	if (isPlainObject(value)) {
		const out: IDataObject = {};
		for (const [key, entry] of Object.entries(value)) {
			if (FORBIDDEN_BODY_KEYS.some((forbidden) => forbidden.toLowerCase() === key.toLowerCase())) continue;
			out[key] = stripForbiddenKeys(entry);
		}
		return out as unknown as T;
	}
	return value;
}

export function removeEmpty(value: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined || entry === null || entry === '') continue;
		if (isPlainObject(entry)) {
			const nested = removeEmpty(entry);
			if (Object.keys(nested).length === 0) continue;
			out[key] = nested;
			continue;
		}
		out[key] = entry;
	}
	return out;
}

export function parseJsonObject(raw: unknown, label: string, node: INode): IDataObject {
	if (raw === undefined || raw === null || raw === '') return {};
	if (isPlainObject(raw)) return raw;
	let parsed: unknown = undefined;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new NodeOperationError(node, `${label} is not valid JSON`);
		}
	}
	if (!isPlainObject(parsed)) {
		throw new NodeOperationError(node, `${label} must be a JSON object`);
	}
	return parsed;
}

export function splitPhoneNumbers(raw: unknown): string[] {
	const text = Array.isArray(raw) ? raw.join(',') : String(raw ?? '');
	return text
		.split(/[\s,;]+/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

export function toDateOnly(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const text = String(value);
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	if (!match) {
		throw new Error(`"${text}" is not a valid date. Use YYYY-MM-DD.`);
	}
	return match[1];
}

/**
 * Validate a Custom API Call path. The host is fixed; wallet and account-balance
 * endpoints are never reachable from this node.
 */
export function assertCustomPath(path: string, method = 'GET'): string {
	const trimmed = (path ?? '').trim();
	if (!trimmed.startsWith('/api/')) {
		throw new Error('Path must start with /api/ (for example /api/v1/address/verify)');
	}
	if (/[?#]/.test(trimmed)) {
		throw new Error('Put query parameters in the Query Parameters field, not in the path');
	}
	if (trimmed.includes('..') || trimmed.includes('//') || trimmed.includes('\\')) {
		throw new Error('Path contains invalid segments');
	}
	if (/wallet/i.test(decodeURIComponentSafe(trimmed))) {
		throw new Error('Wallet endpoints are not available through this node');
	}
	// Also blocks asynchronous (callback) endpoints and creating monitors with a user-supplied callback.
	return checkApiRequest(catalog.apiRequest.guard, method, trimmed);
}

function decodeURIComponentSafe(text: string): string {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

export type HttpContext =
	| IExecuteFunctions
	| IPollFunctions
	| IHookFunctions
	| IWebhookFunctions;

export async function batchDataRequest(
	this: HttpContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${API_HOST}${path}`,
		json: true,
		headers: { Accept: 'application/json' },
	};
	if (body !== undefined && method !== 'GET') options.body = body;
	if (qs !== undefined && Object.keys(qs).length > 0) options.qs = qs;

	const helpers = this.helpers as IExecuteFunctions['helpers'];
	return (await helpers.httpRequestWithAuthentication.call(
		this as IExecuteFunctions,
		'batchDataApi',
		options,
	)) as IDataObject;
}

interface ErrorLike {
	message?: string;
	httpCode?: string | number;
	statusCode?: number;
	response?: { status?: number; statusCode?: number; data?: unknown; body?: unknown };
	cause?: ErrorLike;
}

function pickStatusMessage(data: unknown): string | undefined {
	if (!isPlainObject(data)) return undefined;
	const status = data.status;
	if (isPlainObject(status)) {
		const message = status.message ?? status.text;
		if (typeof message === 'string' && message.length > 0) return message;
	}
	return undefined;
}

export function extractApiError(error: unknown): { message: string; httpCode?: string } {
	const err = (error ?? {}) as ErrorLike;
	const layers: ErrorLike[] = [err];
	if (err.cause) layers.push(err.cause);

	let httpCode: string | undefined;
	let message: string | undefined;
	for (const layer of layers) {
		const code =
			layer.httpCode ?? layer.statusCode ?? layer.response?.status ?? layer.response?.statusCode;
		if (code !== undefined && httpCode === undefined) httpCode = String(code);
		const body = layer.response?.data ?? layer.response?.body;
		message ??= pickStatusMessage(body);
	}
	message ??= err.message ?? 'Unknown error';
	return { message, httpCode };
}

export function describeHttpError(httpCode: string | undefined): string | undefined {
	switch (httpCode) {
		case '401':
			return `The BatchData API token was rejected. Check the token in your BatchData API credential. Questions: ${SUPPORT_EMAIL}`;
		case '403':
			return `The request was refused. The token may lack permission for this endpoint. Questions: ${SUPPORT_EMAIL}`;
		case '429':
			return 'BatchData rate limit reached. Slow the workflow down or retry later.';
		default:
			return undefined;
	}
}

export function toNodeApiError(
	context: { getNode: IExecuteFunctions['getNode'] },
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeOperationError || error instanceof NodeApiError) return error;
	const { message, httpCode } = extractApiError(error);
	if (httpCode === undefined) {
		return new NodeOperationError(context.getNode(), message, { itemIndex });
	}
	return new NodeApiError(context.getNode(), error as JsonObject, {
		message,
		description: describeHttpError(httpCode),
		httpCode,
		itemIndex,
	});
}
