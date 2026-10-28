import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildAddressVerifyBody,
	buildLookupBody,
	buildSearchBody,
	buildSkipTraceBody,
	extractSkipTraceRecords,
	skipTracePath,
	type LookupIdentifier,
	type SkipTraceVersion,
} from './builders';
import { API_HOST } from './constants';
import { evaluateCredentialProbe } from './credentialTest';
import {
	addressFields,
	addressOperations,
	customApiCallFields,
	customApiCallOperations,
	phoneFields,
	phoneOperations,
} from './descriptions/AddressPhoneDescription';
import {
	propertyLookupFields,
	propertyOperations,
	propertySearchFields,
	propertySkipTraceFields,
} from './descriptions/PropertyDescription';
import {
	assertCustomPath,
	batchDataRequest,
	isPlainObject,
	parseJsonObject,
	splitPhoneNumbers,
	stripForbiddenKeys,
	toNodeApiError,
} from './GenericFunctions';

function asArray(value: unknown): IDataObject[] {
	return Array.isArray(value) ? (value as IDataObject[]) : [];
}

function resultsOf(response: IDataObject, key: string): IDataObject[] {
	const results = response.results;
	return isPlainObject(results) ? asArray(results[key]) : [];
}

export class BatchData implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BatchData',
		name: 'batchData',
		icon: { light: 'file:batchdata.svg', dark: 'file:batchdata.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Search properties, look up property data, find owner contacts, verify addresses and check phone numbers',
		defaults: {
			name: 'BatchData',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'batchDataApi',
				required: true,
				testedBy: 'batchDataApiTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Address', value: 'address' },
					{ name: 'Custom API Call', value: 'customApiCall' },
					{ name: 'Phone', value: 'phone' },
					{ name: 'Property', value: 'property' },
				],
				default: 'property',
			},
			...propertyOperations,
			...propertySearchFields,
			...propertyLookupFields,
			...propertySkipTraceFields,
			...addressOperations,
			...addressFields,
			...phoneOperations,
			...phoneFields,
			...customApiCallOperations,
			...customApiCallFields,
		],
	};

	methods = {
		credentialTest: {
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
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const pairedItem = { item: i };
				const push = (records: IDataObject[]) => {
					for (const json of records) returnData.push({ json, pairedItem });
				};

				if (resource === 'property' && operation === 'search') {
					const searchOptions = this.getNodeParameter('searchOptions', i, {}) as IDataObject;
					const body = buildSearchBody(
						{
							query: this.getNodeParameter('query', i, '') as string,
							quickLists: this.getNodeParameter('quickLists', i, []) as string[],
							excludedQuickLists: this.getNodeParameter('excludedQuickLists', i, []) as string[],
							orQuickLists: this.getNodeParameter('orQuickLists', i, []) as string[],
							filters: this.getNodeParameter('filters', i, {}) as IDataObject,
							additionalCriteria: this.getNodeParameter('additionalCriteria', i, ''),
							take: this.getNodeParameter('take', i, 25) as number,
							skip: searchOptions.skip as number | undefined,
							additionalOptions: searchOptions.additionalOptions,
						},
						this.getNode(),
					);
					const response = await batchDataRequest.call(
						this,
						'POST',
						'/api/v1/property/search',
						body,
					);
					const properties = resultsOf(response, 'properties');
					if (searchOptions.outputMode === 'single') {
						const meta = isPlainObject(response.results) ? response.results.meta : undefined;
						const counts = isPlainObject(meta) && isPlainObject(meta.results) ? meta.results : {};
						push([{ properties, ...counts }]);
					} else {
						push(properties);
					}
				} else if (resource === 'property' && operation === 'lookup') {
					const options = this.getNodeParameter('lookupOptions', i, {}) as IDataObject;
					const identifyBy = this.getNodeParameter('identifyBy', i) as LookupIdentifier;
					const body = buildLookupBody(
						{
							identifyBy,
							address:
								identifyBy === 'address'
									? {
											street: this.getNodeParameter('street', i),
											city: this.getNodeParameter('city', i, ''),
											state: this.getNodeParameter('state', i, ''),
											zip: this.getNodeParameter('zip', i, ''),
										}
									: undefined,
							propertyId:
								identifyBy === 'propertyId'
									? (this.getNodeParameter('propertyId', i) as string)
									: undefined,
							hash:
								identifyBy === 'hash' ? (this.getNodeParameter('hash', i) as string) : undefined,
							apn: identifyBy === 'apn' ? (this.getNodeParameter('apn', i) as string) : undefined,
							countyFipsCode:
								identifyBy === 'apn'
									? (this.getNodeParameter('countyFipsCode', i) as string)
									: undefined,
							requestId: options.requestId as string | undefined,
							includeSkipTrace: options.includeSkipTrace as boolean | undefined,
							datasets: options.datasets as string[] | undefined,
							dateFormat: options.dateFormat as string | undefined,
						},
						this.getNode(),
					);
					const response = await batchDataRequest.call(
						this,
						'POST',
						'/api/v1/property/lookup/all-attributes',
						body,
					);
					push(resultsOf(response, 'properties'));
				} else if (resource === 'property' && operation === 'skipTrace') {
					const version = this.getNodeParameter('skipTraceVersion', i, 'v1') as SkipTraceVersion;
					const findBy = this.getNodeParameter('findBy', i) as 'address' | 'apn';
					const extra = this.getNodeParameter('skipTraceAdditional', i, {}) as IDataObject;
					const body = buildSkipTraceBody({
						version,
						findBy,
						propertyAddress:
							findBy === 'address'
								? {
										street: this.getNodeParameter('street', i),
										city: this.getNodeParameter('city', i, ''),
										state: this.getNodeParameter('state', i, ''),
										zip: this.getNodeParameter('zip', i, ''),
									}
								: undefined,
						apn: findBy === 'apn' ? (this.getNodeParameter('apn', i) as string) : undefined,
						countyFipsCode:
							findBy === 'apn'
								? (this.getNodeParameter('countyFipsCode', i, '') as string)
								: undefined,
						county:
							findBy === 'apn' ? (this.getNodeParameter('county', i, '') as string) : undefined,
						state:
							findBy === 'apn' ? (this.getNodeParameter('apnState', i, '') as string) : undefined,
						ownerFirstName: extra.ownerFirstName as string | undefined,
						ownerLastName: extra.ownerLastName as string | undefined,
						mailingAddress: {
							street: extra.mailingStreet,
							city: extra.mailingCity,
							state: extra.mailingState,
							zip: extra.mailingZip,
						},
						requestId: extra.requestId as string | undefined,
						includeTcpaFlagged: this.getNodeParameter('includeTcpaFlagged', i, false) as boolean,
						prioritizeMobilePhones: extra.prioritizeMobilePhones as boolean | undefined,
					});
					const response = await batchDataRequest.call(this, 'POST', skipTracePath(version), body);
					push(extractSkipTraceRecords(version, response));
				} else if (resource === 'address' && operation === 'verify') {
					const body = buildAddressVerifyBody({
						street: this.getNodeParameter('street', i) as string,
						city: this.getNodeParameter('city', i) as string,
						state: this.getNodeParameter('state', i) as string,
						zip: this.getNodeParameter('zip', i, '') as string,
					});
					const response = await batchDataRequest.call(
						this,
						'POST',
						'/api/v1/address/verify',
						body,
					);
					push(resultsOf(response, 'addresses'));
				} else if (resource === 'phone') {
					const numbers = splitPhoneNumbers(this.getNodeParameter('phoneNumbers', i));
					if (numbers.length === 0) {
						throw new NodeOperationError(this.getNode(), 'Enter at least one phone number', {
							itemIndex: i,
						});
					}
					const response = await batchDataRequest.call(this, 'POST', `/api/v1/phone/${operation}`, {
						requests: numbers,
					});
					push(resultsOf(response, 'phoneNumbers'));
				} else if (resource === 'customApiCall' && operation === 'request') {
					const method = this.getNodeParameter('method', i) as
						| 'DELETE'
						| 'GET'
						| 'PATCH'
						| 'POST'
						| 'PUT';
					const path = assertCustomPath(this.getNodeParameter('path', i) as string);
					const qs = parseJsonObject(
						this.getNodeParameter('queryParameters', i, ''),
						'Query Parameters',
						this.getNode(),
					);
					const rawBody =
						method === 'GET'
							? {}
							: parseJsonObject(this.getNodeParameter('body', i, ''), 'Body', this.getNode());
					const response = await batchDataRequest.call(
						this,
						method,
						path,
						stripForbiddenKeys(rawBody),
						qs,
					);
					push([response]);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation "${operation}" for resource "${resource}"`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				const nodeError = toNodeApiError(this, error, i);
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: nodeError.message,
							...('httpCode' in nodeError && nodeError.httpCode
								? { statusCode: nodeError.httpCode }
								: {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw nodeError;
			}
		}

		return [returnData];
	}
}
