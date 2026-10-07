'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('open-contract creation, payments, and checkout path', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();
    await t.test('open contract stays open-ended through payments and closes using the existing settlement path', () => {
      const room = addRoom('OC-01', 180);
      const created = db.createReservation({
        guestName: 'Open Contract Guest',
        guestPhone: '0500000201',
        guestIdNumber: '1000000201',
        roomId: room.id,
        checkInDate: addDays(today, -10),
        checkOutDate: '',
        totalPrice: 0,
        paidAmount: 100,
        bookingType: 'عقد مفتوح'
      });
      const reservationId = created.reservationId;
      assert.equal(db.getReservationById(reservationId).check_out_date, '');
      assert.equal(db.getReservationById(reservationId).booking_type, 'عقد مفتوح');
      db.addPaymentToReservation({ reservationId, amount: 50, paymentMethod: 'نقداً' });
      assert.equal(db.getReservationById(reservationId).paid_amount, 150);
      assert.throws(
        () => db.extendReservation({ reservationId, newCheckOutDate: addDays(today, 5) }),
        /حجوزات العقود المفتوحة ليس لها تاريخ مغادرة محدد ليتم تمديدها/
      );
      assertDatabaseIntegrity(connection, 'open contract after payments');

      const checkout = db.checkoutReservation(reservationId, { finalTotalPrice: 200, settleAmount: 50 });
      const completed = db.getReservationById(reservationId);
      assert.equal(checkout.success, true);
      assert.equal(completed.status, 'مكتمل');
      assert.equal(completed.check_out_date, today);
      assert.equal(completed.total_price, 200);
      assert.equal(completed.paid_amount, 200);
      assert.equal(connection.queryAll('SELECT status FROM rooms WHERE id = ?', [room.id])[0].status, 'تنظيف');
      assertDatabaseIntegrity(connection, 'open contract after checkout');
          });

    await t.test('an overpaid open contract refunds the difference and closes fully paid', () => {
      const room = addRoom('OC-02', 110);
      const created = db.createReservation({
              guestName: 'Overpaid Open Contract Guest',
              guestPhone: '0500000202',
              guestIdNumber: '1000000202',
              roomId: room.id,
              checkInDate: addDays(today, -1),
              checkOutDate: '',
              totalPrice: 110,
              paidAmount: 200,
              paymentMethod: 'نقداً',
              bookingType: 'عقد مفتوح',
              customNightlyPrice: 110
      });
      const reservationId = created.reservationId;

      const before = db.getReservationById(reservationId);
      assert.equal(before.paid_amount, 200);

      // The advance receipt itself must stay 200 and untouched by the refund.
      const advanceRows = connection.queryAll(
              'SELECT amount, receipt_number FROM payments WHERE reservation_id = ? AND amount > 0',
              [reservationId]
      );
      assert.equal(advanceRows.length, 1);
      assert.equal(advanceRows[0].amount, 200);

      // Exactly what the settle modal sends for the 110 charge / 90 refund case.
      const checkout = db.checkoutReservation(reservationId, {
              settleMode: 'refund',
              refundAmount: 90,
              paymentMethod: 'نقداً',
              finalTotalPrice: 110,
              discountAmount: 0,
              discountReason: '',
              lateCheckoutFee: 0
      });
      assert.equal(checkout.success, true);

      const completed = db.getReservationById(reservationId);
      assert.equal(completed.status, 'مكتمل');
      assert.equal(completed.check_out_date, today);
      assert.equal(completed.total_price, 110);
      assert.equal(completed.paid_amount, 110);
      assert.equal(completed.payment_status, 'مدفوع بالكامل');

      // The refund is a real ledger row with its own receipt number.
      const refundRows = connection.queryAll(
              `SELECT amount, payment_method, notes, receipt_number FROM payments
               WHERE reservation_id = ? AND amount < 0`,
              [reservationId]
      );
      assert.equal(refundRows.length, 1, 'exactly one refund row');
      assert.equal(refundRows[0].amount, -90);
      assert.equal(refundRows[0].payment_method, 'نقداً');
      // The invoice renderer keys off this exact prefix to show the refund line.
      assert.ok(
              refundRows[0].notes.startsWith('استرداد - تسوية مغادرة'),
              `refund notes must start with the invoice prefix, got: ${refundRows[0].notes}`
      );
      assert.notEqual(refundRows[0].receipt_number, advanceRows[0].receipt_number);

      // The original advance receipt is preserved verbatim.
      const advanceAfter = connection.queryAll(
              'SELECT amount, receipt_number FROM payments WHERE reservation_id = ? AND amount > 0',
              [reservationId]
      );
      assert.deepEqual(advanceAfter, advanceRows);

      assertDatabaseIntegrity(connection, 'overpaid open contract after refund');
    });

    await t.test('an overpaid open contract cannot close without a refund', () => {
      const room = addRoom('OC-03', 110);
      const created = db.createReservation({
              guestName: 'Unrefunded Open Contract Guest',
              guestPhone: '0500000203',
              guestIdNumber: '1000000203',
              roomId: room.id,
              checkInDate: addDays(today, -1),
              checkOutDate: '',
              totalPrice: 110,
              paidAmount: 200,
              paymentMethod: 'نقداً',
              bookingType: 'عقد مفتوح',
              customNightlyPrice: 110
      });
      const reservationId = created.reservationId;

      assert.throws(
              () => db.checkoutReservation(reservationId, { settleMode: 'defer', finalTotalPrice: 110 }),
              /يجب اختيار "استرداد"/
      );
      // Still open — the blocked checkout rolled back cleanly.
      const stillOpen = db.getReservationById(reservationId);
      assert.equal(stillOpen.status, 'مؤكد');
      assert.equal(stillOpen.paid_amount, 200);
      assertDatabaseIntegrity(connection, 'blocked overpaid open contract checkout');
    });

    await t.test('a refund amount that does not match the real difference is rejected', () => {
      const room = addRoom('OC-04', 110);
      const created = db.createReservation({
              guestName: 'Wrong Refund Open Contract Guest',
              guestPhone: '0500000204',
              guestIdNumber: '1000000204',
              roomId: room.id,
              checkInDate: addDays(today, -1),
              checkOutDate: '',
              totalPrice: 110,
              paidAmount: 200,
              paymentMethod: 'نقداً',
              bookingType: 'عقد مفتوح',
              customNightlyPrice: 110
      });
      const reservationId = created.reservationId;

      assert.throws(
              () => db.checkoutReservation(reservationId, {
                settleMode: 'refund',
                refundAmount: 50,          // real difference is 90
                finalTotalPrice: 110
              }),
              /يجب أن يساوي الفرق الفعلي المستحق/
      );
      const stillOpen = db.getReservationById(reservationId);
      assert.equal(stillOpen.status, 'مؤكد');
      assertDatabaseIntegrity(connection, 'rejected wrong refund amount');
    });

    await t.test('double checkout stays blocked after a successful refund', () => {
      const room = addRoom('OC-05', 110);
      const created = db.createReservation({
              guestName: 'Double Checkout Open Contract Guest',
              guestPhone: '0500000205',
              guestIdNumber: '1000000205',
              roomId: room.id,
              checkInDate: addDays(today, -1),
              checkOutDate: '',
              totalPrice: 110,
              paidAmount: 200,
              paymentMethod: 'نقداً',
              bookingType: 'عقد مفتوح',
              customNightlyPrice: 110
      });
      const reservationId = created.reservationId;

      assert.equal(
              db.checkoutReservation(reservationId, {
                settleMode: 'refund', refundAmount: 90, finalTotalPrice: 110
              }).success,
              true
      );
      assert.throws(
              () => db.checkoutReservation(reservationId, {
                settleMode: 'refund', refundAmount: 90, finalTotalPrice: 110
              }),
              /مغلق بالفعل/
      );
      // The rejected second attempt must not add another refund row.
      const refundRows = connection.queryAll(
              'SELECT amount FROM payments WHERE reservation_id = ? AND amount < 0',
              [reservationId]
      );
      assert.equal(refundRows.length, 1);
      assertDatabaseIntegrity(connection, 'double checkout blocked after refund');
    });

    await t.test('checkoutReservation in db/reservations.js is a unified settlement engine', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const src = fs.readFileSync(path.join(__dirname, '../db/reservations.js'), 'utf8');
      assert.ok(
        src.includes('UNIFIED SETTLEMENT ENGINE'),
        'db/reservations.js must use the unified settlement engine'
      );
      assert.ok(
        !src.includes('// OPEN-CONTRACT PATH: unchanged from before'),
        'legacy split open contract branch must remain removed'
      );
    });
        });
      });
