/**
 * Rayhana ERP - Rooms IPC Handlers
 * Domain: ipc/rooms.js
 */

module.exports = function registerRoomsIpc(ipcMain, { db, helpers }) {
  // 4. Rooms
  ipcMain.handle('rooms:get-all', async () => {
    try {
      const rooms = db.getAllRooms();
      return { success: true, data: rooms };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:get-available', async () => {
    try {
      const available = db.getAvailableRooms();
      return { success: true, data: available };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:update-status', async (event, { roomId, status }) => {
    try {
      db.updateRoomStatus(roomId, status);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:add', async (event, roomData) => {
    try {
      const newRoom = db.addRoom(roomData);
      return { success: true, data: newRoom };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:update', async (event, roomData) => {
    try {
      const updated = db.updateRoom(roomData);
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:delete', async (event, roomId) => {
    try {
      db.deleteRoom(roomId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:get-revenue', async (event, roomId) => {
    try {
      const revenueData = db.getRoomRevenueStats(roomId);
      return { success: true, data: revenueData };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:auto-update-status', async () => {
    return helpers.updateAutomatedRoomStatuses();
  });
};
