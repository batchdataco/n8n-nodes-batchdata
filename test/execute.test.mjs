import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixture, httpError, runNode } from './helpers.mjs';

const skipV1 = (extra = {}) => ({
	resource: 'property',
	operation: 'skipTrace',
	skipTraceVersion: 'v1',
	findBy: 'address',
	street: '123 Main St',
	city: 'Chicago',
	state: 'IL',
	zip: '',
	...extra,
});

test('search builds the documented body and returns one item per property', async () => {
	const { output, calls } = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'search',
				query: 'Phoenix, AZ',
				quickLists: ['absentee-owner'],
				excludedQuickLists: ['vacant'],
				orQuickLists: [],
				filters: {
					bedroomsMin: 3,
					ownerOccupied: false,
					lastSaleDateFrom: '2020-01-05T00:00:00.000Z',
				},
				additionalCriteria: '{"query":"ignored","listing":{"status":{"equals":"Active"}}}',
				take: 10,
				searchOptions: { skip: 20 },
			},
		],
		responses: [fixture('property-search')],
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'POST');
	assert.equal(calls[0].url, 'https://api.batchdata.com/api/v1/property/search');
	assert.equal(calls[0].credentialType, 'batchDataApi');
	assert.deepEqual(calls[0].body, {
		searchCriteria: {
			listing: { status: { equals: 'Active' } },
			query: 'Phoenix, AZ',
			quickLists: ['absentee-owner', 'not-vacant'],
			building: { bedroomCount: { min: 3 } },
			owner: { ownerOccupied: { equals: false } },
			sale: { lastSaleDate: { minDate: '2020-01-05' } },
		},
		options: { take: 10, skip: 20 },
	});
	assert.equal(output.length, fixture('property-search').results.properties.length);
});

test('search single-item mode returns counts', async () => {
	const { output } = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'search',
				query: 'Phoenix, AZ',
				take: 0,
				searchOptions: { outputMode: 'single' },
			},
		],
		responses: [fixture('property-search')],
	});
	assert.equal(output.length, 1);
	assert.equal(output[0].json.resultsFound, 435641);
	assert.ok(Array.isArray(output[0].json.properties));
});

test('search strips webhook fields from additional JSON', async () => {
	const { calls } = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'search',
				query: 'AZ',
				take: 1,
				searchOptions: {
					additionalOptions: '{"webhookUrl":"https://x.test","errorWebhookUrl":"https://y.test"}',
				},
			},
		],
		responses: [fixture('property-search')],
	});
	assert.equal(JSON.stringify(calls[0].body).includes('webhook'), false);
	assert.equal(JSON.stringify(calls[0].body).includes('Webhook'), false);
});

test('lookup sends exactly one identifier and options', async () => {
	const { output, calls } = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'lookup',
				identifyBy: 'apn',
				apn: '123-45',
				countyFipsCode: '04013',
				street: 'ignored',
				lookupOptions: { datasets: ['basic', 'owner'], includeSkipTrace: true },
			},
		],
		responses: [fixture('property-lookup-all-attributes')],
	});
	assert.equal(calls[0].url, 'https://api.batchdata.com/api/v1/property/lookup/all-attributes');
	assert.deepEqual(calls[0].body, {
		requests: [{ apn: '123-45', countyFipsCode: '04013' }],
		options: { skipTrace: true, datasets: ['basic', 'owner'] },
	});
	assert.ok(output.length >= 1);
});

test('lookup rejects basic + core datasets', async () => {
	await assert.rejects(
		runNode({
			params: [
				{
					resource: 'property',
					operation: 'lookup',
					identifyBy: 'propertyId',
					propertyId: 'abc',
					lookupOptions: { datasets: ['basic', 'core'] },
				},
			],
			responses: [],
		}),
		/cannot be combined/,
	);
});

test('skip trace V1 excludes TCPA phones by default and flattens persons', async () => {
	const { output, calls } = await runNode({
		params: [skipV1({ includeTcpaFlagged: false })],
		responses: [fixture('property-skip-trace')],
	});
	assert.equal(calls[0].url, 'https://api.batchdata.com/api/v1/property/skip-trace');
	assert.equal(calls[0].body.options.includeTCPABlacklistedPhones, false);
	assert.deepEqual(calls[0].body.requests, [
		{ propertyAddress: { street: '123 Main St', city: 'Chicago', state: 'IL' } },
	]);
	assert.ok(output.length >= 1);
	assert.equal(output[0].json.apiVersion, 'v1');
	assert.ok(output[0].json.person);
});

test('skip trace V3 also sends the TCPA flag explicitly (default false)', async () => {
	const { output, calls } = await runNode({
		params: [skipV1({ skipTraceVersion: 'v3' })],
		responses: [fixture('v3-property-skip-trace')],
	});
	assert.equal(calls[0].url, 'https://api.batchdata.com/api/v3/property/skip-trace');
	assert.equal(calls[0].body.options.includeTCPABlacklistedPhones, false);
	assert.ok(output.length >= 1);
	assert.equal(output[0].json.apiVersion, 'v3');
});

test('skip trace sends true only when the toggle is on', async () => {
	const { calls } = await runNode({
		params: [skipV1({ includeTcpaFlagged: true })],
		responses: [fixture('property-skip-trace')],
	});
	assert.equal(calls[0].body.options.includeTCPABlacklistedPhones, true);
});

test('skip trace by APN builds the apn request', async () => {
	const { calls } = await runNode({
		params: [
			{
				resource: 'property',
				operation: 'skipTrace',
				findBy: 'apn',
				apn: '999',
				countyFipsCode: '36061',
				county: '',
				apnState: '',
				skipTraceAdditional: {
					ownerFirstName: 'Ann',
					ownerLastName: 'Lee',
					prioritizeMobilePhones: false,
				},
			},
		],
		responses: [fixture('property-skip-trace')],
	});
	assert.deepEqual(calls[0].body.requests, [
		{ apn: '999', countyFipsCode: '36061', name: { first: 'Ann', last: 'Lee' } },
	]);
	assert.equal(calls[0].body.options.prioritizeMobilePhones, false);
});

test('address verify', async () => {
	const { output, calls } = await runNode({
		params: [
			{
				resource: 'address',
				operation: 'verify',
				street: '2800 N 24th St',
				city: 'Phoenix',
				state: 'AZ',
			},
		],
		responses: [fixture('address-verify')],
	});
	assert.equal(calls[0].url, 'https://api.batchdata.com/api/v1/address/verify');
	assert.deepEqual(calls[0].body, {
		requests: [{ street: '2800 N 24th St', city: 'Phoenix', state: 'AZ' }],
	});
	assert.ok(output.length >= 1);
});

for (const [operation, name] of [
	['verification', 'phone-verification'],
	['dnc', 'phone-dnc'],
	['tcpa', 'phone-tcpa'],
]) {
	test(`phone ${operation} sends a requests array and returns one item per number`, async () => {
		const { output, calls } = await runNode({
			params: [{ resource: 'phone', operation, phoneNumbers: '2024561111, 6027828692' }],
			responses: [fixture(name)],
		});
		assert.equal(calls[0].url, `https://api.batchdata.com/api/v1/phone/${operation}`);
		assert.deepEqual(calls[0].body, { requests: ['2024561111', '6027828692'] });
		assert.equal(output.length, fixture(name).results.phoneNumbers.length);
	});
}

test('phone rejects empty input', async () => {
	await assert.rejects(
		runNode({
			params: [{ resource: 'phone', operation: 'dnc', phoneNumbers: ' , ' }],
			responses: [],
		}),
		/at least one phone number/,
	);
});

test('custom call: path guards', async () => {
	for (const path of [
		'/v1/x',
		'/api/../x',
		'/api/v1/wallet/balance',
		'/api/v1/a?b=1',
		'https://evil.test/api/x',
	]) {
		await assert.rejects(
			runNode({
				params: [
					{ resource: 'customApiCall', operation: 'request', method: 'POST', path, body: '{}' },
				],
				responses: [{}],
			}),
			undefined,
			path,
		);
	}
});

test('custom call: sends body, strips webhook fields, GET drops body', async () => {
	const post = await runNode({
		params: [
			{
				resource: 'customApiCall',
				operation: 'request',
				method: 'POST',
				path: '/api/v1/address/verify',
				queryParameters: '{"a":"1"}',
				body: '{"requests":[],"webhookUrl":"https://x.test"}',
			},
		],
		responses: [{ ok: true }],
	});
	assert.deepEqual(post.calls[0].body, { requests: [] });
	assert.deepEqual(post.calls[0].qs, { a: '1' });
	assert.deepEqual(post.output[0].json, { ok: true });

	const get = await runNode({
		params: [
			{
				resource: 'customApiCall',
				operation: 'request',
				method: 'GET',
				path: '/api/v2/property/search-sessions',
			},
		],
		responses: [{ ok: true }],
	});
	assert.equal(get.calls[0].body, undefined);
});

test('errors: 401, 429 and 500 surface with the right message; continueOnFail keeps going', async () => {
	const body401 = { status: { code: 401, text: 'Unauthorized', message: 'Invalid token' } };
	await assert.rejects(
		runNode({
			params: [{ resource: 'phone', operation: 'dnc', phoneNumbers: '2024561111' }],
			responses: [httpError(401, body401)],
		}),
		(error) => {
			assert.equal(error.httpCode, '401');
			assert.match(error.description, /support@batchservice\.com/);
			return true;
		},
	);
	await assert.rejects(
		runNode({
			params: [{ resource: 'phone', operation: 'dnc', phoneNumbers: '2024561111' }],
			responses: [httpError(429, {})],
		}),
		(error) => /rate limit/i.test(error.description),
	);
	await assert.rejects(
		runNode({
			params: [{ resource: 'phone', operation: 'dnc', phoneNumbers: '2024561111' }],
			responses: [httpError(500, { status: { code: 500, message: 'Server exploded' } })],
		}),
		(error) => error.httpCode === '500' && /Server exploded/.test(error.message),
	);

	const { output } = await runNode({
		continueOnFail: true,
		params: [
			{ resource: 'phone', operation: 'dnc', phoneNumbers: '2024561111' },
			{ resource: 'phone', operation: 'dnc', phoneNumbers: '6027828692' },
		],
		responses: [
			httpError(400, { status: { code: 400, message: 'Bad request body' } }),
			fixture('phone-dnc'),
		],
	});
	assert.equal(output[0].json.error, 'Bad request body');
	assert.equal(output[0].json.statusCode, '400');
	assert.deepEqual(output[0].pairedItem, { item: 0 });
	assert.deepEqual(output[1].pairedItem, { item: 1 });
});
