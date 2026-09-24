const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require('electron');

// =============================================================================
// GPU & RENDERING ACCELERATION FLAGS (must be called before app.whenReady)
// These eliminate stuttering caused by heavy backdrop-filter on the Glassmorphism UI
// =============================================================================
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-oop-rasterization');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const backupScheduler = require('./backupScheduler');

let mainWindow = null;
let dbPath = '';
let currentUser = null;
let currentLogId = null;

/**
 * Creates the primary application window, starting on the login view.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 700,
    title: 'ريحانة للوحدات السكنية | Rayhana Residential Units',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Enable GPU compositing for smooth Glassmorphism backdrop-filter
      enableBlinkFeatures: 'CSSBackdropFilter',
      backgroundThrottling: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Initial screen is always login.html
  mainWindow.loadFile('login.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Resolves persistent SQLite database path in Windows AppData
 * Seamlessly migrates existing database to rayhana_erp.sqlite if found.
 */
function resolveDatabasePath() {
  const userDataDir = app.getPath('userData');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const newDbPath = path.join(userDataDir, 'rayhana_erp.sqlite');
  const legacyDbInUserData = path.join(userDataDir, 'ahmed_hotel_erp.sqlite');
  const legacyDbInOldAppData = path.join(app.getPath('appData'), 'ahmed-hotel-erp', 'ahmed_hotel_erp.sqlite');

  // Automatic Migration: If new DB does not exist yet, preserve old records
  if (!fs.existsSync(newDbPath)) {
    if (fs.existsSync(legacyDbInUserData)) {
      try {
        fs.copyFileSync(legacyDbInUserData, newDbPath);
        console.log('[DB Migration] تم ترحيل قاعدة البيانات السابقة إلى rayhana_erp.sqlite');
      } catch (e) {
        console.warn('[DB Migration Warning]:', e.message);
        return legacyDbInUserData;
      }
    } else if (fs.existsSync(legacyDbInOldAppData)) {
      try {
        fs.copyFileSync(legacyDbInOldAppData, newDbPath);
        console.log('[DB Migration] تم ترحيل قاعدة البيانات القديمة من ahmed-hotel-erp إلى rayhana_erp.sqlite');
      } catch (e) {
        console.warn('[DB Migration Warning]:', e.message);
      }
    }
  }

  return fs.existsSync(newDbPath) ? newDbPath : (fs.existsSync(legacyDbInUserData) ? legacyDbInUserData : newDbPath);
}

/**
 * Format local date as YYYY-MM-DD (immune to UTC timezone offsets)
 */
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Automated SQLite database backup with Microsoft OneDrive cloud sync
 * and multi-tier smart fallback (D:\ Drive -> AppData).
 */
function backupDatabase() {
  try {
    // 1. Resolve source SQLite database file
    let sourceDb = '';
    if (fs.existsSync(path.join(__dirname, 'database.sqlite'))) {
      sourceDb = path.join(__dirname, 'database.sqlite');
    } else if (typeof dbPath !== 'undefined' && dbPath && fs.existsSync(dbPath)) {
      sourceDb = dbPath;
    } else if (fs.existsSync(path.join(app.getPath('userData'), 'rayhana_erp.sqlite'))) {
      sourceDb = path.join(app.getPath('userData'), 'rayhana_erp.sqlite');
    } else {
      sourceDb = path.join(__dirname, 'database.sqlite');
    }

    if (!fs.existsSync(sourceDb)) {
      throw new Error(`ملف قاعدة البيانات المصدر غير موجود: ${sourceDb}`);
    }

    // 2. Prepare dynamic filename with current date (backup_YYYY-MM-DD.sqlite)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const backupFileName = `backup_${dateStr}.sqlite`;

    // 3. Detect custom backup directory or Microsoft OneDrive local path
    const customBackupDir = typeof backupScheduler !== 'undefined' && typeof backupScheduler.getCustomBackupDirectory === 'function' ? backupScheduler.getCustomBackupDirectory() : null;
    const oneDrivePath = process.env.OneDrive || process.env.OneDriveConsumer;
    let targetDir = '';
    let destinationLabel = '';

    if (customBackupDir && fs.existsSync(customBackupDir)) {
      targetDir = customBackupDir;
      destinationLabel = `مجلد النسخ المخصص المختار (${path.basename(customBackupDir)})`;
    } else if (oneDrivePath && fs.existsSync(oneDrivePath)) {
      // Step 2: Target Cloud Folder inside OneDrive
      targetDir = path.join(oneDrivePath, 'AhmedERP_Backups');
      destinationLabel = 'Microsoft OneDrive (سحابي - Cloud Sync)';
    } else {
      // Step 4: Smart Fallback (D:\AhmedERP_Backups or AppData)
      const dDrive = 'D:\\';
      const dDriveBackup = 'D:\\AhmedERP_Backups';

      if (fs.existsSync(dDrive)) {
        try {
          if (!fs.existsSync(dDriveBackup)) {
            fs.mkdirSync(dDriveBackup, { recursive: true });
          }
          targetDir = dDriveBackup;
          destinationLabel = 'القرص المحلي (D:\\ Drive Fallback)';
        } catch (dErr) {
          console.warn('[Backup] تعذر استخدام القرص D:\\:', dErr.message);
        }
      }

      // Last resort fallback to app.getPath('userData')
      if (!targetDir) {
        targetDir = path.join(app.getPath('userData'), 'AhmedERP_Backups');
        destinationLabel = 'مجلد بيانات التطبيق المحلي (AppData Last Resort)';
      }
    }

    // Ensure target folder exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFilePath = path.join(targetDir, backupFileName);

    // Step 3: Copy SQLite database file into destination
    if (typeof db !== 'undefined' && db && typeof db.createBackupCopy === 'function') {
      db.createBackupCopy(targetFilePath);
    } else {
      fs.copyFileSync(sourceDb, targetFilePath);
    }

    // Step 5: Log outcome to console for developer verification
    console.log(`=======================================================`);
    console.log(`[Backup System] ✓ تم إنشاء النسخة الاحتياطية بنجاح!`);
    console.log(`[Backup System] 📂 الوجهة: ${destinationLabel}`);
    console.log(`[Backup System] 📁 مسار المجلد: ${targetDir}`);
    console.log(`[Backup System] 📄 اسم الملف: ${backupFileName}`);
    console.log(`[Backup System] 📍 المسار النهائي: ${targetFilePath}`);
    console.log(`=======================================================`);

    return {
      success: true,
      destinationLabel,
      targetDir,
      backupFileName,
      targetFilePath
    };
  } catch (error) {
    console.error(`[Backup System] ✗ فشل إنشاء النسخة الاحتياطية:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Automated Room Status updater function in main.js
 * Checks Reservations table against the current date:
 * - If today's date falls between check_in_date and check_out_date -> update room to 'مشغولة' (Occupied)
 * - If check_out_date has passed -> update room to 'تنظيف' (Cleaning)
 */
function updateAutomatedRoomStatuses() {
  try {
    const today = getLocalDateString();
    const result = db.autoUpdateRoomStatuses(today);
    return result;
  } catch (err) {
    console.error('[Auto Room Status Error]:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Register all IPC channels
 */
function registerIpcHandlers() {
  // 1. Authentication & Session with Employee Logging
  ipcMain.handle('auth:login', async (event, { username, password }) => {
    try {
      const result = db.verifyUser(username, password);
      if (result.success) {
        currentUser = result.user;
        // Insert login activity record into EmployeeLogs
        currentLogId = db.logEmployeeLogin(currentUser.id);
        result.logId = currentLogId;
        if (mainWindow) {
          mainWindow.loadFile('dashboard.html');
        }
      }
      return result;
    } catch (err) {
      console.error('[Main IPC] خطأ في تسجيل الدخول:', err);
      return { success: false, message: 'حدث خطأ أثناء تسجيل الدخول.' };
    }
  });

  ipcMain.handle('auth:logout', async (event, logId) => {
    const targetLogId = logId || currentLogId;
    if (targetLogId) {
      db.logEmployeeLogout(targetLogId);
      currentLogId = null;
    }
    currentUser = null;
    if (mainWindow) {
      mainWindow.loadFile('login.html');
      mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.focus();
          mainWindow.focus();
        }
      });
    }
    return { success: true };
  });

  ipcMain.handle('auth:get-current-user', async () => {
    return currentUser;
  });

  // Employee Activity Logs (Admin Only)
  ipcMain.handle('logs:get-all', async () => {
    if (!currentUser || currentUser.role !== 'Admin') {
      return { success: false, error: 'غير مصرح: هذا القسم مخصص لمدير النظام فقط.' };
    }
    try {
      const logs = db.getEmployeeLogs();
      return { success: true, data: logs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 2. User Management & RBAC (Admin Only)
  ipcMain.handle('users:get-all', async () => {
    if (!currentUser || currentUser.role !== 'Admin') {
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
    const role = requesterRole || (currentUser ? currentUser.role : null);
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
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول.' };
    if (currentUser.role !== 'Admin' && currentUser.id !== parseInt(userId, 10)) {
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
    const role = requesterRole || (currentUser ? currentUser.role : null);
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

  // 5. Reservations
  ipcMain.handle('reservations:get-all', async () => {
    try {
      const list = db.getAllReservations();
      return { success: true, data: list };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // =========================================================================
  // Strict Backend Data Validations
  // =========================================================================
  function validateReservationData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'بيانات الحجز غير صالحة.' };
    }

    const guestName = (data.guestName || data.name || '').trim();
    const guestPhone = (data.guestPhone || data.phone || '').trim();
    const guestIdNumber = (data.guestIdNumber || data.id_number || '').trim();
    const roomId = data.roomId || data.room_id;
    const checkInDate = (data.checkInDate || data.check_in_date || '').trim();
    const checkOutDate = (data.checkOutDate || data.check_out_date || '').trim();
    const totalPrice = parseFloat(data.totalPrice !== undefined ? data.totalPrice : data.total_price);

    // 1. Required Fields: Name, Room, Total Price
    if (!guestName) {
      return { valid: false, error: 'اسم النزيل مطلوب ولا يمكن تركه فارغاً.' };
    }
    if (!roomId) {
      return { valid: false, error: 'يرجى تحديد الغرفة المراد حجزها.' };
    }
    if (isNaN(totalPrice) || totalPrice <= 0) {
      return { valid: false, error: 'السعر الإجمالي مطلوب ويجب أن يكون أكبر من الصفر.' };
    }

    // 2. Phone Number: Must start with '05' and be exactly 10 digits
    if (!guestPhone) {
      return { valid: false, error: 'رقم الجوال مطلوب لتأكيد الحجز.' };
    }
    if (!/^05\d{8}$/.test(guestPhone)) {
      return { valid: false, error: 'رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).' };
    }

    // 3. National ID (10 digits) OR Passport (6-9 alphanumeric characters)
    if (guestIdNumber && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(guestIdNumber)) {
      return { valid: false, error: 'رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.' };
    }

    // 4. Dates Logic: check_in_date cannot be in the past, check_out_date > check_in_date
    if (!checkInDate || !checkOutDate) {
      return { valid: false, error: 'تاريخ الوصول وتاريخ المغادرة مطلوبان.' };
    }

    const todayStr = getLocalDateString(new Date());
    if (checkInDate < todayStr) {
      return { valid: false, error: 'تاريخ الوصول لا يمكن أن يكون في الماضي (يجب أن يكون اليوم أو تاريخاً مستقبلياً).' };
    }
    if (checkOutDate <= checkInDate) {
      return { valid: false, error: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بشكل محدد.' };
    }

    return { valid: true };
  }

  function validateGuestData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'بيانات النزيل غير صالحة.' };
    }

    const name = (data.name || '').trim();
    const phone = (data.phone || '').trim();
    const id_number = (data.id_number || '').trim();

    // 1. Required Name
    if (!name) {
      return { valid: false, error: 'اسم النزيل مطلوب ولا يمكن تركه فارغاً.' };
    }

    // 2. Phone: Saudi format 05XXXXXXXX
    if (phone && !/^05\d{8}$/.test(phone)) {
      return { valid: false, error: 'رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).' };
    }

    // 3. National ID (10 digits) OR Passport (6-9 alphanumeric characters)
    if (id_number && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(id_number)) {
      return { valid: false, error: 'رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.' };
    }

    return { valid: true };
  }

  ipcMain.handle('reservations:create', async (event, data) => {
    try {
      const validation = validateReservationData(data);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      const result = db.createReservation(data);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reservations:checkout', async (event, id) => {
    try {
      const result = db.checkoutReservation(id);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reservations:cancel', async (event, id) => {
    try {
      const result = db.cancelReservation(id);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Subsequent Payment IPC Handler (تسجيل سداد دفعة جديدة للحجز مع تدقيق الحسابات وسند القبض)
  const handleAddPayment = async (event, data) => {
    try {
      const { reservationId, newAmount, amount, paymentMethod, userId, notes } = data || {};
      const targetId = parseInt(reservationId, 10);
      const payVal = db.roundMoney(newAmount !== undefined ? newAmount : amount);

      if (!targetId || isNaN(targetId)) {
        return { success: false, error: 'معرف الحجز غير صالح.' };
      }
      if (!Number.isFinite(payVal) || payVal <= 0) {
        return { success: false, error: 'يرجى إدخال مبلغ سداد صحيح وموجب أكبر من الصفر.' };
      }

      const activeUserId = userId || (currentUser ? currentUser.id : null);

      const result = db.addPaymentToReservation({
        reservationId: targetId,
        amount: payVal,
        paymentMethod: paymentMethod || 'نقداً',
        userId: activeUserId,
        notes: notes || 'سداد دفعة إقامة'
      });
      return result;
    } catch (err) {
      console.error('[Add Payment Error]:', err);
      return { success: false, error: err.message };
    }
  };

  ipcMain.handle('add-payment', handleAddPayment);
  ipcMain.handle('reservations:add-payment', handleAddPayment);

  // Payments Ledger History & Receipt Handlers
  ipcMain.handle('payments:get-by-reservation', async (event, reservationId) => {
    try {
      const payments = db.getReservationPayments(reservationId);
      return { success: true, data: payments };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('payments:get-receipt', async (event, receiptIdentifier) => {
    try {
      const receipt = db.getPaymentReceipt(receiptIdentifier);
      if (!receipt) {
        return { success: false, error: 'سند القبض غير موجود.' };
      }
      return { success: true, data: receipt };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Today's Check-outs (مغادرات اليوم) IPC Handler
  // Queries Reservations joining Guests and Rooms, filtering strictly where check_out_date = today
  ipcMain.handle('reservations:get-today-checkouts', async (event, customDate) => {
    try {
      updateAutomatedRoomStatuses();
      const today = customDate || getLocalDateString();
      const checkouts = db.getTodayCheckouts(today);
      return { success: true, data: checkouts, date: today };
    } catch (err) {
      console.error('[IPC Today Checkouts Error]:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('rooms:auto-update-status', async () => {
    return updateAutomatedRoomStatuses();
  });

  // 6. Guests & Customers (Server-Side Pagination)
  ipcMain.handle('guests:get-all', async (event, params = {}) => {
    try {
      if (params && (params.page !== undefined || params.limit !== undefined || params.search !== undefined)) {
        const result = db.getGuestsPaginated(params);
        return { 
          success: true, 
          data: result.data, 
          totalCount: result.pagination.totalCount,
          totalPages: result.pagination.totalPages,
          page: result.pagination.page,
          limit: result.pagination.limit,
          pagination: result.pagination 
        };
      }
      const guests = db.getAllGuests();
      return { success: true, data: guests, totalCount: guests.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('guests:get-paginated', async (event, params = {}) => {
    try {
      const result = db.getGuestsPaginated(params);
      return { 
        success: true, 
        data: result.data, 
        totalCount: result.pagination.totalCount,
        totalPages: result.pagination.totalPages,
        page: result.pagination.page,
        limit: result.pagination.limit,
        pagination: result.pagination 
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  const handleAddCustomer = async (event, arg1, arg2) => {
    let customerData = arg1;
    let requesterRole = arg2;

    if (arg1 && typeof arg1 === 'object') {
      if (arg1.customerData !== undefined) {
        customerData = arg1.customerData;
        requesterRole = arg1.requesterRole !== undefined ? arg1.requesterRole : requesterRole;
      } else if (arg1.requesterRole !== undefined) {
        requesterRole = arg1.requesterRole;
      }
    }

    // Role check: Both 'Admin' and 'User' (and legacy 'Staff') are permitted
    const role = requesterRole || (currentUser ? currentUser.role : null);
    if (role !== 'Admin' && role !== 'User' && role !== 'Staff') {
      return {
        success: false,
        error: 'Access Denied: Valid user role required.'
      };
    }

    // Validate guest/customer data strictly
    const validation = validateGuestData(customerData);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    try {
      const newCustomer = db.addCustomer(customerData);
      return { success: true, data: newCustomer };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  ipcMain.handle('add-customer', handleAddCustomer);
  ipcMain.handle('guests:add', handleAddCustomer);

  // Search Returning Guest for Auto-fill (by phone number or ID number)
  const handleSearchGuest = async (event, queryData) => {
    try {
      let guest = null;
      if (typeof queryData === 'string') {
        guest = db.findGuestByPhoneOrId(queryData);
      } else if (queryData && typeof queryData === 'object') {
        if (queryData.query) {
          guest = db.findGuestByPhoneOrId(queryData.query);
        } else {
          guest = db.searchGuest(queryData);
        }
      }
      return { success: true, guest: guest || null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  ipcMain.handle('guests:search', handleSearchGuest);
  ipcMain.handle('search-guest', handleSearchGuest);

  // 7. Excel & CSV Bulk Import
  const handleImportGuests = async (event, guestsList) => {
    try {
      if (!Array.isArray(guestsList) || guestsList.length === 0) {
        return { success: false, message: 'مصفوفة بيانات النزلاء فارغة أو غير صالحة.' };
      }
      const result = db.bulkImportGuests(guestsList);
      return {
        success: true,
        importedCount: result.inserted,
        updatedCount: result.updated || 0,
        skippedCount: result.skipped,
        totalCount: result.total,
        updatedGuests: result.updatedGuests || [],
        message: `تم استيراد ${result.inserted} عميل بنجاح!`
      };
    } catch (err) {
      console.error('[IPC import-guests] خطأ أثناء استيراد النزلاء:', err);
      return { success: false, error: err.message, message: `فشل الاستيراد: ${err.message}` };
    }
  };

  ipcMain.handle('import-guests', handleImportGuests);
  ipcMain.handle('excel:import-guests', handleImportGuests);

  ipcMain.handle('excel:import-reservations', async (event, reservationsList) => {
    try {
      const result = db.bulkImportReservations(reservationsList);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 8. System Info & Database Path
  ipcMain.handle('app:get-info', async () => {
    return {
      dbPath: dbPath,
      user: currentUser,
      logId: currentLogId,
      version: app.getVersion()
    };
  });

  ipcMain.handle('app:open-db-folder', async () => {
    try {
      if (fs.existsSync(dbPath)) {
        shell.showItemInFolder(dbPath);
        return { success: true };
      } else {
        shell.openPath(path.dirname(dbPath));
        return { success: true };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 8.1 Secure Factory Reset (Requires Admin Role & Admin Password)
  ipcMain.handle('app:factory-reset', async (event, { password }) => {
    try {
      if (!currentUser || currentUser.role !== 'Admin') {
        return { success: false, error: 'غير مصرح: تصفير بيانات النظام يتطلب صلاحيات مدير النظام (Admin).' };
      }
      if (!password || !password.trim()) {
        return { success: false, error: 'يرجى إدخال كلمة المرور لتأكيد تصفير البيانات.' };
      }

      // Verify admin credentials
      const verify = db.verifyUser(currentUser.username, password);
      if (!verify.success) {
        return { success: false, error: 'كلمة المرور غير صحيحة. تم إلغاء عملية التصفير لأسباب أمنية.' };
      }

      // Emergency pre-reset safety snapshot in backups folder
      try {
        const backupDir = path.join(path.dirname(dbPath), 'backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(dbPath, path.join(backupDir, `pre_reset_backup_${timestamp}.sqlite`));
      } catch (bErr) {
        console.warn('[Factory Reset] Pre-reset backup warning:', bErr.message);
      }

      // Perform factory reset in db layer
      await db.factoryReset(dbPath);

      // Re-link admin user in session
      const recheck = db.verifyUser('admin', 'admin');
      if (recheck.success) {
        currentUser = recheck.user;
      }

      return { success: true, message: 'تم تصفير كافة بيانات النظام واستعادة تهيئة المصنع بنجاح!' };
    } catch (err) {
      console.error('[Factory Reset Error]:', err);
      return { success: false, error: 'حدث خطأ أثناء تصفير قاعدة البيانات: ' + err.message };
    }
  });

  // 9. Invoice Data Fetching & Updating
  ipcMain.handle('reservations:get-invoice-data', async (event, reservationId) => {
    try {
      const data = db.getReservationById(reservationId);
      if (!data) return { success: false, error: 'لم يتم العثور على بيانات الحجز.' };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reservations:update-receipt', async (event, updateData) => {
    try {
      const res = db.updateReservationReceipt(updateData);
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 10. Shift Audit & Night Closing Report
  ipcMain.handle('reports:get-shift-audit', async (event, customDate) => {
    try {
      const date = customDate || getLocalDateString();
      const report = db.getShiftAuditReport(date);
      return { success: true, data: report, currentUser };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 11. Database Backup & Restore
  ipcMain.handle('db:create-backup', async () => {
    try {
      const defaultName = `rayhana_backup_${getLocalDateString()}.sqlite`;
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'حفظ نسخة احتياطية من قاعدة بيانات ريحانة للوحدات السكنية',
        defaultPath: defaultName,
        filters: [{ name: 'SQLite Database (*.sqlite)', extensions: ['sqlite', 'db'] }]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      db.createBackupCopy(filePath);

      // Automated local archive copy
      try {
        const autoBackupDir = path.join(path.dirname(dbPath), 'backups');
        if (!fs.existsSync(autoBackupDir)) {
          fs.mkdirSync(autoBackupDir, { recursive: true });
        }
        db.createBackupCopy(path.join(autoBackupDir, defaultName));
      } catch (e) {
        console.warn('[Auto-Backup Archive]:', e);
      }

      return { success: true, path: filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:restore-backup', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر ملف النسخة الاحتياطية للاستعادة (*.sqlite)',
        filters: [{ name: 'SQLite Database (*.sqlite, *.db)', extensions: ['sqlite', 'db'] }],
        properties: ['openFile']
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      await db.restoreDatabaseFile(filePaths[0]);
      return { success: true, restoredPath: filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 11.1 Daily Automated 12:00 AM Backup IPCs
  ipcMain.handle('backups:get-status', async () => {
    try {
      const status = backupScheduler.getBackupStatus();
      return { success: true, data: status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backups:run-now', async () => {
    try {
      const result = await backupScheduler.performDailyBackup('manual_request');
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backups:open-folder', async () => {
    try {
      return await backupScheduler.openBackupsFolder();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backups:restore-file', async (event, targetFilePath) => {
    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return { success: false, error: 'ملف النسخة الاحتياطية المحدد غير موجود.' };
    }
    try {
      await db.restoreDatabaseFile(targetFilePath);
      return { success: true, restoredPath: targetFilePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backups:run-onedrive-backup', async () => {
    return backupDatabase();
  });

  ipcMain.handle('backups:select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر مجلد حفظ النسخ الاحتياطية التلقائية',
        buttonLabel: 'اختيار هذا المجلد لحفظ النسخ',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const selectedDir = result.filePaths[0];
      const updateRes = backupScheduler.setCustomBackupDirectory(selectedDir);
      return {
        ...updateRes,
        folderPath: selectedDir
      };
    } catch (err) {
      console.error('[IPC backups:select-folder error]:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backups:reset-folder', async () => {
    try {
      const resetRes = backupScheduler.resetBackupDirectoryToDefault();
      return resetRes;
    } catch (err) {
      console.error('[IPC backups:reset-folder error]:', err);
      return { success: false, error: err.message };
    }
  });

  // 12. Native PDF Export & Dedicated Print Preview Window
  ipcMain.handle('print:to-pdf', async (event, { html, title, defaultFilename }) => {
    try {
      const defaultName = defaultFilename || `hotel_document_${getLocalDateString()}.pdf`;
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'تصدير وحفظ ملف PDF',
        defaultPath: defaultName,
        filters: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      // Invisible offscreen window to generate pixel-perfect A4 PDF
      const pdfWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const fullHtml = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>${title || 'مستند فندقي'}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 14mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: "Segoe UI", Tahoma, "Cairo", Arial, sans-serif;
              direction: rtl;
              text-align: right;
              background: white;
              color: #0f172a;
              padding: 0;
              margin: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            table { width: 100%; border-collapse: collapse; }
          </style>
        </head>
        <body>
          <div style="padding: 10px;">
            ${html}
          </div>
        </body>
        </html>
      `;

      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
      const pdfData = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      });

      fs.writeFileSync(filePath, pdfData);
      pdfWin.destroy();

      // Automatically open the saved PDF for the user!
      try {
        shell.openPath(filePath);
      } catch (e) {}

      return { success: true, filePath };
    } catch (err) {
      console.error('[PDF Export Error]:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('print:open-preview-window', async (event, { html, title }) => {
    try {
      const previewWin = new BrowserWindow({
        width: 960,
        height: 900,
        minWidth: 800,
        minHeight: 650,
        title: title || 'معاينة الطباعة الرسمية',
        autoHideMenuBar: true,
        backgroundColor: '#f8fafc',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const fullHtml = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>${title || 'معاينة الطباعة'}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 14mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: "Segoe UI", Tahoma, "Cairo", Arial, sans-serif;
              direction: rtl;
              text-align: right;
              background: #f1f5f9;
              color: #0f172a;
              padding: 24px;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .preview-toolbar {
              max-width: 820px;
              margin: 0 auto 16px auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: #1e1b4b;
              color: white;
              padding: 12px 20px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .btn-preview-print {
              background: #4f46e5;
              color: white;
              border: none;
              padding: 9px 20px;
              border-radius: 6px;
              font-weight: 700;
              cursor: pointer;
              font-size: 0.92rem;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .btn-preview-print:hover { background: #4338ca; }
            .sheet-card {
              max-width: 820px;
              margin: 0 auto;
              background: white;
              box-shadow: 0 10px 25px rgba(0,0,0,0.08);
              border-radius: 12px;
              padding: 30px;
            }
            @media print {
              body { background: white !important; padding: 0 !important; }
              .preview-toolbar { display: none !important; }
              .sheet-card { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: 100% !important; }
            }
          </style>
        </head>
        <body>
          <div class="preview-toolbar">
            <div style="font-weight: 800; font-size: 1.05rem;">📄 ${title || 'معاينة الطباعة الرسمية'}</div>
            <button class="btn-preview-print" onclick="window.print()">طباعة هذا المستند (Print) 🖨️</button>
          </div>
          <div class="sheet-card">
            ${html}
          </div>
        </body>
        </html>
      `;

      previewWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
      return { success: true };
    } catch (err) {
      console.error('[Preview Window Error]:', err);
      return { success: false, error: err.message };
    }
  });

  // 13. Open WhatsApp via OS Default Browser / App
  ipcMain.handle('open-whatsapp', async (event, url) => {
    try {
      if (!url || typeof url !== 'string' || !url.startsWith('https://wa.me/')) {
        return { success: false, error: 'رابط واتساب غير صالح.' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      console.error('[WhatsApp Open External Error]:', err);
      return { success: false, error: err.message };
    }
  });
}

// App Lifecycle
app.whenReady().then(async () => {
  try {
    dbPath = resolveDatabasePath();
    console.log('[Main] مسار قاعدة البيانات:', dbPath);
    await db.init(dbPath);
    updateAutomatedRoomStatuses();

    registerIpcHandlers();
    createWindow();

    // Start Daily 12:00 AM Automated Backup Scheduler
    await backupScheduler.initBackupScheduler({
      db,
      app,
      shell,
      Notification,
      getMainWindow: () => mainWindow
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('[Main] فشل في تشغيل التطبيق:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  backupScheduler.stopBackupScheduler();
  if (currentLogId) {
    db.logEmployeeLogout(currentLogId);
    currentLogId = null;
  }
  db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
