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
  });
});
