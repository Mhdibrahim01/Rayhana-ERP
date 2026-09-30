# Known Issues Covered by TODO Tests

- **Checkout settlement accepts a zero nightly room rate.** `computeCheckoutSettlement()` can calculate a zero net charge when a reservation references a room whose stored `price_per_night` is zero. The regression expectation is recorded as a `node:test` TODO in `tests/checkout-settlement.test.js`. App code is intentionally unchanged.
- **Users IPC trusts the renderer-provided requester role.** This previously identified RBAC issue remains assigned to the IPC test phase. Its TODO assertion is deferred because Step 4 has not been approved or started.
