'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('shift audit reports cancellation refunds and preserves historical cash', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const yesterday = addDays(today, -1);

    await t.test('same-day walk-in collection and cancellation refund are reflected in shift audit', () => {
      const room1 = addRoom('SA-101', 200);
      const res1 = appDb.createReservation({
        guestName: 'Same Day Cancel',
        guestPhone: '0500111222',
        roomId: room1.id,
        checkInDate: today,
        checkOutDate: addDays(today, 1),
        totalPrice: 200,
        paidAmount: 200,
        paymentMethod: 'نقداً'
      });

      const room2 = addRoom('SA-102', 110);
      appDb.createReservation({
        guestName: 'Other Guest',
        guestPhone: '0500333444',
        roomId: room2.id,
        checkInDate: today,
        checkOutDate: addDays(today, 1),
        totalPrice: 110,
        paidAmount: 110,
        paymentMethod: 'نقداً'
      });

      // Cancel res1
      appDb.cancelReservation(res1.reservationId);

      const report = appDb.getShiftAuditReport(today, today);
      // res1 payment (+200), res1 refund (-200), res2 payment (+110)
      assert.equal(report.financials.totalRevenue, 110, 'net revenue reflects both cancellation collection and refund');
      assert.equal(report.financials.cashTotal, 110, 'cash total reflects net drawer cash');
      assert.equal(report.financials.expectedCashInDrawer, 110, 'expected drawer cash includes net cash from cancelled booking');

      // Verify payments list includes the refund row
      const refundRow = report.payments.find(p => p.reservation_id === res1.reservationId && Number(p.amount) < 0);
      assert.ok(refundRow, 'cancellation refund row must be present in report.payments');
      assert.equal(Number(refundRow.amount), -200);
      assert.equal(refundRow.res_status, 'ملغي');
      assertDatabaseIntegrity(connection, 'same-day cancel shift audit');
    });

    await t.test('multi-day cancellation preserves Day 1 cash and deducts Day 2 refund drawer', () => {
      const room3 = addRoom('SA-103', 300);
      const res3 = appDb.createReservation({
        guestName: 'Yesterday Guest',
        guestPhone: '0500555666',
        roomId: room3.id,
        checkInDate: today,
        checkOutDate: addDays(today, 2),
        totalPrice: 600,
        paidAmount: 300,
        paymentMethod: 'نقداً'
      });

      // Move both the display timestamp and the operational allocation date.
      connection.getDb().run(
        'UPDATE payments SET payment_date = ?, business_date = ? WHERE reservation_id = ? AND amount > 0',
        [`${yesterday} 14:00:00`, yesterday, res3.reservationId]
      );

      // Verify yesterday audit before cancellation
      const yestBefore = appDb.getShiftAuditReport(yesterday, yesterday);
      assert.equal(yestBefore.financials.cashTotal, 300, 'yesterday had 300 cash collected');

      // Now cancel reservation today (Day 2)
      appDb.cancelReservation(res3.reservationId);

      // Verify yesterday audit AFTER cancellation: cash must NOT disappear!
      const yestAfter = appDb.getShiftAuditReport(yesterday, yesterday);
      assert.equal(yestAfter.financials.cashTotal, 300, 'yesterday cash must NOT disappear when booking is cancelled today');
      assert.ok(yestAfter.payments.some(p => p.reservation_id === res3.reservationId && Number(p.amount) === 300));

      // Verify today audit: must account for the 300 cash refund leaving the drawer
      const todayReport = appDb.getShiftAuditReport(today, today);
      // res1 net: 0, res2: +110, res3 refund today: -300 -> net cash = 110 - 300 = -190
      assert.equal(todayReport.financials.cashTotal, -190, 'today cash total accounts for 300 cash refund leaving drawer');
      assert.equal(todayReport.financials.expectedCashInDrawer, -190);
      assert.ok(todayReport.payments.some(p => p.reservation_id === res3.reservationId && Number(p.amount) === -300));
      assertDatabaseIntegrity(connection, 'multi-day cancellation audit preservation');
    });
  });
});
