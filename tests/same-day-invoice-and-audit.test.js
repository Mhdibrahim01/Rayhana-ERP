'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('same-day stays, check-outs counting, and shift audit reservation log', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);

    await t.test('checkoutsInRange strictly counts completed checkouts and ignores in-house or cancelled ones', () => {
      const room1 = addRoom('CO-101', 150);
      const room2 = addRoom('CO-102', 150);
      const room3 = addRoom('CO-103', 150);

      // 1. Completed checkout today
      const res1 = appDb.createReservation({
        guestName: 'Completed Guest',
        guestPhone: '0511111111',
        roomId: room1.id,
        checkInDate: yesterday,
        checkOutDate: today,
        totalPrice: 150,
        paidAmount: 150,
        paymentMethod: 'نقداً'
      });
      appDb.checkoutReservation(res1.reservationId, { paymentMethod: 'نقداً' });

      // 2. Active confirmed guest due to checkout today (still in-house, status = 'مؤكد')
      const res2 = appDb.createReservation({
        guestName: 'In House Guest',
        guestPhone: '0522222222',
        roomId: room2.id,
        checkInDate: yesterday,
        checkOutDate: today,
        totalPrice: 150,
        paidAmount: 150,
        paymentMethod: 'نقداً'
      });

      // 3. Cancelled booking with check_out_date = today (status = 'ملغي')
      const res3 = appDb.createReservation({
        guestName: 'Cancelled Guest',
        guestPhone: '0533333333',
        roomId: room3.id,
        bookingType: 'استخدام يومي',
        checkInDate: today,
        checkOutDate: today,
        totalPrice: 150,
        paidAmount: 0,
        paymentMethod: 'نقداً'
      });
      // Cancel same-day reservation
      appDb.cancelReservation(res3.reservationId);

      const report = appDb.getShiftAuditReport(today, today);
      assert.equal(report.movements.checkoutsToday, 1, 'only the completed checkout should be counted');
      assert.equal(report.movements.totalCheckouts, 1, 'totalCheckouts must match completed count');

      assertDatabaseIntegrity(connection, 'checkouts count verification');
    });

    await t.test('shift audit reservationsInRange includes same-day cancellations while protecting expectedTotal', () => {
      const room4 = addRoom('CO-104', 250);
      const res4 = appDb.createReservation({
        guestName: 'Same Day Cancel Guest',
        guestPhone: '0544444444',
        roomId: room4.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        totalPrice: 250,
        paidAmount: 250,
        paymentMethod: 'نقداً'
      });
      appDb.cancelReservation(res4.reservationId);

      const report = appDb.getShiftAuditReport(today, today);
      const txRow = report.transactions.find(t => t.id === res4.reservationId);
      assert.ok(txRow, 'cancelled reservation created today must appear in transactions list (سجل حركة الحجوزات)');
      assert.equal(txRow.status, 'ملغي');

      // Ensure expectedTotal and outstandingTotal exclude the cancelled reservation
      // In this temp db, only the remaining non-cancelled reservations contribute to expectedTotal
      const allNonCancelled = report.transactions.filter(t => t.status !== 'ملغي');
      const expectedSum = allNonCancelled.reduce((sum, r) => sum + Number(r.total_price || 0), 0);
      assert.equal(report.financials.expectedTotal, expectedSum);

      assertDatabaseIntegrity(connection, 'reservations log cancellation inclusion');
    });

    await t.test('getTodayCheckouts ignores cancelled reservations', () => {
      const todayCheckouts = appDb.getTodayCheckouts(today);
      const cancelledFound = todayCheckouts.find(r => r.status === 'ملغي');
      assert.equal(cancelledFound, undefined, 'cancelled reservations should not appear in getTodayCheckouts');
      assertDatabaseIntegrity(connection, 'today checkouts no cancelled');
    });

    await t.test('invoice data reconciliation for cancelled reservation and checkout refund', () => {
      const room5 = addRoom('CO-105', 200);
      const res5 = appDb.createReservation({
        guestName: 'Invoice Cancel Guest',
        guestPhone: '0555555555',
        roomId: room5.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        totalPrice: 200,
        paidAmount: 200,
        paymentMethod: 'نقداً'
      });
      appDb.cancelReservation(res5.reservationId);

      const invData = appDb.getReservationById(res5.reservationId);
      assert.equal(invData.status, 'ملغي');
      assert.equal(invData.paid_amount, 0);

      const payments = appDb.getReservationPayments(res5.reservationId);
      let originalCollected = 0;
      let refundedTotal = 0;
      for (const p of payments) {
        const amt = Number(p.amount) || 0;
        if (amt > 0) originalCollected += amt;
        else if (amt < 0) refundedTotal += Math.abs(amt);
      }
      assert.equal(originalCollected, 200);
      assert.equal(refundedTotal, 200);
      // Net paid is 0, so no false debt or negative balance remains
      const effectiveTotal = invData.status === 'ملغي' ? 0 : invData.total_price;
      const netPaid = invData.paid_amount;
      const remaining = effectiveTotal - netPaid;
      assert.equal(effectiveTotal, 0);
      assert.equal(remaining, 0);

      assertDatabaseIntegrity(connection, 'invoice cancelled data');
    });

    await t.test('shift audit excludes stay-overs from 4 days ago that had no activity today', () => {
      const room6 = addRoom('CO-106', 300);
      const fourDaysAgo = addDays(today, -4);
      const fourDaysLater = addDays(today, 4);

      // Create a reservation that started 4 days ago
      const res6 = appDb.createReservation({
        guestName: 'Stay Over Guest',
        guestPhone: '0566666666',
        roomId: room6.id,
        checkInDate: fourDaysAgo,
        checkOutDate: fourDaysLater,
        totalPrice: 2400,
        paidAmount: 2400,
        paymentMethod: 'نقداً'
      });
      // Backdate created_at and payment_date to 4 days ago
      connection.getDb().run(
        "UPDATE reservations SET created_at = ?, created_business_date = ? WHERE id = ?",
        [`${fourDaysAgo} 12:00:00`, fourDaysAgo, res6.reservationId]
      );
      connection.getDb().run(
        "UPDATE payments SET payment_date = ?, business_date = ? WHERE reservation_id = ?",
        [`${fourDaysAgo} 12:00:00`, fourDaysAgo, res6.reservationId]
      );
      connection.getDb().run(
        "UPDATE reservation_events SET business_date = ? WHERE entity_type = 'reservation' AND entity_id = ?",
        [fourDaysAgo, res6.reservationId]
      );

      const reportToday = appDb.getShiftAuditReport(today, today);
      const foundStayOver = reportToday.transactions.find(t => t.id === res6.reservationId);
      assert.equal(
        foundStayOver,
        undefined,
        'a stay-over from 4 days ago with no activity today must not appear in today shift audit transactions'
      );

      assertDatabaseIntegrity(connection, 'exclude inactive stay-overs');
    });
  });
});
