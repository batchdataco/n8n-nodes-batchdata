import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BatchData } from '../dist/nodes/BatchData/BatchData.node.js';
import { BatchDataApi } from '../dist/credentials/BatchDataApi.credentials.js';
import { QUICKLISTS } from '../dist/nodes/BatchData/constants.js';

test('credential defines a free test request: GET search sessions, one result', () => {
	const { test: credTest } = new BatchDataApi();
	assert.ok(credTest, 'credential has a test');
	const { request } = credTest;
	assert.equal(request.method, 'GET');
	assert.equal(
		`${request.baseURL}${request.url}`,
		'https://api.batchdata.com/api/v2/property/search-sessions',
	);
	assert.deepEqual(request.qs, { take: 1 });
	assert.equal(request.body, undefined);
	// Auth comes from `authenticate`, not a hard-coded header on the test request.
	assert.equal(request.headers?.Authorization, undefined);
	const codes = credTest.rules
		.filter((r) => r.type === 'responseCode')
		.map((r) => r.properties.value);
	assert.deepEqual(codes.sort(), [401, 403, 429]);
});

test('nodes rely on the credential test, not a node-level testedBy method', async () => {
	const { BatchDataTrigger } = await import(
		'../dist/nodes/BatchDataTrigger/BatchDataTrigger.node.js'
	);
	const { BatchDataMonitorTrigger } = await import(
		'../dist/nodes/BatchDataMonitorTrigger/BatchDataMonitorTrigger.node.js'
	);
	for (const node of [new BatchData(), new BatchDataTrigger(), new BatchDataMonitorTrigger()]) {
		assert.equal(node.description.credentials[0].name, 'batchDataApi');
		assert.equal(node.description.credentials[0].testedBy, undefined);
		assert.equal(node.methods?.credentialTest, undefined);
	}
});

test('credential injects a Bearer header and declares a password field', () => {
	const credential = new BatchDataApi();
	assert.equal(credential.authenticate.type, 'generic');
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiToken}}',
	);
	const field = credential.properties.find((p) => p.name === 'apiToken');
	assert.equal(field.typeOptions.password, true);
});

test('node description exposes the planned resources and no wallet or webhook fields', () => {
	const { description } = new BatchData();
	const resource = description.properties.find((p) => p.name === 'resource');
	assert.deepEqual(resource.options.map((o) => o.value).sort(), [
		'address',
		'customApiCall',
		'investor',
		'phone',
		'property',
		'propertyMonitor',
		'searchSession',
	]);
	const names = description.properties.map((p) => p.name.toLowerCase());
	assert.equal(
		names.some((n) => n.includes('webhook') || n.includes('callback')),
		false,
	);
});

test('quicklist constants have no duplicates', () => {
	assert.equal(new Set(QUICKLISTS).size, QUICKLISTS.length);
});
