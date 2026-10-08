'use strict';

const assert = require('node:assert/strict');
const appDb = require('../db');
const connection = require('../db/connection');
const { addDays, addRoom } = require('./helpers/fixtures');
const { withSafeDatabase } = require('./helpers/safe-temp-db');

async function runVerification() {
  console.log('=== STARTING REPRODUCTION & VERIFICATION SUITE ===\n');

  await withSafeDatabase(async (db, conn) => {
    const today = db.getCurrentBusinessDate();
    const results = {};

    // -------------------------------------------------------------
    // SCENARIO 1: [F-03 & F-04] checkoutReservation & computeCheckoutSettlement
    // Assumption: computeCheckoutSettlement and checkoutReservation read res.paid_amount,
    // ignoring payments ledger. If res.paid_amount is 0 while payments has 1500 SAR,
    // computeCheckoutSettlement reports paid = 0 and claims guest owes money instead of a refund.
    // -------------------------------------------------------------
    console.log('--- Testing F-03 & F-04: checkoutReservation & computeCheckoutSettlement ---');
    const room1 = addRoom('TEST-301', 300);
    const guest1 = db.addCustomer({ name: 'Guest F03', phone: '0591111111', id_number: '1091111111' });
    
    // Create reservation for 5 nights (total 1500) starting 1 day ago
    const yesterday = addDays(today, -1);
    const checkOutDate1 = addDays(today, 4);
    const res1 = db.createReservation({
      guestName: guest1.name, guestPhone: guest1.phone, guestIdNumber: guest1.id_number,
      roomId: room1.id, checkInDate: yesterday, checkOutDate: checkOutDate1,
      totalPrice: 1500, paidAmount: 0
    });
    
    // Guest actually paid 1500 SAR via bank transfer, recorded in payments table
    const recNo1 = db.generateReceiptNumber(res1.reservationId);
    conn.db.run(`
      INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
      VALUES (?, ?, 1500, 'تحويل بنكي', 'advance_payment', datetime('now'), 'دفعة حقيقية بالسندات')
    `, [recNo1, res1.reservationId]);

    // Ensure reservations.paid_amount is 0 (simulating desync or missing update)
    conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res1.reservationId]);

    // Now test computeCheckoutSettlement
    const settlementCalc = db.computeCheckoutSettlement(res1.reservationId);
    console.log(`[F-03/F-04 Verification] Guest paid 1500 in ledger. Stay so far: 1 night = 300 SAR.`);
    console.log(`  computeCheckoutSettlement returned paidAmount: ${settlementCalc.paidAmount}`);
    console.log(`  computeCheckoutSettlement returned difference: ${settlementCalc.difference}`);
    
    let checkoutBlockedOrWrong = false;
    try {
      // Trying to refund the 1200 SAR difference (1500 paid - 300 stay)
      db.checkoutReservation(res1.reservationId, { settleMode: 'refund', refundAmount: 1200 });
    } catch (err) {
      checkoutBlockedOrWrong = true;
      console.log(`  checkoutReservation rejected 1200 refund with error: "${err.message}"`);
    }

    results['F-03_F-04'] = {
      assumption: 'checkoutReservation and computeCheckoutSettlement read res.paid_amount (0) ignoring payments (1500), blocking legitimate refund',
      confirmed: settlementCalc.paidAmount === 0 && checkoutBlockedOrWrong,
      details: `Settlement reported paidAmount = ${settlementCalc.paidAmount}, difference = ${settlementCalc.difference}. Refund of 1200 was blocked because backend thinks paid is 0.`
    };

    // -------------------------------------------------------------
    // SCENARIO 2: [F-08] addPaymentToReservation
    // Assumption: addPaymentToReservation uses res.paid_amount for confirmed reservations,
    // ignoring ledger_paid_amount.
    // -------------------------------------------------------------
    console.log('\n--- Testing F-08: addPaymentToReservation ---');
    const room2 = addRoom('TEST-302', 200);
    const guest2 = db.addCustomer({ name: 'Guest F08', phone: '0592222222', id_number: '1092222222' });
    const res2 = db.createReservation({
      guestName: guest2.name, guestPhone: guest2.phone, guestIdNumber: guest2.id_number,
      roomId: room2.id, checkInDate: today, checkOutDate: addDays(today, 5),
      totalPrice: 1000, paidAmount: 400
    });
    // Add an extra payment of 300 directly in ledger so total in payments is 400 + 300 = 700
    const recNo2 = db.generateReceiptNumber(res2.reservationId);
    conn.db.run(`
      INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
      VALUES (?, ?, 300, 'نقداً', 'balance_payment', datetime('now'), 'دفعة سابقة إضافية')
    `, [recNo2, res2.reservationId]);
    // res.paid_amount remains 400 (desynced from total ledger 700). True remaining is 1000 - 700 = 300.
    
    // Now guest pays remaining 300 SAR
    db.addPaymentToReservation({ reservationId: res2.reservationId, amount: 300, paymentMethod: 'نقداً' });

    const updatedRes2 = conn.queryOne('SELECT total_price, paid_amount FROM reservations WHERE id = ?', [res2.reservationId]);
    const ledgerSum2 = conn.queryOne('SELECT SUM(amount) AS sum FROM payments WHERE reservation_id = ?', [res2.reservationId]).sum;

    console.log(`[F-08 Verification] Expected ledger sum: 1000. Actual ledger sum: ${ledgerSum2}`);
    console.log(`  Updated reservations.paid_amount: ${updatedRes2.paid_amount}`);

    results['F-08'] = {
      assumption: 'addPaymentToReservation adds payment to stale res.paid_amount (400 + 300 = 700) instead of ledger sum (700 + 300 = 1000)',
      confirmed: updatedRes2.paid_amount === 700 && ledgerSum2 === 1000,
      details: `reservations.paid_amount was written as ${updatedRes2.paid_amount} while payments ledger total is ${ledgerSum2}.`
    };

    // -------------------------------------------------------------
    // SCENARIO 3: [F-05] updateReservationReceipt Delta
    // Assumption: updateReservationReceipt calculates delta = paid - res.paid_amount.
    // If res.paid_amount is 0 while ledger has 600, editing paid to 700 inserts delta = 700,
    // resulting in total ledger 600 + 700 = 1300!
    // -------------------------------------------------------------
    console.log('\n--- Testing F-05: updateReservationReceipt Delta ---');
    const room3 = addRoom('TEST-303', 200);
    const guest3 = db.addCustomer({ name: 'Guest F05', phone: '0593333333', id_number: '1093333333' });
    const res3 = db.createReservation({
      guestName: guest3.name, guestPhone: guest3.phone, guestIdNumber: guest3.id_number,
      roomId: room3.id, checkInDate: today, checkOutDate: addDays(today, 5),
      totalPrice: 1000, paidAmount: 0
    });
    // Two receipts of 300 in ledger (total 600 in payments)
    conn.db.run(`
      INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
      VALUES ('REC-1', ?, 300, 'نقداً', 'advance_payment', datetime('now'), 'دفعة 1'),
             ('REC-2', ?, 300, 'نقداً', 'advance_payment', datetime('now'), 'دفعة 2')
    `, [res3.reservationId, res3.reservationId]);
    conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res3.reservationId]);

    // Staff edits receipt, setting paid to 700
    db.updateReservationReceipt({
      reservationId: res3.reservationId,
      totalPrice: 1000,
      paidAmount: 700,
      paymentMethod: 'نقداً'
    });

    const ledgerSum3 = conn.queryOne('SELECT SUM(amount) AS sum FROM payments WHERE reservation_id = ?', [res3.reservationId]).sum;
    console.log(`[F-05 Verification] Staff set paid to 700. Prior payments: 600.`);
    console.log(`  Actual ledger sum after edit: ${ledgerSum3} (Expected if bug exists: 1300)`);

    results['F-05'] = {
      assumption: 'Delta uses res.paid_amount (0), so setting paid to 700 adds +700 to existing 600, yielding 1300',
      confirmed: ledgerSum3 === 1300,
      details: `Ledger sum became ${ledgerSum3} instead of 700.`
    };

    // -------------------------------------------------------------
    // SCENARIO 4: [F-09] extendReservation
    // Assumption: extendReservation reads res.paid_amount and overwrites it with res.paid_amount + extension payment,
    // ignoring prior payments in ledger if res.paid_amount was desynced.
    // -------------------------------------------------------------
    console.log('\n--- Testing F-09: extendReservation ---');
    const room4 = addRoom('TEST-304', 200);
    const guest4 = db.addCustomer({ name: 'Guest F09', phone: '0594444444', id_number: '1094444444' });
    const res4 = db.createReservation({
      guestName: guest4.name, guestPhone: guest4.phone, guestIdNumber: guest4.id_number,
      roomId: room4.id, checkInDate: today, checkOutDate: addDays(today, 3),
      totalPrice: 600, paidAmount: 0
    });
    // Ledger has 600 SAR payment
    conn.db.run(`
      INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
      VALUES ('REC-EXT-1', ?, 600, 'نقداً', 'advance_payment', datetime('now'), 'دفعة أصلية')
    `, [res4.reservationId]);
    conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res4.reservationId]);

    // Extend 1 night with 200 SAR payment
    db.extendReservation({
      reservationId: res4.reservationId,
      newCheckOutDate: addDays(today, 4),
      settleAmount: 200,
      paymentMethod: 'نقداً'
    });

    const updatedRes4 = conn.queryOne('SELECT paid_amount, total_price FROM reservations WHERE id = ?', [res4.reservationId]);
    const ledgerSum4 = conn.queryOne('SELECT SUM(amount) AS sum FROM payments WHERE reservation_id = ?', [res4.reservationId]).sum;

    console.log(`[F-09 Verification] Ledger has: 600 + 200 = ${ledgerSum4}`);
    console.log(`  Updated reservations.paid_amount: ${updatedRes4.paid_amount}`);

    results['F-09'] = {
      assumption: 'extendReservation sets paid_amount = 0 + 200 = 200, wiping 600 from stored summary',
      confirmed: updatedRes4.paid_amount === 200 && ledgerSum4 === 800,
      details: `reservations.paid_amount was set to ${updatedRes4.paid_amount} while payments ledger has ${ledgerSum4}.`
    };

    // -------------------------------------------------------------
    // SCENARIO 5: [F-11] cancelReservation
    // Assumption: cancelReservation reads res.paid_amount to calculate refundDue.
    // If res.paid_amount is 0 while payments has 500, refundDue is 0 and no refund row is created.
    // -------------------------------------------------------------
    console.log('\n--- Testing F-11: cancelReservation ---');
    const room5 = addRoom('TEST-305', 250);
    const guest5 = db.addCustomer({ name: 'Guest F11', phone: '0595555555', id_number: '1095555555' });
    const futureDate = addDays(today, 2);
    const res5 = db.createReservation({
      guestName: guest5.name, guestPhone: guest5.phone, guestIdNumber: guest5.id_number,
      roomId: room5.id, checkInDate: futureDate, checkOutDate: addDays(futureDate, 2),
      totalPrice: 500, paidAmount: 0
    });
    // Guest paid 500 SAR in payments
    conn.db.run(`
      INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_type, payment_date, notes)
      VALUES ('REC-CAN-1', ?, 500, 'تحويل بنكي', 'advance_payment', datetime('now'), 'دفعة مقدمة')
    `, [res5.reservationId]);
    conn.db.run('UPDATE reservations SET paid_amount = 0 WHERE id = ?', [res5.reservationId]);

    const cancelResult = db.cancelReservation(res5.reservationId);
    const refundRows5 = conn.queryAll("SELECT * FROM payments WHERE reservation_id = ? AND amount < 0", [res5.reservationId]);

    console.log(`[F-11 Verification] Pre-arrival cancel with 500 in ledger but paid_amount = 0.`);
    console.log(`  cancelReservation returned refundDue: ${cancelResult.refundDue}`);
    console.log(`  Negative refund payment rows inserted: ${refundRows5.length}`);

    results['F-11'] = {
      assumption: 'cancelReservation sets refundDue = 0 and creates 0 refund receipts when res.paid_amount is 0, abandoning 500 SAR in ledger',
      confirmed: cancelResult.refundDue === 0 && refundRows5.length === 0,
      details: `refundDue was ${cancelResult.refundDue} and 0 refund rows were generated despite 500 SAR in payments.`
    };

    // -------------------------------------------------------------
    // SCENARIO 6: [F-14] Immediate check-in to cleaning room
    // Assumption: creating a reservation arriving today for a room in 'تنظيف'
    // leaves the room in 'تنظيف' instead of setting it to 'مشغولة'.
    // -------------------------------------------------------------
    console.log('\n--- Testing F-14: Immediate check-in to cleaning room ---');
    const room6 = addRoom('TEST-306', 200);
    conn.db.run("UPDATE rooms SET status = 'تنظيف' WHERE id = ?", [room6.id]);
    
    // Check in a guest today
    const guest6 = db.addCustomer({ name: 'Guest F14', phone: '0596666666', id_number: '1096666666' });
    db.createReservation({
      guestName: guest6.name, guestPhone: guest6.phone, guestIdNumber: guest6.id_number,
      roomId: room6.id, checkInDate: today, checkOutDate: addDays(today, 2),
      totalPrice: 400, paidAmount: 400
    });

    const roomStatusAfterCreate = conn.queryOne('SELECT status FROM rooms WHERE id = ?', [room6.id]).status;
    db.autoUpdateRoomStatuses(today);
    const roomStatusAfterAutoUpdate = conn.queryOne('SELECT status FROM rooms WHERE id = ?', [room6.id]).status;

    console.log(`[F-14 Verification] Room initial status: تنظيف. Checked in guest for today.`);
    console.log(`  Room status after createReservation: "${roomStatusAfterCreate}"`);
    console.log(`  Room status after autoUpdateRoomStatuses: "${roomStatusAfterAutoUpdate}"`);

    results['F-14'] = {
      assumption: 'createReservation and autoUpdateRoomStatuses leave room in تنظيف instead of مشغولة for same-day arrivals',
      confirmed: roomStatusAfterCreate === 'تنظيف' && roomStatusAfterAutoUpdate === 'تنظيف',
      details: `Room status remained "${roomStatusAfterCreate}" immediately after check-in and after autoUpdateRoomStatuses.`
    };

    // -------------------------------------------------------------
    // SCENARIO 7: [F-17] Shared guest updates across reservations
    // Assumption: updateReservationReceipt executes UPDATE guests WHERE id = res.guest_id,
    // altering guest name/phone across older historical reservations.
    // -------------------------------------------------------------
    console.log('\n--- Testing F-17: Shared guest update across reservations ---');
    const room7 = addRoom('TEST-307', 200);
    const guest7 = db.addCustomer({ name: 'سعيد الحربي', phone: '0597777777', id_number: '1097777777' });
    
    // Reservation 1 (January stay)
    const res7A = db.createReservation({
      guestName: guest7.name, guestPhone: guest7.phone, guestIdNumber: guest7.id_number,
      roomId: room7.id, checkInDate: '2026-01-10', checkOutDate: '2026-01-12',
      totalPrice: 400, paidAmount: 400
    });
    // Reservation 2 (October stay)
    const res7B = db.createReservation({
      guestName: guest7.name, guestPhone: guest7.phone, guestIdNumber: guest7.id_number,
      roomId: room7.id, checkInDate: today, checkOutDate: addDays(today, 2),
      totalPrice: 400, paidAmount: 400
    });

    // Staff edits receipt for Reservation 2 and renames guest to 'فهد الحربي' and phone '0598888888'
    db.updateReservationReceipt({
      reservationId: res7B.reservationId,
      guestName: 'فهد الحربي',
      guestPhone: '0598888888',
      totalPrice: 400,
      paidAmount: 400
    });

    const res1Details = db.getReservationById(res7A.reservationId);
    console.log(`[F-17 Verification] Edited guest name on Reservation #${res7B.reservationId} to "فهد الحربي".`);
    console.log(`  Guest name on unedited Reservation #${res7A.reservationId}: "${res1Details.guest_name}"`);
    console.log(`  Guest phone on unedited Reservation #${res7A.reservationId}: "${res1Details.guest_phone}"`);

    results['F-17'] = {
      assumption: 'Editing receipt on reservation B retroactively changes guest name on reservation A from "سعيد الحربي" to "فهد الحربي"',
      confirmed: res1Details.guest_name === 'فهد الحربي' && res1Details.guest_phone === '0598888888',
      details: `Reservation #${res7A.reservationId} was retroactively altered to "${res1Details.guest_name}" (${res1Details.guest_phone}).`
    };

    // -------------------------------------------------------------
    // SUMMARY REPORT
    // -------------------------------------------------------------
    console.log('\n======================================================');
    console.log('                 VERIFICATION SUMMARY                 ');
    console.log('======================================================');
    for (const [key, val] of Object.entries(results)) {
      const statusText = val.confirmed ? '✅ CONFIRMED (100% REPRODUCED)' : '❌ NOT CONFIRMED';
      console.log(`[${key}] ${statusText}`);
      console.log(`  - Details: ${val.details}\n`);
    }
  });
}

runVerification().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
