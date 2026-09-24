/**
 * نظام أحمد لإدارة الفنادق (Ahmed Hotel ERP)
 * Database Architecture Layer using SQLite3 (Official SQLite Engine via WebAssembly)
 * Zero C++ compilation errors, 100% persistent local storage in AppData.
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let currentDbPath = '';

/**
 * Saves current in-memory SQLite state to the physical .sqlite file on disk.
 */
function saveToFile() {
  if (!db || !currentDbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(currentDbPath, buffer);
  } catch (err) {
    console.error('[DB] خطأ أثناء حفظ قاعدة البيانات إلى القرص:', err);
  }
}

/**
 * Helper to execute a SELECT query and return an array of objects.
 */
function queryAll(sql, params = []) {
  if (!db) throw new Error('قاعدة البيانات غير مهيأة.');
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper to execute a single row SELECT query.
 */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Initialize SQLite database, create tables, and seed initial records.
 * @param {string} dbPath - File path to .sqlite database
 */
async function init(dbPath) {
  try {
    currentDbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('[DB] تم تحميل قاعدة البيانات الحالية من:', dbPath);
    } else {
      db = new SQL.Database();
      console.log('[DB] تم إنشاء قاعدة بيانات SQLite جديدة في:', dbPath);
    }

    // 1. Create Tables
    db.run(`
      -- جدول المستخدمين (Users with RBAC: 'Admin' or 'Staff')
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Staff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول النزلاء (Guests)
      CREATE TABLE IF NOT EXISTS guests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        id_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول الغرف (Rooms)
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_number TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        price_per_night REAL NOT NULL,
        status TEXT DEFAULT 'متاحة',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- جدول الحجوزات (Reservations)
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guest_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL,
        check_in_date TEXT NOT NULL,
        check_out_date TEXT NOT NULL,
        total_price REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        deposit_amount REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'نقداً',
        payment_status TEXT DEFAULT 'غير مدفوع',
        status TEXT DEFAULT 'مؤكد',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(guest_id) REFERENCES guests(id),
        FOREIGN KEY(room_id) REFERENCES rooms(id)
      );

      -- جدول سجل المدفوعات وسندات القبض (Payments / Receipts Ledger Table)
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT UNIQUE NOT NULL,
        reservation_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'نقداً',
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER,
        notes TEXT,
        FOREIGN KEY(reservation_id) REFERENCES reservations(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON payments(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

      -- جدول تتبع نشاط الموظفين (EmployeeLogs)
      CREATE TABLE IF NOT EXISTS EmployeeLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    // Safe column migrations for existing databases
    try { db.run("ALTER TABLE reservations ADD COLUMN paid_amount REAL DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN deposit_amount REAL DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN payment_method TEXT DEFAULT 'نقداً'"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN payment_status TEXT DEFAULT 'غير مدفوع'"); } catch (e) {}

    // Backfill historical payments from reservations if payments table is empty
    try {
      const existingPaymentsCount = queryOne("SELECT COUNT(*) AS count FROM payments")?.count || 0;
      if (existingPaymentsCount === 0) {
        const paidReservations = queryAll("SELECT id, paid_amount, payment_method, created_at FROM reservations WHERE paid_amount > 0");
        for (const r of paidReservations) {
          const year = new Date().getFullYear();
          const receiptNo = `REC-${year}-${String(r.id).padStart(5, '0')}`;
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO payments (receipt_number, reservation_id, amount, payment_method, payment_date, notes)
            VALUES (?, ?, ?, ?, ?, 'دفعة الحجز المبدئية (ترحيل آلي)')
          `);
          stmt.run([receiptNo, r.id, r.paid_amount, r.payment_method || 'نقداً', r.created_at || new Date().toISOString()]);
          stmt.free();
        }
      }
    } catch (migErr) {
      console.warn('[DB Migration payments warning]:', migErr.message);
    }

    // 2. Ensure Admin User exists and has 'Admin' role
    const adminUser = queryOne("SELECT id, role FROM users WHERE username = 'admin'");
    if (!adminUser) {
      const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
      stmt.run(['admin', 'admin', 'Admin']);
      stmt.free();
      console.log('[DB] تم إنشاء حساب المسؤول الافتراضي بنجاح (admin / admin / Admin)');
    } else if (adminUser.role !== 'Admin') {
      db.run("UPDATE users SET role = 'Admin' WHERE username = 'admin'");
    }

    // 3. Seed default staff and user members
    const staffUser = queryOne("SELECT id FROM users WHERE username = 'staff'");
    if (!staffUser) {
      const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
      stmt.run(['staff', 'staff', 'User']);
      stmt.free();
      console.log('[DB] تم إنشاء حساب موظف الاستقبال الافتراضي (staff / staff / User)');
    }

    const normalUser = queryOne("SELECT id FROM users WHERE username = 'user'");
    if (!normalUser) {
      const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
      stmt.run(['user', 'user', 'User']);
      stmt.free();
      console.log('[DB] تم إنشاء حساب المستخدم العادي الافتراضي (user / user / User)');
    }

    // 4. Seed Default Rooms if empty
    const roomCount = queryOne("SELECT COUNT(*) AS count FROM rooms");
    if (!roomCount || roomCount.count === 0) {
      const defaultRooms = [
        ['101', 'مفردة قياسية (Single)', 250.00, 'متاحة'],
        ['102', 'مفردة قياسية (Single)', 250.00, 'متاحة'],
        ['103', 'مزدوجة ديلوكس (Double)', 450.00, 'متاحة'],
        ['104', 'مزدوجة ديلوكس (Double)', 450.00, 'متاحة'],
        ['201', 'جناح عائلي (Family Suite)', 750.00, 'متاحة'],
        ['202', 'جناح ملكي (Royal Suite)', 1200.00, 'متاحة'],
        ['203', 'إطلالة بانورامية (Panoramic)', 600.00, 'متاحة']
      ];

      const roomStmt = db.prepare("INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)");
      for (const r of defaultRooms) {
        roomStmt.run(r);
      }
      roomStmt.free();
      console.log('[DB] تم تزويد الغرف الافتراضية بنجاح (جميعها متاحة للتشغيل).');
    }

    saveToFile();
    console.log('[DB] قاعدة بيانات الفندق جاهزة للعمل.');
  } catch (err) {
    console.error('[DB] خطأ أثناء تهيئة قاعدة البيانات:', err);
    throw err;
  }
}

/**
 * Verify user login credentials.
 */
function verifyUser(username, password) {
  const user = queryOne("SELECT id, username, role FROM users WHERE username = ? AND password = ?", [username.trim(), password]);
  if (user) {
    return { success: true, user };
  }
  return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
}

/**
 * User Management (RBAC) Functions
 */
function getAllUsers() {
  return queryAll("SELECT id, username, role, created_at FROM users ORDER BY id ASC");
}

function addUser({ username, password, role }) {
  if (!username || !password) throw new Error('اسم المستخدم وكلمة المرور مطلوبان.');
  const cleanUsername = username.trim();
  const existing = queryOne("SELECT id FROM users WHERE username = ?", [cleanUsername]);
  if (existing) throw new Error(`اسم المستخدم "${cleanUsername}" مسجل مسبقاً.`);
  
  const userRole = (role === 'Admin') ? 'Admin' : 'User';
  const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
  stmt.run([cleanUsername, password, userRole]);
  stmt.free();
  saveToFile();

  return queryOne("SELECT id, username, role, created_at FROM users WHERE username = ?", [cleanUsername]);
}

function updateUserPassword(userId, newPassword) {
  if (!newPassword || newPassword.trim().length < 3) {
    throw new Error('كلمة المرور يجب أن لا تقل عن 3 أحرف.');
  }
  const stmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");
  stmt.run([newPassword.trim(), parseInt(userId, 10)]);
  stmt.free();
  saveToFile();
  return true;
}

function deleteUser(userId) {
  const user = queryOne("SELECT username FROM users WHERE id = ?", [parseInt(userId, 10)]);
  if (!user) throw new Error('المستخدم غير موجود.');
  if (user.username.toLowerCase() === 'admin') {
    throw new Error('لا يمكن حذف حساب المسؤول الرئيسي (admin).');
  }
  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
  stmt.run([parseInt(userId, 10)]);
  stmt.free();
  saveToFile();
  return true;
}

/**
 * Employee Activity Logs Tracking
 */
function logEmployeeLogin(userId) {
  const stmt = db.prepare("INSERT INTO EmployeeLogs (user_id, login_time) VALUES (?, datetime('now', 'localtime'))");
  stmt.run([parseInt(userId, 10)]);
  stmt.free();
  saveToFile();
  const lastLog = queryOne("SELECT id FROM EmployeeLogs WHERE user_id = ? ORDER BY id DESC LIMIT 1", [parseInt(userId, 10)]);
  return lastLog ? lastLog.id : null;
}

function logEmployeeLogout(logId) {
  if (!logId) return false;
  const stmt = db.prepare("UPDATE EmployeeLogs SET logout_time = datetime('now', 'localtime') WHERE id = ?");
  stmt.run([parseInt(logId, 10)]);
  stmt.free();
  saveToFile();
  return true;
}

function getEmployeeLogs() {
  const sql = `
    SELECT 
      l.id,
      l.user_id,
      u.username,
      u.role,
      l.login_time,
      l.logout_time
    FROM EmployeeLogs l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.login_time DESC
  `;
  return queryAll(sql);
}

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

  // Check if room has an active confirmed reservation TODAY (check_in_date <= today AND check_out_date > today)
  const today = getLocalDateString();
  const activeRes = queryOne(
    "SELECT id FROM reservations WHERE room_id = ? AND status = 'مؤكد' AND check_in_date <= ? AND check_out_date > ?",
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
    "SELECT id FROM reservations WHERE room_id = ? AND status = 'مؤكد' AND check_in_date <= ? AND check_out_date > ?",
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
 * Guest Functions
 */
function getAllGuests() {
  const sql = `
    SELECT 
      g.id, 
      g.name, 
      g.phone, 
      g.id_number, 
      g.created_at,
      COUNT(CASE WHEN r.status = 'مكتمل' THEN r.id END) AS total_stays,
      IFNULL(SUM(CASE WHEN r.status = 'مكتمل' THEN r.total_price ELSE 0 END), 0) AS total_spent
    FROM guests g
    LEFT JOIN reservations r ON g.id = r.guest_id
    GROUP BY g.id
    ORDER BY g.id DESC
  `;
  return queryAll(sql);
}

/**
 * Server-Side Pagination for Guests directory (LIMIT & OFFSET)
 * Returns the requested chunk of data (e.g. 50 records) and the total COUNT(*)
 */
function getGuestsPaginated({ page = 1, limit = 50, search = '' } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const offset = (p - 1) * l;
  const cleanSearch = (search || '').trim();

  let whereClause = '';
  let queryParams = [];
  let countParams = [];

  if (cleanSearch) {
    whereClause = `WHERE (g.name LIKE ? OR g.phone LIKE ? OR g.id_number LIKE ?)`;
    const wildcard = `%${cleanSearch}%`;
    queryParams = [wildcard, wildcard, wildcard];
    countParams = [wildcard, wildcard, wildcard];
  }

  // 1. Get total COUNT(*) of matching guests
  const countSql = `SELECT COUNT(*) AS total FROM guests g ${whereClause}`;
  const countRow = queryOne(countSql, countParams);
  const totalCount = countRow ? (countRow.total || 0) : 0;
  const totalPages = Math.ceil(totalCount / l) || 1;

  // 2. Fetch only the requested chunk using LIMIT and OFFSET
  const dataSql = `
    SELECT 
      g.id, 
      g.name, 
      g.phone, 
      g.id_number, 
      g.created_at,
      COUNT(CASE WHEN r.status = 'مكتمل' THEN r.id END) AS total_stays,
      IFNULL(SUM(CASE WHEN r.status = 'مكتمل' THEN r.total_price ELSE 0 END), 0) AS total_spent
    FROM guests g
    LEFT JOIN reservations r ON g.id = r.guest_id
    ${whereClause}
    GROUP BY g.id
    ORDER BY g.id DESC
    LIMIT ? OFFSET ?
  `;
  queryParams.push(l, offset);
  const rows = queryAll(dataSql, queryParams);

  return {
    data: rows,
    pagination: {
      page: p,
      limit: l,
      totalCount,
      totalPages,
      hasNext: p < totalPages,
      hasPrev: p > 1
    }
  };
}

/**
 * Add a new guest / customer directly.
 * Accessible to both 'Admin' and 'User' roles.
 */
function addCustomer({ name, phone = '', id_number = '' }) {
  if (!name || !name.trim()) {
    throw new Error('يرجى إدخال اسم العميل / النزيل.');
  }

  const cleanName = name.trim();
  const cleanPhone = (phone || '').trim();
  const cleanId = (id_number || '').trim();

  if (cleanPhone && !/^05\d{8}$/.test(cleanPhone)) {
    throw new Error('رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).');
  }
  if (cleanId && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(cleanId)) {
    throw new Error('رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.');
  }

  // If ID number is provided, check if already registered
  if (cleanId) {
    const existing = queryOne("SELECT id, name FROM guests WHERE id_number = ?", [cleanId]);
    if (existing) {
      throw new Error(`النزيل مسجل مسبقاً برقم الهوية أو الجواز: ${cleanId} (الاسم: ${existing.name})`);
    }
  }

  const stmt = db.prepare("INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)");
  stmt.run([cleanName, cleanPhone, cleanId]);
  stmt.free();
  saveToFile();

  return queryOne("SELECT * FROM guests ORDER BY id DESC LIMIT 1");
}

/**
 * Search returning guest by Phone Number or ID Number.
 * Returns guest profile along with completed total stays for auto-fill.
 */
function searchGuest({ phone = '', id_number = '' } = {}) {
  const cleanPhone = (phone || '').trim();
  const cleanId = (id_number || '').trim();
  if (!cleanPhone && !cleanId) return null;

  const sql = `
    SELECT 
      g.id, 
      g.name, 
      g.phone, 
      g.id_number, 
      g.created_at,
      COUNT(CASE WHEN r.status = 'مكتمل' THEN r.id END) AS total_stays
    FROM guests g
    LEFT JOIN reservations r ON g.id = r.guest_id
    WHERE (? != '' AND g.phone = ?)
       OR (? != '' AND g.id_number = ?)
    GROUP BY g.id
    ORDER BY g.id DESC
    LIMIT 1
  `;

  return queryOne(sql, [cleanPhone, cleanPhone, cleanId, cleanId]);
}

/**
 * Helper to find a returning guest by single phone or ID string.
 */
function findGuestByPhoneOrId(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return null;
  const clean = query.trim();
  return searchGuest({ phone: clean, id_number: clean });
}

/**
 * Reservation Functions
 */
function getAllReservations() {
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
      r.created_at,
      g.name AS guest_name, 
      g.phone AS guest_phone, 
      g.id_number AS guest_id_number,
      rm.room_number, 
      rm.type AS room_type, 
      rm.price_per_night
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    ORDER BY r.id DESC
  `;
  return queryAll(sql);
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
      r.created_at,
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
 * Safe currency rounding helper to prevent IEEE-754 floating-point drift.
 * Rounds to 2 decimal places using Number.EPSILON.
 */
function roundMoney(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0.0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
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
  userId = null
}) {
  if (!guestName || !guestName.trim()) {
    throw new Error('اسم النزيل مطلوب ولا يمكن تركه فارغاً.');
  }
  if (!roomId) {
    throw new Error('يرجى تحديد الغرفة المراد حجزها.');
  }
  if (!checkInDate || !checkOutDate) {
    throw new Error('تاريخ الوصول وتاريخ المغادرة مطلوبان.');
  }
  if (checkOutDate <= checkInDate) {
    throw new Error('تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بشكل محدد.');
  }
  const cleanPhone = (guestPhone || '').trim();
  if (cleanPhone && !/^05\d{8}$/.test(cleanPhone)) {
    throw new Error('رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).');
  }
  const cleanId = (guestIdNumber || '').trim();
  if (cleanId && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(cleanId)) {
    throw new Error('رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.');
  }

  const total = roundMoney(totalPrice);
  const paid = roundMoney(paidAmount);
  const deposit = roundMoney(depositAmount);

  if (total <= 0) {
    throw new Error('إجمالي قيمة الحجز يجب أن يكون أكبر من الصفر.');
  }
  if (paid < 0) {
    throw new Error('المبلغ المدفوع لا يمكن أن يكون سالباً.');
  }
  if (roundMoney(paid - total) > 0.005) {
    throw new Error(`المبلغ المدفوع (${paid} ريال) لا يمكن أن يتجاوز إجمالي قيمة الحجز (${total} ريال).`);
  }

  // Overlap & Collision Check: Prevent double-booking for the same room
  const parsedRoomId = parseInt(roomId, 10);
  const conflict = queryOne(`
    SELECT r.id, r.check_in_date, r.check_out_date, g.name AS guest_name
    FROM reservations r
    LEFT JOIN guests g ON r.guest_id = g.id
    WHERE r.room_id = ? 
      AND r.status = 'مؤكد'
      AND r.check_in_date < ? 
      AND r.check_out_date > ?
    LIMIT 1
  `, [parsedRoomId, checkOutDate, checkInDate]);

  if (conflict) {
    throw new Error(`الغرفة محجوزة بالفعل في الفترة المحددة: يوجد حجز مؤكد #${conflict.id} (${conflict.guest_name ? `النزيل: ${conflict.guest_name}، ` : ''}من ${conflict.check_in_date} إلى ${conflict.check_out_date}).`);
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
    if (paid >= total && total > 0) {
      paymentStatus = 'مدفوع بالكامل';
    } else if (paid > 0) {
      paymentStatus = 'مدفوع جزئياً';
    }

    const resStmt = db.prepare(`
      INSERT INTO reservations (
        guest_id, room_id, check_in_date, check_out_date,
        total_price, paid_amount, deposit_amount, payment_method, payment_status, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'مؤكد')
    `);
    resStmt.run([
      guestId,
      parseInt(roomId, 10),
      checkInDate,
      checkOutDate,
      total,
      paid,
      deposit,
      method,
      paymentStatus
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
    // Only mark room as 'مشغولة' if CURRENT_DATE >= check_in_date AND CURRENT_DATE < check_out_date.
    // If check_in_date is in the future, mark as 'محجوزة' (unless it is already occupied today by another guest).
    const todayStr = getLocalDateString();
    let assignedRoomStatus = 'متاحة';
    const currentRoom = queryOne("SELECT status FROM rooms WHERE id = ?", [parseInt(roomId, 10)]);

    if (checkInDate <= todayStr && checkOutDate > todayStr) {
      assignedRoomStatus = 'مشغولة';
    } else if (checkInDate > todayStr) {
      if (currentRoom && currentRoom.status === 'مشغولة') {
        assignedRoomStatus = 'مشغولة';
      } else {
        assignedRoomStatus = 'محجوزة';
      }
    }

    const roomStmt = db.prepare("UPDATE rooms SET status = ? WHERE id = ?");
    roomStmt.run([assignedRoomStatus, parseInt(roomId, 10)]);
    roomStmt.free();

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

function checkoutReservation(reservationId) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) throw new Error('معرف الحجز غير صالح.');

  const res = queryOne("SELECT room_id FROM reservations WHERE id = ?", [targetId]);
  if (!res) throw new Error('الحجز غير موجود.');

  db.run("BEGIN TRANSACTION;");
  try {
    const stmt1 = db.prepare("UPDATE reservations SET status = 'مكتمل' WHERE id = ?");
    stmt1.run([targetId]);
    stmt1.free();

    const stmt2 = db.prepare("UPDATE rooms SET status = 'تنظيف' WHERE id = ?");
    stmt2.run([res.room_id]);
    stmt2.free();

    db.run("COMMIT;");
  } catch (err) {
    try { db.run("ROLLBACK;"); } catch (rbErr) {}
    throw err;
  }

  saveToFile();
  return { success: true };
}

function cancelReservation(reservationId) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) throw new Error('معرف الحجز غير صالح.');

  const res = queryOne("SELECT room_id FROM reservations WHERE id = ?", [targetId]);
  if (!res) throw new Error('الحجز غير موجود.');

  db.run("BEGIN TRANSACTION;");
  try {
    // 1. Reset status to 'ملغي', paid_amount to 0.0, payment_status to 'غير مدفوع'
    const stmt1 = db.prepare("UPDATE reservations SET status = 'ملغي', paid_amount = 0.0, payment_status = 'غير مدفوع' WHERE id = ?");
    stmt1.run([targetId]);
    stmt1.free();

    // 2. Clear payments ledger entries for this canceled reservation so revenue and guest ledgers are not inflated
    const stmtPayments = db.prepare("DELETE FROM payments WHERE reservation_id = ?");
    stmtPayments.run([targetId]);
    stmtPayments.free();

    // 3. Reset room status to 'متاحة' only if no other active confirmed reservation exists for this room
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
  return { success: true };
}


/**
 * Add subsequent payment to an active reservation with atomic transaction and audit trail.
 * - Validates positive finite amount.
 * - Prevents overpayment beyond remaining balance.
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

  const res = queryOne("SELECT id, total_price, paid_amount, status FROM reservations WHERE id = ?", [targetId]);
  if (!res) {
    throw new Error('الحجز غير موجود.');
  }

  if (res.status === 'ملغي') {
    throw new Error('لا يمكن تسجيل دفعات لحجز ملغي.');
  }

  const currentPaid = roundMoney(res.paid_amount || 0);
  const totalPrice = roundMoney(res.total_price || 0);
  const remainingBalance = roundMoney(Math.max(0, totalPrice - currentPaid));

  if (remainingBalance <= 0) {
    throw new Error('الحجز مسدد بالكامل بالفعل، ولا يوجد رصيد متبقي مستحق.');
  }

  // Strict overpayment validation
  if (roundMoney(payAmount - remainingBalance) > 0.005) {
    throw new Error(`المبلغ المدفوع (${payAmount.toLocaleString()} ريال) يتجاوز الرصيد المتبقي المستحق (${remainingBalance.toLocaleString()} ريال). لا يمكن تحصيل مبالغ زائدة.`);
  }

  const newPaidAmount = roundMoney(currentPaid + payAmount);
  const newRemaining = roundMoney(Math.max(0, totalPrice - newPaidAmount));
  const isFullyPaid = newRemaining <= 0.005;
  const newPaymentStatus = isFullyPaid ? 'مدفوع بالكامل' : 'مدفوع جزئياً';

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
 * Format local date as YYYY-MM-DD (immune to UTC timezone offsets)
 */
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // 1. Actively occupied rooms today: check_in_date <= today AND check_out_date > today
  const occupiedSql = `
    SELECT DISTINCT room_id 
    FROM reservations 
    WHERE status = 'مؤكد' 
      AND check_in_date <= ? 
      AND check_out_date > ?
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

  // 3. Checkouts that passed or today: check_out_date <= today
  const checkoutSql = `
    SELECT DISTINCT room_id 
    FROM reservations 
    WHERE status = 'مكتمل' OR (status = 'مؤكد' AND check_out_date <= ?)
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
 * Analytics Data: Monthly Revenue
 */
function getMonthlyRevenue() {
  const sql = `
    SELECT 
      strftime('%Y-%m', check_in_date) AS month, 
      SUM(total_price) AS revenue
    FROM reservations
    WHERE status != 'ملغي'
    GROUP BY month
    ORDER BY month ASC
  `;
  return queryAll(sql);
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
 * Excel / CSV Bulk Import: Guests
 */
function bulkImportGuests(guestsList) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const updatedGuests = [];

  const insertStmt = db.prepare("INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)");
  const updateStmt = db.prepare("UPDATE guests SET name = ?, phone = ?, id_number = ? WHERE id = ?");

  for (const g of guestsList) {
    // Resolve Name from multiple common Arabic & English column headers
    let name = String(
      g.name || g.Name || g.guest_name || g.customer_name ||
      g['الاسم'] || g['اسم النزيل'] || g['اسم العميل'] || g['الاسم الكامل'] || ''
    ).trim();

    // Resolve Phone
    let rawPhone = String(
      g.phone || g.Phone || g.mobile || g.Mobile || g.telephone ||
      g['الجوال'] || g['الهاتف'] || g['رقم الجوال'] || g['رقم الهاتف'] || g['الموبايل'] || ''
    ).trim();

    // Resolve ID Number
    let rawId = String(
      g.id_number || g.idNumber || g.national_id || g.iqama ||
      g['الهوية'] || g['رقم الهوية'] || g['الهوية الوطنية'] || g['السجل المدني'] || g['الإقامة'] || g['رقم الإقامة'] || ''
    ).trim();

    // Normalize Saudi mobile number (e.g. +9665..., 9665..., 5...)
    let phone = rawPhone.replace(/\D/g, '');
    if (phone.startsWith('9665') && phone.length === 12) {
      phone = '0' + phone.substring(3);
    } else if (phone.startsWith('009665') && phone.length === 14) {
      phone = '0' + phone.substring(5);
    } else if (phone.startsWith('5') && (phone.length === 8 || phone.length === 9)) {
      phone = '0' + phone;
    }

    // Normalize ID or Passport number (preserve letters, digits, and hyphens)
    let id_number = rawId.replace(/[^A-Za-z0-9\-]/g, '').trim();

    if (!name) {
      skipped++;
      continue;
    }

    // Check if customer already exists by ID or Phone
    let existing = null;
    let matchReason = '';
    if (id_number) {
      existing = queryOne("SELECT id, name, phone, id_number FROM guests WHERE id_number = ?", [id_number]);
      if (existing) matchReason = `تطابق رقم الهوية (${id_number})`;
    }
    if (!existing && phone) {
      existing = queryOne("SELECT id, name, phone, id_number FROM guests WHERE phone = ?", [phone]);
      if (existing) matchReason = `تطابق رقم الجوال (${phone})`;
    }

    if (!existing) {
      insertStmt.run([name, phone, id_number]);
      inserted++;
    } else {
      // Merge/update missing fields if existing record had incomplete data
      const mergedName = name || existing.name;
      const mergedPhone = phone || existing.phone;
      const mergedId = id_number || existing.id_number;
      updateStmt.run([mergedName, mergedPhone, mergedId, existing.id]);
      updated++;
      if (updatedGuests.length < 100) {
        updatedGuests.push({
          id: existing.id,
          name: mergedName,
          phone: mergedPhone,
          id_number: mergedId,
          matchReason: matchReason || 'تطابق في البيانات السابقة'
        });
      }
    }
  }

  insertStmt.free();
  updateStmt.free();
  saveToFile();
  return { inserted, updated, skipped, total: guestsList.length, updatedGuests };
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
 * Generate Shift Audit & Night Closing Financial Report
 * Uses real, timestamped payments ledger table to compute daily collections accurately.
 */
function getShiftAuditReport(targetDate) {
  const today = targetDate || getLocalDateString();

  // 1. Query actual ledger payments collected on target date
  const paymentsToday = queryAll(`
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
    WHERE (p.payment_date LIKE ? || '%' OR DATE(p.payment_date) = DATE(?))
      AND r.status != 'ملغي'
    ORDER BY p.id DESC
  `, [today, today]);

  let totalRevenue = 0;
  let cashTotal = 0;
  let cardTotal = 0;
  let transferTotal = 0;

  for (const p of paymentsToday) {
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

  // 2. Reservations active, checked-in, or checked-out on target date (for stay audit)
  const reservationsToday = queryAll(`
    SELECT r.*, g.name AS guest_name, rm.room_number, rm.type AS room_type
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN rooms rm ON r.room_id = rm.id
    WHERE (r.created_at LIKE ? || '%'
       OR DATE(r.created_at) = DATE(?)
       OR r.check_in_date = ? 
       OR r.check_out_date = ?
       OR (r.check_in_date <= ? AND r.check_out_date >= ? AND r.status = 'مؤكد'))
      AND r.status != 'ملغي'
    ORDER BY r.id DESC
  `, [today, today, today, today, today, today]);

  let depositTotal = 0;
  for (const r of reservationsToday) {
    depositTotal += roundMoney(r.deposit_amount || 0);
  }
  depositTotal = roundMoney(depositTotal);

  // 3. Movements
  const checkinsToday = queryOne("SELECT COUNT(*) AS count FROM reservations WHERE check_in_date = ? AND status != 'ملغي'", [today])?.count || 0;
  const checkoutsToday = queryOne("SELECT COUNT(*) AS count FROM reservations WHERE check_out_date = ?", [today])?.count || 0;

  // 4. Room status distribution
  const allRooms = queryAll("SELECT status FROM rooms");
  const totalRooms = allRooms.length;
  const occupiedCount = allRooms.filter(r => r.status === 'مشغولة').length;
  const availableCount = allRooms.filter(r => r.status === 'متاحة').length;
  const cleaningCount = allRooms.filter(r => r.status === 'تنظيف').length;
  const maintenanceCount = allRooms.filter(r => r.status === 'صيانة').length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

  return {
    date: today,
    financials: {
      totalRevenue,
      cashTotal,
      cardTotal,
      transferTotal,
      depositTotal
    },
    movements: {
      checkinsToday,
      checkoutsToday,
      totalReservationsToday: reservationsToday.length,
      totalPaymentsCount: paymentsToday.length
    },
    rooms: {
      totalRooms,
      occupiedCount,
      availableCount,
      cleaningCount,
      maintenanceCount,
      occupancyRate
    },
    payments: paymentsToday,
    transactions: reservationsToday
  };
}

/**
 * Backup Database Copy to selected destination
 */
function createBackupCopy(targetDestinationPath) {
  if (!currentDbPath || !fs.existsSync(currentDbPath)) {
    throw new Error('ملف قاعدة البيانات غير موجود.');
  }
  saveToFile();
  fs.copyFileSync(currentDbPath, targetDestinationPath);
  return { success: true, backupPath: targetDestinationPath };
}

/**
 * Restore Database from selected file
 */
async function restoreDatabaseFile(sourceBackupPath) {
  if (!fs.existsSync(sourceBackupPath)) {
    throw new Error('ملف النسخة الاحتياطية غير موجود.');
  }
  if (!currentDbPath) {
    throw new Error('مسار قاعدة البيانات الحالي غير محدد.');
  }

  const rollbackPath = currentDbPath + '.safety_rollback';
  if (fs.existsSync(currentDbPath)) {
    fs.copyFileSync(currentDbPath, rollbackPath);
  }

  try {
    if (db) {
      db.close();
      db = null;
    }

    fs.copyFileSync(sourceBackupPath, currentDbPath);
    await init(currentDbPath);

    return { success: true };
  } catch (err) {
    if (fs.existsSync(rollbackPath)) {
      fs.copyFileSync(rollbackPath, currentDbPath);
      await init(currentDbPath);
    }
    throw new Error(`فشلت استعادة النسخة الاحتياطية: ${err.message}`);
  }
}

/**
 * Returns current database file path.
 */
function getDatabaseFilePath() {
  return currentDbPath;
}

/**
 * Safely flush and close database.
 */
function close() {
  if (db) {
    saveToFile();
    db.close();
    db = null;
  }
}

/**
 * Factory Reset: Wipes the SQLite file completely and reinitializes fresh baseline data
 * (Default Admin/Staff/User accounts, 7 default available rooms, empty reservations/guests/logs).
 */
async function factoryReset(targetPath) {
  const p = targetPath || currentDbPath;
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn('[DB] Warning closing db during reset:', e.message);
    }
    db = null;
  }
  if (p && fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      console.log('[DB] تم حذف ملف قاعدة البيانات لإعادة ضبط المصنع:', p);
    } catch (err) {
      console.error('[DB] فشل حذف ملف قاعدة البيانات القديم:', err);
    }
  }
  await init(p);
  console.log('[DB] تم إعادة ضبط المصنع وتهيئة قاعدة بيانات جديدة بالكامل.');
  return { success: true };
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
  guestIdNumber
}) {
  const targetId = parseInt(reservationId, 10);
  if (!targetId || isNaN(targetId)) {
    throw new Error('معرف الحجز أو السند غير صالح.');
  }

  const res = queryOne("SELECT id, guest_id, room_id, status FROM reservations WHERE id = ?", [targetId]);
  if (!res) {
    throw new Error('الحجز غير موجود.');
  }

  const total = roundMoney(totalPrice);
  const paid = roundMoney(paidAmount);
  const deposit = roundMoney(depositAmount || 0);

  if (total <= 0) {
    throw new Error('إجمالي قيمة الحجز يجب أن يكون أكبر من الصفر.');
  }
  if (paid < 0) {
    throw new Error('المبلغ المدفوع لا يمكن أن يكون سالباً.');
  }
  if (roundMoney(paid - total) > 0.005) {
    throw new Error(`المبلغ المدفوع (${paid} ريال) لا يمكن أن يتجاوز إجمالي قيمة الحجز (${total} ريال).`);
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
  if (paid >= total && total > 0) {
    paymentStatus = 'مدفوع بالكامل';
  } else if (paid > 0) {
    paymentStatus = 'مدفوع جزئياً';
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
          payment_status = ? 
      WHERE id = ?
    `);
    updateResStmt.run([total, paid, deposit, method, paymentStatus, targetId]);
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
  init,
  factoryReset,
  verifyUser,
  getAllUsers,
  addUser,
  updateUserPassword,
  deleteUser,
  getLocalDateString,
  getDatabaseFilePath,
  getAllRooms,
  getAvailableRooms,
  updateRoomStatus,
  addRoom,
  updateRoom,
  deleteRoom,
  getAllGuests,
  getGuestsPaginated,
  addCustomer,
  addGuest: addCustomer,
  searchGuest,
  findGuestByPhoneOrId,
  getAllReservations,
  getReservationById,
  createReservation,
  updateReservationReceipt,
  checkoutReservation,
  cancelReservation,
  addPaymentToReservation,
  getReservationPayments,
  getPaymentReceipt,
  roundMoney,
  generateReceiptNumber,
  autoUpdateRoomStatuses,
  getTodayCheckouts,
  getMonthlyRevenue,
  getDashboardStats,
  getShiftAuditReport,
  createBackupCopy,
  restoreDatabaseFile,
  bulkImportGuests,
  bulkImportReservations,
  logEmployeeLogin,
  logEmployeeLogout,
  getEmployeeLogs,
  close
};
