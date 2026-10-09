'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('hotel business date and timezone standardization', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const currentBizDate = appDb.getCurrentBusinessDate();
    assert.ok(currentBizDate, 'Hotel business date must be set');

    await t.test('hotel timezone defaults to Asia/Riyadh in settings and helpers', () => {
      const settings = appDb.getBusinessDaySettings();
      assert.equal(settings.hotel_timezone, 'Asia/Riyadh');
      assert.equal(appDb.getHotelTimezone(), 'Asia/Riyadh');
    });

    await t.test('formatHotelDateTime correctly formats UTC ISO string to hotel timezone', () => {
      // 2026-10-08 21:00:00 UTC is 2026-10-09 00:00:00 in Asia/Riyadh (UTC+3)
      const formatted = appDb.formatHotelDateTime('2026-10-08T21:00:00.000Z');
      assert.equal(formatted, '2026-10-09 00:00:00');
    });

    await t.test('same business date checkout post-midnight counts as 1 night, not 2', () => {
      const room = addRoom('HBD-101', 300);
      const resId = createReservation({
        roomId: room.id,
        name: 'Guest Midnight Checkout',
        checkIn: currentBizDate,
        checkOut: addDays(currentBizDate, 2),
        totalPrice: 600,
        paidAmount: 600
      });

      // computeCheckoutSettlement should use getCurrentBusinessDate()
      const settlement = appDb.computeCheckoutSettlement(resId, { checkoutPolicy: 'actual', checkoutPolicyReason: 'early' });
      assert.equal(settlement.actualNights, 1);
      assert.equal(settlement.netCharge, 300);
      assert.equal(settlement.difference, -300);
      assert.equal(settlement.needsRefund, true);

      // Perform checkout with refund
      const checkoutResult = appDb.checkoutReservation(resId, {
        settleMode: 'refund',
        refundAmount: 300,
        checkoutPolicy: 'actual',
        checkoutPolicyReason: 'early'
      });
      assert.equal(checkoutResult.finalTotal, 300);
      assertDatabaseIntegrity(connection, 'midnight checkout settlement');
    });

    await t.test('same business day cancellation is allowed as arrival-date void', () => {
      const room = addRoom('HBD-102', 200);
      const resId = createReservation({
        roomId: room.id,
        name: 'Walk-in Cancel Test',
        checkIn: currentBizDate,
        checkOut: addDays(currentBizDate, 1),
        totalPrice: 200,
        paidAmount: 200
      });

      const cancelResult = appDb.cancelReservation(resId);
      assert.equal(cancelResult.refundDue, 200);
      assert.equal(cancelResult.stillOwed, 0);
      const updated = appDb.getReservationById(resId);
      assert.equal(updated.status, 'ملغي');
      assertDatabaseIntegrity(connection, 'same business day void');
    });
  });
});
