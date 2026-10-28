import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { collectInputWith } from '../BatchData/catalogExecute';
import { buildRequest, extractResult } from '../BatchData/catalogEngine';
import { catalog, opProperties } from '../BatchData/catalogProperties';
import { credentialTestMethods } from '../BatchData/credentialMethods';
import { batchDataRequest, toNodeApiError } from '../BatchData/GenericFunctions';
import { pollRecords, recordId, rememberIds } from '../BatchData/triggerSupport';

const pollingOps = catalog.triggers.filter((t) => t.mode === 'poll');

export class BatchDataTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BatchData Trigger',
		name: 'batchDataTrigger',
		icon: { light: 'file:batchdata.svg', dark: 'file:batchdata.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: '={{$parameter["event"]}}',
		description:
			'Starts a workflow when a new BatchData search session, property monitor or session property appears (polling)',
		defaults: { name: 'BatchData Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'batchDataApi', required: true, testedBy: 'batchDataApiTest' }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: pollingOps.map((op) => ({
					name: op.label,
					value: op.key,
					description: op.description,
				})),
				default: 'new_search_session',
			},
			...pollingOps.flatMap((op) => opProperties(op, { event: [op.key] })),
		],
	};

	methods = { credentialTest: credentialTestMethods };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const op = pollingOps.find((entry) => entry.key === event);
		if (!op) throw new NodeOperationError(this.getNode(), `Unknown event "${event}"`);

		// A manual test run of a billed trigger returns the sample instead of billing records.
		if (this.getMode() === 'manual' && op.billed) {
			return [[{ json: { ...(op.sample ?? {}) } as IDataObject }]];
		}

		const staticData = this.getWorkflowStaticData('node');
		const seen = Array.isArray(staticData.seen) ? (staticData.seen as string[]) : undefined;
		try {
			const input = collectInputWith((name, fallback) => {
				try {
					return this.getNodeParameter(name, fallback);
				} catch {
					return fallback;
				}
			}, op);
			const request = buildRequest(op, input);
			const response = await batchDataRequest.call(
				this,
				request.method,
				request.path,
				request.body,
				request.qs,
			);
			const records = pollRecords(op, extractResult(op, response, input) as IDataObject[]);
			const ids = records.map((r) => recordId(r)).filter((id): id is string => id !== undefined);

			if (this.getMode() === 'manual') {
				return records.length > 0 ? [records.slice(-1).map((json) => ({ json }))] : null;
			}

			// Lists (sessions, monitors) start from what exists now, so activating does not replay history.
			// A billed session drain only ever returns records it has not delivered before.
			const baseline = seen === undefined && !op.billed;
			const fresh = baseline ? [] : records.filter((r) => !(seen ?? []).includes(recordId(r) ?? ''));
			staticData.seen = rememberIds(seen, ids);
			return fresh.length > 0 ? [fresh.map((json) => ({ json }))] : null;
		} catch (error) {
			throw toNodeApiError(this as never, error, 0);
		}
	}
}
