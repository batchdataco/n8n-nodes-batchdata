export interface CatalogChoice {
	value: string;
	label: string;
}

export interface CatalogField {
	key: string;
	label: string;
	type:
		| 'string'
		| 'text'
		| 'password'
		| 'integer'
		| 'number'
		| 'boolean'
		| 'choice'
		| 'list'
		| 'date'
		| 'json'
		| 'rows';
	required?: boolean;
	path?: string;
	help?: string;
	default?: string | number | boolean;
	emit?: string;
	choices?: CatalogChoice[];
	min?: number;
	max?: number;
	rowFields?: CatalogField[];
	merge?: boolean;
	first?: boolean;
	in?: 'path' | 'query';
	qs?: string;
	pattern?: string;
	when?: { field: string; equals: string };
	local?: boolean;
}

export interface CatalogResult {
	list?: string;
	item?: string;
	compose?: Record<string, string>;
	static?: Record<string, unknown>;
	echo?: Record<string, string>;
	attach?: Record<string, string>;
	idFrom?: Record<string, string>;
	filter?: { path: string; equals: unknown };
}

export interface CatalogOp {
	key: string;
	resource?: string;
	kind?: 'search' | 'action';
	mode?: 'poll' | 'hook';
	noun: string;
	label: string;
	description: string;
	billed?: boolean;
	skipTraceLike?: boolean;
	mockedOnly?: boolean;
	http: {
		method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
		path: string;
		deletePath?: string;
		idPath?: string;
	};
	fixed?: Array<{ path: string; value: unknown }>;
	fixedQuery?: Record<string, string | number | boolean>;
	requireOneOf?: string[];
	fields: CatalogField[];
	result?: CatalogResult;
	sample?: Record<string, unknown>;
	dedupe?: string;
	sortDesc?: string;
	hydrate?: { path: string; idField: string; listPath: string; into: string };
}

export interface ApiGuard {
	mustStartWith: string;
	blockedPathContains: string[];
	blockedPathSegments: string[];
	blockedWrites: Array<{ pathContains: string; methods: string[] }>;
}

export interface Catalog {
	meta: { version: string; supportEmail: string; quickLists: string[] };
	ops: CatalogOp[];
	triggers: CatalogOp[];
	apiRequest: { guard: ApiGuard } & Record<string, unknown>;
}
