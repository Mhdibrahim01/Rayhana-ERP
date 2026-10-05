'use strict';

/**
 * Calendar Month Package
 *
 * A monthly booking ("حجز شهري") is one closed calendar month, not a fixed 30-day span:
 *
 *   1. The departure date is the same calendar day of the next month, clamped to that
 *      month's last day when it is shorter.
 *   2. The price is a flat package of 30 nights at the effective rate, so a 28-day
 *      February and a 31-day July cost the same. It is never rate x calendar-days.
 *   3. The contract value at checkout stays the same flat package, which is what the
 *      stored total_price was derived from - so a 31-day month does not report a false
 *      contractValueMismatch against its own total.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { addDays, addRoom } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

/** Same calendar day next month, clamped to that month's last day. */
function calendarMonthCheckOut(checkInDateStr) {
  const [y, m, d] = String(checkInDateStr).split('-').map(Number);
  const lastDayOfNextMonth = new Date(y, m + 1, 0).getDate();
  const clampedDay = Math.min(d, lastDayOfNextMonth);
  const nextMonth = new Date(y, m, 1);
  return nextMonth.getFullYear() + '-' +
    String(nextMonth.getMonth() + 1).padStart(2, '0') + '-' +
    String(clampedDay).padStart(2, '0');
}

/** Whole nights between two YYYY-MM-DD dates. */
function nightsBetween(from, to) {
  const [fy, fm, fd] = String(from).split('-').map(Number);
  const [ty, tm, td] = String(to).split('-').map(Number);
  return Math.max(1, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000));
}

// ===========================================================================
// 1. DATE MATCHING AND CLAMPING - a pure unit test, no database needed
// ===========================================================================

test('calendar month: the departure is the same day next month', () => {
  // A 31-day month keeps the day number.
  assert.equal(calendarMonthCheckOut('2026-07-03'), '2026-08-03');
  assert.equal(calendarMonthCheckOut('2026-08-15'), '2026-09-15');
  // Mid-month.
  assert.equal(calendarMonthCheckOut('2026-01-15'), '2026-02-15');
  // Month arithmetic rolls the year over.
  assert.equal(calendarMonthCheckOut('2026-12-15'), '2027-01-15');
  // The month stays zero padded for two-digit months.
  assert.equal(calendarMonthCheckOut('2026-09-05'), '2026-10-05');
});

test('calendar month: month-end clamping to the last available day', () => {
  // February 2026 has 28 days.
  assert.equal(calendarMonthCheckOut('2026-01-31'), '2026-02-28');
  // February 2028 has 29 (leap year).
  assert.equal(calendarMonthCheckOut('2028-01-31'), '2028-02-29');
  // 30-day months.
  assert.equal(calendarMonthCheckOut('2026-03-31'), '2026-04-30');
  assert.equal(calendarMonthCheckOut('2026-05-31'), '2026-06-30');
  assert.equal(calendarMonthCheckOut('2026-08-31'), '2026-09-30');
  // A 30th check-in into a 31-day month must NOT be pushed forward.
  assert.equal(calendarMonthCheckOut('2026-04-30'), '2026-05-30');
});

test('calendar month: the old +30 day rule was wrong at month boundaries', () => {
  // Documents why this replaced "+ 30 days": the old rule drifted by a day whenever the
  // check-in month was longer than 30 days.
  const checkIn = '2026-10-02';
  const old = addDays(checkIn, 30);
  assert.equal(old, '2026-11-01');
  assert.equal(calendarMonthCheckOut(checkIn), '2026-11-02');
  assert.notEqual(calendarMonthCheckOut(checkIn), old);
});

// ===========================================================================
// 4. RENDERER WIRING - the booking form must drive the same rule
// ===========================================================================

test('calendar month: the booking form uses the calendar month, not +30 days', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'dashboard-reservations.js'), 'utf8');

  // The renderer must call the shared helper at every place it derives a monthly
  // departure date. Previously each site re-implemented "+ 30 days" inline, which meant
  // the form and the backend could disagree about when a month ends.
  const calls = src.match(/getCalendarMonthCheckOut\(checkInInput\.value\)/g) || [];
  assert.ok(calls.length >= 3,
    'the monthly branch, calculatePrice() and the check-in change handler must all ' +
    'derive the departure date from the helper; found ' + calls.length + ' call(s)');

  // And no inline "+ 30 days" may remain in the monthly path.
  const inlineThirtyDay = /new Date\(y, m - 1, d \+ 30\)|checkInDate, 30\)/;
  assert.ok(!inlineThirtyDay.test(src),
    'dashboard-reservations.js still derives a monthly departure as +30 days');

  // The renderer must price the month as the package, not rate x 30 inline.
  assert.match(src, /getMonthlyPackageTotal\(/,
    'the renderer must price the month through the package helper');
  assert.match(src, /function getMonthlyPackageTotal\(effectiveRate, discount\)/,
    'getMonthlyPackageTotal must exist in the renderer');
  assert.match(src, /const MONTHLY_PACKAGE_NIGHTS = 30;/,
    'the renderer must declare the 30-night package size');
});

test('calendar month: renderer and backend agree on the same month boundary', () => {
  const dash = fs.readFileSync(
    path.resolve(__dirname, '..', 'dashboard-reservations.js'), 'utf8');
  const back = fs.readFileSync(
    path.resolve(__dirname, '..', 'db', 'reservations.js'), 'utf8');

  // Both sides must clamp against the next month's length and roll the year over the
  // same way, otherwise the form shows one departure date and the booking stores another.
  const clamp = /Math\.min\(d, lastDayOfNextMonth\)/g;
  assert.equal((dash.match(clamp) || []).length, 1,
    'the renderer must clamp to the next month\'s last day');
  assert.equal((back.match(clamp) || []).length, 1,
    'the backend must clamp to the next month\'s last day');

  const roll = /new Date\(y, m, 1\)/g;
  assert.equal((dash.match(roll) || []).length, 1,
    'the renderer must roll the month index through Date');
  assert.equal((back.match(roll) || []).length, 1,
    'the backend must roll the month index through Date');

  // Both package sizes must be 30 so the price the form shows is the price stored.
  assert.match(dash, /const MONTHLY_PACKAGE_NIGHTS = 30;/);
  assert.match(back, /const MONTHLY_PACKAGE_NIGHTS = 30;/);
});

// ===========================================================================
// 5. NO UNBOUND IDENTIFIERS IN THE PRICE PATH
// ===========================================================================

test('calendar month: the price breakdown must not reference an out-of-scope subtotal', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'dashboard-reservations.js'), 'utf8');

  // Regression: moving the monthly maths into getMonthlyPackageTotal() deleted the
  // branch-local `subtotal`, but the breakdown line still referenced it. That threw a
  // ReferenceError mid-calculatePrice(), AFTER total_price was written and BEFORE the
  // advance-paid sync, so the form showed the discounted total while "Advance Paid" kept
  // the pre-discount amount and the balance read 0.00 on a part-paid booking.
  //
  // eslint does not catch this (the file is lint-ignored) and no DB test could, because
  // the whole failure was in the renderer. Assert on the source instead.
  const monthlyStart = src.indexOf("if (bType === 'حجز شهري') {",
    src.indexOf('function calculatePrice'));
  assert.ok(monthlyStart > -1, 'the monthly branch of calculatePrice must exist');

  const monthlyEnd = src.indexOf('// Normal booking', monthlyStart);
  const monthlyBranch = src.slice(monthlyStart, monthlyEnd);

  // Strip comments first: prose about `subtotal` must not be mistaken for a use of it.
  const code = monthlyBranch
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // Every bare `subtotal` used in the branch must be declared inside it. Match the
  // identifier on its own so `packageSubtotal` (a distinct, correctly-scoped local)
  // is not counted as a use of the removed one.
  const uses = [...code.matchAll(/(?<![\w$])subtotal(?![\w$])/g)];
  const declares = [...code.matchAll(/(?:const|let)\s+subtotal\s*=/g)];
  assert.equal(uses.length, declares.length,
    'the monthly branch uses `subtotal` ' + uses.length + ' time(s) but declares it ' +
    declares.length + ' time(s); an undeclared reference throws at runtime and aborts ' +
    'the advance-paid sync');

  // The pre-discount amount the breakdown shows must come from the shared package
  // constant, so it cannot drift from the total that gets stored.
  assert.match(monthlyBranch, /roundMoney\(effectiveRate \* MONTHLY_PACKAGE_NIGHTS\)/,
    'the breakdown must derive the pre-discount total from MONTHLY_PACKAGE_NIGHTS');
});

// ===========================================================================
// 2 & 3. PACKAGE PRICING AND CONTRACT VALUE, through the real database
// ===========================================================================

test('calendar month package: pricing and settlement', async t => {
  await withSafeDatabase(async (appDb, connection) => {
    const today = appDb.getLocalDateString();

    /**
     * Build a monthly booking that started `elapsed` days ago, so it is checked out
     * early and the monthly contract path is exercised.
     */
    const monthlyEarlyCheckout = (tag, { rate = 200, elapsed = 3, discount = 0, paid = 0 } = {}) => {
      const room = addRoom(`CM-${tag}`, 200);
      const checkIn = addDays(today, -elapsed);
      return appDb.createReservation({
        guestName: `Calendar ${tag}`,
        guestPhone: '0500000' + String(Math.floor(Math.random() * 900) + 100),
        guestIdNumber: '1000000' + String(Math.floor(Math.random() * 900) + 100),
        roomId: room.id,
        checkInDate: checkIn,
        bookingType: 'حجز شهري',
        customNightlyPrice: rate,
        paidAmount: paid,
        discountAmount: discount,
        discountReason: discount > 0 ? 'خصم اختبار' : ''
      }).reservationId;
    };

    await t.test('a one-month booking is priced as one flat 30-night package', () => {
      const id = monthlyEarlyCheckout('ONE', { rate: 200, elapsed: 3 });
      const reservation = appDb.getReservationById(id);

      assert.equal(reservation.booking_type, 'حجز شهري');
      // 30 x 200 = 6000 - NOT nights x 200.
      assert.equal(reservation.total_price, 6000);
      assert.equal(reservation.check_out_date, calendarMonthCheckOut(addDays(today, -3)));

      const preview = appDb.computeCheckoutSettlement(id, {});
      // The contract value is the same flat package, so it can never drift from the
      // stored total no matter how many calendar days the month spans.
      assert.equal(preview.contractValue, 6000, 'contract value is the 30-night package');
      assert.equal(preview.contractValueMismatch, false,
        'a calendar month must not report a mismatch against its own stored total');
      assertDatabaseIntegrity(connection, 'one-month flat package');
    });

    await t.test('a 28-day February costs the same as a 31-day July', () => {
      // Same rate, different month lengths. The package price must be identical.
      const rate = 200;
      const expected = 30 * rate;

      const febRoom = addRoom('CM-FEB', 200);
      const feb = appDb.createReservation({
        guestName: 'February Guest',
        guestPhone: '0500000991',
        guestIdNumber: '1000000991',
        roomId: febRoom.id,
        // 2026-01-31 -> 2026-02-28: a 28-day calendar month (28 nights).
        checkInDate: '2026-01-31',
        bookingType: 'حجز شهري',
        customNightlyPrice: rate,
        paidAmount: 0,
        totalPrice: expected
      }).reservationId;

      const julRoom = addRoom('CM-JUL', 200);
      const jul = appDb.createReservation({
        guestName: 'July Guest',
        guestPhone: '0500000992',
        guestIdNumber: '1000000992',
        roomId: julRoom.id,
        // 2026-07-03 -> 2026-08-03: a 31-day calendar month (31 nights).
        checkInDate: '2026-07-03',
        bookingType: 'حجز شهري',
        customNightlyPrice: rate,
        paidAmount: 0,
        totalPrice: expected
      }).reservationId;

      const febRes = appDb.getReservationById(feb);
      const julRes = appDb.getReservationById(jul);

      // Clamping happened on the February booking.
      assert.equal(febRes.check_out_date, '2026-02-28');
      assert.equal(julRes.check_out_date, '2026-08-03');

      // The spans really do differ ...
      assert.equal(nightsBetween('2026-01-31', febRes.check_out_date), 28);
      assert.equal(nightsBetween('2026-07-03', julRes.check_out_date), 31);

      // ... but the price does not.
      assert.equal(febRes.total_price, expected, 'February is billed as the package');
      assert.equal(julRes.total_price, expected, 'July is billed as the package');
      assert.equal(febRes.total_price, julRes.total_price,
        'month length must not change the price');
      assertDatabaseIntegrity(connection, 'february vs july package parity');
    });

    await t.test('a full-value discount reduces the package to zero', () => {
      const rate = 200;
      const room = addRoom('CM-DISC', 200);
      const id = appDb.createReservation({
        guestName: 'Discounted Month',
        guestPhone: '0500000993',
        guestIdNumber: '1000000993',
        roomId: room.id,
        checkInDate: addDays(today, -2),
        bookingType: 'حجز شهري',
        customNightlyPrice: rate,
        discountAmount: 30 * rate,
        discountReason: 'خصم كامل'
      }).reservationId;

      const reservation = appDb.getReservationById(id);
      assert.equal(reservation.total_price, 0, 'the whole package was discounted away');

      const preview = appDb.computeCheckoutSettlement(id, {});
      assert.equal(preview.contractValue, 0);
      assert.equal(preview.contractValueMismatch, false);
      assertDatabaseIntegrity(connection, 'full-value discount');
    });

    await t.test('the contract policy charges the flat package, not the calendar span', () => {
      const rate = 200;
      const id = monthlyEarlyCheckout('CONTRACT', { rate, elapsed: 3 });
      const reservation = appDb.getReservationById(id);
      const bookedNights = nightsBetween(
        addDays(today, -3), reservation.check_out_date);

      const result = appDb.checkoutReservation(id, { settleMode: 'defer' });
      const settled = appDb.getReservationById(id);

      // 30 nights x rate, even when the calendar month is longer.
      assert.equal(settled.total_price, 30 * rate);
      assert.ok(bookedNights >= 28 && bookedNights <= 31,
        'the fixture spans one calendar month, got ' + bookedNights);
      assert.equal(settled.status, 'مكتمل');
      assert.ok(result, 'checkout succeeded');
      assertDatabaseIntegrity(connection, 'contract policy charges the package');
    });

    await t.test('a 31-day month does not report a contract mismatch', () => {
      // The exact regression: a monthly span that contains 31 nights. Before the package
      // rule the contract value was 31 x rate while the stored total was 30 x rate, so
      // every long month tripped the mismatch guard against its own total.
      //
      // The span is searched for rather than hard-coded, so the fixture is a genuinely
      // early checkout with a 31-night month on whatever day the suite runs.
      const rate = 200;
      let checkIn = null;
      let checkOut = null;
      for (let elapsed = 1; elapsed <= 28; elapsed++) {
        const candidate = addDays(today, -elapsed);
        const out = calendarMonthCheckOut(candidate);
        if (nightsBetween(candidate, out) === 31) { checkIn = candidate; checkOut = out; break; }
      }
      assert.ok(checkIn,
        'no early-checkout date within the last 28 days yields a 31-night month today (' + today + ')');

      const room = addRoom('CM-31DAY', 200);
      const id = appDb.createReservation({
        guestName: 'Long Month',
        guestPhone: '0500000994',
        guestIdNumber: '1000000994',
        roomId: room.id,
        checkInDate: checkIn,
        bookingType: 'حجز شهري',
        customNightlyPrice: rate,
        paidAmount: 0
      }).reservationId;

      const reservation = appDb.getReservationById(id);
      assert.equal(reservation.check_out_date, checkOut);
      assert.equal(reservation.total_price, 30 * rate,
        'still billed as a 30-night package');

      const preview = appDb.computeCheckoutSettlement(id, {});
      assert.equal(preview.bookedNights, 31, 'the span really is 31 nights');
      assert.equal(preview.contractValue, 30 * rate,
        'the contract value is the package, not the span');
      assert.equal(preview.contractValueMismatch, false,
        'a 31-night calendar month must match its own 30-night package total');
      assertDatabaseIntegrity(connection, '31-day month package parity');
    });
  });
});