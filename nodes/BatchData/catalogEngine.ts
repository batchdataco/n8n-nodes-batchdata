/* eslint-disable @typescript-eslint/no-explicit-any */
// Typed port of shared/engine.cjs. Pure functions, no I/O. Keep behaviour identical to that file;
// test/catalog.test.mjs runs both against the same catalog.
import type { ApiGuard, CatalogField, CatalogOp } from './catalogTypes';

export const FORBIDDEN_KEYS = ['webhookUrl', 'errorWebhookUrl'];

export class InputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InputError';
	}
}

type Obj = Record<string, any>;

export const isPlain = (v: unknown): v is Obj =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export const isBlank = (v: unknown): boolean =>
	v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function deepMerge(base: Obj, override: Obj): Obj {
	const out: Obj = { ...base };
	for (const [k, v] of Object.entries(override)) {
		out[k] = isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : v;
	}
	return out;
}

/** Remove callback keys (webhookUrl, errorWebhookUrl) at any depth, in any letter case. */
export function strip<T>(v: T): T {
	if (Array.isArray(v)) return v.map((e) => strip(e)) as unknown as T;
	if (isPlain(v)) {
		const out: Obj = {};
		for (const [k, e] of Object.entries(v)) {
			if (FORBIDDEN_KEYS.some((f) => f.toLowerCase() === k.toLowerCase())) continue;
			out[k] = strip(e);
		}
		return out as T;
	}
	return v;
}

export function removeEmpty(obj: Obj): Obj {
	const out: Obj = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined || v === null || v === '') continue;
		if (isPlain(v)) {
			const n = removeEmpty(v);
			if (Object.keys(n).length === 0) continue;
			out[k] = n;
		} else out[k] = v;
	}
	return out;
}

export function getPath(obj: unknown, path: string): any {
	let cur: any = obj;
	for (const seg of path.split('.')) {
		if (cur === undefined || cur === null) return undefined;
		cur = cur[seg];
	}
	return cur;
}

export function setPath(obj: Obj, path: string, value: unknown): void {
	const segs = path.split('.');
	let cur: any = obj;
	segs.forEach((seg, i) => {
		if (i === segs.length - 1) {
			cur[seg] = value;
			return;
		}
		if (!isPlain(cur[seg]) && !Array.isArray(cur[seg])) cur[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {};
		cur = cur[seg];
	});
}

export function toBoolean(v: unknown): boolean | undefined {
	if (v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === 1 || v === '1') return true;
	if (v === false || v === 'false' || v === 'no' || v === 'No' || v === 0 || v === '0') return false;
	return undefined;
}

export function asList(v: unknown): string[] {
	if (Array.isArray(v)) {
		return v
			.map((e) => String(e).trim())
			.filter(Boolean);
	}
	if (isBlank(v)) return [];
	return String(v)
		.split(/[\n,]+/)
		.map((e) => e.trim())
		.filter(Boolean);
}

export function parseJsonObject(v: unknown, label: string): Obj | undefined {
	if (isBlank(v)) return undefined;
	if (isPlain(v)) return v;
	let parsed: unknown;
	try {
		parsed = JSON.parse(String(v));
	} catch {
		// Wrapped into a NodeOperationError by the node (toNodeApiError).
		// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
		throw new InputError(`${label} is not valid JSON`);
	}
	if (!isPlain(parsed)) throw new InputError(`${label} must be a JSON object`);
	return parsed;
}

export function coerce(field: CatalogField, raw: unknown): unknown {
	if (isBlank(raw) && raw !== false) return undefined;
	switch (field.type) {
		case 'string':
		case 'text':
		case 'password':
			return String(raw).trim();
		case 'integer':
		case 'number': {
			const n = Number(raw);
			if (!Number.isFinite(n) || (field.type === 'integer' && !Number.isInteger(n))) {
				throw new InputError(
					`${field.label} must be a ${field.type === 'integer' ? 'whole ' : ''}number`,
				);
			}
			if (field.min !== undefined && n < field.min)
				throw new InputError(`${field.label} must be at least ${field.min}`);
			if (field.max !== undefined && n > field.max)
				throw new InputError(`${field.label} must be at most ${field.max}`);
			return n;
		}
		case 'boolean': {
			const b = toBoolean(raw);
			if (b === undefined) throw new InputError(`${field.label} must be yes or no`);
			return b;
		}
		case 'choice': {
			const v = String(raw).trim();
			if (field.choices && !field.choices.some((c) => c.value === v)) {
				throw new InputError(`${field.label}: "${v}" is not an allowed value`);
			}
			return v;
		}
		case 'list': {
			const l = asList(raw);
			return l.length ? l : undefined;
		}
		case 'date': {
			const s = String(raw).trim().slice(0, 10);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new InputError(`${field.label} must look like 2026-01-31`);
			return s;
		}
		case 'json':
			return parseJsonObject(raw, field.label);
		default:
			return raw;
	}
}

function resolveInput(field: CatalogField, input: Obj): unknown {
	const raw = input[field.key];
	if (isBlank(raw) && raw !== false && field.default !== undefined) return field.default;
	return raw;
}

function buildRows(field: CatalogField, rows: unknown): Obj[] {
	let list: any = rows;
	if (typeof list === 'string') {
		try {
			list = JSON.parse(list);
		} catch {
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
			throw new InputError(`${field.label} must be a list of rows`);
		}
	}
	if (isPlain(list)) list = [list];
	if (!Array.isArray(list)) list = [];
	const out: Obj[] = [];
	for (const row of list) {
		if (!isPlain(row)) continue;
		const item: Obj = {};
		for (const rf of field.rowFields ?? []) {
			const v = coerce(rf, row[rf.key]);
			if (v !== undefined && rf.path) setPath(item, rf.path, v);
		}
		const cleaned = removeEmpty(item);
		if (Object.keys(cleaned).length > 0) out.push(cleaned);
	}
	if (out.length === 0 && field.required) throw new InputError(`${field.label}: add at least one row`);
	if (field.max && out.length > field.max) {
		throw new InputError(`${field.label}: at most ${field.max} rows per call (got ${out.length})`);
	}
	return out;
}

export interface BuiltRequest {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	path: string;
	qs: Obj;
	body: Obj | undefined;
}

/** Build the HTTP request for a catalog op or trigger. */
export function buildRequest(op: CatalogOp, input: Obj = {}): BuiltRequest {
	const fields = op.fields ?? [];
	const body: Obj = {};
	const qs: Obj = { ...(op.fixedQuery ?? {}) };
	let path = op.http.path;
	const resolved: Obj = {};
	for (const f of fields) resolved[f.key] = resolveInput(f, input);
	const wire = fields.filter((f) => !f.local);

	if (op.requireOneOf && !op.requireOneOf.some((k) => !isBlank(resolved[k]))) {
		const labels = op.requireOneOf.map((k) => fields.find((f) => f.key === k)?.label ?? k);
		throw new InputError(`Fill in at least one of: ${labels.join(', ')}`);
	}

	const ordered = [...wire.filter((f) => f.first), ...wire.filter((f) => !f.first)];
	for (const f of ordered) {
		if (f.when && String(resolved[f.when.field]) !== String(f.when.equals)) continue;
		if (f.type === 'rows') {
			setPath(body, f.path as string, buildRows(f, resolved[f.key]));
			continue;
		}
		const v = coerce(f, resolved[f.key]);
		if (v === undefined) {
			if (f.required) throw new InputError(`${f.label} is required`);
			continue;
		}
		if (f.pattern && !new RegExp(f.pattern).test(String(v))) {
			throw new InputError(`${f.label} has an invalid format`);
		}
		if (f.in === 'path') {
			path = path.replace(/\{[^}]+\}/, encodeURIComponent(String(v)));
		} else if (f.in === 'query') {
			qs[f.qs ?? f.key] = v;
		} else if (f.type === 'json') {
			const existing = getPath(body, f.path as string);
			setPath(body, f.path as string, deepMerge(v as Obj, isPlain(existing) ? existing : {}));
		} else {
			setPath(body, f.path as string, v);
		}
	}
	for (const fx of op.fixed ?? []) setPath(body, fx.path, fx.value);
	const method = op.http.method;
	const hasBody = method !== 'GET' && method !== 'DELETE';
	return { method, path, qs, body: hasBody ? strip(body) : undefined };
}

/** Turn an API response into a list of result records. */
export function extractResult(op: CatalogOp, response: unknown, input: Obj = {}): Obj[] {
	const r = op.result ?? {};
	const resp: Obj = isPlain(response) ? response : {};
	const attach = (item: Obj): Obj => {
		for (const [k, p] of Object.entries(r.attach ?? {})) {
			const v = getPath(resp, p);
			if (v !== undefined) item[k] = v;
		}
		for (const [k, from] of Object.entries(r.idFrom ?? {})) {
			if (item[from] !== undefined) item[k] = item[from];
		}
		return item;
	};
	if (r.compose) {
		const out: Obj = {};
		for (const [k, p] of Object.entries(r.compose)) {
			const v = getPath(resp, p);
			out[k] = v === undefined ? null : v;
		}
		return [out];
	}
	if (r.static) {
		const out: Obj = { ...r.static };
		for (const [k, from] of Object.entries(r.echo ?? {})) out[k] = input[from];
		return [out];
	}
	if (r.item) {
		const v = getPath(resp, r.item);
		return isPlain(v) ? [attach({ ...v })] : [];
	}
	let arr: any = r.list ? getPath(resp, r.list) : undefined;
	if (!Array.isArray(arr)) arr = [];
	const filter = r.filter;
	if (filter) arr = arr.filter((e: unknown) => getPath(e, filter.path) === filter.equals);
	return arr.map((e: unknown) => attach(isPlain(e) ? { ...e } : { value: e }));
}

/** Guard for the Custom API Call operation. Returns the validated path or throws InputError. */
export function checkApiRequest(guard: ApiGuard, method: string, rawPath: string): string {
	const path = String(rawPath ?? '').trim();
	const bad = (why: string) => new InputError(`That path is not allowed here (${why}).`);
	if (!path.startsWith(guard.mustStartWith)) throw bad(`it must start with ${guard.mustStartWith}`);
	if (/[?#\\%]/.test(path) || path.includes('..') || path.includes('//')) {
		throw bad('no query string, encoding or relative segments');
	}
	const lower = path.toLowerCase();
	for (const word of guard.blockedPathContains) {
		if (lower.includes(word)) throw bad('account balance and billing endpoints are blocked');
	}
	const segs = lower.split('/');
	for (const seg of guard.blockedPathSegments) {
		if (segs.includes(seg)) throw bad('asynchronous callback endpoints are blocked');
	}
	for (const w of guard.blockedWrites) {
		if (lower.includes(w.pathContains) && w.methods.includes(String(method).toUpperCase())) {
			throw bad(
				'create monitors with the Create action on the Property Monitor resource or the BatchData Monitor Event trigger',
			);
		}
	}
	return path;
}
