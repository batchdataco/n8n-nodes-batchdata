import type { IDataObject } from 'n8n-workflow';

import { getPath, isPlain } from './catalogEngine';
import type { CatalogOp } from './catalogTypes';

/** Stable id for a record or event: the catalog dedupe key, then common id fields. */
export function recordId(record: IDataObject): string | undefined {
	for (const key of ['id', 'eventId', 'event_id', '_id', 'subscriptionId']) {
		const v = record[key];
		if (typeof v === 'string' || typeof v === 'number') return String(v);
	}
	return undefined;
}

/** Keep the most recent `limit` ids. */
export function rememberIds(existing: unknown, add: string[], limit = 2000): string[] {
	const list = Array.isArray(existing) ? (existing as string[]) : [];
	return [...list, ...add].slice(-limit);
}

/** The records of a polling trigger response, each with an `id`. */
export function pollRecords(op: CatalogOp, records: IDataObject[]): IDataObject[] {
	const out = records.map((r) => {
		const id = recordId(r);
		return id === undefined ? r : { ...r, id };
	});
	const sortKey = op.sortDesc;
	if (sortKey) {
		out.sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')));
	}
	return out;
}

/** Turn a monitor event body into a record with a stable `id`. Returns undefined if it is not an event. */
export function eventRecord(body: unknown): IDataObject | undefined {
	if (!isPlain(body)) return undefined;
	const data = body as IDataObject;
	if (data.eventId === undefined && data.propertyId === undefined) return undefined;
	const id = recordId(data);
	if (id !== undefined) return { ...data, id };
	const stable = JSON.stringify([data.propertyId, data.propertyChangedAt, data.addedToSubscriptionIds]);
	return { ...data, id: `evt_${Buffer.from(stable).toString('base64url').slice(0, 24)}` };
}

export const subscriptionIdFrom = (op: CatalogOp, response: unknown): string | undefined => {
	const v = op.http.idPath ? getPath(response, op.http.idPath) : undefined;
	return typeof v === 'string' && v !== '' ? v : undefined;
};
