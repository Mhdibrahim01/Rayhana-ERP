'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

/**
 * The departure date for a monthly booking: the same calendar day next month, clamped
 * to that month's last day when it is shorter (2026-01-31 -> 2026-02-28). Duplicated
 * here on purpose - the test states the expectation rather than trusting the module
 * under test to supply it.
 */
function calendarMonthCheckOut(checkInDateStr) {
  const [y, m, d] = String(checkInDateStr).split('-').map(Number);
  const lastDayOfNextMonth = new Date(y, m + 1, 0).getDate();
  const clampedDay = Math.min(d, lastDayOfNextMonth);
  const nextMonth = new Date(y, m, 1);
  return nextMonth.getFullYear() + '-' +
    String(nextMonth.getMonth() + 1).padStart(2, '0') + '-' +
    String(clampedDay).padStart(2, '0');
}

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
      // One full calendar month priced as a closed 30-night package: 30 x 150 less 300.
      assert.equal(reservation.total_price, 4200);
      // The departure is the same calendar day next month, clamped at month end - NOT
      // a fixed +30 day span, which drifts by a day whenever the month is longer.
      assert.equal(reservation.check_out_date, calendarMonthCheckOut(today));
      assertDatabaseIntegrity(connection, 'monthly custom rate and discount');
    });

    await t.test('a supplied monthly total that disagrees with the computed one is rejected', () => {
      // 30 nights x 150 less a 300 discount = 4200. The caller used to be able to
      // store any number, which is how total_price drifted away from the stored
      // dates and rate and later tripped the contract-value guard at checkout.
      const room = addRoom('PR-DRIFT', 200);
      assert.throws(
        () => appDb.createReservation({
          guestName: 'Monthly Drift',
          guestPhone: '0500000310',
          guestIdNumber: '1000000310',
          roomId: room.id,
          checkInDate: today,
          bookingType: 'حجز شهري',
          customNightlyPrice: 150,
          discountAmount: 300,
          discountReason: 'خصم اختبار',
          totalPrice: 9999
        }),
        /لا تطابق القيمة المحسوبة/
      );

      // Each remaining case uses its own room: the overlap guard correctly refuses
      // two confirmed bookings in the same room for the same dates.
      // A total that agrees with the computed value is still accepted.
      const ok = appDb.createReservation({
        guestName: 'Monthly Agreed',
        guestPhone: '0500000311',
        guestIdNumber: '1000000311',
        roomId: addRoom('PR-DRIFT-OK', 200).id,
        checkInDate: today,
        bookingType: 'حجز شهري',
        customNightlyPrice: 150,
        discountAmount: 300,
        discountReason: 'خصم اختبار',
        totalPrice: 4200
      });
      assert.equal(appDb.getReservationById(ok.reservationId).total_price, 4200);

      // Omitting the total entirely still lets the backend compute it.
      const auto = appDb.createReservation({
        guestName: 'Monthly Auto',
        guestPhone: '0500000312',
        guestIdNumber: '1000000312',
        roomId: addRoom('PR-DRIFT-AUTO', 200).id,
        checkInDate: today,
        bookingType: 'حجز شهري',
        customNightlyPrice: 150,
        discountAmount: 300,
        discountReason: 'خصم اختبار'
      });
      assert.equal(appDb.getReservationById(auto.reservationId).total_price, 4200);
      assertDatabaseIntegrity(connection, 'monthly total must match the computed value');
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
