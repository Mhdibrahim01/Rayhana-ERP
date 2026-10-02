'use strict';

/**
 * The late-checkout fee must behave identically under both monthly early-checkout
 * policies.
 *
 * In checkoutReservation the fee is added AFTER the policy branch settles the
 * accommodation net:
 *
 *     finalTotal = accommodationNetTotal + normalizedLateCheckoutFee
 *
 * so the fee is orthogonal to the policy - a guest who leaves late still owes it,
 * whether the unused nights are charged at the contract value or the actual nights.
 * Nothing tested that, so an edit moving the fee inside the branch would be
 * invisible.
 *
 * One thing to know when reading these: the PREVIEW is always actual-nights.
 * computeCheckoutSettlement reports contractValue and actualValue side by side but
 * does not choose; accommodationNetCharge and netCharge always reflect actual nights.
 * The contract value is only applied at checkout. So the preview cannot show what the
 * fee will do under the contract policy - it can only be verified through checkout.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

const RATE = 150;
const DISCOUNT = 600;
const CONTRACT = 30 * RATE - DISCOUNT;   // 3900
const ACTUAL_NET = 130;                  // 1 night at 150, minus 20 of the 600

test('monthly early checkout: the late fee applies under the contract policy', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const checkIn = addDays(today, -1);
    const bookedOut = addDays(today, 29);

    const room = addRoom('LF-CONTRACT', RATE);
    const id = appDb.createReservation({
      guestName: 'Late Fee Contract',
      guestPhone: '0500008801',
      guestIdNumber: '1000008801',
      roomId: room.id,
      checkInDate: checkIn,
      checkOutDate: bookedOut,
      bookingType: 'حجز شهري',
      totalPrice: CONTRACT,
      paidAmount: CONTRACT,
      discountAmount: DISCOUNT,
      discountReason: 'خصم تعاقد'
    }).reservationId;

    const preview = appDb.computeCheckoutSettlement(id, { lateCheckoutFee: 50 });
    assert.equal(preview.isMonthlyEarlyCheckout, true);
    assert.equal(preview.contractValue, CONTRACT, 'the contract value is reported');
    assert.equal(preview.actualValue, ACTUAL_NET);
    assert.equal(preview.accommodationNetCharge, ACTUAL_NET, 'the preview is always actual-nights');
    assert.equal(preview.netCharge, ACTUAL_NET + 50, 'netCharge carries the fee');
    assert.equal(preview.lateCheckoutFee, 50);

    const result = appDb.checkoutReservation(id, { settleMode: 'defer', lateCheckoutFee: 50 });
    assert.equal(result.checkoutPolicy, 'contract');
    assert.equal(result.finalTotal, CONTRACT + 50, 'the fee rides on top of the contract value');
    assert.equal(result.lateCheckoutFee, 50);

    const stored = connection.queryOne(
      'SELECT total_price, paid_amount, late_checkout_fee, checkout_policy FROM reservations WHERE id = ?',
      [id]);
    assert.equal(stored.total_price, CONTRACT + 50, 'the fee is in the stored total');
    assert.equal(stored.late_checkout_fee, 50, 'the fee is stored');
    assert.equal(stored.checkout_policy, 'contract');
    assert.equal(result.difference, 50, 'the guest owes only the fee on top of the contract');
    assertDatabaseIntegrity(connection, 'late fee under the contract policy');
  });
});

test('monthly early checkout: the late fee applies under the Admin actual policy', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const checkIn = addDays(today, -1);
    const bookedOut = addDays(today, 29);

    const room = addRoom('LF-ACTUAL', RATE);
    const id = appDb.createReservation({
      guestName: 'Late Fee Actual',
      guestPhone: '0500008802',
      guestIdNumber: '1000008802',
      roomId: room.id,
      checkInDate: checkIn,
      checkOutDate: bookedOut,
      bookingType: 'حجز شهري',
      totalPrice: CONTRACT,
      paidAmount: CONTRACT,
      discountAmount: DISCOUNT,
      discountReason: 'خصم تعاقد'
    }).reservationId;

    // Paid the contract, so the difference is refunded: 3900 paid against 180 due.
    const result = appDb.checkoutReservation(id, {
      settleMode: 'refund',
      refundAmount: 3720,
      lateCheckoutFee: 50,
      checkoutPolicy: 'actual',
      checkoutPolicyReason: 'وافق النزيل على بدئ مبكر'
    });
    assert.equal(result.checkoutPolicy, 'actual');
    assert.equal(result.finalTotal, ACTUAL_NET + 50, 'the same fee is added to the actual value');

    const stored = connection.queryOne(
      'SELECT total_price, late_checkout_fee, checkout_policy FROM reservations WHERE id = ?', [id]);
    assert.equal(stored.total_price, 180);
    assert.equal(stored.late_checkout_fee, 50);
    assert.equal(stored.checkout_policy, 'actual');
    assertDatabaseIntegrity(connection, 'late fee under the actual policy');
  });
});

test('monthly early checkout: the same fee contributes the same delta either way', async t => {
  await withSafeDatabase(async (appDb) => {
    const today = appDb.getLocalDateString();
    const checkIn = addDays(today, -1);
    const bookedOut = addDays(today, 29);
    const FEE = 75;

    const book = (suffix) => {
      const room = addRoom('LF-P' + suffix, RATE);
      return appDb.createReservation({
        guestName: 'Fee Parity ' + suffix,
        guestPhone: '0500008' + suffix,
        guestIdNumber: '1000008' + suffix,
        roomId: room.id,
        checkInDate: checkIn,
        checkOutDate: bookedOut,
        bookingType: 'حجز شهري',
        totalPrice: CONTRACT,
        paidAmount: CONTRACT,
        discountAmount: DISCOUNT,
        discountReason: 'خصم تعاقد'
      }).reservationId;
    };

    const withContract = appDb.checkoutReservation(book('801'), {
      settleMode: 'defer', lateCheckoutFee: FEE
    });
    const withActual = appDb.checkoutReservation(book('802'), {
      settleMode: 'refund',
      refundAmount: 3900 - (ACTUAL_NET + FEE),
      lateCheckoutFee: FEE,
      checkoutPolicy: 'actual',
      checkoutPolicyReason: 'اتفاق'
    });

    // The policies differ by the accommodation value...
    assert.equal(withContract.finalTotal, CONTRACT + FEE);
    assert.equal(withActual.finalTotal, ACTUAL_NET + FEE);
    // ...but the fee contributes exactly the same amount under both. This is the
    // assertion that fails if the fee is ever folded into the policy branch.
    assert.equal(withContract.finalTotal - CONTRACT, FEE);
    assert.equal(withActual.finalTotal - ACTUAL_NET, FEE);
    assert.equal(withContract.lateCheckoutFee, withActual.lateCheckoutFee);
    assert.equal(withContract.lateCheckoutFee, FEE);
  });
});

test('monthly early checkout: a negative late fee is refused', async t => {
  await withSafeDatabase(async (appDb) => {
    const today = appDb.getLocalDateString();
    const room = addRoom('LF-NEG', RATE);
    const id = appDb.createReservation({
      guestName: 'Negative Fee',
      guestPhone: '0500008804',
      guestIdNumber: '1000008804',
      roomId: room.id,
      checkInDate: addDays(today, -1),
      checkOutDate: addDays(today, 29),
      bookingType: 'حجز شهري',
      totalPrice: CONTRACT,
      paidAmount: CONTRACT,
      discountAmount: DISCOUNT,
      discountReason: 'خصم تعاقد'
    }).reservationId;

    assert.throws(
      () => appDb.computeCheckoutSettlement(id, { lateCheckoutFee: -50 }),
      /تأخير المغادرة/
    );
    assert.throws(
      () => appDb.checkoutReservation(id, { settleMode: 'defer', lateCheckoutFee: -50 }),
      /تأخير المغادرة/
    );
  });
});