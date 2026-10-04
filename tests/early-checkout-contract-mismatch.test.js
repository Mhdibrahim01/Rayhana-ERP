'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('early checkout contract value mismatch: UI guard and DB behavior', async t => {
  await t.test('dashboard-reservations.js contains UI guards to block conflicting checkout confirmation', () => {
    const filePath = path.join(__dirname, '..', 'dashboard-reservations.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // 1. isPolicyMismatchBlocked is declared and calculated
    assert.ok(
      content.includes('const isPolicyMismatchBlocked'),
      'updateSettleCalculations must declare isPolicyMismatchBlocked'
    );

    // 2. Button is disabled when mismatch is blocked
    assert.ok(
      content.includes("btnConfirmSettleCheckout.disabled = true;"),
      'confirm button must be disabled when policy mismatch blocks checkout'
    );

    // 3. Balance box indicates mismatch rather than misleading debt/refund
    assert.ok(
      content.includes("settleBalanceValue.textContent = 'تعارض في بيانات العقد';"),
      'balance box must display conflict indicator'
    );

    // 4. Submit handler guards against submitting contract policy during mismatch
    assert.ok(
      content.includes("settlePolicyState.applicable && settlePolicyState.mismatch && policyPayload.checkoutPolicy !== 'actual'"),
      'submit handler must reject submission if mismatch is present under contract policy'
    );

    // 5. Radio buttons disabled for non-admin
    assert.ok(
      content.includes("settlePolicyContract.disabled = !settlePolicyState.canChoose"),
      'radio buttons must be disabled when user cannot choose policy'
    );
  });

  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    await t.test('case #47 reproduction: mismatch blocks default contract path and succeeds under actual policy', () => {
      const room = addRoom('MM-101', 100);
      const res = appDb.createReservation({
        guestName: 'Reservation 47 Case',
        guestPhone: '0577777777',
        roomId: room.id,
        bookingType: 'حجز شهري',
        checkInDate: addDays(today, -6),
        checkOutDate: addDays(today, 24),
        totalPrice: 3000,
        paidAmount: 1,
        paymentMethod: 'نقداً'
      });

      // Simulate the corruption in reservation #47 where total_price was 0 but paid was 1
      connection.getDb().run('UPDATE reservations SET total_price = 0 WHERE id = ?', [res.reservationId]);

      // Preview flags the mismatch
      const preview = appDb.computeCheckoutSettlement(res.reservationId, {});
      assert.equal(preview.isMonthlyEarlyCheckout, true);
      assert.equal(preview.contractValueMismatch, true);
      assert.equal(preview.paidAmount, 1);

      // Default contract checkout throws the review error
      assert.throws(
        () => appDb.checkoutReservation(res.reservationId, { settleMode: 'defer', checkoutPolicy: 'contract' }),
        /قيمة العقد المحسوبة .* لا تطابق الإجمالي المخزن/
      );

      // Reservation stays open
      const rowBefore = appDb.getReservationById(res.reservationId);
      assert.equal(rowBefore.status, 'مؤكد');

      // Admin exception with actual policy succeeds
      const settleResult = appDb.checkoutReservation(res.reservationId, {
        settleMode: 'defer',
        checkoutPolicy: 'actual',
        checkoutPolicyReason: 'اعتماد الليالي الفعلية لمعالجة تضارب العقد'
      });
      assert.equal(settleResult.success, true);
      assert.equal(settleResult.checkoutPolicy, 'actual');

      const rowAfter = appDb.getReservationById(res.reservationId);
      assert.equal(rowAfter.status, 'مكتمل');
      assert.equal(rowAfter.checkout_policy, 'actual');

      assertDatabaseIntegrity(connection, 'case 47 mismatch resolution');
    });
  });
});
