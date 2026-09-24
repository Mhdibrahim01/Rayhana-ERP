const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload Script - نظام أحمد لإدارة الفنادق
 * Secure Context Bridge exposing strictly controlled IPC channels.
 */
contextBridge.exposeInMainWorld('api', {
  // Authentication & Session
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: (logId) => ipcRenderer.invoke('auth:logout', logId),
  getCurrentUser: () => ipcRenderer.invoke('auth:get-current-user'),

  // Role-Based Access Control (RBAC) & User Management
  getAllUsers: () => ipcRenderer.invoke('users:get-all'),
  addUser: (userData, requesterRole) => ipcRenderer.invoke('add-user', { userData, requesterRole }),
  updateUserPassword: (data) => ipcRenderer.invoke('users:update-password', data),
  deleteUser: (userId, requesterRole) => ipcRenderer.invoke('delete-user', { userId, requesterRole }),
  getEmployeeLogs: () => ipcRenderer.invoke('logs:get-all'),

  // Analytics & Statistics
  getDashboardStats: () => ipcRenderer.invoke('dashboard:get-stats'),
  getMonthlyRevenue: () => ipcRenderer.invoke('analytics:get-monthly-revenue'),

  // Rooms
  getAllRooms: () => ipcRenderer.invoke('rooms:get-all'),
  getAvailableRooms: () => ipcRenderer.invoke('rooms:get-available'),
  updateRoomStatus: (roomId, status) => ipcRenderer.invoke('rooms:update-status', { roomId, status }),
  addRoom: (roomData) => ipcRenderer.invoke('rooms:add', roomData),
  updateRoom: (roomData) => ipcRenderer.invoke('rooms:update', roomData),
  deleteRoom: (roomId) => ipcRenderer.invoke('rooms:delete', roomId),

  // Reservations & Payments Ledger
  getAllReservations: () => ipcRenderer.invoke('reservations:get-all'),
  getTodayCheckouts: (date) => ipcRenderer.invoke('reservations:get-today-checkouts', date),
  createReservation: (reservationData) => ipcRenderer.invoke('reservations:create', reservationData),
  checkoutReservation: (reservationId) => ipcRenderer.invoke('reservations:checkout', reservationId),
  cancelReservation: (reservationId) => ipcRenderer.invoke('reservations:cancel', reservationId),
  addPayment: (paymentData) => ipcRenderer.invoke('add-payment', paymentData),
  getReservationPayments: (reservationId) => ipcRenderer.invoke('payments:get-by-reservation', reservationId),
  getPaymentReceipt: (receiptIdentifier) => ipcRenderer.invoke('payments:get-receipt', receiptIdentifier),
  autoUpdateRoomStatuses: () => ipcRenderer.invoke('rooms:auto-update-status'),

  // Guests & Customers
  getAllGuests: (params) => ipcRenderer.invoke('guests:get-all', params),
  getGuestsPaginated: (params) => ipcRenderer.invoke('guests:get-paginated', params),
  addCustomer: (customerData, requesterRole) => ipcRenderer.invoke('add-customer', { customerData, requesterRole }),
  searchGuest: (query) => ipcRenderer.invoke('guests:search', query),

  // Excel & CSV Bulk Import
  importGuests: (guestsData) => ipcRenderer.invoke('import-guests', guestsData),
  bulkImportGuests: (guestsList) => ipcRenderer.invoke('import-guests', guestsList),
  bulkImportReservations: (reservationsList) => ipcRenderer.invoke('excel:import-reservations', reservationsList),

  // System & Database Info, Backups & Reports
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  openDbFolder: () => ipcRenderer.invoke('app:open-db-folder'),
  factoryResetDatabase: (password) => ipcRenderer.invoke('app:factory-reset', { password }),
  createBackup: () => ipcRenderer.invoke('db:create-backup'),
  restoreBackup: () => ipcRenderer.invoke('db:restore-backup'),
  getDailyBackupStatus: () => ipcRenderer.invoke('backups:get-status'),
  runDailyBackupNow: () => ipcRenderer.invoke('backups:run-now'),
  openBackupsFolder: () => ipcRenderer.invoke('backups:open-folder'),
  selectBackupFolder: () => ipcRenderer.invoke('backups:select-folder'),
  resetBackupFolder: () => ipcRenderer.invoke('backups:reset-folder'),
  restoreDailyBackup: (filePath) => ipcRenderer.invoke('backups:restore-file', filePath),
  onDailyBackupEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('backup:daily-event', handler);
    return () => ipcRenderer.removeListener('backup:daily-event', handler);
  },
  getShiftAuditReport: (date) => ipcRenderer.invoke('reports:get-shift-audit', date),
  getInvoiceData: (reservationId) => ipcRenderer.invoke('reservations:get-invoice-data', reservationId),
  updateReservationReceipt: (data) => ipcRenderer.invoke('reservations:update-receipt', data),
  printToPdf: (options) => ipcRenderer.invoke('print:to-pdf', options),
  openPrintPreviewWindow: (options) => ipcRenderer.invoke('print:open-preview-window', options),
  openWhatsApp: (url) => ipcRenderer.invoke('open-whatsapp', url)
});
