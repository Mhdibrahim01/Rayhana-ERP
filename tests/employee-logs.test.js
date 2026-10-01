'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('employee login/logout tracking logs', async t => {
  await withSafeDatabase(async (db, connection) => {
    let logId;
    const adminUser = db.verifyUser('admin', 'admin').user;

    await t.test('logEmployeeLogin tracks user login time and returns a valid ID', () => {
      logId = db.logEmployeeLogin(adminUser.id);
      assert.ok(logId, 'Expected log ID to be returned');
      const logs = db.getEmployeeLogs();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].user_id, adminUser.id);
      assert.equal(logs[0].username, adminUser.username);
      assert.equal(logs[0].role, adminUser.role);
      assert.ok(logs[0].login_time, 'Expected login_time to be set');
      assert.equal(logs[0].logout_time, null);
      assertDatabaseIntegrity(connection, 'employee login');
    });

    await t.test('logEmployeeLogout tracks user logout time', () => {
      const result = db.logEmployeeLogout(logId);
      assert.equal(result, true);
      const logs = db.getEmployeeLogs();
      assert.ok(logs[0].logout_time, 'Expected logout_time to be set');
      assertDatabaseIntegrity(connection, 'employee logout');
    });
  });
});
