/**
 * نظام أحمد لإدارة الفنادق (Ahmed Hotel ERP)
 * Reservations Management, Payments Ledger & Check-in/out Module
 */

const { db, queryOne, queryAll, saveToFile, roundMoney, getLocalDateString } = require('./connection');

const RESERVATION_LIST_SQL = `
  SELECT
    r.id,
    r.guest_id,
    r.room_id,
    r.check_in_date,
    r.check_out_date,
    r.total_price,
    r.paid_amount,
    r.deposit_amount,
    r.payment_method,
    r.payment_status,
    r.status,
    r.booking_type,
    r.custom_nightly_price,
    r.discount_amount,
    r.discount_reason,
    r.original_calculated_charge,
    r.checked_out_at,
    r.created_at,
    strftime('%H:%M', r.created_at, 'localtime') AS booking_time,
    strftime('%H:%M', r.checked_out_at, 'localtime') AS checkout_time,
    g.name AS guest_name,
    g.phone AS guest_phone,
    g.id_number AS guest_id_number,
    rm.room_number,
    rm.type AS room_type,
    rm.price_per_night
  FROM reservations r
  JOIN guests g ON r.guest_id = g.id
  JOIN rooms rm ON r.room_id = rm.id
`;

function buildReservationListFilter({ search = '', status = 'all' } = {}) {
  const conditions = [];
  const params = [];

  if (status === 'ملغي') {
    conditions.push("r.status IN ('ملغي', 'ملغي جزئي')");
  } else if (['مؤكد', 'مكتمل'].includes(status)) {
    conditions.push('r.status = ?');
    params.push(status);
  }

  const normalizedSearch = String(search || '').trim().slice(0, 120);
  if (normalizedSearch) {
    const escapedSearch = normalizedSearch.replace(/[\\%_]/g, '\\$&');
    const like = `%${escapedSearch}%`;
    conditions.push(`(
      CAST(r.id AS TEXT) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(g.name, '')) LIKE ? ESCAPE '\\'
      OR CAST(COALESCE(rm.room_number, '') AS TEXT) LIKE ? ESCAPE '\\'
      OR COALESCE(g.phone, '') LIKE ? ESCAPE '\\'
      OR COALESCE(g.id_number, '') LIKE ? ESCAPE '\\'
    )`);
    params.push(like, like, like, like, like);
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

/**
 * Reservation Functions
 */
function getAllReservations() {
  return queryAll(`${RESERVATION_LIST_SQL} ORDER BY r.id DESC`);
}

function getReservationsPage({ page = 1, pageSize = 50, search = '', status = 'all', exportAll = false } = {}) {
  const normalizedPageSize = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 50));
  const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
  const filter = buildReservationListFilter({ search, status });
  const count = queryOne(
    `SELECT COUNT(*) AS total FROM reservations r JOIN guests g ON r.guest_id = g.id JOIN rooms rm ON r.room_id = rm.id ${filter.sql}`,
    filter.params
  );
  const total = Number(count?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const effectivePage = Math.min(normalizedPage, totalPages);
  const paginationSql = exportAll ? '' : 'LIMIT ? OFFSET ?';
  const paginationParams = exportAll
    ? []
    : [normalizedPageSize, (effectivePage - 1) * normalizedPageSize];
  const rows = queryAll(
    `${RESERVATION_LIST_SQL} ${filter.sql} ORDER BY r.id DESC ${paginationSql}`,
    [...filter.params, ...paginationParams]
  );

  return {
    rows,
    total,
    page: effectivePage,
    pageSize: normalizedPageSize,
    totalPages
  };
}

function getReservationById(reservationId) {
  const sql = `
    SELECT 
      r.id, 
      r.guest_id, 
      r.room_id, 
      r.check_in_date, 
      r.check_out_date, 
      r.total_price, 
      r.paid_amount,
      r.deposit_amount,
      r.payment_method,
      r.payment_status,
      r.status, 
      r.booking_type,
      r.custom_nightly_price,
      r.discount_amount,
      r.discount_reason,
      r.original_calculated_charge,
      r.checked_out_at,
      r.created_at,
      strftime('%H:%M', r.created_at, 'localtime') AS booking_time,
      strftime('%H:%M', r.checked_out_at, 'localtime') AS checkout_time,
      g.name AS guest_name, 
      g.phone AS guest_phone, 
      g.id_number AS guest_id_number,
      rm.room_number, 
      rm.type AS room_type, 
      rm.price_per_night
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    WHERE r.id = ?
  `;
  return queryOne(sql, [parseInt(reservationId, 10)]);
}

/**
 * Generate unique, sequential receipt number: REC-YYYY-XXXXX-XXXX
 */
function generateReceiptNumber(reservationId) {
  const year = new Date().getFullYear();
  const countRow = queryOne("SELECT COUNT(*) AS count FROM payments");
  const count = (countRow?.count || 0) + 1;
  return `REC-${year}-${String(reservationId).padStart(4, '0')}-${String(count).padStart(4, '0')}`;
}

function createReservation({
  guestName,
  guestPhone,
  guestIdNumber,
  roomId,
  checkInDate,
  checkOutDate,
  totalPrice,
  paidAmount = 0,
  depositAmount = 0,
  paymentMethod = 'نقداً',
  userId = null,
  bookingType = 'عادي',
  booking_type,
  customNightlyPrice = null,
  custom_nightly_price = null,
  discountAmount = 0,
  discount_amount = 0,
  discountReason = '',
  discount_reason = ''
}) {
  const normBookingType = (bookingType || booking_type || 'عادي').trim();
  const rawCustomPrice = customNightlyPrice !== null && customNightlyPrice !== undefined && customNightlyPrice !== ''
    ? customNightlyPrice
    : (custom_nightly_price !== null && custom_nightly_price !== undefined && custom_nightly_price !== '' ? custom_nightly_price : null);
  const normCustomNightlyPrice = rawCustomPrice !== null && !isNaN(parseFloat(rawCustomPrice)) && parseFloat(rawCustomPrice) >= 0
    ? roundMoney(rawCustomPrice)
    : null;

  const rawDiscount = discountAmount !== undefined && discountAmount !== null && discountAmount !== ''
    ? discountAmount
    : (discount_amount !== undefined && discount_amount !== null && discount_amount !== '' ? discount_amount : 0);
  const normDiscountAmount = Math.max(0, roundMoney(rawDiscount));
  const normDiscountReason = (discountReason || discount_reason || '').trim();

  if (!guestName || !guestName.trim()) {
    throw new Error('اسم النزيل مطلوب ولا يمكن تركه فارغاً.');
  }
  if (!roomId) {
    throw new Error('يرجى تحديد الغرفة المراد حجزها.');
  }

  const cleanPhone = (guestPhone || '').trim();
  if (cleanPhone && !/^05\d{8}$/.test(cleanPhone)) {
    throw new Error('رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).');
  }
  const cleanId = (guestIdNumber || '').trim();
  if (cleanId && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(cleanId)) {
    throw new Error('رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.');
  }

  const parsedRoomId = parseInt(roomId, 10);
  let computedCheckOutDate = checkOutDate ? checkOutDate.trim() : null;
  let total;
  const paid = roundMoney(paidAmount);
  const deposit = roundMoney(depositAmount);

  if (paid < 0) {
    throw new Error('المبلغ المدفوع لا يمكن أن يكون سالباً.');
  }

  if (normBookingType === 'عقد مفتوح') {
    // Open Contract: check_in_date required, check_out_date optional, total >= 0 (0 allowed)
    if (!checkInDate) {
      throw new Error('تاريخ الوصول مطلوب.');
    }
    if (computedCheckOutDate && computedCheckOutDate <= checkInDate) {
      throw new Error('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بشكل محدد.');
    }
    total = roundMoney(totalPrice || 0);
    if (total < 0) {
      throw new Error('قيمة الحجز لا يمكن أن تكون سالبة.');
    }
    // Upfront credit/overpayment is permitted for open contracts
  } else if (normBookingType === 'حجز شهري') {
    // Monthly Booking: auto-calculate checkOutDate as checkInDate + 30 days if not set
    if (!checkInDate) {
      throw new Error('تاريخ الوصول مطلوب لحساب موعد الإقامة الشهرية.');
    }

    const roomRow = queryOne("SELECT price_per_night FROM rooms WHERE id = ?", [parsedRoomId]);
    if (!roomRow) {
      throw new Error('الغرفة المحددة غير موجودة.');
    }

    const effectiveRate = normCustomNightlyPrice !== null ? normCustomNightlyPrice : roomRow.price_per_night;
    const baseTotal = roundMoney(effectiveRate * 30);
    total = Math.max(0, roundMoney(baseTotal - normDiscountAmount));
    if (totalPrice !== undefined && totalPrice !== null && !isNaN(parseFloat(totalPrice))) {
      const passedTotal = roundMoney(totalPrice);
      if (passedTotal >= 0) {
        total = passedTotal;
      }
    }

    if (!computedCheckOutDate) {
      const [y, m, d] = checkInDate.split('-').map(Number);
      const outDateObj = new Date(y, m - 1, d + 30);
      computedCheckOutDate = getLocalDateString(outDateObj);
    } else if (computedCheckOutDate <= checkInDate) {
      throw new Error('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بشكل محدد.');
    }

    if (total <= 0 && normDiscountAmount === 0) {
      throw new Error('إجمالي قيمة الحجز الشهري يجب أن يكون أكبر من الصفر.');
    }
    if (roundMoney(paid - total) > 0.005) {
      throw new Error(`المبلغ المدفوع (${paid} ريال) لا يمكن أن يتجاوز إجمالي قيمة الحجز (${total} ريال).`);
    }
  } else {
    // Regular Booking (عادي)
    if (!checkInDate || !computedCheckOutDate) {
      throw new Error('تاريخ الوصول وتاريخ المغادرة مطلوبان.');
    }
    if (computedCheckOutDate <= checkInDate) {
      throw new Error('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بشكل محدد.');
    }
    total = roundMoney(totalPrice);
    if (total < 0) {
      throw new Error('إجمالي قيمة الحجز لا يمكن أن يكون سالباً.');
    }
    if (total === 0 && normDiscountAmount === 0) {
      throw new Error('إجمالي قيمة الحجز يجب أن يكون أكبر من الصفر.');
    }
    if (roundMoney(paid - total) > 0.005) {
      throw new Error(`المبلغ المدفوع (${paid} ريال) لا يمكن أن يتجاوز إجمالي قيمة الحجز (${total} ريال).`);
    }
  }

  // Overlap & Collision Check: Prevent double-booking for the same room.
  // Decision: Open-ended contracts block the room until closed (effective checkout = '9999-12-31').
  const effectiveNewCheckout = (normBookingType === 'عقد مفتوح' && !computedCheckOutDate) ? '9999-12-31' : computedCheckOutDate;
  const conflict = queryOne(`
    SELECT r.id, r.check_in_date, r.check_out_date, r.booking_type, g.name AS guest_name
    FROM reservations r
    LEFT JOIN guests g ON r.guest_id = g.id
    WHERE r.room_id = ? 
      AND r.status = 'مؤكد'
      AND r.check_in_date < ? 
      AND COALESCE(NULLIF(r.check_out_date, ''), '9999-12-31') > ?
    LIMIT 1
  `, [parsedRoomId, effectiveNewCheckout, checkInDate]);

  if (conflict) {
    const conflictOutStr = conflict.check_out_date || 'مفتوح (غير محدد)';
    throw new Error(`الغرفة محجوزة بالفعل في الفترة المحددة: يوجد حجز مؤكد #${conflict.id} (${conflict.guest_name ? `النزيل: ${conflict.guest_name}، ` : ''}من ${conflict.check_in_date} إلى ${conflictOutStr}).`);
  }

  db.run("BEGIN TRANSACTION;");
  try {
    let guest = null;
    if (guestIdNumber) {
      guest = queryOne("SELECT id FROM guests WHERE id_number = ?", [guestIdNumber.trim()]);
    }
    if (!guest && guestPhone) {
      guest = queryOne("SELECT id FROM guests WHERE phone = ?", [guestPhone.trim()]);
    }

    let guestId;
    if (guest) {
      guestId = guest.id;
    } else {
      const guestStmt = db.prepare("INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)");
      guestStmt.run([guestName.trim(), cleanPhone, cleanId]);
      guestStmt.free();
      const newGuest = queryOne("SELECT id FROM guests ORDER BY id DESC LIMIT 1");
      guestId = newGuest.id;
    }

    const method = paymentMethod || 'نقداً';

    let paymentStatus = 'غير مدفوع';
    if (normBookingType === 'عقد مفتوح') {
      if (paid > total) {
        paymentStatus = 'رصيد دائن';
      } else if (paid === total && total > 0) {
        paymentStatus = 'مدفوع بالكامل';
      } else if (paid > 0) {
        paymentStatus = 'مدفوع جزئياً';
      }
    } else {
      if (paid >= total && total > 0) {
        paymentStatus = 'مدفوع بالكامل';
      } else if (paid > 0) {
        paymentStatus = 'مدفوع جزئياً';
      }
    }

    const resStmt = db.prepare(`
      INSERT INTO reservations (
        guest_id, room_id, check_in_date, check_out_date,
        total_price, paid_amount, deposit_amount, payment_method, payment_status, status,
        booking_type, custom_nightly_price, discount_amount, discount_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'مؤكد', ?, ?, ?, ?)
    `);
    resStmt.run([
      guestId,
      parsedRoomId,
      checkInDate,
      (computedCheckOutDate && computedCheckOutDate.trim()) ? computedCheckOutDate.trim() : '',
      total,
      paid,
      deposit,
      method,
      paymentStatus,
      normBookingType,
      normCustomNightlyPrice,
      normDiscountAmount,
      normDiscountReason
    ]);
    resStmt.free();

    const createdRes = queryOne("SELECT id FROM reservations ORDER BY id DESC LIMIT 1");
    const newReservationId = createdRes.id;

    // Record initial payment in the payments ledger table
    let receiptNumber = null;
    if (paid > 0) {
      receiptNumber = generateReceiptNumber(newReservationId);
      const payStmt = db.prepare(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, 'دفعة الحجز المبدئية عند تسجيل الوصول')
      `);
      payStmt.run([
        receiptNumber,
        newReservationId,
        paid,
        method,
        userId ? parseInt(userId, 10) : null
      ]);
      payStmt.free();
    }

    // Dynamic Room Status Evaluation:
    // Only mark room as 'مشغولة' if CURRENT_DATE >= check_in_date AND CURRENT_DATE < effectiveNewCheckout.
    // If check_in_date is in the future, mark as 'محجوزة' (unless it is already occupied today by another guest).
    const todayStr = getLocalDateString();
    let assignedRoomStatus = 'متاحة';
    const currentRoom = queryOne("SELECT status FROM rooms WHERE id = ?", [parsedRoomId]);

    if (checkInDate <= todayStr && effectiveNewCheckout > todayStr) {
      assignedRoomStatus = 'مشغولة';
    } else if (checkInDate > todayStr) {
      if (currentRoom && currentRoom.status === 'مشغولة') {
        assignedRoomStatus = 'مشغولة';
      } else {
        assignedRoomStatus = 'محجوزة';
      }
    }

    if (currentRoom && (currentRoom.status === 'متاحة' || currentRoom.status === 'محجوزة')) {
      const roomStmt = db.prepare("UPDATE rooms SET status = ? WHERE id = ?");
      roomStmt.run([assignedRoomStatus, parsedRoomId]);
      roomStmt.free();
    }

    db.run("COMMIT;");
    saveToFile();

    return { 
      success: true, 
      reservationId: newReservationId,
      receiptNumber 
    };
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (rbErr) {}
    throw err;
  }
}

function calculateCheckoutDiscount(discountAmount, actualNights, checkInDate, bookedCheckOutDate, baseCharge, prorate) {
  const normalizedDiscount = Math.max(0, roundMoney(discountAmount || 0));
  if (!normalizedDiscount || !baseCharge) return 0;

  let appliedDiscount = normalizedDiscount;
  if (prorate && checkInDate && bookedCheckOutDate && bookedCheckOutDate !== 'مفتوح') {
    const [startYear, startMonth, startDay] = String(checkInDate).slice(0, 10).split('-').map(Number);
    const [endYear, endMonth, endDay] = String(bookedCheckOutDate).slice(0, 10).split('-').map(Number);
    const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
    if (Number.isFinite(startUtc) && Number.isFinite(endUtc) && endUtc > startUtc) {
      const bookedNights = Math.max(1, Math.round((endUtc - startUtc) / 86400000));
      if (actualNights < bookedNights) {
        appliedDiscount = roundMoney(normalizedDiscount * actualNights / bookedNights);
      }
    }
  }

  return Math.min(roundMoney(baseCharge), appliedDiscount);
}

/**
 * computeCheckoutSettlement — read-only preview (writes nothing).
 *
 * Uses only the rate stored on the reservation (custom_nightly_price, else
 * price_per_night). No renderer-supplied rate override is accepted.
 * The caller (IPC layer) strips discountAmount for non-Admin users.
 *
 * @param {number|string} reservationId
 * @param {object}        opts
 * @param {number}        [opts.discountAmount]  – checkout discount (Admin only)
 * @param {string}        [opts.discountReason]
 * @returns {{
 *   reservationId, isOpenContract, checkInDate, actualCheckOutDate,
 *   actualNights, effectiveNightlyRate, baseCharge, discountApplied,
 *   netCharge, paidAmount, difference,
 *   needsCollection, needsRefund, isSettled
 * }}
 */
function computeCheckoutSettlement(reservationId, {
  discountAmount,
  discountReason
} = {}) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) throw new Error('معرف الحجز غير صالح.');

  const res = queryOne(`
    SELECT r.id, r.booking_type, r.check_in_date, r.check_out_date, r.total_price, r.paid_amount,
           r.custom_nightly_price, r.discount_amount, r.discount_reason, r.status,
           rm.price_per_night
    FROM reservations r
    LEFT JOIN rooms rm ON r.room_id = rm.id
    WHERE r.id = ?
  `, [targetId]);
  if (!res) throw new Error('الحجز غير موجود.');

  if (res.status === 'مكتمل' || res.status === 'ملغي' || res.status === 'ملغي جزئي') {
    throw new Error('لا يمكن احتساب تسوية لحجز مغلق بالفعل.');
  }

  const isOpenContract = res.booking_type === 'عقد مفتوح';
  const todayStr = getLocalDateString();

  // Effective nightly rate: stored custom rate, else room default.
  // No renderer-supplied rate override is accepted.
  const effectiveNightlyRate = roundMoney(res.custom_nightly_price || res.price_per_night || 0);

  // A stored reservation discount is allocated across the booked stay. An
  // explicit checkout discount is already for this settlement and is not prorated.
  const hasExplicitDiscount = discountAmount !== undefined && discountAmount !== null && discountAmount !== '' && !isNaN(Number(discountAmount));
  const normDiscount = hasExplicitDiscount
    ? Math.max(0, roundMoney(discountAmount))
    : roundMoney(res.discount_amount || 0);

  let actualNights = null;
  let baseCharge = null;
  let netCharge = null;
  let appliedDiscount = null;

  if (!isOpenContract) {
    const d1 = new Date(res.check_in_date + 'T00:00:00');
    const d2 = new Date(todayStr + 'T00:00:00');
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    actualNights = Math.max(1, diffDays);
    baseCharge = roundMoney(actualNights * effectiveNightlyRate);
    appliedDiscount = calculateCheckoutDiscount(
      normDiscount,
      actualNights,
      res.check_in_date,
      res.check_out_date,
      baseCharge,
      !hasExplicitDiscount
    );
    netCharge = Math.max(0, roundMoney(baseCharge - appliedDiscount));
  }

  const paidAmount = roundMoney(res.paid_amount || 0);
  const difference = isOpenContract ? null : roundMoney(netCharge - paidAmount);

  return {
    reservationId: targetId,
    isOpenContract,
    checkInDate: res.check_in_date,
    actualCheckOutDate: todayStr,
    actualNights,
    effectiveNightlyRate,
    baseCharge,
    discountApplied: appliedDiscount,
    netCharge,
    paidAmount,
    // difference > 0 → guest owes money
    // difference < 0 → guest overpaid (refund due)
    // difference = 0 → settled
    difference,
    needsCollection: difference !== null && difference > 0.005,
    needsRefund:     difference !== null && difference < -0.005,
    isSettled:       difference !== null && Math.abs(difference) <= 0.005
  };
}

function checkoutReservation(reservationId, {
  // Settlement choices from the renderer/IPC:
  //   settleMode:     'collect' | 'defer' (آجل) | 'refund' | 'credit'
  //   collectAmount:  amount collected now (mode='collect')
  //   refundAmount:   amount refunded now (mode='refund')
  //   paymentMethod:  method for payment or refund row
  //   discountAmount: checkout discount (Admin only – IPC strips for non-Admin)
  //   discountReason: required when discount > 0
  //   customNightlyPrice: override nightly rate (optional)
  //   userId:         acting user id
  settleMode,
  collectAmount,
  refundAmount,
  paymentMethod = 'نقداً',
  userId = null,
  discountAmount,
  discountReason,
  customNightlyPrice,
  // Legacy shim: the open-contract settle modal still passes these
  finalTotalPrice,
  settleAmount,
  notes
} = {}) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) throw new Error('معرف الحجز غير صالح.');

  const res = queryOne(`
    SELECT r.id, r.room_id, r.total_price, r.paid_amount, r.payment_status, r.booking_type,
           r.check_in_date, r.check_out_date, r.original_calculated_charge, r.status,
           r.custom_nightly_price, r.discount_amount, r.discount_reason,
           rm.price_per_night
    FROM reservations r
    LEFT JOIN rooms rm ON r.room_id = rm.id
    WHERE r.id = ?
  `, [targetId]);
  if (!res) throw new Error('الحجز غير موجود.');

  // Safety net: never close an already-closed reservation
  if (res.status === 'مكتمل' || res.status === 'ملغي' || res.status === 'ملغي جزئي') {
    throw new Error('الحجز مغلق بالفعل ولا يمكن تسجيل مغادرة جديدة له.');
  }

  const isOpenContract = res.booking_type === 'عقد مفتوح';

  // -------------------------------------------------------------------------
  // OPEN-CONTRACT PATH: unchanged from before.  Trust caller's finalTotalPrice,
  // use legacy shim fields (finalTotalPrice / settleAmount).
  // -------------------------------------------------------------------------
  if (isOpenContract) {
    db.run("BEGIN TRANSACTION;");
    try {
      const todayStr = getLocalDateString();
      const currentPaid = roundMoney(res.paid_amount || 0);

      const normDiscountAmount = (discountAmount !== undefined && discountAmount !== null && discountAmount !== '')
        ? Math.max(0, roundMoney(discountAmount)) : null;
      const normDiscountReason = discountReason !== undefined ? (discountReason || '').trim() : null;
      const normCustomNightlyPrice = (customNightlyPrice !== undefined && customNightlyPrice !== null && customNightlyPrice !== '')
        ? roundMoney(customNightlyPrice) : null;

      const openFinalTotal = (finalTotalPrice !== undefined && finalTotalPrice !== null)
        ? roundMoney(finalTotalPrice)
        : roundMoney(res.total_price || 0);

      const openAddPay = settleAmount !== undefined ? roundMoney(settleAmount) : 0;
      let openNewPaid = currentPaid;
      let openReceiptNumber = null;
      if (openAddPay > 0) {
        openNewPaid = roundMoney(currentPaid + openAddPay);
        openReceiptNumber = generateReceiptNumber(targetId);
        const ps = db.prepare(`INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes) VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)`);
        ps.run([openReceiptNumber, targetId, openAddPay, paymentMethod || 'نقداً', userId ? parseInt(userId, 10) : null, notes || 'سداد تصفية حساب مغادرة']);
        ps.free();
      }

      let openStatus = res.payment_status;
      if (openNewPaid > openFinalTotal + 0.005) openStatus = 'رصيد دائن';
      else if (openFinalTotal === 0 && openNewPaid === 0) openStatus = 'مدفوع بالكامل';
      else if (openNewPaid >= openFinalTotal) openStatus = 'مدفوع بالكامل';
      else if (openNewPaid > 0) openStatus = 'مدفوع جزئياً';
      else openStatus = 'غير مدفوع';

      const storedOrig = res.original_calculated_charge;
      const origToWrite = (storedOrig !== null && storedOrig !== undefined) ? null : roundMoney(res.total_price || 0);

      const s1 = db.prepare(`
        UPDATE reservations SET status='مكتمل', check_out_date=?, total_price=?, paid_amount=?,
          payment_status=?, payment_method=COALESCE(?,payment_method),
          discount_amount=CASE WHEN ? IS NOT NULL THEN ? ELSE discount_amount END,
          discount_reason=CASE WHEN ? IS NOT NULL THEN ? ELSE discount_reason END,
          custom_nightly_price=CASE WHEN ? IS NOT NULL THEN ? ELSE custom_nightly_price END,
          original_calculated_charge=CASE WHEN original_calculated_charge IS NULL THEN ? ELSE original_calculated_charge END,
          checked_out_at=datetime('now')
        WHERE id=?
      `);
      s1.run([todayStr, openFinalTotal, openNewPaid, openStatus,
        (openAddPay > 0 ? paymentMethod : null),
        normDiscountAmount, normDiscountAmount,
        normDiscountReason, normDiscountReason,
        normCustomNightlyPrice, normCustomNightlyPrice,
        origToWrite, targetId]);
      s1.free();

      const s2 = db.prepare("UPDATE rooms SET status='تنظيف' WHERE id=?");
      s2.run([res.room_id]);
      s2.free();

      db.run("COMMIT;");
    } catch (err) {
      try { db.run("ROLLBACK;"); } catch (_) {}
      throw err;
    }
    saveToFile();
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // NON-OPEN-CONTRACT PATH: full settlement logic.
  // -------------------------------------------------------------------------

  // Resolve discount and rate.
  // Rate: always from the stored reservation — no caller override accepted.
  // Discount: already stripped for non-Admin by the IPC layer.
  const normDiscountAmount = (discountAmount !== undefined && discountAmount !== null && discountAmount !== '' && !isNaN(Number(discountAmount)))
    ? Math.max(0, roundMoney(discountAmount))
    : null;
  const normDiscountReason = discountReason !== undefined ? (discountReason || '').trim() : null;

  const requestedDiscount = normDiscountAmount !== null
    ? normDiscountAmount
    : roundMoney(res.discount_amount || 0);
  // Stored rate only — finalTotalPrice from renderer is ignored for non-contract.
  const effectiveNightlyRate = roundMoney(res.custom_nightly_price || res.price_per_night || 0);

  // Discount validation: require a non-empty reason when discount > 0
  if (requestedDiscount > 0) {
    const reason = normDiscountReason !== null ? normDiscountReason : (res.discount_reason || '').trim();
    if (!reason) {
      throw new Error('يرجى إدخال سبب الخصم عند تطبيق خصم على المغادرة.');
    }
  }

  // Compute net charge from actual stay (backend-authoritative)
  const todayStr = getLocalDateString();
  const d1 = new Date(res.check_in_date + 'T00:00:00');
  const d2 = new Date(todayStr + 'T00:00:00');
  const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  const actualNights = Math.max(1, diffDays);
  const baseCharge = roundMoney(actualNights * effectiveNightlyRate);
  const effectiveDiscount = calculateCheckoutDiscount(
    requestedDiscount,
    actualNights,
    res.check_in_date,
    res.check_out_date,
    baseCharge,
    normDiscountAmount === null
  );
  const finalTotal = Math.max(0, roundMoney(baseCharge - effectiveDiscount));

  const currentPaid = roundMoney(res.paid_amount || 0);
  const difference = roundMoney(finalTotal - currentPaid);

  // Resolve settleMode from either new or legacy fields
  // Legacy: settleAmount >= 0 means 'collect now' if > 0 else 'defer'
  let resolvedMode = settleMode;
  if (!resolvedMode) {
    if (collectAmount !== undefined) {
      resolvedMode = (roundMoney(collectAmount) > 0) ? 'collect' : 'defer';
    } else if (refundAmount !== undefined) {
      resolvedMode = 'refund';
    } else if (settleAmount !== undefined) {
      resolvedMode = roundMoney(settleAmount) > 0 ? 'collect' : 'defer';
    } else {
      // No mode provided — caller must supply one when there is a non-zero difference
      if (Math.abs(difference) > 0.005) {
        throw new Error('يرجى تحديد طريقة تسوية الحساب (تحصيل، ترحيل، أو استرداد) قبل إتمام تسجيل المغادرة.');
      }
      resolvedMode = 'defer'; // difference ≈ 0, no payment row needed
    }
  }

  // Safety net: if paid > net and mode is not refund, block the close
  if (currentPaid > finalTotal + 0.005 && resolvedMode !== 'refund') {
    throw new Error(
      `المبلغ المدفوع (${currentPaid} ريال) يتجاوز الرسوم الصافية المستحقة (${finalTotal} ريال). ` +
      'يجب اختيار "استرداد" لإتمام تسجيل المغادرة.'
    );
  }

  // Safety net: if amount due and mode is not collect or defer, block
  if (finalTotal > currentPaid + 0.005 && resolvedMode !== 'collect' && resolvedMode !== 'defer') {
    throw new Error('يوجد مبلغ مستحق. يرجى اختيار "تحصيل الآن" أو "تأجيل (آجل)".');
  }

  // Preserve original booked total (written once, never overwritten)
  const storedOriginal = res.original_calculated_charge;
  const originalChargeToWrite = (storedOriginal !== null && storedOriginal !== undefined)
    ? null
    : roundMoney(res.total_price || 0);

  let newPaid = currentPaid;
  let collectionReceiptNumber = null;
  let refundReceiptNumber = null;
  let newPaymentStatus;

  db.run("BEGIN TRANSACTION;");
  try {
    const effMethod = paymentMethod || 'نقداً';
    const actingUser = userId ? parseInt(userId, 10) : null;

    if (resolvedMode === 'collect') {
      // Positive payment row: collectAmount must be > 0 and <= amount due
      const rawCollect = collectAmount !== undefined ? roundMoney(collectAmount)
        : (settleAmount !== undefined ? roundMoney(settleAmount) : 0);
      const amountDue = roundMoney(Math.max(0, finalTotal - currentPaid));
      if (rawCollect <= 0) {
        throw new Error('مبلغ التحصيل يجب أن يكون أكبر من الصفر.');
      }
      if (roundMoney(rawCollect - amountDue) > 0.005) {
        throw new Error(`مبلغ التحصيل (${rawCollect} ريال) يتجاوز المبلغ المستحق (${amountDue} ريال).`);
      }
      newPaid = roundMoney(currentPaid + rawCollect);
      collectionReceiptNumber = generateReceiptNumber(targetId);
      const ps = db.prepare(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
      `);
      ps.run([collectionReceiptNumber, targetId, rawCollect, effMethod, actingUser,
        `تحصيل عند المغادرة #${targetId}`]);
      ps.free();
      // Status
      if (newPaid >= finalTotal - 0.005) {
        newPaymentStatus = 'مدفوع بالكامل';
      } else if (newPaid > 0) {
        newPaymentStatus = 'مدفوع جزئياً';
      } else {
        newPaymentStatus = 'غير مدفوع';
      }

    } else if (resolvedMode === 'defer') {
      // No new payment row — debt stays on account
      newPaid = currentPaid;
      if (finalTotal === 0 && currentPaid === 0) {
        newPaymentStatus = 'مدفوع بالكامل';
      } else if (currentPaid >= finalTotal - 0.005) {
        newPaymentStatus = 'مدفوع بالكامل';
      } else if (currentPaid > 0) {
        newPaymentStatus = 'مدفوع جزئياً';
      } else {
        newPaymentStatus = 'غير مدفوع';
      }

    } else if (resolvedMode === 'refund') {
      // Negative payment row — exact mechanism of cancelReservation mid-stay.
      // refundAmount must equal exactly paid - net (roundMoney both sides).
      const exactRefundDue = roundMoney(Math.max(0, currentPaid - finalTotal));
      const rawRefund = refundAmount !== undefined
        ? roundMoney(refundAmount)
        : exactRefundDue;

      if (rawRefund <= 0) {
        throw new Error('مبلغ الاسترداد يجب أن يكون أكبر من الصفر.');
      }
      if (roundMoney(Math.abs(rawRefund - exactRefundDue)) > 0.005) {
        throw new Error(
          `مبلغ الاسترداد (${rawRefund} ريال) يجب أن يساوي الفرق الفعلي المستحق (${exactRefundDue} ريال).`
        );
      }
      refundReceiptNumber = generateReceiptNumber(targetId);
      const ps = db.prepare(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
      `);
      ps.run([refundReceiptNumber, targetId, -rawRefund, effMethod, actingUser,
        `استرداد - تسوية مغادرة #${targetId}`]);
      ps.free();
      newPaid = roundMoney(currentPaid - rawRefund);
      // After refund paid_amount == finalTotal → fully settled
      newPaymentStatus = 'مدفوع بالكامل';

    } else {
      throw new Error('طريقة تسوية الحساب غير معروفة.');
    }

    // Single UPDATE that includes checked_out_at (inside the transaction)
    // Store the amount actually applied to this completed stay so the receipt
    // and the checkout settlement use the same figures.
    const effectiveDiscountForWrite = effectiveDiscount;
    const effectiveReasonForWrite   = normDiscountReason !== null ? normDiscountReason : null;

    const stmt1 = db.prepare(`
      UPDATE reservations
      SET status = 'مكتمل',
          check_out_date = ?,
          total_price = ?,
          paid_amount = ?,
          payment_status = ?,
          payment_method = CASE WHEN ? IS NOT NULL THEN ? ELSE payment_method END,
          discount_amount = CASE WHEN ? IS NOT NULL THEN ? ELSE discount_amount END,
          discount_reason = CASE WHEN ? IS NOT NULL THEN ? ELSE discount_reason END,
          original_calculated_charge = CASE WHEN original_calculated_charge IS NULL THEN ? ELSE original_calculated_charge END,
          checked_out_at = datetime('now')
      WHERE id = ? AND status != 'مكتمل'
    `);

    const updateMethod = (resolvedMode === 'collect' || resolvedMode === 'refund') ? effMethod : null;

    stmt1.run([
      todayStr, finalTotal, newPaid, newPaymentStatus,
      updateMethod, updateMethod,
      effectiveDiscountForWrite, effectiveDiscountForWrite,
      effectiveReasonForWrite,   effectiveReasonForWrite,
      originalChargeToWrite,
      targetId
    ]);
    stmt1.free();

    // Room → cleaning
    const stmt2 = db.prepare("UPDATE rooms SET status = 'تنظيف' WHERE id = ?");
    stmt2.run([res.room_id]);
    stmt2.free();

    db.run("COMMIT;");
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (_) {}
    throw err;
  }

  saveToFile();
  return {
    success: true,
    finalTotal,
    actualNights,
    baseCharge,
    discountApplied: effectiveDiscount,
    paidAmount: newPaid,
    settleMode: resolvedMode,
    collectionReceiptNumber,
    refundReceiptNumber,
    difference
  };
}

/**
 * Extend an active reservation stay.
 * Checks room availability for the extension period.
 * Updates check_out_date, total_price, and optionally records payment.
 */
function extendReservation({
  reservationId,
  newCheckOutDate,
  customNightlyPrice,
  discountAmount = 0,
  additionalCost,
  settleAmount = 0,
  paymentMethod = 'نقداً',
  userId = null,
  notes = 'سداد دفعة تمديد إقامة'
}) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) throw new Error('معرف الحجز غير صالح.');

  const res = queryOne(`
    SELECT r.*, rm.room_number, rm.type AS room_type, rm.price_per_night, g.name AS guest_name
    FROM reservations r
    JOIN rooms rm ON r.room_id = rm.id
    JOIN guests g ON r.guest_id = g.id
    WHERE r.id = ?
  `, [targetId]);
  if (!res) throw new Error('الحجز غير موجود.');

  if (res.status === 'ملغي' || res.status === 'ملغي جزئي') {
    throw new Error('لا يمكن تمديد حجز ملغي.');
  }
  if (res.status === 'مكتمل') {
    throw new Error('لا يمكن تمديد حجز تم تسجيل مغادرته بالكامل.');
  }
  if (res.check_out_date === 'مفتوح') {
    throw new Error('حجوزات العقود المفتوحة ليس لها تاريخ مغادرة محدد ليتم تمديدها.');
  }

  const oldCheckOut = res.check_out_date;
  const cleanNewCheckOut = (newCheckOutDate || '').trim();
  if (!cleanNewCheckOut) {
    throw new Error('يرجى تحديد تاريخ المغادرة الجديد.');
  }
  if (cleanNewCheckOut <= oldCheckOut) {
    throw new Error(`تاريخ المغادرة الجديد (${cleanNewCheckOut}) يجب أن يكون بعد تاريخ المغادرة الحالي (${oldCheckOut}).`);
  }

  // Calculate extra nights
  const dOld = new Date(oldCheckOut + 'T00:00:00');
  const dNew = new Date(cleanNewCheckOut + 'T00:00:00');
  const diffTime = dNew.getTime() - dOld.getTime();
  const extraNights = Math.round(diffTime / (1000 * 60 * 60 * 24));
  if (extraNights <= 0) {
    throw new Error('عدد الليالي الإضافية يجب أن يكون ليلة واحدة على الأقل.');
  }

  // Calculate additional cost using custom rate if specified, otherwise existing custom or room rate
  const normCustomNightlyPrice = (customNightlyPrice !== undefined && customNightlyPrice !== null && customNightlyPrice !== '' && !isNaN(Number(customNightlyPrice)))
    ? roundMoney(customNightlyPrice)
    : ((res.custom_nightly_price !== null && res.custom_nightly_price !== undefined && !isNaN(Number(res.custom_nightly_price)))
        ? roundMoney(res.custom_nightly_price)
        : roundMoney(res.price_per_night || 0));

  if (normCustomNightlyPrice < 0) {
    throw new Error('سعر الليلة لا يمكن أن يكون سالباً.');
  }

  const normDiscountAmount = (discountAmount !== undefined && discountAmount !== null && discountAmount !== '' && !isNaN(Number(discountAmount)))
    ? Math.max(0, roundMoney(discountAmount))
    : 0;

  const baseCost = roundMoney(extraNights * normCustomNightlyPrice);
  const calculatedCost = Math.max(0, roundMoney(baseCost - normDiscountAmount));

  const calcAdditionalCost = (additionalCost !== undefined && additionalCost !== null && !isNaN(Number(additionalCost)))
    ? roundMoney(additionalCost)
    : calculatedCost;

  // Check room availability for the extension period (oldCheckOut to cleanNewCheckOut)
  const conflict = queryOne(`
    SELECT r.id, g.name AS guest_name, r.check_in_date, r.check_out_date
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.room_id = ?
      AND r.status = 'مؤكد'
      AND r.id != ?
      AND r.check_in_date < ?
      AND (r.check_out_date > ? OR r.check_out_date = 'مفتوح' OR r.check_out_date IS NULL OR r.check_out_date = '')
    LIMIT 1
  `, [res.room_id, targetId, cleanNewCheckOut, oldCheckOut]);

  if (conflict) {
    const conflictOut = conflict.check_out_date || 'مفتوح';
    throw new Error(`تعذر تمديد الإقامة: الغرفة رقم (${res.room_number}) محجوزة مسبقاً لنزيل آخر (${conflict.guest_name}) من تاريخ ${conflict.check_in_date} إلى ${conflictOut}.`);
  }

  const currentPaid = roundMoney(res.paid_amount || 0);
  const currentTotal = roundMoney(res.total_price || 0);
  const newTotal = roundMoney(currentTotal + calcAdditionalCost);

  const payAmount = (settleAmount !== undefined && settleAmount !== null && !isNaN(Number(settleAmount)))
    ? roundMoney(settleAmount)
    : 0;

  if (payAmount < 0) {
    throw new Error('مبلغ السداد لا يمكن أن يكون سالباً.');
  }

  db.run("BEGIN TRANSACTION;");
  try {
    let receiptNumber = null;
    let newPaid = currentPaid;

    if (payAmount > 0) {
      newPaid = roundMoney(currentPaid + payAmount);
      receiptNumber = generateReceiptNumber(targetId);
      const payStmt = db.prepare(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
      `);
      payStmt.run([
        receiptNumber,
        targetId,
        payAmount,
        paymentMethod || 'نقداً',
        userId ? parseInt(userId, 10) : null,
        notes || 'سداد دفعة تمديد إقامة'
      ]);
      payStmt.free();
    }

    let newPaymentStatus = res.payment_status;
    if (newPaid >= newTotal && newTotal > 0) {
      newPaymentStatus = 'مدفوع بالكامل';
    } else if (newPaid > 0) {
      newPaymentStatus = 'مدفوع جزئياً';
    } else {
      newPaymentStatus = 'غير مدفوع';
    }

    const updatedCustomRate = (customNightlyPrice !== undefined && customNightlyPrice !== null && customNightlyPrice !== '' && !isNaN(Number(customNightlyPrice)))
      ? roundMoney(customNightlyPrice)
      : res.custom_nightly_price;

    const newCumulativeDiscount = roundMoney((res.discount_amount || 0) + normDiscountAmount);

    const stmt = db.prepare(`
      UPDATE reservations
      SET check_out_date = ?,
          total_price = ?,
          paid_amount = ?,
          payment_status = ?,
          custom_nightly_price = ?,
          discount_amount = ?
      WHERE id = ?
    `);
    stmt.run([cleanNewCheckOut, newTotal, newPaid, newPaymentStatus, updatedCustomRate, newCumulativeDiscount, targetId]);
    stmt.free();

    db.run("COMMIT;");
    saveToFile();

    const updatedRes = queryOne(`
      SELECT r.*, rm.room_number, rm.type AS room_type, g.name AS guest_name
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.id = ?
    `, [targetId]);

    return {
      success: true,
      reservation: updatedRes,
      extraNights,
      nightlyRate: normCustomNightlyPrice,
      discountAmount: normDiscountAmount,
      additionalCost: calcAdditionalCost,
      paidAmount: payAmount,
      receiptNumber
    };
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (rbErr) {}
    throw err;
  }
}

function cancelReservation(reservationId, actualDepartureDate = null, manualOverrideAmount = undefined, userId = null) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) throw new Error('معرف الحجز غير صالح.');

  const res = queryOne(`
    SELECT r.id, r.room_id, r.check_in_date, r.check_out_date, r.total_price, r.paid_amount,
           rm.price_per_night
    FROM reservations r
    LEFT JOIN rooms rm ON r.room_id = rm.id
    WHERE r.id = ?
  `, [targetId]);
  if (!res) throw new Error('الحجز غير موجود.');

  const today = getLocalDateString();
  const effectiveDeparture = (actualDepartureDate && typeof actualDepartureDate === 'string' && actualDepartureDate.trim() !== '')
    ? actualDepartureDate.trim()
    : today;
  const hasStarted = effectiveDeparture >= res.check_in_date;
  const paidAmount = roundMoney(res.paid_amount || 0);

  let proRatedCharge = 0;
  let refundDue = 0;
  let stillOwed = 0;
  let daysStayed = 0;
  let originalCalculated = null;

  db.run("BEGIN TRANSACTION;");
  try {
    if (!hasStarted) {
      // Pre-arrival cancellation: full refund of any deposit per confirmed business policy.
      // paid_amount is reset to 0 because the entire amount was physically returned to the guest
      // and that refund is recorded as a negative ledger entry below.
      refundDue = paidAmount;
      proRatedCharge = 0;
      stillOwed = 0;

      const stmt1 = db.prepare(`
        UPDATE reservations
        SET status = 'ملغي',
            paid_amount = 0,
            payment_status = CASE WHEN ? > 0 THEN 'مستردة' ELSE payment_status END
        WHERE id = ?
      `);
      stmt1.run([paidAmount, targetId]);
      stmt1.free();

      // Record the full refund as a negative payment in the ledger so that revenue
      // reports (getDailyRevenueStats / getMonthlyRevenue / getShiftAuditReport) correctly
      // net down by the refunded amount on the day the refund is processed.
      // NOTE: payment_method defaults to 'نقداً' — the cancellation flow does not currently
      // collect the refund method from the UI. Extend the function signature if needed.
      if (refundDue > 0) {
        const refundReceiptNumber = generateReceiptNumber(targetId);
        const refundStmt = db.prepare(`
          INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
          VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
        `);
        refundStmt.run([
          refundReceiptNumber,
          targetId,
          -refundDue,
          'نقداً',
          userId ? parseInt(userId, 10) : null,
          'استرداد كامل - إلغاء قبل الوصول #' + targetId
        ]);
        refundStmt.free();
      }
    } else {
      // Mid-stay cancellation: calculate pro-rated charge using authoritative room.price_per_night
      const d1 = new Date(res.check_in_date + 'T00:00:00');
      const d2 = new Date(effectiveDeparture + 'T00:00:00');
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      daysStayed = Math.max(1, diffDays);

      const nightlyRate = roundMoney(res.price_per_night || 0);
      const calculatedProRated = roundMoney(daysStayed * nightlyRate);

      let finalCharge = calculatedProRated;

      if (manualOverrideAmount !== undefined && manualOverrideAmount !== null && manualOverrideAmount !== '' && !isNaN(Number(manualOverrideAmount))) {
        finalCharge = Math.max(0, roundMoney(manualOverrideAmount));
        originalCalculated = calculatedProRated;
      }

      proRatedCharge = finalCharge;
      refundDue = roundMoney(Math.max(0, paidAmount - finalCharge));
      stillOwed = roundMoney(Math.max(0, finalCharge - paidAmount));

      let newPaymentStatus = 'مدفوع بالكامل';
      if (stillOwed > 0) {
        newPaymentStatus = (paidAmount > 0) ? 'مدفوع جزئياً' : 'غير مدفوع';
      } else if (refundDue > 0) {
        // The refund is recorded immediately as a negative ledger entry and paid_amount
        // is set to finalCharge, so the reservation is fully settled — not a dangling credit.
        newPaymentStatus = 'مدفوع بالكامل';
      }

      const stmt1 = db.prepare(`
        UPDATE reservations 
        SET status = 'ملغي جزئي', 
            total_price = ?,
            paid_amount = ?,
            payment_status = ?,
            check_out_date = ?,
            original_calculated_charge = ?,
            checked_out_at = datetime('now')
        WHERE id = ?
      `);
      // paid_amount is set to finalCharge (the net amount kept) because the refund
      // has been physically returned to the guest and recorded as a negative ledger entry below.
      stmt1.run([finalCharge, finalCharge, newPaymentStatus, effectiveDeparture, originalCalculated, targetId]);
      stmt1.free();

      // Record the refund as a negative payment in the ledger so that all revenue
      // reports (getDailyRevenueStats / getMonthlyRevenue / getShiftAuditReport),
      // which SUM payments.amount, correctly net down by the refunded amount.
      // NOTE: payment_method defaults to 'نقداً' because the cancellation flow does
      // not currently collect the refund method from the UI. If a non-cash refund is
      // ever supported, this should be passed in via the function signature.
      if (refundDue > 0) {
        const refundReceiptNumber = generateReceiptNumber(targetId);
        const refundStmt = db.prepare(`
          INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
          VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
        `);
        refundStmt.run([
          refundReceiptNumber,
          targetId,
          -refundDue,
          'نقداً',
          userId ? parseInt(userId, 10) : null,
          'استرداد نقدي - إلغاء جزئي #' + targetId
        ]);
        refundStmt.free();
      }
    }

    // Do NOT delete payment rows — payment history is fully preserved!

    // Reset room status to 'متاحة' only if no other active confirmed reservation exists for this room
    const otherActive = queryOne(
      "SELECT id FROM reservations WHERE room_id = ? AND status = 'مؤكد' AND id != ?",
      [res.room_id, targetId]
    );
    if (!otherActive) {
      const stmt2 = db.prepare("UPDATE rooms SET status = 'متاحة' WHERE id = ?");
      stmt2.run([res.room_id]);
      stmt2.free();
    }

    db.run("COMMIT;");
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (rbErr) {}
    throw err;
  }

  saveToFile();
  return { 
    success: true, 
    proRatedCharge, 
    originalCalculatedCharge: originalCalculated !== null ? originalCalculated : proRatedCharge,
    refundDue, 
    stillOwed, 
    daysStayed,
    hasStarted,
    isOverridden: originalCalculated !== null
  };
}

/**
 * Add subsequent payment to an active reservation with atomic transaction and audit trail.
 * - Validates positive finite amount.
 * - Prevents overpayment beyond remaining balance for regular/monthly bookings.
 * - Allows negative balance (credit) for Open Contracts ('عقد مفتوح').
 * - Prevents IEEE-754 precision drift.
 * - Inserts receipt in 'payments' ledger table.
 * - Updates reservations table atomically.
 */
function addPaymentToReservation({ reservationId, amount, paymentMethod = 'نقداً', userId = null, notes = '' }) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الحجز غير صالح.');
  }

  const payAmount = roundMoney(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error('يرجى إدخال مبلغ سداد صحيح وموجب أكبر من الصفر.');
  }

  const res = queryOne("SELECT id, total_price, paid_amount, status, booking_type FROM reservations WHERE id = ?", [targetId]);
  if (!res) {
    throw new Error('الحجز غير موجود.');
  }

  if (res.status === 'ملغي') {
    throw new Error('لا يمكن تسجيل دفعات لحجز ملغي.');
  }

  const currentPaid = roundMoney(res.paid_amount || 0);
  const totalPrice = roundMoney(res.total_price || 0);
  const isContract = res.booking_type === 'عقد مفتوح';

  let remainingBalance;
  let newRemaining;
  let isFullyPaid;
  let newPaymentStatus;

  if (isContract) {
    // Open Contract: Allow negative remaining balance (credit), skip Math.max(0, ...) floor and overpayment throw
    remainingBalance = roundMoney(totalPrice - currentPaid);
    const newPaidAmount = roundMoney(currentPaid + payAmount);
    newRemaining = roundMoney(totalPrice - newPaidAmount);

    if (newRemaining < -0.005) {
      newPaymentStatus = 'رصيد دائن';
      isFullyPaid = true;
    } else if (Math.abs(newRemaining) <= 0.005) {
      newPaymentStatus = 'مدفوع بالكامل';
      isFullyPaid = true;
    } else {
      newPaymentStatus = 'مدفوع جزئياً';
      isFullyPaid = false;
    }
  } else {
    // Normal & Monthly Bookings: Hard overpayment guard
    remainingBalance = roundMoney(Math.max(0, totalPrice - currentPaid));

    if (remainingBalance <= 0) {
      throw new Error('الحجز مسدد بالكامل بالفعل، ولا يوجد رصيد متبقي مستحق.');
    }

    // Strict overpayment validation
    if (roundMoney(payAmount - remainingBalance) > 0.005) {
      throw new Error(`المبلغ المدفوع (${payAmount.toLocaleString()} ريال) يتجاوز الرصيد المتبقي المستحق (${remainingBalance.toLocaleString()} ريال). لا يمكن تحصيل مبالغ زائدة.`);
    }

    const newPaidAmount = roundMoney(currentPaid + payAmount);
    newRemaining = roundMoney(Math.max(0, totalPrice - newPaidAmount));
    isFullyPaid = newRemaining <= 0.005;
    newPaymentStatus = isFullyPaid ? 'مدفوع بالكامل' : 'مدفوع جزئياً';
  }

  const newPaidAmount = roundMoney(currentPaid + payAmount);

  db.run("BEGIN TRANSACTION;");
  try {
    const receiptNumber = generateReceiptNumber(targetId);

    // 1. Insert entry into payments ledger table
    const payStmt = db.prepare(`
      INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)
    `);
    payStmt.run([
      receiptNumber,
      targetId,
      payAmount,
      paymentMethod || 'نقداً',
      userId ? parseInt(userId, 10) : null,
      notes || 'سداد دفعة حجز'
    ]);
    payStmt.free();

    // 2. Update reservations table
    const resStmt = db.prepare(`
      UPDATE reservations 
      SET paid_amount = ?, 
          payment_status = ?, 
          payment_method = COALESCE(?, payment_method) 
      WHERE id = ?
    `);
    resStmt.run([newPaidAmount, newPaymentStatus, paymentMethod || null, targetId]);
    resStmt.free();

    db.run("COMMIT;");
    saveToFile();

    return {
      success: true,
      receiptNumber,
      reservationId: targetId,
      amountAdded: payAmount,
      newPaidAmount,
      totalPrice,
      remainingBalance: newRemaining,
      paymentStatus: newPaymentStatus,
      isFullyPaid
    };
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (rbErr) {}
    throw err;
  }
}

/**
 * Query complete payment ledger history for a specific reservation
 */
function getReservationPayments(reservationId) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) return [];

  const sql = `
    SELECT 
      p.id,
      p.receipt_number,
      p.reservation_id,
      p.amount,
      p.payment_method,
      p.payment_date,
      p.notes,
      p.user_id,
      u.username AS staff_username
    FROM payments p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.reservation_id = ?
    ORDER BY p.id ASC
  `;
  return queryAll(sql, [targetId]);
}

/**
 * Query detailed receipt details by receipt number or payment id
 */
function getPaymentReceipt(receiptIdentifier) {
  if (!receiptIdentifier) return null;
  const sql = `
    SELECT 
      p.id,
      p.receipt_number,
      p.reservation_id,
      p.amount,
      p.payment_method,
      p.payment_date,
      p.notes,
      r.total_price,
      r.paid_amount,
      r.payment_status,
      r.check_in_date,
      r.check_out_date,
      g.name AS guest_name,
      g.phone AS guest_phone,
      g.id_number AS guest_id_number,
      rm.room_number,
      rm.type AS room_type,
      u.username AS staff_username
    FROM payments p
    JOIN reservations r ON p.reservation_id = r.id
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.receipt_number = ? OR p.id = ?
    LIMIT 1
  `;
  return queryOne(sql, [String(receiptIdentifier), parseInt(receiptIdentifier, 10) || 0]);
}

/**
 * Excel Bulk Import: Reservations
 */
function bulkImportReservations(reservationsList) {
  let inserted = 0;
  let skipped = 0;

  for (const r of reservationsList) {
    const guestName = String(r.guest_name || r.name || r['اسم النزيل'] || r['النزيل'] || '').trim();
    const guestPhone = String(r.guest_phone || r.phone || r['رقم الجوال'] || r['الجوال'] || '').trim();
    const roomNumber = String(r.room_number || r['رقم الغرفة'] || r['الغرفة'] || '').trim();
    const checkIn = String(r.check_in_date || r['تاريخ الوصول'] || r['الوصول'] || '').trim();
    const checkOut = String(r.check_out_date || r['تاريخ المغادرة'] || r['المغادرة'] || '').trim();
    const price = parseFloat(r.total_price || r['السعر الإجمالي'] || r['المبلغ'] || r['الإجمالي']) || 0;

    if (!guestName || !checkIn || !checkOut) {
      skipped++;
      continue;
    }

    // Match Room
    let room = null;
    if (roomNumber) {
      room = queryOne("SELECT id FROM rooms WHERE room_number = ?", [roomNumber]);
    }
    if (!room) {
      room = queryOne("SELECT id FROM rooms WHERE status = 'متاحة' LIMIT 1") || queryOne("SELECT id FROM rooms LIMIT 1");
    }
    if (!room) {
      skipped++;
      continue;
    }

    // Match or create guest
    let guest = null;
    if (guestPhone) guest = queryOne("SELECT id FROM guests WHERE phone = ?", [guestPhone]);
    if (!guest) guest = queryOne("SELECT id FROM guests WHERE name = ?", [guestName]);

    let guestId;
    if (guest) {
      guestId = guest.id;
    } else {
      const gStmt = db.prepare("INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)");
      gStmt.run([guestName, guestPhone, '']);
      gStmt.free();
      guestId = queryOne("SELECT id FROM guests ORDER BY id DESC LIMIT 1").id;
    }

    const resStmt = db.prepare("INSERT INTO reservations (guest_id, room_id, check_in_date, check_out_date, total_price, status) VALUES (?, ?, ?, ?, ?, 'مؤكد')");
    resStmt.run([guestId, room.id, checkIn, checkOut, price]);
    resStmt.free();
    inserted++;
  }

  saveToFile();
  return { inserted, skipped, total: reservationsList.length };
}

/**
 * Update reservation receipt and financial/guest details
 */
function updateReservationReceipt({
  reservationId,
  totalPrice,
  paidAmount,
  depositAmount,
  paymentMethod,
  guestName,
  guestPhone,
  guestIdNumber,
  discountAmount,
  discountReason,
  customNightlyPrice
}) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الحجز أو السند غير صالح.');
  }

  const res = queryOne("SELECT id, guest_id, room_id, status, booking_type FROM reservations WHERE id = ?", [targetId]);
  if (!res) {
    throw new Error('الحجز غير موجود.');
  }

  const total = roundMoney(totalPrice);
  const paid = roundMoney(paidAmount);
  const deposit = roundMoney(depositAmount || 0);
  const isContract = res.booking_type === 'عقد مفتوح';

  const normDiscountAmount = (discountAmount !== undefined && discountAmount !== null && discountAmount !== '')
    ? Math.max(0, roundMoney(discountAmount))
    : null;
  const normDiscountReason = discountReason !== undefined ? (discountReason || '').trim() : null;
  const normCustomNightlyPrice = (customNightlyPrice !== undefined && customNightlyPrice !== null && customNightlyPrice !== '')
    ? roundMoney(customNightlyPrice)
    : null;

  if (!isContract) {
    if (total < 0) {
      throw new Error('إجمالي قيمة الحجز لا يمكن أن يكون سالباً.');
    }
    if (total === 0 && (normDiscountAmount === null || normDiscountAmount === 0)) {
      throw new Error('إجمالي قيمة الحجز يجب أن يكون أكبر من الصفر.');
    }
    if (roundMoney(paid - total) > 0.005) {
      throw new Error(`المبلغ المدفوع (${paid} ريال) لا يمكن أن يتجاوز إجمالي قيمة الحجز (${total} ريال).`);
    }
  } else {
    if (total < 0) {
      throw new Error('إجمالي قيمة الحجز لا يمكن أن يكون سالباً.');
    }
  }

  if (paid < 0) {
    throw new Error('المبلغ المدفوع لا يمكن أن يكون سالباً.');
  }

  const cleanPhone = (guestPhone || '').trim();
  if (cleanPhone && !/^05\d{8}$/.test(cleanPhone)) {
    throw new Error('رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.');
  }

  const cleanId = (guestIdNumber || '').trim();
  if (cleanId && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(cleanId)) {
    throw new Error('رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.');
  }

  let paymentStatus = 'غير مدفوع';
  if (isContract) {
    if (paid > total) {
      paymentStatus = 'رصيد دائن';
    } else if (paid === total && total > 0) {
      paymentStatus = 'مدفوع بالكامل';
    } else if (paid > 0) {
      paymentStatus = 'مدفوع جزئياً';
    }
  } else {
    if (paid >= total && total > 0) {
      paymentStatus = 'مدفوع بالكامل';
    } else if (paid > 0) {
      paymentStatus = 'مدفوع جزئياً';
    }
  }

  const method = paymentMethod || 'نقداً';

  db.run("BEGIN TRANSACTION;");
  try {
    // 1. Update reservations table
    const updateResStmt = db.prepare(`
      UPDATE reservations 
      SET total_price = ?, 
          paid_amount = ?, 
          deposit_amount = ?, 
          payment_method = ?, 
          payment_status = ?,
          discount_amount = CASE WHEN ? IS NOT NULL THEN ? ELSE discount_amount END,
          discount_reason = CASE WHEN ? IS NOT NULL THEN ? ELSE discount_reason END,
          custom_nightly_price = CASE WHEN ? IS NOT NULL THEN ? ELSE custom_nightly_price END
      WHERE id = ?
    `);
    updateResStmt.run([
      total, 
      paid, 
      deposit, 
      method, 
      paymentStatus, 
      normDiscountAmount,
      normDiscountAmount,
      normDiscountReason,
      normDiscountReason,
      normCustomNightlyPrice,
      normCustomNightlyPrice,
      targetId
    ]);
    updateResStmt.free();

    // 2. Synchronize primary payment in payments ledger table
    const existingPayment = queryOne("SELECT id FROM payments WHERE reservation_id = ? ORDER BY id ASC LIMIT 1", [targetId]);
    if (existingPayment) {
      const updatePayStmt = db.prepare("UPDATE payments SET amount = ?, payment_method = ? WHERE id = ?");
      updatePayStmt.run([paid, method, existingPayment.id]);
      updatePayStmt.free();
    } else if (paid > 0) {
      const receiptNumber = generateReceiptNumber(targetId);
      const insertPayStmt = db.prepare(`
        INSERT INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, user_id, notes)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), NULL, 'دفعة الحجز عند تعديل السند')
      `);
      insertPayStmt.run([receiptNumber, targetId, paid, method]);
      insertPayStmt.free();
    }

    // 3. Update guest information if changed
    if (res.guest_id) {
      const currentGuest = queryOne("SELECT name, phone, id_number FROM guests WHERE id = ?", [res.guest_id]);
      if (currentGuest) {
        const newName = (guestName && guestName.trim()) ? guestName.trim() : currentGuest.name;
        const newPhone = cleanPhone || currentGuest.phone;
        const newId = cleanId || currentGuest.id_number;
        const updateGuestStmt = db.prepare("UPDATE guests SET name = ?, phone = ?, id_number = ? WHERE id = ?");
        updateGuestStmt.run([newName, newPhone, newId, res.guest_id]);
        updateGuestStmt.free();
      }
    }

    db.run("COMMIT;");
    saveToFile();

    return { success: true, reservationId: targetId };
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (rbErr) {}
    throw err;
  }
}

module.exports = {
  getAllReservations,
  getReservationsPage,
  getReservationById,
  generateReceiptNumber,
  createReservation,
  computeCheckoutSettlement,
  checkoutReservation,
  extendReservation,
  cancelReservation,
  addPaymentToReservation,
  getReservationPayments,
  getPaymentReceipt,
  bulkImportReservations,
  updateReservationReceipt
};
