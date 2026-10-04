'use strict';

/**
 * Tests for Room Card & Room Revenue Credit Balance Display.
 *
 * Asserts that guest credit balances (where paid_amount > total_price)
 * are rendered cleanly as "له رصيد: X ريال" (blue #2563eb) instead of
 * being clamped to "متبقي: 0 ريال".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const roomsJs = fs.readFileSync(path.join(ROOT, 'dashboard-rooms.js'), 'utf8');

test('dashboard-rooms: room card payment summary does not clamp credit balances', () => {
  // Ensure rawRemaining is computed and checked for credit threshold
  assert.ok(
    roomsJs.includes('const rawRemaining = total - paid;'),
    'renderReservationPaymentSummary must compute rawRemaining = total - paid'
  );
  assert.ok(
    roomsJs.includes('const isCredit = rawRemaining < -0.005;'),
    'renderReservationPaymentSummary must check isCredit with threshold -0.005'
  );
  assert.ok(
    roomsJs.includes('له رصيد: <strong>${Math.abs(rawRemaining).toLocaleString()} ريال</strong>'),
    'renderReservationPaymentSummary must display "له رصيد" for credit balances'
  );
  assert.ok(
    roomsJs.includes('color:#2563eb'),
    'renderReservationPaymentSummary must use blue color #2563eb for credit balances'
  );
});

test('dashboard-rooms: room revenue breakdown table renders credit balance', () => {
  assert.ok(
    roomsJs.includes('const rawRemaining = price - paid;'),
    'room revenue table must compute rawRemaining = price - paid'
  );
  assert.ok(
    roomsJs.includes('isCredit ? `له رصيد: ${Math.abs(rawRemaining).toLocaleString()} ريال`'),
    'room revenue table must render "له رصيد" when isCredit is true'
  );
  assert.ok(
    roomsJs.includes("isCredit ? '#2563eb'"),
    'room revenue table must color credit balance with #2563eb'
  );
});
