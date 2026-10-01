'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { withSafeDatabase } = require('./helpers/safe-temp-db');
const { FakeIpcMain, createFakeDeps } = require('./helpers/fake-ipc');
const { registerUsersIpc } = require('../ipc/index');

test('IPC Users handlers', async t => {
  await withSafeDatabase(async (db, connection) => {
    const ipcMain = new FakeIpcMain();
    const deps = createFakeDeps();
    registerUsersIpc(ipcMain, deps);

    await t.test('Admin can add a user, and admin account cannot be deleted', async () => {
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const addRes = await ipcMain.invoke('users:add', {}, { username: 'testuser', password: 'password123', role: 'User' });
      assert.equal(addRes.success, true);

      const deleteRes = await ipcMain.invoke('users:delete', {}, 1); // Trying to delete admin (id 1)
      assert.equal(deleteRes.success, false);
      assert.match(deleteRes.error, /لا يمكن حذف حساب المسؤول/);
    });

    await t.test('Password minimum length is enforced', async () => {
      deps.session.currentUser = { id: 1, username: 'admin', role: 'Admin' };
      const res = await ipcMain.invoke('users:update-password', {}, { userId: 1, newPassword: '12' });
      assert.equal(res.success, false);
      assert.match(res.error, /لا تقل عن 3 أحرف/);
    });

    await t.test('non-Admin session cannot add users even when renderer passes requesterRole: Admin', async () => {
      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      // Call signature 1: parameters spread
      const res1 = await ipcMain.invoke('users:add', {}, 'newstaff', 'pass123', 'User', 'Admin');
      assert.equal(res1.success, false, 'Expected add-user to fail for non-admin');
      
      // Call signature 2: parameters in object
      const res2 = await ipcMain.invoke('users:add', {}, { username: 'newstaff2', password: '123', role: 'User', requesterRole: 'Admin' });
      assert.equal(res2.success, false, 'Expected add-user to fail for non-admin');
    });

    await t.test('no session.currentUser is rejected', async () => {
      deps.session.currentUser = null;
      const res = await ipcMain.invoke('users:add', {}, { username: 'testuser2', password: '123', role: 'User' });
      assert.equal(res.success, false);
      assert.match(res.error, /Access Denied/);
    });

    await t.test('non-Admin session cannot delete users even when renderer passes requesterRole: Admin', async () => {
      deps.session.currentUser = { id: 2, username: 'staff', role: 'User' };
      // Adding a dummy user to attempt deletion via DB directly since add via IPC fails
      const user = db.addUser({ username: 'dummy', password: '123', role: 'User' });

      // Call signature 1: parameters spread
      const res1 = await ipcMain.invoke('users:delete', {}, user.id, 'Admin');
      assert.equal(res1.success, false, 'Expected delete-user to fail for non-admin');
      
      // Call signature 2: parameters in object
      const res2 = await ipcMain.invoke('users:delete', {}, { userId: user.id, requesterRole: 'Admin' });
      assert.equal(res2.success, false, 'Expected delete-user to fail for non-admin');
    });
  });
});
