'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

let seq = 0;
function uniqueGuest() {
  seq += 1;
  const n = String(90000000 + seq);
  return { guestPhone: `05${n}`, guestIdNumber: `1${n}` };
}

test('settlement, deposit, and invoice audit points (#3, #4, #9)', async t => {

  await t.test('Point #9: dashboard.js renders clear "رصيد دائن للنزيل (مستحق له)" and prominent styling', () => {
    const filePath = path.join(__dirname, '..', 'dashboard.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // 1. Invoice text for credit balance
    assert.ok(
      content.includes("isCredit ? 'رصيد دائن للنزيل (مستحق له):' : 'المبلغ المتبقي:'"),
      'Invoice must render explicit "رصيد دائن للنزيل (مستحق له):" when isCredit is true'
    );

    // 2. Invoice styling has dedicated background/border for credit balance
    assert.ok(
      content.includes("isCredit ? 'background: #eff6ff; border: 1px solid #bfdbfe;"),
      'Invoice must style credit balance with distinct light blue container'
    );

    // 3. Edit invoice modal preview
    assert.ok(
      content.includes("editInvRemainingPreview.textContent = `رصيد دائن للنزيل (مستحق له):"),
      'Edit invoice modal preview must use clear credit balance wording'
    );
  });

  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    // =========================================================================
    // POINT #3: Preserving original reservation payment method
    // =========================================================================
    await t.test('Point #3: Checkout collect does NOT overwrite original reservation payment method', () => {
      const room = addRoom('PM-101', 100);
      const res = appDb.createReservation({
        guestName: 'Original Transfer Guest',
        ...uniqueGuest(),
        roomId: room.id,
        checkInDate: addDays(today, -2),
        checkOutDate: today,
        totalPrice: 200,
        paidAmount: 150,
        paymentMethod: 'تحويل بنكي'
      });

      // Guest owes 50, pays remaining 50 at checkout via cash (نقداً)
      const co = appDb.checkoutReservation(res.reservationId, {
        settleMode: 'collect',
        collectAmount: 50,
        paymentMethod: 'نقداً'
      });
      assert.equal(co.success, true);

      const after = appDb.getReservationById(res.reservationId);
      assert.equal(after.status, 'مكتمل');
      assert.equal(after.payment_status, 'مدفوع بالكامل');
      assert.equal(after.paid_amount, 200);
      // Crucial: original payment method must be preserved
      assert.equal(after.payment_method, 'تحويل بنكي', 'reservation.payment_method must stay "تحويل بنكي"');

      // The payments ledger contains both transactions with their respective methods
      const pays = appDb.getReservationPayments(res.reservationId);
      assert.equal(pays.length, 2);
      assert.equal(pays[0].amount, 150);
      assert.equal(pays[0].payment_method, 'تحويل بنكي');
      assert.equal(pays[1].amount, 50);
      assert.equal(pays[1].payment_method, 'نقداً');

      assertDatabaseIntegrity(connection, 'Point #3 collect test');
    });

    await t.test('Point #3: Checkout refund does NOT overwrite original reservation payment method', () => {
      const room = addRoom('PM-102', 150);
      const res = appDb.createReservation({
        guestName: 'Early Refund Guest',
        ...uniqueGuest(),
        roomId: room.id,
        bookingType: 'حجز شهري',
        checkInDate: addDays(today, -5),
        checkOutDate: addDays(today, 25),
        totalPrice: 4500,
        paidAmount: 4500,
        paymentMethod: 'بطاقة / مدى'
      });

      // Guest leaves early under actual nights policy: 5 nights x 150 = 750, refund 3750 in cash (نقداً)
      const co = appDb.checkoutReservation(res.reservationId, {
        checkoutPolicy: 'actual',
        checkoutPolicyReason: 'إذن إداري للخروج المبكر',
        settleMode: 'refund',
        refundAmount: 3750,
        paymentMethod: 'نقداً'
      });
      assert.equal(co.success, true);

      const after = appDb.getReservationById(res.reservationId);
      assert.equal(after.status, 'مكتمل');
      assert.equal(after.payment_method, 'بطاقة / مدى', 'reservation.payment_method must stay "بطاقة / مدى"');

      const pays = appDb.getReservationPayments(res.reservationId);
      assert.equal(pays.length, 2);
      assert.equal(pays[0].amount, 4500);
      assert.equal(pays[0].payment_method, 'بطاقة / مدى');
      assert.equal(pays[1].amount, -3750);
      assert.equal(pays[1].payment_method, 'نقداً');

      assertDatabaseIntegrity(connection, 'Point #3 refund test');
    });

    await t.test('Point #3: Unpaid reservation sets payment_method when paid at checkout', () => {
      const room = addRoom('PM-103', 100);
      const res = appDb.createReservation({
        guestName: 'Unpaid Guest',
        ...uniqueGuest(),
        roomId: room.id,
        checkInDate: addDays(today, -1),
        checkOutDate: today,
        totalPrice: 100,
        paidAmount: 0,
        paymentMethod: 'نقداً'
      });

      // Checkout collects full 100 with card
      const co = appDb.checkoutReservation(res.reservationId, {
        settleMode: 'collect',
        collectAmount: 100,
        paymentMethod: 'بطاقة / مدى'
      });
      assert.equal(co.success, true);

      const after = appDb.getReservationById(res.reservationId);
      assert.equal(after.payment_method, 'بطاقة / مدى', 'Unpaid booking adopts checkout payment method');

      assertDatabaseIntegrity(connection, 'Point #3 unpaid adoption test');
    });

    await t.test('Point #3: Open contract checkout does NOT overwrite original payment method', () => {
      const room = addRoom('PM-104', 120);
      const res = appDb.createReservation({
        guestName: 'Contract Preserved Guest',
        ...uniqueGuest(),
        roomId: room.id,
        checkInDate: addDays(today, -2),
        checkOutDate: '',
        bookingType: 'عقد مفتوح',
        customNightlyPrice: 120,
        paidAmount: 200,
        paymentMethod: 'تحويل بنكي'
      });

      // Final total 240, paid 200, pays remaining 40 in cash
      const co = appDb.checkoutReservation(res.reservationId, {
        settleMode: 'collect',
        finalTotalPrice: 240,
        paymentMethod: 'نقداً'
      });
      assert.equal(co.success, true);

      const after = appDb.getReservationById(res.reservationId);
      assert.equal(after.payment_method, 'تحويل بنكي', 'Open contract preserves initial payment method');

      assertDatabaseIntegrity(connection, 'Point #3 open contract test');
    });

    await t.test('Point #3: addPaymentToReservation preserves initial payment method', () => {
      const room = addRoom('PM-105', 200);
      const res = appDb.createReservation({
        guestName: 'Add Payment Guest',
        ...uniqueGuest(),
        roomId: room.id,
        checkInDate: today,
        checkOutDate: addDays(today, 3),
        totalPrice: 600,
        paidAmount: 200,
        paymentMethod: 'تحويل بنكي'
      });

      const addResult = appDb.addPaymentToReservation({
        reservationId: res.reservationId,
        amount: 100,
        paymentMethod: 'نقداً',
        notes: 'دفعة نقدية إضافية'
      });
      assert.equal(addResult.success, true);

      const after = appDb.getReservationById(res.reservationId);
      assert.equal(after.paid_amount, 300);
      assert.equal(after.payment_method, 'تحويل بنكي', 'addPayment preserves primary method');

      assertDatabaseIntegrity(connection, 'Point #3 addPayment test');
    });

    // =========================================================================
    // POINT #4: Retained deposit does NOT pollute payments ledger
    // =========================================================================
    await t.test('Point #4: Retained deposit is stored in deposit_movements only, not payments ledger', () => {
      const room = addRoom('DEP-101', 100);
      const res = appDb.createReservation({
        guestName: 'Retained Deposit Guest',
        ...uniqueGuest(),
        roomId: room.id,
        checkInDate: addDays(today, -2),
        checkOutDate: today,
        totalPrice: 200,
        paidAmount: 200,
        depositAmount: 100,
        paymentMethod: 'نقداً'
      });

      // Checkout with retain: 60 retained for damage, 40 refunded
      const co = appDb.checkoutReservation(res.reservationId, {
        settleMode: 'defer',
        depositDisposition: 'retain',
        depositRetainAmount: 60,
        depositRetainReason: 'كسر مصباح الغرفة',
        depositRefundMethod: 'نقداً'
      });
      assert.equal(co.success, true);
      assert.equal(co.depositRetained, 60);
      assert.equal(co.depositRefunded, 40);

      const after = appDb.getReservationById(res.reservationId);
      assert.equal(after.status, 'مكتمل');
      assert.equal(after.paid_amount, 200, 'Stay paid_amount remains exactly 200');
      assert.equal(after.deposit_ledger_balance, 0);

      // Payments ledger: strictly contains stay payments (1 row of 200)
      const pays = appDb.getReservationPayments(res.reservationId);
      assert.equal(pays.length, 1, 'Payments ledger must not be polluted with retained deposit');
      assert.equal(pays[0].amount, 200);

      // Deposit movements: contains all movements
      const dMovements = appDb.getReservationDepositMovements(res.reservationId);
      const retainMv = dMovements.find(m => m.movement_type === 'retained');
      assert.ok(retainMv, 'deposit_movements must contain "retained" row');
      assert.equal(retainMv.amount, 60);
      assert.equal(retainMv.reason, 'كسر مصباح الغرفة');

      const refundMv = dMovements.find(m => m.movement_type === 'refunded');
      assert.ok(refundMv, 'deposit_movements must contain "refunded" row');
      assert.equal(refundMv.amount, 40);

      // Core invariant: paid_amount MUST strictly equal SUM(payments.amount)
      const paySum = pays.reduce((s, p) => s + Number(p.amount), 0);
      assert.equal(after.paid_amount, paySum, 'Core invariant holds: paid_amount == SUM(payments.amount)');

      assertDatabaseIntegrity(connection, 'Point #4 retain test');
    });

  });

  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    await t.test('Point #4: Shift audit accurately calculates expectedCashInDrawer with retained deposit', () => {
      const room = addRoom('DEP-102', 100);
      const res = appDb.createReservation({
        guestName: 'Audit Drawer Test Guest',
        ...uniqueGuest(),
        roomId: room.id,
        checkInDate: today,
        checkOutDate: addDays(today, 1),
        totalPrice: 100,
        paidAmount: 100,
        depositAmount: 50,
        paymentMethod: 'نقداً'
      });

      // Checkout today: 30 retained, 20 refunded in cash
      appDb.checkoutReservation(res.reservationId, {
        settleMode: 'defer',
        depositDisposition: 'retain',
        depositRetainAmount: 30,
        depositRetainReason: 'تلفيات مفاتيح',
        depositRefundMethod: 'نقداً'
      });

      const report = appDb.getShiftAuditReport(today, today);
      const fin = report.financials;

      assert.equal(fin.cashTotal, 100, 'cashTotal strictly reflects room stay cash (100 SAR)');
      assert.equal(fin.depositCashCollected, 50, 'Collected 50 cash deposit today');
      assert.equal(fin.depositCashRefunded, 20, 'Refunded 20 cash deposit today');
      assert.equal(fin.depositCashRetained, 30, 'Retained 30 cash deposit today');
      assert.equal(fin.netCashDeposit, 30, 'netCashDeposit in drawer is 50 - 20 = 30');
      // Cash in drawer must be stay cash + net deposit cash (100 + 30 = 130)
      assert.equal(fin.expectedCashInDrawer, 130);
      assert.equal(fin.expectedCashInDrawer, fin.cashTotal + fin.netCashDeposit);

      assertDatabaseIntegrity(connection, 'Point #4 audit drawer test');
    });

  });
});
