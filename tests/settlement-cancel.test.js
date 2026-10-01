'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { withSafeDatabase } = require('./helpers/safe-temp-db');

test('checkout settlement and cancellation essentials', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    await t.test('paid 2000 with a 150 refund records paid minus net', () => {
      const room = addRoom('SC-REFUND', 1850);
      const id = createReservation({ roomId: room.id, name: 'Refund 150', checkIn: addDays(today, -1), checkOut: addDays(today, 4), totalPrice: 9250, paidAmount: 2000 });
      const result = appDb.checkoutReservation(id, { settleMode: 'refund' });
      const reservation = appDb.getReservationById(id);
      const rows = appDb.getReservationPayments(id);
      assert.equal(result.finalTotal, 1850);
      assert.equal(rows.at(-1).amount, -(2000 - result.finalTotal));
      assert.equal(reservation.paid_amount, rows.reduce((sum, row) => sum + row.amount, 0));
    });

    await t.test('zero paid supports collection and deferral with matching payment status', () => {
      const collectRoom = addRoom('SC-ZERO-COLLECT', 100);
      const collectId = createReservation({ roomId: collectRoom.id, name: 'Zero Paid Collect', checkIn: today, checkOut: addDays(today, 2), totalPrice: 200 });
      appDb.checkoutReservation(collectId, { settleMode: 'collect', collectAmount: 100 });
      assert.equal(appDb.getReservationById(collectId).payment_status, 'مدفوع بالكامل');
      assert.equal(appDb.getReservationById(collectId).paid_amount, 100);

      const deferRoom = addRoom('SC-ZERO-DEFER', 100);
      const deferId = createReservation({ roomId: deferRoom.id, name: 'Zero Paid Defer', checkIn: today, checkOut: addDays(today, 2), totalPrice: 200 });
      appDb.checkoutReservation(deferId, { settleMode: 'defer' });
      assert.equal(appDb.getReservationById(deferId).payment_status, 'غير مدفوع');
      assert.equal(appDb.getReservationById(deferId).paid_amount, 0);
    });

    await t.test('exact match checks out without adding a payment row', () => {
      const room = addRoom('SC-EXACT', 250);
      const id = createReservation({ roomId: room.id, name: 'Exact Match', checkIn: addDays(today, -1), checkOut: addDays(today, 2), totalPrice: 750, paidAmount: 250 });
      const before = appDb.getReservationPayments(id).length;
      appDb.checkoutReservation(id);
      assert.equal(appDb.getReservationPayments(id).length, before);
      assert.equal(appDb.getReservationById(id).status, 'مكتمل');
    });

    await t.test('incorrect refund and collection amounts reject without adding rows', () => {
      const refundRoom = addRoom('SC-BAD-REFUND', 250);
      const refundId = createReservation({ roomId: refundRoom.id, name: 'Bad Refund Amount', checkIn: addDays(today, -1), checkOut: addDays(today, 3), totalPrice: 1000, paidAmount: 300 });
      assert.throws(() => appDb.checkoutReservation(refundId, { settleMode: 'refund', refundAmount: 49 }), /يجب أن يساوي الفرق الفعلي المستحق/);
      assert.equal(appDb.getReservationPayments(refundId).length, 1);

      const collectRoom = addRoom('SC-BAD-COLLECT', 150);
      const collectId = createReservation({ roomId: collectRoom.id, name: 'Bad Collection Amount', checkIn: today, checkOut: addDays(today, 2), totalPrice: 300, paidAmount: 100 });
      for (const amount of [0, 51]) {
        assert.throws(() => appDb.checkoutReservation(collectId, { settleMode: 'collect', collectAmount: amount }));
        assert.equal(appDb.getReservationPayments(collectId).length, 1);
      }
    });

    await t.test('second checkout is rejected', () => {
      const room = addRoom('SC-DOUBLE', 120);
      const id = createReservation({ roomId: room.id, name: 'Double Checkout', checkIn: today, checkOut: addDays(today, 2), totalPrice: 240, paidAmount: 120 });
      appDb.checkoutReservation(id, { settleMode: 'defer' });
      assert.throws(() => appDb.checkoutReservation(id, { settleMode: 'defer' }), /مغلق بالفعل/);
    });

    await t.test('stored room rate is used; zero-rate checkout rejection remains a TODO', async t2 => {
      const room = addRoom('SC-STORED-RATE', 180);
      const id = createReservation({ roomId: room.id, name: 'Stored Rate', checkIn: today, checkOut: addDays(today, 2), totalPrice: 360 });
      assert.equal(appDb.computeCheckoutSettlement(id).effectiveNightlyRate, 180);

      await t2.test('zero nightly rate is rejected', () => {
        connection.getDb().run("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES ('SC-ZERO-RATE', 'وحدة اختبار', 0, 'متاحة')");
        const zeroRoom = connection.queryAll("SELECT id FROM rooms WHERE room_number = 'SC-ZERO-RATE'")[0];
        const zeroId = createReservation({ roomId: zeroRoom.id, name: 'Zero Stored Rate', checkIn: today, checkOut: addDays(today, 1), totalPrice: 100 });
        assert.throws(() => appDb.computeCheckoutSettlement(zeroId), /سعر الليلة/);
      });
    });

    await t.test('pre-arrival cancellation refunds all payment with the expected note', () => {
      const room = addRoom('SC-CANCEL-PRE', 200);
      const id = createReservation({ roomId: room.id, name: 'Cancel Before Arrival', checkIn: addDays(today, 5), checkOut: addDays(today, 7), totalPrice: 400, paidAmount: 250 });
      appDb.cancelReservation(id);
      const reservation = appDb.getReservationById(id);
      const refund = appDb.getReservationPayments(id).at(-1);
      assert.equal(reservation.status, 'ملغي');
      assert.equal(refund.amount, -250);
      assert.equal(refund.notes, `استرداد كامل - إلغاء قبل الوصول #${id}`);
    });

    await t.test('early checkout stores the refund and marks the final stay as settled', () => {
      const room = addRoom('SC-CANCEL-MID', 200);
      const id = createReservation({ roomId: room.id, name: 'Cancel Mid Stay', checkIn: addDays(today, -3), checkOut: addDays(today, 5), totalPrice: 1600, paidAmount: 800 });
      appDb.checkoutReservation(id, { settleMode: 'refund', refundAmount: 200 });
      const reservation = appDb.getReservationById(id);
      const refund = appDb.getReservationPayments(id).at(-1);
      assert.equal(refund.amount, -200);
      assert.equal(reservation.payment_status, 'مدفوع بالكامل');
      assert.equal(reservation.total_price, 600);
      assert.equal(reservation.status, 'مكتمل');
    });
  });
});
