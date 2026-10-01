/**
 * نظام أحمد لإدارة الفنادق (Ahmed Hotel ERP)
 * Rooms Management & Inventory Module
 */

const { db, queryOne, queryAll, saveToFile, roundMoney, getLocalDateString } = require('./connection');

/**
 * Room Functions
 */
function getAllRooms() {
  autoUpdateRoomStatuses();
  const allRooms = queryAll("SELECT * FROM rooms ORDER BY CAST(room_number AS INTEGER) ASC, room_number ASC");
  const activeByRoom = new Map();
  for (const reservation of getActiveReservations(null)) {
    if (!activeByRoom.has(reservation.room_id)) activeByRoom.set(reservation.room_id, []);
    activeByRoom.get(reservation.room_id).push(reservation);
  }
  return allRooms.map(room => ({ ...room, active_reservations: activeByRoom.get(room.id) || [] }));
}

function getAvailableRooms() {
  autoUpdateRoomStatuses();
  return queryAll("SELECT * FROM rooms WHERE status IN ('متاحة', 'محجوزة') ORDER BY CAST(room_number AS INTEGER) ASC, room_number ASC");
}

function updateRoomStatus(roomId, status) {
  const targetId = parseInt(roomId, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الغرفة غير صالح.');
  }

  const currentRoom = queryOne("SELECT room_number, status FROM rooms WHERE id = ?", [targetId]);
  if (!currentRoom) {
    throw new Error('الغرفة غير موجودة.');
  }

  // An active reservation remains occupied until its status changes from 'مؤكد'.
  const today = getLocalDateString();
  const activeRes = getActiveReservations(targetId, today)[0] || null;

  // Strict Lock: If the room is actively occupied by a guest today, reject manual changes away from 'مشغولة'
  const isManualReadyAction = currentRoom.status === 'تنظيف' && status === 'متاحة';
  if ((currentRoom.status === 'مشغولة' || activeRes) && status !== 'مشغولة' && !isManualReadyAction) {
    throw new Error(`لا يمكن تغيير حالة الغرفة رقم (${currentRoom.room_number}) يدوياً لأنها مشغولة بنزيل حالياً (حجز #${activeRes ? activeRes.id : ''}). يجب تسجيل مغادرة النزيل (Check-out) أولاً.`);
  }

  const stmt = db.prepare("UPDATE rooms SET status = ? WHERE id = ?");
  stmt.run([status, targetId]);
  stmt.free();
  saveToFile();
  return true;
}

function addRoom({ room_number, type, price_per_night, status = 'متاحة' }) {
  if (!room_number || !type || !price_per_night) {
    throw new Error('يرجى ملء جميع بيانات الغرفة (رقم الغرفة، النوع، والسعر).');
  }

  const existing = queryOne("SELECT id FROM rooms WHERE room_number = ?", [room_number.trim()]);
  if (existing) {
    throw new Error(`الغرفة رقم "${room_number}" مسجلة مسبقاً.`);
  }

  const stmt = db.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
  stmt.run([room_number.trim(), type.trim(), parseFloat(price_per_night) || 0.0, status]);
  stmt.free();
  saveToFile();

  return queryOne("SELECT * FROM rooms WHERE room_number = ?", [room_number.trim()]);
}

function updateRoom({ id, room_number, type, price_per_night, status = 'متاحة' }) {
  const targetId = parseInt(id, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الغرفة غير صالح.');
  }
  if (!room_number || !type || price_per_night === undefined || price_per_night === '') {
    throw new Error('يرجى ملء جميع بيانات الغرفة (رقم الغرفة، النوع، والسعر).');
  }

  const cleanNum = room_number.trim();
  const existing = queryOne("SELECT id FROM rooms WHERE room_number = ? AND id != ?", [cleanNum, targetId]);
  if (existing) {
    throw new Error(`الغرفة رقم "${cleanNum}" مسجلة بالفعل لغرفة أخرى.`);
  }

  const currentRoom = queryOne("SELECT room_number, status FROM rooms WHERE id = ?", [targetId]);
  if (!currentRoom) {
    throw new Error('الغرفة غير موجودة.');
  }

  // An active reservation remains occupied until its status changes from 'مؤكد'.
  const today = getLocalDateString();
  const activeRes = getActiveReservations(targetId, today)[0] || null;

  let finalStatus = status;
  // If the room is currently occupied by an active guest today, lock the status to 'مشغولة'
  const isManualReadyAction = currentRoom.status === 'تنظيف' && status === 'متاحة';
  if ((currentRoom.status === 'مشغولة' || activeRes) && !isManualReadyAction) {
    if (status !== 'مشغولة') {
      throw new Error(`لا يمكن تغيير حالة الغرفة (${cleanNum}) إلى "${status}" لأنها مشغولة بنزيل حالياً (حجز #${activeRes ? activeRes.id : ''}). يجب تسجيل المغادرة أولاً.`);
    }
    finalStatus = 'مشغولة';
  }

  const stmt = db.prepare("UPDATE rooms SET room_number = ?, type = ?, price_per_night = ?, status = ? WHERE id = ?");
  stmt.run([cleanNum, type.trim(), parseFloat(price_per_night) || 0.0, finalStatus, targetId]);
  stmt.free();
  saveToFile();

  return queryOne("SELECT * FROM rooms WHERE id = ?", [targetId]);
}

function deleteRoom(roomId) {
  const targetId = parseInt(roomId, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الغرفة غير صالح.');
  }

  // Check if room has active or historical reservations to protect data integrity
  const existingRes = queryOne("SELECT id, status FROM reservations WHERE room_id = ? LIMIT 1", [targetId]);
  if (existingRes) {
    if (existingRes.status === 'مؤكد') {
      throw new Error('لا يمكن حذف هذه الغرفة لأنها مرتبطة بحجز نشط حالياً. يرجى إنهاء أو إلغاء الحجز أولاً.');
    } else {
      throw new Error('لا يمكن حذف هذه الغرفة لوجود سجل حجوزات مرتبط بها. يمكنك تغيير حالتها إلى "صيانة" بدلاً من حذفها للحفاظ على السجلات المالية والتاريخية.');
    }
  }

  const stmt = db.prepare("DELETE FROM rooms WHERE id = ?");
  stmt.run([targetId]);
  stmt.free();
  saveToFile();
  return true;
}

/** Confirmed reservations whose arrival date has started remain active regardless of checkout date. */
function getActiveReservations(roomId = null, currentDate) {
  const today = currentDate || getLocalDateString();
  const roomCondition = roomId === null || roomId === undefined ? '' : 'AND r.room_id = ?';
  const params = roomId === null || roomId === undefined ? [today] : [today, roomId];
  return queryAll(`
    SELECT r.id, r.room_id, r.guest_id, r.check_in_date, r.check_out_date,
           r.total_price, r.paid_amount, r.deposit_amount,
           COALESCE((SELECT SUM(CASE WHEN dm.movement_type IN ('collected', 'reconciled') THEN dm.amount ELSE -dm.amount END) FROM deposit_movements dm WHERE dm.reservation_id = r.id), 0) AS deposit_ledger_balance,
           CASE WHEN NOT EXISTS (SELECT 1 FROM deposit_movements dm WHERE dm.reservation_id = r.id) AND r.deposit_amount > 0 THEN 1 ELSE 0 END AS deposit_legacy_unreconciled,
           r.payment_status, r.status, r.booking_type,
           r.custom_nightly_price, r.discount_amount, r.created_at,
           g.name AS guest_name, g.phone AS guest_phone, g.id_number AS guest_id_number
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    WHERE r.status = 'مؤكد'
      AND r.check_in_date <= ?
      ${roomCondition}
    ORDER BY r.room_id ASC, r.check_in_date ASC, r.id ASC
  `, params);
}

/**
 * Automated Room Status Updater:
 * - Cleaning stays stored as cleaning for a same-day incoming guest until staff marks it ready.
 * - A confirmed guest who arrived before today and has not checked out keeps the room occupied.
 * - Active confirmed reservations (arrival <= today) set rooms to occupied.
 * - Confirmed future arrivals set rooms to reserved.
 * - Checkout dates alone never set or clear room status.
 */
function autoUpdateRoomStatuses(currentDate) {
  const today = currentDate || getLocalDateString();

  const activeReservations = getActiveReservations(null, today);
  const occupiedRoomIds = new Set(activeReservations.map(r => r.room_id));
  const activeByRoom = new Map();
  for (const reservation of activeReservations) {
    if (!activeByRoom.has(reservation.room_id)) activeByRoom.set(reservation.room_id, []);
    activeByRoom.get(reservation.room_id).push(reservation);
  }

  // 2. Future reservations: check_in_date > today (not yet arrived)
  const futureSql = `
    SELECT DISTINCT room_id 
    FROM reservations 
    WHERE status = 'مؤكد' 
      AND check_in_date > ?
  `;
  const futureRows = queryAll(futureSql, [today]);
  const futureRoomIds = new Set(futureRows.map(r => r.room_id));

  const allRooms = queryAll("SELECT id, status FROM rooms");
  let occupiedCount = 0;
  let hasStatusChanges = false;

  for (const room of allRooms) {
    let targetStatus = room.status;
    const roomActiveReservations = activeByRoom.get(room.id) || [];
    const hasGuestAlreadyArrived = roomActiveReservations.some(reservation => reservation.check_in_date < today);

    // Preserve cleaning and maintenance statuses when room is not occupied
    if (room.status === 'صيانة' && !occupiedRoomIds.has(room.id)) {
      targetStatus = 'صيانة';
    } else if (room.status === 'تنظيف' && !hasGuestAlreadyArrived) {
      targetStatus = 'تنظيف';
    } else if (occupiedRoomIds.has(room.id)) {
      targetStatus = 'مشغولة';
    } else if (futureRoomIds.has(room.id)) {
      targetStatus = 'محجوزة';
    } else {
      targetStatus = 'متاحة';
    }

    if (targetStatus === 'مشغولة') occupiedCount++;
    if (targetStatus !== room.status) {
      db.run("UPDATE rooms SET status = ? WHERE id = ?", [targetStatus, room.id]);
      hasStatusChanges = true;
    }
  }

  if (hasStatusChanges) saveToFile();
  return {
    success: true,
    date: today,
    occupiedCount,
    reservedCount: futureRoomIds.size
  };
}

/**
 * Room-specific Revenue & Occupancy History Report
 * Returns total expected, total collected (ledger-based), per-reservation-first outstanding,
 * and complete chronological breakdown.
 */
function getRoomRevenueStats(roomId) {
  const targetId = parseInt(roomId, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الغرفة غير صالح.');
  }

  const room = queryOne("SELECT id, room_number, type, price_per_night, status FROM rooms WHERE id = ?", [targetId]);
  if (!room) {
    throw new Error('الغرفة غير موجودة.');
  }

  // 1. Query non-cancelled reservations for this room
  // Include 'ملغي جزئي' with its pro-rated total_price, exclude 'ملغي'
  const reservations = queryAll(`
    SELECT 
      r.id,
      r.guest_id,
      r.room_id,
      r.check_in_date,
      r.check_out_date,
      r.total_price,
      r.paid_amount,
      r.payment_method,
      r.payment_status,
      r.status,
      r.booking_type,
      g.name AS guest_name,
      g.phone AS guest_phone
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.room_id = ?
      AND r.status != 'ملغي'
    ORDER BY r.check_in_date DESC, r.id DESC
  `, [targetId]);

  // 2. Query payments ledger table for payments tied to this room's non-cancelled reservations
  const paymentsForRoom = queryAll(`
    SELECT p.id, p.reservation_id, p.amount
    FROM payments p
    JOIN reservations r ON p.reservation_id = r.id
    WHERE r.room_id = ?
      AND r.status != 'ملغي'
  `, [targetId]);

  const payByRes = {};
  let total_collected = 0;
  for (const p of paymentsForRoom) {
    const amt = roundMoney(p.amount || 0);
    total_collected += amt;
    payByRes[p.reservation_id] = roundMoney((payByRes[p.reservation_id] || 0) + amt);
  }
  total_collected = roundMoney(total_collected);

  // 3. Per-reservation-first calculation for total_expected and total_outstanding
  let total_expected = 0;
  let total_outstanding = 0;
  const breakdown = [];

  for (const r of reservations) {
    if (r.status === 'ملغي') continue;

    const price = roundMoney(r.total_price || 0);
    const paid = roundMoney(r.paid_amount || 0);
    const collected = roundMoney(payByRes[r.id] || 0);

    total_expected += price;
    total_outstanding += Math.max(0, roundMoney(price - paid));

    breakdown.push({
      id: r.id,
      guest_name: r.guest_name,
      guest_phone: r.guest_phone,
      check_in_date: r.check_in_date,
      check_out_date: r.check_out_date, // 'مفتوح' as-is for open contracts
      total_price: price,
      paid_amount: paid,
      amount_collected: collected,
      status: r.status,
      booking_type: r.booking_type || 'عادي'
    });
  }

  total_expected = roundMoney(total_expected);
  total_outstanding = roundMoney(total_outstanding);
  const total_reservations = breakdown.length;

  return {
    room,
    total_expected,
    total_collected,
    total_outstanding,
    total_reservations,
    breakdown
  };
}

module.exports = {
  getAllRooms,
  getAvailableRooms,
  updateRoomStatus,
  addRoom,
  updateRoom,
  deleteRoom,
  autoUpdateRoomStatuses,
  getRoomRevenueStats
};
