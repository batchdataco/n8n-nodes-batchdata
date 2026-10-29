import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BatchData } from '../dist/nodes/BatchData/BatchData.node.js';
import { BatchDataTrigger } from '../dist/nodes/BatchDataTrigger/BatchDataTrigger.node.js';
import { BatchDataMonitorTrigger } from '../dist/nodes/BatchDataMonitorTrigger/BatchDataMonitorTrigger.node.js';
import * as engine from '../dist/nodes/BatchData/catalogEngine.js';
import { catalog } from '../dist/nodes/BatchData/catalogProperties.js';
import { httpError, runNode } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const node = { id: 't', name: 'BatchData', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} };

test('vendored catalog matches its recorded hash (drift check against shared/catalog.json)', () => {
	const raw = readFileSync(join(root, 'nodes/BatchData/catalog.json'), 'utf8');
	const recorded = readFileSync(join(root, 'nodes/BatchData/catalog.sha256'), 'utf8').trim();
	assert.equal(createHash('sha256').update(raw).digest('hex'), recorded);
});

test('copy lint: one contact, no retired product names, no callback fields, billing in every description', () => {
	const props = [new BatchData(), new BatchDataTrigger(), new BatchDataMonitorTrigger()].flatMap(
		(n) => n.description.properties,
	);
	const text = JSON.stringify(props);
	const banned = new RegExp(['batch' + 'leads', 'batch\\s*' + 'dialer'].join('|'), 'i');
	assert.ok(!banned.test(text));
	for (const email of text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []) {
		assert.equal(email, 'support@batchservice.com');
	}
	for (const p of props) assert.ok(!/webhookurl|errorwebhookurl|^url$/i.test(p.name), p.name);
	for (const op of [...catalog.ops, ...catalog.triggers]) assert.match(op.description, /bill/i, op.key);
	const operations = props.filter((p) => p.name === 'operation').flatMap((p) => p.options);
	for (const o of operations.filter((o) => catalog.ops.some((c) => c.key === o.value))) {
		assert.match(o.description, /bill/i, o.value);
	}
});

test('every catalog operation is reachable under its resource', () => {
	const { properties } = new BatchData().description;
	const have = new Set(
		properties.filter((p) => p.name === 'operation').flatMap((p) => p.options.map((o) => o.value)),
	);
	for (const op of catalog.ops) assert.ok(have.has(op.key), op.key);
	for (const op of catalog.ops) {
		const params = properties.filter((p) => p.displayOptions?.show?.operation?.includes(op.key));
		assert.ok(params.length > 0 || op.fields.length === 0, `${op.key} has parameters`);
		for (const p of params) assert.ok(p.name.startsWith(`${op.key}_`) || p.name === 'operation', p.name);
	}
});

test('the live node and the engine agree on every operation request', () => {
	for (const op of catalog.ops) {
		const input = {};
		for (const f of op.fields) {
			if (!f.required || f.default !== undefined) continue;
			input[f.key] =
				f.type === 'rows'
					? [Object.fromEntries(f.rowFields.map((r) => [r.key, 'x']))]
					: f.key === 'session_id'
						? 'abc'
						: f.type === 'number' || f.type === 'integer'
							? 1
							: 'x';
		}
		if (op.requireOneOf) input[op.requireOneOf[0]] = 'x';
		const request = engine.buildRequest(op, input);
		assert.ok(request.path.startsWith('/api/'), op.key);
		assert.ok(!/wallet|async/.test(request.path), op.key);
	}
});

test('batch skip trace sends TCPA explicitly (default off) and caps rows', async () => {
	const { calls, output } = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'batch_skip_trace',
				batch_skip_trace_properties: { rows: [{ street: '1 A St', city: 'X', state: 'AZ' }] },
			},
		],
		responses: [{ result: { data: [{ persons: [] }], meta: { results: { matchCount: 0, requestCount: 1 } } } }],
	});
	assert.equal(calls[0].url, 'https://api.batchdata.com/api/v3/property/skip-trace');
	assert.equal(calls[0].body.options.includeTCPABlacklistedPhones, false);
	assert.equal(output.length, 1);
	assert.equal(output[0].json.matchCount, 0);
	assert.equal(output[0].json.requestCount, 1);
	const rows = Array.from({ length: 101 }, () => ({ street: '1 A St' }));
	await assert.rejects(
		runNode({
			params: [{ resource: 'property', operation: 'batch_skip_trace', batch_skip_trace_properties: { rows } }],
			responses: [],
		}),
		/at most 100/,
	);
});

test('reverse skip trace: no match returns nothing, needs a phone or email', async () => {
	const none = await runNode({
		params: [{ resource: 'property', operation: 'reverse_skip_trace', reverse_skip_trace_phone: '6025550142' }],
		responses: [{ result: { data: [{ persons: [], meta: { matched: false } }] } }],
	});
	assert.equal(none.output.length, 0);
	assert.equal(none.calls[0].body.options.includeTCPABlacklistedPhones, false);
	await assert.rejects(
		runNode({ params: [{ resource: 'property', operation: 'reverse_skip_trace' }], responses: [] }),
		/at least one of/i,
	);
});

test('search sessions: create forces cursor pagination, delete uses the id, ids are validated', async () => {
	const created = await runNode({
		params: [
			{
				resource: 'searchSession',
				operation: 'create_search_session',
				create_search_session_session_id: 'my-session_1',
				create_search_session_additional: { query: 'Phoenix, AZ' },
			},
		],
		responses: [{ results: { properties: [{ _id: 'p1' }], searchSessionMeta: { isNewSession: true } } }],
	});
	assert.equal(created.calls[0].body.options.useCursorPagination, true);
	assert.equal(created.calls[0].body.options.searchSession.id, 'my-session_1');
	const del = await runNode({
		params: [{ resource: 'searchSession', operation: 'delete_search_session', delete_search_session_id: 'a b' }],
		responses: [{ results: { deleted: true, id: 'a b' } }],
	});
	assert.equal(del.calls[0].method, 'DELETE');
	assert.equal(del.calls[0].url, 'https://api.batchdata.com/api/v2/property/search-sessions/a%20b');
	await assert.rejects(
		runNode({
			params: [
				{ resource: 'searchSession', operation: 'create_search_session', create_search_session_session_id: 'bad id!' },
			],
			responses: [],
		}),
		/invalid format/,
	);
});

test('create monitor: stream delivery only; callback keys never reach the API', async () => {
	const { calls } = await runNode({
		params: [
			{
				resource: 'propertyMonitor',
				operation: 'create_monitor',
				create_monitor_delivery_type: 'kinesis',
				create_monitor_kinesis_stream_name: 's',
				create_monitor_kinesis_region: 'us-west-2',
				create_monitor_additional: { query: 'Phoenix, AZ', additional_criteria: '{"webhookUrl":"https://evil.example","x":{"errorWebhookUrl":"y"}}' },
			},
		],
		responses: [{ result: { subscriptionId: 's1' } }],
	});
	assert.equal(calls[0].body.deliveryConfig.type, 'kinesis');
	assert.ok(!JSON.stringify(calls[0].body).toLowerCase().includes('webhook'));
	const { properties } = new BatchData().description;
	const type = properties.find((p) => p.name === 'create_monitor_delivery_type');
	assert.deepEqual(type.options.map((o) => o.value).sort(), ['event-hub', 'kinesis']);
});

test('permits, investor, geocode map their envelopes', async () => {
	const permits = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'get_permits',
				get_permits_street: '1 A St',
				get_permits_city: 'X',
				get_permits_state: 'AZ',
				get_permits_additional: { tags: 'solar, roofing' },
			},
		],
		responses: [{ result: { permits: [{ permitNumber: 'A1' }], property: { address: {} } } }],
	});
	assert.equal(permits.output.length, 1);
	assert.deepEqual(permits.calls[0].body.request.allTags, { inList: ['solar', 'roofing'] });
	const rev = await runNode({
		params: [
			{
				resource: 'address',
				operation: 'reverse_geocode',
				reverse_geocode_latitude: 33.4,
				reverse_geocode_longitude: -112,
			},
		],
		responses: [{ result: { addresses: [{ street: 's' }] } }],
	});
	assert.deepEqual(rev.calls[0].body.request, { latitude: 33.4, longitude: -112 });
});

test('Custom API Call blocks wallet, async, monitor creation and strips callback keys in any case', async () => {
	const call = (method, path, body = '') =>
		runNode({
			params: [{ resource: 'customApiCall', operation: 'request', method, path, queryParameters: '', body }],
			responses: [{ ok: true }],
		});
	for (const [method, path] of [
		['GET', '/api/v1/Wallet/balance'],
		['POST', '/api/v1/property/search/async'],
		['POST', '/api/v3/property/skip-trace/async'],
		['POST', '/api/v2/property-subscription'],
		['GET', '/api/v1/%77allet/balance'],
		['GET', '/v1/address/verify'],
	]) {
		await assert.rejects(call(method, path), undefined, `${method} ${path}`);
	}
	const ok = await call('POST', '/api/v1/address/verify', '{"requests":[],"WebhookURL":"x","o":{"errorwebhookurl":"y"}}');
	assert.deepEqual(ok.calls[0].body, { requests: [], o: {} });
	const get = await call('GET', '/api/v2/property-subscription');
	assert.equal(get.calls[0].method, 'GET');
});

// ---- triggers -------------------------------------------------------------------------------

function pollContext({ event, params = {}, mode = 'trigger', responses, staticData = {} }) {
	const calls = [];
	let n = 0;
	const context = {
		getNode: () => node,
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

test('polling trigger: first run is a baseline for lists, later runs emit only new records', async () => {
	const first = pollContext({
		event: 'new_search_session',
		responses: [{ results: { sessions: [{ id: 'a', createdAt: '2026-01-01' }] } }],
	});
	assert.equal(await new BatchDataTrigger().poll.call(first.context), null);
	const second = pollContext({
		event: 'new_search_session',
		staticData: first.staticData,
		responses: [{ results: { sessions: [{ id: 'a', createdAt: '2026-01-01' }, { id: 'b', createdAt: '2026-02-01' }] } }],
	});
	const out = await new BatchDataTrigger().poll.call(second.context);
	assert.deepEqual(out[0].map((i) => i.json.id), ['b']);
	assert.equal(second.calls[0].method, 'GET');
	assert.equal(second.calls[0].credentialType, 'batchDataApi');
});

test('polling trigger: a billed session drain does not bill during a manual test', async () => {
	const manual = pollContext({ event: 'new_session_property', mode: 'manual', responses: [] });
	const out = await new BatchDataTrigger().poll.call(manual.context);
	assert.equal(manual.calls.length, 0);
	assert.equal(out[0].length, 1);
	const live = pollContext({
		event: 'new_session_property',
		params: { new_session_property_session_id: 'sess-1' },
		responses: [{ results: { properties: [{ _id: 'p1' }, { _id: 'p2' }] } }],
	});
	const items = await new BatchDataTrigger().poll.call(live.context);
	assert.deepEqual(items[0].map((i) => i.json.id), ['p1', 'p2']);
	assert.equal(live.calls[0].body.options.useCursorPagination, true);
});

function hookContext({ params = {}, staticData = {}, responses = [], body = {} }) {
	const calls = [];
	let n = 0;
	const context = {
		getNode: () => node,
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

test('monitor trigger: create points the monitor at the node webhook, delete removes it', async () => {
	const trigger = new BatchDataMonitorTrigger();
	const h = hookContext({
		params: { monitor_event_additional: { query: 'Phoenix, AZ' }, monitor_event_include_property: true },
		responses: [{ result: { subscriptionId: 'sub1' } }],
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(h.context), false);
	assert.equal(await trigger.webhookMethods.default.create.call(h.context), true);
	assert.equal(h.calls[0].url, 'https://api.batchdata.com/api/v2/property-subscription');
	assert.deepEqual(h.calls[0].body.deliveryConfig, {
		type: 'webhook',
		url: 'https://n8n.example.com/webhook/abc/batchdata-monitor',
	});
	assert.equal(h.calls[0].body.searchCriteria.query, 'Phoenix, AZ');
	assert.ok(!JSON.stringify(h.calls[0].body).includes('include_property'));
	assert.equal(h.staticData.subscriptionId, 'sub1');

	const exists = hookContext({ staticData: h.staticData, responses: [{ result: { id: 'sub1' } }] });
	assert.equal(await trigger.webhookMethods.default.checkExists.call(exists.context), true);
	const gone = hookContext({ staticData: { subscriptionId: 'sub1' }, responses: [httpError(404, {})] });
	assert.equal(await trigger.webhookMethods.default.checkExists.call(gone.context), false);

	const del = hookContext({ staticData: h.staticData, responses: [{}] });
	assert.equal(await trigger.webhookMethods.default.delete.call(del.context), true);
	assert.equal(del.calls[0].method, 'DELETE');
	assert.equal(del.calls[0].url, 'https://api.batchdata.com/api/v2/property-subscription/sub1');
	assert.equal(del.staticData.subscriptionId, undefined);
});

test('monitor trigger: events are deduplicated, junk is ignored, the property lookup is opt-in', async () => {
	const trigger = new BatchDataMonitorTrigger();
	const event = { eventId: 'e1', propertyId: 'p1', addedToSubscriptionIds: ['sub1'], removedFromSubscriptionIds: [] };
	const plain = hookContext({ body: event, params: { monitor_event_include_property: false } });
	const first = await trigger.webhook.call(plain.context);
	assert.equal(first.workflowData[0][0].json.id, 'e1');
	assert.equal(plain.calls.length, 0);
	const again = hookContext({ body: event, staticData: plain.staticData, params: { monitor_event_include_property: false } });
	assert.deepEqual((await trigger.webhook.call(again.context)).webhookResponse, { duplicate: true });
	const junk = hookContext({ body: { hello: 'world' } });
	assert.ok((await trigger.webhook.call(junk.context)).webhookResponse.ignored);

	const hydrated = hookContext({
		body: { ...event, eventId: 'e2' },
		params: { monitor_event_include_property: true },
		responses: [{ results: { properties: [{ _id: 'p1', address: { street: '1 A St' } }] } }],
	});
	const out = await trigger.webhook.call(hydrated.context);
	assert.equal(out.workflowData[0][0].json.property.address.street, '1 A St');
	assert.deepEqual(hydrated.calls[0].body, { requests: [{ propertyId: 'p1' }] });
});

test('package registers all three nodes and ships the official logo', () => {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	assert.equal(pkg.n8n.nodes.length, 3);
	for (const dir of ['BatchData', 'BatchDataTrigger', 'BatchDataMonitorTrigger']) {
		assert.ok(statSync(join(root, 'nodes', dir, 'batchdata.svg')).size > 1000, dir);
	}
	const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
	const banned = new RegExp(['batch' + 'leads', 'batch\\s*' + 'dialer'].join('|'), 'i');
	for (const file of walk(join(root, 'dist')).filter((f) => /\.(js|json|svg)$/.test(f))) {
		assert.ok(!banned.test(readFileSync(file, 'utf8')), file);
	}
});
