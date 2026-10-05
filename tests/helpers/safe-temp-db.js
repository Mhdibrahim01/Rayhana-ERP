'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const appDb = require('../../db');
const connection = require('../../db/connection');

function isInsidePath(candidate, parent) {
  if (!parent) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertSafeDatabasePath(databasePath) {
  const resolved = path.resolve(databasePath);
  const home = os.homedir();
  const forbidden = [
    process.env.APPDATA,
    path.join(home, 'Documents'),
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    path.join(home, 'OneDrive'),
    path.join(home, 'OneDrive - Rayhana')
  ].filter(Boolean);

  for (const folder of forbidden) {
    assert.equal(
      isInsidePath(resolved, folder),
      false,
      `Refusing to open a test database inside protected user data: ${resolved} (under ${path.resolve(folder)})`
    );
  }
  return resolved;
}

function createSafeTempDatabasePath() {
  const scratchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rayhana-db-test-'));
  const databasePath = assertSafeDatabasePath(path.join(scratchDirectory, 'rayhana-test.sqlite'));
  assert.equal(fs.existsSync(databasePath), false, 'Test database path must not already exist.');
  return { scratchDirectory, databasePath };
}

async function withSafeDatabase(callback, { businessDate = 'calendar' } = {}) {
  const { scratchDirectory, databasePath } = createSafeTempDatabasePath();
  try {
    // The location assertions above must pass before app code opens this database.
    await appDb.init(databasePath);
    // Most legacy tests use the host calendar date for their fixtures. Anchor
    // their fresh database to that date so they stay deterministic when the
    // suite runs before the hotel's 06:00 initial-date cutoff. Tests for the
    // cutoff or Night Audit can opt out with businessDate: 'preserve'.
    if (businessDate === 'calendar') {
      connection.db.run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [appDb.getLocalDateString()]);
      connection.saveToFile();
    } else if (businessDate !== 'preserve') {
      connection.db.run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [businessDate]);
      connection.saveToFile();
    }
    return await callback(appDb, connection, databasePath);
  } finally {
    appDb.close();
    fs.rmSync(scratchDirectory, { recursive: true, force: true });
  }
}

function assertDatabaseIntegrity(connection, label = 'scenario') {
  const orphanRows = connection.queryAll('PRAGMA foreign_key_check');
  assert.deepEqual(orphanRows, [], `${label}: no orphan foreign keys`);

  const receiptCounts = connection.queryAll(
    'SELECT COUNT(*) AS total, COUNT(DISTINCT receipt_number) AS unique_count FROM payments'
  )[0];
  assert.equal(receiptCounts.total, receiptCounts.unique_count, `${label}: receipt numbers are unique`);

  const paidMismatches = connection.queryAll(`
    SELECT r.id, r.paid_amount, COALESCE(SUM(p.amount), 0) AS ledger_total
    FROM reservations r
    LEFT JOIN payments p ON p.reservation_id = r.id
    GROUP BY r.id
    HAVING ABS(ROUND(COALESCE(r.paid_amount, 0), 2) - ROUND(COALESCE(SUM(p.amount), 0), 2)) > 0.005
  `);
  assert.deepEqual(paidMismatches, [], `${label}: paid_amount matches payment ledger totals`);
  return 3;
}

module.exports = { assertDatabaseIntegrity, assertSafeDatabasePath, createSafeTempDatabasePath, withSafeDatabase };
