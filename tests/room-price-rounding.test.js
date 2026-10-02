'use strict';

/**
 * A room's nightly price is the root of every derived figure for a booking: it feeds
 * computeContractValue, the checkout settlement, the invoice line items and the
 * reports. addRoom and updateRoom wrote a raw parseFloat into price_per_night, so a
 * rate such as 33.333 was stored with three decimals and propagated from there.
 *
 * This closes the last unrounded money write in db/.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { withSafeDatabase } = require('./helpers/safe-temp-db');
const { roundMoney } = require('../db/connection');

test('addRoom stores a fractional nightly price at 2dp', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const created = appDb.addRoom({
      room_number: 'RP-1', type: 'وحدة', price_per_night: 33.333
    });
    assert.equal(created.price_per_night, 33.33);

    const stored = connection.queryOne(
      'SELECT price_per_night FROM rooms WHERE room_number = ?', ['RP-1']).price_per_night;
    assert.equal(stored, 33.33, 'the raw column holds two decimals');
    assert.equal(String(stored).length <= 5, true, 'no third decimal is stored');
  });
});

test('updateRoom stores a fractional nightly price at 2dp', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const room = appDb.addRoom({ room_number: 'RP-2', type: 'وحدة', price_per_night: 100 });

    appDb.updateRoom({
      id: room.id, room_number: 'RP-2', type: 'وحدة', price_per_night: 199.999
    });

    const stored = connection.queryOne(
      'SELECT price_per_night FROM rooms WHERE id = ?', [room.id]).price_per_night;
    assert.equal(stored, 200, '199.999 rounds to 200.00');
  });
});

test('a room price does not drift into the booking it produces', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    // A rate that cannot be represented in binary. Before the fix this stored 33.333
    // and the contract value inherited the third decimal.
    const room = appDb.addRoom({ room_number: 'RP-3', type: 'وحدة', price_per_night: 33.335 });
    assert.equal(room.price_per_night, 33.34);

    const today = appDb.getLocalDateString();
    const [y, m, d] = today.split('-').map(Number);
    // A 30-night term ending today. Monthly bookings are priced on 30 nights
    // (db/reservations.js:318), so the stored total must be 30 x rate.
    const checkIn = new Date(Date.UTC(y, m - 1, d - 30)).toISOString().slice(0, 10);
    const checkOut = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

    const id = appDb.createReservation({
      guestName: 'Room Price Guest',
      guestPhone: '0503344556',
      guestIdNumber: '1000003344',
      roomId: room.id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      bookingType: 'حجز شهري',
      // Passing a mismatched total trips the drift guard added in 4415e38.
      totalPrice: 30 * 33.34,
      paidAmount: 0
    }).reservationId;

    // The settlement figures must be exact 2dp, derived from the rounded room rate
    // rather than from the unrounded 33.335 the caller supplied.
    const settlement = appDb.computeCheckoutSettlement(id);
    assert.equal(settlement.effectiveNightlyRate, 33.34, 'the rate used is the rounded room price');
    assert.equal(settlement.actualValue, 30 * 33.34);
    assert.equal(settlement.actualValue, 1000.2, 'no third decimal reaches the settlement');
    assert.equal(settlement.netCharge, 1000.2);

    const decimals = connection.queryOne(
      'SELECT price_per_night FROM rooms WHERE id = ?', [room.id]).price_per_night;
    assert.equal(roundMoney(decimals), decimals, 'the stored rate is already at 2dp');
  });
});

test('ordinary room prices are unchanged', async () => {
  await withSafeDatabase(async (appDb) => {
    for (const price of [100, 250.5, 99.99, 0.01, 1000]) {
      const room = appDb.addRoom({
        room_number: `RP-OK-${String(price).replace('.', '_')}`,
        type: 'وحدة',
        price_per_night: price
      });
      assert.equal(room.price_per_night, price, `${price} must survive untouched`);
    }
  });
});