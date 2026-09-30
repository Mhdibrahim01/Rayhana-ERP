'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { assertDatabaseIntegrity, withSafeDatabase } = require('./helpers/safe-temp-db');

test('database user roles and factory reset behavior', async t => {
  await withSafeDatabase(async (db, connection, databasePath) => {
    await t.test('user creation, password updates, deletion, and legacy Staff login work at DB level', () => {
      const admin = db.addUser({ username: 'unit-admin', password: 'pass-admin', role: 'Admin' });
      const user = db.addUser({ username: 'unit-user', password: 'pass-user', role: 'User' });
      const coercedRole = db.addUser({ username: 'unit-coerced', password: 'pass-coerced', role: 'Staff' });
      assert.equal(admin.role, 'Admin');
      assert.equal(user.role, 'User');
      assert.equal(coercedRole.role, 'User');
      assert.equal(db.verifyUser('unit-admin', 'pass-admin').user.role, 'Admin');
      assert.equal(db.verifyUser('unit-user', 'pass-user').user.role, 'User');
      db.updateUserPassword(user.id, 'new-pass');
      assert.equal(db.verifyUser('unit-user', 'new-pass').success, true);
      assert.throws(() => db.deleteUser(1), /لا يمكن حذف حساب المسؤول الرئيسي/);
      assert.equal(db.deleteUser(coercedRole.id), true);

      connection.getDb().run("INSERT INTO users (username, password, role) VALUES ('legacy-staff', 'legacy-pass', 'Staff')");
      const legacy = db.verifyUser('legacy-staff', 'legacy-pass');
      assert.equal(legacy.success, true);
      assert.equal(legacy.user.role, 'Staff');
      assertDatabaseIntegrity(connection, 'DB user management');
    });

    await t.test('factory reset recreates defaults in the same test-owned file', async () => {
      db.addCustomer({ name: 'Reset Guest', phone: '0500000601', id_number: '1000000601' });
      db.addRoom({ room_number: 'RESET-ROOM', type: 'وحدة اختبار', price_per_night: 100 });
      assert.equal(connection.queryAll('SELECT COUNT(*) AS count FROM guests')[0].count, 1);

      const result = await db.factoryReset(databasePath);
      assert.equal(result.success, true);
      assert.equal(connection.queryAll('SELECT COUNT(*) AS count FROM guests')[0].count, 0);
      assert.equal(connection.queryAll('SELECT COUNT(*) AS count FROM reservations')[0].count, 0);
      assert.equal(connection.queryAll('SELECT COUNT(*) AS count FROM rooms')[0].count, 7);
      const users = Object.fromEntries(db.getAllUsers().map(entry => [entry.username, entry.role]));
      assert.equal(users.admin, 'Admin');
      assert.equal(users.staff, 'User');
      assert.equal(users.user, 'User');
      assert.equal(db.getAllUsers().length, 3);
      assertDatabaseIntegrity(connection, 'factory reset');
    });
  });
});
