'use strict';

/**
 * Tests for Same-Day Walk-in Cancellation / Void (إبطال الحجز المباشر).
 *
 * Verifies that:
 * 1. A walk-in created today (check_in_date = today) can be immediately voided/cancelled.
 * 2. Any advance payment is refunded in full with a negative payments ledger entry.
 * 3. The room status is immediately reset to 'متاحة' (Available), NOT 'تنظيف'.
 * 4. A reservation whose check_in_date is in the past (yesterday or earlier) is still blocked
 *    from cancelling and must use checkout settlement.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('walk-in same-day void and cancellation flow', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    await t.test('same-day walk-in with advance payment is voided, refunded, and room returns to متاحة', () => {
      const room = addRoom('VOID-PAID', 150);
      const resId = createReservation({
        roomId: room.id,
        name: 'Walkin Guest Paid',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 300,
        paidAmount: 200
      });

      // Verify room was occupied upon check-in
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'مشغولة');

      // Execute void / cancellation
      const result = db.cancelReservation(resId);
      assert.equal(result.hasStarted, false);
      assert.equal(result.refundDue, 200);

      // Verify reservation columns
      const resRow = db.getReservationById(resId);
      assert.equal(resRow.status, 'ملغي');
      assert.equal(resRow.paid_amount, 0);
      assert.equal(resRow.payment_status, 'مستردة');

      // Verify ledger refund row
      const payments = db.getReservationPayments(resId);
      assert.equal(payments.length, 2);
      const refundRow = payments.find(p => p.amount < 0);
      assert.ok(refundRow, 'A negative refund row must exist');
      assert.equal(refundRow.amount, -200);
      assert.ok(refundRow.notes.startsWith('استرداد كامل'), 'Refund note starts with استرداد كامل');

      // Verify room status is restored to 'متاحة' immediately
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'متاحة');
      assertDatabaseIntegrity(connection, 'same-day void with paid advance');
    });

    await t.test('same-day walk-in without payment voids cleanly with 0 refund rows', () => {
      const room = addRoom('VOID-UNPAID', 120);
      const resId = createReservation({
        roomId: room.id,
        name: 'Walkin Guest Unpaid',
        checkIn: today,
        checkOut: addDays(today, 1),
        totalPrice: 120,
        paidAmount: 0
      });

      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'مشغولة');

      const result = db.cancelReservation(resId);
      assert.equal(result.hasStarted, false);
      assert.equal(result.refundDue, 0);

      const resRow = db.getReservationById(resId);
      assert.equal(resRow.status, 'ملغي');
      assert.equal(resRow.paid_amount, 0);

      // Room status restored to 'متاحة'
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'متاحة');
      assertDatabaseIntegrity(connection, 'same-day void unpaid');
    });

    await t.test('past stay (guest arrived in previous day) cannot be cancelled and must use checkout', () => {
      const room = addRoom('VOID-PAST', 200);
      const resId = createReservation({
        roomId: room.id,
        name: 'In-House Past Guest',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 2),
        totalPrice: 600,
        paidAmount: 300
      });

      // Cancellation must be blocked because the stay started on a previous day
      assert.throws(
        () => db.cancelReservation(resId),
        /استخدم تسجيل الخروج لتصفية الحساب/
      );

      const resRow = db.getReservationById(resId);
      assert.equal(resRow.status, 'مؤكد');
      assertDatabaseIntegrity(connection, 'past stay cancellation rejected');
    });
  });
});
