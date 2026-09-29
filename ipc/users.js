/**
 * Rayhana ERP - User Management & RBAC IPC Handlers
 * Domain: ipc/users.js
 */

module.exports = function registerUsersIpc(ipcMain, { db, session }) {
  // 2. User Management & RBAC (Admin Only)
  ipcMain.handle('users:get-all', async () => {
    if (!session.currentUser || session.currentUser.role !== 'Admin') {
      return { success: false, error: 'Access Denied: Admin privileges required.' };
    }
    try {
      const users = db.getAllUsers();
      return { success: true, data: users };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  const handleAddUser = async (event, arg1, arg2) => {
    let userData = arg1;
    let requesterRole = arg2;

    if (arg1 && typeof arg1 === 'object') {
      if (arg1.userData !== undefined) {
        userData = arg1.userData;
        requesterRole = arg1.requesterRole !== undefined ? arg1.requesterRole : requesterRole;
      } else if (arg1.requesterRole !== undefined) {
        requesterRole = arg1.requesterRole;
      }
    }

    // Role check: Only 'Admin' is permitted
    const role = requesterRole || (session.currentUser ? session.currentUser.role : null);
    if (role !== 'Admin') {
      return {
        success: false,
        error: 'Access Denied: Admin privileges required.'
      };
    }

    try {
      const newUser = db.addUser(userData);
      return { success: true, data: newUser };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  ipcMain.handle('add-user', handleAddUser);
  ipcMain.handle('users:add', handleAddUser);

  ipcMain.handle('users:update-password', async (event, { userId, newPassword }) => {
    // Admin can update any, Staff/User can only update their own
    if (!session.currentUser) return { success: false, error: 'غير مسجل الدخول.' };
    if (session.currentUser.role !== 'Admin' && session.currentUser.id !== parseInt(userId, 10)) {
      return { success: false, error: 'Access Denied: Admin privileges required.' };
    }
    try {
      db.updateUserPassword(userId, newPassword);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  const handleDeleteUser = async (event, arg1, arg2) => {
    let userId = arg1;
    let requesterRole = arg2;

    if (arg1 && typeof arg1 === 'object') {
      if (arg1.userId !== undefined) {
        userId = arg1.userId;
        requesterRole = arg1.requesterRole !== undefined ? arg1.requesterRole : requesterRole;
      } else if (arg1.requesterRole !== undefined) {
        requesterRole = arg1.requesterRole;
      }
    }

    // Role check: Only 'Admin' is permitted
    const role = requesterRole || (session.currentUser ? session.currentUser.role : null);
    if (role !== 'Admin') {
      return {
        success: false,
        error: 'Access Denied: Admin privileges required.'
      };
    }

    try {
      db.deleteUser(userId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  ipcMain.handle('delete-user', handleDeleteUser);
  ipcMain.handle('users:delete', handleDeleteUser);
};
