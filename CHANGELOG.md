# Changelog

## 0.2.3

- Add a credential test to the BatchData API credential (n8n Creator Portal review: "missing credential test"). It sends `GET /api/v2/property/search-sessions?take=1` with the Bearer token from `authenticate`: a valid token returns 200 and a bad token returns 401. The call is read-only and does not bill property records. 401, 403 and 429 get clear messages.
- Remove the node-level `testedBy` credential test methods, so the credential's own test is the single check for every node and the HTTP Request node.


## 0.2.2

- Pass `npx @n8n/scan-community-package`: move input-error throws out of `catch` blocks, prefer `httpRequest` in the credential test, and rename the Custom API Call operation to "Make" so the official scanner (which ignores eslint-disable comments) is clean.


## 0.2.1

- Published to npm from GitHub Actions with provenance. The package `repository` field points at this repo (`batchdataco/n8n-nodes-batchdata`).
- Safer billed defaults: Property Search, Get Property Permits, Find Investors, and Get Investor Properties default to 1 result; the billed search-session trigger defaults to 5 per check. The shared catalog.json is unchanged; these are n8n-only overrides.
- HTTP 402 now explains that the account balance is too low and funds need to be added.
- README: install from npm, current Creator Portal docs link, and a single license section.


## 0.2.0

- New resources: Investor, Search Session, Property Monitor.
- New operations: reverse skip trace, permits, batch skip trace (V3), batch look up, autocomplete, geocode, reverse geocode, batch verify addresses, investor buy box and properties, list/create/delete search sessions, list/get/create/delete property monitors (stream delivery).
- New node BatchData Trigger (polling): new search session, new property monitor, new property in a search session (billed).
- New node BatchData Monitor Trigger (instant): creates a webhook-delivered property monitor on activation and removes it on deactivation. Optional billed property lookup per event.
- Custom API Call now also blocks `async` endpoints and monitor creation, and removes callback keys in any letter case.
- Official BatchData logo.
- Operations come from a shared catalog (`nodes/BatchData/catalog.json`) with a drift test.

## 0.1.0

- Credential: BatchData API token (Bearer) with a connection test.
- Property: Search, Look Up (all attributes), Skip Trace (V1 and V3).
- Address: Verify.
- Phone: Verify, Check DNC, Check TCPA.
- Custom API Call for any `/api/` endpoint (wallet endpoints blocked, webhook fields removed).
