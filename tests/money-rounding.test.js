'use strict';

/**
 * Money hygiene: rounding on the way in, rounding on the way out, and the one
 * behaviour that must NOT change - a negative amount keeps its sign.
 *
 * Refunds are stored as negative rows (db/reservations.js:1561 writes -refundDue) and
 * deposit movements carry a signed type, so any "make money positive" shortcut would
 * destroy them. These tests pin that down explicitly.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { withSafeDatabase } = require('./helpers/safe-temp-db');
const { roundMoney } = require('../db/connection');

test('roundMoney: negative zero is normalised, real negatives are not', () => {
  // Math.round(-0.1) is -0, so a tiny negative used to produce -0, which renders
  // as "-0.00" on an invoice.
  assert.equal(roundMoney(-0.001), 0);
  assert.equal(roundMoney(-0.004), 0);
  assert.ok(!Object.is(roundMoney(-0.001), -0), '-0.001 must not be negative zero');
  assert.ok(!Object.is(roundMoney(-0.004), -0), '-0.004 must not be negative zero');

  // A real negative keeps its sign. This is the refund case.
  assert.equal(roundMoney(-1850), -1850);
  assert.equal(roundMoney(-1850.5), -1850.5);
  assert.equal(roundMoney(-0.01), -0.01);
  assert.ok(Object.is(roundMoney(-1850), -1850), 'a refund must stay negative');

  // Unchanged behaviour for ordinary values.
  assert.equal(roundMoney(0), 0);
  assert.equal(roundMoney(999.9), 999.9);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(NaN), 0);
  assert.equal(roundMoney(undefined), 0);
});

test('a fractional nightly rate is stored and read back at 2dp', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const room = addRoom('MONEY-33', 33.33);
    const id = createReservation({
      roomId: room.id,
      checkIn: addDays(today, -30),
      checkOut: today,
      totalPrice: 999.9,
      paidAmount: 999.9
    });

    // Summing 33.33 thirty times is where drift shows up in float arithmetic.
    let acc = 0;
    for (let i = 0; i < 30; i++) acc += 33.33;
    assert.notEqual(acc, 999.9, 'repeated float addition really does drift here');
    assert.equal(roundMoney(acc), 999.9);

    const stored = connection.queryOne(
      'SELECT total_price, paid_amount FROM reservations WHERE id = ?', [id]);
    assert.equal(stored.total_price, 999.9);
    assert.equal(stored.paid_amount, 999.9);
    assert.equal(stored.total_price, 999.90);

    // Read back through the public API too, not just raw SQL.
    const invoice = appDb.getReservationById(id);
    assert.equal(invoice.total_price, 999.9);
  });
});

test('a checkout refund stays negative', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const room = addRoom('MONEY-REFUND', 200);

    // Cancellation is only allowed before the stay starts (db/reservations.js:1512),
    // and it refunds the full paid amount - the path that writes a negative row.
    const id = createReservation({
      roomId: room.id,
      checkIn: addDays(today, 3),
      checkOut: addDays(today, 5),
      totalPrice: 1850,
      paidAmount: 1850
    });

    const result = appDb.cancelReservation(id, today, undefined, null);
    assert.ok(result, 'cancellation should complete');

    const refund = connection.queryOne(
      'SELECT amount FROM payments WHERE reservation_id = ? AND amount < 0 ORDER BY id DESC LIMIT 1',
      [id]);
    assert.ok(refund, 'a negative payment row must exist');
    assert.equal(refund.amount, -1850, 'the refund keeps its sign and its value');
    assert.ok(refund.amount < 0);
  });
});

test('a signed deposit movement keeps its sign', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    const room = addRoom('MONEY-DEPOSIT', 200);
    const id = createReservation({
      roomId: room.id,
      checkIn: addDays(today, -2),
      checkOut: today,
      totalPrice: 400,
      paidAmount: 100,
      depositAmount: 300
    });

    // Check out collecting the 300 balance while refunding the deposit in cash.
    // recordDepositMovement is internal, so this goes through the public path.
    appDb.checkoutReservation(id, {
      settleMode: 'collect',
      collectAmount: 300,
      depositDisposition: 'refund',
      depositRefundMethod: 'نقداً'
    });

    const movement = connection.queryOne(
      "SELECT amount, movement_type FROM deposit_movements WHERE reservation_id = ? AND movement_type = 'refunded' ORDER BY id DESC LIMIT 1",
      [id]);
    assert.ok(movement, 'a refunded deposit movement must exist');
    assert.ok(movement.amount > 0,
      'deposit movements store a positive amount with a type; the sign lives in the type');

    // The ledger nets collected against refunded, so the balance lands on zero -
    // and that zero must not be negative zero.
    const ledgerBalance = connection.queryOne(
      `SELECT COALESCE(SUM(CASE WHEN movement_type IN ('collected','reconciled') THEN amount ELSE -amount END), 0) AS b
       FROM deposit_movements WHERE reservation_id = ?`, [id]).b;
    assert.equal(ledgerBalance, 0);
    assert.ok(!Object.is(ledgerBalance, -0), 'a zero balance must not be negative zero');
  });
});

test('bulkImportReservations stores a fractional price rounded', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();
    addRoom('MONEY-IMPORT', 200);

    const result = appDb.bulkImportReservations([{
      guest_name: 'Import Fractional',
      guest_phone: '0507788990',
      room_number: 'MONEY-IMPORT',
      check_in_date: addDays(today, -3),
      check_out_date: today,
      total_price: '1234.5678'
    }]);

    assert.equal(result.inserted, 1);

    const row = connection.queryOne(
      'SELECT total_price FROM reservations WHERE id = (SELECT MAX(id) FROM reservations)');
    assert.equal(row.total_price, 1234.57, 'the imported price is rounded to 2dp on write');
    assert.ok(!String(row.total_price).includes('1234.5678'));
  });
});

test('aggregate exits are rounded for a fractional data set', async () => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    // total_spent is a per-guest SUM, so drift needs ONE guest holding SEVERAL
    // completed stays. The reservation fixture mints a fresh guest per call, so the
    // stays are re-pointed at a shared guest afterwards.
    const sharedPhone = '0501117777';
    appDb.addCustomer({ name: 'Spent Guest', phone: sharedPhone, id_number: '1000000777' });
    const sharedId = connection.queryOne('SELECT id FROM guests WHERE phone = ?', [sharedPhone]).id;

    const ids = [];
    for (let i = 0; i < 3; i++) {
      const room = addRoom(`MONEY-AGG-${i}`, 33.33);
      const rid = createReservation({
        roomId: room.id,
        checkIn: addDays(today, -3),
        checkOut: today,
        totalPrice: 99.99,
        paidAmount: 99.99
      });
      // connection exposes queryAll/queryOne only; connection.db is the sql.js proxy.
      connection.db.run('UPDATE reservations SET guest_id = ? WHERE id = ?', [sharedId, rid]);
      appDb.checkoutReservation(rid, { settleMode: 'defer' });
      ids.push(rid);
    }

    const stayCount = connection.queryOne(
      "SELECT COUNT(*) AS c FROM reservations WHERE guest_id = ? AND status = 'مكتمل'", [sharedId]).c;
    assert.equal(stayCount, 3, 'the guest must own all three completed stays for the SUM to drift');

    const raw = connection.queryOne(
      "SELECT SUM(total_price) AS s FROM reservations WHERE status != 'ملغي'").s;
    assert.notEqual(raw, 299.97, 'the raw SQL sum does drift');

    // The dashboard figure is rounded before it leaves db/.
    const overview = appDb.getDashboardStats();
    assert.equal(overview.totalRevenue, 299.97);
    assert.equal(roundMoney(overview.totalRevenue), overview.totalRevenue);

    // And the per-guest total_spent is rounded on both guest read paths. This guest
    // has three stays, so the raw SUM is 299.96999999999997 and only rounding makes
    // it 299.97.
    const rawSpent = connection.queryOne(
      `SELECT SUM(CASE WHEN status = 'مكتمل' THEN total_price ELSE 0 END) AS s
       FROM reservations WHERE guest_id = ?`, [sharedId]).s;
    assert.notEqual(rawSpent, 299.97, 'the raw per-guest sum does drift');

    const all = appDb.getAllGuests().find((g) => g.id === sharedId);
    assert.equal(all.total_spent, 299.97, 'getAllGuests rounds total_spent');

    const paged = appDb.getGuestsPaginated({ page: 1, limit: 50 });
    const pagedRow = paged.data.find((g) => g.id === sharedId);
    assert.equal(pagedRow.total_spent, 299.97, 'getGuestsPaginated rounds total_spent');
  });
});