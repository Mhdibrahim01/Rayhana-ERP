'use strict';

/**
 * Invoice line items: the late-checkout fee must be stored, carried on the invoice
 * projection, and reconciled with the invoice total.
 *
 * The renderer bug these guard against: the fee row rendered but its amount was
 * pushed out of the table by an unconstrained first column, so a 550 SAR invoice
 * showed a 500 SAR stay with an unexplained 50 SAR gap. The stored money was always
 * correct — only the display was wrong.
 *
 * The receipt-edit button is a renderer concern and is asserted separately below by
 * checking the IPC boundary that actually enforces the rule.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');
const { FakeIpcMain, createFakeDeps } = require('./helpers/fake-ipc');
const { registerReservationsIpc } = require('../ipc/index');

test('invoice line items: the late-checkout fee is stored and reconciled', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    await t.test('a 50 fee on a 500 stay produces a 550 invoice that reconciles', () => {
      const room = addRoom('INV-209', 100);
      const id = appDb.createReservation({
        guestName: 'Late Fee Case',
        guestPhone: '0500003001',
        guestIdNumber: '1000003001',
        roomId: room.id,
        checkInDate: addDays(today, -5),
        checkOutDate: today,
        totalPrice: 500,
        paidAmount: 500
      }).reservationId;

      const result = appDb.checkoutReservation(id, { settleMode: 'defer', lateCheckoutFee: 50 });
      assert.equal(result.lateCheckoutFee, 50);
      assert.equal(result.finalTotal, 550, 'the fee is added to the stay total');

      const row = connection.queryOne(
        'SELECT total_price, late_checkout_fee FROM reservations WHERE id = ?', [id]);
      assert.equal(row.late_checkout_fee, 50, 'the fee is persisted, not just applied');
      assert.equal(row.total_price, 550);

      // The invoice projection must expose the fee so the renderer can show it.
      const invoice = appDb.getReservationById(id);
      assert.ok('late_checkout_fee' in invoice, 'the invoice data carries late_checkout_fee');
      assert.equal(invoice.late_checkout_fee, 50);

      // Line items must reconcile with the invoice total:
      // base - discount + lateFee === total_price
      const rate = Number(invoice.custom_nightly_price || invoice.price_per_night || 0);
      const discount = Number(invoice.discount_amount || 0);
      const fee = Number(invoice.late_checkout_fee || 0);
      const nights = appDb.countNights(invoice.check_in_date, invoice.check_out_date);
      const reconstructed = nights * rate - discount + fee;
      assert.equal(reconstructed, invoice.total_price,
        'the stay, the discount and the fee must explain the invoice total exactly');
      assertDatabaseIntegrity(connection, 'late fee reconciles with the invoice total');
    });

    await t.test('the fee and a discount both reconcile', () => {
      const room = addRoom('INV-FEE-DISC', 100);
      const id = appDb.createReservation({
        guestName: 'Fee And Discount',
        guestPhone: '0500003002',
        guestIdNumber: '1000003002',
        roomId: room.id,
        checkInDate: addDays(today, -5),
        checkOutDate: today,
        totalPrice: 500,
        paidAmount: 500,
        discountAmount: 30,
        discountReason: 'خصم معتمد'
      }).reservationId;

      const result = appDb.checkoutReservation(id, { settleMode: 'defer', lateCheckoutFee: 50 });
      assert.equal(result.finalTotal, 520, '500 - 30 discount + 50 fee');

      const invoice = appDb.getReservationById(id);
      assert.equal(invoice.late_checkout_fee, 50);
      assert.equal(invoice.discount_amount, 30);
      const reconstructed = 5 * 100 - 30 + 50;
      assert.equal(reconstructed, invoice.total_price);
    });

    await t.test('a stay with no fee stores no fee and shows no fee row', () => {
      const room = addRoom('INV-NOFEE', 100);
      const id = appDb.createReservation({
        guestName: 'No Fee',
        guestPhone: '0500003003',
        guestIdNumber: '1000003003',
        roomId: room.id,
        checkInDate: addDays(today, -2),
        checkOutDate: today,
        totalPrice: 200,
        paidAmount: 200
      }).reservationId;

      const result = appDb.checkoutReservation(id, { settleMode: 'defer' });
      assert.equal(result.lateCheckoutFee, 0);

      const invoice = appDb.getReservationById(id);
      assert.equal(Number(invoice.late_checkout_fee || 0), 0,
        'the renderer hides the row on a zero fee, so zero must be the stored value');
      assert.equal(invoice.total_price, 200);
    });
  });
});

test('invoice: the receipt-edit action stays Admin-only regardless of the UI', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerReservationsIpc(ipcMain, deps);
    const today = appDb.getLocalDateString();

    await t.test('a non-Admin cannot save a receipt edit by invoking the IPC directly', async () => {
      // The renderer hides "تعديل السند" for non-Admins. That is cosmetic; this asserts
      // the real boundary: calling the action directly must still be refused.
      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      const room = addRoom('INV-EDIT-USER', 100);
      const created = appDb.createReservation({
        guestName: 'Receipt Guard',
        guestPhone: '0500003004',
        guestIdNumber: '1000003004',
        roomId: room.id,
        checkInDate: addDays(today, -1),
        checkOutDate: today,
        totalPrice: 200,
        paidAmount: 200
      });

      const res = await ipcMain.invoke('reservations:update-receipt', {}, {
        reservationId: created.reservationId,
        totalPrice: 1,
        paidAmount: 0
      });
      assert.equal(res.success, false, 'the UI hiding the button must not be the only defence');
      assert.match(res.error, /Access Denied/);

      const row = connection.queryOne(
        'SELECT total_price, paid_amount FROM reservations WHERE id = ?', [created.reservationId]);
      assert.equal(row.total_price, 200);
      assert.equal(row.paid_amount, 200);
    });

    await t.test('an Admin can still save a receipt edit', async () => {
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const room = addRoom('INV-EDIT-ADMIN', 100);
      const created = appDb.createReservation({
        guestName: 'Receipt Admin OK',
        guestPhone: '0500003005',
        guestIdNumber: '1000003005',
        roomId: room.id,
        checkInDate: addDays(today, -1),
        checkOutDate: today,
        totalPrice: 200,
        paidAmount: 100
      });

      const res = await ipcMain.invoke('reservations:update-receipt', {}, {
        reservationId: created.reservationId,
        totalPrice: 200,
        paidAmount: 200,
        paymentMethod: 'نقداً'
      });
      assert.equal(res.success, true);
      const row = connection.queryOne(
        'SELECT paid_amount FROM reservations WHERE id = ?', [created.reservationId]);
      assert.equal(row.paid_amount, 200);
      assertDatabaseIntegrity(connection, 'admin may still edit a receipt');
    });
  });
});