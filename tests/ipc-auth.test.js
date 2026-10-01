'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { withSafeDatabase } = require('./helpers/safe-temp-db');
const { FakeIpcMain, createFakeDeps } = require('./helpers/fake-ipc');
const { registerAuthIpc } = require('../ipc/index');

test('IPC Auth handlers', async t => {
  await withSafeDatabase(async (db, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    deps.session.mainWindow = new deps.BrowserWindow();
    registerAuthIpc(ipcMain, deps);

    await t.test('Login rejects bad credentials', async () => {
      const res = await ipcMain.invoke('auth:login', {}, { username: 'admin', password: 'wrongpassword' });
      assert.equal(res.success, false);
      assert.match(res.message, /غير صحيحة/);
      assert.equal(deps.session.currentUser, null);
    });

    await t.test('Login succeeds with good credentials', async () => {
      const res = await ipcMain.invoke('auth:login', {}, { username: 'admin', password: 'admin' });
      assert.equal(res.success, true);
      assert.equal(res.user.username, 'admin');
      assert.equal(deps.session.currentUser.username, 'admin');
      assert.ok(deps.session.currentLogId > 0);
    });

    await t.test('Logout clears session', async () => {
      const res = await ipcMain.invoke('auth:logout', {}, deps.session.currentLogId);
      assert.equal(res.success, true);
      assert.equal(deps.session.currentUser, null);
      assert.equal(deps.session.currentLogId, null);
    });
  });
});
