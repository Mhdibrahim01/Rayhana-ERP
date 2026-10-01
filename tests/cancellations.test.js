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

    await t.test('cancellation is rejected after arrival so the guest must use checkout', () => {
      const room = addRoom('CA-MID', 200);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Cancellation Mid Stay',
        checkIn: addDays(today, -3),
        checkOut: addDays(today, 5),
        totalPrice: 1600,
        paidAmount: 800
      });
      assert.throws(() => db.cancelReservation(reservationId, today), /استخدم تسجيل الخروج/);
      assert.throws(() => db.cancelReservation(reservationId, addDays(today, -1)), /استخدم تسجيل الخروج/);
      const reservation = db.getReservationById(reservationId);
      assert.equal(reservation.status, 'مؤكد');
      assert.equal(reservation.total_price, 1600);
      assert.equal(reservation.paid_amount, 800);
      assert.equal(db.getReservationPayments(reservationId).length, 1);
      assertDatabaseIntegrity(connection, 'active stay cancellation rejected');
    });

    await t.test('early checkout uses the reservation custom nightly rate', () => {
      const room = addRoom('CA-CUSTOM-RATE', 180);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Custom Nightly Rate',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 1),
        totalPrice: 300,
        paidAmount: 150,
        customNightlyPrice: 150
      });

      const settlement = db.computeCheckoutSettlement(reservationId);
      const result = db.checkoutReservation(reservationId, { settleMode: 'defer' });
      const reservation = db.getReservationById(reservationId);

      assert.equal(settlement.effectiveNightlyRate, 150);
      assert.equal(result.finalTotal, 150);
      assert.equal(reservation.total_price, 150);
      assert.equal(reservation.paid_amount, 150);
      assert.equal(reservation.payment_status, 'مدفوع بالكامل');
      assert.equal(reservation.status, 'مكتمل');
      assert.equal(db.getReservationPayments(reservationId).length, 1);
      assertDatabaseIntegrity(connection, 'custom nightly rate cancellation');
    });

    await t.test('early checkout keeps an unpaid balance collectible later', () => {
      const room = addRoom('CA-LATER-PAYMENT', 180);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Pay Balance Later',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 360,
        paidAmount: 50
      });

      const result = db.checkoutReservation(reservationId, { settleMode: 'defer' });
      let reservation = db.getReservationById(reservationId);
      assert.equal(result.finalTotal, 180);
      assert.equal(result.settleMode, 'defer');
      assert.equal(reservation.total_price, 180);
      assert.equal(reservation.paid_amount, 50);
      assert.equal(reservation.payment_status, 'مدفوع جزئياً');
      assert.equal(reservation.status, 'مكتمل');

      // Recover a legacy partially-cancelled row whose paid_amount was saved as the final charge.
      connection.getDb().run("UPDATE reservations SET status = 'ملغي جزئي', paid_amount = total_price WHERE id = ?", [reservationId]);
      const listedReservation = db.getAllReservations().find(row => row.id === reservationId);
      assert.equal(listedReservation.ledger_paid_amount, 50);

      const payment = db.addPaymentToReservation({ reservationId, amount: 130, notes: 'سداد رصيد إلغاء جزئي' });
      reservation = db.getReservationById(reservationId);
      assert.equal(payment.remainingBalance, 0);
      assert.equal(reservation.paid_amount, 180);
      assert.equal(reservation.payment_status, 'مدفوع بالكامل');
      assert.equal(db.getReservationPayments(reservationId).reduce((sum, row) => sum + row.amount, 0), 180);
      assertDatabaseIntegrity(connection, 'later payment after mid-stay cancellation');
    });

    await t.test('one fully paid night is shown fully paid after early checkout', () => {
      const room = addRoom('CA-ONE-NIGHT-PAID', 180);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'One Night Paid',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 360,
        paidAmount: 180
      });

      db.checkoutReservation(reservationId, { settleMode: 'defer' });
      const reservation = db.getReservationById(reservationId);
      assert.equal(reservation.total_price, 180);
      assert.equal(reservation.paid_amount, 180);
      assert.equal(reservation.payment_status, 'مدفوع بالكامل');
      assert.equal(reservation.status, 'مكتمل');
    });
  });
});
