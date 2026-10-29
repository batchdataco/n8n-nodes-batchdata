import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { collectInputWith } from '../BatchData/catalogExecute';
import { buildRequest, getPath, setPath, toBoolean } from '../BatchData/catalogEngine';
import { catalog, opProperties } from '../BatchData/catalogProperties';
import { credentialTestMethods } from '../BatchData/credentialMethods';
import { batchDataRequest, toNodeApiError } from '../BatchData/GenericFunctions';
import { eventRecord, rememberIds, subscriptionIdFrom } from '../BatchData/triggerSupport';

const op = catalog.triggers.find((t) => t.key === 'monitor_event')!;

export class BatchDataMonitorTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BatchData Monitor Trigger',
		name: 'batchDataMonitorTrigger',
		icon: { light: 'file:batchdata.svg', dark: 'file:batchdata.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: 'Property change',
		description:
			'Starts a workflow when a property matching your criteria changes (instant, BatchData property monitor)',
		defaults: { name: 'BatchData Monitor Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'batchDataApi', required: true, testedBy: 'batchDataApiTest' }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'batchdata-monitor',
			},
		],
		properties: [
			{
				displayName: op.description,
				name: 'notice',
				type: 'notice',
				default: '',
			},
			...opProperties(op, null),
		],
	};

	methods = { credentialTest: credentialTestMethods };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const id = data.subscriptionId as string | undefined;
				if (!id) return false;
				try {
					await batchDataRequest.call(
						this,
						'GET',
						`/api/v2/property-subscription/${encodeURIComponent(id)}`,
					);
					return true;
				} catch (error) {
					const code = String((error as { httpCode?: unknown }).httpCode ?? '');
					if (code === '404') {
						delete data.subscriptionId;
						return false;
					}
					throw toNodeApiError(this, error, 0);
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const input = collectInputWith((name, fallback) => {
					try {
						return this.getNodeParameter(name, fallback);
					} catch {
						return fallback;
					}
				}, op);
				const request = buildRequest(op, input);
				const body = request.body ?? {};
				// The only delivery target is this node's own webhook URL; users cannot supply one.
				setPath(body, 'deliveryConfig', { type: 'webhook', url: this.getNodeWebhookUrl('default') });
				const response = await batchDataRequest.call(this, request.method, request.path, body);
				const id = subscriptionIdFrom(op, response);
				if (!id) {
					throw new NodeOperationError(
						this.getNode(),
						'BatchData did not return a monitor ID, so the monitor could not be tracked',
					);
				}
				this.getWorkflowStaticData('node').subscriptionId = id;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const id = data.subscriptionId as string | undefined;
				if (!id) return true;
				try {
					await batchDataRequest.call(
						this,
						'DELETE',
						(op.http.deletePath as string).replace('{id}', encodeURIComponent(id)),
					);
				} catch (error) {
					if (String((error as { httpCode?: unknown }).httpCode ?? '') !== '404') {
						throw toNodeApiError(this, error, 0);
					}
				}
				delete data.subscriptionId;
				delete data.seenEvents;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const record = eventRecord(this.getBodyData());
		if (!record) return { webhookResponse: { ignored: true } };

		// Delivery is best effort with retries, so the same event can arrive more than once.
		const data = this.getWorkflowStaticData('node');
		const seen = Array.isArray(data.seenEvents) ? (data.seenEvents as string[]) : [];
		const id = String(record.id);
		if (seen.includes(id)) return { webhookResponse: { duplicate: true } };
		data.seenEvents = rememberIds(seen, [id], 1000);

		const wanted = toBoolean(this.getNodeParameter('monitor_event_include_property', false)) === true;
		const hydrate = op.hydrate;
		if (wanted && hydrate && record[hydrate.idField]) {
			try {
				const response = await batchDataRequest.call(this, 'POST', hydrate.path, {
					requests: [{ propertyId: String(record[hydrate.idField]) }],
				});
				const found = getPath(response, hydrate.listPath);
				if (Array.isArray(found) && found.length > 0) record[hydrate.into] = found[0] as IDataObject;
			} catch (error) {
				record.propertyLookupError = String((error as Error).message ?? error).slice(0, 300);
			}
		}
		return { workflowData: [[{ json: record }]] };
	}
}
