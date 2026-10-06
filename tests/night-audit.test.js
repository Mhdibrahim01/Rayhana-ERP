'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { addRoom, createReservation } = require('./helpers/fixtures');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('business-date ledger stamping and Night Audit', async () => {
  await withSafeDatabase(async (db, connection) => {
    const closedDate = '2026-10-05';
    const nextDate = '2026-10-06';
    const checkoutDate = '2026-10-07';
    const room = addRoom('NIGHT-AUDIT-1', 120);

    const reservationId = createReservation({
      roomId: room.id,
      name: 'Night Audit Guest',
      checkIn: nextDate,
      checkOut: checkoutDate,
      totalPrice: 240,
      paidAmount: 120,
      depositAmount: 40
    });

    const payment = connection.queryOne(
      'SELECT created_at, business_date FROM payments WHERE reservation_id = ?',
      [reservationId]
    );
    const depositMovement = connection.queryOne(
      'SELECT created_at, business_date FROM deposit_movements WHERE reservation_id = ?',
      [reservationId]
    );
    assert.equal(payment.business_date, closedDate);
    assert.ok(Number.isFinite(Date.parse(payment.created_at)), 'payment keeps a real transaction timestamp');
    assert.equal(depositMovement.business_date, closedDate);
    assert.ok(Number.isFinite(Date.parse(depositMovement.created_at)), 'deposit movement keeps a real transaction timestamp');
    assert.equal(connection.queryOne(
      "SELECT business_date FROM reservation_events WHERE entity_id = ? AND event_type = 'created'",
      [reservationId]
    ).business_date, closedDate);
    assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'محجوزة');

    assert.throws(
      () => db.runNightAudit(1, '2026-10-04'),
      /تغير تاريخ العمل/
    );
    assert.equal(db.getCurrentBusinessDate(), closedDate, 'a stale audit request cannot advance the date');

    const result = db.runNightAudit(1, closedDate);
    assert.equal(result.closedBusinessDate, closedDate);
    assert.equal(result.currentBusinessDate, nextDate);
    assert.equal(result.audit.closed_business_date, closedDate);
    assert.equal(JSON.parse(result.audit.summary_json).paymentNet, 120);
    assert.equal(JSON.parse(result.audit.summary_json).depositNet, 40);
    assert.equal(db.getCurrentBusinessDate(), nextDate);
    assert.equal(connection.queryOne('SELECT status FROM rooms WHERE id = ?', [room.id]).status, 'مشغولة');

    const checkInEvent = connection.queryOne(
      "SELECT created_at, business_date FROM reservation_events WHERE entity_id = ? AND event_type = 'check_in'",
      [reservationId]
    );
    assert.equal(checkInEvent.business_date, nextDate, 'arrival on the newly opened business date is recorded there');
    assert.ok(Number.isFinite(Date.parse(checkInEvent.created_at)));
    assert.equal(connection.queryOne('SELECT COUNT(*) AS count FROM payments').count, 1,
      'Night Audit does not post a duplicate room charge');

    assert.throws(
      () => db.runNightAudit(1, closedDate),
      /تغير تاريخ العمل/
    );
    assert.equal(db.getCurrentBusinessDate(), nextDate, 'a repeated request for the closed date has no second effect');
    assert.equal(connection.queryOne('SELECT COUNT(*) AS count FROM night_audits').count, 1);
    assertDatabaseIntegrity(connection, 'business date and Night Audit');
  }, { businessDate: '2026-10-05' });
});

test('restoring a pre-audit backup restores its Business Date', async () => {
  await withSafeDatabase(async (db, connection, databasePath) => {
    const closedDate = '2026-10-05';
    const backupPath = path.join(path.dirname(databasePath), 'before-night-audit.sqlite');
    connection.createBackupCopy(backupPath);

    db.runNightAudit(1, closedDate);
    assert.equal(db.getCurrentBusinessDate(), '2026-10-06');

    await connection.restoreDatabaseFile(backupPath);
    assert.equal(db.getCurrentBusinessDate(), closedDate);
    assert.equal(connection.queryOne('SELECT COUNT(*) AS count FROM night_audits').count, 0);
    assert.equal(fs.existsSync(backupPath), true, 'the selected backup remains available after restoration');
    assertDatabaseIntegrity(connection, 'restored pre-audit database');
  }, { businessDate: '2026-10-05' });
});

test('both restore controls refresh the displayed Business Date', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dashboardSrc = fs.readFileSync(path.join(__dirname, '../dashboard.js'), 'utf8');
  const refreshesBeforeOverview = dashboardSrc.match(/await refreshHotelBusinessState\(\);\s*await window\.DashboardApp\.Helpers\.loadOverviewData\(\);/g) || [];
  assert.ok(refreshesBeforeOverview.length >= 2,
    'both restore controls reload the Business Date before refreshing dashboard data');
});
