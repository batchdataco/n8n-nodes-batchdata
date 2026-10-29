import type { IDataObject, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	deepMerge,
	isPlainObject,
	parseJsonObject,
	removeEmpty,
	stripForbiddenKeys,
	toDateOnly,
} from './GenericFunctions';

export type SkipTraceVersion = 'v1' | 'v3';

function range(min: unknown, max: unknown): IDataObject | undefined {
	const out: IDataObject = {};
	if (min !== undefined && min !== null && min !== '') out.min = Number(min);
	if (max !== undefined && max !== null && max !== '') out.max = Number(max);
	return Object.keys(out).length > 0 ? out : undefined;
}

function dateRange(from: unknown, to: unknown): IDataObject | undefined {
	const out: IDataObject = {};
	const minDate = toDateOnly(from);
	const maxDate = toDateOnly(to);
	if (minDate) out.minDate = minDate;
	if (maxDate) out.maxDate = maxDate;
	return Object.keys(out).length > 0 ? out : undefined;
}

function setIf(target: IDataObject, key: string, value: IDataObject | undefined) {
	if (value !== undefined) target[key] = value;
}

export interface SearchInput {
	query?: string;
	quickLists?: string[];
	excludedQuickLists?: string[];
	orQuickLists?: string[];
	filters?: IDataObject;
	additionalCriteria?: unknown;
	take?: number;
	skip?: number;
	additionalOptions?: unknown;
}

export function buildSearchBody(input: SearchInput, node: INode): IDataObject {
	const filters = input.filters ?? {};

	const building: IDataObject = {};
	setIf(building, 'bedroomCount', range(filters.bedroomsMin, filters.bedroomsMax));
	setIf(building, 'bathroomCount', range(filters.bathroomsMin, filters.bathroomsMax));
	setIf(building, 'yearBuilt', range(filters.yearBuiltMin, filters.yearBuiltMax));
	setIf(building, 'livingAreaSquareFeet', range(filters.livingAreaMin, filters.livingAreaMax));

	const general: IDataObject = {};
	if (filters.propertyTypeCategory) {
		general.propertyTypeCategory = { equals: String(filters.propertyTypeCategory) };
	}
	if (filters.propertyTypeDetail) {
		general.propertyTypeDetail = { equals: String(filters.propertyTypeDetail) };
	}

	const lot: IDataObject = {};
	setIf(lot, 'lotSizeAcres', range(filters.lotSizeAcresMin, filters.lotSizeAcresMax));

	const valuation: IDataObject = {};
	setIf(valuation, 'estimatedValue', range(filters.estimatedValueMin, filters.estimatedValueMax));
	setIf(valuation, 'equityPercent', range(filters.equityPercentMin, filters.equityPercentMax));

	const sale: IDataObject = {};
	setIf(sale, 'lastSaleDate', dateRange(filters.lastSaleDateFrom, filters.lastSaleDateTo));

	const owner: IDataObject = {};
	if (typeof filters.ownerOccupied === 'boolean') {
		owner.ownerOccupied = { equals: filters.ownerOccupied };
	}

	const quickLists = [
		...(input.quickLists ?? []),
		...(input.excludedQuickLists ?? []).map((entry) => `not-${entry}`),
	];

	const structured: IDataObject = {};
	if (input.query) structured.query = input.query;
	if (quickLists.length > 0) structured.quickLists = quickLists;
	if (input.orQuickLists && input.orQuickLists.length > 0) {
		structured.orQuickLists = input.orQuickLists;
	}
	if (Object.keys(building).length > 0) structured.building = building;
	if (Object.keys(general).length > 0) structured.general = general;
	if (Object.keys(lot).length > 0) structured.lot = lot;
	if (Object.keys(valuation).length > 0) structured.valuation = valuation;
	if (Object.keys(sale).length > 0) structured.sale = sale;
	if (Object.keys(owner).length > 0) structured.owner = owner;

	const extra = parseJsonObject(input.additionalCriteria, 'Additional Search Criteria', node);
	const searchCriteria = deepMerge(extra, structured);

	const options: IDataObject = {};
	if (input.take !== undefined) options.take = Number(input.take);
	if (input.skip !== undefined && Number(input.skip) > 0) options.skip = Number(input.skip);
	const extraOptions = parseJsonObject(input.additionalOptions, 'Additional Options', node);
	const mergedOptions = deepMerge(extraOptions, options);

	return stripForbiddenKeys({ searchCriteria, options: mergedOptions }) as IDataObject;
}

export type LookupIdentifier = 'address' | 'propertyId' | 'apn' | 'hash';

export interface LookupInput {
	identifyBy: LookupIdentifier;
	address?: IDataObject;
	propertyId?: string;
	hash?: string;
	apn?: string;
	countyFipsCode?: string;
	requestId?: string;
	includeSkipTrace?: boolean;
	datasets?: string[];
	dateFormat?: string;
}

export function buildLookupBody(input: LookupInput, node: INode): IDataObject {
	const request: IDataObject = {};
	switch (input.identifyBy) {
		case 'address':
			request.address = removeEmpty(input.address ?? {});
			break;
		case 'propertyId':
			request.propertyId = input.propertyId;
			break;
		case 'hash':
			request.hash = input.hash;
			break;
		case 'apn':
			request.apn = input.apn;
			request.countyFipsCode = input.countyFipsCode;
			break;
	}
	if (input.requestId) request.requestId = input.requestId;

	const datasets = input.datasets ?? [];
	if (datasets.includes('basic') && datasets.includes('core')) {
		throw new NodeOperationError(node, 'The "basic" and "core" datasets cannot be combined');
	}
	const options: IDataObject = {};
	if (input.includeSkipTrace) options.skipTrace = true;
	if (datasets.length > 0) options.datasets = datasets;
	if (input.dateFormat) options.dateFormat = input.dateFormat;

	const body: IDataObject = { requests: [removeEmpty(request)] };
	if (Object.keys(options).length > 0) body.options = options;
	return body;
}

export interface SkipTraceInput {
	version: SkipTraceVersion;
	findBy: 'address' | 'apn';
	propertyAddress?: IDataObject;
	apn?: string;
	countyFipsCode?: string;
	county?: string;
	state?: string;
	ownerFirstName?: string;
	ownerLastName?: string;
	mailingAddress?: IDataObject;
	requestId?: string;
	includeTcpaFlagged?: boolean;
	prioritizeMobilePhones?: boolean;
}

export function buildSkipTraceBody(input: SkipTraceInput): IDataObject {
	const request: IDataObject = {};
	if (input.findBy === 'address') {
		request.propertyAddress = removeEmpty(input.propertyAddress ?? {});
	} else {
		request.apn = input.apn;
		if (input.countyFipsCode) request.countyFipsCode = input.countyFipsCode;
		if (input.county) request.county = input.county;
		if (input.state) request.state = input.state;
	}
	if (input.ownerFirstName || input.ownerLastName) {
		request.name = removeEmpty({ first: input.ownerFirstName, last: input.ownerLastName });
	}
	const mailing = removeEmpty(input.mailingAddress ?? {});
	if (Object.keys(mailing).length > 0) request.mailingAddress = mailing;
	if (input.requestId) request.requestId = input.requestId;

	const options: IDataObject = {
		includeTCPABlacklistedPhones: input.includeTcpaFlagged === true,
	};
	if (typeof input.prioritizeMobilePhones === 'boolean') {
		options.prioritizeMobilePhones = input.prioritizeMobilePhones;
	}
	return { requests: [removeEmpty(request)], options };
}

export function skipTracePath(version: SkipTraceVersion): string {
	return version === 'v3' ? '/api/v3/property/skip-trace' : '/api/v1/property/skip-trace';
}

/**
 * One output record per person. V1 and V3 person objects differ (V1: phoneNumbers[],
 * V3: phones[]); each is passed through untouched next to its version marker.
 */
export function extractSkipTraceRecords(
	version: SkipTraceVersion,
	response: IDataObject,
): IDataObject[] {
	if (version === 'v1') {
		const results = response.results;
		const persons = isPlainObject(results) && Array.isArray(results.persons) ? results.persons : [];
		return (persons as IDataObject[]).map((person) => ({
			apiVersion: 'v1',
			propertyAddress: person.propertyAddress ?? null,
			person,
		}));
	}
	const result = response.result;
	const data = isPlainObject(result) && Array.isArray(result.data) ? result.data : [];
	const records: IDataObject[] = [];
	for (const entry of data as IDataObject[]) {
		const persons = Array.isArray(entry.persons) ? (entry.persons as IDataObject[]) : [];
		for (const person of persons) {
			records.push({
				apiVersion: 'v3',
				input: entry.input ?? null,
				property: entry.property ?? null,
				person,
			});
		}
	}
	return records;
}

export function buildAddressVerifyBody(input: {
	street: string;
	city: string;
	state: string;
	zip?: string;
	requestId?: string;
}): IDataObject {
	return { requests: [removeEmpty({ ...input })] };
}
