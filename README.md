# n8n-nodes-batchdata

Three [n8n](https://n8n.io) community nodes for the [BatchData](https://batchdata.io) API: **BatchData** (actions), **BatchData Trigger** (polling) and **BatchData Monitor Trigger** (instant). Search properties, pull full property data, find owner contacts, check permits, find investors, verify addresses and phones, run search sessions and monitor properties inside your workflows.

> Status: Published on npm as `n8n-nodes-batchdata` and verified by n8n (available on n8n Cloud).

## Install

In n8n, go to **Settings > Community Nodes > Install** and enter `n8n-nodes-batchdata`. See the [n8n community node guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

Create a **BatchData API** credential and paste your API token (the same token you use as `Authorization: Bearer <token>`). Tokens are created in your BatchData account. API reference: [developer.batchdata.com](https://developer.batchdata.com).

**Test button** (`credentials/BatchDataApi.credentials.ts`). The test sends `GET https://api.batchdata.com/api/v2/property/search-sessions?take=1` with the Bearer header from the credential. A valid token gets HTTP 200. A rejected token gets 401 ("The API token was rejected"). 403 means the token lacks the property search sessions permission, which this test needs. 429 means the rate limit was reached. The call only lists search sessions; per CHANGELOG 0.2.3 it does not bill property records. Since 0.2.3 the nodes have no node-level `testedBy` method, so this credential test is the single check.

## Operations

| Resource        | Operation              | Endpoint                                                                      | Billing (per the API docs)                                                              |
| --------------- | ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Property        | Search                 | `POST /api/v1/property/search`                                                | Per returned property record. A count-only request (Limit = 0) is billed as one record. |
| Property        | Look Up                | `POST /api/v1/property/lookup/all-attributes`                                 | Per returned property record. "Include Contact Info" adds contact-enrichment cost.      |
| Property        | Skip Trace             | `POST /api/v1/property/skip-trace` (V1) or `/api/v3/property/skip-trace` (V3) | Per matched result.                                                                     |
| Address         | Verify                 | `POST /api/v1/address/verify`                                                 | Per requested address.                                                                  |
| Phone           | Verify                 | `POST /api/v1/phone/verification`                                             | Per requested phone number.                                                             |
| Phone           | Check DNC              | `POST /api/v1/phone/dnc`                                                      | Per requested phone number.                                                             |
| Phone           | Check TCPA             | `POST /api/v1/phone/tcpa`                                                     | Per requested phone number.                                                             |
| Custom API Call | Make                   | Any `/api/...` path                                                           | Follows the endpoint you call.                                                          |

Each input item makes one API call. Search returns one output item per property (or a single item with counts, via **Options > Output Mode**). Skip trace returns one item per person found. Phone and address operations return one item per result. Every output item is linked to its input item.

All operations honor **Continue On Fail**: the failed item returns `{ "error": "...", "statusCode": "..." }`.

### Property > Search

Filters are built for you (location query, quicklists, bedrooms, bathrooms, year built, living area, lot size, estimated value, equity percent, last sale date, owner occupied, property type). For anything else, paste extra `searchCriteria` JSON in **Additional Search Criteria**. Fields you set in the form win over the same fields in the JSON. **Limit** is 0 to 100 (default 1, to avoid unexpected billing).

### Default limits

Each limit caps the results one run returns: property records for Property > Search, sessions for List Search Sessions, and address suggestions for Autocomplete Address. Per the module descriptions in the shared catalog, List Search Sessions does not bill property records and Autocomplete Address is billed per call. The two Include settings are off by default; Include Property Record (Billed) adds a property lookup per event, billed per matched property.

| Operation | Field | Default |
| --- | --- | --- |
| Property > Search | Limit | 1 |
| Property > Get Property Permits | Limit | 1 |
| Investor > Find Investors (Buy Box) | Limit | 1 |
| Investor > Get Investor Properties | Limit | 1 |
| Search Session > Create or Advance Search Session | Limit | 1 |
| Address > Autocomplete Address | Limit | 5 |
| Search Session > List Search Sessions | Limit | 50 |
| BatchData Trigger > New Property in Search Session (Billed) | Limit | 5 |
| Skip Trace, Batch Skip Trace, Reverse Skip Trace | Include TCPA-Flagged Phones | off |
| BatchData Monitor Trigger | Include Property Record (Billed) | off |

### Property > Skip Trace and the TCPA setting

The two API versions behave differently by default:

- V1 excludes TCPA-flagged phone numbers unless asked to include them.
- V3 includes them unless asked to exclude them.

This node always sends the setting explicitly, so both versions behave the same. **Include TCPA-Flagged Phones** is **off** by default. Turn it on only if you have a documented compliance basis. Flagged numbers carry `tcpa: true` in the result.

The result shapes also differ: V1 persons list phones in `phoneNumbers`, V3 persons list them in `phones`. The node returns each person untouched next to an `apiVersion` field (`v1` or `v3`).

### Phone checks

Phone results are a point-in-time answer. Re-check before each campaign. You are responsible for meeting TCPA, DNC and other calling rules in your jurisdiction.

### Custom API Call

Calls any path under `https://api.batchdata.com/api/`. The host is fixed and the token is added from your credential. Wallet endpoints are blocked, and `webhookUrl` / `errorWebhookUrl` are removed from the body because webhook delivery only applies to asynchronous requests, which this node does not support.

## Use as an AI Agent tool

The BatchData node has `usableAsTool` set. Connect it to the **Tool** input of an **AI Agent** node.

1. Pick the resource and operation, for example Address > Verify.
2. For each field the model must fill, click the sparkle button "Let the model define this parameter". n8n then writes a `$fromAI()` expression, such as `{{ $fromAI('street', 'Street address', 'string') }}`.
3. Give the tool a clear description so the model knows when to call it.

A BatchData sandbox token returns mock data and does not bill your account. Test the agent with a sandbox token first.

If the API answers with an error object, the tool returns an error to the agent, not an empty result.

See [examples/ai-agent-address-tool.workflow.json](examples/ai-agent-address-tool.workflow.json). Import it with **Workflows > Import from File**, then pick a chat model and your BatchData credential.

## Added in 0.2.0

Every operation below is billed by BatchData as described in the API docs; the billing note is repeated in each operation description.

| Resource         | Operation                                   | Endpoint                                              |
| ---------------- | ------------------------------------------- | ----------------------------------------------------- |
| Property         | Reverse Skip Trace (Phone or Email)         | `POST /api/v3/property/reverse-skip-trace`            |
| Property         | Get Property Permits                        | `POST /api/v2/property/get-property-permits`          |
| Property         | Batch Skip Trace Properties (V3, up to 100) | `POST /api/v3/property/skip-trace`                    |
| Property         | Batch Look Up Properties                    | `POST /api/v1/property/lookup/all-attributes`         |
| Address          | Autocomplete, Geocode, Reverse Geocode      | `POST /api/v1/address/autocomplete`, `/geocode`, `/reverse-geocode` |
| Address          | Batch Verify Addresses                      | `POST /api/v1/address/verify`                         |
| Investor         | Find Investors (Buy Box), Get Investor Properties | `POST /api/v2/investor/buybox`, `/properties`   |
| Search Session   | List, Create or Advance, Delete             | `/api/v2/property/search-sessions`, `POST /api/v1/property/search` |
| Property Monitor | List, Get, Create (stream delivery), Delete | `/api/v2/property-subscription`                       |

Reverse skip trace returns nothing for a no-match, and always sends the TCPA setting explicitly. Search sessions are created through the V1 search with cursor pagination and a session ID; BatchData caps sessions at 100 per team, so clean up with Delete Search Session. Create Property Monitor only offers Kinesis and Event Hubs delivery.

### Triggers

**BatchData Trigger** (polling) has three events:

- **New Search Session** and **New Property Monitor** emit items that appeared after the workflow was activated (the first poll is a baseline, nothing is replayed). Not billed per record.
- **New Property in Search Session (Billed)** drains one search session and emits each property once. BatchData bills each returned property. A manual test run returns a sample and does not bill.

**BatchData Monitor Trigger** (instant) creates a BatchData property monitor that delivers to this node's own webhook URL when the workflow is activated, and deletes it when the workflow is deactivated. Each event carries `eventId`, `propertyId`, `parcelHash`, `addressHash`, `addedToSubscriptionIds`, `removedFromSubscriptionIds`, `propertyChangedAt` and `sentAt`; the node adds `id` (the event ID). Events are deduplicated by `eventId` because delivery is retried.

- **Limits (BatchData):** up to 5 monitors per team, a monitor cannot be edited after it is created, a new monitor can take up to 7 days to start delivering, and delivery is best effort (4 attempts per event). Each active workflow uses one of the 5 slots.
- **Include Property Record (Billed)** is off by default. When on, the node looks the property up for each event, which BatchData bills per returned record.
- The webhook URL is the trigger's own and is never an input you type. Needs a monitor-enabled token; BatchData sandbox tokens return mock data at no cost.

### Custom API Call guard

Paths must start with `/api/`. Wallet and billing endpoints, every `async` endpoint, and creating or changing a property monitor (`POST`, `PUT`, `PATCH` on `property-subscription`) are blocked. `webhookUrl` and `errorWebhookUrl` are removed from the body at any depth, in any letter case.

## Changes in 0.2.1 to 0.2.4

- 0.2.4 (the release in this repo): a 2xx response whose body is an error object now fails the node and both triggers, instead of returning zero items; AI Agent tool docs and an example workflow.
- 0.2.3: credential test added (`GET /api/v2/property/search-sessions?take=1`); node-level `testedBy` methods removed.
- 0.2.2: passes `npx @n8n/scan-community-package`; the Custom API Call operation is named "Make".
- 0.2.1: first npm publish from GitHub Actions with provenance; billed defaults of 1 result (and 5 for the billed session trigger); HTTP 402 explains that the balance is too low.

Full history: [CHANGELOG.md](CHANGELOG.md).

## Not exposed

Asynchronous (webhook-delivered) requests, wallet endpoints, and any field where you could type a webhook or callback URL.

## Development

Needs Node 24 or later (required by `@n8n/node-cli`).

```bash
npm install
npm run lint
npm run build
npm test
```

Tests run the node against a fake n8n context with response fixtures built from the BatchData OpenAPI schemas. They prove request shapes, output mapping, trigger polling and hooks. They do **not** call the live API. The request and response shapes were verified live against the production API (one record per call) for search, lookup, skip trace V1 and V3, reverse skip trace, permits, investor buy box and properties, geocode, reverse geocode, autocomplete, verify, DNC and the search-session lifecycle; monitors and the instant trigger are mocked only because the test token returned 403 for them.

## Publishing

n8n requires community nodes submitted for verification to be published from GitHub Actions with npm provenance. `.github/workflows/publish.yml` does this on a version tag (for example `0.2.4`). Setup (npm package ownership and trusted publisher or `NPM_TOKEN` secret) is described in that file. After publishing, submit the package through the [n8n Creator Portal](https://creators.n8n.io/nodes) (docs: [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes/)).

## Support

support@batchservice.com

## License

The code in this repository is released under the [MIT License](LICENSE). The BatchData API and the data it returns are proprietary to BatchData ([batchdata.io](https://batchdata.io)) and are subject to BatchData's terms of service; the MIT License does not cover them. Support: support@batchservice.com
