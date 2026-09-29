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
  return queryAll("SELECT * FROM rooms ORDER BY CAST(room_number AS INTEGER) ASC, room_number ASC");
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

  // Check if room has an active confirmed reservation TODAY (check_in_date <= today AND (check_out_date IS NULL OR check_out_date = '' OR check_out_date > today))
  const today = getLocalDateString();
  const activeRes = queryOne(
    "SELECT id FROM reservations WHERE room_id = ? AND status = 'مؤكد' AND check_in_date <= ? AND (check_out_date IS NULL OR check_out_date = '' OR check_out_date > ?)",
    [targetId, today, today]
  );

  // Strict Lock: If the room is actively occupied by a guest today, reject manual changes away from 'مشغولة'
  if ((currentRoom.status === 'مشغولة' || activeRes) && status !== 'مشغولة') {
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

  // Check if room has an active confirmed reservation TODAY
  const today = getLocalDateString();
  const activeRes = queryOne(
    "SELECT id FROM reservations WHERE room_id = ? AND status = 'مؤكد' AND check_in_date <= ? AND (check_out_date IS NULL OR check_out_date = '' OR check_out_date > ?)",
    [targetId, today, today]
  );

  let finalStatus = status;
  // If the room is currently occupied by an active guest today, lock the status to 'مشغولة'
  if (currentRoom.status === 'مشغولة' || activeRes) {
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

  // Check if room has active reservations
  const activeRes = queryOne("SELECT id FROM reservations WHERE room_id = ? AND status = 'مؤكد'", [targetId]);
  if (activeRes) {
    throw new Error('لا يمكن حذف هذه الغرفة لأنها مرتبطة بحجز نشط حالياً. يرجى إنهاء أو إلغاء الحجز أولاً.');
  }

  const stmt = db.prepare("DELETE FROM rooms WHERE id = ?");
  stmt.run([targetId]);
  stmt.free();
  saveToFile();
  return true;
}

/**
 * Automated Room Status Updater:
 * - 'مشغولة' (Occupied): active reservation where CURRENT_DATE >= check_in_date AND CURRENT_DATE < check_out_date
 * - 'محجوزة' (Reserved): confirmed reservation where check_in_date > CURRENT_DATE (and not occupied today)
 * - 'تنظيف' (Cleaning): stays where check_out_date <= CURRENT_DATE or room was manually marked for cleaning
 * - 'متاحة' (Available): no active or future confirmed reservations, and not in cleaning
 */
function autoUpdateRoomStatuses(currentDate) {
  const today = currentDate || getLocalDateString();

  // 1. Actively occupied rooms today: check_in_date <= today AND (check_out_date IS NULL OR check_out_date = '' OR check_out_date > today)
  const occupiedSql = `
    SELECT DISTINCT room_id 
    FROM reservations 
    WHERE status = 'مؤكد' 
      AND check_in_date <= ? 
      AND (check_out_date IS NULL OR check_out_date = '' OR check_out_date > ?)
  `;
  const occupiedRows = queryAll(occupiedSql, [today, today]);
  const occupiedRoomIds = new Set(occupiedRows.map(r => r.room_id));

  // 2. Future reservations: check_in_date > today (not yet arrived)
  const futureSql = `
    SELECT DISTINCT room_id 
    FROM reservations 
    WHERE status = 'مؤكد' 
      AND check_in_date > ?
  `;
  const futureRows = queryAll(futureSql, [today]);
  const futureRoomIds = new Set(futureRows.map(r => r.room_id));

  // 3. Checkouts that passed or today: check_out_date <= today (only when check_out_date is set and non-empty)
  const checkoutSql = `
    SELECT DISTINCT room_id 
    FROM reservations 
    WHERE status = 'مكتمل' OR (status = 'مؤكد' AND check_out_date IS NOT NULL AND check_out_date != '' AND check_out_date <= ?)
  `;
  const checkoutRows = queryAll(checkoutSql, [today]);
  const checkoutRoomIds = new Set(checkoutRows.map(r => r.room_id));

  const allRooms = queryAll("SELECT id, status FROM rooms");

  for (const room of allRooms) {
    let targetStatus = room.status;

    if (occupiedRoomIds.has(room.id)) {
      targetStatus = 'مشغولة';
    } else if (room.status === 'تنظيف') {
      targetStatus = 'تنظيف';
    } else if (checkoutRoomIds.has(room.id) && room.status === 'مشغولة') {
      targetStatus = 'تنظيف';
    } else if (futureRoomIds.has(room.id)) {
      targetStatus = 'محجوزة';
    } else {
      targetStatus = 'متاحة';
    }

    if (targetStatus !== room.status) {
      db.run("UPDATE rooms SET status = ? WHERE id = ?", [targetStatus, room.id]);
    }
  }

  saveToFile();
  return { success: true, date: today, occupiedCount: occupiedRoomIds.size, reservedCount: futureRoomIds.size };
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
