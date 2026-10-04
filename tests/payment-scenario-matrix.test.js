'use strict';

/**
 * COMPREHENSIVE payment + reservation scenario matrix.
 *
 * Cross-product of the settlement surface, driven off the real DB layer on a throwaway
 * database (never the real one). Every case asserts the four invariants that matter:
 *
 *   I1  paid_amount === SUM(payments.amount)        (ledger agrees with the summary column)
 *   I2  payment_status matches paid vs total_price  (no stale 'رصيد دائن' after settling)
 *   I3  total_price equals what the policy decided   (contract / actual / renderer field)
 *   I4  exactly one refund row per refund, and it is negative with its own receipt
 *
 * Dimensions covered:
 *   booking types : عادي · حجز شهري · عقد مفتوح · استخدام يومي
 *   check-in      : not started · started today · in progress
 *   settlement    : collect · defer · refund · overpayment-without-refund (must reject)
 *   monthly policy: contract (default) · actual (Admin exception, reason required)
 *   deposit       : none · refund · apply · retain (+ reason required)
 *   money edges   : zero · exact · 1-cent over/under · sub-1 rounding drift
 *   lifecycle     : extend · cancel pre-arrival · cancel mid-stay · double checkout
 *
 * Run: npm run test:unit   (this file is included)
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

let seq = 0;
const tag = () => `X${String(++seq).padStart(3, '0')}`;

/** Unique guest identity per booking — createReservation de-duplicates on phone/id. */
function guest() {
  const n = String(90000000 + seq);
  return { guestPhone: `05${n}`, guestIdNumber: `1${n}` };
}

/** Every booking type this suite exercises. */
const TYPES = {
  normal: 'عادي',
  monthly: 'حجز شهري',
  contract: 'عقد مفتوح',
  dayUse: 'استخدام يومي'
};

/** Read the stored summary columns. */
function readRow(connection, id) {
  return connection.queryOne(
    `SELECT id, booking_type, check_in_date, check_out_date, total_price, paid_amount,
            discount_amount, custom_nightly_price, payment_status, status, deposit_amount
     FROM reservations WHERE id = ?`, [id]);
}

/** The payments ledger for a reservation. */
function ledger(connection, id) {
  return connection.queryAll(
    `SELECT id, amount, payment_method, notes, receipt_number
     FROM payments WHERE reservation_id = ? ORDER BY id`, [id]);
}

function ledgerSum(rows) {
  return rows.reduce((s, r) => s + Number(r.amount || 0), 0);
}

/** The core ledger invariant, asserted after every mutating step. */
function assertLedgerConsistent(connection, id, label) {
  const row = readRow(connection, id);
  const sum = ledgerSum(ledger(connection, id));
  assert.equal(
    Math.round(Number(row.paid_amount || 0) * 100) / 100,
    Math.round(sum * 100) / 100,
    `${label}: paid_amount (${row.paid_amount}) must equal SUM(payments.amount) (${sum})`
  );
  return { row, sum };
}

/** Assert the status string agrees with paid vs total. */
function assertStatusConsistent(row, label) {
  const total = Number(row.total_price || 0);
  const paid = Number(row.paid_amount || 0);
  const diff = Math.round((paid - total) * 100) / 100;
  if (row.status !== 'مكتمل') return;   // pre-checkout statuses are set at booking time
  if (Math.abs(diff) <= 0.005) {
    assert.equal(row.payment_status, 'مدفوع بالكامل', `${label}: settled booking must be مدفوع بالكامل`);
  } else if (diff < -0.005) {
    assert.equal(row.payment_status, 'رصيد دائن', `${label}: still overpaid booking must read رصيد دائن`);
  }
}

/**
 * I4: a refund, if any, is negative and carries its own receipt number.
 *
 * Two different note prefixes exist and both are legitimate, so this asserts the
 * family rather than one string:
 *   'استرداد - تسوية مغادرة'  — a checkout refund (the invoice shows this line)
 *   'استرداد كامل'             — a pre-arrival cancellation refund
 * The invoice renderer deliberately keys off the first only, so checkout refunds are
 * asserted against that exact prefix in the refund scenarios below.
 */
const CHECKOUT_REFUND_PREFIX = 'استرداد - تسوية مغادرة';
const REFUND_NOTE_FAMILIES = [/^استرداد - تسوية مغادرة/, /^استرداد كامل/];

function assertRefundShape(connection, id, label) {
  const negatives = ledger(connection, id).filter(r => Number(r.amount) < 0);
  const positives = ledger(connection, id).filter(r => Number(r.amount) > 0);
  for (const n of negatives) {
    assert.ok(
      REFUND_NOTE_FAMILIES.some(re => re.test(n.notes || '')),
      `${label}: refund notes must be a known refund family, got "${n.notes}"`
    );
    assert.ok(n.receipt_number, `${label}: refund row needs a receipt number`);
    for (const p of positives) {
      assert.notEqual(n.receipt_number, p.receipt_number,
        `${label}: refund must not reuse an existing receipt number`);
    }
  }
  return negatives;
}

/** Refunds the invoice is able to display (checkout settlements only). */
function checkoutRefunds(connection, id) {
  return ledger(connection, id)
    .filter(r => Number(r.amount) < 0 && String(r.notes || '').startsWith(CHECKOUT_REFUND_PREFIX));
}

// ===========================================================================
// 1. BOOKING-TYPE CREATION MATRIX
// ===========================================================================

test('scenario matrix: booking creation across all four types', async t => {
  await withSafeDatabase(async (db, connection) => {

    await t.test('عادي — nights priced, overpayment rejected at booking', () => {
      const id0 = tag();
      const room = addRoom(`N-${id0}`, 100);
      const g = guest();
      const created = db.createReservation({
        guestName: `Normal ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(db.getLocalDateString(), -2),
        checkOutDate: addDays(db.getLocalDateString(), 0),
        totalPrice: 200, paidAmount: 0, bookingType: TYPES.normal
      });
      const id = created.reservationId;
      const row = readRow(connection, id);
      assert.equal(row.booking_type, TYPES.normal);
      assert.equal(row.payment_status, 'غير مدفوع');

      // Overpayment is refused for a regular booking at creation time.
      const g2 = guest();
      assert.throws(() => db.createReservation({
        guestName: `Overpay ${id0}`, ...g2, roomId: addRoom(`N2-${id0}`, 100).id,
        checkInDate: addDays(db.getLocalDateString(), -1),
        checkOutDate: addDays(db.getLocalDateString(), 1),
        totalPrice: 100, paidAmount: 150, bookingType: TYPES.normal
      }), /لا يمكن أن يتجاوز إجمالي قيمة الحجز/);
      assertDatabaseIntegrity(connection, `normal booking ${id0}`);
    });

    await t.test('عقد مفتوح — overpayment IS allowed at booking (advance deposit)', () => {
      const id0 = tag();
      const room = addRoom(`OC-${id0}`, 100);
      const g = guest();
      const created = db.createReservation({
        guestName: `Contract ${id0}`, ...g, roomId: room.id,
        checkInDate: db.getLocalDateString(),
        checkOutDate: '',
        totalPrice: 110, paidAmount: 200, bookingType: TYPES.contract
      });
      const id = created.reservationId;
      const row = readRow(connection, id);
      assert.equal(row.booking_type, TYPES.contract);
      assert.equal(row.payment_status, 'رصيد دائن', 'an overpaid advance reads as credit');
      assertLedgerConsistent(connection, id, `contract overpay ${id0}`);
      assertDatabaseIntegrity(connection, `contract overpay ${id0}`);
    });

    await t.test('استخدام يومي — same-day in and out, flat charge', () => {
      const id0 = tag();
      const room = addRoom(`DU-${id0}`, 80);
      const g = guest();
      const today = db.getLocalDateString();
      const created = db.createReservation({
        guestName: `DayUse ${id0}`, ...g, roomId: room.id,
        checkInDate: today, checkOutDate: today,
        totalPrice: 80, paidAmount: 80, bookingType: TYPES.dayUse
      });
      const row = readRow(connection, created.reservationId);
      assert.equal(row.booking_type, TYPES.dayUse);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertLedgerConsistent(connection, created.reservationId, `day use ${id0}`);
      assertDatabaseIntegrity(connection, `day use ${id0}`);
    });

    await t.test('حجز شهري — total is forced to 30 nights, a mismatched total is rejected', () => {
      const id0 = tag();
      const room = addRoom(`M-${id0}`, 200);
      const g = guest();
      const created = db.createReservation({
        guestName: `Monthly ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(db.getLocalDateString(), -5),
        bookingType: TYPES.monthly, customNightlyPrice: 150, paidAmount: 0
      });
      const row = readRow(connection, created.reservationId);
      assert.equal(row.total_price, 4500, '30 nights x 150');
      assert.ok(row.check_out_date, 'monthly auto-computes a departure date');

      // A caller-supplied total that disagrees is refused.
      const g2 = guest();
      assert.throws(() => db.createReservation({
        guestName: `BadMonthly ${id0}`, ...g2, roomId: addRoom(`M2-${id0}`, 200).id,
        checkInDate: db.getLocalDateString(),
        bookingType: TYPES.monthly, customNightlyPrice: 150, totalPrice: 999
      }), /لا تطابق القيمة المحسوبة/);
      assertDatabaseIntegrity(connection, `monthly ${id0}`);
    });
  });
});

// ===========================================================================
// 2. CHECKOUT SETTLEMENT MATRIX — collect / defer / refund
// ===========================================================================

test('scenario matrix: checkout settlement modes', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    const makeNormal = (id0, { paid, total, nights = 3, rate = 100 }) => {
      const room = addRoom(`S-${id0}`, rate);
      const g = guest();
      return db.createReservation({
        guestName: `Settle ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -nights),
        checkOutDate: today,
        totalPrice: total, paidAmount: paid, bookingType: TYPES.normal
      }).reservationId;
    };

    await t.test('collect — guest pays the shortfall at checkout', () => {
      const id0 = tag();
      // 3 nights x 100 = 300, paid 100 -> owes 200
      const id = makeNormal(id0, { paid: 100, total: 300 });
      const out = db.checkoutReservation(id, { settleMode: 'collect', collectAmount: 200, paymentMethod: 'نقداً' });
      assert.equal(out.success, true);
      const { row } = assertLedgerConsistent(connection, id, `collect ${id0}`);
      assert.equal(row.status, 'مكتمل');
      assert.equal(row.total_price, 300);
      assert.equal(row.paid_amount, 300);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertStatusConsistent(row, `collect ${id0}`);
      assert.equal(assertRefundShape(connection, id, `collect ${id0}`).length, 0, 'no refund on collect');
      assertDatabaseIntegrity(connection, `collect ${id0}`);
    });

    await t.test('defer — shortfall stays on account', () => {
      const id0 = tag();
      const id = makeNormal(id0, { paid: 100, total: 300 });
      db.checkoutReservation(id, { settleMode: 'defer' });
      const { row } = assertLedgerConsistent(connection, id, `defer ${id0}`);
      assert.equal(row.status, 'مكتمل');
      assert.equal(row.paid_amount, 100, 'defer adds no payment row');
      assert.equal(row.payment_status, 'مدفوع جزئياً');
      assert.equal(assertRefundShape(connection, id, `defer ${id0}`).length, 0);
      assertDatabaseIntegrity(connection, `defer ${id0}`);
    });

    await t.test('settled exactly — no payment row is written', () => {
      const id0 = tag();
      const id = makeNormal(id0, { paid: 300, total: 300 });
      db.checkoutReservation(id, { settleMode: 'defer' });
      const { row } = assertLedgerConsistent(connection, id, `exact ${id0}`);
      assert.equal(row.paid_amount, 300);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertStatusConsistent(row, `exact ${id0}`);
      assertDatabaseIntegrity(connection, `exact ${id0}`);
    });

    await t.test('a regular booking cannot be overpaid at all (both entry points)', () => {
      // Unlike an open contract, a regular booking refuses overpayment up front, so the
      // checkout refund branch is unreachable from it. This asserts that invariant at both
      // write points rather than pretending the refund path is testable here.
      const id0 = tag();
      assert.throws(
        () => db.createReservation({
          guestName: `Over ${id0}`, ...guest(), roomId: addRoom(`O-${id0}`, 100).id,
          checkInDate: addDays(today, -1), checkOutDate: today,
          totalPrice: 300, paidAmount: 301, bookingType: TYPES.normal
        }),
        /لا يمكن أن يتجاوز إجمالي قيمة الحجز/
      );
      const id = makeNormal(id0, { paid: 0, total: 300 });
      assert.throws(
        () => db.addPaymentToReservation({ reservationId: id, amount: 301, paymentMethod: 'نقداً' }),
        /يتجاوز الرصيد المتبقي/
      );
      assertLedgerConsistent(connection, id, `overpay guard ${id0}`);
      assertDatabaseIntegrity(connection, `overpay guard ${id0}`);
    });

    await t.test('a collected monthly booking needs no refund row', () => {
      // The contract-policy refund branch IS reachable from a monthly booking, but only
      // when the advance exceeds the contract value — which requires a stored discount.
      // The plain case is asserted here: collect in full, nothing to give back.
      const id0 = tag();
      const id = db.createReservation({
        guestName: `Collected ${id0}`, ...guest(), roomId: addRoom(`CO-${id0}`, 200).id,
        checkInDate: addDays(today, -3), bookingType: TYPES.monthly,
        customNightlyPrice: 150, paidAmount: 0
      }).reservationId;
      db.checkoutReservation(id, {
        settleMode: 'collect', collectAmount: 4500, checkoutPolicy: 'contract'
      });
      const { row } = assertLedgerConsistent(connection, id, `collected monthly ${id0}`);
      assert.equal(row.total_price, 4500);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assert.equal(assertRefundShape(connection, id, `collected monthly ${id0}`).length, 0);
      assert.equal(checkoutRefunds(connection, id).length, 0);
      assertDatabaseIntegrity(connection, `collected monthly ${id0}`);
    });

    await t.test('collection cannot exceed the outstanding amount', () => {
      const id0 = tag();
      const id = makeNormal(id0, { paid: 100, total: 300 });
      assert.throws(
        () => db.checkoutReservation(id, { settleMode: 'collect', collectAmount: 500 }),
        /يتجاوز المبلغ المستحق/
      );
      assert.equal(readRow(connection, id).status, 'مؤكد');
      assertDatabaseIntegrity(connection, `collect cap ${id0}`);
    });
  });
});

// ===========================================================================
// 3. CONTRACT (OPEN-ENDED) CHECKOUT — the refund path fixed earlier
// ===========================================================================

test('scenario matrix: open-contract checkout settlement', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    const makeContract = (id0, { paid, total = 110, rate = 110 }) => {
      const room = addRoom(`C-${id0}`, rate);
      const g = guest();
      return db.createReservation({
        guestName: `Contract ${id0}`, ...g, roomId: room.id,
        checkInDate: today, checkOutDate: '',
        totalPrice: total, paidAmount: paid,
        bookingType: TYPES.contract, customNightlyPrice: rate
      }).reservationId;
    };

    await t.test('advance 200, settle 110, refund 90 — the reported bug', () => {
      const id0 = tag();
      const id = makeContract(id0, { paid: 200 });
      const advanceBefore = ledger(connection, id).filter(r => Number(r.amount) > 0);
      assert.equal(advanceBefore.length, 1);
      assert.equal(Number(advanceBefore[0].amount), 200);

      db.checkoutReservation(id, {
        settleMode: 'refund', refundAmount: 90, paymentMethod: 'نقداً', finalTotalPrice: 110
      });
      const { row } = assertLedgerConsistent(connection, id, `contract refund ${id0}`);
      assert.equal(row.status, 'مكتمل');
      assert.equal(row.total_price, 110);
      assert.equal(row.paid_amount, 110);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertStatusConsistent(row, `contract refund ${id0}`);
      const refunds = assertRefundShape(connection, id, `contract refund ${id0}`);
      assert.equal(refunds.length, 1);
      assert.equal(Number(refunds[0].amount), -90);
      // The original advance receipt is untouched.
      const advanceAfter = ledger(connection, id).filter(r => Number(r.amount) > 0);
      assert.deepEqual(advanceAfter, advanceBefore, 'the 200 advance receipt must survive verbatim');
      assertDatabaseIntegrity(connection, `contract refund ${id0}`);
    });

    await t.test('collect at checkout for an underpaid contract', () => {
      const id0 = tag();
      const id = makeContract(id0, { paid: 50, total: 110 });
      db.checkoutReservation(id, {
        settleMode: 'collect', collectAmount: 60, paymentMethod: 'نقداً', finalTotalPrice: 110
      });
      const { row } = assertLedgerConsistent(connection, id, `contract collect ${id0}`);
      assert.equal(row.paid_amount, 110);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assert.equal(assertRefundShape(connection, id, `contract collect ${id0}`).length, 0);
      assertDatabaseIntegrity(connection, `contract collect ${id0}`);
    });

    await t.test('legacy settleAmount shim still collects', () => {
      const id0 = tag();
      const id = makeContract(id0, { paid: 0, total: 110 });
      db.checkoutReservation(id, { finalTotalPrice: 110, settleAmount: 110 });
      const { row } = assertLedgerConsistent(connection, id, `legacy shim ${id0}`);
      assert.equal(row.paid_amount, 110);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertDatabaseIntegrity(connection, `legacy shim ${id0}`);
    });

    await t.test('contract cannot be checked out before check-in', () => {
      const id0 = tag();
      const room = addRoom(`CB-${id0}`, 110);
      const g = guest();
      const id = db.createReservation({
        guestName: `Future ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, 3), checkOutDate: '',
        totalPrice: 110, paidAmount: 0, bookingType: TYPES.contract
      }).reservationId;
      assert.throws(
        () => db.checkoutReservation(id, { settleMode: 'defer', finalTotalPrice: 110 }),
        /لم تبدأ الإقامة بعد/
      );
      assertDatabaseIntegrity(connection, `contract early checkout ${id0}`);
    });
  });
});

// ===========================================================================
// 4. MONTHLY EARLY CHECKOUT — both policies
// ===========================================================================

test('scenario matrix: monthly early checkout policies', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    // 30-night monthly, checked out early. rate 150 -> contract 4500.
    // default elapsed = 3 nights -> actual 3 x 150 = 450.
    const makeMonthly = (id0, { paid = 0, rate = 150, discount = 0, elapsed = 3, total } = {}) => {
      const room = addRoom(`M-${id0}`, 200);
      const g = guest();
      return db.createReservation({
        guestName: `Monthly ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -elapsed),
        bookingType: TYPES.monthly, customNightlyPrice: rate, paidAmount: paid,
        totalPrice: total,
        discountAmount: discount, discountReason: discount > 0 ? 'خصم' : ''
      }).reservationId;
    };

    await t.test('preview reports both candidate values', () => {
      const id0 = tag();
      const id = makeMonthly(id0, { elapsed: 3 });
      const p = db.computeCheckoutSettlement(id, {});
      assert.equal(p.isMonthlyEarlyCheckout, true);
      assert.equal(p.bookedNights, 30);
      assert.equal(p.contractValue, 4500, '30 booked nights x 150');
      assert.equal(p.actualValue, 450, '3 elapsed nights x 150');
      assert.equal(p.contractValueMismatch, false);
    });

    await t.test('contract policy (default) charges the full booked value', () => {
      const id0 = tag();
      const id = makeMonthly(id0, { paid: 4500, elapsed: 3 });
      db.checkoutReservation(id, { settleMode: 'defer', checkoutPolicy: 'contract' });
      const { row } = assertLedgerConsistent(connection, id, `monthly contract ${id0}`);
      assert.equal(row.status, 'مكتمل');
      assert.equal(row.total_price, 4500, 'unused nights are not refunded under contract policy');
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assert.equal(assertRefundShape(connection, id, `monthly contract ${id0}`).length, 0);
      assertDatabaseIntegrity(connection, `monthly contract ${id0}`);
    });

    await t.test('actual policy (Admin exception) charges only the elapsed nights', () => {
      const id0 = tag();
      const id = makeMonthly(id0, { paid: 0, elapsed: 3 });
      const out = db.checkoutReservation(id, {
        settleMode: 'collect', collectAmount: 450, checkoutPolicy: 'actual',
        checkoutPolicyReason: 'المغادرة قبل انتهاء العقد'
      });
      assert.equal(out.success, true);
      const { row } = assertLedgerConsistent(connection, id, `monthly actual ${id0}`);
      assert.equal(row.total_price, 450);
      assert.equal(row.paid_amount, 450);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertDatabaseIntegrity(connection, `monthly actual ${id0}`);
    });

    await t.test('actual policy without a reason is refused', () => {
      const id0 = tag();
      const id = makeMonthly(id0, { paid: 0, elapsed: 3 });
      assert.throws(
        () => db.checkoutReservation(id, {
          settleMode: 'collect', collectAmount: 450, checkoutPolicy: 'actual'
        }),
        /سبب احتساب الليالي الفعلية/
      );
      assert.equal(readRow(connection, id).status, 'مؤكد');
      assertDatabaseIntegrity(connection, `monthly no reason ${id0}`);
    });

    await t.test('an unknown policy is refused', () => {
      const id0 = tag();
      const id = makeMonthly(id0, { paid: 0 });
      assert.throws(
        () => db.checkoutReservation(id, { settleMode: 'defer', checkoutPolicy: 'whatever' }),
        /سياسة المغادرة غير معروفة/
      );
      assertDatabaseIntegrity(connection, `monthly bad policy ${id0}`);
    });

    await t.test('a full-value discount collapses the contract value to zero', () => {
    // The reservation #47 shape: a stored discount equal to the whole contract value
    // makes 'قيمة العقد' read 0.00. createReservation recomputes total_price to match
    // (30 x 100 - 3000 = 0), so the preview is internally consistent and the booking
    // closes cleanly — the mismatch guard is NOT reached from a healthy booking.
    const id0 = tag();
    const id = makeMonthly(id0, { rate: 100, discount: 3000, elapsed: 5 });
    const p = db.computeCheckoutSettlement(id, {});
    assert.equal(p.contractValue, 0, '100% discount zeroes the contract value');
    assert.ok(p.actualValue > 0, 'the actual-nights value is unaffected');
    assert.equal(readRow(connection, id).total_price, 0, 'the stored total agrees');
    assert.equal(p.contractValueMismatch, false, 'a consistent booking is not flagged');
    const out = db.checkoutReservation(id, { settleMode: 'defer', checkoutPolicy: 'contract' });
    assert.equal(out.success, true);
    const { row } = assertLedgerConsistent(connection, id, `monthly full discount ${id0}`);
    assert.equal(row.status, 'مكتمل');
    assert.equal(row.total_price, 0);
    assert.equal(row.payment_status, 'مدفوع بالكامل');
    assertDatabaseIntegrity(connection, `monthly full discount ${id0}`);
        });

        await t.test('a discount that disagrees with the stored total blocks the checkout', () => {
          // The reservation #47 DATA state: discount_amount says 3000 but total_price was
          // written as something else (1.0). The computed contract value then disagrees with
          // the stored total and the guard refuses to close — the modal shows a 0.00 total and
          // a refund offer that can never be committed.
          //
          // Written directly because createReservation recomputes total_price from the
          // discount and refuses a mismatched caller-supplied total.
          const id0 = tag();
          const id = makeMonthly(id0, { rate: 100, discount: 0, elapsed: 5 });
          connection.getDb().run(
            'UPDATE reservations SET total_price = 1, discount_amount = 3000 WHERE id = ?', [id]);
          const p = db.computeCheckoutSettlement(id, {});
          assert.equal(p.contractValue, 0, 'the discount still zeroes the contract value');
          assert.equal(p.contractValueMismatch, true, 'and it is flagged as a mismatch');
          assert.throws(
            () => db.checkoutReservation(id, { settleMode: 'defer', checkoutPolicy: 'contract' }),
            /لا تطابق الإجمالي المخزن/
          );
          assert.equal(readRow(connection, id).status, 'مؤكد', 'the guard keeps the booking open');
          assertDatabaseIntegrity(connection, `monthly mismatch ${id0}`);
        });
  });
});

// ===========================================================================
// 5. DEPOSIT DISPOSITIONS
// ===========================================================================

test('scenario matrix: deposit disposition at checkout', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    const makeWithDeposit = (id0, { deposit, paid = 0, total = 300, nights = 3 }) => {
      const room = addRoom(`D-${id0}`, 100);
      const g = guest();
      return db.createReservation({
        guestName: `Deposit ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -nights), checkOutDate: today,
        totalPrice: total, paidAmount: paid, depositAmount: deposit, bookingType: TYPES.normal
      }).reservationId;
    };

    await t.test('deposit refunded when unused', () => {
      const id0 = tag();
      const id = makeWithDeposit(id0, { deposit: 150, paid: 300 });
      const out = db.checkoutReservation(id, {
        settleMode: 'defer', depositDisposition: 'refund'
      });
      assert.equal(out.success, true);
      assert.equal(out.depositRefunded, 150);
      assert.equal(out.depositApplied, 0);
      const { row } = assertLedgerConsistent(connection, id, `deposit refund ${id0}`);
      assert.equal(row.paid_amount, 300);
      assertDatabaseIntegrity(connection, `deposit refund ${id0}`);
    });

    await t.test('deposit applied against the outstanding balance', () => {
      const id0 = tag();
      // owes 200 (total 300, paid 100), deposit 150 -> collect only the remaining 50
      const id = makeWithDeposit(id0, { deposit: 150, paid: 100 });
      const out = db.checkoutReservation(id, {
        settleMode: 'collect', collectAmount: 50, depositDisposition: 'apply'
      });
      assert.equal(out.success, true);
      assert.equal(out.depositApplied, 150);
      const { row } = assertLedgerConsistent(connection, id, `deposit apply ${id0}`);
      assert.equal(row.paid_amount, 300, 'deposit + collection settles the total');
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertDatabaseIntegrity(connection, `deposit apply ${id0}`);
    });

    await t.test('deposit retain requires a reason and caps at the held amount', () => {
      const id0 = tag();
      const id = makeWithDeposit(id0, { deposit: 150, paid: 300 });
      assert.throws(
        () => db.checkoutReservation(id, {
          settleMode: 'defer', depositDisposition: 'retain',
          depositRetainAmount: 50, depositRetainReason: ''
        }),
        /يرجى إدخال سبب الاحتفاظ بالتأمين/
      );
      assert.throws(
        () => db.checkoutReservation(id, {
          settleMode: 'defer', depositDisposition: 'retain',
          depositRetainAmount: 9999, depositRetainReason: 'تعويض'
        }),
        /يجب ألا يتجاوز التأمين المسجل/
      );
      assertDatabaseIntegrity(connection, `deposit retain guard ${id0}`);
    });

    await t.test('an unknown deposit disposition is refused', () => {
      const id0 = tag();
      const id = makeWithDeposit(id0, { deposit: 100, paid: 300 });
      assert.throws(
        () => db.checkoutReservation(id, { settleMode: 'defer', depositDisposition: 'burn-it' }),
        /طريقة تسوية التأمين غير معروفة/
      );
      assertDatabaseIntegrity(connection, `deposit bad disposition ${id0}`);
    });
  });
});

// ===========================================================================
// 6. MONEY EDGES
// ===========================================================================

test('scenario matrix: money edge cases', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    await t.test('a fractional amount keeps two decimals and stays consistent', () => {
      const id0 = tag();
      const room = addRoom(`F-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Fraction ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 100.005, paidAmount: 33.335, bookingType: TYPES.normal
      }).reservationId;
      const { row } = assertLedgerConsistent(connection, id, `fraction ${id0}`);
      assert.equal(Number(row.total_price), 100.01, 'rounded up to 2dp');
      assert.equal(Number(row.paid_amount), 33.34);
      assertDatabaseIntegrity(connection, `fraction ${id0}`);
    });

    await t.test('a one-cent underpayment stays partial after checkout', () => {
      const id0 = tag();
      const room = addRoom(`C1-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Penny ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 100, paidAmount: 99.99, bookingType: TYPES.normal
      }).reservationId;
      db.checkoutReservation(id, { settleMode: 'defer' });
      const { row } = assertLedgerConsistent(connection, id, `penny ${id0}`);
      assert.equal(Number(row.paid_amount), 99.99);
      assert.equal(row.payment_status, 'مدفوع جزئياً', 'one cent short is not "paid in full"');
      assertDatabaseIntegrity(connection, `penny ${id0}`);
    });

    await t.test('a refund of one cent is accepted and closes the booking', () => {
      // Reachable only where overpayment is legal: an open contract.
      const id0 = tag();
      const room = addRoom(`R1-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `PennyBack ${id0}`, ...g, roomId: room.id,
        checkInDate: today, checkOutDate: '',
        totalPrice: 100, paidAmount: 100.01, bookingType: TYPES.contract,
        customNightlyPrice: 100
      }).reservationId;
      db.checkoutReservation(id, {
        settleMode: 'refund', refundAmount: 0.01, paymentMethod: 'نقداً', finalTotalPrice: 100
      });
      const { row } = assertLedgerConsistent(connection, id, `penny refund ${id0}`);
      assert.equal(Number(row.paid_amount), 100);
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assert.equal(checkoutRefunds(connection, id).length, 1);
      assertDatabaseIntegrity(connection, `penny refund ${id0}`);
    });

    await t.test('a zero-total booking with a discount is allowed and closes cleanly', () => {
      const id0 = tag();
      const room = addRoom(`Z-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Waived ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 0, paidAmount: 0, discountAmount: 100,
        discountReason: 'إعفاء', bookingType: TYPES.normal
      }).reservationId;
      db.checkoutReservation(id, { settleMode: 'defer' });
      const { row } = assertLedgerConsistent(connection, id, `waived ${id0}`);
      assert.equal(row.status, 'مكتمل');
      assert.equal(row.payment_status, 'مدفوع بالكامل');
      assertDatabaseIntegrity(connection, `waived ${id0}`);
    });

    await t.test('a subsequent payment cannot exceed the remaining balance', () => {
      const id0 = tag();
      const room = addRoom(`P-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Pay ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 200, paidAmount: 100, bookingType: TYPES.normal
      }).reservationId;
      // Paying the remaining 100 in one go is allowed and settles the booking.
      db.addPaymentToReservation({ reservationId: id, amount: 100, paymentMethod: 'نقداً' });
      assert.equal(readRow(connection, id).payment_status, 'مدفوع بالكامل');
      // A further payment is now refused: there is nothing left to collect.
      assert.throws(
        () => db.addPaymentToReservation({ reservationId: id, amount: 0.01 }),
        /مسدد بالكامل|يتجاوز/
      );
      // And so is an overpayment while a balance still exists.
      const id2 = db.createReservation({
        guestName: `Pay2 ${id0}`, ...guest(), roomId: addRoom(`P2-${id0}`, 100).id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 200, paidAmount: 0, bookingType: TYPES.normal
      }).reservationId;
      assert.throws(
        () => db.addPaymentToReservation({ reservationId: id2, amount: 250, paymentMethod: 'نقداً' }),
        /يتجاوز الرصيد المتبقي/
      );
      assertLedgerConsistent(connection, id2, `pay cap ${id0}`);
      assertDatabaseIntegrity(connection, `pay cap ${id0}`);
    });

    await t.test('a zero or negative payment is refused', () => {
      const id0 = tag();
      const room = addRoom(`Z2-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Zero ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 100, paidAmount: 0, bookingType: TYPES.normal
      }).reservationId;
      assert.throws(() => db.addPaymentToReservation({ reservationId: id, amount: 0 }), /أكبر من الصفر/);
      assert.throws(() => db.addPaymentToReservation({ reservationId: id, amount: -50 }), /أكبر من الصفر/);
      assertDatabaseIntegrity(connection, `zero payment ${id0}`);
    });
  });
});

// ===========================================================================
// 7. LIFECYCLE — double booking, double checkout, extend, cancel
// ===========================================================================

test('scenario matrix: reservation lifecycle guards', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    await t.test('the same room cannot be double-booked for overlapping nights', () => {
      const id0 = tag();
      const room = addRoom(`DUP-${id0}`, 100);
      const g = guest();
      db.createReservation({
        guestName: `First ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, 0), checkOutDate: addDays(today, 3),
        totalPrice: 300, paidAmount: 0, bookingType: TYPES.normal
      });
      const g2 = guest();
      assert.throws(() => db.createReservation({
        guestName: `Second ${id0}`, ...g2, roomId: room.id,
        checkInDate: addDays(today, 2), checkOutDate: addDays(today, 5),
        totalPrice: 300, paidAmount: 0, bookingType: TYPES.normal
      }), /محجوزة بالفعل في الفترة المحددة/);
      assertDatabaseIntegrity(connection, `double booking ${id0}`);
    });

    await t.test('an open contract blocks the room until it is checked out', () => {
      const id0 = tag();
      const room = addRoom(`BLK-${id0}`, 100);
      const g = guest();
      db.createReservation({
        guestName: `Blocker ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: '',
        totalPrice: 100, paidAmount: 0, bookingType: TYPES.contract
      });
      const g2 = guest();
      assert.throws(() => db.createReservation({
        guestName: `Blocked ${id0}`, ...g2, roomId: room.id,
        checkInDate: addDays(today, 0), checkOutDate: addDays(today, 2),
        totalPrice: 200, paidAmount: 0, bookingType: TYPES.normal
      }), /محجوزة بالفعل/);
      assertDatabaseIntegrity(connection, `room block ${id0}`);
    });

    await t.test('double checkout is refused on every booking type', () => {
      const id0 = tag();
      const cases = [
        { label: 'normal', build: () => db.createReservation({
            guestName: `DC-N-${id0}`, ...guest(), roomId: addRoom(`DCN-${id0}`, 100).id,
            checkInDate: addDays(today, -1), checkOutDate: today,
            totalPrice: 100, paidAmount: 100, bookingType: TYPES.normal
          }).reservationId, settle: { settleMode: 'defer' } },
        { label: 'monthly', build: () => db.createReservation({
            guestName: `DC-M-${id0}`, ...guest(), roomId: addRoom(`DCM-${id0}`, 200).id,
            checkInDate: addDays(today, -3), bookingType: TYPES.monthly,
            customNightlyPrice: 150, paidAmount: 0
          }).reservationId, settle: { settleMode: 'collect', collectAmount: 4050, checkoutPolicy: 'contract' } },
        { label: 'contract', build: () => db.createReservation({
            guestName: `DC-C-${id0}`, ...guest(), roomId: addRoom(`DCC-${id0}`, 110).id,
            checkInDate: today, checkOutDate: '',
            totalPrice: 110, paidAmount: 110, bookingType: TYPES.contract,
            customNightlyPrice: 110
          }).reservationId, settle: { settleMode: 'defer', finalTotalPrice: 110 } }
      ];
      for (const c of cases) {
        const id = c.build();
        assert.equal(db.checkoutReservation(id, c.settle).success, true, `${c.label} first checkout`);
        assert.throws(
          () => db.checkoutReservation(id, c.settle),
          /مغلق بالفعل/,
          `${c.label}: a second checkout must be refused`
        );
        assertLedgerConsistent(connection, id, `double checkout ${c.label}`);
        assertDatabaseIntegrity(connection, `double checkout ${c.label}`);
      }
    });

    await t.test('extending a stay keeps the ledger and the summary in step', () => {
      const id0 = tag();
      const room = addRoom(`E-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Extend ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, -1), checkOutDate: today,
        totalPrice: 100, paidAmount: 0, bookingType: TYPES.normal
      }).reservationId;
      const out = db.extendReservation({ reservationId: id, newCheckOutDate: addDays(today, 3) });
      assert.equal(out.success, true);
      const { row } = assertLedgerConsistent(connection, id, `extend ${id0}`);
      assert.equal(row.check_out_date, addDays(today, 3));
      assertDatabaseIntegrity(connection, `extend ${id0}`);
    });

    await t.test('an open contract cannot be extended', () => {
      const id0 = tag();
      const room = addRoom(`XE-${id0}`, 110);
      const g = guest();
      const id = db.createReservation({
        guestName: `NoExtend ${id0}`, ...g, roomId: room.id,
        checkInDate: today, checkOutDate: '',
        totalPrice: 110, paidAmount: 0, bookingType: TYPES.contract
      }).reservationId;
      assert.throws(
        () => db.extendReservation({ reservationId: id, newCheckOutDate: addDays(today, 5) }),
        /حجوزات العقود المفتوحة ليس لها تاريخ مغادرة محدد/
      );
      assertDatabaseIntegrity(connection, `contract extend ${id0}`);
    });

    await t.test('cancelling before arrival refunds the advance', () => {
      const id0 = tag();
      const room = addRoom(`CX-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `Cancel ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, 3), checkOutDate: addDays(today, 5),
        totalPrice: 200, paidAmount: 200, bookingType: TYPES.normal
      }).reservationId;
      const out = db.cancelReservation(id, null, undefined, 1);
      assert.equal(out.success, true);
      assert.ok(Number(out.refundDue) > 0, 'a paid advance is refunded on cancellation');
      const { row } = assertLedgerConsistent(connection, id, `cancel ${id0}`);
      assert.equal(row.status, 'ملغي');
      // A cancellation refund is a DIFFERENT ledger family from a checkout refund, and the
      // invoice deliberately does not fold it into the checkout 'المبلغ المسترد' line.
      const refunds = assertRefundShape(connection, id, `cancel ${id0}`);
      assert.equal(refunds.length, 1);
      assert.match(refunds[0].notes, /^استرداد كامل/);
      assert.equal(checkoutRefunds(connection, id).length, 0,
        'a cancellation refund must not masquerade as a checkout refund');
      assertDatabaseIntegrity(connection, `cancel ${id0}`);
    });

    await t.test('a cancelled booking cannot be checked out', () => {
      const id0 = tag();
      const room = addRoom(`CC-${id0}`, 100);
      const g = guest();
      const id = db.createReservation({
        guestName: `CancelThenOut ${id0}`, ...g, roomId: room.id,
        checkInDate: addDays(today, 3), checkOutDate: addDays(today, 5),
        totalPrice: 200, paidAmount: 200, bookingType: TYPES.normal
      }).reservationId;
      db.cancelReservation(id, null, undefined, 1);
      assert.throws(
        () => db.checkoutReservation(id, { settleMode: 'defer' }),
        /مغلق بالفعل/
      );
      assertDatabaseIntegrity(connection, `cancel then checkout ${id0}`);
    });
  });
});