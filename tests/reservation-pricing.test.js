'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('reservation creation stores custom rates and applies monthly discounts', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    await t.test('monthly custom rate and creation-time discount determine the 30-night total', () => {
      const room = addRoom('PR-MONTHLY', 200);
      const created = appDb.createReservation({
        guestName: 'Monthly Custom Rate',
        guestPhone: '0500000301',
        guestIdNumber: '1000000301',
        roomId: room.id,
        checkInDate: today,
        bookingType: 'حجز شهري',
        customNightlyPrice: 150,
        discountAmount: 300,
        discountReason: 'خصم اختبار'
      });
      const reservation = appDb.getReservationById(created.reservationId);
      assert.equal(reservation.custom_nightly_price, 150);
      assert.equal(reservation.discount_amount, 300);
      assert.equal(reservation.discount_reason, 'خصم اختبار');
      assert.equal(reservation.total_price, 4200);
      assert.equal(reservation.check_out_date, addDays(today, 30));
      assertDatabaseIntegrity(connection, 'monthly custom rate and discount');
    });

    await t.test('regular booking persists an explicit custom rate and discount metadata', () => {
      const room = addRoom('PR-REGULAR', 200);
      const created = appDb.createReservation({
        guestName: 'Regular Custom Rate',
        guestPhone: '0500000302',
        guestIdNumber: '1000000302',
        roomId: room.id,
        checkInDate: addDays(today, 2),
        checkOutDate: addDays(today, 4),
        totalPrice: 225,
        customNightlyPrice: 125,
        discountAmount: 25,
        discountReason: 'خصم حجز مباشر'
      });
      const reservation = appDb.getReservationById(created.reservationId);
      assert.equal(reservation.total_price, 225);
      assert.equal(reservation.custom_nightly_price, 125);
      assert.equal(reservation.discount_amount, 25);
      assert.equal(reservation.discount_reason, 'خصم حجز مباشر');
      assertDatabaseIntegrity(connection, 'regular custom rate and discount');
    });

    await t.test('room creation rejects a zero nightly rate', () => {
      assert.throws(
        () => appDb.addRoom({ room_number: 'PR-ZERO', type: 'وحدة اختبار', price_per_night: 0 }),
        /يرجى ملء جميع بيانات الغرفة/
      );
      assertDatabaseIntegrity(connection, 'zero room rate rejected');
    });
  });
});
