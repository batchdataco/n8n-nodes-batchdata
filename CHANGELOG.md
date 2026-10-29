# Changelog

## 0.2.0 (unreleased)

- New resources: Investor, Search Session, Property Monitor.
- New operations: reverse skip trace, permits, batch skip trace (V3), batch look up, autocomplete, geocode, reverse geocode, batch verify addresses, investor buy box and properties, list/create/delete search sessions, list/get/create/delete property monitors (stream delivery).
- New node BatchData Trigger (polling): new search session, new property monitor, new property in a search session (billed).
- New node BatchData Monitor Trigger (instant): creates a webhook-delivered property monitor on activation and removes it on deactivation. Optional billed property lookup per event.
- Custom API Call now also blocks `async` endpoints and monitor creation, and removes callback keys in any letter case.
- Official BatchData logo.
- Operations come from a shared catalog (`nodes/BatchData/catalog.json`) with a drift test.

## 0.1.0 (unreleased)

- Credential: BatchData API token (Bearer) with a connection test.
- Property: Search, Look Up (all attributes), Skip Trace (V1 and V3).
- Address: Verify.
- Phone: Verify, Check DNC, Check TCPA.
- Custom API Call for any `/api/` endpoint (wallet endpoints blocked, webhook fields removed).
