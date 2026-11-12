import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BatchDataApi implements ICredentialType {
	name = 'batchDataApi';

	displayName = 'BatchData API';

	icon: Icon = {
		light: 'file:../nodes/BatchData/batchdata.svg',
		dark: 'file:../nodes/BatchData/batchdata.dark.svg',
	};

	documentationUrl = 'https://developer.batchdata.com';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your BatchData API token. Create one in your BatchData account under API tokens. The token needs permission for each endpoint you call.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	// Lists search sessions (read-only, does not bill property records): a valid token gets
	// 200, a bad token gets 401. The Bearer header from `authenticate` is applied to this request.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.batchdata.com/api',
			url: '/v2/property/search-sessions',
			method: 'GET',
			headers: { Accept: 'application/json' },
			qs: { take: 1 },
		},
		rules: [
			{
				type: 'responseCode',
				properties: { value: 401, message: 'The API token was rejected (401). Check the token.' },
			},
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message:
						'The API token was refused (403). The credential test lists search sessions, so the token needs the property search sessions permission. Questions: support@batchservice.com',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 429,
					message: 'Rate limit reached (429). Try the test again shortly.',
				},
			},
		],
	};
}
