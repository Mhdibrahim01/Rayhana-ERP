'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('reservation cancellation and refund ledger scenarios', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    await t.test('cancellation before arrival returns the full payment with the expected note', () => {
      const room = addRoom('CA-PRE', 200);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Cancellation Before Arrival',
        checkIn: addDays(today, 5),
        checkOut: addDays(today, 7),
        totalPrice: 400,
        paidAmount: 250
      });
      const result = db.cancelReservation(reservationId);
      const reservation = db.getReservationById(reservationId);
      const refund = connection.queryAll('SELECT amount, notes FROM payments WHERE reservation_id = ? ORDER BY id DESC LIMIT 1', [reservationId])[0];
      assert.equal(result.hasStarted, false);
      assert.equal(result.refundDue, 250);
      assert.equal(reservation.status, 'ملغي');
      assert.equal(reservation.paid_amount, 0);
      assert.equal(refund.amount, -250);
      assert.equal(refund.notes, `استرداد كامل - إلغاء قبل الوصول #${reservationId}`);
      assertDatabaseIntegrity(connection, 'cancellation before arrival');
    });

    await t.test('mid-stay cancellation refunds only payment above the prorated charge', () => {
      const room = addRoom('CA-MID', 200);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Cancellation Mid Stay',
        checkIn: addDays(today, -3),
        checkOut: addDays(today, 5),
        totalPrice: 1600,
        paidAmount: 800
      });
      const result = db.cancelReservation(reservationId, today);
      const reservation = db.getReservationById(reservationId);
      const refund = connection.queryAll('SELECT amount, notes FROM payments WHERE reservation_id = ? ORDER BY id DESC LIMIT 1', [reservationId])[0];
      assert.equal(result.hasStarted, true);
      assert.equal(result.daysStayed, 3);
      assert.equal(result.proRatedCharge, 600);
      assert.equal(result.refundDue, 200);
      assert.equal(reservation.status, 'ملغي جزئي');
      assert.equal(reservation.total_price, 600);
      assert.equal(reservation.paid_amount, 600);
      assert.equal(refund.amount, -200);
      assert.equal(refund.notes, `استرداد نقدي - إلغاء جزئي #${reservationId}`);
      assertDatabaseIntegrity(connection, 'mid-stay cancellation');
    });
  });
});
