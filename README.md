# n8n-nodes-batchdata

An [n8n](https://n8n.io) community node for the [BatchData](https://batchdata.io) API. Search properties, pull full property data, find owner contacts, verify addresses and check phone numbers inside your workflows.

> Status: 0.1.0, not yet published to npm. See [Publishing](#publishing).

## Install

In n8n, go to **Settings > Community Nodes > Install** and enter `n8n-nodes-batchdata`. See the [n8n community node guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

Create a **BatchData API** credential and paste your API token (the same token you use as `Authorization: Bearer <token>`). Tokens are created in your BatchData account.

**Test button.** The test posts an empty batch to `POST /api/v1/address/verify`. A valid token gets HTTP 400 (empty batch, treated as success). An invalid token gets 401 or 403 (shown as an error). The 400 is rejected before any lookup, so no address is processed. Billing for rejected requests is assumed, not confirmed in the API spec.

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
| Custom API Call | Make a Custom API Call | Any `/api/...` path                                                           | Follows the endpoint you call.                                                          |

Each input item makes one API call. Search returns one output item per property (or a single item with counts, via **Options > Output Mode**). Skip trace returns one item per person found. Phone and address operations return one item per result. Every output item is linked to its input item.

All operations honor **Continue On Fail**: the failed item returns `{ "error": "...", "statusCode": "..." }`.

### Property > Search

Filters are built for you (location query, quicklists, bedrooms, bathrooms, year built, living area, lot size, estimated value, equity percent, last sale date, owner occupied, property type). For anything else, paste extra `searchCriteria` JSON in **Additional Search Criteria**. Fields you set in the form win over the same fields in the JSON. **Limit** is 0 to 100 (default 25).

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

## Not included in 0.1.0

- **Trigger node.** BatchData's event delivery today is search sessions (billed per record while they drain a frozen result set, capped per team, and without a way to clean up when a workflow is deactivated) and the V2 property-subscription webhook (payload not yet documented). Neither is safe to turn into a trigger without risking surprise billing or broken workflows. A trigger is planned once there is a documented, cleanly cancellable event source.
- Reverse skip trace, permits, investor endpoints, monitors, asynchronous (webhook-delivered) requests, and wallet endpoints.

## Development

Needs Node 24 or later (required by `@n8n/node-cli`).

```bash
npm install
npm run lint
npm run build
npm test
```

Tests run the node against a fake n8n context with response fixtures built from the BatchData OpenAPI schemas. They prove request shapes and output mapping. They do **not** call the live API.

## Publishing

n8n requires community nodes to be published from GitHub Actions with npm provenance. `.github/workflows/publish.yml` does this on a version tag (`0.1.0`). Setup (npm package ownership and trusted publisher or `NPM_TOKEN` secret) is described in that file. To list the node in n8n's verified catalog, submit it through the [n8n Creator Portal](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/) after publishing.

## Support

support@batchservice.com

## License

[MIT](LICENSE)
