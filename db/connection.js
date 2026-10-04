/**
 * نظام ريحانة للوحدات السكنية (Rayhana Suites ERP)
 * Database Connection & Core Persistence Module
 * SQLite Engine via WebAssembly (sql.js)
 * Now with bcrypt password hashing migration (eager + lazy).
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;
function _isBcryptHash(val) {
  return typeof val === 'string' && /^\$2[aby]\$\d{2}\$/.test(val);
}
function _hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

let db = null;
let currentDbPath = '';

const dbProxy = new Proxy({}, {
  get(target, prop) {
    if (!db) throw new Error('قاعدة البيانات غير مهيأة.');
    const val = db[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  }
});

/**
 * Saves current in-memory SQLite state to the physical .sqlite file on disk.
 */
function saveToFile() {
  if (!db || !currentDbPath) return;
  const tempPath = `${currentDbPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, currentDbPath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
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
        check_out_date TEXT,
        total_price REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        deposit_amount REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'نقداً',
        payment_status TEXT DEFAULT 'غير مدفوع',
        status TEXT DEFAULT 'مؤكد',
        booking_type TEXT DEFAULT 'عادي',
        custom_nightly_price REAL,
        discount_amount REAL DEFAULT 0,
        discount_reason TEXT,
        late_checkout_fee REAL DEFAULT 0,
        original_calculated_charge REAL,
        checked_out_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(guest_id) REFERENCES guests(id),
        FOREIGN KEY(room_id) REFERENCES rooms(id)
      );

      CREATE INDEX IF NOT EXISTS idx_reservations_status_id ON reservations(status, id DESC);

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

      -- سجل مستقل لحركات التأمين؛ لا يمثل رصيد التأمين إيراد إقامة أو تحصيلاً يومياً.
      CREATE TABLE IF NOT EXISTS deposit_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL,
        movement_type TEXT NOT NULL CHECK (movement_type IN ('collected', 'reconciled', 'refunded', 'applied', 'retained')),
        amount REAL NOT NULL CHECK (amount > 0),
        payment_method TEXT NOT NULL DEFAULT 'نقداً',
        movement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER,
        reason TEXT,
        FOREIGN KEY(reservation_id) REFERENCES reservations(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_deposit_movements_reservation ON deposit_movements(reservation_id, id);
      CREATE INDEX IF NOT EXISTS idx_deposit_movements_date ON deposit_movements(movement_date);

      -- جدول تتبع نشاط الموظفين (EmployeeLogs)
      CREATE TABLE IF NOT EXISTS EmployeeLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    // Enable foreign key enforcement (SQLite has it OFF by default)
    db.run("PRAGMA foreign_keys = ON;");

    // Safe column migrations for existing databases
    try { db.run("ALTER TABLE reservations ADD COLUMN paid_amount REAL DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN deposit_amount REAL DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN payment_method TEXT DEFAULT 'نقداً'"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN payment_status TEXT DEFAULT 'غير مدفوع'"); } catch (e) {}
    try { db.run("ALTER TABLE guests ADD COLUMN is_banned INTEGER DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE guests ADD COLUMN ban_reason TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN booking_type TEXT DEFAULT 'عادي'"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN custom_nightly_price REAL"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN discount_amount REAL DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN discount_reason TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN late_checkout_fee REAL DEFAULT 0"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN checked_out_at DATETIME"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN original_calculated_charge REAL"); } catch (e) {}
    // Monthly early-checkout policy audit trail. All nullable with no default so
    // pre-existing (legacy) rows stay NULL and keep their original behaviour.
    try { db.run("ALTER TABLE reservations ADD COLUMN checkout_policy TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN checkout_policy_reason TEXT"); } catch (e) {}
    try { db.run("ALTER TABLE reservations ADD COLUMN booked_check_out_date TEXT"); } catch (e) {}

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

    // 2. Ensure Admin User exists and has 'Admin' role — password always bcrypt-hashed
    const adminUser = queryOne("SELECT id, password, role FROM users WHERE username = 'admin'");
    if (!adminUser) {
      const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
      stmt.run(['admin', _hashPassword('admin'), 'Admin']);
      stmt.free();
      console.log('[DB] تم إنشاء حساب المسؤول الافتراضي بنجاح (admin / admin / Admin)');
    } else {
      // Ensure role is Admin and password is bcrypt-hashed (eager migration)
      if (adminUser.role !== 'Admin') {
        db.run("UPDATE users SET role = 'Admin' WHERE username = 'admin'");
      }
      if (!_isBcryptHash(adminUser.password)) {
        try {
          const h = _hashPassword(adminUser.password);
          const stmt = db.prepare("UPDATE users SET password = ? WHERE username = 'admin'");
          stmt.run([h]);
          stmt.free();
          console.log('[DB Migration] تم ترقية كلمة مرور admin إلى bcrypt بنجاح.');
        } catch (e) { console.warn('[DB Migration] فشل ترقية كلمة مرور admin:', e.message); }
      }
    }

    // 3. Seed default staff and user members — passwords bcrypt-hashed
    const staffUser = queryOne("SELECT id, password FROM users WHERE username = 'staff'");
    if (!staffUser) {
      const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
      stmt.run(['staff', _hashPassword('staff'), 'User']);
      stmt.free();
      console.log('[DB] تم إنشاء حساب موظف الاستقبال الافتراضي (staff / staff / User)');
    } else if (!_isBcryptHash(staffUser.password)) {
      try {
        const h = _hashPassword(staffUser.password);
        const stmt = db.prepare("UPDATE users SET password = ? WHERE username = 'staff'");
        stmt.run([h]);
        stmt.free();
      } catch (e) { console.warn('[DB Migration] فشل ترقية staff:', e.message); }
    }

    const normalUser = queryOne("SELECT id, password FROM users WHERE username = 'user'");
    if (!normalUser) {
      const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
      stmt.run(['user', _hashPassword('user'), 'User']);
      stmt.free();
      console.log('[DB] تم إنشاء حساب المستخدم العادي الافتراضي (user / user / User)');
    } else if (!_isBcryptHash(normalUser.password)) {
      try {
        const h = _hashPassword(normalUser.password);
        const stmt = db.prepare("UPDATE users SET password = ? WHERE username = 'user'");
        stmt.run([h]);
        stmt.free();
      } catch (e) { console.warn('[DB Migration] فشل ترقية user:', e.message); }
    }

    // 3b. Eager bulk migration: hash any other legacy plaintext passwords in one sweep
    // This ensures existing custom users created before bcrypt are upgraded on next app start,
    // without waiting for their first login (lazy path in db/users.js covers remaining edge).
    try {
      const allUsers = queryAll("SELECT id, password FROM users");
      let migratedCount = 0;
      for (const u of allUsers) {
        if (!_isBcryptHash(u.password)) {
          const h = _hashPassword(u.password);
          const stmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");
          stmt.run([h, u.id]);
          stmt.free();
          migratedCount++;
        }
      }
      if (migratedCount > 0) {
        console.log(`[DB Migration] تم ترقية ${migratedCount} كلمة مرور من النص الصريح إلى bcrypt تلقائياً.`);
      }
    } catch (e) {
      console.warn('[DB Migration] فشل الترحيل الجماعي لكلمات المرور:', e.message);
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
 * Safe currency rounding helper to prevent IEEE-754 floating-point drift.
 * Rounds to 2 decimal places using Number.EPSILON.
 *
 * Negative zero is normalised to positive zero: Math.round can return -0 for a tiny
 * negative input such as -0.001, and that would render as "-0.00" on an invoice.
 * Only the sign of a value that rounds to exactly zero is changed — a real negative
 * amount such as a -1850.00 refund keeps its sign. Never clamp negatives to zero:
 * refund rows and signed deposit adjustments are stored negative on purpose.
 */
const CURRENCY_TOLERANCE = 0.005;

function roundMoney(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0.0;
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
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
 * Get the current hotel business operational date (اليوم الفندقي التشغيلي).
 * Standard hotel audit practice: between 00:00 midnight and early morning cutoff (default: 06:00 AM),
 * guests arriving are checking in for the ongoing night (check-in date is yesterday, checkout today at 14:00).
 * @param {Date} [d=new Date()]
 * @param {number} [cutoffHour=6] - Hour before which the business date rolls back to previous day
 * @returns {string} YYYY-MM-DD
 */
function getHotelBusinessDate(d = new Date(), cutoffHour = 6) {
  const date = new Date(d);
  if (date.getHours() < cutoffHour) {
    date.setDate(date.getDate() - 1);
  }
  return getLocalDateString(date);
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

module.exports = {
  db: dbProxy,
  getDb: () => db,
  saveToFile,
  queryAll,
  queryOne,
  init,
  CURRENCY_TOLERANCE,
  roundMoney,
  getLocalDateString,
  getHotelBusinessDate,
  createBackupCopy,
  restoreDatabaseFile,
  getDatabaseFilePath,
  close,
  factoryReset
};
