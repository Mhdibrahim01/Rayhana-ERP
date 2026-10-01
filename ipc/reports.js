/**
 * Rayhana ERP - Reports, Analytics & Shift Audit IPC Handlers
 * Domain: ipc/reports.js
 */

module.exports = function registerReportsIpc(ipcMain, { db, session, helpers }) {
  // 3. Analytics & Statistics
  ipcMain.handle('dashboard:get-stats', async () => {
    try {
      const stats = db.getDashboardStats();
      return { success: true, data: stats };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('analytics:get-monthly-revenue', async () => {
    try {
      const monthlyData = db.getMonthlyRevenue();
      return { success: true, data: monthlyData };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 10. Shift Audit & Night Closing Report
  ipcMain.handle('reports:get-shift-audit', async (event, customDate, endDate) => {
    if (!session.currentUser || session.currentUser.role !== 'Admin') {
      return { success: false, error: 'غير مصرح: تقرير الوردية يتطلب صلاحيات مدير النظام (Admin).' };
    }
    try {
      let start = customDate;
      let end = endDate;

      if (customDate && typeof customDate === 'object') {
        start = customDate.startDate || customDate.date || customDate.customDate;
        end = customDate.endDate;
      }

      const date = start || helpers.getLocalDateString();
      const report = db.getShiftAuditReport(date, end);
      return { success: true, data: report, currentUser: session.currentUser };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
};
