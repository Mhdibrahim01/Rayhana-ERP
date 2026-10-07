'use strict';

const db = require('../../db');

let guestSequence = 0;

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addRoom(roomNumber, price = 200) {
  return db.addRoom({ room_number: roomNumber, type: 'وحدة اختبار', price_per_night: price, monthly_price: price * 30 });
}

function createReservation({
  roomId,
  name = `Test Guest ${guestSequence + 1}`,
  checkIn,
  checkOut,
  totalPrice = 400,
  paidAmount = 0,
  depositAmount = 0,
  bookingType = 'عادي',
  monthlyPrice = null,
  customNightlyPrice = null,
  discountAmount = 0,
  discountReason = ''
}) {
  guestSequence += 1;
  return db.createReservation({
    guestName: name,
    guestPhone: `05${String(10000000 + guestSequence).slice(-8)}`,
    guestIdNumber: String(1000000000 + guestSequence),
    roomId,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    totalPrice,
    paidAmount,
    depositAmount,
    bookingType,
    monthlyPrice: bookingType === 'حجز شهري' ? (monthlyPrice ?? (customNightlyPrice != null ? customNightlyPrice * 30 : null)) : null,
    customNightlyPrice,
    discountAmount,
    discountReason
  }).reservationId;
}

module.exports = { addDays, addRoom, createReservation };
