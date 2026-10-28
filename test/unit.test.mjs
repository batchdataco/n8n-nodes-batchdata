import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BatchData } from '../dist/nodes/BatchData/BatchData.node.js';
import { BatchDataApi } from '../dist/credentials/BatchDataApi.credentials.js';
import { evaluateCredentialProbe } from '../dist/nodes/BatchData/credentialTest.js';
import { QUICKLISTS } from '../dist/nodes/BatchData/constants.js';

test('credential probe: 400 and 2xx are valid; 401/403 are not', () => {
	assert.equal(evaluateCredentialProbe(400).status, 'OK');
	assert.equal(evaluateCredentialProbe(200).status, 'OK');
	assert.equal(evaluateCredentialProbe(401).status, 'Error');
	assert.equal(evaluateCredentialProbe(403).status, 'Error');
	assert.equal(evaluateCredentialProbe(429).status, 'Error');
	assert.equal(evaluateCredentialProbe(500).status, 'Error');
	assert.equal(evaluateCredentialProbe(0).status, 'Error');
});

test('credential test method posts an empty batch with the bearer token', async () => {
	const node = new BatchData();
	const seen = [];
	const make = (statusCode) => ({
		helpers: {
			request: async (options) => {
				seen.push(options);
				return { statusCode };
			},
		},
	});
	const credential = { data: { apiToken: ' secret-token ' } };
	const ok = await node.methods.credentialTest.batchDataApiTest.call(make(400), credential);
	assert.equal(ok.status, 'OK');
	assert.equal(seen[0].uri, 'https://api.batchdata.com/api/v1/address/verify');
	assert.deepEqual(seen[0].body, { requests: [] });
	assert.equal(seen[0].headers.Authorization, 'Bearer secret-token');
	const bad = await node.methods.credentialTest.batchDataApiTest.call(make(401), credential);
	assert.equal(bad.status, 'Error');
	const empty = await node.methods.credentialTest.batchDataApiTest.call(make(200), { data: {} });
	assert.equal(empty.status, 'Error');
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
		'phone',
		'property',
	]);
	const names = description.properties.map((p) => p.name.toLowerCase());
	assert.equal(
		names.some((n) => n.includes('webhook') || n.includes('callback')),
		false,
	);
	assert.equal(description.credentials[0].testedBy, 'batchDataApiTest');
});

test('quicklist constants have no duplicates', () => {
	assert.equal(new Set(QUICKLISTS).size, QUICKLISTS.length);
});
