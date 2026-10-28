/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { additionalName, isCollected, paramName } from './catalogProperties';
import { buildRequest, extractResult } from './catalogEngine';
import type { CatalogOp } from './catalogTypes';
import { batchDataRequest } from './GenericFunctions';

/** Reads a node parameter by name; a missing parameter yields the fallback. */
export type ParamReader = (name: string, fallback: unknown) => unknown;

/** Read the node parameters of one catalog operation into the engine's input object. */
export function collectInputWith(read: ParamReader, op: CatalogOp): IDataObject {
	const additional = read(additionalName(op), {}) as IDataObject;
	const input: IDataObject = {};
	for (const f of op.fields) {
		let value: any;
		if (isCollected(op, f)) {
			value = additional[f.key];
		} else {
			value = read(paramName(op, f), '');
			if (f.type === 'rows') value = (value as IDataObject | undefined)?.rows ?? [];
		}
		if (value !== undefined) input[f.key] = value;
	}
	return input;
}

export function collectInput(ctx: IExecuteFunctions, op: CatalogOp, itemIndex: number): IDataObject {
	return collectInputWith((name, fallback) => ctx.getNodeParameter(name, itemIndex, fallback), op);
}

/** Run one catalog operation for one input item and return its result records. */
export async function runCatalogOperation(
	ctx: IExecuteFunctions,
	op: CatalogOp,
	itemIndex: number,
): Promise<IDataObject[]> {
	const input = collectInput(ctx, op, itemIndex);
	const request = buildRequest(op, input);
	const response = await batchDataRequest.call(
		ctx,
		request.method,
		request.path,
		request.body,
		request.qs,
	);
	return extractResult(op, response, input) as IDataObject[];
}
