import type { IAuthenticateGeneric, Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

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
}
