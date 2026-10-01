# Known Issues Covered by TODO Tests

- **Users IPC trusts the renderer-provided requester role.** This previously identified RBAC issue is now covered by `node:test` TODOs in `tests/ipc-users.test.js`. App code is intentionally unchanged.
- **Cancel IPC honors manualOverrideAmount for non-Admin users.** This is now covered by a \
ode:test\ TODO in \	ests/ipc-reservations.test.js\.
