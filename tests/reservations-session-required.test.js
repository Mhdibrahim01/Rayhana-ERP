'use strict';

/**
 * Every IPC handler in ipc/reservations.js must refuse a caller with no session.
 *
 * Before this, only reservations:extend checked for a session, so an unauthenticated
 * caller could list every reservation, read the invoice and settlement figures, read
 * the payment and deposit ledgers, and - most seriously - settle a booking through
 * reservations:checkout, which rewrites total_price and paid_amount.
 *
 * These tests assert the refusal AND that nothing was written, so a handler cannot
 * appear to pass while still having mutated the reservation.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');
const { FakeIpcMain, createFakeDeps } = require('./helpers/fake-ipc');
const { registerReservationsIpc } = require('../ipc/index');

const ADMIN = { id: 1, username: 'admin', role: 'Admin' };
const RECEPTIONIST = { id: 2, username: 'staff', role: 'User' };

test('reservations IPC: a signed-out caller is refused everywhere', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerReservationsIpc(ipcMain, deps);

    const today = appDb.getLocalDateString();
    const room = addRoom('SEC-BASE', 150);
    const created = appDb.createReservation({
      guestName: 'Session Guard',
      guestPhone: '0500007777',
      guestIdNumber: '1000007777',
      roomId: room.id,
      checkInDate: addDays(today, -3),
      checkOutDate: today,
      totalPrice: 450,
      paidAmount: 450
    });

    deps.session.currentUser = null;

    await t.test('every read handler refuses', async () => {
      const reads = [
        ['reservations:get-all', undefined],
        ['reservations:get-page', { page: 1, limit: 10 }],
        ['reservations:get-today-checkouts', undefined],
        ['reservations:get-invoice-data', created.reservationId],
        ['reservations:checkout-preview', { reservationId: created.reservationId }],
        ['payments:get-by-reservation', created.reservationId],
        ['deposits:get-by-reservation', created.reservationId],
        ['payments:get-receipt', '1']
      ];
      for (const [channel, args] of reads) {
        const res = await ipcMain.invoke(channel, {}, args);
        assert.equal(res.success, false, `${channel} must refuse an anonymous caller`);
        assert.match(res.error, /تسجيل الدخول/, `${channel} must say why`);
        assert.equal(res.data, undefined, `${channel} must not leak data`);
      }
    });

    await t.test('the receipt-edit alias is also refused', async () => {
      for (const channel of ['add-payment', 'reservations:add-payment']) {
        const res = await ipcMain.invoke(channel, {}, {
          reservationId: created.reservationId, amount: 50, paymentMethod: 'نقداً'
        });
        assert.equal(res.success, false, `${channel} must refuse an anonymous caller`);
      }
      const row = connection.queryOne(
        'SELECT paid_amount FROM reservations WHERE id = ?', [created.reservationId]);
      assert.equal(row.paid_amount, 450, 'no payment may have been recorded');
    });

    await t.test('checkout is refused and the reservation stays open', async () => {
      const before = connection.queryOne(
        'SELECT status, total_price, paid_amount FROM reservations WHERE id = ?',
        [created.reservationId]);
      const paymentsBefore = connection.queryOne(
        'SELECT COUNT(*) AS c FROM payments WHERE reservation_id = ?', [created.reservationId]).c;

      const res = await ipcMain.invoke('reservations:checkout', {}, {
        reservationId: created.reservationId, settleMode: 'defer'
      });
      assert.equal(res.success, false, 'checkout must refuse an anonymous caller');
      assert.match(res.error, /تسجيل الدخول/);

      const after = connection.queryOne(
        'SELECT status, total_price, paid_amount, checkout_policy FROM reservations WHERE id = ?',
        [created.reservationId]);
      assert.equal(after.status, before.status, 'the reservation must not be closed');
      assert.equal(after.status, 'مؤكد');
      assert.equal(after.total_price, before.total_price, 'total_price must be untouched');
      assert.equal(after.paid_amount, before.paid_amount, 'paid_amount must be untouched');
      assert.equal(after.checkout_policy, null, 'no policy may be recorded');
      assert.equal(
        connection.queryOne('SELECT COUNT(*) AS c FROM payments WHERE reservation_id = ?',
          [created.reservationId]).c,
        paymentsBefore,
        'checkout must not write a payment row'
      );
    });

    await t.test('cancel, create and the excel import are refused', async () => {
      const cancel = await ipcMain.invoke('reservations:cancel', {},
        { reservationId: created.reservationId });
      assert.equal(cancel.success, false);

      const create = await ipcMain.invoke('reservations:create', {}, {
        guestName: 'Ghost', guestPhone: '0500006666', guestIdNumber: '1000006666',
        roomId: room.id, checkInDate: today, checkOutDate: addDays(today, 2),
        totalPrice: 300, paidAmount: 0
      });
      assert.equal(create.success, false);

      const imp = await ipcMain.invoke('excel:import-reservations', {}, [{
        guest_name: 'Ghost Import', guest_phone: '0500005555',
        room_number: 'SEC-BASE', check_in_date: today,
        check_out_date: addDays(today, 2), total_price: 300
      }]);
      assert.equal(imp.success, false);

      assert.equal(
        connection.queryOne('SELECT COUNT(*) AS c FROM guests WHERE phone = ?', ['0500005555']).c,
        0,
        'the import must not have written a guest'
      );
    });

    await t.test('the database is still consistent', () => {
      assertDatabaseIntegrity(connection, 'anonymous calls changed nothing');
    });
  });
});

test('reservations IPC: a signed-in session still works', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerReservationsIpc(ipcMain, deps);

    const today = appDb.getLocalDateString();
    const roomRead = addRoom('SEC-OK-R', 150);
    const roomSettle = addRoom('SEC-OK-S', 150);

    await t.test('a receptionist can read everything', async () => {
      deps.session.currentUser = RECEPTIONIST;
      const all = await ipcMain.invoke('reservations:get-all', {}, undefined);
      assert.equal(all.success, true);

      const readId = appDb.createReservation({
        guestName: 'Ok Read', guestPhone: '0500004444', guestIdNumber: '1000004444',
        roomId: roomRead.id, checkInDate: addDays(today, -2), checkOutDate: today,
        totalPrice: 300, paidAmount: 300
      }).reservationId;
      const preview = await ipcMain.invoke('reservations:checkout-preview', {}, {
        reservationId: readId
      });
      assert.equal(preview.success, true, 'the checkout modal depends on this');
    });

    await t.test('a receptionist can still settle a booking', async () => {
      const id = appDb.createReservation({
        guestName: 'Ok Settle', guestPhone: '0500003333', guestIdNumber: '1000003333',
        roomId: roomSettle.id, checkInDate: addDays(today, -2), checkOutDate: today,
        totalPrice: 300, paidAmount: 300
      }).reservationId;

      const res = await ipcMain.invoke('reservations:checkout', {}, {
        reservationId: id, settleMode: 'defer'
      });
      assert.equal(res.success, true, 'the receptionist flow must keep working');
      assert.equal(
        connection.queryOne('SELECT status FROM reservations WHERE id = ?', [id]).status,
        'مكتمل'
      );
    });

    await t.test('an Admin is unaffected too', async () => {
      deps.session.currentUser = ADMIN;
      const all = await ipcMain.invoke('reservations:get-all', {}, undefined);
      assert.equal(all.success, true);
    });
  });
});