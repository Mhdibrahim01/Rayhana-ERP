/**
 * نظام أحمد لإدارة الفنادق (Ahmed Hotel ERP)
 * Reports, Analytics, Daily Shifts & Checkouts Module
 */

const { db, queryOne, queryAll, roundMoney, getLocalDateString } = require('./connection');
const { autoUpdateRoomStatuses } = require('./rooms');

/**
 * Queries reservations where check_out_date strictly equals today's date.
 * Strictly joins Guests and Rooms tables.
 */
function getTodayCheckouts(targetDate) {
  const today = targetDate || getLocalDateString();
  const sql = `
    SELECT 
      r.id,
      r.guest_id,
      r.room_id,
      r.check_in_date,
      r.check_out_date,
      r.total_price,
      r.status,
      r.checked_out_at,
      r.created_at,
      strftime('%H:%M', r.created_at, 'localtime') AS booking_time,
      strftime('%H:%M', r.checked_out_at, 'localtime') AS checkout_time,
      g.name AS guest_name,
      g.phone AS guest_phone,
      g.id_number AS guest_id_number,
      rm.room_number,
      rm.type AS room_type,
      rm.status AS room_status
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    WHERE DATE(r.check_out_date) = DATE(?)
    ORDER BY rm.room_number ASC
  `;
  return queryAll(sql, [today]);
}

/**
 * Analytics Data: Monthly Revenue (Expected vs Collected)
 * Returns month-by-month financial summary:
 * - expected: SUM(total_price) for reservations created that month, excluding 'ملغي' (includes 'ملغي جزئي' at pro-rated value)
 * - collected: SUM(payments.amount) from payments ledger grouped by payment_date month (excluding 'ملغي')
 * Uses date(created_at, 'localtime') for accurate local-time monthly grouping.
 */
function getMonthlyRevenue() {
  const sql = `
    WITH expected_monthly AS (
      SELECT 
        strftime('%Y-%m', date(created_at, 'localtime')) AS month,
        SUM(total_price) AS expected
      FROM reservations
      WHERE status != 'ملغي'
        AND created_at IS NOT NULL
        AND created_at != ''
      GROUP BY month
    ),
    collected_monthly AS (
      SELECT 
        strftime('%Y-%m', p.payment_date) AS month,
        SUM(p.amount) AS collected
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE r.status != 'ملغي'
        AND p.payment_date IS NOT NULL
        AND p.payment_date != ''
      GROUP BY month
    ),
    all_months AS (
      SELECT month FROM expected_monthly WHERE month IS NOT NULL
      UNION
      SELECT month FROM collected_monthly WHERE month IS NOT NULL
    )
    SELECT 
      m.month,
      COALESCE(e.expected, 0) AS expected,
      COALESCE(c.collected, 0) AS collected
    FROM all_months m
    LEFT JOIN expected_monthly e ON m.month = e.month
    LEFT JOIN collected_monthly c ON m.month = c.month
    ORDER BY m.month ASC
  `;
  const rows = queryAll(sql);
  return rows.map(r => ({
    month: r.month,
    expected: roundMoney(r.expected || 0),
    collected: roundMoney(r.collected || 0)
  }));
}

/**
 * Dashboard KPIs & Summary
 */
function getDashboardStats() {
  autoUpdateRoomStatuses();
  const totalRooms = queryOne("SELECT COUNT(*) AS c FROM rooms")?.c || 0;
  const availableRooms = queryOne("SELECT COUNT(*) AS c FROM rooms WHERE status = 'متاحة'")?.c || 0;
  const occupiedRooms = queryOne("SELECT COUNT(*) AS c FROM rooms WHERE status = 'مشغولة'")?.c || 0;
  const reservedRooms = queryOne("SELECT COUNT(*) AS c FROM rooms WHERE status = 'محجوزة'")?.c || 0;
  const cleaningRooms = queryOne("SELECT COUNT(*) AS c FROM rooms WHERE status = 'تنظيف'")?.c || 0;

  const totalReservations = queryOne("SELECT COUNT(*) AS c FROM reservations")?.c || 0;
  const activeReservations = queryOne("SELECT COUNT(*) AS c FROM reservations WHERE status = 'مؤكد'")?.c || 0;
  const totalRevenue = queryOne("SELECT SUM(total_price) AS sum FROM reservations WHERE status != 'ملغي'")?.sum || 0;
  const totalGuests = queryOne("SELECT COUNT(*) AS c FROM guests")?.c || 0;

  return {
    totalRooms,
    availableRooms,
    occupiedRooms,
    reservedRooms,
    cleaningRooms,
    totalReservations,
    activeReservations,
    totalRevenue,
    totalGuests
  };
}

/**
 * Shift Audit & Night Closing Report Data Provider
 * Supports date ranges (startDate, endDate) with day-by-day trend breakdown.
 * If endDate is omitted or same as startDate, behaves as exact single-day report.
 * Uses real, timestamped payments ledger table to compute daily collections accurately.
 */
function getShiftAuditReport(startDate, endDate) {
  const today = getLocalDateString();
  const start = (startDate && typeof startDate === 'string' && startDate.trim() !== '') ? startDate.trim() : today;
  const end = (endDate && typeof endDate === 'string' && endDate.trim() !== '') ? endDate.trim() : start;

  const dateFrom = start <= end ? start : end;
  const dateTo = start <= end ? end : start;
  const isRange = dateFrom !== dateTo;

  // 1. Query actual ledger payments collected in date range
  const paymentsInRange = queryAll(`
    SELECT 
      p.id,
      p.receipt_number,
      p.reservation_id,
      p.amount,
      p.payment_method,
      p.payment_date,
      p.notes,
      r.id AS res_id,
      g.name AS guest_name,
      rm.room_number,
      rm.type AS room_type,
      u.username AS staff_username
    FROM payments p
    JOIN reservations r ON p.reservation_id = r.id
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE DATE(p.payment_date) BETWEEN DATE(?) AND DATE(?)
      AND r.status != 'ملغي'
    ORDER BY p.id DESC
  `, [dateFrom, dateTo]);

  let totalRevenue = 0;
  let cashTotal = 0;
  let cardTotal = 0;
  let transferTotal = 0;

  for (const p of paymentsInRange) {
    const amt = roundMoney(p.amount || 0);
    totalRevenue += amt;

    if (p.payment_method === 'نقداً') {
      cashTotal += amt;
    } else if (p.payment_method === 'بطاقة / مدى') {
      cardTotal += amt;
    } else if (p.payment_method === 'تحويل بنكي') {
      transferTotal += amt;
    } else {
      cashTotal += amt;
    }
  }

  totalRevenue = roundMoney(totalRevenue);
  cashTotal = roundMoney(cashTotal);
  cardTotal = roundMoney(cardTotal);
  transferTotal = roundMoney(transferTotal);

  // 2. Reservations active, created, checked-in, or checked-out in date range
  // Range overlap: check_in_date <= dateTo AND (check_out_date >= dateFrom OR check_out_date IS NULL OR check_out_date = 'مفتوح' OR check_out_date = '')
  const reservationsInRange = queryAll(`
    SELECT r.*, g.name AS guest_name, rm.room_number, rm.type AS room_type
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    WHERE (
       (DATE(r.created_at, 'localtime') BETWEEN DATE(?) AND DATE(?))
       OR (r.check_in_date BETWEEN ? AND ?)
       OR (r.check_out_date != 'مفتوح' AND r.check_out_date BETWEEN ? AND ?)
       OR (r.check_in_date <= ? AND (r.check_out_date >= ? OR r.check_out_date IS NULL OR r.check_out_date = 'مفتوح' OR r.check_out_date = '') AND r.status = 'مؤكد')
    )
    AND r.status != 'ملغي'
    ORDER BY r.id DESC
  `, [dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo, dateTo, dateFrom]);

  let depositTotal = 0;
  let expectedTotal = 0;
  let outstandingTotal = 0;
  for (const r of reservationsInRange) {
    depositTotal += roundMoney(r.deposit_amount || 0);
    if (r.status === 'ملغي') continue;
    const price = roundMoney(r.total_price || 0);
    const paid = roundMoney(r.paid_amount || 0);
    expectedTotal += price;
    outstandingTotal += Math.max(0, roundMoney(price - paid));
  }
  depositTotal = roundMoney(depositTotal);
  expectedTotal = roundMoney(expectedTotal);
  outstandingTotal = roundMoney(outstandingTotal);

  // 3. Movements (Check-ins & Check-outs in range)
  const checkinsInRange = queryOne(`
    SELECT COUNT(*) AS count 
    FROM reservations 
    WHERE check_in_date BETWEEN ? AND ? 
      AND status != 'ملغي'
  `, [dateFrom, dateTo])?.count || 0;

  const checkoutsInRange = queryOne(`
    SELECT COUNT(*) AS count 
    FROM reservations 
    WHERE check_out_date != 'مفتوح' 
      AND check_out_date BETWEEN ? AND ?
  `, [dateFrom, dateTo])?.count || 0;

  // 4. Room status distribution (CURRENT real-time snapshot, not historical)
  const allRooms = queryAll("SELECT status FROM rooms");
  const totalRooms = allRooms.length;
  const occupiedCount = allRooms.filter(r => r.status === 'مشغولة').length;
  const availableCount = allRooms.filter(r => r.status === 'متاحة').length;
  const cleaningCount = allRooms.filter(r => r.status === 'تنظيف').length;
  const maintenanceCount = allRooms.filter(r => r.status === 'صيانة').length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

  // 5. Day-by-Day Breakdown Array (mini trend for range)
  const revByDate = {};
  for (const p of paymentsInRange) {
    const pDate = p.payment_date ? p.payment_date.substring(0, 10) : '';
    if (pDate) {
      revByDate[pDate] = roundMoney((revByDate[pDate] || 0) + Number(p.amount || 0));
    }
  }

  const checkinsByDayRows = queryAll(`
    SELECT check_in_date AS d, COUNT(*) AS count
    FROM reservations
    WHERE check_in_date BETWEEN ? AND ?
      AND status != 'ملغي'
    GROUP BY check_in_date
  `, [dateFrom, dateTo]);
  const checkinsByDay = {};
  for (const r of checkinsByDayRows) {
    checkinsByDay[r.d] = r.count;
  }

  const checkoutsByDayRows = queryAll(`
    SELECT check_out_date AS d, COUNT(*) AS count
    FROM reservations
    WHERE check_out_date != 'مفتوح'
      AND check_out_date BETWEEN ? AND ?
    GROUP BY check_out_date
  `, [dateFrom, dateTo]);
  const checkoutsByDay = {};
  for (const r of checkoutsByDayRows) {
    checkoutsByDay[r.d] = r.count;
  }

  const dailyBreakdown = [];
  const startD = new Date(dateFrom + 'T00:00:00');
  const endD = new Date(dateTo + 'T00:00:00');
  let cur = new Date(startD);
  while (cur <= endD) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dStr = `${yyyy}-${mm}-${dd}`;

    dailyBreakdown.push({
      date: dStr,
      check_ins_count: checkinsByDay[dStr] || 0,
      check_outs_count: checkoutsByDay[dStr] || 0,
      revenue: roundMoney(revByDate[dStr] || 0)
    });

    cur.setDate(cur.getDate() + 1);
  }

  return {
    date: isRange ? `${dateFrom} إلى ${dateTo}` : dateFrom,
    startDate: dateFrom,
    endDate: dateTo,
    isRange,
    financials: {
      totalRevenue,
      cashTotal,
      cardTotal,
      transferTotal,
      depositTotal,
      expectedTotal,
      outstandingTotal
    },
    expectedTotal,
    outstandingTotal,
    movements: {
      checkinsToday: checkinsInRange,
      checkoutsToday: checkoutsInRange,
      totalCheckins: checkinsInRange,
      totalCheckouts: checkoutsInRange,
      totalReservationsToday: reservationsInRange.length,
      totalPaymentsCount: paymentsInRange.length
    },
    rooms: {
      totalRooms,
      occupiedCount,
      availableCount,
      cleaningCount,
      maintenanceCount,
      occupancyRate
    },
    dailyBreakdown,
    payments: paymentsInRange,
    transactions: reservationsInRange
  };
}

module.exports = {
  getTodayCheckouts,
  getMonthlyRevenue,
  getDashboardStats,
  getShiftAuditReport
};
