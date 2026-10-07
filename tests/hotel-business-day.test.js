'use strict';

/**
 * Tests for Hotel Business Day & Post-Midnight Walk-in (#8).
 *
 * Verifies that:
 * 1. getHotelBusinessDate rolls back 1 day before cutoff (06:00 AM) and returns today after cutoff.
 * 2. Walk-in bookings with check_in_date <= today and check_out_date >= today (including same-day departure)
 *    set room status to 'مشغولة'.
 * 3. Immediate void/cancel is permitted for reservations checked in on the active hotel business date,
 *    even when clock time has passed midnight into the next calendar day.
 * 4. Stays that started on a business day prior to the active hotel business date are blocked from voiding.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('hotel business day calculation and post-midnight operations', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getCurrentBusinessDate();

    await t.test('getHotelBusinessDate rolls back before cutoff hour', () => {
      // 03:30 AM on 2026-10-05 should be business date 2026-10-04
      const d1 = new Date('2026-10-05T03:30:00');
      assert.equal(db.getHotelBusinessDate(d1, 6), '2026-10-04');

      // 05:59 AM on 2026-10-05 should still be business date 2026-10-04
      const d2 = new Date('2026-10-05T05:59:00');
      assert.equal(db.getHotelBusinessDate(d2, 6), '2026-10-04');

      // 06:00 AM on 2026-10-05 rolls over to 2026-10-05
      const d3 = new Date('2026-10-05T06:00:00');
      assert.equal(db.getHotelBusinessDate(d3, 6), '2026-10-05');

      // 14:00 PM on 2026-10-05 is 2026-10-05
      const d4 = new Date('2026-10-05T14:00:00');
      assert.equal(db.getHotelBusinessDate(d4, 6), '2026-10-05');

      // 23:59 PM on 2026-10-05 is 2026-10-05
      const d5 = new Date('2026-10-05T23:59:00');
      assert.equal(db.getHotelBusinessDate(d5, 6), '2026-10-05');
    });

    await t.test('same-day departure walk-in sets room status to مشغولة', () => {
      const room = addRoom('BIZ-DAY-1', 200);
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'متاحة');

      // Overnight walk-in checking in today and checking out today at 14:00 (day use / same day)
      const resId = createReservation({
        roomId: room.id,
        name: 'Overnight Guest',
        checkIn: today,
        checkOut: today,
        bookingType: 'استخدام يومي',
        totalPrice: 200,
        paidAmount: 200
      });

      // Crucial fix: room must be marked as 'مشغولة', NOT left 'متاحة'
      const roomStatus = connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status;
      assert.equal(roomStatus, 'مشغولة', 'Room must be مشغولة when check_in <= today and check_out >= today');

      assertDatabaseIntegrity(connection, 'same-day departure sets room occupied');
    });

    await t.test('post-midnight arrival matching hotel business date allows void/cancel', () => {
      const room = addRoom('BIZ-DAY-2', 250);
      const yesterday = addDays(today, -1);

      // Simulate post-midnight operations using the persisted operational date.
      connection.db.run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [yesterday]);
      const resId = createReservation({
        roomId: room.id,
        name: 'Midnight Guest',
        checkIn: yesterday,
        checkOut: today,
        totalPrice: 250,
        paidAmount: 250
      });

      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'مشغولة');
      const result = db.cancelReservation(resId);
      assert.equal(result.hasStarted, false);
      assert.equal(result.refundDue, 250);

      const resRow = db.getReservationById(resId);
      assert.equal(resRow.status, 'ملغي');
      assert.equal(resRow.paid_amount, 0);
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'متاحة');
      assertDatabaseIntegrity(connection, 'post-midnight arrival void');
    });

    await t.test('reservation prior to hotel business date cannot be voided', () => {
      const room = addRoom('BIZ-DAY-3', 250);
      const yesterday = addDays(today, -1);
      const pastDate = addDays(today, -3); // 3 days before today

      connection.db.run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [yesterday]);
      const resId = createReservation({
        roomId: room.id,
        name: 'Past Stay Guest',
        checkIn: pastDate,
        checkOut: addDays(today, 1),
        totalPrice: 1000,
        paidAmount: 1000
      });

      assert.throws(() => db.cancelReservation(resId), /الإقامة بدأت بالفعل/);
      assertDatabaseIntegrity(connection, 'past stay void blocked');
    });
  });
});
