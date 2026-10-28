import type { INodeProperties } from 'n8n-workflow';

export const addressOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['address'] } },
		options: [
			{
				name: 'Verify',
				value: 'verify',
				description:
					'Verify and standardize a US address to USPS conventions. Billed per requested address.',
				action: 'Verify an address',
			},
		],
		default: 'verify',
	},
];

export const addressFields: INodeProperties[] = [
	{
		displayName: 'Street',
		name: 'street',
		type: 'string',
		default: '',
		required: true,
		placeholder: '2800 N 24th St',
		displayOptions: { show: { resource: ['address'], operation: ['verify'] } },
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['address'], operation: ['verify'] } },
	},
	{
		displayName: 'State',
		name: 'state',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'AZ',
		displayOptions: { show: { resource: ['address'], operation: ['verify'] } },
	},
	{
		displayName: 'ZIP',
		name: 'zip',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['address'], operation: ['verify'] } },
	},
];

export const phoneOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['phone'] } },
		options: [
			{
				name: 'Check DNC',
				value: 'dnc',
				description:
					'Check phone numbers against the Do Not Call list. Billed per requested phone number. Results are point-in-time.',
				action: 'Check phone numbers against DNC',
			},
			{
				name: 'Check TCPA',
				value: 'tcpa',
				description:
					'Check phone numbers for TCPA litigator flags. Billed per requested phone number. Results are point-in-time.',
				action: 'Check phone numbers for TCPA',
			},
			{
				name: 'Verify',
				value: 'verification',
				description:
					'Check whether phone numbers are reachable and get line type and carrier. Billed per requested phone number. Results are point-in-time.',
				action: 'Verify phone numbers',
			},
		],
		default: 'verification',
	},
];

export const phoneFields: INodeProperties[] = [
	{
		displayName: 'Phone Numbers',
		name: 'phoneNumbers',
		type: 'string',
		default: '',
		required: true,
		placeholder: '6027828692, 6462467560',
		description:
			'One or more 10-digit phone numbers, separated by commas. Results can change at any time, so re-check before each campaign.',
		displayOptions: { show: { resource: ['phone'] } },
	},
];

export const customApiCallOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['customApiCall'] } },
		options: [
			{
				name: 'Make a Custom API Call',
				value: 'request',
				description:
					'Call any BatchData API endpoint under /api/. Billing follows the endpoint you call. Wallet endpoints are blocked.',
				action: 'Make a custom API call',
			},
		],
		default: 'request',
	},
];

export const customApiCallFields: INodeProperties[] = [
	{
		displayName: 'Method',
		name: 'method',
		type: 'options',
		options: [
			{ name: 'DELETE', value: 'DELETE' },
			{ name: 'GET', value: 'GET' },
			{ name: 'PATCH', value: 'PATCH' },
			{ name: 'POST', value: 'POST' },
			{ name: 'PUT', value: 'PUT' },
		],
		default: 'POST',
		displayOptions: { show: { resource: ['customApiCall'] } },
	},
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		default: '/api/v1/address/verify',
		required: true,
		placeholder: '/api/v1/property/search',
		description:
			'Path on api.batchdata.com. Must start with /api/. The host is fixed; the token from your credential is added automatically.',
		displayOptions: { show: { resource: ['customApiCall'] } },
	},
	{
		displayName: 'Query Parameters (JSON)',
		name: 'queryParameters',
		type: 'json',
		default: '',
		displayOptions: { show: { resource: ['customApiCall'] } },
	},
	{
		displayName: 'Body (JSON)',
		name: 'body',
		type: 'json',
		default: '',
		description:
			'Request body. Webhook and callback fields (webhookUrl, errorWebhookUrl) are removed.',
		displayOptions: {
			show: { resource: ['customApiCall'], method: ['POST', 'PUT', 'PATCH', 'DELETE'] },
		},
	},
];
