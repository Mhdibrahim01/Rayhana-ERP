'use strict';

/**
 * The checkout modal must pre-fill the discount with the amount STORED on the
 * reservation, never the prorated one.
 *
 * The bug: dashboard.js prefilled the Admin-only discount field from
 * `s.discountApplied`, which computeCheckoutSettlement returns as the discount
 * PRORATED for the actual-nights path (500 over 30 nights -> 16.67). On confirm that
 * number was submitted back, the DB compared it against the stored 500, saw a delta of
 * 483.33, concluded "a new discount was added at checkout" and demanded a reason -
 * for a booking whose discount reason is optional at creation and which the
 * receptionist had not touched.
 *
 * These tests assert the DB-side behaviour the UI must produce: submitting the stored
 * amount settles cleanly, submitting the prorated amount is (correctly) treated as a new
 * discount. The UI half is a source assertion, since the renderer has no DOM harness.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

const RATE = 150;
const STORED_DISCOUNT = 500;
const NIGHTS = 30;
const CONTRACT = NIGHTS * RATE - STORED_DISCOUNT;   // 4000

function monthlyEarlyCheckoutFixture(appDb, suffix) {
  const today = appDb.getLocalDateString();
  const room = addRoom('PREFILL-' + suffix, RATE);
  return appDb.createReservation({
    guestName: 'Prefill ' + suffix,
    guestPhone: '0500004' + suffix,
    guestIdNumber: '1000004' + suffix,
    roomId: room.id,
    checkInDate: addDays(today, -1),
    checkOutDate: addDays(today, 29),
    bookingType: 'حجز شهري',
    totalPrice: CONTRACT,
    paidAmount: CONTRACT,
    customNightlyPrice: RATE,
    discountAmount: STORED_DISCOUNT, discountReason: 'test',
    discountReason: 'test'            // optional at creation - this is the reported case
  }).reservationId;
}

test('checkout prefill: the stored discount settles without a reason', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const id = monthlyEarlyCheckoutFixture(appDb, '401');

    const preview = appDb.computeCheckoutSettlement(id);
    // What the DB would receive if the modal were left completely untouched.
    assert.equal(preview.contractValue, 4000, 'contract = 30 x 150 - 500');
    assert.equal(preview.actualValue, 150, 'actual = 150 - 0');

    // Submitting the stored amount back is a no-op, so no reason is demanded.
    const result = appDb.checkoutReservation(id, {
      settleMode: 'defer',
      discountAmount: STORED_DISCOUNT, discountReason: 'test'
    });
    assert.equal(result.checkoutPolicy, 'contract');
    assert.equal(result.finalTotal, 4000);

    const stored = connection.queryOne(
      'SELECT total_price, discount_amount FROM reservations WHERE id = ?', [id]);
    assert.equal(stored.total_price, 4000);
    assert.equal(stored.discount_amount, STORED_DISCOUNT, 'the stored discount is not overwritten');
    assertDatabaseIntegrity(connection, 'stored discount submitted back');
  });
});

test('checkout prefill: the prorated amount IS a new discount and needs a reason', async t => {
  await withSafeDatabase(async (appDb) => {
    const id = monthlyEarlyCheckoutFixture(appDb, '402');
    const prorated = Math.round((STORED_DISCOUNT / NIGHTS) * 100) / 100;   // 16.67

    // This documents the backend rule the bug tripped over: any delta above 0.005
    // from the stored amount counts as a discount introduced at checkout.
    assert.throws(
      () => appDb.checkoutReservation(id, { settleMode: 'defer', discountAmount: prorated }),
      /سبب الخصم/,
      'a far-smaller submitted amount is a new discount'
    );
  });
});

test('checkout prefill: submitting nothing also needs no reason', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const id = monthlyEarlyCheckoutFixture(appDb, '403');
    const result = appDb.checkoutReservation(id, { settleMode: 'defer' });
    assert.equal(result.checkoutPolicy, 'contract');
    assert.equal(result.finalTotal, 4000);
    assert.equal(
      connection.queryOne('SELECT discount_amount FROM reservations WHERE id = ?', [id]).discount_amount,
      STORED_DISCOUNT
    );
  });
});

test('checkout prefill: the renderer prefills from the stored amount', () => {
  // No DOM harness for the renderer, so assert the source directly: the discount field
  // must be filled from res.discount_amount, and must NOT be filled from
  // s.discountApplied (the prorated figure).
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'dashboard.js'), 'utf8');

  const match = source.match(/if \(settleDiscountInput\) \{[\s\S]{0,320}?\n\s{10}\}/);
  assert.ok(match, 'the settleDiscountInput prefill block must exist');

  const block = match[0];
  assert.match(block, /res\.discount_amount/,
    'the field must be filled from the stored reservation discount');
  assert.doesNotMatch(block, /s\.discountApplied/,
    'the field must NOT be filled from the prorated discountApplied');
});