'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const db = require('../db');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('checkout settlement scenarios', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    await t.test('2000 paid with 150 due uses the room rate when no custom rate exists', () => {
      const room = addRoom('CS-OWED', 2150);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Owed 150',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 5),
        totalPrice: 12900,
        paidAmount: 2000
      });
      const settlement = appDb.computeCheckoutSettlement(reservationId);
      assert.equal(appDb.getReservationById(reservationId).custom_nightly_price, null);
      assert.equal(settlement.effectiveNightlyRate, 2150);
      assert.equal(settlement.difference, 150);
      assert.equal(settlement.needsCollection, true);
      const result = appDb.checkoutReservation(reservationId, { settleMode: 'collect', collectAmount: 150 });
      assert.equal(result.finalTotal, 2150);
      assert.equal(appDb.getReservationById(reservationId).paid_amount, 2150);
      assertDatabaseIntegrity(connection, 'checkout: 2000 paid and 150 collected');
    });

    await t.test('zero paid can be checked out with the amount deferred', () => {
      const room = addRoom('CS-ZERO-PAID', 100);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Zero Paid',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 200,
        paidAmount: 0
      });
      const settlement = appDb.computeCheckoutSettlement(reservationId);
      assert.equal(settlement.paidAmount, 0);
      assert.equal(settlement.difference, 100);
      const result = appDb.checkoutReservation(reservationId, { settleMode: 'defer' });
      assert.equal(result.finalTotal, 100);
      assert.equal(appDb.getReservationById(reservationId).paid_amount, 0);
      assert.equal(appDb.getReservationById(reservationId).payment_status, 'غير مدفوع');
      assertDatabaseIntegrity(connection, 'checkout: zero paid deferred');
    });

    await t.test('checkout is rejected before the reservation arrival date', () => {
      const room = addRoom('CS-FUTURE-CHECKOUT', 180);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Future Checkout Guard',
        checkIn: addDays(today, 1),
        checkOut: addDays(today, 3),
        totalPrice: 360,
        paidAmount: 180
      });
      assert.throws(() => appDb.computeCheckoutSettlement(reservationId), /استخدم إلغاء الحجز/);
      assert.throws(() => appDb.checkoutReservation(reservationId, { settleMode: 'defer' }), /استخدم إلغاء الحجز/);
      assert.equal(appDb.getReservationById(reservationId).status, 'مؤكد');
      assert.equal(appDb.getReservationPayments(reservationId).length, 1);
      assertDatabaseIntegrity(connection, 'checkout blocked before arrival');
    });

    await t.test('remaining balance can be collected after a completed checkout', () => {
      const room = addRoom('CS-LATER-PAYMENT', 180);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Pay After Checkout',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 360,
        paidAmount: 50
      });

      appDb.checkoutReservation(reservationId, { settleMode: 'defer' });
      const payment = appDb.addPaymentToReservation({ reservationId, amount: 130, notes: 'سداد رصيد بعد تسجيل الخروج' });
      const completed = appDb.getReservationById(reservationId);
      assert.equal(completed.status, 'مكتمل');
      assert.equal(payment.remainingBalance, 0);
      assert.equal(completed.paid_amount, 180);
      assert.equal(completed.payment_status, 'مدفوع بالكامل');
      assert.equal(appDb.getReservationPayments(reservationId).reduce((sum, row) => sum + row.amount, 0), 180);
      assertDatabaseIntegrity(connection, 'payment after checkout');
    });

    await t.test('partial collection records only the collected amount and leaves the balance open', () => {
      const room = addRoom('CS-PARTIAL', 300);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Partial',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 4),
        totalPrice: 1500,
        paidAmount: 100
      });
      const result = appDb.checkoutReservation(reservationId, { settleMode: 'collect', collectAmount: 100 });
      assert.equal(result.finalTotal, 300);
      assert.equal(appDb.getReservationById(reservationId).paid_amount, 200);
      assert.equal(appDb.getReservationById(reservationId).payment_status, 'مدفوع جزئياً');
      assert.equal(connection.queryAll('SELECT amount FROM payments WHERE reservation_id = ?', [reservationId]).reduce((sum, row) => sum + row.amount, 0), 200);
      assertDatabaseIntegrity(connection, 'checkout: partial collection');
    });

    await t.test('deposit is tracked separately and can cover part of the stay balance', () => {
      const room = addRoom('CS-DEPOSIT-APPLY', 100);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Deposit Apply',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 200,
        paidAmount: 0,
        depositAmount: 40
      });
      const preview = appDb.computeCheckoutSettlement(reservationId);
      assert.equal(preview.depositAvailable, 40);
      assert.equal(appDb.getReservationPayments(reservationId).reduce((sum, row) => sum + row.amount, 0), 0);

      const result = appDb.checkoutReservation(reservationId, {
        settleMode: 'collect', collectAmount: 60, depositDisposition: 'apply'
      });
      const completed = appDb.getReservationById(reservationId);
      assert.equal(result.depositApplied, 40);
      assert.equal(result.depositRefunded, 0);
      assert.equal(completed.deposit_ledger_balance, 0);
      assert.equal(completed.paid_amount, 100);
      assert.equal(completed.payment_status, 'مدفوع بالكامل');
      assert.equal(appDb.getReservationPayments(reservationId).reduce((sum, row) => sum + row.amount, 0), 100);
      assertDatabaseIntegrity(connection, 'checkout: deposit applied to stay balance');
    });

    await t.test('default checkout disposition refunds the held deposit and keeps it outside payment receipts', () => {
      const room = addRoom('CS-DEPOSIT-REFUND', 100);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Deposit Refund',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 200,
        paidAmount: 100,
        depositAmount: 25
      });
      const result = appDb.checkoutReservation(reservationId, { settleMode: 'defer' });
      assert.equal(result.depositRefunded, 25);
      assert.equal(appDb.getReservationById(reservationId).deposit_ledger_balance, 0);
      assert.equal(appDb.getReservationPayments(reservationId).reduce((sum, row) => sum + row.amount, 0), 100);
      const movements = appDb.getReservationDepositMovements(reservationId);
      assert.deepEqual(movements.map(row => row.movement_type), ['collected', 'refunded']);
      assertDatabaseIntegrity(connection, 'checkout: deposit refunded separately');
    });

    await t.test('legacy deposit balance requires explicit reconciliation before it can be settled', () => {
      const room = addRoom('CS-DEPOSIT-LEGACY', 100);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Legacy Deposit',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 200,
        paidAmount: 100
      });
      connection.db.run('UPDATE reservations SET deposit_amount = 35 WHERE id = ?', [reservationId]);
      const preview = appDb.computeCheckoutSettlement(reservationId);
      assert.equal(preview.depositAvailable, 0);
      assert.equal(preview.depositLegacyUnreconciled, true);
      const collectedBeforeReconciliation = appDb.getShiftAuditReport(today).financials.depositActivity.collected;
      assert.throws(() => appDb.reconcileLegacyDeposit({ reservationId, amount: 30 }), /يطابق مبلغ التأمين/);
      appDb.reconcileLegacyDeposit({ reservationId, amount: 35, userId: 1 });
      const movements = appDb.getReservationDepositMovements(reservationId);
      assert.equal(movements[0].movement_type, 'reconciled');
      assert.equal(appDb.getReservationById(reservationId).deposit_ledger_balance, 35);
      assert.equal(appDb.getShiftAuditReport(today).financials.depositActivity.reconciled, 35);
      assert.equal(appDb.getShiftAuditReport(today).financials.depositActivity.collected, collectedBeforeReconciliation);
      assertDatabaseIntegrity(connection, 'checkout: historical deposit reconciled explicitly');
    });

    await t.test('an exact payment settles without inserting an extra ledger row', () => {
      const room = addRoom('CS-EXACT', 250);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Exact',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 2),
        totalPrice: 750,
        paidAmount: 250
      });
      const beforeCount = appDb.getReservationPayments(reservationId).length;
      assert.equal(appDb.computeCheckoutSettlement(reservationId).isSettled, true);
      const result = appDb.checkoutReservation(reservationId);
      assert.equal(result.settleMode, 'defer');
      assert.equal(appDb.getReservationById(reservationId).status, 'مكتمل');
      assert.equal(appDb.getReservationPayments(reservationId).length, beforeCount);
      assertDatabaseIntegrity(connection, 'checkout: exact match');
    });

    await t.test('Admin checkout discount is saved with its reason', () => {
      const room = addRoom('CS-DISCOUNT', 300);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Discount',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 3),
        totalPrice: 1200,
        paidAmount: 250
      });
      const settlement = appDb.computeCheckoutSettlement(reservationId, { discountAmount: 50, discountReason: 'خصم إداري للاختبار' });
      assert.equal(settlement.netCharge, 250);
      assert.equal(settlement.discountApplied, 50);
      appDb.checkoutReservation(reservationId, {
        settleMode: 'defer',
        discountAmount: 50,
        discountReason: 'خصم إداري للاختبار'
      });
      const completed = appDb.getReservationById(reservationId);
      assert.equal(completed.total_price, 250);
      assert.equal(completed.discount_amount, 50);
      assert.equal(completed.discount_reason, 'خصم إداري للاختبار');
      assertDatabaseIntegrity(connection, 'checkout: discount and reason');
    });

    await t.test('refund must equal paid minus net and is recorded as a negative payment row', () => {
      const room = addRoom('CS-REFUND', 2150);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Refund',
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 5),
        totalPrice: 12900,
        paidAmount: 2300
      });
      const settlement = appDb.computeCheckoutSettlement(reservationId);
      assert.equal(settlement.difference, -150);
      assert.equal(settlement.needsRefund, true);
      assert.throws(
        () => appDb.checkoutReservation(reservationId, { settleMode: 'refund', refundAmount: 149 }),
        /يجب أن يساوي الفرق الفعلي المستحق/
      );
      assert.equal(appDb.getReservationById(reservationId).status, 'مؤكد');
      const result = appDb.checkoutReservation(reservationId, { settleMode: 'refund', refundAmount: 150 });
      const refund = connection.queryAll('SELECT amount, notes FROM payments WHERE reservation_id = ? ORDER BY id DESC LIMIT 1', [reservationId])[0];
      assert.equal(result.finalTotal, 2150);
      assert.equal(refund.amount, -150);
      assert.equal(refund.notes, `استرداد - تسوية مغادرة #${reservationId}`);
      assert.equal(appDb.getReservationById(reservationId).paid_amount, 2150);
      assertDatabaseIntegrity(connection, 'checkout: exact refund');
    });

    await t.test('collection rejects zero and over-due amounts without changing the booking', () => {
      const room = addRoom('CS-BOUNDS', 200);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Bounds',
        checkIn: today,
        checkOut: addDays(today, 3),
        totalPrice: 600,
        paidAmount: 0
      });
      for (const amount of [0, 201]) {
        assert.throws(
          () => appDb.checkoutReservation(reservationId, { settleMode: 'collect', collectAmount: amount }),
          amount === 0 ? /أكبر من الصفر/ : /يتجاوز المبلغ المستحق/
        );
        assert.equal(appDb.getReservationById(reservationId).status, 'مؤكد');
        assert.equal(appDb.getReservationPayments(reservationId).length, 0);
      }
      assertDatabaseIntegrity(connection, 'checkout: collection bounds');
    });

    await t.test('second checkout is blocked after the reservation is completed', () => {
      const room = addRoom('CS-DOUBLE', 120);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Double Checkout',
        checkIn: today,
        checkOut: addDays(today, 2),
        totalPrice: 240,
        paidAmount: 120
      });
      appDb.checkoutReservation(reservationId, { settleMode: 'defer' });
      assert.throws(() => appDb.checkoutReservation(reservationId, { settleMode: 'defer' }), /مغلق بالفعل/);
      assert.equal(appDb.getReservationById(reservationId).status, 'مكتمل');
      assertDatabaseIntegrity(connection, 'checkout: duplicate prevented');
    });

    await t.test('failed checkout rolls back the inserted payment and reservation update', () => {
      const room = addRoom('CS-ROLLBACK', 100);
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Rollback',
        checkIn: today,
        checkOut: addDays(today, 3),
        totalPrice: 300,
        paidAmount: 0
      });
      connection.getDb().run(`
        CREATE TRIGGER test_abort_checkout
        BEFORE UPDATE ON reservations
        WHEN NEW.status = 'مكتمل'
        BEGIN SELECT RAISE(ABORT, 'forced checkout rollback'); END;
      `);
      assert.throws(
        () => appDb.checkoutReservation(reservationId, { settleMode: 'collect', collectAmount: 100 }),
        /forced checkout rollback/
      );
      assert.equal(appDb.getReservationById(reservationId).status, 'مؤكد');
      assert.equal(appDb.getReservationPayments(reservationId).length, 0);
      assert.equal(connection.queryAll('SELECT status FROM rooms WHERE id = ?', [room.id])[0].status, 'مشغولة');
      connection.getDb().run('DROP TRIGGER test_abort_checkout');
      assertDatabaseIntegrity(connection, 'checkout: transaction rollback');
    });

    await t.test('zero nightly rate is rejected by checkout settlement', () => {
      connection.getDb().run("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES ('CS-ZERO-RATE', 'وحدة اختبار', 0, 'متاحة')");
      const room = connection.queryAll("SELECT id FROM rooms WHERE room_number = 'CS-ZERO-RATE'")[0];
      const reservationId = createReservation({
        roomId: room.id,
        name: 'Settlement Zero Rate',
        checkIn: today,
        checkOut: addDays(today, 1),
        totalPrice: 100,
        paidAmount: 0
      });
      assertDatabaseIntegrity(connection, 'checkout: zero-rate setup');
      assert.throws(() => appDb.computeCheckoutSettlement(reservationId), /سعر الليلة/);
    });
  });
});
