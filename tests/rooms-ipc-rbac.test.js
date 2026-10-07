'use strict';

/**
 * Rooms IPC access policy.
 *
 * Previously ipc/rooms.js had no access control at all, so any logged-in session —
 * including role 'User' — could add, edit and delete rooms, change a nightly price,
 * and manually override a room's status. `session` was not even destructured from the
 * deps, so there was nothing to check against.
 *
 * Reads and the automatic status refresher stay open to any session because the rooms
 * grid, the booking form and checkout all depend on them. Inventory changes and
 * manual status overrides are Admin-only.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addRoom } = require('./helpers/fixtures');
const { withSafeDatabase } = require('./helpers/safe-temp-db');
const { FakeIpcMain, createFakeDeps } = require('./helpers/fake-ipc');
const { registerRoomsIpc } = require('../ipc/index');

test('rooms IPC: inventory changes are Admin-only', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerRoomsIpc(ipcMain, deps);

    const admin = { id: 1, username: 'admin', role: 'Admin' };
    const receptionist = { id: 2, username: 'staff', role: 'User' };

    await t.test('a non-Admin cannot add a room', async () => {
      deps.session.currentUser = receptionist;
      const before = connection.queryOne('SELECT COUNT(*) AS c FROM rooms').c;

      const res = await ipcMain.invoke('rooms:add', {}, {
        room_number: 'RBAC-NEW', type: 'اختبار', price_per_night: 500
      });
      assert.equal(res.success, false);
      assert.match(res.error, /Access Denied/);
      assert.equal(connection.queryOne('SELECT COUNT(*) AS c FROM rooms').c, before,
        'no room may have been created');
    });

    await t.test('a non-Admin cannot change a room price', async () => {
      deps.session.currentUser = receptionist;
      const room = addRoom('RBAC-PRICE', 300);
      const original = connection.queryOne(
        'SELECT price_per_night FROM rooms WHERE id = ?', [room.id]).price_per_night;

      const res = await ipcMain.invoke('rooms:update', {}, {
        id: room.id, room_number: 'RBAC-PRICE', type: 'اختبار', price_per_night: 1
      });
      assert.equal(res.success, false);
      assert.match(res.error, /Access Denied/);
      assert.equal(
        connection.queryOne('SELECT price_per_night FROM rooms WHERE id = ?', [room.id]).price_per_night,
        original,
        'the nightly price must be untouched'
      );
    });

    await t.test('a non-Admin cannot delete a room', async () => {
      deps.session.currentUser = receptionist;
      const room = addRoom('RBAC-DEL', 200);

      const res = await ipcMain.invoke('rooms:delete', {}, room.id);
      assert.equal(res.success, false);
      assert.match(res.error, /Access Denied/);
      assert.ok(
        connection.queryOne('SELECT id FROM rooms WHERE id = ?', [room.id]),
        'the room must still exist'
      );
    });

    await t.test('a non-Admin MAY mark a room status (daily front-desk work)', async () => {
      // Decided deliberately: marking a room cleaning/available after a guest leaves is
      // front-desk operation, not an inventory action. The automatic refresher
      // re-derives statuses from reservations on every launch, so this is recoverable.
      deps.session.currentUser = receptionist;
      const room = addRoom('RBAC-STATUS', 200);
      const before = connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status;

      const res = await ipcMain.invoke('rooms:update-status', {}, { roomId: room.id, status: 'تنظيف' });
      assert.equal(res.success, true, 'a receptionist must be able to mark a room as cleaning');
      assert.equal(
        connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status,
        'تنظيف',
        `status changed from ${before}`
      );
    });

    await t.test('an Admin can still add, edit and delete rooms', async () => {
      deps.session.currentUser = admin;

      const added = await ipcMain.invoke('rooms:add', {}, {
        room_number: 'RBAC-ADMIN', type: 'اختبار', price_per_night: 500, monthly_price: 15000
      });
      assert.equal(added.success, true);
      const id = added.data.id;

      const edited = await ipcMain.invoke('rooms:update', {}, {
        id, room_number: 'RBAC-ADMIN', type: 'اختبار', price_per_night: 650, monthly_price: 19500
      });
      assert.equal(edited.success, true);
      assert.equal(
        connection.queryOne('SELECT price_per_night FROM rooms WHERE id = ?', [id]).price_per_night,
        650
      );

      const status = await ipcMain.invoke('rooms:update-status', {}, { roomId: id, status: 'تنظيف' });
      assert.equal(status.success, true);

      const removed = await ipcMain.invoke('rooms:delete', {}, id);
      assert.equal(removed.success, true);
      assert.equal(connection.queryOne('SELECT id FROM rooms WHERE id = ?', [id]), null);
    });

    await t.test('a logged-out session cannot change any room', async () => {
      deps.session.currentUser = null;
      const room = addRoom('RBAC-ANON', 200);

      for (const [channel, args] of [
        ['rooms:add', { room_number: 'X', type: 'x', price_per_night: 100 }],
        ['rooms:update', { id: room.id, room_number: 'X', type: 'x', price_per_night: 1 }],
        ['rooms:delete', room.id],
        ['rooms:update-status', { roomId: room.id, status: 'مشغولة' }]
      ]) {
        const res = await ipcMain.invoke(channel, {}, args);
        assert.equal(res.success, false, `${channel} must refuse an anonymous caller`);
      }
      assert.ok(connection.queryOne('SELECT id FROM rooms WHERE id = ?', [room.id]));
    });
  });
});

test('rooms IPC: reads stay available to any logged-in session', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerRoomsIpc(ipcMain, deps);
    const receptionist = { id: 2, username: 'staff', role: 'User' };
    deps.session.currentUser = receptionist;

    const room = addRoom('RBAC-READ', 200);

    await t.test('a receptionist can list rooms and available rooms', async () => {
      const all = await ipcMain.invoke('rooms:get-all', {}, undefined);
      assert.equal(all.success, true, 'the rooms grid depends on this');
      assert.ok(Array.isArray(all.data));

      const available = await ipcMain.invoke('rooms:get-available', {}, undefined);
      assert.equal(available.success, true, 'the booking form depends on this');
    });

    await t.test('a receptionist can read room revenue', async () => {
      const res = await ipcMain.invoke('rooms:get-revenue', {}, room.id);
      assert.equal(res.success, true);
    });

    await t.test('a receptionist may request the automatic status refresh', async () => {
      const res = await ipcMain.invoke('rooms:auto-update-status', {}, undefined);
      // The helper is a no-op stub in tests; it must not be an access error.
      if (res && res.success === false) {
        assert.doesNotMatch(res.error || '', /Access Denied|تسجيل الدخول/);
      }
    });

    await t.test('a logged-out session cannot read rooms either', async () => {
      deps.session.currentUser = null;
      const all = await ipcMain.invoke('rooms:get-all', {}, undefined);
      assert.equal(all.success, false);
      assert.match(all.error, /تسجيل الدخول/);
    });
  });
});
