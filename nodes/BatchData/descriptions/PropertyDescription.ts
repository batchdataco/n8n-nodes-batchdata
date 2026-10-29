import type { INodeProperties } from 'n8n-workflow';

import { LOOKUP_DATASETS, QUICKLISTS } from '../constants';

const quicklistOptions = QUICKLISTS.map((value) => ({
	name: value
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' '),
	value,
}));

const datasetOptions = LOOKUP_DATASETS.map((value) => ({
	name: value
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' '),
	value,
}));

const showFor = (operation: string) => ({ resource: ['property'], operation: [operation] });

export const propertyOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['property'] } },
		options: [
			{
				name: 'Look Up',
				value: 'lookup',
				description:
					'Get all attributes for one property. Billed per returned property record. Enabling Include Contact Info adds contact-enrichment cost.',
				action: 'Look up a property',
			},
			{
				name: 'Search',
				value: 'search',
				description:
					'Search properties by criteria. Billed per returned property record; a count-only request (Limit = 0) is billed as one record.',
				action: 'Search properties',
			},
			{
				name: 'Skip Trace',
				value: 'skipTrace',
				description:
					'Find owner contact details (phones and emails) for a property. Billed per matched result.',
				action: 'Skip trace a property',
			},
		],
		default: 'search',
	},
];

export const propertySearchFields: INodeProperties[] = [
	{
		displayName: 'Location Query',
		name: 'query',
		type: 'string',
		default: '',
		placeholder: 'Phoenix, AZ',
		description:
			'A partial USPS address (city, state, ZIP) that limits results to a region. Combined with the other criteria.',
		displayOptions: { show: showFor('search') },
	},
	{
		displayName: 'Quicklists',
		name: 'quickLists',
		type: 'multiOptions',
		options: quicklistOptions,
		default: [],
		description:
			'Named queries that must ALL match (AND). Choose from the list, or use an expression.',
		displayOptions: { show: showFor('search') },
	},
	{
		displayName: 'Excluded Quicklists',
		name: 'excludedQuickLists',
		type: 'multiOptions',
		options: quicklistOptions,
		default: [],
		description: 'Named queries that must NOT match. Sent to the API with the "not-" prefix.',
		displayOptions: { show: showFor('search') },
	},
	{
		displayName: 'Any-Of Quicklists',
		name: 'orQuickLists',
		type: 'multiOptions',
		options: quicklistOptions,
		default: [],
		description: 'Named queries where at least ONE must match (OR)',
		displayOptions: { show: showFor('search') },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showFor('search') },
		options: [
			{ displayName: 'Bathrooms Max', name: 'bathroomsMax', type: 'number', default: 0 },
			{ displayName: 'Bathrooms Min', name: 'bathroomsMin', type: 'number', default: 0 },
			{ displayName: 'Bedrooms Max', name: 'bedroomsMax', type: 'number', default: 0 },
			{ displayName: 'Bedrooms Min', name: 'bedroomsMin', type: 'number', default: 0 },
			{
				displayName: 'Equity Percent Max',
				name: 'equityPercentMax',
				type: 'number',
				default: 100,
			},
			{
				displayName: 'Equity Percent Min',
				name: 'equityPercentMin',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Estimated Value Max',
				name: 'estimatedValueMax',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Estimated Value Min',
				name: 'estimatedValueMin',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Last Sale Date From',
				name: 'lastSaleDateFrom',
				type: 'dateTime',
				default: '',
				description: 'Earliest last-sale date. Sent as YYYY-MM-DD.',
			},
			{
				displayName: 'Last Sale Date To',
				name: 'lastSaleDateTo',
				type: 'dateTime',
				default: '',
				description: 'Latest last-sale date. Sent as YYYY-MM-DD.',
			},
			{
				displayName: 'Living Area Max (Sq Ft)',
				name: 'livingAreaMax',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Living Area Min (Sq Ft)',
				name: 'livingAreaMin',
				type: 'number',
				default: 0,
			},
			{ displayName: 'Lot Size Max (Acres)', name: 'lotSizeAcresMax', type: 'number', default: 0 },
			{ displayName: 'Lot Size Min (Acres)', name: 'lotSizeAcresMin', type: 'number', default: 0 },
			{
				displayName: 'Owner Occupied',
				name: 'ownerOccupied',
				type: 'boolean',
				default: true,
				description: 'Whether the property is occupied by its owner',
			},
			{
				displayName: 'Property Type Category',
				name: 'propertyTypeCategory',
				type: 'string',
				default: '',
				description: 'Exact property type category value, for example "Single Family"',
			},
			{
				displayName: 'Property Type Detail',
				name: 'propertyTypeDetail',
				type: 'string',
				default: '',
				description: 'Exact property type detail value',
			},
			{ displayName: 'Year Built Max', name: 'yearBuiltMax', type: 'number', default: 0 },
			{ displayName: 'Year Built Min', name: 'yearBuiltMin', type: 'number', default: 0 },
		],
	},
	{
		displayName: 'Additional Search Criteria (JSON)',
		name: 'additionalCriteria',
		type: 'json',
		default: '',
		placeholder: '{"listing": {"status": {"inList": ["Active"]}}}',
		description:
			'Extra searchCriteria merged into the request. Fields set above win over the same fields here.',
		displayOptions: { show: showFor('search') },
	},
	{
		displayName: 'Limit',
		name: 'take',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 100 },
		default: 25,
		description:
			'Max number of results to return (0 to 100). A value of 0 returns only the count and is billed as one record.',
		displayOptions: { show: showFor('search') },
	},
	{
		displayName: 'Options',
		name: 'searchOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('search') },
		options: [
			{
				displayName: 'Additional Request Options (JSON)',
				name: 'additionalOptions',
				type: 'json',
				default: '',
				description:
					'Extra fields merged into the request "options" object. Webhook and callback fields are removed.',
			},
			{
				displayName: 'Output Mode',
				name: 'outputMode',
				type: 'options',
				options: [
					{ name: 'One Item per Property', value: 'items' },
					{ name: 'Single Item with Results and Counts', value: 'single' },
				],
				default: 'items',
				description:
					'The single-item mode also returns resultCount and resultsFound from the response',
			},
			{
				displayName: 'Skip',
				name: 'skip',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of results to skip, for paging',
			},
		],
	},
];

export const propertyLookupFields: INodeProperties[] = [
	{
		displayName: 'Identify Property By',
		name: 'identifyBy',
		type: 'options',
		options: [
			{ name: 'Address', value: 'address' },
			{ name: 'Address Hash', value: 'hash' },
			{ name: 'APN and County FIPS Code', value: 'apn' },
			{ name: 'Property ID', value: 'propertyId' },
		],
		default: 'address',
		description: 'Exactly one identifier is sent per property',
		displayOptions: { show: showFor('lookup') },
	},
	{
		displayName: 'Street',
		name: 'street',
		type: 'string',
		default: '',
		required: true,
		placeholder: '26823 N 31st Dr',
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['address'] } },
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['address'] } },
	},
	{
		displayName: 'State',
		name: 'state',
		type: 'string',
		default: '',
		placeholder: 'AZ',
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['address'] } },
	},
	{
		displayName: 'ZIP',
		name: 'zip',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['address'] } },
	},
	{
		displayName: 'Property ID',
		name: 'propertyId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['propertyId'] } },
	},
	{
		displayName: 'Address Hash',
		name: 'hash',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['hash'] } },
	},
	{
		displayName: 'APN',
		name: 'apn',
		type: 'string',
		default: '',
		required: true,
		description: 'Assessor parcel number',
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['apn'] } },
	},
	{
		displayName: 'County FIPS Code',
		name: 'countyFipsCode',
		type: 'string',
		default: '',
		required: true,
		placeholder: '04013',
		displayOptions: { show: { ...showFor('lookup'), identifyBy: ['apn'] } },
	},
	{
		displayName: 'Options',
		name: 'lookupOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('lookup') },
		options: [
			{
				displayName: 'Datasets',
				name: 'datasets',
				type: 'multiOptions',
				options: datasetOptions,
				default: [],
				description:
					'Limit the response to these datasets. "Basic" and "Core" cannot be combined, and "Parcel Boundary" is not available yet.',
			},
			{
				displayName: 'Date Format',
				name: 'dateFormat',
				type: 'options',
				options: [
					{ name: 'Date and Time', value: 'iso-date-time' },
					{ name: 'Date Only', value: 'iso-date' },
				],
				default: 'iso-date-time',
			},
			{
				displayName: 'Include Contact Info (Skip Trace)',
				name: 'includeSkipTrace',
				type: 'boolean',
				default: false,
				description:
					'Whether to add owner contact details to the result. This adds contact-enrichment cost to each record.',
			},
			{
				displayName: 'Request ID',
				name: 'requestId',
				type: 'string',
				default: '',
				description: 'Your own ID, echoed back by the API to match results to requests',
			},
		],
	},
];

export const propertySkipTraceFields: INodeProperties[] = [
	{
		displayName: 'API Version',
		name: 'skipTraceVersion',
		type: 'options',
		options: [
			{ name: 'V1 (One Person per Property)', value: 'v1' },
			{ name: 'V3 (Up to 3 Persons per Property)', value: 'v3' },
		],
		default: 'v1',
		description:
			'V1 returns one person per property. V3 returns up to three. The response shapes differ: V1 lists phones in phoneNumbers, V3 in phones.',
		displayOptions: { show: showFor('skipTrace') },
	},
	{
		displayName: 'Include TCPA-Flagged Phones',
		name: 'includeTcpaFlagged',
		type: 'boolean',
		default: false,
		description:
			'Whether to include phone numbers flagged under TCPA. Off by default on both API versions: the raw API defaults differ (V1 excludes them, V3 includes them), so this node always sends the setting explicitly. Turn on only with a documented compliance basis. Flagged numbers carry tcpa: true.',
		displayOptions: { show: showFor('skipTrace') },
	},
	{
		displayName: 'Find By',
		name: 'findBy',
		type: 'options',
		options: [
			{ name: 'Property Address', value: 'address' },
			{ name: 'APN', value: 'apn' },
		],
		default: 'address',
		displayOptions: { show: showFor('skipTrace') },
	},
	{
		displayName: 'Street',
		name: 'street',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['address'] } },
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
		description: 'Provide City and State, or ZIP',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['address'] } },
	},
	{
		displayName: 'State',
		name: 'state',
		type: 'string',
		default: '',
		placeholder: 'IL',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['address'] } },
	},
	{
		displayName: 'ZIP',
		name: 'zip',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['address'] } },
	},
	{
		displayName: 'APN',
		name: 'apn',
		type: 'string',
		default: '',
		required: true,
		description: 'Assessor parcel number. Also provide County FIPS Code, or County and State.',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['apn'] } },
	},
	{
		displayName: 'County FIPS Code',
		name: 'countyFipsCode',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['apn'] } },
	},
	{
		displayName: 'County',
		name: 'county',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['apn'] } },
	},
	{
		displayName: 'APN State',
		name: 'apnState',
		type: 'string',
		default: '',
		placeholder: 'NY',
		displayOptions: { show: { ...showFor('skipTrace'), findBy: ['apn'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'skipTraceAdditional',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('skipTrace') },
		options: [
			{ displayName: 'Mailing City', name: 'mailingCity', type: 'string', default: '' },
			{ displayName: 'Mailing State', name: 'mailingState', type: 'string', default: '' },
			{
				displayName: 'Mailing Street',
				name: 'mailingStreet',
				type: 'string',
				default: '',
				description:
					'Owner mailing address. The street is required when any mailing field is used.',
			},
			{ displayName: 'Mailing ZIP', name: 'mailingZip', type: 'string', default: '' },
			{ displayName: 'Owner First Name', name: 'ownerFirstName', type: 'string', default: '' },
			{ displayName: 'Owner Last Name', name: 'ownerLastName', type: 'string', default: '' },
			{
				displayName: 'Prioritize Mobile Phones',
				name: 'prioritizeMobilePhones',
				type: 'boolean',
				default: true,
				description: 'Whether to list mobile phones first. The API default is on.',
			},
			{
				displayName: 'Request ID',
				name: 'requestId',
				type: 'string',
				default: '',
				description: 'Your own ID, echoed back by the API',
			},
		],
	},
];
