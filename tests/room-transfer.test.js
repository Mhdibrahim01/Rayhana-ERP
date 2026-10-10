'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('room transfers preserve room history and bill each segment at its saved rate', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getCurrentBusinessDate();
    const oldRoom = addRoom('MOVE-OLD', 100);
    const upgradedRoom = addRoom('MOVE-UP', 150);
    const finalRoom = addRoom('MOVE-FINAL', 200);
    const policyRoom = addRoom('MOVE-POLICY', 80);
    const reservationId = createReservation({
      roomId: oldRoom.id,
      checkIn: addDays(today, -1),
      checkOut: addDays(today, 2),
      totalPrice: 300,
      paidAmount: 100
    });
    const initialPaymentCount = db.getReservationPayments(reservationId).length;

    await t.test('transfer keeps consumed nights on the old rate and reprices only remaining nights', () => {
      const preview = db.previewRoomTransfer({ reservationId, toRoomId: upgradedRoom.id });
      assert.equal(preview.priceDelta, 100);
      assert.equal(preview.projectedTotal, 400);

      const result = db.transferReservationRoom({
        reservationId,
        toRoomId: upgradedRoom.id,
        reason: 'عطل تكييف',
        userId: 1
      });
      assert.equal(result.priceDelta, 100);
      assert.equal(result.totalPrice, 400);
      assert.equal(db.getReservationById(reservationId).room_id, upgradedRoom.id);
      assert.equal(db.getReservationById(reservationId).payment_status, 'مدفوع جزئياً');
      assert.equal(db.getReservationPayments(reservationId).length, initialPaymentCount);
      assert.equal(db.computeCheckoutSettlement(reservationId).accommodationNetCharge, 100);
      assert.deepEqual(db.getReservationRoomStays(reservationId).map(stay => [stay.room_id, stay.start_business_date, stay.end_business_date]), [
        [oldRoom.id, addDays(today, -1), today],
        [upgradedRoom.id, today, null]
      ]);
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [oldRoom.id]).status, 'تنظيف');
      assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [upgradedRoom.id]).status, 'مشغولة');
      assert.equal(connection.queryOne('SELECT COUNT(*) AS count FROM room_transfers WHERE reservation_id = ?', [reservationId]).count, 1);
    });

    await t.test('same-day multi-move records every event without charging an intermediate room night', () => {
      const result = db.transferReservationRoom({
        reservationId,
        toRoomId: finalRoom.id,
        reason: 'رغبة النزيل',
        userId: 1
      });
      assert.equal(result.priceDelta, 100);
      assert.equal(db.computeCheckoutSettlement(reservationId).accommodationNetCharge, 100);
      assert.deepEqual(db.getReservationRoomStays(reservationId).map(stay => stay.room_id), [oldRoom.id, upgradedRoom.id, finalRoom.id]);
      assert.equal(connection.queryOne('SELECT COUNT(*) AS count FROM room_transfers WHERE reservation_id = ?', [reservationId]).count, 2);
      assertDatabaseIntegrity(connection, 'multi-room transfer');
    });

    await t.test('future overlapping reservation blocks a transfer', () => {
      const occupiedReservation = createReservation({
        roomId: oldRoom.id,
        checkIn: today,
        checkOut: addDays(today, 3),
        totalPrice: 300
      });
      const futureRoom = addRoom('MOVE-FUTURE', 125);
      createReservation({
        roomId: futureRoom.id,
        checkIn: addDays(today, 1),
        checkOut: addDays(today, 2),
        totalPrice: 125
      });
      assert.throws(() => db.transferReservationRoom({
        reservationId: occupiedReservation,
        toRoomId: futureRoom.id,
        reason: 'عطل سباكة',
        userId: 1
      }), /محجوزة خلال فترة الإقامة/);
      assert.equal(db.getReservationById(occupiedReservation).room_id, oldRoom.id);
      assert.equal(connection.queryOne('SELECT COUNT(*) AS count FROM room_transfers WHERE reservation_id = ?', [occupiedReservation]).count, 0);
    });

    await t.test('staff cannot select preserve-rate or custom-rate policies', () => {
      assert.throws(() => db.previewRoomTransfer({
        reservationId,
        toRoomId: policyRoom.id,
        ratePolicy: 'preserve_rate',
        isAdmin: false
      }), /صلاحية المدير/);
      assert.throws(() => db.previewRoomTransfer({
        reservationId,
        toRoomId: policyRoom.id,
        ratePolicy: 'custom_rate',
        customRate: 120,
        isAdmin: false
      }), /صلاحية المدير/);
      assert.equal(db.previewRoomTransfer({
        reservationId,
        toRoomId: policyRoom.id,
        ratePolicy: 'preserve_rate',
        isAdmin: true
      }).priceDelta, 0);
    });
  });
});

test('monthly transfers prorate the new monthly rate delta over remaining nights using a 30-day basis', async () => {
  await withSafeDatabase(async db => {
    const today = db.getCurrentBusinessDate();
    const oldRoom = addRoom('MOVE-MONTH-OLD', 100);
    const newRoom = addRoom('MOVE-MONTH-NEW', 200);
    const reservationId = createReservation({
      roomId: oldRoom.id,
      checkIn: addDays(today, -5),
      checkOut: addDays(today, 25),
      totalPrice: 3000,
      bookingType: 'حجز شهري',
      monthlyPrice: 3000
    });

    const preview = db.previewRoomTransfer({ reservationId, toRoomId: newRoom.id });
    assert.equal(preview.priceDelta, 2500);
    assert.equal(preview.projectedTotal, 5500);

    db.transferReservationRoom({ reservationId, toRoomId: newRoom.id, reason: 'ترقية فندقية', userId: 1 });
    const settlement = db.computeCheckoutSettlement(reservationId);
    assert.equal(settlement.contractValue, 5500);
    assert.equal(settlement.contractValueMismatch, false);
  });
});

test('database startup backfills room-stay history for legacy reservations', async () => {
  await withSafeDatabase(async (db, connection, databasePath) => {
    const today = db.getCurrentBusinessDate();
    const room = addRoom('MOVE-LEGACY', 125);
    const reservationId = createReservation({
      roomId: room.id,
      checkIn: today,
      checkOut: addDays(today, 2),
      totalPrice: 250
    });
    connection.db.run('DELETE FROM reservation_room_stays WHERE reservation_id = ?', [reservationId]);

    db.close();
    await db.init(databasePath);

    const stays = db.getReservationRoomStays(reservationId);
    assert.equal(stays.length, 1);
    assert.equal(stays[0].room_id, room.id);
    assert.equal(stays[0].nightly_rate_snapshot, 125);
  });
});