import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import catalogJson from './catalog.json';
import type { Catalog, CatalogField, CatalogOp } from './catalogTypes';

export const catalog = catalogJson as unknown as Catalog;

/** Catalog resource key -> n8n resource value. `custom` is the existing Custom API Call resource. */
export const RESOURCE_VALUE: Record<string, string> = {
	property: 'property',
	address: 'address',
	investor: 'investor',
	search_session: 'searchSession',
	monitor: 'propertyMonitor',
	custom: 'customApiCall',
};

/** Resources that are new in v0.2 and need their own resource option. */
export const NEW_RESOURCES: INodePropertyOptions[] = [
	{ name: 'Investor', value: 'investor' },
	{ name: 'Property Monitor', value: 'propertyMonitor' },
	{ name: 'Search Session', value: 'searchSession' },
];

export const paramName = (op: CatalogOp, field: CatalogField): string => `${op.key}_${field.key}`;
export const additionalName = (op: CatalogOp): string => `${op.key}_additional`;

const needsTopLevel = (op: CatalogOp, f: CatalogField): boolean =>
	f.required === true ||
	f.default !== undefined ||
	f.when !== undefined ||
	f.type === 'rows' ||
	(op.requireOneOf ?? []).includes(f.key);

export const isCollected = (op: CatalogOp, f: CatalogField): boolean => !needsTopLevel(op, f);

function scalarProperty(f: CatalogField, name: string): INodeProperties {
	const base = {
		displayName: f.label,
		name,
		description: f.help ?? '',
	};
	switch (f.type) {
		case 'boolean':
			return { ...base, type: 'boolean', default: f.default === true };
		case 'integer':
		case 'number':
			return {
				...base,
				type: 'number',
				default: typeof f.default === 'number' ? f.default : (f.min ?? 0),
				typeOptions: {
					...(f.min !== undefined ? { minValue: f.min } : {}),
					...(f.max !== undefined ? { maxValue: f.max } : {}),
					...(f.type === 'number' ? { numberPrecision: 2 } : {}),
				},
			};
		case 'choice':
			return {
				...base,
				type: 'options',
				default: typeof f.default === 'string' ? f.default : (f.choices?.[0]?.value ?? ''),
				options: (f.choices ?? []).map((c) => ({ name: c.label, value: c.value })),
			};
		case 'list':
			if (f.choices && f.choices.length > 0) {
				return {
					...base,
					type: 'multiOptions',
					default: [],
					options: f.choices.map((c) => ({ name: c.label, value: c.value })),
				};
			}
			return {
				...base,
				type: 'string',
				default: '',
				description: `${f.help ?? ''} Separate several values with commas.`.trim(),
			};
		case 'json':
			return { ...base, type: 'json', default: '' };
		case 'password':
			return { ...base, type: 'string', typeOptions: { password: true }, default: '' };
		case 'text':
			return { ...base, type: 'string', typeOptions: { rows: 4 }, default: '' };
		case 'date':
			return { ...base, type: 'string', default: '', placeholder: 'YYYY-MM-DD' };
		default:
			return {
				...base,
				type: 'string',
				default: typeof f.default === 'string' ? f.default : '',
				...(f.required ? { required: true } : {}),
			};
	}
}

function fieldProperty(op: CatalogOp, f: CatalogField): INodeProperties {
	const name = paramName(op, f);
	if (f.type === 'rows') {
		return {
			displayName: f.label,
			name,
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			default: {},
			required: f.required === true,
			description: f.help ?? '',
			options: [
				{
					displayName: 'Row',
					name: 'rows',
					values: (f.rowFields ?? []).map((rf) => scalarProperty(rf, rf.key)),
				},
			],
		};
	}
	const prop = scalarProperty(f, name);
	if (f.required && prop.type === 'string') prop.required = true;
	if (name === 'delete_search_session_id') {
		prop.typeOptions = { loadOptionsMethod: 'getSearchSessions' };
		prop.type = 'options';
		prop.default = '';
		prop.options = [];
		prop.description = `${f.help ?? ''} Choose a session from the list, or use an expression.`.trim();
	}
	if (name === 'get_monitor_id' || name === 'delete_monitor_id') {
		prop.typeOptions = { loadOptionsMethod: 'getMonitors' };
		prop.type = 'options';
		prop.default = '';
		prop.options = [];
		prop.description = `${f.help ?? ''} Choose a monitor from the list, or use an expression.`.trim();
	}
	return prop;
}

/** The n8n properties (parameters) for one catalog operation. */
export function opProperties(
	op: CatalogOp,
	showOverride?: Record<string, string[]> | null,
): INodeProperties[] {
	const show: Record<string, string[]> | undefined =
		showOverride === undefined
			? { resource: [RESOURCE_VALUE[op.resource ?? '']], operation: [op.key] }
			: (showOverride ?? undefined);
	const out: INodeProperties[] = [];
	for (const f of op.fields) {
		if (!needsTopLevel(op, f)) continue;
		const prop = fieldProperty(op, f);
		if (show) {
			prop.displayOptions = {
				show: f.when ? { ...show, [`${op.key}_${f.when.field}`]: [f.when.equals] } : show,
			};
		}
		out.push(prop);
	}
	const optional = op.fields.filter((f) => !needsTopLevel(op, f));
	if (optional.length > 0) {
		out.push({
			displayName: 'Additional Fields',
			name: additionalName(op),
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			...(show ? { displayOptions: { show } } : {}),
			options: optional.map((f) => {
				const prop = fieldProperty(op, f);
				prop.name = f.key;
				return prop;
			}),
		});
	}
	return out;
}

export function opOption(op: CatalogOp): INodePropertyOptions {
	return { name: op.label, value: op.key, description: op.description, action: op.label };
}

/** Catalog operations that belong to the named n8n resource. */
export const opsFor = (resourceValue: string): CatalogOp[] =>
	catalog.ops.filter((op) => RESOURCE_VALUE[op.resource ?? ''] === resourceValue);

/** A new `operation` property for a resource that did not exist in v0.1. */
export function operationProperty(resourceValue: string, defaultOp: string): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resourceValue] } },
		options: opsFor(resourceValue).map(opOption),
		default: defaultOp,
	};
}

/** Append catalog operations to an existing `operation` property for the resource (in place). */
export function mergeOperations(properties: INodeProperties[], resourceValue: string): void {
	const target = properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resourceValue),
	);
	if (!target || !target.options) return;
	const extra = opsFor(resourceValue).map(opOption);
	const sorted = [...(target.options as INodePropertyOptions[]), ...extra].sort((a, b) =>
		String(a.name).localeCompare(String(b.name)),
	);
	target.options = sorted;
}

export const allCatalogProperties = (): INodeProperties[] => catalog.ops.flatMap((op) => opProperties(op));
