import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BatchDataTrigger } from '../dist/nodes/BatchDataTrigger/BatchDataTrigger.node.js';
import { BatchDataMonitorTrigger } from '../dist/nodes/BatchDataMonitorTrigger/BatchDataMonitorTrigger.node.js';
import { fixture, hookContext, pollContext, runNode } from './helpers.mjs';

const PRISM_PROBLEM = {
	type: 'https://stoplight.io/prism/errors#INVALID_API_RESPONSE',
	title: 'Invalid response',
	status: 500,
	detail: 'Request responded with status code 500',
};

const addressVerify = (extra = {}) => ({
	resource: 'address',
	operation: 'verify',
	street: '2800 N 24th St',
	city: 'Phoenix',
	state: 'AZ',
	...extra,
});

test('a 2xx problem body with a numeric status fails the run with its detail', async () => {
	await assert.rejects(
		runNode({
			params: [addressVerify()],
			responses: [PRISM_PROBLEM],
		}),
		(err) => /Request responded with status code 500/.test(err.message) && /500/.test(err.message),
	);
});

test('a 2xx problem body that names its error under name fails the run with its detail', async () => {
	await assert.rejects(
		runNode({
			params: [addressVerify()],
			responses: [
				{
					name: 'https://stoplight.io/prism/errors#INVALID_API_RESPONSE',
					status: 500,
					detail: 'Request responded with status code 500',
				},
			],
		}),
		(err) => /Request responded with status code 500/.test(err.message),
	);
});

test('an RFC 7807 problem body without a numeric status fails the run with its detail', async () => {
	await assert.rejects(
		runNode({
			params: [addressVerify()],
			responses: [{ type: 'about:blank', title: 'Bad Gateway', detail: 'Upstream timed out' }],
		}),
		(err) => /Upstream timed out/.test(err.message),
	);
});

test('a custom API call returns a body that has a type, title and detail without failing', async () => {
	const body = {
		id: 'abc',
		name: 'Downtown watch',
		type: 'property',
		title: 'Watch',
		detail: 'Active since 2026-01-02',
	};
	const { output } = await runNode({
		params: [
			{
				resource: 'customApiCall',
				operation: 'request',
				method: 'GET',
				path: '/api/v2/property/search-sessions/abc',
			},
		],
		responses: [body],
	});
	assert.equal(output.length, 1);
	assert.deepEqual(output[0].json, body);
});

test('an address verify problem body with null results fails the run with its detail', async () => {
	await assert.rejects(
		runNode({
			params: [addressVerify()],
			responses: [
				{ status: 500, detail: 'Request responded with status code 500', results: null },
			],
		}),
		(err) => err.message.includes('Request responded with status code 500'),
	);
});

test('a failing item in a multi-item run reports its item index', async () => {
	await assert.rejects(
		runNode({
			params: [addressVerify(), addressVerify({ street: '1 Main St' })],
			responses: [
				fixture('address-verify'),
				{ status: 500, detail: 'Request responded with status code 500' },
			],
		}),
		(err) => err.context.itemIndex === 1,
	);
});

test('continueOnFail turns a 2xx problem body into one error item', async () => {
	const { output } = await runNode({
		continueOnFail: true,
		params: [addressVerify()],
		responses: [PRISM_PROBLEM],
	});
	assert.equal(output.length, 1);
	assert.match(output[0].json.error, /Request responded with status code 500/);
});

test('a catalog operation fails the run on a 2xx problem body', async () => {
	await assert.rejects(
		runNode({
			params: [
				{
					resource: 'property',
					operation: 'batch_skip_trace',
					batch_skip_trace_properties: { rows: [{ street: '1 A St', city: 'X', state: 'AZ' }] },
				},
			],
			responses: [PRISM_PROBLEM],
		}),
		(err) => /Request responded with status code 500/.test(err.message),
	);
});

test('an empty address result still returns no items', async () => {
	const { output } = await runNode({
		params: [addressVerify()],
		responses: [{ status: { code: 200, text: 'OK' }, results: { addresses: [] } }],
	});
	assert.equal(output.length, 0);
});

test('a normal address verify response returns one item per address', async () => {
	const { output } = await runNode({
		params: [addressVerify()],
		responses: [fixture('address-verify')],
	});
	assert.equal(output.length, fixture('address-verify').results.addresses.length);
});

test('a numeric status beside a results container does not fail the run', async () => {
	const { output } = await runNode({
		params: [addressVerify()],
		responses: [{ status: 500, results: { addresses: [] } }],
	});
	assert.equal(output.length, 0);
});

test('a message-only custom call response does not fail the run', async () => {
	const { output } = await runNode({
		params: [
			{
				resource: 'customApiCall',
				operation: 'request',
				method: 'DELETE',
				path: '/api/v2/property/search-sessions/abc',
			},
		],
		responses: [{ message: 'Subscription deleted' }],
	});
	assert.equal(output.length, 1);
	assert.deepEqual(output[0].json, { message: 'Subscription deleted' });
});

test('a 2xx problem body with status 401 explains that the token was rejected', async () => {
	await assert.rejects(
		runNode({
			params: [addressVerify()],
			responses: [{ status: 401, detail: 'Invalid token' }],
		}),
		(err) => err.httpCode === '401' && /token was rejected/.test(err.description),
	);
});

test('the polling trigger fails a poll on a 2xx problem body with its detail', async () => {
	const { context } = pollContext({ event: 'new_search_session', responses: [PRISM_PROBLEM] });
	await assert.rejects(new BatchDataTrigger().poll.call(context), (err) =>
		/Request responded with status code 500/.test(err.message),
	);
});

test('monitor trigger checkExists keeps the monitor and fails on a 2xx body with status 404', async () => {
	const trigger = new BatchDataMonitorTrigger();
	const h = hookContext({
		staticData: { subscriptionId: 'sub1' },
		responses: [{ status: 404, detail: 'Subscription lookup failed' }],
	});
	await assert.rejects(trigger.webhookMethods.default.checkExists.call(h.context), (err) =>
		/Subscription lookup failed/.test(err.message),
	);
	assert.equal(h.staticData.subscriptionId, 'sub1');
	assert.equal(h.calls.length, 1);
});

test('monitor trigger delete keeps the monitor id and fails on a 2xx body with status 404', async () => {
	const trigger = new BatchDataMonitorTrigger();
	const h = hookContext({
		staticData: { subscriptionId: 'sub1' },
		responses: [{ status: 404, detail: 'Subscription delete failed' }],
	});
	await assert.rejects(trigger.webhookMethods.default.delete.call(h.context), (err) =>
		/Subscription delete failed/.test(err.message),
	);
	assert.equal(h.staticData.subscriptionId, 'sub1');
});
