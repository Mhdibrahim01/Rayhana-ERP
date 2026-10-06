/**
 * نظام أحمد لإدارة الفنادق (Ahmed Hotel ERP)
 * Complete Interactive Multi-View Dashboard Script (dashboard.js)
 * Includes: RBAC, Chart.js Analytics, SheetJS Excel Import/Export
 */

(function () {
  'use strict';

  // State Caches
  let currentUser = null;
        

  // Chart Instances

  // Navigation Links & Views
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  const navAdmin = document.getElementById('nav-admin');
  const navLogs = document.getElementById('nav-logs');
  const viewSections = {
    overview: document.getElementById('view-overview'),
    reservations: document.getElementById('view-reservations'),
    rooms: document.getElementById('view-rooms'),
    guests: document.getElementById('view-guests'),
    admin: document.getElementById('view-admin'),
    logs: document.getElementById('view-logs')
  };
  const topbarHeading = document.getElementById('topbar-heading');
  const topbarSubheading = document.getElementById('topbar-subheading');
  const currentSystemTimeDisplay = document.getElementById('current-system-time');
  const activeBusinessDateDisplay = document.getElementById('active-business-date');

  const btnOpenFactoryReset = document.getElementById('btn-open-factory-reset');
  const factoryResetModal = document.getElementById('factory-reset-modal');
  const btnCloseFactoryReset = document.getElementById('btn-close-factory-reset');
  const btnCancelFactoryReset = document.getElementById('btn-cancel-factory-reset');
  const factoryResetForm = document.getElementById('factory-reset-form');
  const factoryResetPasswordInput = document.getElementById('factory-reset-password');
  const factoryResetErrorMsg = document.getElementById('factory-reset-error-msg');
  const btnSubmitFactoryReset = document.getElementById('btn-submit-factory-reset');
  // Header Elements
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayRole = document.getElementById('user-display-role');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenDb = document.getElementById('btn-open-db');
  const dbFileName = document.getElementById('db-file-name');

  // Overview Elements
  const statAvailableRooms = document.getElementById('stat-available-rooms');
  const statOccupiedRooms = document.getElementById('stat-occupied-rooms');
  const statCleaningRooms = document.getElementById('stat-cleaning-rooms');
  const statTotalReservations = document.getElementById('stat-total-reservations');

  // Today's Checkouts Widget Elements
  const todayCheckoutsTableBody = document.getElementById('today-checkouts-table-body');
  const todayCheckoutsEmpty = document.getElementById('today-checkouts-empty');
  const todayCheckoutsCountBadge = document.getElementById('today-checkouts-count-badge');
  const todayDateBadge = document.getElementById('today-date-badge');
  const btnRefreshCheckouts = document.getElementById('btn-refresh-checkouts');
  const todayCheckoutsSearch = document.getElementById('today-checkouts-search');
  const todayCheckoutsFilters = document.getElementById('today-checkouts-filters');

  // Reservation Form Elements
  const reservationForm = document.getElementById('reservation-form');
  const guestNameInput = document.getElementById('guest-name');
  const guestPhoneInput = document.getElementById('guest-phone');
  const guestPhoneError = document.getElementById('guest-phone-error');
  const guestIdNumberInput = document.getElementById('guest-id-number');
  const guestIdError = document.getElementById('guest-id-error');
  const roomSelect = document.getElementById('room-select');
  const bookingTypeSelect = document.getElementById('booking-type');
  const checkInInput = document.getElementById('check-in-date');
  const checkOutInput = document.getElementById('check-out-date');
  const nightlyRateInput = document.getElementById('nightly-rate-input');
  const discountAmountInput = document.getElementById('discount-amount-input');
  const discountReasonInput = document.getElementById('discount-reason-input');
  const roomDefaultRateBadge = document.getElementById('room-default-rate-badge');
  const priceCalculationBreakdown = document.getElementById('price-calculation-breakdown');
  const totalPriceInput = document.getElementById('total-price');
  const paymentMethodSelect = document.getElementById('payment-method');
  const paidAmountInput = document.getElementById('paid-amount');
  const depositAmountInput = document.getElementById('deposit-amount');
  const remainingBalanceVal = document.getElementById('remaining-balance-val');
  const btnClearForm = document.getElementById('btn-clear-form');
  const autofillGuestStatus = document.getElementById('autofill-guest-status');
  const autofillGuestMsg = document.getElementById('autofill-guest-msg');
  const autofillGuestBadge = document.getElementById('autofill-guest-badge');
  const bannedGuestWarning = document.getElementById('banned-guest-warning');
  const bannedGuestMsg = document.getElementById('banned-guest-msg');
  const overviewTableBody = document.getElementById('overview-table-body');
  const overviewEmpty = document.getElementById('overview-empty');

  // New Reservation Modal Elements
  const newReservationModal = document.getElementById('new-reservation-modal');
  const btnOpenNewReservationModal = document.getElementById('btn-open-new-reservation-modal');
  const btnCloseNewReservation = document.getElementById('btn-close-new-reservation');
  const btnResNewBooking = document.getElementById('btn-res-new-booking');

  // User Manual Modal Elements
  const btnOpenUserManual = document.getElementById('btn-open-user-manual');
  const navUserManual = document.getElementById('nav-user-manual');
  const userManualModal = document.getElementById('user-manual-modal');
  const btnCloseUserManual = document.getElementById('btn-close-user-manual');
  const btnCloseUserManualFooter = document.getElementById('btn-close-user-manual-footer');
  const btnPrintUserManual = document.getElementById('btn-print-user-manual');
  const manualSearchInput = document.getElementById('manual-search-input');
  const manualContentContainer = document.getElementById('manual-content-container');

  // Topbar Actions (Backup, Restore, Shift Audit)
  const btnOpenShiftAudit = document.getElementById('btn-open-shift-audit');
  const btnRunNightAudit = document.getElementById('btn-run-night-audit');
  const btnBackupDb = document.getElementById('btn-backup-db');
  const btnRestoreDb = document.getElementById('btn-restore-db');

  // Daily Automated Backup (12:00 AM) Modal Elements
  const btnDailyBackupModal = document.getElementById('btn-daily-backup-modal');
  const dailyBackupModal = document.getElementById('daily-backup-modal');
  const btnCloseDailyBackup = document.getElementById('btn-close-daily-backup');
  const btnOpenDailyBackupsFolder = document.getElementById('btn-open-daily-backups-folder');
  const btnChangeDailyBackupFolder = document.getElementById('btn-change-daily-backup-folder');
  const btnResetDailyBackupFolder = document.getElementById('btn-reset-daily-backup-folder');
  const dailyBackupFolderTypeBadge = document.getElementById('daily-backup-folder-type-badge');
  const dailyBackupTableCountBadge = document.getElementById('daily-backup-table-count-badge');
  const btnTriggerDailyBackupNow = document.getElementById('btn-trigger-daily-backup-now');
  const btnRefreshDailyBackups = document.getElementById('btn-refresh-daily-backups');
  const dailyBackupStatusBadge = document.getElementById('daily-backup-status-badge');
  const dailyBackupNextRun = document.getElementById('daily-backup-next-run');
  const dailyBackupLastTime = document.getElementById('daily-backup-last-time');
  const dailyBackupLastFile = document.getElementById('daily-backup-last-file');
  const dailyBackupTotalCount = document.getElementById('daily-backup-total-count');
  const dailyBackupFolderPathDisplay = document.getElementById('daily-backup-folder-path-display');
  const dailyBackupsTableBody = document.getElementById('daily-backups-table-body');
  const dailyBackupsEmpty = document.getElementById('daily-backups-empty');

  // Invoice Modal
  let currentInvoiceReservationId = null;
  let currentInvoiceData = null;
  const invoiceModal = document.getElementById('invoice-modal');
  const btnCloseInvoiceModal = document.getElementById('btn-close-invoice-modal');
  const btnTriggerPrintInvoice = document.getElementById('btn-trigger-print-invoice');
  const btnExportPdfInvoice = document.getElementById('btn-export-pdf-invoice');
  const btnPreviewWindowInvoice = document.getElementById('btn-preview-window-invoice');
  const btnEditInvoice = document.getElementById('btn-edit-invoice');
  const invoicePrintableArea = document.getElementById('invoice-printable-area');

  // Room Revenue Modal
  const roomRevenueModal = document.getElementById('room-revenue-modal');
  const btnCloseRoomRevenueModal = document.getElementById('btn-close-room-revenue-modal');
  const roomRevenueContent = document.getElementById('room-revenue-content');
  const roomRevenueModalTitle = document.getElementById('room-revenue-modal-title');

  // Edit Invoice Modal Elements
  const editInvoiceModal = document.getElementById('edit-invoice-modal');
  const btnCloseEditInvoice = document.getElementById('btn-close-edit-invoice');
  const btnCancelEditInv = document.getElementById('btn-cancel-edit-inv');
  const editInvoiceForm = document.getElementById('edit-invoice-form');
  const editInvResId = document.getElementById('edit-inv-res-id');
  const editInvGuestName = document.getElementById('edit-inv-guest-name');
  const editInvGuestPhone = document.getElementById('edit-inv-guest-phone');
  const editInvGuestId = document.getElementById('edit-inv-guest-id');
  const editInvTotalPrice = document.getElementById('edit-inv-total-price');
  const editInvPaidAmount = document.getElementById('edit-inv-paid-amount');
  const editInvDepositAmount = document.getElementById('edit-inv-deposit-amount');
  const editInvPaymentMethod = document.getElementById('edit-inv-payment-method');
  const editInvRemainingPreview = document.getElementById('edit-inv-remaining-preview');

  // Edit Guest Modal Elements
  const editGuestModal = document.getElementById('edit-guest-modal');
  const btnCloseEditGuest = document.getElementById('btn-close-edit-guest');
  const btnCancelEditGuest = document.getElementById('btn-cancel-edit-guest');
  const editGuestForm = document.getElementById('edit-guest-form');
  const editGuestId = document.getElementById('edit-guest-id');
  const editGuestName = document.getElementById('edit-guest-name');
  const editGuestPhone = document.getElementById('edit-guest-phone');
  const editGuestIdNumber = document.getElementById('edit-guest-id-number');
  const btnSaveEditGuest = document.getElementById('btn-save-edit-guest');

  // Shift Audit Modal
  const shiftAuditModal = document.getElementById('shift-audit-modal');
  const btnCloseShiftAudit = document.getElementById('btn-close-shift-audit');
  const btnPrintShiftAudit = document.getElementById('btn-print-shift-audit');
  const btnExportPdfShiftAudit = document.getElementById('btn-export-pdf-shift-audit');
  const btnPreviewWindowShiftAudit = document.getElementById('btn-preview-window-shift-audit');
  const shiftAuditContent = document.getElementById('shift-audit-content');

  // Extend Stay Modal Elements
  const extendStayModal = document.getElementById('extend-stay-modal');
  const btnCloseExtendStay = document.getElementById('btn-close-extend-stay');
  const btnCancelExtendStay = document.getElementById('btn-cancel-extend-stay');
  const extendStayForm = document.getElementById('extend-stay-form');
  const extendResId = document.getElementById('extend-res-id');
  const extendGuestNamePreview = document.getElementById('extend-guest-name-preview');
  const extendRoomPreview = document.getElementById('extend-room-preview');
  const extendCurrentCheckoutPreview = document.getElementById('extend-current-checkout-preview');
  const extendNightlyRatePreview = document.getElementById('extend-nightly-rate-preview');
  const extendNewCheckoutDate = document.getElementById('extend-new-checkout-date');
  const extendExtraNightsPreview = document.getElementById('extend-extra-nights-preview');
  const extendAdditionalCostPreview = document.getElementById('extend-additional-cost-preview');
  const extendNewTotalPreview = document.getElementById('extend-new-total-preview');
  const extendCollectNowToggle = document.getElementById('extend-collect-now-toggle');
  const extendPaymentFields = document.getElementById('extend-payment-fields');
  const extendSettleAmount = document.getElementById('extend-settle-amount');
  const extendPaymentMethod = document.getElementById('extend-payment-method');
  const btnConfirmExtendStay = document.getElementById('btn-confirm-extend-stay');
  const extendNightlyRateInput = document.getElementById('extend-nightly-rate-input');
  const extendDiscountInput = document.getElementById('extend-discount-input');
  const extendCalcRatePreview = document.getElementById('extend-calc-rate-preview');
  const extendDiscountBadge = document.getElementById('extend-discount-badge');

  // All Reservations Elements
  const allReservationsTableBody = document.getElementById('all-reservations-table-body');
  const allReservationsEmpty = document.getElementById('all-reservations-empty');
  const reservationsPagination = document.getElementById('reservations-pagination');
  const reservationsPaginationSummary = document.getElementById('reservations-pagination-summary');
  const reservationsPaginationPage = document.getElementById('reservations-pagination-page');
  const btnReservationsPrevPage = document.getElementById('btn-reservations-prev-page');
  const btnReservationsNextPage = document.getElementById('btn-reservations-next-page');
  const searchAllReservations = document.getElementById('search-all-reservations');
  const resFilterTabs = document.querySelectorAll('#res-filter-tabs .filter-tab-btn');
  const btnExportReservationsExcel = document.getElementById('btn-export-reservations-excel');
  const inputImportReservationsExcel = document.getElementById('input-import-reservations-excel');

  // Rooms Elements
  const roomsGridContainer = document.getElementById('rooms-grid-container');
  const roomsFilterTabs = document.querySelectorAll('#rooms-filter-tabs .filter-tab-btn');
  const searchRoomsInput = document.getElementById('search-rooms');
  const roomsBookingTypeTabs = document.querySelectorAll('#rooms-booking-type-tabs .filter-tab-btn');
  const roomsPaymentFilterTabs = document.querySelectorAll('#rooms-payment-filter-tabs .filter-tab-btn');
  const roomsPaymentFilterContainer = document.getElementById('rooms-payment-filter-container');
  const roomsFilterResult = document.getElementById('rooms-filter-result');
  const roomsClearFiltersButton = document.getElementById('rooms-clear-filters');
  const roomsActiveFilterCount = document.getElementById('rooms-active-filter-count');
  const btnToggleAddRoom = document.getElementById('btn-toggle-add-room');
  const addRoomPanel = document.getElementById('add-room-panel');
  const addRoomForm = document.getElementById('add-room-form');
  const btnCancelAddRoom = document.getElementById('btn-cancel-add-room');
  const newRoomNumber = document.getElementById('new-room-number');
  const newRoomType = document.getElementById('new-room-type');
  const newRoomPrice = document.getElementById('new-room-price');
  const newRoomStatus = document.getElementById('new-room-status');

  // Edit Room Modal Elements
  const editRoomModal = document.getElementById('edit-room-modal');
  const editRoomForm = document.getElementById('edit-room-form');
  const editRoomId = document.getElementById('edit-room-id');
  const editRoomNumber = document.getElementById('edit-room-number');
  const editRoomType = document.getElementById('edit-room-type');
  const editRoomPrice = document.getElementById('edit-room-price');
  const editRoomStatus = document.getElementById('edit-room-status');
  const editRoomStatusLockedHint = document.getElementById('edit-room-status-locked-hint');
  const btnCloseEditRoomModal = document.getElementById('btn-close-edit-room-modal');
  const btnCancelEditRoom = document.getElementById('btn-cancel-edit-room');
  const btnDeleteRoom = document.getElementById('btn-delete-room');

  // Guests Elements
  const importResultModal = document.getElementById('import-result-modal');
  const btnCloseImportResultModal = document.getElementById('btn-close-import-result-modal');
  const btnConfirmImportResult = document.getElementById('btn-confirm-import-result');
  const btnToggleUpdatedGuestsList = document.getElementById('btn-toggle-updated-guests-list');
  const importModalUpdatedContainer = document.getElementById('import-modal-updated-container');
  const importModalToggleArrow = document.getElementById('import-modal-toggle-arrow');
  const guestsTableBody = document.getElementById('guests-table-body');
  const guestsEmpty = document.getElementById('guests-empty');
  const searchGuests = document.getElementById('search-guests');
  const guestsBanFilterTabs = document.querySelectorAll('#guests-ban-filter-tabs .filter-tab-btn');
  const guestsCountBadge = document.getElementById('guests-count-badge');
  const btnExportGuestsExcel = document.getElementById('btn-export-guests-excel');
  const inputImportGuestsExcel = document.getElementById('input-import-guests-excel');
  const btnGuestsPrevPage = document.getElementById('btn-guests-prev-page');
  const btnGuestsNextPage = document.getElementById('btn-guests-next-page');
  const guestsCurrentPageEl = document.getElementById('guests-current-page');
  const guestsTotalPagesEl = document.getElementById('guests-total-pages');
  const guestsPageRangeEl = document.getElementById('guests-page-range');
  const guestsTotalCountEl = document.getElementById('guests-total-count');
  const btnToggleAddCustomer = document.getElementById('btn-toggle-add-customer');
  const addCustomerPanel = document.getElementById('add-customer-panel');
  const addCustomerForm = document.getElementById('add-customer-form');
  const btnCancelAddCustomer = document.getElementById('btn-cancel-add-customer');
  const newCustomerName = document.getElementById('new-customer-name');
  const newCustomerPhone = document.getElementById('new-customer-phone');
  const newCustomerId = document.getElementById('new-customer-id');

  // Admin Panel Elements
  const addUserForm = document.getElementById('add-user-form');
  const newUsernameInput = document.getElementById('new-username');
  const newUserPasswordInput = document.getElementById('new-user-password');
  const newUserRoleSelect = document.getElementById('new-user-role');
  const updatePasswordForm = document.getElementById('update-password-form');
  const currentAdminNewPasswordInput = document.getElementById('current-admin-new-password');
  const usersTableBody = document.getElementById('users-table-body');
  const btnRefreshUsers = document.getElementById('btn-refresh-users');

  // Employee Logs Elements
  const logsTableBody = document.getElementById('logs-table-body');
  const logsEmpty = document.getElementById('logs-empty');
  const searchLogs = document.getElementById('search-logs');
  const logsCountBadge = document.getElementById('logs-count-badge');
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');

  /**
   * Format local date as YYYY-MM-DD (immune to UTC timezone offsets)
   */
  function getLocalDateString(date) { return window.DashboardApp.Helpers.getLocalDateString(date); }

  function updateSystemClock() {
    if (!currentSystemTimeDisplay) return;
    currentSystemTimeDisplay.textContent = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  async function refreshHotelBusinessState() {
    if (!window.api || typeof window.api.getHotelBusinessState !== 'function') return null;
    const result = await window.api.getHotelBusinessState();
    if (!result || !result.success || !result.data) return null;
    const state = result.data;
    window.DashboardApp.State.businessDate = state.current_business_date;
    if (activeBusinessDateDisplay) {
      activeBusinessDateDisplay.textContent = state.current_business_date;
      activeBusinessDateDisplay.title = state.last_audit_at
        ? `آخر إقفال: ${state.last_audit_at}`
        : 'لم يتم تنفيذ إقفال فندقي بعد';
    }
    return state;
  }

  function isReservationOverdue(res) { return window.DashboardApp.Helpers.isReservationOverdue(res); }

  function renderOverdueBadge(isOverdue) { return window.DashboardApp.Helpers.renderOverdueBadge(isOverdue); }

  function roundMoney(val) { return window.DashboardApp.Helpers.roundMoney(val); }

  // Set default dates
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  checkInInput.value = getLocalDateString(today);
  checkOutInput.value = getLocalDateString(tomorrow);

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = "info") { return window.DashboardApp.Helpers.showToast(message, type); }

  // --- UNIVERSAL IN-APP CONFIRMATION MODAL (Zero Native Freeze) ---
  function showConfirmDialog({
    title = 'تأكيد الإجراء',
    message = 'هل أنت متأكد من رغبتك في المتابعة؟',
    confirmText = 'نعم، تأكيد',
    cancelText = 'إلغاء',
    isDanger = true
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('app-confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const btnConfirm = document.getElementById('btn-modal-confirm');
      const btnCancel = document.getElementById('btn-modal-cancel');
      const iconContainer = document.getElementById('confirm-modal-icon-container');

      if (!modal || !btnConfirm || !btnCancel) {
        resolve(window.confirm ? window.confirm(message) : true);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (btnCancel) btnCancel.textContent = cancelText;

      if (btnConfirm) {
        btnConfirm.textContent = confirmText;
        if (isDanger) {
          btnConfirm.className = 'btn btn-danger';
          btnConfirm.style.background = '#dc2626';
          btnConfirm.style.color = '#ffffff';
          btnConfirm.style.border = 'none';
          if (iconContainer) {
            iconContainer.style.background = 'rgba(239, 68, 68, 0.12)';
            iconContainer.style.color = '#dc2626';
            iconContainer.style.borderColor = 'rgba(239, 68, 68, 0.25)';
          }
        } else {
          btnConfirm.className = 'btn btn-primary';
          btnConfirm.style.background = 'var(--primary-accent, #1a4332)';
          btnConfirm.style.color = '#ffffff';
          btnConfirm.style.border = 'none';
          if (iconContainer) {
            iconContainer.style.background = 'rgba(26, 67, 50, 0.12)';
            iconContainer.style.color = 'var(--primary-accent, #1a4332)';
            iconContainer.style.borderColor = 'rgba(26, 67, 50, 0.25)';
          }
        }
      }

      const cleanup = (result) => {
        modal.style.display = 'none';
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeyDown);
        // Force window to restore active focus state
        window.focus();
        resolve(result);
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup(false);
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') cleanup(false);
      };

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeyDown);

      modal.style.display = 'flex';
      setTimeout(() => {
        btnConfirm.focus();
      }, 50);
    });
  }

  // --- UNIVERSAL IN-APP PROMPT MODAL (Zero Native Freeze) ---
  function showPromptDialog({
    title = 'إدخال بيانات',
    message = 'يرجى إدخال القيمة المطلوبة:',
    defaultValue = '',
    placeholder = '',
    confirmText = 'تأكيد',
    cancelText = 'إلغاء'
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('app-prompt-modal');
      const titleEl = document.getElementById('prompt-modal-title');
      const msgEl = document.getElementById('prompt-modal-message');
      const inputEl = document.getElementById('prompt-modal-input');
      const btnConfirm = document.getElementById('btn-prompt-confirm');
      const btnCancel = document.getElementById('btn-prompt-cancel');

      if (!modal || !btnConfirm || !btnCancel || !inputEl) {
        const val = window.prompt ? window.prompt(message, defaultValue) : defaultValue;
        resolve(val !== null ? val.trim() : null);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (btnConfirm) btnConfirm.textContent = confirmText;
      if (btnCancel) btnCancel.textContent = cancelText;
      inputEl.value = defaultValue;
      if (placeholder) inputEl.placeholder = placeholder;

      const cleanup = (result) => {
        modal.style.display = 'none';
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeyDown);
        window.focus();
        resolve(result);
      };

      const onConfirm = () => cleanup(inputEl.value.trim());
      const onCancel = () => cleanup(null);
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup(null);
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') cleanup(null);
        if (e.key === 'Enter') cleanup(inputEl.value.trim());
      };

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeyDown);

      modal.style.display = 'flex';
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    });
  }

  // --- MID-STAY PRO-RATED CANCELLATION MODAL WITH DEPARTURE DATE & ADMIN OVERRIDE ---

  // --- TAB / VIEW NAVIGATION SYSTEM ---
  // PERFORMANCE: Section visibility is switched INSTANTLY (synchronous DOM update).
  // Heavy data-loading calls are then deferred via requestAnimationFrame so the
  // browser paints the new empty view first, then fills it — zero navigation freeze.
  window.switchView = function (targetView) {
    const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : null);
    // RBAC Security Guard: Protect admin and logs views
    if ((targetView === 'admin' || targetView === 'logs') && activeRole !== 'Admin') {
      showToast('Access Denied: Admin privileges required. (عذراً: هذا القسم مخصص لمدير النظام فقط)', 'error');
      targetView = 'overview';
    }
    window.DashboardApp.State.activeView = targetView;

    // 1. INSTANT: Update navigation links active state (pure CSS class toggle — zero reflow)
    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.section === targetView);
    });

    // 2. INSTANT: Hide all sections, show target (simple display toggle — no layout calc)
    Object.keys(viewSections).forEach(key => {
      const section = viewSections[key];
      if (section) {
        section.style.display = key === targetView ? (key === 'overview' ? 'flex' : 'block') : 'none';
      }
    });

    // 3. INSTANT: Update topbar text (text swap — negligible cost)
    const titleMap = {
      overview: ['ريحانة للوحدات السكنية', 'Rayhana Suites • لوحة التحكم وإدارة العمليات'],
      reservations: ['سجل وإدارة الحجوزات', 'عرض وتتبع جميع الحجوزات المؤكدة والمكتملة والملغاة'],
      rooms: ['إدارة الغرف الفندقية', 'متابعة حالات الإشغال والغرف المتاحة ودورة النظافة'],
      guests: ['دليل وسجل النزلاء', 'Guest Directory • بيانات النزلاء وسجل الإقامات السابقة'],
      admin: ['لوحة الإدارة والمستخدمين', 'Admin Panel • إضافة وتعديل المستخدمين وتعيين الصلاحيات'],
      logs: ['سجل نشاط وحضور الموظفين', 'Employee Logs • متابعة أوقات تسجيل الدخول والخروج لكافة الموظفين']
    };
    if (titleMap[targetView]) {
      topbarHeading.textContent = titleMap[targetView][0];
      topbarSubheading.textContent = titleMap[targetView][1];
    }

    // 4. DEFERRED: Load data AFTER browser has painted the new blank section.
    // requestAnimationFrame ensures the paint happens before heavy JS executes.
    requestAnimationFrame(() => {
      switch (targetView) {
        case 'overview':     window.DashboardApp.Helpers.loadOverviewData();     break;
        case 'reservations': window.DashboardApp.Helpers.loadReservationsData(); break;
        case 'rooms':        window.DashboardApp.Helpers.loadRoomsData();        break;
        case 'guests':       window.DashboardApp.Helpers.loadGuestsData();       break;
        case 'admin':        window.DashboardApp.Helpers.loadAdminData();        break;
        case 'logs':         loadLogsData();         break;
      }
    });
  };

  // Attach click listeners to sidebar links
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;
      if (target) {
        window.switchView(target);
      }
    });
  });
  // OFFICIAL HOTEL TAX INVOICE & RECEIPT (FEATURE 1)
  // =========================================================================
  function fitInvoicePreviewToViewport() {
    if (!invoicePrintableArea || !invoiceModal || invoiceModal.style.display === 'none') return;
    const invoiceCard = invoicePrintableArea.firstElementChild;
    if (!invoiceCard) return;

    // Keep the complete receipt visible in the preview. Printed/PDF receipts use
    // the unscaled HTML, so this only adapts the on-screen modal to the window.
    invoiceCard.style.zoom = '1';
    const availableHeight = invoicePrintableArea.clientHeight;
    const availableWidth = invoicePrintableArea.clientWidth;
    if (!availableHeight || !availableWidth) return;

    const scale = Math.min(
      1,
      availableHeight / invoiceCard.scrollHeight,
      availableWidth / invoiceCard.scrollWidth
    );
    invoiceCard.style.zoom = String(scale);
  }

  window.addEventListener('resize', fitInvoicePreviewToViewport);

  async function openInvoiceModal(reservationId) {
    const targetId = parseInt(reservationId, 10);
    if (!targetId || isNaN(targetId)) {
      showToast('يرجى تحديد حجز صالح لعرض الفاتورة.', 'error');
      return;
    }

    currentInvoiceReservationId = targetId;

    try {
      const res = await window.api.getInvoiceData(targetId);
      if (!res || !res.success || !res.data) {
        showToast(res?.error || 'تعذر تحميل بيانات الفاتورة.', 'error');
        return;
      }

      const inv = res.data;
      currentInvoiceData = inv;
      const isContract = inv.booking_type === 'عقد مفتوح';
      // Monthly bookings print under the institution's own letterhead (name, unified
      // number, seal and signature) and bill the closed 30-night package rather than
      // the night count. Kept separate from `isContract`, which is the open-contract
      // type and is a different case entirely.
      const isMonthly = inv.booking_type === 'حجز شهري';
      const isCancelled = inv.status === 'ملغي';
      const total = isCancelled ? 0.0 : parseFloat(inv.total_price || 0);
      const paid = parseFloat(inv.paid_amount || 0);
      const deposit = parseFloat(inv.deposit_ledger_balance ?? inv.deposit_amount ?? 0);
      const legacyDeposit = Number(inv.deposit_legacy_unreconciled || 0) === 1;
      let invoiceDepositMovements = [];
      try {
        const depositRes = await window.api.getReservationDepositMovements(targetId);
        if (depositRes?.success && Array.isArray(depositRes.data)) invoiceDepositMovements = depositRes.data;
      } catch (_) { /* invoice can still render if the optional history query fails */ }
      const rawRemaining = total - paid;
      const isCredit = rawRemaining < -0.005;
      const remaining = isContract ? rawRemaining : Math.max(0, rawRemaining);

      // Compute total collected and total refunded from the payments ledger.
      let originalCollected = 0;
      let refundedTotal = 0;
      try {
        const paymentsRes = await window.api.getReservationPayments(targetId);
        if (paymentsRes && paymentsRes.success && Array.isArray(paymentsRes.data)) {
          for (const p of paymentsRes.data) {
            const amt = parseFloat(p.amount) || 0;
            if (amt > 0) {
              originalCollected += amt;
            } else if (amt < 0) {
              refundedTotal += Math.abs(amt);
            }
          }
        }
      } catch (_) { /* non-critical — invoice still renders without it */ }
      originalCollected = roundMoney(originalCollected);
      refundedTotal = roundMoney(refundedTotal);

      const d1 = inv.check_in_date ? new Date(inv.check_in_date) : null;
      const d2 = inv.check_out_date ? new Date(inv.check_out_date) : null;
      const isSameDay = Boolean(inv.check_in_date && inv.check_out_date && inv.check_in_date === inv.check_out_date);
      const nights = (d1 && d2 && d2 > d1) ? Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24))) : (isContract ? '-' : 1);
      const stayDurationText = isCancelled
        ? 'حجز ملغي (0 ليلة)'
        : (isContract
          ? 'عقد مفتوح (غير محدد)'
          : (inv.booking_type === 'استخدام يومي'
            ? 'يوم استخدام'
            : (isSameDay ? 'مغادرة في نفس اليوم (1 ليلة)' : `${nights} ${nights === 1 ? 'ليلة' : 'ليالٍ'}`)));

      // Monthly early checkout recorded under the contract policy: the invoice must
      // show the BOOKED nights and departure date, not the elapsed ones, and note
      // the early departure. Legacy rows have no checkout_policy and render as before.
      const isContractPolicy = inv.checkout_policy === 'contract';
      const isActualPolicy = inv.checkout_policy === 'actual';
      let bookedNights = null;
      let checkOutDisplay;
      if (isCancelled) {
        checkOutDisplay = `${escapeHtml(inv.check_out_date || '-')} (حجز ملغي)`;
      } else if (isContractPolicy && inv.booked_check_out_date) {
        const b1 = inv.check_in_date ? new Date(inv.check_in_date) : null;
        const b2 = new Date(inv.booked_check_out_date);
        if (b1 && b2 > b1) bookedNights = Math.max(1, Math.round((b2 - b1) / (1000 * 60 * 60 * 24)));
        const bookedWord = bookedNights === 1 ? 'ليلة' : 'ليالٍ';
        checkOutDisplay = `${escapeHtml(inv.check_out_date)} (غادر مبكراً — ${bookedNights} ${bookedWord} محجوزة حتى ${escapeHtml(inv.booked_check_out_date)})`;
      } else {
        checkOutDisplay = inv.check_out_date ? `${escapeHtml(inv.check_out_date)} (${stayDurationText})` : 'مفتوح (غير محدد)';
      }

      const policyNote = isContractPolicy
        ? 'تم الاحتساب بقيمة العقد الكاملة (لا يشمل استرداد الليالي غير المستخدمة).'
        : (isActualPolicy
          ? `تم الاحتساب بالليالي الفعلية بناء على استثناء معتمد: ${escapeHtml(inv.checkout_policy_reason || 'بدون سبب مذكور')}`
          : '');

      const effectiveNightlyRate = parseFloat(inv.custom_nightly_price || inv.price_per_night || 0);
      const discount = parseFloat(inv.discount_amount || 0);
      const discountReasonText = inv.discount_reason ? ` (${escapeHtml(inv.discount_reason)})` : '';
      const lateFee = parseFloat(inv.late_checkout_fee || 0);

      // "تعديل السند" rewrites the reservation total and paid amount. The main process
      // already refuses a non-Admin at the IPC boundary (ipc/reservations.js), and that
      // remains the real security boundary — this only avoids showing a button whose
      // action is guaranteed to fail.
      const activeInvoiceRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : null);
      if (btnEditInvoice) btnEditInvoice.style.display = activeInvoiceRole === 'Admin' ? '' : 'none';
      const hasCancellationAdjustment = (inv.status === 'ملغي جزئي' || inv.status === 'ملغي جزئياً') && inv.original_calculated_charge != null;
      // Under the contract policy the invoice bills the BOOKED nights, so the
      // subtotal must use those. Otherwise it would show 1 night x rate and
      // contradict the stored contract total.
      const invoiceNights = (isContractPolicy && bookedNights) ? bookedNights : nights;
      const invoiceDurationText = (isContractPolicy && bookedNights)
        ? `${bookedNights} ${bookedNights === 1 ? 'ليلة' : 'ليالٍ'} (قيمة العقد)`
        : stayDurationText;
      const baseSubtotal = (typeof invoiceNights === 'number' && invoiceNights > 0)
        ? (invoiceNights * effectiveNightlyRate)
        : (total + discount);
      const monthlyPackageSubtotal = roundMoney(effectiveNightlyRate * 30);
      const shownSubtotal = isMonthly ? monthlyPackageSubtotal : baseSubtotal;

      const reservationCreatedAt = window.DashboardApp.Helpers.parseStoredTimestamp(inv.created_at);
      const invoiceYear = (reservationCreatedAt || new Date()).getFullYear() || new Date().getFullYear();
      const invoiceNum = `SND-${invoiceYear}-${String(inv.id).padStart(5, '0')}`;
      const issuedAt = new Date();
      const printDate = issuedAt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      const printTime = issuedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

      invoicePrintableArea.innerHTML = `
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 28px; background: white; min-height: 186mm; display: flex; flex-direction: column;">
          <!-- Top Section: Company & Receipt Info -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 28px;">
            <!-- Company Info (Right) -->
            <div style="display: flex; gap: 16px; align-items: flex-start;">
             
              <div>
                <h2 style="font-size: 1.25rem; font-weight: 800; color: #1e293b; margin: 0 0 8px 0;">${isMonthly ? 'مؤسسة مكتب شمس المنازل للخدمات العقارية' : 'ريحانة للوحدات السكنية'}</h2>
                <div style="font-size: 0.85rem; color: #64748b; line-height: 1.6;">
                  <div>العنوان: الخبر - الثقبة - طريق الملك خالد</div>
                  <div>الرمز البريدي: 34625</div>
                  <div>هاتف الاستقبال: 0560631783</div>
                  ${isMonthly ? '<div>الرقم الموحد: 7038955915</div>' : ''}
                </div>
              </div>
            </div>

            <!-- Receipt Info (Left) -->
            <div style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 14px 18px; text-align: right; min-width: 220px;">
              <div style="display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 800; margin-bottom: 10px;">
                ${isCancelled ? 'سند حجز ملغي' : 'سند'}
              </div>
              <div style="font-size: 0.85rem; color: #475569; line-height: 1.7;">
                <div><span style="font-weight: 700; color: #1e293b;">رقم السند:</span> <span style="font-family: monospace; color: #4338ca; font-weight: 700;">${invoiceNum}</span></div>
                <div>تاريخ الإصدار: <bdi dir="auto" style="white-space: nowrap;">${escapeHtml(printDate)}</bdi></div>
                <div>الوقت: <bdi dir="ltr" style="white-space: nowrap;">${escapeHtml(printTime)}</bdi></div>
              </div>
              <div style="margin-top: 10px;">
                ${isCancelled
                  ? '<span class="badge badge-cancelled" style="font-size: 0.8rem; padding: 4px 10px;">حجز ملغي</span>'
                  : window.DashboardApp.Helpers.getPaymentStatusBadge(inv.payment_status)}
              </div>
            </div>
          </div>

          <!-- Details Section -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 28px; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 28px;">
            <!-- Guest Details -->
            <div>
              <h3 style="font-size: 0.95rem; font-weight: 800; color: #1e293b; margin: 0 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">بيانات النزيل (Guest Details)</h3>
              <div style="font-size: 0.85rem; line-height: 1.8; color: #475569;">
                <div><strong style="color: #1e293b;">اسم النزيل:</strong> ${escapeHtml(inv.guest_name)}</div>
                <div><strong style="color: #1e293b;">رقم الجوال:</strong> ${escapeHtml(inv.guest_phone || '-')}</div>
                <div><strong style="color: #1e293b;">رقم الهوية / الإقامة:</strong> ${escapeHtml(inv.guest_id_number || 'غير مسجل')}</div>
              </div>
            </div>

            <!-- Stay Details -->
            <div>
              <h3 style="font-size: 0.95rem; font-weight: 800; color: #1e293b; margin: 0 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">بيانات الإقامة والوحدة (Stay Details)</h3>
              <div style="font-size: 0.85rem; line-height: 1.8; color: #475569;">
                <div><strong style="color: #1e293b;">رقم الوحدة:</strong> ${escapeHtml(inv.room_number)} (${escapeHtml(inv.room_type || '')})</div>
                <div><strong style="color: #1e293b;">تاريخ الوصول (اليوم الفندقي):</strong> ${escapeHtml(inv.check_in_date)}</div>
                <div><strong style="color: #1e293b;">وقت الحجز المحلي:</strong> <span style="font-family: monospace;">${escapeHtml(inv.booking_time || '-')}</span></div>
                <div><strong style="color: #1e293b;">التاريخ والوقت الفعلي للتسجيل:</strong> ${escapeHtml(formatArabicDateTime(inv.created_at))}</div>
                <div><strong style="color: #1e293b;">تاريخ المغادرة:</strong> ${checkOutDisplay}</div>
                ${inv.checkout_time ? `<div><strong style="color: #1e293b;">وقت المغادرة:</strong> <span style="font-family: monospace;">${escapeHtml(inv.checkout_time)}</span></div>` : ''}
                ${policyNote ? `<div style="margin-top: 8px; padding: 6px 10px; border-radius: 6px; background: #eef2ff; color: #3730a3; font-size: 0.8rem; font-weight: 700;">${policyNote}</div>` : ''}
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <div style="margin-bottom: 28px; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; table-layout: fixed; word-break: break-word;">
              <colgroup>
                <col style="width: 48%;">
                <col style="width: 18%;">
                <col style="width: 14%;">
                <col style="width: 20%;">
              </colgroup>
              <thead>
                <tr style="background: #1e1b4b; color: white;">
                  <th style="padding: 12px 14px; text-align: right; border-radius: 0 8px 0 0; font-weight: 700;">الوصف والخدمة</th>
                  <th style="padding: 12px 14px; text-align: center; font-weight: 700;">سعر الليلة / اليوم</th>
                  <th style="padding: 12px 14px; text-align: center; font-weight: 700;">المدة</th>
                  <th style="padding: 12px 14px; text-align: left; border-radius: 8px 0 0 0; font-weight: 700;">المجموع</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #e2e8f0; ${isCancelled ? 'background: #fff8f8;' : ''}">
                  <td style="padding: 14px;">
                    <div style="font-weight: 700; color: #1e293b;">إقامة سكنية - وحدة ${escapeHtml(inv.room_number)} ${isContract ? '(عقد مفتوح)' : ''}</div>
                    <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                      ${isCancelled
                        ? '<span style="color: #dc2626; font-weight: 700;">(تم إبطال / إلغاء هذا الحجز بالكامل ولا توجد رسوم إقامة مستحقة)</span>'
                        : `نوع الوحدة: ${escapeHtml(inv.room_type || 'عادية')} ${inv.custom_nightly_price ? '<span style="color: #059669; font-weight: 700;">(سعر خاص معتمد)</span>' : ''}`}
                    </div>
                  </td>
                  <td style="padding: 14px; text-align: center; color: #475569;">${isCancelled ? '0 ريال' : `${effectiveNightlyRate.toLocaleString()} ريال`}</td>
                  <td style="padding: 14px; text-align: center; font-weight: 700; color: #475569;">${isMonthly ? 'شهر' : invoiceDurationText}</td>
                  <td style="padding: 14px; text-align: left; font-weight: 800; color: #1e1b4b;">${(isCancelled ? 0 : shownSubtotal).toLocaleString()} ريال</td>
                </tr>
                ${discount > 0 && !isCancelled ? `
                  <tr style="background: #fff1f2; border-bottom: 1px solid #ffe4e6;">
                    <td style="padding: 12px 14px;">
                      <div style="font-weight: 700; color: #dc2626;">خصم وتخفيض معتمد${discountReasonText}</div>
                      <div style="font-size: 0.75rem; color: #ef4444; margin-top: 2px;">تخفيض ممنوح على إجمالي قيمة الإقامة</div>
                    </td>
                    <td style="padding: 12px 14px; text-align: center; color: #ef4444;">-</td>
                    <td style="padding: 12px 14px; text-align: center; color: #ef4444;">-</td>
                    <td style="padding: 12px 14px; text-align: left; font-weight: 800; color: #dc2626;" dir="ltr">- ${discount.toFixed(2)} ريال</td>
                  </tr>
                ` : ''}
                ${lateFee > 0 && !isCancelled ? `
                  <tr style="background: #fff7ed; border-bottom: 1px solid #ffedd5;">
                    <td style="padding: 12px 14px;">
                      <div style="font-weight: 700; color: #c2410c;">مبلغ إضافي لتأخير المغادرة</div>
                      <div style="font-size: 0.75rem; color: #ea580c; margin-top: 2px;">تم اعتماده يدويًا عند التسوية</div>
                    </td>
                    <td style="padding: 12px 14px; text-align: center; color: #ea580c;">-</td>
                    <td style="padding: 12px 14px; text-align: center; color: #ea580c;">-</td>
                    <td style="padding: 12px 14px; text-align: left; font-weight: 800; color: #c2410c; white-space: nowrap;">+ ${lateFee.toFixed(2)} ريال</td>
                  </tr>
                ` : ''}
                ${hasCancellationAdjustment ? `
                  <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px 14px;">
                      <div style="font-weight: 700; color: #4338ca;">تعديل إداري معتمد لمبلغ الإلغاء</div>
                      <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">الحساب التلقائي الأصلي قبل التعديل: ${parseFloat(inv.original_calculated_charge).toLocaleString()} ريال</div>
                    </td>
                    <td style="padding: 12px 14px; text-align: center;">-</td>
                    <td style="padding: 12px 14px; text-align: center;">-</td>
                    <td style="padding: 12px 14px; text-align: left; font-weight: 800; color: #4338ca;">${parseFloat(inv.total_price || 0).toLocaleString()} ريال</td>
                  </tr>
                ` : ''}
                ${deposit > 0 ? `
                  <tr style="background: #fdf4ff; border-bottom: 1px solid #fae8ff;">
                    <td style="padding: 12px 14px;">
                      <div style="font-weight: 700; color: #701a75;">رصيد التأمين المسجل (Deposit Balance)</div>
                      <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">${legacyDeposit ? 'قيمة تاريخية بلا سند حركة، وتحتاج مراجعة قبل ردها' : 'مبلغ محفوظ للتأمين ويتطلب تسوية عند المغادرة'}</div>
                    </td>
                    <td style="padding: 12px 14px; text-align: center;">-</td>
                    <td style="padding: 12px 14px; text-align: center;">-</td>
                    <td style="padding: 12px 14px; text-align: left; font-weight: 700; color: #701a75;">${deposit.toLocaleString()} ريال</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>

          <!-- Footer Section: Totals and Signatures -->
          <div style="display: flex; flex-direction: row-reverse; justify-content: space-between; align-items: flex-start; gap: 32px; margin-top: 28px;">
            <!-- Totals Block -->
            <div style="width: 290px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; flex-shrink: 0; font-size: 0.88rem;">
              ${discount > 0 && !isCancelled ? `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #64748b; margin-bottom: 8px;">
                  <span>المجموع قبل الخصم:</span>
                  <span dir="ltr">${(total + discount).toFixed(2)} ريال</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: #dc2626; margin-bottom: 8px;">
                  <span>الخصم المعتمد:</span>
                  <span dir="ltr">- ${discount.toFixed(2)} ريال</span>
                </div>
              ` : ''}
              <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 1rem; color: #1e293b; margin-bottom: 8px;">
                <span>الإجمالي الصافي:</span>
                <span dir="ltr">${total.toFixed(2)} ريال</span>
              </div>
              ${(originalCollected > paid && refundedTotal > 0) ? `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #64748b; margin-bottom: 6px; font-size: 0.85rem;">
                  <span>المبلغ المسدد مسبقا:</span>
                  <span dir="ltr">${originalCollected.toFixed(2)} ريال</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; color: #1d4ed8; margin-bottom: 6px; font-size: 0.85rem; font-weight: 700;">
                  <span>المبلغ المسترد:</span>
                  <span dir="ltr">- ${refundedTotal.toFixed(2)} ريال</span>
                </div>
              ` : (refundedTotal > 0 ? `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #1d4ed8; font-weight: 700; margin-bottom: 8px;">
                  <span>المبلغ المسترد:</span>
                  <span dir="ltr">- ${refundedTotal.toFixed(2)} ريال</span>
                </div>
              ` : '')}
              <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: #059669; margin-bottom: 8px;">
                <span>${refundedTotal > 0 ? 'صافي المدفوع:' : 'المبلغ المدفوع:'}</span>
                <span dir="ltr">${paid.toFixed(2)} ريال</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-weight: 800; color: ${isCancelled ? '#059669' : (isCredit ? '#1d4ed8' : (remaining > 0 ? '#dc2626' : '#059669'))}; ${isCredit ? 'background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 10px; margin-top: 6px;' : ''}">
                <span>${isCancelled ? 'المبلغ المتبقي:' : (isCredit ? 'رصيد دائن للنزيل (مستحق له):' : 'المبلغ المتبقي:')}</span>
                <span dir="ltr">${isCancelled ? '0.00 ريال' : (isCredit ? `${Math.abs(rawRemaining).toFixed(2)} ريال` : `${remaining.toFixed(2)} ريال`)}</span>
              </div>
            </div>

            <!-- Stamps & Signatures (for monthly bookings) -->
            ${isMonthly ? `
            <div style="flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: start; text-align: center; margin-top: auto;">

              <!-- Stamp -->
              <div>
                <p style="font-weight: 700; color: #334155; margin: 0 0 12px; font-size: 0.9rem;">ختم المؤسسة</p>
                <div style="height: 100px; display: flex; align-items: flex-end; justify-content: center;">
                  <img src="assets/seal.svg"
                       style="width: 180px; height: auto; display: block;"
                       alt="الختم"
                       onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                  <div style="display: none; color: #6366f1; font-weight: 800; font-size: 0.75rem; line-height: 1.3;">ختم رسمي معتمد</div>
                </div>
              </div>

              <!-- Issuer Signature -->
              <div>
                <p style="font-weight: 700; color: #334155; margin: 0 0 12px; font-size: 0.9rem;">توقيع الموظف</p>
                <div style="height: 70px; display: flex; align-items: flex-end; justify-content: center;">
                  <div style="width: 160px; height: 70px; border-bottom: 1px solid #94a3b8; display: flex; align-items: flex-end; justify-content: center;">
                    <img src="assets/signature.svg" style="max-height: 65px; max-width: 100%; object-fit: contain;" alt="التوقيع"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <svg style="display: none; width: 100%; height: 35px; color: #1e40af; opacity: 0.75;" viewBox="0 0 100 30" preserveAspectRatio="none">
                      <path fill="none" stroke="currentColor" stroke-width="1.8" d="M10,20 Q30,5 50,20 T90,10"></path>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Receiver Signature -->
              <div>
                <p style="font-weight: 700; color: #334155; margin: 0 0 12px; font-size: 0.9rem;">توقيع المستلم</p>
                <div style="height: 100px; display: flex; align-items: flex-end; justify-content: center;">
                  <div style="width: 140px; height: 60px; border-bottom: 1px dashed #94a3b8;"></div>
                </div>
              </div>

            </div>
            ` : `
            <!-- Non-monthly standard note / signature placeholder -->
            <div style="flex: 1; display: flex; align-items: flex-end; justify-content: flex-start; padding-bottom: 8px;">
              <div style="color: #64748b; font-size: 0.82rem; line-height: 1.6;">
                <div>* يعتبر هذا المستند فاتورة وسند استلام رسمي ومعتمد.</div>
                <div>* نتمنى لكم إقامة سعيدة ومريحة.</div>
              </div>
            </div>
            `}
          </div>

          <!-- Payment Method & Notice -->
          <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <div>
              <span style="font-weight: 700; color: #1e293b;">طريقة السداد:</span>
              <span style="color: #475569; margin-right: 4px;">${escapeHtml(inv.payment_method || 'نقداً')}</span>
            </div>
            <div style="font-size: 0.78rem; color: #64748b;">
              * يعتبر هذا المستند سند استلام رسمي ومعتمد
            </div>
          </div>

          ${invoiceDepositMovements.length ? `
            <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #ddd6fe;">
              <h4 style="font-size: 0.9rem; font-weight: 800; color: #5b21b6; margin-bottom: 8px;">سجل حركات التأمين</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                <thead><tr style="background: #f5f3ff;"><th style="padding: 6px; text-align: right;">التاريخ</th><th style="padding: 6px; text-align: center;">الحركة</th><th style="padding: 6px; text-align: center;">المبلغ</th><th style="padding: 6px; text-align: center;">الطريقة</th><th style="padding: 6px; text-align: right;">السبب / الموظف</th></tr></thead>
                <tbody>${invoiceDepositMovements.map(m => {
                  const labels = { collected: 'استلام', reconciled: 'مطابقة رصيد قديم', refunded: 'رد', applied: 'تسوية على الإقامة', retained: 'احتفاظ' };
                  return `<tr style="border-bottom: 1px solid #ede9fe;"><td style="padding: 6px;">${escapeHtml(String(m.movement_date || '').slice(0, 16))}</td><td style="padding: 6px; text-align: center;">${labels[m.movement_type] || escapeHtml(m.movement_type)}</td><td style="padding: 6px; text-align: center;">${Number(m.amount || 0).toLocaleString()} ريال</td><td style="padding: 6px; text-align: center;">${escapeHtml(m.payment_method || 'نقداً')}</td><td style="padding: 6px;">${escapeHtml(m.reason || '')}${m.staff_username ? ` - ${escapeHtml(m.staff_username)}` : ''}</td></tr>`;
                }).join('')}</tbody>
              </table>
            </div>
          ` : ''}
        </div>
      `;

      if (invoiceModal) {
        invoiceModal.style.display = 'flex';
        requestAnimationFrame(fitInvoicePreviewToViewport);
      }
    } catch (err) {
      console.error('Invoice error:', err);
      showToast(`خطأ في عرض الفاتورة: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // SHIFT AUDIT & NIGHT CLOSING (FEATURE 5 - DATE RANGES & PRESETS)
  // =========================================================================
  let currentShiftAuditPreset = 'today';
  let currentShiftAuditStartDate = null;
  let currentShiftAuditEndDate = null;

  const ARABIC_MONTHS = window.DashboardApp.Helpers.ARABIC_MONTHS;

  function formatArabicDateRange(startDateStr, endDateStr) { return window.DashboardApp.Helpers.formatArabicDateRange(startDateStr, endDateStr); }

  function getShiftAuditPresetDates(preset) {
    const todayStr = window.DashboardApp.State.businessDate || getLocalDateString(new Date());
    const todayObj = new Date(`${todayStr}T12:00:00`);

    switch (preset) {
      case 'today':
        return { startDate: todayStr, endDate: todayStr };

      case 'week': {
        // Current week starting Saturday (Saudi Arabia standard)
        const day = todayObj.getDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
        const diffToSat = (day + 1) % 7;
        const startOfWeek = new Date(todayObj);
        startOfWeek.setDate(todayObj.getDate() - diffToSat);
        return { startDate: getLocalDateString(startOfWeek), endDate: todayStr };
      }

      case 'month': {
        // First day of current month to today
        const startOfMonth = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);
        return { startDate: getLocalDateString(startOfMonth), endDate: todayStr };
      }

      case 'quarter': {
        // First day of current 3-month quarter to today
        const currentMonth = todayObj.getMonth();
        const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
        const startOfQuarter = new Date(todayObj.getFullYear(), quarterStartMonth, 1);
        return { startDate: getLocalDateString(startOfQuarter), endDate: todayStr };
      }

      default:
        return { startDate: todayStr, endDate: todayStr };
    }
  }

  function ensureShiftAuditFilterBar() {
    let filterBar = document.getElementById('shift-audit-filter-bar');
    if (!filterBar && shiftAuditContent && shiftAuditContent.parentNode) {
      filterBar = document.createElement('div');
      filterBar.id = 'shift-audit-filter-bar';
      filterBar.className = 'no-print';
      filterBar.style.cssText = 'background: #1e293b; color: white; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; direction: rtl;';
      filterBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="font-weight: 700; font-size: 0.85rem; color: #94a3b8;">فترة التقرير:</span>
          <div class="audit-preset-pills" style="display: inline-flex; gap: 4px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
            <button type="button" class="btn-audit-preset" data-preset="today" style="border: none; background: #1a4332; color: #a7f3d0; padding: 6px 14px; border-radius: 6px; font-weight: 800; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;">اليوم</button>
            <button type="button" class="btn-audit-preset" data-preset="week" style="border: none; background: transparent; color: #cbd5e1; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;">هذا الأسبوع</button>
            <button type="button" class="btn-audit-preset" data-preset="month" style="border: none; background: transparent; color: #cbd5e1; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;">هذا الشهر</button>
            <button type="button" class="btn-audit-preset" data-preset="quarter" style="border: none; background: transparent; color: #cbd5e1; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;">هذا الربع</button>
            <button type="button" class="btn-audit-preset" data-preset="custom" style="border: none; background: transparent; color: #cbd5e1; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all 0.15s;">فترة مخصصة</button>
          </div>
        </div>
        <div id="shift-audit-custom-dates" style="display: none; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 0.8rem; color: #cbd5e1;">من:</span>
          <input type="date" id="shift-audit-custom-start" style="padding: 5px 8px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; font-size: 0.82rem; font-family: monospace;">
          <span style="font-size: 0.8rem; color: #cbd5e1;">إلى:</span>
          <input type="date" id="shift-audit-custom-end" style="padding: 5px 8px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; font-size: 0.82rem; font-family: monospace;">
          <button type="button" id="btn-apply-audit-custom" class="btn btn-sm" style="background: #1a4332; color: #a7f3d0; border: 1px solid #34d399; font-weight: 800; padding: 5px 12px; border-radius: 6px; cursor: pointer;">تطبيق</button>
        </div>
      `;

      shiftAuditContent.parentNode.insertBefore(filterBar, shiftAuditContent);

      const presetButtons = filterBar.querySelectorAll('.btn-audit-preset');
      const customDatesBox = filterBar.querySelector('#shift-audit-custom-dates');
      const customStartInput = filterBar.querySelector('#shift-audit-custom-start');
      const customEndInput = filterBar.querySelector('#shift-audit-custom-end');
      const btnApplyCustom = filterBar.querySelector('#btn-apply-audit-custom');

      presetButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const preset = btn.dataset.preset;
          currentShiftAuditPreset = preset;

          presetButtons.forEach(b => {
            const isActive = b === btn;
            b.style.background = isActive ? '#1a4332' : 'transparent';
            b.style.color = isActive ? '#a7f3d0' : '#cbd5e1';
            b.style.fontWeight = isActive ? '800' : '600';
          });

          if (preset === 'custom') {
            if (customDatesBox) customDatesBox.style.display = 'flex';
            if (customStartInput && !customStartInput.value) {
              customStartInput.value = currentShiftAuditStartDate || window.DashboardApp.State.businessDate || getLocalDateString();
            }
            if (customEndInput && !customEndInput.value) {
              customEndInput.value = currentShiftAuditEndDate || window.DashboardApp.State.businessDate || getLocalDateString();
            }
          } else {
            if (customDatesBox) customDatesBox.style.display = 'none';
            const dates = getShiftAuditPresetDates(preset);
            currentShiftAuditStartDate = dates.startDate;
            currentShiftAuditEndDate = dates.endDate;
            await renderShiftAuditData(dates.startDate, dates.endDate);
          }
        });
      });

      if (btnApplyCustom) {
        btnApplyCustom.addEventListener('click', async () => {
          const s = customStartInput ? customStartInput.value : '';
          const e = customEndInput ? customEndInput.value : '';
          if (!s || !e) {
            showToast('يرجى تحديد تاريخ البداية والنهاية للفترة المخصصة.', 'warning');
            return;
          }
          currentShiftAuditStartDate = s;
          currentShiftAuditEndDate = e;
          await renderShiftAuditData(s, e);
        });
      }
    }
  }

  async function renderShiftAuditData(startDate, endDate) {
    try {
      const start = startDate || window.DashboardApp.State.businessDate || getLocalDateString();
      const end = endDate || start;
      const res = await window.api.getShiftAuditReport({ startDate: start, endDate: end });
      if (!res || !res.success || !res.data) {
        showToast(res?.error || 'تعذر استخراج تقرير إقفال الوردية.', 'error');
        return;
      }

      const rep = res.data;
      const fin = rep.financials || {};
      const mov = rep.movements || {};
      const rm = rep.rooms || {};
      const payments = rep.payments || [];
      const txs = rep.transactions || [];
      const depositTxs = rep.depositMovements || [];
      const printTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const isMultiDay = Boolean(rep.isRange || (rep.startDate && rep.endDate && rep.startDate !== rep.endDate));
      const periodLabel = formatArabicDateRange(rep.startDate, rep.endDate);

      shiftAuditContent.innerHTML = `
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 26px; background: white;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 20px;">
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; margin: 0;">
                ${isMultiDay ? 'تقرير إقفال الفترة والموازنة المالية التراكمية' : 'تقرير الإقفال اليومي للوردية والموازنة المالية'}
              </h2>
              <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0 0 0;">
                ${isMultiDay ? 'Period Shift Audit & Financial Closing Reconciliation' : 'Daily Shift Audit & Financial Closing Reconciliation'}
              </p>
            </div>
            <div style="text-align: left; font-size: 0.82rem; color: #334155;">
              ${isMultiDay ? `
                <div>فترة التقرير: <strong>${escapeHtml(periodLabel)}</strong></div>
                <div style="font-size: 0.76rem; color: #64748b; font-family: monospace;">(${rep.startDate} إلى ${rep.endDate})</div>
              ` : `
                <div>التاريخ المستهدف: <strong>${rep.date}</strong></div>
              `}
              <div>وقت الاستخراج: <span>${printTime}</span></div>
              <div>المشرف المنفذ: <strong>${escapeHtml(currentUser?.username || 'الإدارة')}</strong></div>
            </div>
          </div>

          <!-- Financial KPIs Grid -->
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin-bottom: 12px;">1. ملخص الإيرادات والمقبوضات المالية حسب وسيلة الدفع</h4>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
            <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 0.78rem; color: #4338ca; font-weight: 700;">إجمالي المقبوضات</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #1e1b4b; margin-top: 4px;">${parseFloat(fin.totalRevenue || 0).toLocaleString()} <span style="font-size: 0.75rem;">ريال</span></div>
            </div>
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 0.78rem; color: #047857; font-weight: 700;">مقبوضات نقداً (كاش)</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #065f46; margin-top: 4px;">${parseFloat(fin.cashTotal || 0).toLocaleString()} <span style="font-size: 0.75rem;">ريال</span></div>
              <div style="font-size: 0.68rem; color: #64748b; margin-top: 3px;">${parseFloat(fin.cashCollected || 0).toLocaleString()} مستلم - ${parseFloat(fin.cashRefunded || 0).toLocaleString()} مردود</div>
            </div>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 0.78rem; color: #1d4ed8; font-weight: 700;">مقبوضات مدى / شبكة</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #1e40af; margin-top: 4px;">${parseFloat(fin.cardTotal || 0).toLocaleString()} <span style="font-size: 0.75rem;">ريال</span></div>
            </div>
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 0.78rem; color: #b45309; font-weight: 700;">مبالغ لم تحصّل بعد</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #92400e; margin-top: 4px;">${parseFloat(fin.outstandingTotal || 0).toLocaleString()} <span style="font-size: 0.75rem;">ريال</span></div>
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin: -10px 0 24px; font-size: 0.84rem; color: #334155;">
            <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <span>صافي كاش التأمين: <strong style="color: ${Number(fin.netCashDeposit || 0) < 0 ? '#dc2626' : '#047857'};">${Number(fin.netCashDeposit || 0) > 0 ? '+' : ''}${parseFloat(fin.netCashDeposit || 0).toLocaleString()} ريال</strong></span>
              <span style="color: #64748b;">(${parseFloat(fin.depositCashCollected || 0).toLocaleString()} مستلم - ${parseFloat(fin.depositCashRefunded || 0).toLocaleString()} مردود${Number(fin.depositCashRetained || 0) ? ` - ${parseFloat(fin.depositCashRetained).toLocaleString()} محتفَظ به ومدرج ضمن المقبوضات` : ''})</span>
              <span>إجمالي النقد المتوقع بالخزينة: <strong style="color: #0f172a;">${parseFloat(fin.expectedCashInDrawer || 0).toLocaleString()} ريال</strong> <span style="color: #64748b;">(كاش المقبوضات + صافي كاش التأمين)</span></span>
              <span>رسوم التأخير المسددة كسند مستقل: <strong>${parseFloat(fin.lateCheckoutFeesCollected || 0).toLocaleString()} ريال</strong></span>
            </div>
          </div>

          <!-- Occupancy & Movements -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
              <h4 style="font-size: 0.88rem; font-weight: 800; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                <span>2. ${isMultiDay ? 'الحالة الحالية للغرف (لحظية الآن)' : 'حالة ونسبة إشغال الفندق (Occupancy Rate)'}</span>
                ${isMultiDay ? '<span style="font-size: 0.72rem; color: #4338ca; background: #e0e7ff; padding: 2px 7px; border-radius: 5px; font-weight: 700;">حالة حية وليست تراكمية</span>' : ''}
              </h4>
              <div style="font-size: 0.84rem; line-height: 1.8; color: #1e293b;">
                <div style="display: flex; justify-content: space-between;"><span>إجمالي غرف الفندق:</span> <strong>${rm.totalRooms || 0} غرف</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>الغرف المشغولة حالياً:</span> <strong style="color: #dc2626;">${rm.occupiedCount || 0}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>الغرف المتاحة حالياً:</span> <strong style="color: #059669;">${rm.availableCount || 0}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>الغرف قيد التنظيف:</span> <strong style="color: #d97706;">${rm.cleaningCount || 0}</strong></div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; font-weight: 800; color: #4338ca;">
                  <span>نسبة الإشغال اللحظية:</span>
                  <span>${rm.occupancyRate || 0}%</span>
                </div>
              </div>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
              <h4 style="font-size: 0.88rem; font-weight: 800; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
                ${isMultiDay ? '3. حركة النزلاء خلال الفترة (Movements in Period)' : '3. حركة النزلاء خلال اليوم (Daily Movements)'}
              </h4>
              <div style="font-size: 0.84rem; line-height: 1.8; color: #1e293b;">
                <div style="display: flex; justify-content: space-between;">
                  <span>${isMultiDay ? 'إجمالي تسجيلات الدخول في الفترة (Check-ins):' : 'عمليات تسجيل الدخول اليوم (Check-ins):'}</span>
                  <strong style="color: #059669;">${mov.checkinsToday || 0}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span>${isMultiDay ? 'إجمالي تسجيلات المغادرة في الفترة (Check-outs):' : 'عمليات تسجيل الخروج اليوم (Check-outs):'}</span>
                  <strong style="color: #d97706;">${mov.checkoutsToday || 0}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span>${isMultiDay ? 'إجمالي الحجوزات النشطة في الفترة:' : 'إجمالي الحجوزات المنفذة اليوم:'}</span>
                  <strong>${mov.totalReservationsToday || 0}</strong>
                </div>
              </div>
            </div>
          </div>

          ${(isMultiDay && rep.dailyBreakdown && rep.dailyBreakdown.length > 1) ? `
            <!-- Daily Breakdown Trend (Range Mode) -->
            <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin-bottom: 10px;">4. الحركة اليومية وتوزيع الإيرادات عبر أيام الفترة</h4>
            <div style="max-height: 240px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">
                  <tr style="border-bottom: 2px solid #cbd5e1;">
                    <th style="padding: 8px 12px; text-align: right;">التاريخ</th>
                    <th style="padding: 8px 12px; text-align: center;">تسجيلات دخول</th>
                    <th style="padding: 8px 12px; text-align: center;">تسجيلات خروج</th>
                    <th style="padding: 8px 12px; text-align: left;">المتحصلات اليومية</th>
                  </tr>
                </thead>
                <tbody>
                  ${rep.dailyBreakdown.map(day => `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 7px 12px; font-family: monospace; font-weight: 700; color: #334155;">${day.date}</td>
                      <td style="padding: 7px 12px; text-align: center; color: #059669; font-weight: 700;">${day.check_ins_count}</td>
                      <td style="padding: 7px 12px; text-align: center; color: #d97706; font-weight: 700;">${day.check_outs_count}</td>
                      <td style="padding: 7px 12px; text-align: left; font-weight: 800; color: #1e1b4b;">${Number(day.revenue).toLocaleString()} ريال</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <!-- Payments & Receipts Breakdown (Ledger) -->
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin-bottom: 10px;">
            ${isMultiDay ? '4. سجل سندات التحصيل والمردودات المالية في الفترة (حركة الخزينة والمدفوعات)' : '4. سجل سندات التحصيل والمردودات المالية في هذا اليوم (حركة الخزينة والمدفوعات)'}
          </h4>
          ${payments.length === 0 ? `
            <div style="padding: 16px; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 0.85rem; margin-bottom: 24px;">
              لا توجد سندات قبض أو استرداد مسجلة في هذه الفترة.
            </div>
          ` : `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.82rem;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px 10px; text-align: right;">وقت العملية / تاريخ العمل</th>
                  <th style="padding: 8px 10px; text-align: right;">رقم السند</th>
                  <th style="padding: 8px 10px; text-align: right;">الحجز / النزيل</th>
                  <th style="padding: 8px 10px; text-align: right;">الغرفة</th>
                  <th style="padding: 8px 10px; text-align: center;">نوع السند</th>
                  <th style="padding: 8px 10px; text-align: center;">تصنيف الدفعة</th>
                  <th style="padding: 8px 10px; text-align: center;">طريقة الدفع</th>
                  <th style="padding: 8px 10px; text-align: center;">المبلغ</th>
                  <th style="padding: 8px 10px; text-align: right;">البيان / الموظف</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(p => {
                  const amt = roundMoney(p.amount || 0);
                  const isRefund = amt < -0.005;
                  const amtColor = isRefund ? '#dc2626' : '#059669';
                  const formattedAmt = isRefund ? `- ${Math.abs(amt).toLocaleString()} ريال` : `+ ${amt.toLocaleString()} ريال`;
                  const paymentPurpose = ({
                    advance_payment: 'دفعة مقدمة',
                    balance_payment: 'سداد رصيد',
                    extension_payment: 'تمديد إقامة',
                    late_checkout_fee: 'رسوم تأخير مغادرة',
                    checkout_settlement: 'تسوية مغادرة',
                    refund: 'استرداد',
                    deposit_applied: 'تطبيق تأمين',
                    legacy_unclassified: 'قديم / غير مصنف'
                  })[p.payment_type] || 'قديم / غير مصنف';
                  const typeBadge = isRefund
                    ? '<span style="background: #fef2f2; color: #b91c1c; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.78rem;">استرداد / صرف</span>'
                    : '<span style="background: #ecfdf5; color: #047857; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.78rem;">تحصيل / قبض</span>';
                  return `
                    <tr style="border-bottom: 1px solid #e2e8f0; ${isRefund ? 'background: #fffafa;' : ''}">
                      <td style="padding: 8px 10px; color: #64748b;"><div style="font-family: monospace;">${escapeHtml(String(p.payment_date || p.created_at || '').slice(0, 16))}</div><small style="display:block; margin-top:3px; color:#1a4332;">تاريخ العمل: ${escapeHtml(p.business_date || '-')}</small></td>
                      <td style="padding: 8px 10px; font-family: monospace; font-weight: 700; color: #4338ca;">${escapeHtml(p.receipt_number || ('#' + p.id))}</td>
                      <td style="padding: 8px 10px; font-weight: 700;">#${p.reservation_id} - ${escapeHtml(p.guest_name || 'نزيل')}</td>
                      <td style="padding: 8px 10px;">غرفة ${escapeHtml(p.room_number || '-')}</td>
                      <td style="padding: 8px 10px; text-align: center;">${typeBadge}</td>
                      <td style="padding: 8px 10px; text-align: center;">${escapeHtml(paymentPurpose)}</td>
                      <td style="padding: 8px 10px; text-align: center;">${escapeHtml(p.payment_method || 'نقداً')}</td>
                      <td style="padding: 8px 10px; text-align: center; font-weight: 800; color: ${amtColor}; font-size: 0.88rem;">${formattedAmt}</td>
                      <td style="padding: 8px 10px; font-size: 0.78rem; color: #475569;">${escapeHtml(p.notes || '-')}${p.staff_username ? ` <span style="color:#94a3b8;">(${escapeHtml(p.staff_username)})</span>` : ''}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}

          <!-- Reservations Breakdown -->
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin-bottom: 10px;">
            ${isMultiDay ? '5. سجل حركة الحجوزات والإقامة في الفترة' : '5. سجل حركة الحجوزات والإقامة في هذا اليوم'}
          </h4>
          ${txs.length === 0 ? `
            <div style="padding: 16px; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 0.85rem; margin-bottom: 24px;">
              لا توجد حجوزات مسجلة في هذه الفترة.
            </div>
          ` : `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.82rem;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px 10px; text-align: right;">الحجز</th>
                  <th style="padding: 8px 10px; text-align: right;">النزيل</th>
                  <th style="padding: 8px 10px; text-align: right;">الغرفة</th>
                  <th style="padding: 8px 10px; text-align: center;">فترة الإقامة</th>
                  <th style="padding: 8px 10px; text-align: center;">طريقة الدفع</th>
                  <th style="padding: 8px 10px; text-align: center;">المدفوع</th>
                  <th style="padding: 8px 10px; text-align: center;">رصيد التأمين</th>
                  <th style="padding: 8px 10px; text-align: center;">حالة الحجز</th>
                  <th style="padding: 8px 10px; text-align: center;">حالة السداد</th>
                </tr>
              </thead>
              <tbody>
                ${txs.map(t => {
                  const checkIn = t.check_in_date || '-';
                  const checkOut = t.check_out_date || '-';
                  const isSameDayStay = checkIn !== '-' && checkIn === checkOut;
                  const stayText = isSameDayStay ? `${escapeHtml(checkIn)} (نفس اليوم)` : `${escapeHtml(checkIn)} &larr; ${escapeHtml(checkOut)}`;
                  const isCancelledRow = t.status === 'ملغي';
                  return `
                  <tr style="border-bottom: 1px solid #e2e8f0; ${isCancelledRow ? 'background: #fff5f5; opacity: 0.88;' : ''}">
                    <td style="padding: 8px 10px; font-family: monospace; font-weight: 700;">#${t.id}</td>
                    <td style="padding: 8px 10px; font-weight: 700;">${escapeHtml(t.guest_name)}</td>
                    <td style="padding: 8px 10px;">غرفة ${escapeHtml(t.room_number)}</td>
                    <td style="padding: 8px 10px; text-align: center; font-size: 0.78rem; direction: ltr;">${stayText}</td>
                    <td style="padding: 8px 10px; text-align: center;">${escapeHtml(t.payment_method || 'نقداً')}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #059669;">${parseFloat(t.paid_amount || 0).toLocaleString()} ريال</td>
                    <td style="padding: 8px 10px; text-align: center; color: #701a75;">${parseFloat(t.deposit_ledger_balance || 0).toLocaleString()} ريال</td>
                    <td style="padding: 8px 10px; text-align: center;">${window.DashboardApp.Helpers.getReservationStatusBadge(t.status)}</td>
                    <td style="padding: 8px 10px; text-align: center;">${window.DashboardApp.Helpers.getPaymentStatusBadge(t.payment_status)}</td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          `}

          <h4 style="font-size: 0.95rem; font-weight: 800; color: #5b21b6; margin: 8px 0 10px;">حركات التأمين المسجلة خلال الفترة (لا تدخل ضمن المقبوضات)</h4>
          ${depositTxs.length === 0 ? `
            <div style="padding: 12px; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; color: #6b7280; font-size: .82rem; margin-bottom: 22px;">لا توجد حركات تأمين مسجلة خلال هذه الفترة.</div>
          ` : `
            <table style="width:100%; border-collapse:collapse; margin-bottom:22px; font-size:.8rem;">
              <thead><tr style="background:#f5f3ff; border-bottom:2px solid #ddd6fe;">
                <th style="padding:7px; text-align:right;">وقت الحركة / تاريخ العمل</th><th style="padding:7px; text-align:right;">الحجز / النزيل</th><th style="padding:7px; text-align:center;">الحركة</th><th style="padding:7px; text-align:center;">المبلغ</th><th style="padding:7px; text-align:center;">الطريقة</th><th style="padding:7px; text-align:right;">السبب / الموظف</th>
              </tr></thead><tbody>
                ${depositTxs.map(d => {
                  const labels = { collected: 'استلام', reconciled: 'مطابقة رصيد قديم', refunded: 'رد', applied: 'تسوية على الإقامة', retained: 'احتفاظ' };
                  return `<tr style="border-bottom:1px solid #ede9fe;"><td style="padding:7px; color:#64748b;"><div style="font-family:monospace;">${escapeHtml(String(d.movement_date || d.created_at || '').slice(0, 16))}</div><small style="display:block; margin-top:3px; color:#1a4332;">تاريخ العمل: ${escapeHtml(d.business_date || '-')}</small></td><td style="padding:7px;">#${d.reservation_id} - ${escapeHtml(d.guest_name)} / غرفة ${escapeHtml(d.room_number)}</td><td style="padding:7px; text-align:center;">${labels[d.movement_type] || escapeHtml(d.movement_type)}</td><td style="padding:7px; text-align:center; font-weight:800;">${Number(d.amount || 0).toLocaleString()} ريال</td><td style="padding:7px; text-align:center;">${escapeHtml(d.payment_method || 'نقداً')}</td><td style="padding:7px;">${escapeHtml(d.reason || '')}${d.staff_username ? ` - ${escapeHtml(d.staff_username)}` : ''}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          `}

          <!-- Sign-off & Audit Closure Signatures -->
          <div style="display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 0.85rem; color: #475569;">
            <div style="width: 220px;">
              <div>إعداد موظف الاستقبال / أمين الصندوق</div>
              <div style="margin-top: 36px; border-bottom: 1px solid #94a3b8;"></div>
            </div>
            <div style="width: 220px;">
              <div>المطابقة والمراجعة المحاسبية</div>
              <div style="margin-top: 36px; border-bottom: 1px solid #94a3b8;"></div>
            </div>
            <div style="width: 220px;">
              <div>اعتماد المدير العام</div>
              <div style="margin-top: 36px; border-bottom: 1px solid #94a3b8;"></div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Shift audit error:', err);
      showToast(`خطأ في تقرير الإقفال: ${err.message}`, 'error');
    }
  }

  async function openShiftAuditModal(targetDateOrOptions) {
    try {
      await refreshHotelBusinessState();
      ensureShiftAuditFilterBar();

      let startDate = null;
      let endDate = null;

      if (targetDateOrOptions && typeof targetDateOrOptions === 'object') {
        startDate = targetDateOrOptions.startDate || targetDateOrOptions.date;
        endDate = targetDateOrOptions.endDate || startDate;
        currentShiftAuditPreset = targetDateOrOptions.preset || (startDate === endDate ? 'today' : 'custom');
      } else if (typeof targetDateOrOptions === 'string' && targetDateOrOptions.trim() !== '') {
        startDate = targetDateOrOptions.trim();
        endDate = startDate;
        currentShiftAuditPreset = (startDate === (window.DashboardApp.State.businessDate || getLocalDateString())) ? 'today' : 'custom';
      } else {
        currentShiftAuditPreset = 'today';
        const dates = getShiftAuditPresetDates('today');
        startDate = dates.startDate;
        endDate = dates.endDate;
      }

      currentShiftAuditStartDate = startDate;
      currentShiftAuditEndDate = endDate;

      const filterBar = document.getElementById('shift-audit-filter-bar');
      if (filterBar) {
        const presetButtons = filterBar.querySelectorAll('.btn-audit-preset');
        presetButtons.forEach(b => {
          const isActive = b.dataset.preset === currentShiftAuditPreset;
          b.style.background = isActive ? '#1a4332' : 'transparent';
          b.style.color = isActive ? '#a7f3d0' : '#cbd5e1';
          b.style.fontWeight = isActive ? '800' : '600';
        });
        const customDatesBox = filterBar.querySelector('#shift-audit-custom-dates');
        const customStartInput = filterBar.querySelector('#shift-audit-custom-start');
        const customEndInput = filterBar.querySelector('#shift-audit-custom-end');
        if (customDatesBox) {
          customDatesBox.style.display = currentShiftAuditPreset === 'custom' ? 'flex' : 'none';
        }
        if (customStartInput) customStartInput.value = startDate;
        if (customEndInput) customEndInput.value = endDate;
      }

      await renderShiftAuditData(startDate, endDate);

      if (btnRunNightAudit && window.DashboardApp.State.businessDate) {
        btnRunNightAudit.title = `إقفال تاريخ العمل ${window.DashboardApp.State.businessDate} والانتقال إلى اليوم التالي`;
      }

      if (shiftAuditModal) {
        shiftAuditModal.style.display = 'flex';
      }
    } catch (err) {
      console.error('Shift audit error:', err);
      showToast(`خطأ في تقرير الإقفال: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // Isolated Element Printing Engine (Prevents any UI leakage)
  // =========================================================================
  function printIsolatedElement(contentHtml, documentTitle, isInvoice = true) {
    if (!contentHtml || !contentHtml.trim()) {
      showToast('لا يوجد محتوى متاح للطباعة.', 'error');
      return;
    }

    // Set scoped class on document body
    document.body.classList.remove('printing-invoice', 'printing-shift-audit');
    document.body.classList.add(isInvoice ? 'printing-invoice' : 'printing-shift-audit');

    let printFrame = document.getElementById('app-print-frame');
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'app-print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);
    }

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${documentTitle}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm 12mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "Segoe UI", Tahoma, "Cairo", Arial, sans-serif;
            direction: rtl;
            text-align: right;
            background: white !important;
            color: #0f172a !important;
            padding: 0;
            margin: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <div style="padding: 10px; width: 100%;">${contentHtml}</div>
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch (e) {
        console.error('Iframe print error, falling back to window.print():', e);
        window.print();
      } finally {
        setTimeout(() => {
          document.body.classList.remove('printing-invoice', 'printing-shift-audit');
        }, 1500);
      }
    }, 300);
  }

  // Close & Print Handlers for Invoice Modal
  if (btnCloseInvoiceModal) {
    btnCloseInvoiceModal.addEventListener('click', () => {
      if (invoiceModal) invoiceModal.style.display = 'none';
      document.body.classList.remove('printing-invoice', 'printing-shift-audit');
    });
  }
  if (invoiceModal) {
    invoiceModal.addEventListener('click', (e) => {
      if (e.target === invoiceModal) {
        invoiceModal.style.display = 'none';
        document.body.classList.remove('printing-invoice', 'printing-shift-audit');
      }
    });
  }

  // Close Handlers for Room Revenue Modal
  if (btnCloseRoomRevenueModal) {
    btnCloseRoomRevenueModal.addEventListener('click', () => {
      if (roomRevenueModal) roomRevenueModal.style.display = 'none';
    });
  }
  if (roomRevenueModal) {
    roomRevenueModal.addEventListener('click', (e) => {
      if (e.target === roomRevenueModal) {
        roomRevenueModal.style.display = 'none';
      }
    });
  }
  if (btnTriggerPrintInvoice) {
    btnTriggerPrintInvoice.addEventListener('click', () => {
      printIsolatedElement(invoicePrintableArea ? invoicePrintableArea.innerHTML : '', 'سند استلام', true);
    });
  }
  if (btnExportPdfInvoice) {
    btnExportPdfInvoice.addEventListener('click', async () => {
      try {
        if (!invoicePrintableArea || !invoicePrintableArea.innerHTML.trim()) {
          showToast('لا توجد بيانات سند لتصديره.', 'error');
          return;
        }
        showToast('جاري إنشاء وحفظ ملف السند بصيغة PDF...', 'info');
        const res = await window.api.printToPdf({
          html: invoicePrintableArea.innerHTML,
          title: 'سند استلام',
          defaultFilename: `receipt_${currentInvoiceReservationId || 'reservation'}.pdf`
        });
        if (res && res.canceled) return;
        if (res && res.success) {
          showToast(`تم تصدير وحفظ السند بنجاح في: ${res.filePath}`, 'success');
        } else {
          showToast(res?.error || 'فشل تصدير ملف PDF.', 'error');
        }
      } catch (err) {
        showToast(`خطأ أثناء تصدير PDF: ${err.message}`, 'error');
      }
    });
  }
  if (btnPreviewWindowInvoice) {
    btnPreviewWindowInvoice.addEventListener('click', async () => {
      try {
        if (!invoicePrintableArea || !invoicePrintableArea.innerHTML.trim()) {
          showToast('لا توجد بيانات سند للمعاينة.', 'error');
          return;
        }
        await window.api.openPrintPreviewWindow({
          html: invoicePrintableArea.innerHTML,
          title: 'معاينة سند الاستلام'
        });
      } catch (err) {
        showToast(`تعذر فتح نافذة المعاينة: ${err.message}`, 'error');
      }
    });
  }

  // Edit Receipt / Invoice Handlers
  function updateEditInvoiceRemaining() {
    const total = parseFloat(editInvTotalPrice ? editInvTotalPrice.value : 0) || 0;
    const paid = parseFloat(editInvPaidAmount ? editInvPaidAmount.value : 0) || 0;
    const isOpenContract = currentInvoiceData && currentInvoiceData.booking_type === 'عقد مفتوح';
    const remaining = total - paid;
    if (editInvRemainingPreview) {
      if (remaining < -0.005) {
        editInvRemainingPreview.textContent = `رصيد دائن للنزيل (مستحق له): ${Math.abs(remaining).toFixed(2)} ريال`;
        editInvRemainingPreview.style.color = '#2563eb';
      } else {
        const displayRemaining = Math.max(0, remaining);
        editInvRemainingPreview.textContent = `${displayRemaining.toFixed(2)} ريال`;
        editInvRemainingPreview.style.color = displayRemaining > 0 ? '#dc2626' : '#059669';
      }
    }
  }

  if (editInvTotalPrice) editInvTotalPrice.addEventListener('input', updateEditInvoiceRemaining);
  if (editInvPaidAmount) editInvPaidAmount.addEventListener('input', updateEditInvoiceRemaining);

  if (btnEditInvoice) {
    btnEditInvoice.addEventListener('click', () => {
      if (!currentInvoiceData) {
        showToast('يرجى فتح سند أولاً لتعديله.', 'error');
        return;
      }
      if (editInvResId) editInvResId.value = currentInvoiceData.id;
      if (editInvGuestName) editInvGuestName.value = currentInvoiceData.guest_name || '';
      if (editInvGuestPhone) editInvGuestPhone.value = currentInvoiceData.guest_phone || '';
      if (editInvGuestId) editInvGuestId.value = currentInvoiceData.guest_id_number || '';
      if (editInvTotalPrice) editInvTotalPrice.value = currentInvoiceData.total_price || 0;
      if (editInvPaidAmount) editInvPaidAmount.value = currentInvoiceData.paid_amount || 0;
      if (editInvDepositAmount) editInvDepositAmount.value = currentInvoiceData.deposit_amount || 0;
      if (editInvPaymentMethod) editInvPaymentMethod.value = currentInvoiceData.payment_method || 'نقداً';

      updateEditInvoiceRemaining();
      if (editInvoiceModal) editInvoiceModal.style.display = 'flex';
    });
  }

  function closeEditInvoiceModal() {
    if (editInvoiceModal) editInvoiceModal.style.display = 'none';
  }

  if (btnCloseEditInvoice) btnCloseEditInvoice.addEventListener('click', closeEditInvoiceModal);
  if (btnCancelEditInv) btnCancelEditInv.addEventListener('click', closeEditInvoiceModal);
  if (editInvoiceModal) {
    editInvoiceModal.addEventListener('click', (e) => {
      if (e.target === editInvoiceModal) closeEditInvoiceModal();
    });
  }

  if (editInvoiceForm) {
    editInvoiceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resId = parseInt(editInvResId.value, 10);
      const guestName = editInvGuestName.value.trim();
      const guestPhone = editInvGuestPhone.value.trim();
      const guestIdNumber = editInvGuestId.value.trim();
      const totalPrice = parseFloat(editInvTotalPrice.value) || 0;
      const paidAmount = parseFloat(editInvPaidAmount.value) || 0;
      const depositAmount = parseFloat(editInvDepositAmount ? editInvDepositAmount.value : 0) || 0;
      const paymentMethod = editInvPaymentMethod.value;
      const isOpenContract = currentInvoiceData && currentInvoiceData.booking_type === 'عقد مفتوح';

      if (!guestName) {
        showToast('يرجى إدخال اسم النزيل.', 'error');
        return;
      }
      if (guestPhone && !/^05\d{8}$/.test(guestPhone)) {
        showToast('رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).', 'error');
        return;
      }
      if (guestIdNumber && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(guestIdNumber)) {
        showToast('رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.', 'error');
        return;
      }
      if (!isOpenContract && totalPrice <= 0) {
        showToast('السعر الإجمالي يجب أن يكون أكبر من الصفر.', 'error');
        return;
      }
      if (isOpenContract && totalPrice < 0) {
        showToast('السعر الإجمالي لا يمكن أن يكون سالباً.', 'error');
        return;
      }
      if (paidAmount < 0) {
        showToast('المبلغ المدفوع لا يمكن أن يكون سالباً.', 'error');
        return;
      }
      if (!isOpenContract && paidAmount - totalPrice > 0.005) {
        showToast(`المبلغ المدفوع (${paidAmount} ريال) لا يمكن أن يتجاوز السعر الإجمالي (${totalPrice} ريال).`, 'error');
        return;
      }

      try {
        const res = await window.api.updateReservationReceipt({
          reservationId: resId,
          guestName,
          guestPhone,
          guestIdNumber,
          totalPrice,
          paidAmount,
          depositAmount,
          paymentMethod
        });

        if (res && res.success) {
          showToast('تم حفظ وتحديث بيانات السند بنجاح!', 'success');
          closeEditInvoiceModal();
          // Reload updated invoice preview
          await openInvoiceModal(resId);
          // Sync all views
          await Promise.all([
            window.DashboardApp.Helpers.loadOverviewData(),
            window.DashboardApp.Helpers.loadRoomsData(),
            window.DashboardApp.Helpers.loadReservationsData()
          ]);
        } else {
          showToast(res?.error || 'فشل تحديث بيانات السند.', 'error');
        }
      } catch (err) {
        showToast(`خطأ أثناء الحفظ: ${err.message}`, 'error');
      }
    });
  }

  // Shift Audit Handlers
  if (btnOpenShiftAudit) {
    btnOpenShiftAudit.addEventListener('click', () => openShiftAuditModal());
  }
  if (btnRunNightAudit) {
    btnRunNightAudit.addEventListener('click', async () => {
      const state = await refreshHotelBusinessState();
      const activeDate = state?.current_business_date || window.DashboardApp.State.businessDate;
      if (!activeDate) {
        showToast('تعذر قراءة تاريخ العمل الحالي.', 'error');
        return;
      }
      if (currentShiftAuditStartDate !== activeDate || currentShiftAuditEndDate !== activeDate) {
        showToast(`اختر تقرير اليوم المفتوح (${activeDate}) قبل إقفاله.`, 'warning');
        return;
      }

      const confirmed = await showConfirmDialog({
        title: 'إقفال اليوم الفندقي',
        message: `سيتم إقفال تاريخ العمل ${activeDate} وحفظ ملخص المقبوضات والتأمين، ثم فتح تاريخ العمل التالي. هذا الإجراء لا يمكن التراجع عنه من داخل النظام. إذا لم تكن متأكداً، اختر «مراجعة التقرير».`,
        confirmText: 'إقفال اليوم والانتقال',
        cancelText: 'مراجعة التقرير',
        isDanger: true
      });
      if (!confirmed) return;

      btnRunNightAudit.disabled = true;
      try {
        const result = await window.api.runNightAudit(activeDate);
        if (!result || !result.success || !result.data) {
          showToast(result?.error || 'تعذر إقفال اليوم الفندقي.', 'error');
          return;
        }

        await refreshHotelBusinessState();
        btnRunNightAudit.title = `تاريخ العمل المفتوح الآن ${result.data.currentBusinessDate}`;
        showToast(`تم إقفال ${result.data.closedBusinessDate}. تاريخ العمل الجديد: ${result.data.currentBusinessDate}.`, 'success');
        await Promise.all([
          window.DashboardApp.Helpers.loadOverviewData?.(),
          window.DashboardApp.Helpers.loadRoomsData?.(),
          window.DashboardApp.Helpers.loadReservationsData?.()
        ]);
        if (currentUser?.role === 'Admin') await refreshBusinessDayReconciliationNotice();
        currentShiftAuditPreset = 'custom';
        const presetButtons = document.querySelectorAll('#shift-audit-filter-bar .btn-audit-preset');
        presetButtons.forEach(button => {
          const isActive = button.dataset.preset === 'custom';
          button.style.background = isActive ? '#1a4332' : 'transparent';
          button.style.color = isActive ? '#a7f3d0' : '#cbd5e1';
          button.style.fontWeight = isActive ? '800' : '600';
        });
        const customDates = document.getElementById('shift-audit-custom-dates');
        const customStart = document.getElementById('shift-audit-custom-start');
        const customEnd = document.getElementById('shift-audit-custom-end');
        if (customDates) customDates.style.display = 'flex';
        if (customStart) customStart.value = result.data.closedBusinessDate;
        if (customEnd) customEnd.value = result.data.closedBusinessDate;
        currentShiftAuditStartDate = result.data.closedBusinessDate;
        currentShiftAuditEndDate = result.data.closedBusinessDate;
        await renderShiftAuditData(currentShiftAuditStartDate, currentShiftAuditEndDate);
      } catch (err) {
        showToast(`تعذر إقفال اليوم: ${err.message}`, 'error');
      } finally {
        btnRunNightAudit.disabled = false;
      }
    });
  }
  if (btnCloseShiftAudit) {
    btnCloseShiftAudit.addEventListener('click', () => {
      if (shiftAuditModal) shiftAuditModal.style.display = 'none';
      document.body.classList.remove('printing-invoice', 'printing-shift-audit');
    });
  }
  if (shiftAuditModal) {
    shiftAuditModal.addEventListener('click', (e) => {
      if (e.target === shiftAuditModal) {
        shiftAuditModal.style.display = 'none';
        document.body.classList.remove('printing-invoice', 'printing-shift-audit');
      }
    });
  }
  if (btnPrintShiftAudit) {
    btnPrintShiftAudit.addEventListener('click', () => {
      const isMultiDay = currentShiftAuditStartDate && currentShiftAuditEndDate && currentShiftAuditStartDate !== currentShiftAuditEndDate;
      const title = isMultiDay
        ? `تقرير إقفال الفترة (${formatArabicDateRange(currentShiftAuditStartDate, currentShiftAuditEndDate)})`
        : 'تقرير إقفال الوردية والموازنة المالية';
      printIsolatedElement(shiftAuditContent ? shiftAuditContent.innerHTML : '', title, false);
    });
  }
  if (btnExportPdfShiftAudit) {
    btnExportPdfShiftAudit.addEventListener('click', async () => {
      try {
        if (!shiftAuditContent || !shiftAuditContent.innerHTML.trim()) {
          showToast('لا توجد بيانات تقرير لتصديرها.', 'error');
          return;
        }
        showToast('جاري إنشاء وحفظ تقرير الوردية بصيغة PDF...', 'info');
        const isMultiDay = currentShiftAuditStartDate && currentShiftAuditEndDate && currentShiftAuditStartDate !== currentShiftAuditEndDate;
        const title = isMultiDay
          ? `تقرير إقفال الفترة (${formatArabicDateRange(currentShiftAuditStartDate, currentShiftAuditEndDate)})`
          : 'تقرير إقفال الوردية والموازنة المالية';
        const defaultFilename = isMultiDay
          ? `shift_audit_${currentShiftAuditStartDate}_to_${currentShiftAuditEndDate}.pdf`
          : `shift_audit_${getLocalDateString()}.pdf`;

        const res = await window.api.printToPdf({
          html: shiftAuditContent.innerHTML,
          title: title,
          defaultFilename: defaultFilename
        });
        if (res && res.canceled) return;
        if (res && res.success) {
          showToast(`تم تصدير وحفظ تقرير الوردية بنجاح في: ${res.filePath}`, 'success');
        } else {
          showToast(res?.error || 'فشل تصدير ملف PDF.', 'error');
        }
      } catch (err) {
        showToast(`خطأ أثناء تصدير PDF: ${err.message}`, 'error');
      }
    });
  }
  if (btnPreviewWindowShiftAudit) {
    btnPreviewWindowShiftAudit.addEventListener('click', async () => {
      try {
        if (!shiftAuditContent || !shiftAuditContent.innerHTML.trim()) {
          showToast('لا توجد بيانات تقرير للمعاينة.', 'error');
          return;
        }
        const isMultiDay = currentShiftAuditStartDate && currentShiftAuditEndDate && currentShiftAuditStartDate !== currentShiftAuditEndDate;
        const title = isMultiDay
          ? `معاينة تقرير إقفال الفترة (${formatArabicDateRange(currentShiftAuditStartDate, currentShiftAuditEndDate)})`
          : 'معاينة تقرير إقفال الوردية والموازنة المالية';
        await window.api.openPrintPreviewWindow({
          html: shiftAuditContent.innerHTML,
          title: title
        });
      } catch (err) {
        showToast(`تعذر فتح نافذة المعاينة: ${err.message}`, 'error');
      }
    });
  }

  // User Manual Modal Handlers
  function openUserManualModal() {
    if (!userManualModal) return;
    userManualModal.style.display = 'flex';
    if (manualSearchInput) {
      manualSearchInput.value = '';
      filterUserManual('');
      setTimeout(() => manualSearchInput.focus(), 100);
    }
  }

  function closeUserManualModal() {
    if (!userManualModal) return;
    userManualModal.style.display = 'none';
  }

  function filterUserManual(query) {
    if (!manualContentContainer) return;
    const term = String(query || '').trim().toLowerCase();
    const sections = manualContentContainer.querySelectorAll('.manual-section');
    sections.forEach(sec => {
      if (!term) {
        sec.style.display = '';
        return;
      }
      const text = sec.textContent.toLowerCase();
      sec.style.display = text.includes(term) ? '' : 'none';
    });
  }

  if (btnOpenUserManual) {
    btnOpenUserManual.addEventListener('click', openUserManualModal);
  }
  if (navUserManual) {
    navUserManual.addEventListener('click', (e) => {
      e.preventDefault();
      openUserManualModal();
    });
  }
  if (btnCloseUserManual) {
    btnCloseUserManual.addEventListener('click', closeUserManualModal);
  }
  if (btnCloseUserManualFooter) {
    btnCloseUserManualFooter.addEventListener('click', closeUserManualModal);
  }
  if (userManualModal) {
    userManualModal.addEventListener('click', (e) => {
      if (e.target === userManualModal) closeUserManualModal();
    });
  }
  if (btnPrintUserManual) {
    btnPrintUserManual.addEventListener('click', () => {
      window.print();
    });
  }
  if (manualSearchInput) {
    manualSearchInput.addEventListener('input', (e) => {
      filterUserManual(e.target.value);
    });
  }

  // Navigation Pills click to scroll smoothly to section
  document.querySelectorAll('.manual-nav-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const targetId = pill.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (targetEl && manualContentContainer) {
        targetEl.style.display = '';
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        pill.style.background = '#1a4332';
        pill.style.color = '#ffffff';
        pill.style.borderColor = '#1a4332';
        setTimeout(() => {
          pill.style.background = '#ffffff';
          pill.style.color = '#1e293b';
          pill.style.borderColor = '#cbd5e1';
        }, 1200);
      }
    });
  });

  // Global F1 key to open manual and Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      openUserManualModal();
    } else if (e.key === 'Escape' && userManualModal && userManualModal.style.display === 'flex') {
      closeUserManualModal();
    }
  });

  // Backup & Restore Database Handlers (Feature 4)
  if (btnBackupDb) {
    btnBackupDb.addEventListener('click', async () => {
      try {
        const res = await window.api.createBackup();
        if (res && res.canceled) return;
        if (res && res.success) {
          showToast(res.message || 'تم حفظ النسخة الاحتياطية لقاعدة البيانات بنجاح!', 'success');
        } else {
          showToast(res?.error || 'فشل إنشاء النسخة الاحتياطية.', 'error');
        }
      } catch (err) {
        showToast(`خطأ في النسخ الاحتياطي: ${err.message}`, 'error');
      }
    });
  }

  if (btnRestoreDb) {
    btnRestoreDb.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'استعادة قاعدة البيانات',
        message: 'تنبيه أمان هام جداً:\nاستعادة قاعدة بيانات ستستبدل جميع البيانات الحالية بالنسخة المحددة.\n\nهل أنت متأكد من رغبتك في المتابعة؟',
        confirmText: 'نعم، استعادة البيانات',
        cancelText: 'إلغاء',
        isDanger: true
      });
      if (!confirmed) {
        return;
      }
      try {
        const res = await window.api.restoreBackup();
        if (res && res.canceled) return;
        if (res && res.success) {
          showToast(res.message || 'تمت استعادة قاعدة البيانات بنجاح!', 'success');
          await refreshHotelBusinessState();
          await window.DashboardApp.Helpers.loadOverviewData();
          await window.DashboardApp.Helpers.loadReservationsData();
          await window.DashboardApp.Helpers.loadRoomsData();
          await window.DashboardApp.Helpers.loadGuestsData();
        } else {
          showToast(res?.error || 'فشل استعادة قاعدة البيانات.', 'error');
        }
      } catch (err) {
        showToast(`خطأ في الاستعادة: ${err.message}`, 'error');
      }
    });
  }

  // =========================================================================
  // DAILY AUTOMATED BACKUP (12:00 AM) - HANDLERS & MODAL LOGIC
  // =========================================================================

  function formatArabicDateTime(dateString, includeTime = true) { return window.DashboardApp.Helpers.formatArabicDateTime(dateString, includeTime); }

  async function openDailyBackupModal() {
    if (!dailyBackupModal) return;
    if (!currentUser || currentUser.role !== 'Admin') {
      showToast('غير مصرح: النسخ الاحتياطي مخصص لمدير النظام (Admin).', 'error');
      return;
    }
    try {
      const res = await window.api.getDailyBackupStatus();
      if (!res || !res.success) {
        showToast(res?.error || 'تعذر جلب حالة النسخ الاحتياطي اليومي.', 'error');
        return;
      }
      const data = res.data;

      // Update KPIs
      if (dailyBackupStatusBadge) {
        dailyBackupStatusBadge.textContent = data.enabled ? 'مفعّل ونشط ✅' : 'معطّل ⚠️';
        dailyBackupStatusBadge.style.color = data.enabled ? '#047857' : '#dc2626';
      }

      if (dailyBackupNextRun) {
        if (data.msUntilNext) {
          const hours = Math.floor(data.msUntilNext / (1000 * 60 * 60));
          const mins = Math.floor((data.msUntilNext % (1000 * 60 * 60)) / (1000 * 60));
          dailyBackupNextRun.textContent = `النسخة القادمة: الليلة 12:00 ص (خلال ${hours} س و ${mins} د)`;
        } else {
          dailyBackupNextRun.textContent = 'النسخة القادمة: الليلة 12:00 ص';
        }
      }

      if (dailyBackupLastTime) {
        dailyBackupLastTime.textContent = formatArabicDateTime(data.lastDailyBackupTimestamp);
      }
      if (dailyBackupLastFile) {
        dailyBackupLastFile.textContent = data.lastDailyBackupFile || 'لم يتم التسجيل بعد';
      }
      if (dailyBackupTotalCount) {
        dailyBackupTotalCount.textContent = `${data.totalBackupsCount || 0} نسخة`;
      }
      if (dailyBackupFolderPathDisplay) {
        dailyBackupFolderPathDisplay.textContent = data.backupDir || '';
        dailyBackupFolderPathDisplay.title = data.backupDir || '';
      }

      if (dailyBackupFolderTypeBadge) {
        if (data.isCustomFolder) {
          dailyBackupFolderTypeBadge.textContent = 'مجلد مخصص (Custom)';
          dailyBackupFolderTypeBadge.style.background = '#e0e7ff';
          dailyBackupFolderTypeBadge.style.color = '#3730a3';
        } else {
          dailyBackupFolderTypeBadge.textContent = 'المجلد الافتراضي (Default)';
          dailyBackupFolderTypeBadge.style.background = '#f1f5f9';
          dailyBackupFolderTypeBadge.style.color = '#475569';
        }
      }

      if (btnResetDailyBackupFolder) {
        btnResetDailyBackupFolder.style.display = data.isCustomFolder ? 'inline-flex' : 'none';
      }

      if (dailyBackupTableCountBadge) {
        dailyBackupTableCountBadge.textContent = `${data.totalBackupsCount || 0} ملف`;
      }

      // Populate Table
      if (dailyBackupsTableBody) {
        dailyBackupsTableBody.innerHTML = '';
        const list = data.backupsList || [];

        if (list.length === 0) {
          if (dailyBackupsEmpty) dailyBackupsEmpty.style.display = 'block';
        } else {
          if (dailyBackupsEmpty) dailyBackupsEmpty.style.display = 'none';
          list.forEach((item) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #e2e8f0';

            const isDaily = item.isDaily;
            const isLatest = item.isLatest;

            let badgeHtml = '';
            if (isLatest) {
              badgeHtml = `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 0.75rem;">الأحدث (Latest)</span>`;
            } else if (isDaily) {
              badgeHtml = `<span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 0.75rem;">يومي 12:00 ص 🕛</span>`;
            } else {
              badgeHtml = `<span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem;">نسخة يدوية 📁</span>`;
            }

            tr.innerHTML = `
              <td style="padding: 10px 14px; font-family: monospace; font-weight: 600; color: #1e293b; direction: ltr; text-align: right;">${item.filename}</td>
              <td style="padding: 10px 14px; color: #475569;">${formatArabicDateTime(item.modified)}</td>
              <td style="padding: 10px 14px; color: #475569;">${item.sizeFormatted}</td>
              <td style="padding: 10px 14px;">${badgeHtml}</td>
              <td style="padding: 10px 14px; text-align: center;">
                <button type="button" class="btn btn-sm btn-restore-single-backup" data-path="${item.path.replace(/"/g, '&quot;')}" style="background: #fffbeb; border: 1px solid #fde68a; color: #b45309; font-weight: 700; padding: 4px 10px; font-size: 0.78rem; cursor: pointer;">
                  استعادة هذه النسخة 🔄
                </button>
              </td>
            `;
            dailyBackupsTableBody.appendChild(tr);
          });

          // Attach restore handlers
          const restoreBtns = dailyBackupsTableBody.querySelectorAll('.btn-restore-single-backup');
          restoreBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
              const targetPath = btn.getAttribute('data-path');
              const confirmed = await showConfirmDialog({
                title: 'استعادة النسخة الاحتياطية اليومية',
                message: 'تنبيه أمان هام جداً:\nاستعادة هذه النسخة الاحتياطية سيستبدل بيانات النظام الحالية بالبيانات المحفوظة في هذا الملف.\n\nهل أنت متأكد من رغبتك في استعادة هذه النسخة؟',
                confirmText: 'نعم، استعادة النسخة',
                cancelText: 'إلغاء',
                isDanger: true
              });
              if (!confirmed) {
                return;
              }
              try {
                const restoreRes = await window.api.restoreDailyBackup(targetPath);
                if (restoreRes && restoreRes.success) {
                  showToast('تمت استعادة قاعدة البيانات بنجاح من النسخة المحددة!', 'success');
                  dailyBackupModal.style.display = 'none';
                  await refreshHotelBusinessState();
                  await window.DashboardApp.Helpers.loadOverviewData();
                  await window.DashboardApp.Helpers.loadReservationsData();
                  await window.DashboardApp.Helpers.loadRoomsData();
                  await window.DashboardApp.Helpers.loadGuestsData();
                } else {
                  showToast(restoreRes?.error || 'فشلت عملية استعادة النسخة.', 'error');
                }
              } catch (e) {
                showToast(`خطأ أثناء الاستعادة: ${e.message}`, 'error');
              }
            });
          });
        }
      }

      dailyBackupModal.style.display = 'flex';
    } catch (err) {
      console.error('[Daily Backup Modal Error]:', err);
      showToast(`خطأ في فتح نافذة النسخ الاحتياطي: ${err.message}`, 'error');
    }
  }

  if (btnDailyBackupModal) {
    btnDailyBackupModal.addEventListener('click', () => {
      openDailyBackupModal();
    });
  }

  if (btnCloseDailyBackup) {
    btnCloseDailyBackup.addEventListener('click', () => {
      if (dailyBackupModal) dailyBackupModal.style.display = 'none';
    });
  }

  if (dailyBackupModal) {
    dailyBackupModal.addEventListener('click', (e) => {
      if (e.target === dailyBackupModal) {
        dailyBackupModal.style.display = 'none';
      }
    });
  }

  if (btnOpenDailyBackupsFolder) {
    btnOpenDailyBackupsFolder.addEventListener('click', async () => {
      try {
        const res = await window.api.openBackupsFolder();
        if (!res || !res.success) {
          showToast(res?.error || 'تعذر فتح مجلد النسخ الاحتياطي.', 'error');
        }
      } catch (err) {
        showToast(`تعذر فتح مجلد النسخ: ${err.message}`, 'error');
      }
    });
  }

  if (btnChangeDailyBackupFolder) {
    btnChangeDailyBackupFolder.addEventListener('click', async () => {
      try {
        const originalHtml = btnChangeDailyBackupFolder.innerHTML;
        btnChangeDailyBackupFolder.disabled = true;
        btnChangeDailyBackupFolder.innerHTML = '<span>جاري الاختيار... ⏳</span>';

        const res = await window.api.selectBackupFolder();

        btnChangeDailyBackupFolder.disabled = false;
        btnChangeDailyBackupFolder.innerHTML = originalHtml;

        if (res && res.success) {
          showToast(`تم تغيير مجلد حفظ النسخ التلقائية بنجاح إلى:\n${res.folderPath}`, 'success');
          await openDailyBackupModal();
        } else if (res && res.error) {
          showToast(`تعذر تغيير المجلد: ${res.error}`, 'error');
        }
      } catch (err) {
        if (btnChangeDailyBackupFolder) {
          btnChangeDailyBackupFolder.disabled = false;
        }
        showToast(`خطأ في اختيار المجلد: ${err.message}`, 'error');
      }
    });
  }

  if (btnResetDailyBackupFolder) {
    btnResetDailyBackupFolder.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'استعادة مجلد الحفظ الافتراضي',
        message: 'هل ترغب في إعادة ضبط مسار حفظ النسخ الاحتياطية التلقائية إلى مجلد التطبيق الافتراضي؟',
        confirmText: 'استعادة الافتراضي',
        cancelText: 'إلغاء',
        isDanger: false
      });
      if (!confirmed) {
        return;
      }
      try {
        const res = await window.api.resetBackupFolder();
        if (res && res.success) {
          showToast('تمت استعادة مجلد الحفظ الافتراضي بنجاح.', 'info');
          await openDailyBackupModal();
        } else {
          showToast(res?.error || 'فشلت استعادة المجلد الافتراضي.', 'error');
        }
      } catch (err) {
        showToast(`خطأ: ${err.message}`, 'error');
      }
    });
  }

  if (btnTriggerDailyBackupNow) {
    btnTriggerDailyBackupNow.addEventListener('click', async () => {
      try {
        btnTriggerDailyBackupNow.disabled = true;
        const originalHtml = btnTriggerDailyBackupNow.innerHTML;
        btnTriggerDailyBackupNow.innerHTML = 'جاري النسخ... ⏳';

        const res = await window.api.runDailyBackupNow();
        if (res && res.success) {
          showToast(`تم أخذ نسخة احتياطية بنجاح! (${res.filename})`, 'success');
          await openDailyBackupModal();
        } else {
          showToast(res?.error || 'فشل إجراء النسخة الاحتياطية.', 'error');
        }
        btnTriggerDailyBackupNow.disabled = false;
        btnTriggerDailyBackupNow.innerHTML = originalHtml;
      } catch (err) {
        btnTriggerDailyBackupNow.disabled = false;
        showToast(`خطأ في النسخ الفوري: ${err.message}`, 'error');
      }
    });
  }

  if (btnRefreshDailyBackups) {
    btnRefreshDailyBackups.addEventListener('click', async () => {
      await openDailyBackupModal();
      showToast('تم تحديث قائمة النسخ الاحتياطية بنجاح.', 'info');
    });
  }

  // Live IPC Listener for 12:00 AM Automated Daily Backup
  if (window.api && window.api.onDailyBackupEvent) {
    window.api.onDailyBackupEvent((eventData) => {
      if (eventData && eventData.success) {
        showToast(`🕛 تم أخذ النسخة الاحتياطية اليومية بنجاح (12:00 AM):\n${eventData.filename}`, 'success');
        if (dailyBackupModal && dailyBackupModal.style.display === 'flex') {
          openDailyBackupModal();
        }
      }
    });
  }

  // =========================================================================
  // WHATSAPP RESERVATION CONFIRMATION (SAUDI ARABIA NUMBERS)
  // =========================================================================
  function formatSaudiWhatsAppNumber(rawPhone) {
    if (!rawPhone) return '';
    // Remove spaces, dashes, parentheses and non-numeric chars
    let cleaned = String(rawPhone).replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    if (cleaned.startsWith('00966')) {
      cleaned = '966' + cleaned.substring(5);
    } else if (cleaned.startsWith('966')) {
      // Already formatted with 966
    } else if (cleaned.startsWith('0')) {
      // e.g., '0501234567' -> '966501234567'
      cleaned = '966' + cleaned.substring(1);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
      // e.g., '501234567' -> '966501234567'
      cleaned = '966' + cleaned;
    }
    return cleaned;
  }

  async function sendReservationWhatsApp(reservationId) {
    const targetId = parseInt(reservationId, 10);
    const res = window.DashboardApp.Helpers.findLoadedReservation(targetId);
    if (!res) {
      showToast('لم يتم العثور على بيانات هذا الحجز.', 'error');
      return;
    }

    if (!res.guest_phone || !res.guest_phone.trim()) {
      showToast('لا يوجد رقم هاتف مسجل لهذا النزيل لإرسال رسالة واتساب.', 'error');
      return;
    }

    const cleanPhone = formatSaudiWhatsAppNumber(res.guest_phone);
    if (!cleanPhone || cleanPhone.length < 9) {
      showToast(`رقم الهاتف (${res.guest_phone}) غير صالح للمراسلة عبر واتساب.`, 'error');
      return;
    }

    const message = `مرحباً ${res.guest_name || 'عزيزنا النزيل'}،
تم تأكيد حجزك في فندقنا (Ahmed ERP).
رقم الغرفة: ${res.room_number || '-'}
تاريخ الوصول: ${res.check_in_date || '-'}
تاريخ المغادرة: ${res.check_out_date || '-'}
نتمنى لك إقامة سعيدة!`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

    try {
      showToast(`جاري فتح محادثة واتساب مع النزيل: ${res.guest_name}...`, 'info');
      const response = await window.api.openWhatsApp(whatsappUrl);
      if (response && response.success) {
        showToast('تم فتح محادثة واتساب بنجاح! ✓', 'success');
      } else {
        showToast(response?.error || 'تعذر فتح تطبيق واتساب.', 'error');
      }
    } catch (err) {
      showToast(`خطأ أثناء فتح واتساب: ${err.message}`, 'error');
    }
  }


  // In-App Logout Confirmation System (Zero native modal freezing)
  const logoutModal = document.getElementById('logout-confirm-modal');
  const btnCancelLogout = document.getElementById('btn-cancel-logout');
  const btnConfirmLogout = document.getElementById('btn-confirm-logout');

  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      if (logoutModal) {
        logoutModal.style.display = 'flex';
      } else {
        doLogout();
      }
    });
  }

  if (btnCancelLogout) {
    btnCancelLogout.addEventListener('click', () => {
      if (logoutModal) logoutModal.style.display = 'none';
    });
  }

  if (btnConfirmLogout) {
    btnConfirmLogout.addEventListener('click', async () => {
      if (logoutModal) logoutModal.style.display = 'none';
      await doLogout();
    });
  }

  async function doLogout() {
    const storedLogId = localStorage.getItem('ahmed_hotel_log_id');
    try {
      if (window.api && window.api.logout) {
        await window.api.logout(storedLogId ? parseInt(storedLogId, 10) : null);
      }
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      localStorage.removeItem('ahmed_hotel_log_id');
      localStorage.removeItem('currentUserRole');
      localStorage.removeItem('currentUsername');
      localStorage.removeItem('currentUserId');
      window.location.href = 'login.html';
    }
  }

  // Open DB folder
  btnOpenDb.addEventListener('click', async () => {
    try {
      const res = await window.api.openDbFolder();
      if (!res || !res.success) {
        showToast(res?.error || 'تعذر فتح مجلد قاعدة البيانات.', 'error');
      }
    } catch (err) {
      showToast(`تعذر فتح مجلد قاعدة البيانات: ${err.message}`, 'error');
    }
  });

  function loadLogsData() { return window.DashboardApp.Helpers.loadLogsData(); }

  function applyRbacUi(role) {
    const isAdmin = role === 'Admin';
    if (navAdmin) navAdmin.style.display = isAdmin ? 'flex' : 'none';
    if (navLogs) navLogs.style.display = isAdmin ? 'flex' : 'none';

    // If 'User', completely hide user management sections/buttons
    const adminElements = document.querySelectorAll('.admin-only, [data-role-required="Admin"]');
    adminElements.forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  }

  // --- INITIALIZE APPLICATION ---
  async function init() {

    // Phase 5 DOM Bindings
    window.DashboardApp.DOM.roomsList = document.getElementById('rooms-list');
    window.DashboardApp.DOM.btnRefreshRooms = document.getElementById('btn-refresh-rooms');
    window.DashboardApp.DOM.roomsFilterTabs = document.querySelectorAll('#rooms-filter-tabs .filter-tab-btn');
    window.DashboardApp.DOM.roomsPaymentFilterTabs = document.querySelectorAll('#rooms-payment-filter-tabs .filter-tab-btn');
    window.DashboardApp.DOM.roomsPaymentFilterContainer = roomsPaymentFilterContainer;
    window.DashboardApp.DOM.roomsFilterResult = roomsFilterResult;
    window.DashboardApp.DOM.roomsClearFiltersButton = roomsClearFiltersButton;
    window.DashboardApp.DOM.roomsActiveFilterCount = roomsActiveFilterCount;
    window.DashboardApp.DOM.searchRoomsInput = document.getElementById('search-rooms');
    window.DashboardApp.DOM.roomsBookingTypeTabs = document.querySelectorAll('#rooms-booking-type-tabs .filter-tab-btn');
    window.DashboardApp.DOM.roomsGridContainer = document.getElementById('rooms-grid-container');
    window.DashboardApp.DOM.btnToggleAddRoom = document.getElementById('btn-toggle-add-room');
    window.DashboardApp.DOM.addRoomPanel = document.getElementById('add-room-panel');
    window.DashboardApp.DOM.btnCancelAddRoom = document.getElementById('btn-cancel-add-room');
    window.DashboardApp.DOM.addRoomForm = document.getElementById('add-room-form');
    window.DashboardApp.DOM.newRoomNumber = document.getElementById('new-room-number');
    window.DashboardApp.DOM.newRoomType = document.getElementById('new-room-type');
    window.DashboardApp.DOM.newRoomPrice = document.getElementById('new-room-price');
    window.DashboardApp.DOM.newRoomStatus = document.getElementById('new-room-status');
    window.DashboardApp.DOM.editRoomModal = document.getElementById('edit-room-modal');
    window.DashboardApp.DOM.btnCloseEditRoomModal = document.getElementById('btn-close-edit-room');
    window.DashboardApp.DOM.btnCancelEditRoom = document.getElementById('btn-cancel-edit-room');
    window.DashboardApp.DOM.editRoomForm = document.getElementById('edit-room-form');
    window.DashboardApp.DOM.editRoomId = document.getElementById('edit-room-id');
    window.DashboardApp.DOM.editRoomNumber = document.getElementById('edit-room-number');
    window.DashboardApp.DOM.editRoomType = document.getElementById('edit-room-type');
    window.DashboardApp.DOM.editRoomPrice = document.getElementById('edit-room-price');
    window.DashboardApp.DOM.editRoomStatus = document.getElementById('edit-room-status');
    window.DashboardApp.DOM.editRoomStatusLockedHint = document.getElementById('edit-room-status-locked-hint');
    window.DashboardApp.DOM.btnDeleteRoom = document.getElementById('btn-delete-room');
    window.DashboardApp.DOM.btnSaveEditRoom = document.getElementById('btn-save-edit-room');
    window.DashboardApp.DOM.roomRevenueModal = document.getElementById('room-revenue-modal');
    window.DashboardApp.DOM.btnCloseRoomRevenueModal = document.getElementById('btn-close-room-revenue-modal');
    window.DashboardApp.DOM.roomRevenueContent = document.getElementById('room-revenue-content');
    window.DashboardApp.DOM.roomRevenueModalTitle = document.getElementById('room-revenue-modal-title');


    // Phase 4 DOM Bindings
    window.DashboardApp.DOM.guestsTableBody = guestsTableBody;
    window.DashboardApp.DOM.guestsEmpty = guestsEmpty;
    window.DashboardApp.DOM.searchGuests = searchGuests;
    window.DashboardApp.DOM.guestsBanFilterTabs = guestsBanFilterTabs;
    window.DashboardApp.DOM.guestsCountBadge = guestsCountBadge;
    window.DashboardApp.DOM.btnExportGuestsExcel = btnExportGuestsExcel;
    window.DashboardApp.DOM.inputImportGuestsExcel = inputImportGuestsExcel;
    window.DashboardApp.DOM.btnGuestsPrevPage = btnGuestsPrevPage;
    window.DashboardApp.DOM.btnGuestsNextPage = btnGuestsNextPage;
    window.DashboardApp.DOM.guestsCurrentPageEl = guestsCurrentPageEl;
    window.DashboardApp.DOM.guestsTotalPagesEl = guestsTotalPagesEl;
    window.DashboardApp.DOM.guestsPageRangeEl = guestsPageRangeEl;
    window.DashboardApp.DOM.guestsTotalCountEl = guestsTotalCountEl;
    window.DashboardApp.DOM.editGuestModal = editGuestModal;
    window.DashboardApp.DOM.btnCloseEditGuest = btnCloseEditGuest;
    window.DashboardApp.DOM.btnCancelEditGuest = btnCancelEditGuest;
    window.DashboardApp.DOM.editGuestForm = editGuestForm;
    window.DashboardApp.DOM.editGuestId = editGuestId;
    window.DashboardApp.DOM.editGuestName = editGuestName;
    window.DashboardApp.DOM.editGuestPhone = editGuestPhone;
    window.DashboardApp.DOM.editGuestIdNumber = editGuestIdNumber;
    window.DashboardApp.DOM.btnSaveEditGuest = btnSaveEditGuest;
    window.DashboardApp.DOM.importResultModal = importResultModal;
    window.DashboardApp.DOM.btnCloseImportResultModal = btnCloseImportResultModal;
    window.DashboardApp.DOM.btnConfirmImportResult = btnConfirmImportResult;
    window.DashboardApp.DOM.btnToggleUpdatedGuestsList = btnToggleUpdatedGuestsList;
    window.DashboardApp.DOM.importModalUpdatedContainer = importModalUpdatedContainer;
    window.DashboardApp.DOM.importModalToggleArrow = importModalToggleArrow;


    // Phase 3 DOM Bindings
    window.DashboardApp.DOM.usersTableBody = usersTableBody;
    window.DashboardApp.DOM.addUserForm = addUserForm;
    window.DashboardApp.DOM.newUsernameInput = newUsernameInput;
    window.DashboardApp.DOM.newUserPasswordInput = newUserPasswordInput;
    window.DashboardApp.DOM.newUserRoleSelect = newUserRoleSelect;
    window.DashboardApp.DOM.updatePasswordForm = updatePasswordForm;
    window.DashboardApp.DOM.currentAdminNewPasswordInput = currentAdminNewPasswordInput;
    window.DashboardApp.DOM.btnRefreshUsers = btnRefreshUsers;
    window.DashboardApp.DOM.btnOpenFactoryReset = btnOpenFactoryReset;
    window.DashboardApp.DOM.factoryResetModal = factoryResetModal;
    window.DashboardApp.DOM.btnCloseFactoryReset = btnCloseFactoryReset;
    window.DashboardApp.DOM.btnCancelFactoryReset = btnCancelFactoryReset;
    window.DashboardApp.DOM.factoryResetForm = factoryResetForm;
    window.DashboardApp.DOM.factoryResetPasswordInput = factoryResetPasswordInput;
    window.DashboardApp.DOM.factoryResetErrorMsg = factoryResetErrorMsg;
    window.DashboardApp.DOM.btnSubmitFactoryReset = btnSubmitFactoryReset;


    // Phase 2 DOM Bindings
    window.DashboardApp.DOM.searchLogs = searchLogs;
    window.DashboardApp.DOM.logsCountBadge = logsCountBadge;
    window.DashboardApp.DOM.logsTableBody = logsTableBody;
    window.DashboardApp.DOM.logsEmpty = logsEmpty;
    window.DashboardApp.DOM.btnRefreshLogs = btnRefreshLogs;



    // Phase 1 DOM Bindings
    window.DashboardApp.DOM.statAvailableRooms = statAvailableRooms;
    window.DashboardApp.DOM.statOccupiedRooms = statOccupiedRooms;
    window.DashboardApp.DOM.statCleaningRooms = statCleaningRooms;
    window.DashboardApp.DOM.statTotalReservations = statTotalReservations;
    window.DashboardApp.DOM.roomSelect = roomSelect;
    window.DashboardApp.DOM.overviewTableBody = overviewTableBody;
    window.DashboardApp.DOM.overviewEmpty = overviewEmpty;
    window.DashboardApp.DOM.todayDateBadge = todayDateBadge;
    window.DashboardApp.DOM.todayCheckoutsTableBody = todayCheckoutsTableBody;
    window.DashboardApp.DOM.todayCheckoutsCountBadge = todayCheckoutsCountBadge;
    window.DashboardApp.DOM.todayCheckoutsSearch = todayCheckoutsSearch;
    window.DashboardApp.DOM.todayCheckoutsEmpty = todayCheckoutsEmpty;
    window.DashboardApp.DOM.btnRefreshCheckouts = btnRefreshCheckouts;
    window.DashboardApp.DOM.todayCheckoutsFilters = todayCheckoutsFilters;

    if (window.DashboardApp.Helpers.initRooms) window.DashboardApp.Helpers.initRooms();
    if (window.DashboardApp.Helpers.initGuests) window.DashboardApp.Helpers.initGuests();
    if (window.DashboardApp.Helpers.initAdmin) window.DashboardApp.Helpers.initAdmin();
    if (window.DashboardApp.Helpers.initOverview) window.DashboardApp.Helpers.initOverview();
    if (window.DashboardApp.Helpers.initLogs) window.DashboardApp.Helpers.initLogs();

    // [Spike] Test State write
    window.DashboardApp.State.testVar = 42;
    console.assert(window.DashboardApp.State.testVar === 42, "Spike testVar failed");
    window.DashboardApp.Helpers.showConfirmDialog = showConfirmDialog;

    // Bind State
    window.DashboardApp.Helpers.showPromptDialog = showPromptDialog;
    window.DashboardApp.Helpers.sendReservationWhatsApp = sendReservationWhatsApp;
    window.DashboardApp.Helpers.openInvoiceModal = openInvoiceModal;
    window.DashboardApp.State.currentUser = currentUser;
    // 1. Immediate UI state from localStorage cache
    const cachedRole = localStorage.getItem('currentUserRole');
    if (cachedRole) {
      applyRbacUi(cachedRole);
      userDisplayRole.textContent = cachedRole === 'Admin' ? 'مدير نظام (Admin)' : 'مستخدم (User)';
    }

    try {
      const info = await window.api.getAppInfo();
      if (info && info.user) {
        currentUser = info.user;
        window.DashboardApp.State.currentUser = info.user;
        userDisplayName.textContent = currentUser.username;
        userDisplayRole.textContent = currentUser.role === 'Admin' ? 'مدير نظام (Admin)' : 'مستخدم (User)';
        localStorage.setItem('currentUserRole', currentUser.role);
        localStorage.setItem('currentUsername', currentUser.username);
        localStorage.setItem('currentUserId', String(currentUser.id));

        applyRbacUi(currentUser.role);

        if (info.logId) {
          localStorage.setItem('ahmed_hotel_log_id', String(info.logId));
        }
      } else {
        currentUser = null;
        window.DashboardApp.State.currentUser = null;
        applyRbacUi(null);
      }
      if (info && info.dbPath) {
        const name = info.dbPath.split(/[/\\]/).pop();
        dbFileName.textContent = `SQLite: ${name}`;
        dbFileName.title = info.dbPath;
      }

      // Initialize Daily Backup Tooltip
      try {
        const backupStatus = await window.api.getDailyBackupStatus();
        if (backupStatus && backupStatus.success && backupStatus.data && btnDailyBackupModal) {
          const d = backupStatus.data;
          btnDailyBackupModal.title = `النسخ الاحتياطي التلقائي: يومياً الساعة 12:00 منتصف الليل\nآخر نسخة: ${d.lastDailyBackupFile || 'اليوم'}`;
        }
      } catch (be) {}
    } catch (err) {
      currentUser = null;
        window.DashboardApp.State.currentUser = null;
      applyRbacUi(null);
      console.warn('App info error:', err);
    }

    if (currentUser) {
      try { await refreshHotelBusinessState(); }
      catch (businessDateErr) { console.warn('Hotel business date unavailable:', businessDateErr); }
      if (currentUser.role === 'Admin') await refreshBusinessDayReconciliationNotice();
    }

    // Default view: overview
    window.switchView('overview');
  }

  // Escape HTML helper
  function escapeHtml(str) { return window.DashboardApp.Helpers.escapeHtml(str); }

  async function refreshBusinessDayReconciliationNotice() {
    const notice = document.getElementById('business-day-shift-notice');
    const text = document.getElementById('business-day-shift-notice-text');
    if (!notice || !text || currentUser?.role !== 'Admin') return;
    try {
      const response = await window.api.getPendingShiftReconciliationAudits();
      const pending = response?.success && Array.isArray(response.data) ? response.data : [];
      notice.hidden = pending.length === 0;
      text.textContent = pending.length
        ? `هناك ${pending.length} إقفال تلقائي بانتظار مطابقة الوردية (${pending[0].closed_business_date}).`
        : '';
    } catch (error) {
      console.warn('Business day reconciliation notice unavailable:', error);
    }
  }

  const openReconciliationButton = document.getElementById('btn-open-business-day-reconciliation');
  if (openReconciliationButton) {
    openReconciliationButton.addEventListener('click', () => window.switchView('admin'));
  }

  if (window.api?.onHotelBusinessDateChanged) {
    window.api.onHotelBusinessDateChanged(async event => {
      if (!currentUser || !event?.businessDate || event.businessDate === window.DashboardApp.State.businessDate) return;
      await refreshHotelBusinessState();
      updateSystemClock();
      const helpers = window.DashboardApp.Helpers;
      await Promise.all([
        helpers.loadOverviewData?.(),
        helpers.loadRoomsData?.(),
        helpers.loadReservationsData?.()
      ]);
      if (currentUser.role === 'Admin') await refreshBusinessDayReconciliationNotice();
      showToast(`بدأ يوم فندقي جديد: ${event.businessDate}`, 'info');
    });
  }
  window.refreshBusinessDayReconciliationNotice = refreshBusinessDayReconciliationNotice;

  window.openInvoiceModal = openInvoiceModal;
  window.openRoomRevenueModal = window.DashboardApp.Helpers.openRoomRevenueModal;
  window.openEditGuestModal = window.DashboardApp.Helpers.openEditGuestModal;
  window.openShiftAuditModal = openShiftAuditModal;
  window.openDailyBackupModal = openDailyBackupModal;
  window.showConfirmDialog = showConfirmDialog;
  window.showPromptDialog = showPromptDialog;
  window.sendReservationWhatsApp = sendReservationWhatsApp;
  window.openUserManualModal = openUserManualModal;
  window.DashboardApp.Helpers.refreshHotelBusinessState = refreshHotelBusinessState;
  updateSystemClock();
  window.setInterval(updateSystemClock, 1000);

  init();

})();
