'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const appDb = require('../db');
const { addDays, addRoom } = require('./helpers/fixtures');
const { withSafeDatabase } = require('./helpers/safe-temp-db');

test('Financial Ledger Integrity & Life Cycle Fixes (F-03, F-04, F-05, F-08, F-09, F-11, F-14, F-16, F-17)', async t => {

  await t.test('[F-03 & F-04] computeCheckoutSettlement and checkoutReservation use payments ledger', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-101', 300);
      const guest = db.addCustomer({ name: 'Guest F03', phone: '0591111111', id_number: '1091111111' });
      
      const yesterday = addDays(today, -1);
      const res = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: yesterday, checkOutDate: addDays(today, 4),
        totalPrice: 1500, paidAmount: 0
      });

      // 1500 paid in payments table
      const rec = db.generateReceiptNumber(res.reservationId);
      conn.db.run(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
        VALUES (?, ?, 1500, 'تحويل بنكي', 'advance_payment', datetime('now'), 'دفعة حقيقية')
      `, [rec, res.reservationId]);
      conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res.reservationId]);

      // Settlement reads ledger
      const settlement = db.computeCheckoutSettlement(res.reservationId);
      assert.equal(settlement.paidAmount, 1500, 'Settlement must read 1500 from payments ledger');
      assert.equal(settlement.difference, -1200, 'Difference must reflect 1200 SAR refund due (1 night = 300 SAR)');

      // Checkout refund succeeds without false overpayment error
      const checkoutRes = db.checkoutReservation(res.reservationId, { settleMode: 'refund', refundAmount: 1200 });
      assert.ok(checkoutRes.success, 'Checkout with refund must succeed');

      // Verify refund payment was recorded
      const refundRow = conn.queryOne("SELECT amount FROM payments WHERE reservation_id = ? AND payment_type = 'refund'", [res.reservationId]);
      assert.equal(refundRow.amount, -1200, 'Refund payment row must be -1200');

      // Guard check: cannot refund if 0 paid in ledger
      const roomNoPay = addRoom('FIN-102', 300);
      const resNoPay = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: roomNoPay.id, checkInDate: yesterday, checkOutDate: today,
        totalPrice: 0, paidAmount: 0, discountAmount: 300, discountReason: 'إعفاء كامل'
      });
      assert.throws(() => {
        db.checkoutReservation(resNoPay.reservationId, { settleMode: 'refund', refundAmount: 100 });
      }, /لا يمكن تسجيل استرداد نقدي/, 'Must throw if attempting refund without payments in ledger');
    });
  });

  await t.test('[F-08] addPaymentToReservation uses ledger_paid_amount for confirmed reservations', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-103', 200);
      const guest = db.addCustomer({ name: 'Guest F08', phone: '0592222222', id_number: '1092222222' });
      const res = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: today, checkOutDate: addDays(today, 5),
        totalPrice: 1000, paidAmount: 400
      });

      // Extra payment directly in payments table
      const rec = db.generateReceiptNumber(res.reservationId);
      conn.db.run(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
        VALUES (?, ?, 300, 'نقداً', 'balance_payment', datetime('now'), 'دفعة سابقة إضافية')
      `, [rec, res.reservationId]);

      // Add remaining 300 SAR
      const payRes = db.addPaymentToReservation({ reservationId: res.reservationId, amount: 300, paymentMethod: 'نقداً' });
      assert.equal(payRes.newPaidAmount, 1000, 'New paid amount must be 1000');

      const updatedRes = conn.queryOne('SELECT paid_amount FROM reservations WHERE id = ?', [res.reservationId]);
      assert.equal(updatedRes.paid_amount, 1000, 'reservations.paid_amount must be updated to 1000');
    });
  });

  await t.test('[F-05] updateReservationReceipt calculates delta against ledger payments sum', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-104', 200);
      const guest = db.addCustomer({ name: 'Guest F05', phone: '0593333333', id_number: '1093333333' });
      const res = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: today, checkOutDate: addDays(today, 5),
        totalPrice: 1000, paidAmount: 0
      });

      // Two payments of 300 in ledger (total 600)
      conn.db.run(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
        VALUES ('REC-F05-1', ?, 300, 'نقداً', 'advance_payment', datetime('now'), 'دفعة 1'),
               ('REC-F05-2', ?, 300, 'نقداً', 'advance_payment', datetime('now'), 'دفعة 2')
      `, [res.reservationId, res.reservationId]);
      conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res.reservationId]);

      // Set paid to 700
      db.updateReservationReceipt({
        reservationId: res.reservationId,
        totalPrice: 1000,
        paidAmount: 700,
        paymentMethod: 'نقداً'
      });

      const ledgerSum = conn.queryOne('SELECT SUM(amount) AS sum FROM payments WHERE reservation_id = ?', [res.reservationId]).sum;
      assert.equal(ledgerSum, 700, 'Total ledger payments must equal the newly specified 700 SAR');
    });
  });

  await t.test('[F-09] extendReservation uses payments ledger', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-105', 200);
      const guest = db.addCustomer({ name: 'Guest F09', phone: '0594444444', id_number: '1094444444' });
      const res = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: today, checkOutDate: addDays(today, 3),
        totalPrice: 600, paidAmount: 0
      });

      // 600 in payments table
      conn.db.run(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
        VALUES ('REC-F09-1', ?, 600, 'نقداً', 'advance_payment', datetime('now'), 'دفعة أصلية')
      `, [res.reservationId]);
      conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res.reservationId]);

      // Extend 1 night with 200 SAR payment
      db.extendReservation({
        reservationId: res.reservationId,
        newCheckOutDate: addDays(today, 4),
        settleAmount: 200,
        paymentMethod: 'نقداً'
      });

      const updatedRes = conn.queryOne('SELECT paid_amount FROM reservations WHERE id = ?', [res.reservationId]);
      const ledgerSum = conn.queryOne('SELECT SUM(amount) AS sum FROM payments WHERE reservation_id = ?', [res.reservationId]).sum;
      assert.equal(ledgerSum, 800, 'Ledger sum must be 800');
      assert.equal(updatedRes.paid_amount, 800, 'reservations.paid_amount must be 800');
    });
  });

  await t.test('[F-11] cancelReservation calculates refundDue from payments ledger', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-106', 250);
      const guest = db.addCustomer({ name: 'Guest F11', phone: '0595555555', id_number: '1095555555' });
      const futureDate = addDays(today, 2);
      const res = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: futureDate, checkOutDate: addDays(futureDate, 2),
        totalPrice: 500, paidAmount: 0
      });

      // 500 in payments
      conn.db.run(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
        VALUES ('REC-F11-1', ?, 500, 'تحويل بنكي', 'advance_payment', datetime('now'), 'دفعة مقدمة')
      `, [res.reservationId]);
      conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res.reservationId]);

      const cancelRes = db.cancelReservation(res.reservationId);
      assert.equal(cancelRes.refundDue, 500, 'cancelReservation must return 500 refundDue');

      const refundRows = conn.queryAll("SELECT * FROM payments WHERE reservation_id = ? AND amount < 0", [res.reservationId]);
      assert.equal(refundRows.length, 1, 'Refund payment row must be created');
      assert.equal(refundRows[0].amount, -500, 'Refund payment amount must be -500');
    });
  });

  await t.test('[F-14] Same-day check-in to cleaning room sets room status to occupied', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-107', 200);
      conn.db.run("UPDATE rooms SET status = 'تنظيف' WHERE id = ?", [room.id]);

      const guest = db.addCustomer({ name: 'Guest F14', phone: '0596666666', id_number: '1096666666' });
      db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: today, checkOutDate: addDays(today, 2),
        totalPrice: 400, paidAmount: 400
      });

      const statusAfterCreate = conn.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status;
      assert.equal(statusAfterCreate, 'مشغولة', 'Room status after same-day reservation creation must be مشغولة');

      db.autoUpdateRoomStatuses(today);
      const statusAfterAuto = conn.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status;
      assert.equal(statusAfterAuto, 'مشغولة', 'Room status after autoUpdateRoomStatuses must remain مشغولة');
    });
  });

  await t.test('[F-17] updateReservationReceipt forks guest record on multi-reservation update', async () => {
    await withSafeDatabase(async (db, conn) => {
      const today = db.getCurrentBusinessDate();
      const room = addRoom('FIN-108', 200);
      const guest = db.addCustomer({ name: 'سعيد الحربي', phone: '0597777777', id_number: '1097777777' });

      // Stay 1
      const res1 = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: '2026-01-10', checkOutDate: '2026-01-12',
        totalPrice: 400, paidAmount: 400
      });
      // Stay 2
      const res2 = db.createReservation({
        guestName: guest.name, guestPhone: guest.phone, guestIdNumber: guest.id_number,
        roomId: room.id, checkInDate: today, checkOutDate: addDays(today, 2),
        totalPrice: 400, paidAmount: 400
      });

      // Edit receipt for Stay 2 with different guest details
      db.updateReservationReceipt({
        reservationId: res2.reservationId,
        guestName: 'فهد الحربي',
        guestPhone: '0598888888',
        totalPrice: 400,
        paidAmount: 400
      });

      // Verify Stay 1 guest was preserved unchanged
      const res1Details = db.getReservationById(res1.reservationId);
      assert.equal(res1Details.guest_name, 'سعيد الحربي', 'Stay 1 guest name must remain سعيد الحربي');
      assert.equal(res1Details.guest_phone, '0597777777', 'Stay 1 guest phone must remain 0597777777');

      // Verify Stay 2 guest was updated
      const res2Details = db.getReservationById(res2.reservationId);
      assert.equal(res2Details.guest_name, 'فهد الحربي', 'Stay 2 guest name must be فهد الحربي');
      assert.equal(res2Details.guest_phone, '0598888888', 'Stay 2 guest phone must be 0598888888');
    });
  });

  await t.test('[F-16] dashboard-rooms.js renders legacy deposit warning badge', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'dashboard-rooms.js'), 'utf8');
    assert.ok(content.includes('deposit-legacy-badge'), 'dashboard-rooms.js must contain deposit-legacy-badge');
    assert.ok(content.includes('(قديم ⚠️)'), 'dashboard-rooms.js must render (قديم ⚠️)');
  });
});
