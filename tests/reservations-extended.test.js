'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { addDays, addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('extended reservation operations', async t => {
  await withSafeDatabase(async (db, connection) => {
    const today = db.getLocalDateString();

    await t.test('extendReservation increases checkout date and recalculates price', () => {
      const room = addRoom('EX-1', 100);
      const res = createReservation({
        roomId: room.id,
        name: 'Extend Guest',
        checkIn: today,
        checkOut: addDays(today, 1),
        totalPrice: 100,
        paidAmount: 50
      });

      const newCheckOut = addDays(today, 3); // extend by 2 days
      const result = db.extendReservation({
        reservationId: res,
        newCheckOutDate: newCheckOut,
        customNightlyPrice: 120, // testing custom price change
        additionalCost: 240,     // +2 nights * 120
        settleAmount: 100,       // paid extra
        paymentMethod: 'نقداً',
        notes: 'تمديد'
      });

      assert.equal(result.success, true);
      const updated = db.getReservationById(res);
      assert.equal(updated.check_out_date, newCheckOut);
      assert.equal(updated.custom_nightly_price, 120);
      assert.equal(updated.total_price, 340); // 100 + 240
      assert.equal(updated.paid_amount, 150); // 50 + 100
      
      const payments = db.getReservationPayments(res);
      assert.equal(payments.length, 2);
      assert.equal(payments[1].amount, 100);
      assertDatabaseIntegrity(connection, 'extend reservation');
    });

    await t.test('getPaymentReceipt fetches complete receipt info', () => {
      const room = addRoom('RCPT-1', 100);
      const res = createReservation({
        roomId: room.id,
        name: 'Receipt Guest',
        checkIn: today,
        checkOut: addDays(today, 1),
        totalPrice: 100,
        paidAmount: 50
      });
      const payments = db.getReservationPayments(res);
      assert.ok(payments.length > 0);
      const receiptNumber = payments[0].receipt_number;
      
      const receipt = db.getPaymentReceipt(receiptNumber);
      assert.ok(receipt);
      assert.equal(receipt.receipt_number, receiptNumber);
      assert.equal(receipt.reservation_id, res);
      assert.equal(receipt.amount, 50);
      assert.equal(receipt.guest_name, 'Receipt Guest');
      assert.equal(receipt.room_number, 'RCPT-1');
      assertDatabaseIntegrity(connection, 'get payment receipt');
    });

    await t.test('updateReservationReceipt modifies basic booking metadata', () => {
      const room = addRoom('UPD-1', 100);
      const res = createReservation({
        roomId: room.id,
        name: 'Update Guest',
        checkIn: today,
        checkOut: addDays(today, 1),
        totalPrice: 100,
        paidAmount: 50
      });

      const guest = connection.queryOne('SELECT * FROM guests WHERE id = (SELECT guest_id FROM reservations WHERE id = ?)', [res]);
      
      const result = db.updateReservationReceipt({
        reservationId: res,
        totalPrice: 80,
        paidAmount: 75,
        depositAmount: 25, // Note: db currently doesn't map deposit to a dedicated column but it processes it
        paymentMethod: 'نقداً',
        guestName: 'Updated Name',
        guestPhone: '0500000999',
        guestIdNumber: '1000000999',
        discountAmount: 10,
        discountReason: 'Test Discount',
        customNightlyPrice: 90
      });
      
      assert.equal(result.success, true);
      const updatedRes = db.getReservationById(res);
      assert.equal(updatedRes.total_price, 80);
      assert.equal(updatedRes.paid_amount, 75);
      assert.equal(updatedRes.discount_amount, 10);
      assert.equal(updatedRes.discount_reason, 'Test Discount');
      assert.equal(updatedRes.custom_nightly_price, 90);
      
      const updatedGuest = connection.queryOne('SELECT * FROM guests WHERE id = ?', [guest.id]);
      assert.equal(updatedGuest.name, 'Updated Name');
      assert.equal(updatedGuest.phone, '0500000999');
      assertDatabaseIntegrity(connection, 'update reservation receipt');
    });

    await t.test('bulkImportReservations imports reservations and creates/links guests and rooms', () => {
      const importData = [
        {
          guest_name: 'Bulk Guest 1',
          guest_phone: '0500001001',
          room_number: 'BULK-1',
          check_in_date: today,
          check_out_date: addDays(today, 2),
          total_price: 500
        },
        {
          name: 'Bulk Guest 2', // Alternate alias
          phone: '0500001002',
          room_number: 'BULK-2',
          check_in_date: today,
          check_out_date: addDays(today, 3),
          total_price: 900
        }
      ];

      const result = db.bulkImportReservations(importData);
      assert.equal(result.inserted, 2);
      assert.equal(result.skipped, 0);

      const allRes = db.getAllReservations();
      const b1 = allRes.find(r => r.guest_name === 'Bulk Guest 1');
      const b2 = allRes.find(r => r.guest_name === 'Bulk Guest 2');
      
      assert.ok(b1);
      assert.equal(b1.total_price, 500);
      assert.ok(b2);
      assert.equal(b2.total_price, 900);
      assertDatabaseIntegrity(connection, 'bulk import reservations');
    });
  });
});
