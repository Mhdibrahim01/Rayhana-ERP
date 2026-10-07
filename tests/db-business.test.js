'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const db = require('../db');
const connection = require('../db/connection');
const { createSafeTempDatabasePath } = require('./helpers/safe-temp-db');
const { assertDatabaseIntegrity } = require('./helpers/safe-temp-db');

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addTestRoom(number) {
  return db.addRoom({ room_number: number, type: 'وحدة اختبار', price_per_night: 200, monthly_price: 6000 });
}

function createTestReservation({ roomId, name, checkIn, checkOut, total = 400, paid = 0, bookingType = 'عادي' }) {
  return db.createReservation({
    guestName: name,
    guestPhone: `05${String(10000000 + (name.length * 113) + checkIn.slice(-2)).slice(-8)}`,
    guestIdNumber: `100${String(1000000 + name.length * 17 + checkIn.slice(-2)).slice(-7)}`,
    roomId,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    totalPrice: total,
    paidAmount: paid,
    bookingType
  }).reservationId;
}

test('database and business-logic safety net', async t => {
  const { scratchDirectory, databasePath } = createSafeTempDatabasePath();
  try {
    // The safety assertion runs before the app opens or initializes this file.
    await db.init(databasePath);
    const today = db.getLocalDateString();
    // These legacy scenarios are expressed in the calendar date, so keep the
    // seeded operational date fixed to that date independent of test start time.
    connection.getDb().run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [today]);

    await t.test('initialization seeds the supported Admin and User accounts', () => {
      const users = Object.fromEntries(db.getAllUsers().map(user => [user.username, user.role]));
      assert.equal(users.admin, 'Admin');
      assert.equal(users.staff, 'User');
      assert.equal(users.user, 'User');
      assert.equal(db.verifyUser('admin', 'admin').user.role, 'Admin');
      assert.equal(db.verifyUser('staff', 'staff').user.role, 'User');
      assert.equal(db.verifyUser('user', 'user').user.role, 'User');
      assert.equal(db.verifyUser('missing-user', 'wrong').success, false);
      assertDatabaseIntegrity(connection, 'seeded users');
    });

    await t.test('reservation payments keep the reservation total and ledger in sync', () => {
      const room = addTestRoom('T-PAY');
      const reservationId = createTestReservation({
        roomId: room.id,
        name: 'Ledger Guest',
        checkIn: today,
        checkOut: addDays(today, 2),
        total: 600,
        paid: 200
      });

      db.addPaymentToReservation({ reservationId, amount: 400, paymentMethod: 'نقداً' });
      const reservation = db.getReservationById(reservationId);
      const payments = db.getReservationPayments(reservationId);
      assert.equal(reservation.paid_amount, 600);
      assert.equal(payments.reduce((sum, payment) => sum + payment.amount, 0), 600);
      assert.equal(new Set(payments.map(payment => payment.receipt_number)).size, payments.length);
      assert.equal(reservation.payment_status, 'مدفوع بالكامل');
      assert.throws(
        () => db.addPaymentToReservation({ reservationId, amount: 1 }),
        /يتجاوز الرصيد المتبقي|مسدد بالكامل/
      );
      assertDatabaseIntegrity(connection, 'reservation payment sync');
    });

    await t.test('regular bookings require at least one night and reject overlapping intervals', () => {
      const room = addTestRoom('T-DATE');
      const checkIn = addDays(today, 5);
      const checkOut = addDays(today, 7);
      createTestReservation({ roomId: room.id, name: 'Date Guest A', checkIn, checkOut });

      assert.throws(
        () => createTestReservation({ roomId: room.id, name: 'Date Guest Same Day', checkIn, checkOut: checkIn }),
        /تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول/
      );
      assert.throws(
        () => createTestReservation({ roomId: room.id, name: 'Date Guest Overlap', checkIn: addDays(checkIn, 1), checkOut: addDays(checkOut, 1) }),
        /الغرفة محجوزة بالفعل/
      );
      assert.doesNotThrow(() => createTestReservation({
        roomId: room.id,
        name: 'Date Guest Turnover',
        checkIn: checkOut,
        checkOut: addDays(checkOut, 1)
      }));
      assertDatabaseIntegrity(connection, 'reservation date validation');
    });

    await t.test('room status updater uses its date seam and preserves cleaning for same-day arrival', () => {
      const occupiedRoom = addTestRoom('T-OCC');
      const cleaningRoom = addTestRoom('T-CLN');
      const futureRoom = addTestRoom('T-FUT');
      const maintenanceRoom = addTestRoom('T-MNT');
      connection.getDb().run("UPDATE rooms SET status = 'صيانة' WHERE id = ?", [maintenanceRoom.id]);
      createTestReservation({
        roomId: occupiedRoom.id,
        name: 'Overdue Occupant',
        checkIn: addDays(today, -3),
        checkOut: addDays(today, -1)
      });
      createTestReservation({
        roomId: cleaningRoom.id,
        name: 'Same Day Arrival',
        checkIn: today,
        checkOut: addDays(today, 2)
      });
      createTestReservation({
        roomId: futureRoom.id,
        name: 'Future Arrival',
        checkIn: addDays(today, 4),
        checkOut: addDays(today, 6)
      });

      connection.getDb().run("UPDATE rooms SET status = 'تنظيف' WHERE id = ?", [cleaningRoom.id]);
      db.autoUpdateRoomStatuses(today);
      const roomStatuses = Object.fromEntries(db.getAllRooms().map(room => [room.room_number, room.status]));
      assert.equal(roomStatuses['T-OCC'], 'مشغولة');
      assert.equal(roomStatuses['T-CLN'], 'تنظيف');
      assert.equal(roomStatuses['T-FUT'], 'محجوزة');
      assert.equal(roomStatuses['T-MNT'], 'صيانة');

      db.updateRoomStatus(cleaningRoom.id, 'متاحة');
      db.autoUpdateRoomStatuses(today);
      assert.equal(db.getAllRooms().find(room => room.id === cleaningRoom.id).status, 'مشغولة');
      assert.equal(db.getAllRooms().find(room => room.id === maintenanceRoom.id).status, 'صيانة');
      assertDatabaseIntegrity(connection, 'room status update');
    });

    await t.test('today check-outs includes today and overdue confirmed reservations', () => {
      const todayRoom = addTestRoom('T-OUT');
      const overdueRoom = addTestRoom('T-LATE');
      const futureRoom = addTestRoom('T-NEXT');
      const todayId = createTestReservation({ roomId: todayRoom.id, name: 'Checkout Today', checkIn: addDays(today, -1), checkOut: today });
      const overdueId = createTestReservation({ roomId: overdueRoom.id, name: 'Checkout Overdue', checkIn: addDays(today, -4), checkOut: addDays(today, -2) });
      createTestReservation({ roomId: futureRoom.id, name: 'Checkout Future', checkIn: today, checkOut: addDays(today, 1) });

      const ids = db.getTodayCheckouts(today).map(reservation => reservation.id);
      assert.ok(ids.includes(todayId));
      assert.ok(ids.includes(overdueId));
      assert.equal(ids.includes(db.getAllReservations().find(reservation => reservation.guest_name === 'Checkout Future').id), false);
      assertDatabaseIntegrity(connection, 'today checkouts');
    });

    await t.test('shift audit report honors an explicit date range and ledger totals', () => {
      const room = addTestRoom('T-AUDIT');
      const reservationId = createTestReservation({
        roomId: room.id,
        name: 'Shift Audit Guest',
        checkIn: today,
        checkOut: addDays(today, 1),
        total: 200,
        paid: 75
      });
      connection.getDb().run("UPDATE payments SET payment_date = ?, business_date = ? WHERE reservation_id = ?", [`${today} 10:00:00`, today, reservationId]);
      connection.getDb().run("UPDATE payments SET payment_date = ?, business_date = ? WHERE reservation_id != ?", [`${addDays(today, -1)} 10:00:00`, addDays(today, -1), reservationId]);

      const report = db.getShiftAuditReport(today, today);
      assert.equal(report.isRange, false);
      assert.equal(report.startDate, today);
      assert.equal(report.endDate, today);
      assert.equal(report.financials.totalRevenue, 75);
      assert.equal(report.financials.cashTotal, 75);
      assert.equal(report.payments.length, 1);
      assertDatabaseIntegrity(connection, 'shift audit report');
    });
  } finally {
    db.close();
    fs.rmSync(scratchDirectory, { recursive: true, force: true });
  }
});
