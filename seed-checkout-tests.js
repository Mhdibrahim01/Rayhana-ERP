/**
 * seed-checkout-tests.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Inserts test reservations for every checkout settlement scenario.
 *
 * HOW TO USE:
 *   1. CLOSE the Rayhana app completely first (the app holds the DB in memory;
 *      seeding while it is open will not be visible until restart).
 *   2. Run:  node seed-checkout-tests.js
 *   3. Start the app normally.
 *
 * Alternatively, if you want to seed without restarting, paste the contents of
 * seed-checkout-tests-runtime.js into the app's DevTools console (Ctrl+Shift+I).
 * ─────────────────────────────────────────────────────────────────────────────

'use strict';

const path = require('path');
const os   = require('os');
const db   = require('./db');

// ── helper ────────────────────────────────────────────────────────────────────
function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ── main ──────────────────────────────────────────────────────────────────────
async function seed() {
  const appData    = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const dbPath     = path.join(appData, 'rayhana-suites', 'rayhana_erp.sqlite');

  await db.init(dbPath);
  console.log('✓ DB connected:', dbPath);

  // ── resolve room ids ────────────────────────────────────────────────────────
  const { queryOne, queryAll } = require('./db/connection');
  const rooms = queryAll("SELECT id, room_number, price_per_night FROM rooms ORDER BY room_number");
  if (rooms.length === 0) {
    console.error('✗ No rooms found. Run reset-db.js first.');
    process.exit(1);
  }

  function room(number) {
    const r = rooms.find(x => x.room_number === number);
    if (!r) throw new Error(`Room ${number} not found`);
    return r;
  }

  // ── insert guest helper ─────────────────────────────────────────────────────
  let guestCounter = 900; // start id_number range unlikely to clash
  function insertGuest(name) {
    guestCounter++;
    const phone   = `0501234${String(guestCounter).padStart(3, '0')}`;
    const idNum   = String(1000000000 + guestCounter);
    const existing = queryOne("SELECT id FROM guests WHERE id_number = ?", [idNum]);
    if (existing) return existing.id;
    const stmt = require('./db/connection').db.prepare(
      "INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)"
    );
    stmt.run([name, phone, idNum]);
    stmt.free();
    return queryOne("SELECT id FROM guests WHERE id_number = ?", [idNum]).id;
  }

  // ── insert reservation helper ───────────────────────────────────────────────
  const rawDb = require('./db/connection').db;

  function insertReservation({
    guestId, roomId, checkIn, checkOut, total, paid = 0,
    status = 'مؤكد', bookingType = 'عادي',
    customNightlyPrice = null, discountAmount = 0, discountReason = '',
    paymentMethod = 'نقداً', paymentStatus = null, originalCalculatedCharge = null
  }) {
    // derive payment_status if not given
    if (!paymentStatus) {
      if (paid === 0)           paymentStatus = 'غير مدفوع';
      else if (paid >= total)   paymentStatus = 'مدفوع بالكامل';
      else                      paymentStatus = 'مدفوع جزئياً';
    }

    const stmt = rawDb.prepare(`
      INSERT INTO reservations
        (guest_id, room_id, check_in_date, check_out_date, total_price, paid_amount,
         payment_method, payment_status, status, booking_type,
         custom_nightly_price, discount_amount, discount_reason, original_calculated_charge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      guestId, roomId, checkIn, checkOut || null, total, paid,
      paymentMethod, paymentStatus, status, bookingType,
      customNightlyPrice, discountAmount, discountReason || null,
      originalCalculatedCharge
    ]);
    stmt.free();

    const res = queryOne("SELECT id FROM reservations ORDER BY id DESC LIMIT 1");
    const resId = res.id;

    // Mark room occupied
    const roomStmt = rawDb.prepare("UPDATE rooms SET status = 'مشغولة' WHERE id = ?");
    roomStmt.run([roomId]);
    roomStmt.free();

    // Insert initial payment ledger row if paid > 0
    if (paid > 0) {
      const year = new Date().getFullYear();
      const recNo = `SEED-${year}-${String(resId).padStart(4,'0')}-0001`;
      const pStmt = rawDb.prepare(`
        INSERT OR IGNORE INTO payments
          (receipt_number, reservation_id, amount, payment_method, payment_date, notes)
        VALUES (?, ?, ?, ?, datetime('now','localtime'), ?)
      `);
      pStmt.run([recNo, resId, paid, paymentMethod, 'دفعة أولى (بيانات اختبار)']);
      pStmt.free();
    }

    return resId;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SEED SCENARIOS
  // ══════════════════════════════════════════════════════════════════════════════

  const r101 = room('101');  // rate 250
  const r102 = room('102');  // rate 250
  const r103 = room('103');  // rate 450
  const r104 = room('104');  // rate 450
  const r201 = room('201');  // rate 750
  const r202 = room('202');  // rate 1200
  const r203 = room('203');  // rate 600

  const checkIn0  = today(0);    // checked in today (1 actual night at checkout)
  const checkIn2  = today(-2);   // checked in 2 days ago
  const checkIn3  = today(-3);   // checked in 3 days ago
  const checkIn5  = today(-5);   // checked in 5 days ago
  const checkOut30 = addDays(today(-3), 30); // monthly end date

  console.log('\n──────────────────────────────────────────────');
  console.log('Seeding test reservations…');
  console.log('──────────────────────────────────────────────');

  // S1: Rate 250, 1 night expected (today checkout). Paid 250 already → settled.
  //     → simple-confirm path (isSettled = true, diff = 0)
  const g1  = insertGuest('نزيل S1 - مسدد بالكامل');
  const id1 = insertReservation({ guestId: g1, roomId: r101.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 250, paid: 250 });
  console.log(`S1 (settled, simple confirm)           → reservation #${id1}  room 101  paid=250  rate=250`);

  // S2: Rate 250, 1 night. Paid 0 → amount due 250. Collect-now path.
  const g2  = insertGuest('نزيل S2 - لم يدفع شيئاً');
  const id2 = insertReservation({ guestId: g2, roomId: r102.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 250, paid: 0 });
  console.log(`S2 (paid 0, collect now)               → reservation #${id2}  room 102  paid=0    rate=250`);

  // S3: Rate 150 (custom). Paid 2000 (full monthly amount). 1 actual night = 150.
  //     diff = 150 - 2000 = -1850 → refund path.
  //     Uses a free room: we need another room. Reuse r101 only if it's free — here use r103.
  // Wait: r101 is occupied by S1. Use r103 (rate 450, but we set custom_nightly_price=150).
  const g3  = insertGuest('نزيل S3 - دفع أكثر (رصيد دائن)');
  const id3 = insertReservation({ guestId: g3, roomId: r103.id, checkIn: checkIn0, checkOut: addDays(checkIn0,30), total: 4500, paid: 4500, bookingType: 'حجز شهري', customNightlyPrice: 150 });
  console.log(`S3 (overpaid 4500, net=150, refund=4350)→ reservation #${id3}  room 103  paid=4500 custom_rate=150`);

  // S4: Rate 250, 1 night, paid exactly 250 → settled.
  //     → simple-confirm path (same as S1, different guest)
  const g4  = insertGuest('نزيل S4 - مسدد تماماً مثل S1');
  const id4 = insertReservation({ guestId: g4, roomId: r104.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 250, paid: 250 });
  console.log(`S4 (settled exact)                     → reservation #${id4}  room 104  paid=250  rate=250`);

  // S5: Rate 200 (custom). Paid 200. Admin will apply discount=50 at checkout.
  //     net = max(0, 200-50) = 150. paid(200) > net(150) → refund 50.
  //     (Admin-only scenario — test as Admin login)
  const g5  = insertGuest('نزيل S5 - خصم Admin عند المغادرة');
  const id5 = insertReservation({ guestId: g5, roomId: r201.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 200, paid: 200, customNightlyPrice: 200 });
  console.log(`S5 (admin discount 50 → refund 50)     → reservation #${id5}  room 201  paid=200  custom_rate=200`);

  // S6: Rate 200 (custom). Paid 200 → settled (non-Admin; discount stripped).
  //     → simple confirm. If you log in as 'user' and try checkout, discount field hidden.
  const g6  = insertGuest('نزيل S6 - User role, no discount');
  const id6 = insertReservation({ guestId: g6, roomId: r202.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 200, paid: 200, customNightlyPrice: 200 });
  console.log(`S6 (non-admin, settled, discount hidden)→ reservation #${id6}  room 202  paid=200  custom_rate=200`);

  // S7: Rate 600. Paid 0 → amount due 600. Test "defer (آجل)" button.
  const g7  = insertGuest('نزيل S7 - مغادرة بدون تحصيل آجل');
  const id7 = insertReservation({ guestId: g7, roomId: r203.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 600, paid: 0 });
  console.log(`S7 (defer, owed 600)                   → reservation #${id7}  room 203  paid=0    rate=600`);

  // S8: Monthly booking, checked in 3 days ago. rate=250/night. paid=7500 (full month).
  //     actual nights = 3 → net = 750. refund = 7500 - 750 = 6750.
  //     Needs a free room. Create a temporary extra room for seed purposes.
  // Use r101 which S1 will have vacated by checkout. Actually let's use a fresh approach:
  // We'll insert a room specifically for this seed if not exists.
  let r108 = queryOne("SELECT id FROM rooms WHERE room_number = '108'");
  if (!r108) {
    const roomStmt2 = rawDb.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
    roomStmt2.run(['108', 'مفردة اختبار (Test)', 250.00, 'متاحة']);
    roomStmt2.free();
    r108 = queryOne("SELECT id FROM rooms WHERE room_number = '108'");
  }
  const g8  = insertGuest('نزيل S8 - شهري مبكر (3 ليالٍ فعلية)');
  const id8 = insertReservation({ guestId: g8, roomId: r108.id, checkIn: checkIn3, checkOut: checkOut30, total: 7500, paid: 7500, bookingType: 'حجز شهري' });
  console.log(`S8 (monthly, 3 nights, refund=6750)    → reservation #${id8}  room 108  paid=7500 rate=250`);

  // S9: Regular booking, checked in 2 days ago, rate=450, paid exactly 900 (2×450).
  //     → settled exactly (diff=0) → simple confirm.
  let r109 = queryOne("SELECT id FROM rooms WHERE room_number = '109'");
  if (!r109) {
    const rs = rawDb.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
    rs.run(['109', 'مزدوجة اختبار (Test)', 450.00, 'متاحة']);
    rs.free();
    r109 = queryOne("SELECT id FROM rooms WHERE room_number = '109'");
  }
  const g9  = insertGuest('نزيل S9 - حجز عادي 2 ليلة مسدد');
  const id9 = insertReservation({ guestId: g9, roomId: r109.id, checkIn: checkIn2, checkOut: addDays(checkIn2,2), total: 900, paid: 900 });
  console.log(`S9 (2-night exact, settled)            → reservation #${id9}  room 109  paid=900  rate=450`);

  // S10: Open-contract booking, checked in 5 days ago. Paid 2000 on account.
  //      → goes through settle modal (open-contract path, unchanged).
  let r110 = queryOne("SELECT id FROM rooms WHERE room_number = '110'");
  if (!r110) {
    const rs = rawDb.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
    rs.run(['110', 'جناح اختبار (Test)', 750.00, 'متاحة']);
    rs.free();
    r110 = queryOne("SELECT id FROM rooms WHERE room_number = '110'");
  }
  const g10 = insertGuest('نزيل S10 - عقد مفتوح');
  const id10 = insertReservation({ guestId: g10, roomId: r110.id, checkIn: checkIn5, checkOut: null, total: 0, paid: 2000, bookingType: 'عقد مفتوح' });
  console.log(`S10 (open contract, 5 nights, paid 2000)→ reservation #${id10}  room 110  rate=750`);

  // S11: Already-closed reservation → safety net must block re-checkout.
  let r111 = queryOne("SELECT id FROM rooms WHERE room_number = '111'");
  if (!r111) {
    const rs = rawDb.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
    rs.run(['111', 'غرفة اختبار مغلقة', 250.00, 'تنظيف']);
    rs.free();
    r111 = queryOne("SELECT id FROM rooms WHERE room_number = '111'");
  }
  const g11 = insertGuest('نزيل S11 - حجز مغلق مسبقاً');
  const id11 = insertReservation({
    guestId: g11, roomId: r111.id,
    checkIn: today(-2), checkOut: today(-1),
    total: 250, paid: 250,
    status: 'مكتمل',          // already closed
    paymentStatus: 'مدفوع بالكامل'
  });
  // room should be cleaning not occupied
  rawDb.run("UPDATE rooms SET status = 'تنظيف' WHERE id = ?", [r111.id]);
  console.log(`S11 (already closed, blocks re-checkout)→ reservation #${id11}  room 111  status=مكتمل`);

  // S12: Custom nightly price stored on reservation (200 SAR). Room rate is 450.
  //      Backend must use 200, not 450. Paid 0 → collect-now for 200.
  let r112 = queryOne("SELECT id FROM rooms WHERE room_number = '112'");
  if (!r112) {
    const rs = rawDb.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
    rs.run(['112', 'غرفة سعر خاص (Test)', 450.00, 'متاحة']);
    rs.free();
    r112 = queryOne("SELECT id FROM rooms WHERE room_number = '112'");
  }
  const g12 = insertGuest('نزيل S12 - سعر مخصص 200 (الغرفة 450)');
  const id12 = insertReservation({ guestId: g12, roomId: r112.id, checkIn: checkIn0, checkOut: addDays(checkIn0,1), total: 200, paid: 0, customNightlyPrice: 200 });
  console.log(`S12 (custom rate 200 vs room rate 450)  → reservation #${id12}  room 112  paid=0 custom_rate=200`);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('✓ Seed complete — 12 test reservations inserted.');
  console.log('');
  console.log('Test checklist:');
  console.log('  S1  #' + id1  + ' → checkout → simple confirm (paid=250, net=250)');
  console.log('  S2  #' + id2  + ' → checkout → settle modal, collect 250');
  console.log('  S3  #' + id3  + ' → checkout → settle modal, refund 4350  (custom rate 150)');
  console.log('  S4  #' + id4  + ' → checkout → simple confirm (exact match)');
  console.log('  S5  #' + id5  + ' → checkout as ADMIN, enter discount 50 → refund 50');
  console.log('  S6  #' + id6  + ' → checkout as USER  → discount section hidden, settled, simple confirm');
  console.log('  S7  #' + id7  + ' → checkout → settle modal → click "مغادرة بدون تحصيل (آجل)"');
  console.log('  S8  #' + id8  + ' → checkout → settle modal, refund 6750  (monthly, 3 nights)');
  console.log('  S9  #' + id9  + ' → checkout → simple confirm (2 nights exact)');
  console.log('  S10 #' + id10 + ' → checkout → open-contract settle modal (unchanged path)');
  console.log('  S11 #' + id11 + ' → checkout → error "الحجز مغلق بالفعل"');
  console.log('  S12 #' + id12 + ' → checkout → collect 200 (stored rate used, NOT room rate 450)');
  console.log('══════════════════════════════════════════════════════════════\n');

  require('./db/connection').db.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
