'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { withSafeDatabase } = require('./helpers/safe-temp-db');
const { FakeIpcMain, createFakeDeps } = require('./helpers/fake-ipc');
const { registerReservationsIpc } = require('../ipc/index');
const { addRoom, createReservation, addDays } = require('./helpers/fixtures');

test('IPC Reservations handlers', async t => {
  await withSafeDatabase(async (db, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerReservationsIpc(ipcMain, deps);

    const today = db.getLocalDateString();
    deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
    const room = addRoom('IPC-RES', 200);

    await t.test('Validation: rejects bad phone, bad ID, and invalid dates with Arabic messages', async () => {
      const res1 = await ipcMain.invoke('reservations:create', {}, {
        guestName: 'Test', guestPhone: '123', guestIdNumber: '1000000000', roomId: room.id,
        checkInDate: today, checkOutDate: addDays(today, 1), totalPrice: 200
      });
      assert.equal(res1.success, false);
      assert.match(res1.error, /رقم الجوال غير صحيح/);

      const res2 = await ipcMain.invoke('reservations:create', {}, {
        guestName: 'Test', guestPhone: '0500000000', guestIdNumber: '123', roomId: room.id,
        checkInDate: today, checkOutDate: addDays(today, 1), totalPrice: 200
      });
      assert.equal(res2.success, false);
      assert.match(res2.error, /رقم الهوية الوطنية/);

      const res3 = await ipcMain.invoke('reservations:create', {}, {
        guestName: 'Test', guestPhone: '0500000000', guestIdNumber: '1000000000', roomId: room.id,
        checkInDate: addDays(today, 2), checkOutDate: today, totalPrice: 200
      });
      assert.equal(res3.success, false);
      assert.match(res3.error, /المغادرة/);
    });

    const resId = createReservation({
      roomId: room.id,
      name: 'IPC Guest',
      checkIn: addDays(today, -2),
      checkOut: today,
      totalPrice: 400,
      paidAmount: 400
    });

    await t.test('Checkout & Preview: non-Admin discountAmount, discountReason, customNightlyPrice, finalTotalPrice are stripped', async () => {
      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      
      const preview = await ipcMain.invoke('reservations:checkout-preview', {}, resId, {
        discountAmount: 100,
        discountReason: 'Test',
        customNightlyPrice: 50,
        finalTotalPrice: 100
      });
      assert.equal(preview.success, true);
      assert.equal(preview.data.baseCharge, 400); // 2 days * 200
      assert.equal(preview.data.discountApplied, 0);
    });

    await t.test('Checkout & Preview: Admin customNightlyPrice and finalTotalPrice are stripped', async () => {
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const preview = await ipcMain.invoke('reservations:checkout-preview', {}, resId, {
        customNightlyPrice: 50,
        finalTotalPrice: 100
      });
      assert.equal(preview.success, true);
      assert.equal(preview.data.baseCharge, 400); // Should still use the stored 200 rate
    });

    await t.test('Checkout: Admin discount without reason is rejected', async () => {
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const checkout = await ipcMain.invoke('reservations:checkout', {}, resId, {
        settleMode: 'defer',
        discountAmount: 100,
        discountReason: ''
      });
      assert.equal(checkout.success, false);
      assert.match(checkout.error, /سبب الخصم/);
    });

    await t.test('Checkout: Admin discount with reason is applied', async () => {
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const checkout = await ipcMain.invoke('reservations:checkout', {}, resId, {
        settleMode: 'refund',
        refundAmount: 100,
        discountAmount: 100,
        discountReason: 'Admin Discount'
      });
      if (checkout.error) console.log('Checkout error:', checkout.error);
      assert.equal(checkout.success, true);
      const res = db.getReservationById(resId);
      assert.equal(res.status, 'مكتمل');
      assert.equal(res.discount_amount, 100);
      assert.equal(res.discount_reason, 'Admin Discount');
      assert.equal(res.total_price, 300);
    });

    await t.test('Room transfer IPC derives user and pricing permissions from the active session', async () => {
      const transferOldRoom = addRoom('IPC-MOVE-OLD', 100);
      const transferNewRoom = addRoom('IPC-MOVE-NEW', 150);
      const transferReservationId = createReservation({
        roomId: transferOldRoom.id,
        checkIn: addDays(today, -1),
        checkOut: addDays(today, 2),
        totalPrice: 300
      });

      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      const deniedPreview = await ipcMain.invoke('reservations:room-transfer-preview', {}, {
        reservationId: transferReservationId,
        toRoomId: transferNewRoom.id,
        ratePolicy: 'preserve_rate'
      });
      assert.equal(deniedPreview.success, false);
      assert.match(deniedPreview.error, /صلاحية المدير/);

      const moved = await ipcMain.invoke('reservations:room-transfer', {}, {
        reservationId: transferReservationId,
        toRoomId: transferNewRoom.id,
        reason: 'عطل تكييف',
        userId: 1,
        requesterRole: 'Admin'
      });
      assert.equal(moved.success, true);
      const audit = connection.queryOne('SELECT user_id FROM room_transfers WHERE reservation_id = ?', [transferReservationId]);
      assert.equal(audit.user_id, 2);
      assert.equal(moved.data.transferId, connection.queryOne('SELECT id FROM room_transfers WHERE reservation_id = ?', [transferReservationId]).id);
      const invoice = await ipcMain.invoke('reservations:get-invoice-data', {}, transferReservationId);
      assert.equal(invoice.success, true);
      assert.equal(invoice.data.room_stays.length, 2);
      assert.equal(invoice.data.room_stay_charges.segments.length, 2);

      deps.session.currentUser = null;
      const denied = await ipcMain.invoke('reservations:room-transfer-preview', {}, {
        reservationId: transferReservationId,
        toRoomId: transferOldRoom.id
      });
      assert.equal(denied.success, false);
      assert.match(denied.error, /غير مصرح/);
    });

    await t.test('Cancel handler: active stays must use checkout regardless of role or override', async () => {
      const room2 = addRoom('IPC-CANCEL', 200);
      const resId1 = createReservation({ roomId: room2.id, name: 'User Cancel', checkIn: addDays(today, -2), checkOut: addDays(today, 2), totalPrice: 800, paidAmount: 800 });
      
      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      const cancel1 = await ipcMain.invoke('reservations:cancel', {}, { reservationId: resId1, actualDepartureDate: today, manualOverrideAmount: 50 });
      assert.equal(cancel1.success, false);
      assert.match(cancel1.error, /استخدم تسجيل الخروج/);
      const res1 = db.getReservationById(resId1);
      assert.equal(res1.status, 'مؤكد');
      assert.equal(res1.total_price, 800);
      assert.equal(db.getReservationPayments(resId1).length, 1);

      const room3 = addRoom('IPC-CANCEL-ADMIN', 200);
      const resId2 = createReservation({ roomId: room3.id, name: 'Admin Cancel', checkIn: addDays(today, -2), checkOut: addDays(today, 2), totalPrice: 800, paidAmount: 800 });
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const cancel2 = await ipcMain.invoke('reservations:cancel', {}, { reservationId: resId2, actualDepartureDate: today, manualOverrideAmount: 50 });
      assert.equal(cancel2.success, false);
      assert.match(cancel2.error, /استخدم تسجيل الخروج/);
      const res2 = db.getReservationById(resId2);
      assert.equal(res2.status, 'مؤكد');
      assert.equal(res2.total_price, 800);
      assert.equal(db.getReservationPayments(resId2).length, 1);
    });
  });
});
