/**
 * Rayhana ERP - Rooms IPC Handlers
 * Domain: ipc/rooms.js
 *
 * Access policy:
 *   - reads (get-all, get-available, get-revenue) and the automatic status refresher
 *     are available to any logged-in session, because the rooms grid, the booking
 *     form and checkout all depend on them.
 *   - inventory changes (add, update, delete) are Admin-only. Editing a room changes
 *     its nightly price and delete removes a row, so neither is front-desk work.
 *   - manual status overrides are available to any session: marking a room as
 *     cleaning or available after a guest leaves is daily operation, and the
 *     automatic refresher re-derives statuses from reservations on every launch.
 *
 * The role is read only from session.currentUser.role in the main process. Nothing
 * about the caller's role is taken from the renderer payload.
 */

module.exports = function registerRoomsIpc(ipcMain, { db, session, helpers }) {
  function requireAdmin() {
    if (!session.currentUser || session.currentUser.role !== 'Admin') {
      return { success: false, error: 'Access Denied: Admin privileges required.' };
    }
    return null;
  }

  function requireSession() {
    if (!session.currentUser) {
      return { success: false, error: 'غير مصرح: يرجى تسجيل الدخول أولاً.' };
    }
    return null;
  }

  // 4. Rooms
  ipcMain.handle('rooms:get-all', async () => {
    const denied = requireSession();
    if (denied) return denied;
    try {
      const rooms = db.getAllRooms();
      return { success: true, data: rooms };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:get-available', async () => {
    const denied = requireSession();
    if (denied) return denied;
    try {
      const available = db.getAvailableRooms();
      return { success: true, data: available };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:update-status', async (event, { roomId, status }) => {
    // Marking a room as cleaning/available after a guest leaves is daily front-desk
    // work, so any logged-in session may do it. This is cosmetic bookkeeping: the
    // automatic refresher re-derives statuses from reservation dates on every launch,
    // so a wrong manual status corrects itself. Add/edit/delete stay Admin-only
    // because editing a room changes its nightly price.
    const denied = requireSession();
    if (denied) return denied;
    try {
      db.updateRoomStatus(roomId, status);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:add', async (event, roomData) => {
    const denied = requireAdmin();
    if (denied) return denied;
    try {
      const newRoom = db.addRoom(roomData);
      return { success: true, data: newRoom };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:update', async (event, roomData) => {
    // Editing a room can change its nightly price, which feeds every future charge.
    const denied = requireAdmin();
    if (denied) return denied;
    try {
      const updated = db.updateRoom(roomData);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:delete', async (event, roomId) => {
    const denied = requireAdmin();
    if (denied) return denied;
    try {
      db.deleteRoom(roomId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:get-revenue', async (event, roomId) => {
    const denied = requireSession();
    if (denied) return denied;
    try {
      const revenueData = db.getRoomRevenueStats(roomId);
      return { success: true, data: revenueData };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:auto-update-status', async () => {
    // Read-only housekeeping derived from reservation dates. Any session may ask for
    // it; it writes nothing the caller controls.
    const denied = requireSession();
    if (denied) return denied;
    return helpers.updateAutomatedRoomStatuses();
  });
};
