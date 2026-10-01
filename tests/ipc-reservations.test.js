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

    await t.test('Cancel handler: manualOverrideAmount stripped for non-Admin and honored for Admin', async () => {
      const room2 = addRoom('IPC-CANCEL', 200);
      const resId1 = createReservation({ roomId: room2.id, name: 'User Cancel', checkIn: addDays(today, -2), checkOut: addDays(today, 2), totalPrice: 800, paidAmount: 800 });
      
      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      const cancel1 = await ipcMain.invoke('reservations:cancel', {}, { reservationId: resId1, actualDepartureDate: today, manualOverrideAmount: 50 });
      assert.equal(cancel1.success, true);
      const res1 = db.getReservationById(resId1);
      assert.equal(res1.total_price, 400); // 2 nights at 200/night = 400
      const payments1 = db.getReservationPayments(resId1);
      const refund1 = payments1.find(p => p.amount < 0);
      assert.equal(refund1.amount, -400);

      const resId2 = createReservation({ roomId: room2.id, name: 'Admin Cancel', checkIn: addDays(today, -2), checkOut: addDays(today, 2), totalPrice: 800, paidAmount: 800 });
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const cancel2 = await ipcMain.invoke('reservations:cancel', {}, { reservationId: resId2, actualDepartureDate: today, manualOverrideAmount: 50 });
      assert.equal(cancel2.success, true);
      const res2 = db.getReservationById(resId2);
      assert.equal(res2.total_price, 50); // Admin rule honors override
      const payments2 = db.getReservationPayments(resId2);
      const refund2 = payments2.find(p => p.amount < 0);
      assert.equal(refund2.amount, -750);
    });
  });
});
