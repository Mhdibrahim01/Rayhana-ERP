/**
 * نظام أحمد لإدارة الفنادق (Ahmed Hotel ERP)
 * Complete Interactive Multi-View Dashboard Script (dashboard.js)
 * Includes: RBAC, Chart.js Analytics, SheetJS Excel Import/Export
 */

(function () {
  'use strict';

  // State Caches
  let currentUser = null;
  let reservationsCache = [];
  let roomsCache = [];
  let guestsCache = [];
  let usersCache = [];
  let logsCache = [];
  let currentReservationFilter = 'all';
  let currentRoomFilter = 'all';

  // Chart Instances
  let monthlyRevenueChart = null;
  let roomStatusChart = null;

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

  // Reservation Form Elements
  const reservationForm = document.getElementById('reservation-form');
  const guestNameInput = document.getElementById('guest-name');
  const guestPhoneInput = document.getElementById('guest-phone');
  const guestPhoneError = document.getElementById('guest-phone-error');
  const guestIdNumberInput = document.getElementById('guest-id-number');
  const guestIdError = document.getElementById('guest-id-error');
  const roomSelect = document.getElementById('room-select');
  const checkInInput = document.getElementById('check-in-date');
  const checkOutInput = document.getElementById('check-out-date');
  const totalPriceInput = document.getElementById('total-price');
  const paymentMethodSelect = document.getElementById('payment-method');
  const paidAmountInput = document.getElementById('paid-amount');
  const depositAmountInput = document.getElementById('deposit-amount');
  const remainingBalanceVal = document.getElementById('remaining-balance-val');
  const btnClearForm = document.getElementById('btn-clear-form');
  const autofillGuestStatus = document.getElementById('autofill-guest-status');
  const autofillGuestMsg = document.getElementById('autofill-guest-msg');
  const autofillGuestBadge = document.getElementById('autofill-guest-badge');
  const overviewTableBody = document.getElementById('overview-table-body');
  const overviewEmpty = document.getElementById('overview-empty');

  // New Reservation Modal Elements
  const newReservationModal = document.getElementById('new-reservation-modal');
  const btnOpenNewReservationModal = document.getElementById('btn-open-new-reservation-modal');
  const btnCloseNewReservation = document.getElementById('btn-close-new-reservation');
  const btnResNewBooking = document.getElementById('btn-res-new-booking');

  // Topbar Actions (Backup, Restore, Shift Audit)
  const btnOpenShiftAudit = document.getElementById('btn-open-shift-audit');
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

  // Shift Audit Modal
  const shiftAuditModal = document.getElementById('shift-audit-modal');
  const btnCloseShiftAudit = document.getElementById('btn-close-shift-audit');
  const btnPrintShiftAudit = document.getElementById('btn-print-shift-audit');
  const btnExportPdfShiftAudit = document.getElementById('btn-export-pdf-shift-audit');
  const btnPreviewWindowShiftAudit = document.getElementById('btn-preview-window-shift-audit');
  const shiftAuditContent = document.getElementById('shift-audit-content');

  // All Reservations Elements
  const allReservationsTableBody = document.getElementById('all-reservations-table-body');
  const allReservationsEmpty = document.getElementById('all-reservations-empty');
  const searchAllReservations = document.getElementById('search-all-reservations');
  const resFilterTabs = document.querySelectorAll('#res-filter-tabs .filter-tab-btn');
  const btnExportReservationsExcel = document.getElementById('btn-export-reservations-excel');
  const inputImportReservationsExcel = document.getElementById('input-import-reservations-excel');

  // Rooms Elements
  const roomsGridContainer = document.getElementById('rooms-grid-container');
  const roomsFilterTabs = document.querySelectorAll('#rooms-filter-tabs .filter-tab-btn');
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
  const guestsTableBody = document.getElementById('guests-table-body');
  const guestsEmpty = document.getElementById('guests-empty');
  const searchGuests = document.getElementById('search-guests');
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
  function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Set default dates
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  checkInInput.value = getLocalDateString(today);
  checkOutInput.value = getLocalDateString(tomorrow);

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    toast.innerHTML = `
      ${iconMap[type] || iconMap.info}
      <span style="flex: 1;">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

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

    // 1. INSTANT: Update navigation links active state (pure CSS class toggle — zero reflow)
    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.section === targetView);
    });

    // 2. INSTANT: Hide all sections, show target (simple display toggle — no layout calc)
    Object.keys(viewSections).forEach(key => {
      const section = viewSections[key];
      if (section) {
        section.style.display = key === targetView ? 'block' : 'none';
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
        case 'overview':     loadOverviewData();     break;
        case 'reservations': loadReservationsData(); break;
        case 'rooms':        loadRoomsData();        break;
        case 'guests':       loadGuestsData();       break;
        case 'admin':        loadAdminData();        break;
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

  // --- AUTO CALCULATE TOTAL PRICE & REMAINING BALANCE ---
  let isPaidAmountCustomized = false;

  function updateRemainingBalance() {
    if (!totalPriceInput || !paidAmountInput || !remainingBalanceVal) return;
    const total = parseFloat(totalPriceInput.value) || 0;
    const paid = parseFloat(paidAmountInput.value) || 0;
    const remaining = Math.max(0, total - paid);
    remainingBalanceVal.textContent = `${remaining.toFixed(2)} ريال`;
    remainingBalanceVal.style.color = remaining > 0 ? '#dc2626' : '#059669';
  }

  function calculatePrice(forceSyncPaid = false) {
    const selectedOption = roomSelect.options[roomSelect.selectedIndex];
    if (!selectedOption || !selectedOption.dataset.price) return;

    const pricePerNight = parseFloat(selectedOption.dataset.price) || 0;

    if (checkInInput.value && checkOutInput.value) {
      const [y1, m1, day1] = checkInInput.value.split('-').map(Number);
      const [y2, m2, day2] = checkOutInput.value.split('-').map(Number);
      const diffDays = Math.round((Date.UTC(y2, m2 - 1, day2) - Date.UTC(y1, m1 - 1, day1)) / 86400000);

      if (diffDays > 0) {
        totalPriceInput.value = (diffDays * pricePerNight).toFixed(2);
      } else {
        totalPriceInput.value = pricePerNight.toFixed(2);
      }
    } else {
      totalPriceInput.value = pricePerNight.toFixed(2);
    }

    // Always synchronize المبلغ المدفوع مقدماً when changing rooms or if not manually customized
    if (paidAmountInput) {
      if (forceSyncPaid || !isPaidAmountCustomized || !paidAmountInput.value || parseFloat(paidAmountInput.value) === 0) {
        paidAmountInput.value = totalPriceInput.value;
      }
    }
    updateRemainingBalance();
  }

  // When room is changed, always update both total price and المبلغ المدفوع مقدماً to the new room's price
  roomSelect.addEventListener('change', () => {
    isPaidAmountCustomized = false;
    calculatePrice(true);
  });

  // When dates change, update paid amount if user hasn't explicitly customized a partial amount
  checkInInput.addEventListener('change', () => {
    calculatePrice(!isPaidAmountCustomized);
  });
  checkOutInput.addEventListener('change', () => {
    calculatePrice(!isPaidAmountCustomized);
  });

  if (totalPriceInput) {
    totalPriceInput.addEventListener('input', () => {
      if (!isPaidAmountCustomized && paidAmountInput) {
        paidAmountInput.value = totalPriceInput.value;
      }
      updateRemainingBalance();
    });
  }

  if (paidAmountInput) {
    paidAmountInput.addEventListener('input', () => {
      const currentTotal = parseFloat(totalPriceInput ? totalPriceInput.value : 0) || 0;
      const currentPaid = parseFloat(paidAmountInput.value) || 0;
      // Mark as customized only if user deliberately entered a partial amount different from total
      if (Math.abs(currentPaid - currentTotal) > 0.01) {
        isPaidAmountCustomized = true;
      } else {
        isPaidAmountCustomized = false;
      }
      updateRemainingBalance();
    });
  }

  // --- STATUS BADGES ---
  function getReservationStatusBadge(status) {
    if (status === 'مؤكد') {
      return `<span class="badge badge-confirmed">حجز مؤكد</span>`;
    } else if (status === 'مكتمل') {
      return `<span class="badge badge-completed">تم تسجيل الخروج</span>`;
    } else if (status === 'ملغي') {
      return `<span class="badge badge-cancelled">ملغي</span>`;
    }
    return `<span class="badge">${escapeHtml(status)}</span>`;
  }

  function getPaymentStatusBadge(status) {
    // PERF: Using CSS classes (not inline styles) — browser caches style rules once.
    if (status === 'مدفوع بالكامل' || status === 'مكتمل') {
      return `<span class="badge badge-paid-full">مدفوع بالكامل ✓</span>`;
    } else if (status === 'مدفوع جزئياً') {
      return `<span class="badge badge-paid-partial">مدفوع جزئياً</span>`;
    } else {
      return `<span class="badge badge-unpaid">غير مدفوع</span>`;
    }
  }

  function getRoomStatusBadge(status) {
    if (status === 'متاحة') {
      return `<span class="badge badge-available">متاحة (جاهزة)</span>`;
    } else if (status === 'مشغولة') {
      return `<span class="badge badge-occupied">مشغولة</span>`;
    } else if (status === 'تنظيف') {
      return `<span class="badge badge-cleaning">قيد التنظيف</span>`;
    } else if (status === 'محجوزة') {
      return `<span class="badge badge-reserved">محجوزة (قادمة)</span>`;
    }
    return `<span class="badge">${escapeHtml(status)}</span>`;
  }

  // =========================================================================
  // ANALYTICS & CHART.JS VISUALIZATION (Light White Glass with Forest Green)
  // =========================================================================
  function renderAnalyticsCharts(monthlyData, stats) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js is not loaded.');
      return;
    }

    // 1. Monthly Revenue Spline Area Chart (Forest Green Accent)
    const revenueCtx = document.getElementById('monthly-revenue-chart');
    if (revenueCtx) {
      let labels = [];
      let values = [];

      if (monthlyData && monthlyData.length > 0) {
        labels = monthlyData.map(d => d.month);
        values = monthlyData.map(d => parseFloat(d.revenue) || 0);
      } else {
        labels = ['2026-06', '2026-07', '2026-08', '2026-09'];
        values = [0, 0, 0, 0];
      }

      if (monthlyRevenueChart) {
        monthlyRevenueChart.destroy();
      }

      const ctx2d = revenueCtx.getContext('2d');
      const gradient = ctx2d.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, 'rgba(26, 67, 50, 0.22)');
      gradient.addColorStop(1, 'rgba(26, 67, 50, 0.01)');

      monthlyRevenueChart = new Chart(revenueCtx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'الإيرادات بالريال',
            data: values,
            borderColor: '#1a4332',
            borderWidth: 2.5,
            pointBackgroundColor: '#1a4332',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4.5,
            pointHoverRadius: 6.5,
            fill: true,
            backgroundColor: gradient,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1a4332',
              titleColor: '#ffffff',
              bodyColor: '#ecfdf5',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderWidth: 1,
              padding: 10,
              displayColors: false,
              callbacks: {
                label: function (ctx) {
                  return ` الإيرادات: ${ctx.parsed.y.toLocaleString()} ريال`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: '#64748b',
                font: { size: 11 },
                callback: function (val) {
                  return val.toLocaleString() + ' ر.س';
                }
              },
              grid: { color: 'rgba(226, 232, 240, 0.8)' }
            },
            x: {
              ticks: { color: '#64748b', font: { size: 11 } },
              grid: { display: false }
            }
          }
        }
      });
    }

    // 2. Room Status Doughnut Chart (Light Palette)
    const roomCtx = document.getElementById('room-status-chart');
    if (roomCtx) {
      const avail = stats ? stats.availableRooms : 0;
      const occ = stats ? stats.occupiedRooms : 0;
      const clean = stats ? stats.cleaningRooms : 0;

      if (roomStatusChart) {
        roomStatusChart.destroy();
      }

      roomStatusChart = new Chart(roomCtx, {
        type: 'doughnut',
        data: {
          labels: ['متاحة (Available)', 'مشغولة (Occupied)', 'تنظيف (Cleaning)'],
          datasets: [{
            data: [avail, occ, clean],
            backgroundColor: ['#059669', '#dc2626', '#d97706'],
            borderWidth: 2.5,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                // FIXED: was '#cbd5e1' — too light on white glass background, invisible.
                color: '#64748b',
                font: { size: 11, family: 'Cairo, Segoe UI, Tahoma' }
              }
            }
          },
          cutout: '72%'
        }
      });
    }
  }

  // =========================================================================
  // VIEW 1: OVERVIEW LOGIC
  // =========================================================================
  async function loadOverviewData() {
    try {
      // 1. Load Stats
      let stats = null;
      const statsRes = await window.api.getDashboardStats();
      if (statsRes.success && statsRes.data) {
        stats = statsRes.data;
        statAvailableRooms.textContent = stats.availableRooms.toLocaleString();
        statOccupiedRooms.textContent = stats.occupiedRooms.toLocaleString();
        statCleaningRooms.textContent = stats.cleaningRooms.toLocaleString();
        statTotalReservations.textContent = stats.totalReservations.toLocaleString();
      }

      // 2. Load Monthly Revenue for Analytics
      let monthlyData = [];
      const analyticsRes = await window.api.getMonthlyRevenue();
      if (analyticsRes.success) {
        monthlyData = analyticsRes.data || [];
      }

      // Render Charts
      renderAnalyticsCharts(monthlyData, stats);

      // 3. Load Available & Future Reserved Rooms into Booking Dropdown
      const currentSelectedVal = roomSelect ? roomSelect.value : '';
      const roomsRes = await window.api.getAvailableRooms();
      if (roomsRes.success) {
        let optionsHtml = `<option value="">-- اختر الغرفة --</option>`;
        (roomsRes.data || []).forEach(room => {
          const isReservedLater = room.status === 'محجوزة';
          optionsHtml += `
            <option value="${room.id}" data-price="${room.price_per_night}">
              غرفة رقم ${escapeHtml(room.room_number)} (${escapeHtml(room.type)}) - ${room.price_per_night} ريال/ليلة ${isReservedLater ? '⏳ (محجوزة لفترة لاحقة)' : '✓ (متاحة)'}
            </option>
          `;
        });
        roomSelect.innerHTML = optionsHtml;
        if (currentSelectedVal) {
          roomSelect.value = currentSelectedVal;
        }
      }

      // 4. Load Recent Reservations into Overview Table
      const resRes = await window.api.getAllReservations();
      if (resRes.success) {
        reservationsCache = resRes.data || [];
        renderOverviewTable();
      }

      // 5. Load Today's Check-outs Widget
      await loadTodayCheckouts();
    } catch (err) {
      console.error('Error loading overview data:', err);
    }
  }

  function renderOverviewTable() {
    const recent = reservationsCache.slice(0, 8);

    if (recent.length === 0) {
      overviewTableBody.innerHTML = '';
      overviewEmpty.style.display = 'block';
      return;
    }

    overviewEmpty.style.display = 'none';

    overviewTableBody.innerHTML = recent.map(r => {
      const isConfirmed = r.status === 'مؤكد';
      const total = parseFloat(r.total_price || 0);
      const paid = parseFloat(r.paid_amount || 0);
      const remaining = Math.max(0, total - paid);

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 800; color: var(--primary); white-space: nowrap;">#${r.id}</td>
          <td>
            <div style="font-weight: 800; color: #1e293b; font-size: 0.92rem; white-space: nowrap;">${escapeHtml(r.guest_name)}</div>
          </td>
          <td style="white-space: nowrap;">
            <span style="font-weight: 800; color: #1a4332;">غرفة ${escapeHtml(r.room_number)}</span>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; font-family: monospace; direction: ltr; text-align: right;">${escapeHtml(r.check_in_date)}</td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; font-family: monospace; direction: ltr; text-align: right;">${escapeHtml(r.check_out_date)}</td>
          <td style="white-space: nowrap;">
            <div style="font-weight: 800; color: #1e293b; font-size: 0.9rem;">${total.toLocaleString()} ريال</div>
            <div style="font-size: 0.74rem; color: #059669; font-weight: 700;">مدفوع: ${paid.toLocaleString()}</div>
            ${remaining > 0 ? `<div style="font-size: 0.74rem; color: #dc2626; font-weight: 800;">متبقي: ${remaining.toLocaleString()}</div>` : ''}
          </td>
          <td style="white-space: nowrap;">${getPaymentStatusBadge(r.payment_status)}</td>
          <td style="white-space: nowrap;">${getReservationStatusBadge(r.status)}</td>
          <td style="text-align: center; white-space: nowrap;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: nowrap;">
              <button type="button" class="btn-action-icon" data-action="invoice" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #f0fdf4; color: #166534; border: 1.5px solid #bbf7d0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="طباعة سند الاستلام والإقامة (فاتورة)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              </button>
              ${isConfirmed && remaining > 0 ? `
                <button type="button" class="btn-action-icon btn-pay" data-action="add-payment" data-id="${r.id}" onclick="event.stopPropagation(); window.openAddPaymentModal && window.openAddPaymentModal(${r.id});" style="width: 30px; height: 30px; padding: 0; background: #a67c52; color: #ffffff; border: none; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; box-shadow: 0 2px 8px rgba(166, 124, 82, 0.35);" title="تسجيل دفعة سداد جديدة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                </button>
              ` : ''}
              ${isConfirmed ? `
                <button type="button" class="btn-action-icon" data-action="checkout" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #ffffff; color: #334155; border: 1.5px solid #cbd5e1; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="تسجيل مغادرة وتسليم الغرفة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
                <button type="button" class="btn-action-icon" data-action="whatsapp" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #f0fdf4; color: #16a34a; border: 1.5px solid #86efac; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="مراسلة النزيل عبر واتساب">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                <button type="button" class="btn-action-icon" data-action="cancel" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="إلغاء الحجز">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // TODAY'S CHECK-OUTS (مغادرات اليوم) WIDGET LOGIC
  // =========================================================================
  async function loadTodayCheckouts() {
    try {
      const todayStr = getLocalDateString();
      if (todayDateBadge) {
        todayDateBadge.textContent = todayStr;
      }

      const res = await window.api.getTodayCheckouts(todayStr);
      if (res && res.success) {
        const checkouts = res.data || [];
        renderTodayCheckoutsTable(checkouts);
      } else {
        console.warn('Could not load today checkouts:', res?.error);
      }
    } catch (err) {
      console.error('Error in loadTodayCheckouts:', err);
    }
  }

  function renderTodayCheckoutsTable(checkouts) {
    if (!todayCheckoutsTableBody) return;

    if (todayCheckoutsCountBadge) {
      const count = checkouts.length;
      todayCheckoutsCountBadge.textContent = `${count} ${count === 1 ? 'مغادرة' : 'مغادرات'}`;
    }

    if (checkouts.length === 0) {
      todayCheckoutsTableBody.innerHTML = '';
      if (todayCheckoutsEmpty) todayCheckoutsEmpty.style.display = 'block';
      return;
    }

    if (todayCheckoutsEmpty) todayCheckoutsEmpty.style.display = 'none';

    todayCheckoutsTableBody.innerHTML = checkouts.map(r => {
      const isConfirmed = r.status === 'مؤكد';
      const isCompleted = r.status === 'مكتمل';

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td>
            <span style="font-weight: 800; font-size: 0.92rem; color: #1a4332; background: #ecfdf5; padding: 3px 8px; border-radius: 6px; border: 1px solid #a7f3d0;">
              غرفة ${escapeHtml(r.room_number)}
            </span>
          </td>
          <td style="font-size: 0.88rem; color: var(--text-secondary);">${escapeHtml(r.room_type || '')}</td>
          <td>
            <div style="font-weight: 800; color: #1e293b; font-size: 0.92rem;">${escapeHtml(r.guest_name)}</div>
            ${r.guest_id_number ? `<small style="color: var(--text-muted);">هوية: ${escapeHtml(r.guest_id_number)}</small>` : ''}
          </td>
          <td style="font-family: monospace; font-size: 0.88rem; color: var(--text-secondary);">${escapeHtml(r.guest_phone || '-')}</td>
          <td style="font-size: 0.84rem; color: var(--text-secondary);">${escapeHtml(r.check_in_date)}</td>
          <td style="font-weight: 800; color: var(--primary); font-size: 0.92rem;">${parseFloat(r.total_price || 0).toLocaleString()} ريال</td>
          <td>${getReservationStatusBadge(r.status)}</td>
          <td style="text-align: center;">
            ${isConfirmed ? `
              <button class="btn btn-primary btn-sm" data-action="checkout" data-id="${r.id}" style="padding: 5px 12px; font-weight: 800; font-size: 0.8rem;" title="تسجيل مغادرة النزيل وتسليم الغرفة">
                تسجيل مغادرة &larr;
              </button>
            ` : isCompleted ? `
              <span class="badge" style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; font-weight: 800;">تمت المغادرة &check;</span>
            ` : `<span style="color: var(--text-secondary); font-size: 0.8rem;">-</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  if (btnRefreshCheckouts) {
    btnRefreshCheckouts.addEventListener('click', loadTodayCheckouts);
  }

  // =========================================================================
  // RETURNING GUEST AUTO-FILL SYSTEM (البحث التلقائي عن النزلاء السابقين)
  // =========================================================================
  let lastAutoFilledGuestId = null;
  let autofillDebounceTimer = null;

  function resetAutofillBanner() {
    lastAutoFilledGuestId = null;
    if (autofillGuestStatus) {
      autofillGuestStatus.style.display = 'none';
    }
  }

  function highlightField(el) {
    if (!el) return;
    el.classList.add('input-autofill-highlight');
    setTimeout(() => el.classList.remove('input-autofill-highlight'), 1600);
  }

  async function handleGuestAutofill(triggeredBy, eventType) {
    const phoneVal = guestPhoneInput ? guestPhoneInput.value.trim() : '';
    const idVal = guestIdNumberInput ? guestIdNumberInput.value.trim() : '';

    const activeVal = triggeredBy === 'phone' ? phoneVal : idVal;

    // Minimum 4 characters to trigger search
    if (!activeVal || activeVal.length < 4) {
      if (!phoneVal && !idVal) {
        resetAutofillBanner();
      }
      return;
    }

    try {
      const res = await window.api.searchGuest({ phone: phoneVal, id_number: idVal });
      if (res && res.success && res.guest) {
        const guest = res.guest;

        // Auto-fill if it's a new match or name is currently empty
        if (guest.id !== lastAutoFilledGuestId || !guestNameInput.value.trim()) {
          lastAutoFilledGuestId = guest.id;

          // 1. Fill Name
          if (guest.name) {
            guestNameInput.value = guest.name;
            highlightField(guestNameInput);
          }

          // 2. Cross-fill Phone / ID Number
          if (triggeredBy === 'phone' && guest.id_number && !guestIdNumberInput.value.trim()) {
            guestIdNumberInput.value = guest.id_number;
            highlightField(guestIdNumberInput);
          } else if (triggeredBy === 'id' && guest.phone && !guestPhoneInput.value.trim()) {
            guestPhoneInput.value = guest.phone;
            highlightField(guestPhoneInput);
          }

          // 3. Update Visual Status Banner
          const stays = parseInt(guest.total_stays, 10) || 0;
          let staysText = '';
          if (stays === 0) {
            staysText = 'بدون إقامات سابقة مكتملة';
          } else if (stays === 1) {
            staysText = 'إقامة سابقة واحدة';
          } else if (stays === 2) {
            staysText = 'إقامتان سابقتان';
          } else if (stays >= 3 && stays <= 10) {
            staysText = `${stays} إقامات سابقة`;
          } else {
            staysText = `${stays} إقامة سابقة`;
          }

          if (autofillGuestStatus && autofillGuestMsg) {
            autofillGuestMsg.innerHTML = stays > 0
              ? `<strong>تم التعرف على النزيل السابق:</strong> ${escapeHtml(guest.name)} (${staysText}) - تم ملء البيانات تلقائياً.`
              : `<strong>نزيل مسجل:</strong> ${escapeHtml(guest.name)} (${staysText}) - تم استرجاع البيانات تلقائياً.`;
            autofillGuestStatus.style.display = 'flex';
          }

          // 4. Alert / Toast in Arabic
          if (stays > 0) {
            showToast(`مرحباً بعودته! تم التعرف على النزيل السابق "${guest.name}" (${staysText}) واسترجاع بياناته تلقائياً.`, 'success');
          } else {
            showToast(`تم استرجاع بيانات النزيل المسجل "${guest.name}".`, 'info');
          }
        }
      }
    } catch (err) {
      console.error('[Autofill Error]', err);
    }
  }

  // Setup keyup and blur listeners for Phone and ID Number inputs
  if (guestPhoneInput) {
    guestPhoneInput.addEventListener('keyup', () => {
      clearTimeout(autofillDebounceTimer);
      autofillDebounceTimer = setTimeout(() => {
        handleGuestAutofill('phone', 'keyup');
      }, 300);
    });

    guestPhoneInput.addEventListener('blur', () => {
      handleGuestAutofill('phone', 'blur');
    });
  }

  if (guestIdNumberInput) {
    guestIdNumberInput.addEventListener('keyup', () => {
      clearTimeout(autofillDebounceTimer);
      autofillDebounceTimer = setTimeout(() => {
        handleGuestAutofill('id', 'keyup');
      }, 300);
    });

    guestIdNumberInput.addEventListener('blur', () => {
      handleGuestAutofill('id', 'blur');
    });
  }

  // Inline Error UI Helpers
  function setFieldError(inputEl, errorEl, msg) {
    if (!inputEl) return;
    inputEl.classList.add('border-rose-500');
    inputEl.style.borderColor = '#f43f5e';
    inputEl.style.boxShadow = '0 0 0 1.5px #f43f5e';
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
      errorEl.style.display = 'block';
    }
  }

  function clearFieldError(inputEl, errorEl) {
    if (!inputEl) return;
    inputEl.classList.remove('border-rose-500');
    inputEl.style.borderColor = '';
    inputEl.style.boxShadow = '';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
      errorEl.style.display = 'none';
    }
  }

  // Clear inline errors immediately on keystroke
  if (guestPhoneInput) {
    guestPhoneInput.addEventListener('input', () => {
      clearFieldError(guestPhoneInput, guestPhoneError);
    });
  }

  if (guestIdNumberInput) {
    guestIdNumberInput.addEventListener('input', () => {
      clearFieldError(guestIdNumberInput, guestIdError);
    });
  }

  // =========================================================================
  // STRICT FRONTEND DATA VALIDATIONS
  // =========================================================================
  function validateReservationInputs({ guestName, guestPhone, guestIdNumber, roomId, checkInDate, checkOutDate, totalPrice }) {
    clearFieldError(guestPhoneInput, guestPhoneError);
    clearFieldError(guestIdNumberInput, guestIdError);

    // 1. Required Essential Fields
    if (!guestName) {
      if (guestNameInput) { guestNameInput.focus(); highlightField(guestNameInput); }
      return { valid: false, error: 'يرجى إدخال اسم النزيل (حقل إلزامي).' };
    }
    if (!roomId) {
      if (roomSelect) { roomSelect.focus(); highlightField(roomSelect); }
      return { valid: false, error: 'يرجى اختيار رقم الغرفة المراد حجزها.' };
    }
    if (isNaN(totalPrice) || totalPrice <= 0) {
      if (totalPriceInput) { totalPriceInput.focus(); highlightField(totalPriceInput); }
      return { valid: false, error: 'السعر الإجمالي مطلوب ويجب أن يكون أكبر من الصفر.' };
    }

    // 2. Phone Number: Must start with 05 and be exactly 10 digits (Inline error)
    if (!guestPhone) {
      setFieldError(guestPhoneInput, guestPhoneError, 'يرجى إدخال رقم جوال النزيل.');
      if (guestPhoneInput) guestPhoneInput.focus();
      return { valid: false, inline: true, error: 'يرجى إدخال رقم جوال النزيل.' };
    }
    if (!/^05\d{8}$/.test(guestPhone)) {
      setFieldError(guestPhoneInput, guestPhoneError, 'رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام (مثال: 0501234567).');
      if (guestPhoneInput) guestPhoneInput.focus();
      return { valid: false, inline: true, error: 'رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.' };
    }

    // 3. National ID (10 digits) OR Passport (6-9 alphanumeric characters) (Inline error)
    if (guestIdNumber && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(guestIdNumber)) {
      setFieldError(guestIdNumberInput, guestIdError, 'رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.');
      if (guestIdNumberInput) guestIdNumberInput.focus();
      return { valid: false, inline: true, error: 'رقم الهوية أو جواز السفر غير صحيح.' };
    }

    // 4. Dates Logic: check_in_date not in past, check_out_date > check_in_date
    if (!checkInDate) {
      if (checkInInput) { checkInInput.focus(); highlightField(checkInInput); }
      return { valid: false, error: 'يرجى تحديد تاريخ الوصول.' };
    }
    if (!checkOutDate) {
      if (checkOutInput) { checkOutInput.focus(); highlightField(checkOutInput); }
      return { valid: false, error: 'يرجى تحديد تاريخ المغادرة.' };
    }

    const todayStr = getLocalDateString(new Date());
    if (checkInDate < todayStr) {
      if (checkInInput) { checkInInput.focus(); highlightField(checkInInput); }
      return { valid: false, error: 'تاريخ الوصول لا يمكن أن يكون في الماضي (يجب أن يكون تاريخ اليوم أو تاريخاً مستقبلياً).' };
    }

    if (checkOutDate <= checkInDate) {
      if (checkOutInput) { checkOutInput.focus(); highlightField(checkOutInput); }
      return { valid: false, error: 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بشكل محدد.' };
    }

    return { valid: true };
  }

  function validateGuestInputs({ name, phone, id_number }) {
    if (!name) {
      if (newCustomerName) { newCustomerName.focus(); highlightField(newCustomerName); }
      return { valid: false, error: 'يرجى إدخال اسم العميل / النزيل.' };
    }
    if (phone && !/^05\d{8}$/.test(phone)) {
      if (newCustomerPhone) { newCustomerPhone.focus(); highlightField(newCustomerPhone); }
      return { valid: false, error: 'رقم الجوال غير صحيح: يجب أن يبدأ بـ 05 ويتكون من 10 أرقام بالضبط (مثال: 0501234567).' };
    }
    if (id_number && !/^(?:\d{10}|[a-zA-Z0-9]{6,9})$/i.test(id_number)) {
      if (newCustomerId) { newCustomerId.focus(); highlightField(newCustomerId); }
      return { valid: false, error: 'رقم الهوية الوطنية أو الإقامة (10 أرقام) أو جواز السفر (6 إلى 9 خانات) غير صحيح.' };
    }
    return { valid: true };
  }

  // Quick Reservation Form Submit
  reservationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const guestName = guestNameInput.value.trim();
    const guestPhone = guestPhoneInput.value.trim();
    const guestIdNumber = guestIdNumberInput.value.trim();
    const roomId = roomSelect.value;
    const checkInDate = checkInInput.value;
    const checkOutDate = checkOutInput.value;
    const totalPrice = parseFloat(totalPriceInput.value) || 0;
    const paidAmount = parseFloat(paidAmountInput ? paidAmountInput.value : 0) || 0;
    const depositAmount = parseFloat(depositAmountInput ? depositAmountInput.value : 0) || 0;
    const paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'نقداً';

    // Strict Frontend Validation
    const validation = validateReservationInputs({
      guestName,
      guestPhone,
      guestIdNumber,
      roomId,
      checkInDate,
      checkOutDate,
      totalPrice
    });

    if (!validation.valid) {
      if (!validation.inline) {
        showToast(validation.error, 'error');
      }
      return;
    }

    try {
      const res = await window.api.createReservation({
        guestName,
        guestPhone,
        guestIdNumber,
        roomId,
        checkInDate,
        checkOutDate,
        totalPrice,
        paidAmount,
        depositAmount,
        paymentMethod
      });

      if (res && res.success) {
        // 1. Reset form fields and error indicators
        reservationForm.reset();
        guestNameInput.value = '';
        guestPhoneInput.value = '';
        guestIdNumberInput.value = '';
        totalPriceInput.value = '';
        if (paidAmountInput) paidAmountInput.value = '';
        if (depositAmountInput) depositAmountInput.value = '0';
        clearFieldError(guestPhoneInput, guestPhoneError);
        clearFieldError(guestIdNumberInput, guestIdError);
        updateRemainingBalance();
        resetAutofillBanner();

        // 2. Close booking modal
        closeNewReservationModal();

        // 3. Dynamic UI Update: Refresh rooms grid, overview stats, and reservations table
        await Promise.all([
          loadRoomsData(),
          loadOverviewData(),
          loadReservationsData()
        ]);

        // 4. Smooth Visual Feedback: Highlight the updated room card on screen
        const updatedCard = document.querySelector(`.room-card[data-room-id="${roomId}"]`);
        if (updatedCard) {
          updatedCard.style.transition = 'all 0.4s ease';
          updatedCard.style.boxShadow = '0 0 0 3px #10b981, 0 10px 25px -4px rgba(16, 185, 129, 0.35)';
          updatedCard.style.transform = 'translateY(-2px)';
          setTimeout(() => {
            updatedCard.style.boxShadow = '';
            updatedCard.style.transform = '';
          }, 1800);
        }

        showToast(`تم تأكيد الحجز بنجاح للنزيل "${guestName}"!`, 'success');
      } else {
        showToast(res.error || 'فشل في حفظ الحجز.', 'error');
      }
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  btnClearForm.addEventListener('click', () => {
    isPaidAmountCustomized = false;
    clearFieldError(guestPhoneInput, guestPhoneError);
    clearFieldError(guestIdNumberInput, guestIdError);
    reservationForm.reset();
    resetAutofillBanner();
    checkInInput.value = getLocalDateString(new Date());
    checkOutInput.value = getLocalDateString(new Date(Date.now() + 86400000));
    if (depositAmountInput) depositAmountInput.value = '0';
    calculatePrice(true);
  });

  // --- NEW RESERVATION MODAL & ROOM AUTO-FILL CONTROLS ---
  function unlockRoomSelect() {
    if (!roomSelect) return;
    roomSelect.classList.remove('select-locked');
    roomSelect.style.borderColor = '';
    roomSelect.style.background = '';
    roomSelect.style.color = '';
    roomSelect.style.fontWeight = '';
    const lockBadge = document.getElementById('room-select-lock-badge');
    if (lockBadge) {
      lockBadge.style.display = 'none';
      lockBadge.innerHTML = '';
    }
  }

  function initiateRoomBooking(roomId) {
    const targetId = parseInt(roomId, 10);
    const targetRoom = roomsCache.find(r => r.id === targetId);

    // 1. Open the New Reservation Modal
    openNewReservationModal();

    if (!roomSelect) return;

    // 2. Ensure option exists in roomSelect
    let optionExists = false;
    for (let i = 0; i < roomSelect.options.length; i++) {
      if (parseInt(roomSelect.options[i].value, 10) === targetId) {
        optionExists = true;
        break;
      }
    }

    if (!optionExists && targetRoom) {
      const opt = document.createElement('option');
      opt.value = targetRoom.id;
      opt.dataset.price = targetRoom.price_per_night;
      opt.textContent = `غرفة رقم ${targetRoom.room_number} (${targetRoom.type}) - ${targetRoom.price_per_night} ريال/ليلة`;
      roomSelect.appendChild(opt);
    }

    // 3. Pre-fill and calculate price (force update المبلغ المدفوع مقدماً to new room's price)
    roomSelect.value = String(targetId);
    isPaidAmountCustomized = false;
    calculatePrice(true);

    // 4. Lock & Clearly indicate the room is pre-selected
    roomSelect.classList.add('select-locked');
    roomSelect.style.borderColor = '#1a4332';
    roomSelect.style.background = '#f0fdf4';
    roomSelect.style.color = '#166534';
    roomSelect.style.fontWeight = '800';

    const lockBadge = document.getElementById('room-select-lock-badge');
    if (lockBadge && targetRoom) {
      lockBadge.style.display = 'inline-flex';
      lockBadge.innerHTML = `🔒 محددة: غرفة ${escapeHtml(targetRoom.room_number)} (${escapeHtml(targetRoom.type)}) <a href="#" id="link-unlock-room" style="color: #dc2626; margin-right: 6px; text-decoration: underline; font-weight: 700;">[تغيير]</a>`;
      
      const linkUnlock = document.getElementById('link-unlock-room');
      if (linkUnlock) {
        linkUnlock.addEventListener('click', (e) => {
          e.preventDefault();
          unlockRoomSelect();
        });
      }
    }

    // 5. Auto-focus next field
    setTimeout(() => {
      if (guestPhoneInput) {
        guestPhoneInput.focus();
        highlightField(guestPhoneInput);
      }
    }, 150);

    if (targetRoom) {
      showToast(`تم اختيار وتثبيت غرفة ${targetRoom.room_number} (${targetRoom.type}) في نموذج الحجز!`, 'success');
    }
  }

  function openNewReservationModal() {
    if (!newReservationModal) return;
    clearFieldError(guestPhoneInput, guestPhoneError);
    clearFieldError(guestIdNumberInput, guestIdError);
    isPaidAmountCustomized = false;
    if (roomSelect && roomSelect.value) {
      calculatePrice(true);
    }
    newReservationModal.style.display = 'flex';
    setTimeout(() => {
      if (guestPhoneInput) {
        guestPhoneInput.focus();
      }
    }, 100);
  }

  function closeNewReservationModal() {
    if (!newReservationModal) return;
    newReservationModal.style.display = 'none';
    clearFieldError(guestPhoneInput, guestPhoneError);
    clearFieldError(guestIdNumberInput, guestIdError);
    isPaidAmountCustomized = false;
    unlockRoomSelect();
  }

  if (btnOpenNewReservationModal) {
    btnOpenNewReservationModal.addEventListener('click', openNewReservationModal);
  }

  if (btnResNewBooking) {
    btnResNewBooking.addEventListener('click', openNewReservationModal);
  }

  if (btnCloseNewReservation) {
    btnCloseNewReservation.addEventListener('click', closeNewReservationModal);
  }

  if (newReservationModal) {
    newReservationModal.addEventListener('click', (e) => {
      if (e.target === newReservationModal) {
        closeNewReservationModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && newReservationModal && newReservationModal.style.display === 'flex') {
      closeNewReservationModal();
    }
  });

  // =========================================================================
  // VIEW 2: ALL RESERVATIONS LOGIC + EXCEL IMPORT / EXPORT
  // =========================================================================
  async function loadReservationsData() {
    try {
      const res = await window.api.getAllReservations();
      if (res.success) {
        reservationsCache = res.data || [];
        renderAllReservationsTable();
      }
    } catch (err) {
      console.error('Error loading reservations:', err);
    }
  }

  function renderAllReservationsTable() {
    const query = (searchAllReservations.value || '').toLowerCase().trim();

    const filtered = reservationsCache.filter(item => {
      if (currentReservationFilter !== 'all' && item.status !== currentReservationFilter) {
        return false;
      }
      if (!query) return true;
      return (
        String(item.id || '').includes(query) ||
        String(item.guest_name || '').toLowerCase().includes(query) ||
        String(item.room_number || '').includes(query) ||
        String(item.guest_phone || '').includes(query) ||
        String(item.guest_id_number || '').includes(query)
      );
    });

    if (filtered.length === 0) {
      allReservationsTableBody.innerHTML = '';
      allReservationsEmpty.style.display = 'block';
      return;
    }

    allReservationsEmpty.style.display = 'none';

    // PERFORMANCE: Build the full HTML string first (no DOM touches), then set innerHTML
    // once to avoid hundreds of costly individual DOM reflows (layout thrashing).
    const rowsHtml = filtered.map(r => {
      const isConfirmed = r.status === 'مؤكد';
      const total = parseFloat(r.total_price || 0);
      const paid = parseFloat(r.paid_amount || 0);
      const deposit = parseFloat(r.deposit_amount || 0);
      const remaining = Math.max(0, total - paid);
      const fmtTotal = total.toLocaleString();
      const fmtPaid = paid.toLocaleString();
      const fmtRem = remaining.toLocaleString();
      const fmtDep = deposit.toLocaleString();

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--primary); white-space: nowrap;">#${r.id}</td>
          <td>
            <div style="font-weight: 800; color: #1e293b; font-size: 0.9rem; white-space: nowrap;">${escapeHtml(r.guest_name)}</div>
            ${r.guest_id_number ? `<div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">هوية: ${escapeHtml(r.guest_id_number)}</div>` : ''}
          </td>
          <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap;">${escapeHtml(r.guest_phone || '-')}</td>
          <td style="white-space: nowrap;">
            <span style="font-weight: 800; color: #1a4332;">غرفة ${escapeHtml(r.room_number)}</span>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(r.room_type || '')}</div>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; font-family: monospace; direction: ltr; text-align: right;">${escapeHtml(r.check_in_date)}</td>
          <td style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; font-family: monospace; direction: ltr; text-align: right;">${escapeHtml(r.check_out_date)}</td>
          <td style="white-space: nowrap;">
            <div style="font-weight: 800; color: #1e293b; font-size: 0.88rem;">${fmtTotal} ريال</div>
            <div style="font-size: 0.74rem; color: #059669; font-weight: 600;">مدفوع: ${fmtPaid}</div>
            ${remaining > 0 ? `<div style="font-size: 0.72rem; color: #dc2626; font-weight: 700;">متبقي: ${fmtRem}</div>` : ''}
            ${deposit > 0 ? `<div style="font-size: 0.70rem; color: #4338ca;">تأمين: ${fmtDep}</div>` : ''}
          </td>
          <td style="font-size: 0.82rem; white-space: nowrap;">
            <span class="badge" style="background: rgba(0,0,0,0.04); color: #334155; border: 1px solid #cbd5e1; font-weight: 600;">${escapeHtml(r.payment_method || 'نقداً')}</span>
          </td>
          <td style="white-space: nowrap;">${getPaymentStatusBadge(r.payment_status)}</td>
          <td style="white-space: nowrap;">${getReservationStatusBadge(r.status)}</td>
          <td style="text-align: center; white-space: nowrap;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: nowrap;">
              <button type="button" class="btn-action-icon" data-action="invoice" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #f0fdf4; color: #166534; border: 1.5px solid #bbf7d0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="طباعة سند الاستلام والإقامة (فاتورة)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              </button>
              ${isConfirmed && remaining > 0 ? `
                <button type="button" class="btn-action-icon btn-pay" data-action="add-payment" data-id="${r.id}" onclick="event.stopPropagation(); window.openAddPaymentModal && window.openAddPaymentModal(${r.id});" style="width: 30px; height: 30px; padding: 0; background: #a67c52; color: #ffffff; border: none; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; box-shadow: 0 2px 8px rgba(166, 124, 82, 0.35);" title="تسجيل دفعة سداد جديدة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                </button>
              ` : ''}
              ${isConfirmed ? `
                <button type="button" class="btn-action-icon" data-action="checkout" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #ffffff; color: #334155; border: 1.5px solid #cbd5e1; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="تسجيل مغادرة وتسليم الغرفة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
                <button type="button" class="btn-action-icon" data-action="whatsapp" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #f0fdf4; color: #16a34a; border: 1.5px solid #86efac; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="مراسلة النزيل عبر واتساب">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                <button type="button" class="btn-action-icon" data-action="cancel" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="إلغاء الحجز">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Single DOM write (1 reflow vs N reflows for N rows) — critical for 100+ records
    allReservationsTableBody.innerHTML = rowsHtml;
  }

  // Filter tabs for reservations
  resFilterTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      resFilterTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentReservationFilter = btn.dataset.filter;
      renderAllReservationsTable();
    });
  });

  searchAllReservations.addEventListener('input', renderAllReservationsTable);

  // 2. SheetJS Export Reservations to Excel
  btnExportReservationsExcel.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') {
      showToast('مكتبة SheetJS غير متوفرة.', 'error');
      return;
    }

    if (reservationsCache.length === 0) {
      showToast('لا توجد حجوزات لتصديرها.', 'info');
      return;
    }

    try {
      const exportRows = reservationsCache.map(r => ({
        'رقم الحجز': r.id,
        'اسم النزيل': r.guest_name,
        'رقم الجوال': r.guest_phone || '',
        'رقم الهوية': r.guest_id_number || '',
        'رقم الغرفة': r.room_number,
        'نوع الغرفة': r.room_type,
        'تاريخ الوصول': r.check_in_date,
        'تاريخ المغادرة': r.check_out_date,
        'المبلغ الإجمالي': r.total_price,
        'حالة الحجز': r.status,
        'تاريخ الإنشاء': r.created_at
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);

      ws['!cols'] = [
        { wch: 12 }, { wch: 26 }, { wch: 16 }, { wch: 18 },
        { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
        { wch: 16 }, { wch: 14 }, { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'الحجوزات');
      const filename = `hotel_reservations_${getLocalDateString()}.xlsx`;
      XLSX.writeFile(wb, filename);

      showToast(`تم تصدير ${exportRows.length} حجز إلى "${filename}" بنجاح!`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast(`فشل تصدير Excel: ${err.message}`, 'error');
    }
  });

  // 2. SheetJS Import Reservations from Excel
  inputImportReservationsExcel.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (!rows || rows.length === 0) {
          showToast('ملف Excel فارغ أو لا يحتوي على صفوف بيانات.', 'error');
          return;
        }

        const res = await window.api.bulkImportReservations(rows);
        if (res.success && res.data) {
          showToast(`تم استيراد ${res.data.inserted} حجز بنجاح! (تم تخطي ${res.data.skipped})`, 'success');
          await loadReservationsData();
          await loadOverviewData();
        } else {
          showToast(res.error || 'فشل استيراد الحجوزات.', 'error');
        }
      } catch (err) {
        console.error('Import error:', err);
        showToast(`خطأ في قراءة ملف Excel: ${err.message}`, 'error');
      } finally {
        inputImportReservationsExcel.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // =========================================================================
  // VIEW 3: ROOMS MANAGEMENT LOGIC
  // =========================================================================
  async function loadRoomsData() {
    try {
      const [roomsRes, resRes] = await Promise.all([
        window.api.getAllRooms(),
        window.api.getAllReservations()
      ]);
      if (roomsRes && roomsRes.success) {
        roomsCache = roomsRes.data || [];
      }
      if (resRes && resRes.success) {
        reservationsCache = resRes.data || [];
      }
      renderRoomsGrid();
    } catch (err) {
      console.error('Error loading rooms:', err);
    }
  }

  function renderRoomsGrid() {
    const filtered = roomsCache.filter(room => {
      if (currentRoomFilter === 'all') return true;
      return room.status === currentRoomFilter;
    });

    if (filtered.length === 0) {
      roomsGridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-light);">
          لا توجد غرف مطابقة لهذا التصنيف.
        </div>
      `;
      return;
    }

    const todayStr = getLocalDateString();

    roomsGridContainer.innerHTML = filtered.map(room => {
      let borderClass = 'status-border-available';
      if (room.status === 'مشغولة') borderClass = 'status-border-occupied';
      else if (room.status === 'محجوزة') borderClass = 'status-border-reserved';
      else if (room.status === 'تنظيف') borderClass = 'status-border-cleaning';

      // 1. Actively occupied reservation today (check_in <= today AND check_out > today)
      const activeRes = (room.status === 'مشغولة')
        ? reservationsCache.find(r => r.room_id === room.id && r.status === 'مؤكد' && r.check_in_date <= todayStr && r.check_out_date > todayStr)
        : null;

      // 2. Upcoming future reservation (check_in > today)
      const upcomingRes = (room.status === 'محجوزة' || room.status === 'متاحة')
        ? reservationsCache
            .filter(r => r.room_id === room.id && r.status === 'مؤكد' && r.check_in_date > todayStr)
            .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0]
        : null;

      return `
        <div class="room-card ${borderClass}" data-room-id="${room.id}" style="background: rgba(255, 255, 255, 0.94); border: 1px solid rgba(226, 232, 240, 0.9); border-radius: 16px; box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.05), 0 4px 10px -2px rgba(15, 23, 42, 0.02); overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease;">
          <div style="padding: 20px 20px 14px;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <div>
                <div style="font-size: 1.5rem; font-weight: 900; color: #1a4332; line-height: 1.2; letter-spacing: -0.01em;">
                  غرفة ${escapeHtml(room.room_number)}
                </div>
                <p style="font-size: 0.84rem; font-weight: 600; color: #64748b; margin-top: 2px;">${escapeHtml(room.type)}</p>
              </div>
              <div style="flex-shrink: 0;">
                ${getRoomStatusBadge(room.status)}
              </div>
            </div>

            <div style="font-size: 1.1rem; font-weight: 900; color: #a67c52; margin-top: 8px;">
              ${parseFloat(room.price_per_night || 0).toLocaleString()} <span style="font-size: 0.75rem; font-weight: 600; color: #94a3b8;">ريال / ليلة</span>
            </div>

            <!-- Active Stay Box (Occupied Today) -->
            ${activeRes ? `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 9px 12px; margin-top: 10px;">
                <div style="font-weight: 700; color: #166534; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>👤 ${escapeHtml(activeRes.guest_name)}</span>
                  <span style="font-size: 0.72rem; color: #a67c52; font-weight: 800;">حجز نشط #${activeRes.id}</span>
                </div>
                <div style="font-size: 0.74rem; color: #475569; margin-top: 4px;">
                  المغادرة: <strong style="color: #0f172a;">${escapeHtml(activeRes.check_out_date)}</strong>
                </div>
              </div>
            ` : ''}

            <!-- Upcoming Reservation Box (Future Booking) -->
            ${(!activeRes && upcomingRes) ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 9px 12px; margin-top: 10px;">
                <div style="font-weight: 700; color: #1e40af; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>📅 ${escapeHtml(upcomingRes.guest_name)}</span>
                  <span style="font-size: 0.72rem; color: #2563eb; font-weight: 800;">حجز قادم #${upcomingRes.id}</span>
                </div>
                <div style="font-size: 0.74rem; color: #475569; margin-top: 4px;">
                  الوصول: <strong style="color: #1e3a8a;">${escapeHtml(upcomingRes.check_in_date)}</strong> | المغادرة: <strong>${escapeHtml(upcomingRes.check_out_date)}</strong>
                </div>
              </div>
            ` : ''}

            <!-- Quick Action Buttons -->
            <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
              ${(room.status === 'متاحة' || room.status === 'محجوزة') ? `
                <button type="button" class="btn-room-action" data-action="quick-book" data-room-id="${room.id}" style="border: none; border-radius: 8px; padding: 7px 14px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #1a4332; color: #ffffff; box-shadow: 0 2px 6px rgba(26,67,50,0.25);">
                  <span>حجز الغرفة ➕</span>
                </button>
              ` : ''}

              ${room.status === 'تنظيف' ? `
                <button type="button" class="btn-room-action" data-action="quick-ready" data-room-id="${room.id}" style="border: none; border-radius: 8px; padding: 7px 14px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #059669; color: #ffffff; box-shadow: 0 2px 6px rgba(5,150,105,0.25);">
                  <span>تم التنظيف (جاهزة) ✓</span>
                </button>
              ` : ''}

              ${room.status === 'مشغولة' && activeRes ? `
                <button type="button" class="btn-room-action" data-action="checkout" data-id="${activeRes.id}" style="border: none; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #dc2626; color: #ffffff;">
                  <span>تسجيل خروج &larr;</span>
                </button>
                <button type="button" class="btn-room-action" data-action="invoice" data-id="${activeRes.id}" style="border: none; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #1a4332; color: #ffffff;">
                  <span>فاتورة 🖨️</span>
                </button>
              ` : ''}

              ${room.status === 'محجوزة' && upcomingRes ? `
                <button type="button" class="btn-room-action" data-action="invoice" data-id="${upcomingRes.id}" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; background: #ffffff; color: #1e293b;">
                  <span>فاتورة الحجز 🖨️</span>
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Seamless Acrylic Footer -->
          <div style="border-top: 1px solid #f1f5f9; background: rgba(248, 250, 252, 0.7); padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 0.76rem; font-weight: 700; color: #64748b;">الحالة:</span>
              ${room.status === 'مشغولة' ? `
                <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.8rem; font-weight: 800; border-radius: 6px; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;" title="الغرفة مشغولة بنزيل حالياً - مقفلة حتى تسجيل المغادرة (Check-out)">
                  <span>🔒 مشغولة</span>
                </div>
              ` : room.status === 'محجوزة' ? `
                <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.8rem; font-weight: 800; border-radius: 6px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;" title="الغرفة محجوزة لحجز قادم">
                  <span>⏳ محجوزة</span>
                </div>
              ` : `
                <select class="room-status-select" data-room-id="${room.id}" style="width: auto; padding: 4px 8px; font-size: 0.8rem; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a;">
                  <option value="متاحة" ${room.status === 'متاحة' ? 'selected' : ''}>متاحة</option>
                  <option value="تنظيف" ${room.status === 'تنظيف' ? 'selected' : ''}>تنظيف</option>
                </select>
              `}
            </div>
            <button type="button" class="btn-room-action" data-action="edit-room" data-room-id="${room.id}" style="background: #ffffff; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 700; font-size: 0.78rem; padding: 5px 12px; cursor: pointer; transition: all 0.15s;" title="تعديل تفاصيل الغرفة (الرقم، النوع، السعر)">
              <span>تعديل ✏️</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  roomsFilterTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      roomsFilterTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRoomFilter = btn.dataset.roomFilter;
      renderRoomsGrid();
    });
  });

  // Room Card Click: Clicking an available or reserved room card initiates booking with auto-fill
  roomsGridContainer.addEventListener('click', (e) => {
    if (e.target.closest('button, select, input, a')) return;
    const card = e.target.closest('.room-card');
    if (!card) return;

    const roomId = card.dataset.roomId;
    const targetRoom = roomsCache.find(r => r.id === parseInt(roomId, 10));
    if (targetRoom && (targetRoom.status === 'متاحة' || targetRoom.status === 'محجوزة')) {
      initiateRoomBooking(roomId);
    }
  });

  roomsGridContainer.addEventListener('change', async (e) => {
    const select = e.target.closest('.room-status-select');
    if (!select) return;

    const roomId = parseInt(select.dataset.roomId, 10);
    const newStatus = select.value;

    const targetRoom = roomsCache.find(r => r.id === roomId);
    if (targetRoom && targetRoom.status === 'مشغولة') {
      showToast(`لا يمكن تغيير حالة الغرفة (${targetRoom.room_number}) لأنها مشغولة بحجز نشط. يجب تسجيل المغادرة أولاً.`, 'error');
      renderRoomsGrid();
      return;
    }

    try {
      const res = await window.api.updateRoomStatus(roomId, newStatus);
      if (res.success) {
        showToast(`تم تحديث حالة الغرفة إلى "${newStatus}"`, 'success');
        await loadRoomsData();
        await loadOverviewData();
      } else {
        showToast('فشل تحديث حالة الغرفة.', 'error');
      }
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
      await loadRoomsData();
    }
  });

  btnToggleAddRoom.addEventListener('click', () => {
    const isHidden = addRoomPanel.style.display === 'none';
    addRoomPanel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) newRoomNumber.focus();
  });

  btnCancelAddRoom.addEventListener('click', () => {
    addRoomPanel.style.display = 'none';
    addRoomForm.reset();
  });

  addRoomForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const room_number = newRoomNumber.value.trim();
    const type = newRoomType.value.trim();
    const price_per_night = parseFloat(newRoomPrice.value) || 0;
    const status = newRoomStatus.value;

    if (!room_number || !type || !price_per_night) {
      showToast('يرجى ملء جميع بيانات الغرفة.', 'error');
      return;
    }

    try {
      const res = await window.api.addRoom({ room_number, type, price_per_night, status });
      if (res.success) {
        showToast(`تمت إضافة الغرفة ${room_number} بنجاح!`, 'success');
        addRoomForm.reset();
        addRoomPanel.style.display = 'none';
        await loadRoomsData();
      } else {
        showToast(res.error || 'فشل في إضافة الغرفة.', 'error');
      }
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  // Edit Room Modal Functions
  function openEditRoomModal(roomId) {
    const room = roomsCache.find(r => r.id === parseInt(roomId, 10));
    if (!room) {
      showToast('لم يتم العثور على بيانات الغرفة.', 'error');
      return;
    }
    if (editRoomId) editRoomId.value = room.id;
    if (editRoomNumber) editRoomNumber.value = room.room_number || '';
    if (editRoomType) editRoomType.value = room.type || '';
    if (editRoomPrice) editRoomPrice.value = room.price_per_night || '';

    const isOccupied = room.status === 'مشغولة';
    if (editRoomStatus) {
      editRoomStatus.value = room.status || 'متاحة';
      editRoomStatus.disabled = isOccupied;
      if (isOccupied) {
        editRoomStatus.title = "الغرفة مشغولة بنزيل حالياً - مقفلة حتى تسجيل المغادرة (Check-out)";
      } else {
        editRoomStatus.title = "";
      }
    }

    if (editRoomStatusLockedHint) {
      editRoomStatusLockedHint.style.display = isOccupied ? 'block' : 'none';
    }

    if (btnDeleteRoom) {
      if (isOccupied) {
        btnDeleteRoom.disabled = true;
        btnDeleteRoom.style.opacity = '0.5';
        btnDeleteRoom.style.cursor = 'not-allowed';
        btnDeleteRoom.title = "لا يمكن حذف الغرفة لأنها مشغولة بحجز نشط";
      } else {
        btnDeleteRoom.disabled = false;
        btnDeleteRoom.style.opacity = '1';
        btnDeleteRoom.style.cursor = 'pointer';
        btnDeleteRoom.title = "";
      }
    }

    if (editRoomModal) {
      editRoomModal.style.display = 'flex';
    }
    if (editRoomNumber) {
      editRoomNumber.focus();
    }
  }

  function closeEditRoomModal() {
    if (editRoomModal) {
      editRoomModal.style.display = 'none';
    }
    if (editRoomStatus) {
      editRoomStatus.disabled = false;
      editRoomStatus.title = "";
    }
    if (editRoomStatusLockedHint) {
      editRoomStatusLockedHint.style.display = 'none';
    }
    if (btnDeleteRoom) {
      btnDeleteRoom.disabled = false;
      btnDeleteRoom.style.opacity = '1';
      btnDeleteRoom.style.cursor = 'pointer';
      btnDeleteRoom.title = "";
    }
    if (editRoomForm) {
      editRoomForm.reset();
    }
  }

  if (btnCloseEditRoomModal) {
    btnCloseEditRoomModal.addEventListener('click', closeEditRoomModal);
  }
  if (btnCancelEditRoom) {
    btnCancelEditRoom.addEventListener('click', closeEditRoomModal);
  }
  if (editRoomModal) {
    editRoomModal.addEventListener('click', (e) => {
      if (e.target === editRoomModal) closeEditRoomModal();
    });
  }

  if (editRoomForm) {
    editRoomForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = parseInt(editRoomId.value, 10);
      const room_number = editRoomNumber.value.trim();
      const type = editRoomType.value.trim();
      const price_per_night = parseFloat(editRoomPrice.value) || 0;

      const currentRoom = roomsCache.find(r => r.id === id);
      const isOccupied = currentRoom && currentRoom.status === 'مشغولة';
      const status = isOccupied ? 'مشغولة' : editRoomStatus.value;

      if (!room_number || !type || !price_per_night) {
        showToast('يرجى ملء جميع بيانات الغرفة المطلوبة.', 'error');
        return;
      }

      try {
        const res = await window.api.updateRoom({ id, room_number, type, price_per_night, status });
        if (res && res.success) {
          showToast(`تم حفظ وتحديث بيانات الغرفة ${room_number} بنجاح! ✓`, 'success');
          closeEditRoomModal();
          await loadRoomsData();
          await loadOverviewData();
          await loadReservationsData();
        } else {
          showToast(res?.error || 'فشل تحديث بيانات الغرفة.', 'error');
        }
      } catch (err) {
        showToast(`خطأ: ${err.message}`, 'error');
      }
    });
  }

  if (btnDeleteRoom) {
    btnDeleteRoom.addEventListener('click', async () => {
      const id = parseInt(editRoomId.value, 10);
      const roomNum = editRoomNumber.value.trim();
      if (!id) return;

      const currentRoom = roomsCache.find(r => r.id === id);
      if (currentRoom && currentRoom.status === 'مشغولة') {
        showToast(`لا يمكن حذف الغرفة (${roomNum}) لأنها مشغولة بحجز نشط حالياً. يرجى إنهاء أو إلغاء الحجز أولاً.`, 'error');
        return;
      }

      const confirmed = await showConfirmDialog({
        title: 'حذف الغرفة الفندقية',
        message: `تحذير هام:\nهل أنت متأكد من رغبتك في حذف الغرفة رقم "${roomNum}" نهائياً من قاعدة البيانات؟`,
        confirmText: 'نعم، حذف الغرفة',
        cancelText: 'إلغاء',
        isDanger: true
      });
      if (!confirmed) {
        return;
      }

      try {
        const res = await window.api.deleteRoom(id);
        if (res && res.success) {
          showToast(`تم حذف الغرفة رقم ${roomNum} بنجاح.`, 'success');
          closeEditRoomModal();
          await loadRoomsData();
          await loadOverviewData();
          await loadReservationsData();
        } else {
          showToast(res?.error || 'فشل حذف الغرفة.', 'error');
        }
      } catch (err) {
        showToast(`خطأ أثناء الحذف: ${err.message}`, 'error');
      }
    });
  }

  // =========================================================================
  // VIEW 4: GUESTS DIRECTORY (SERVER-SIDE PAGINATION) + EXCEL IMPORT / EXPORT
  // =========================================================================
  let guestsCurrentPage = 1;
  const guestsPageLimit = 50;
  let guestsTotalPages = 1;
  let guestsTotalCount = 0;
  let guestSearchDebounceTimer = null;

  async function loadGuestsData(page = guestsCurrentPage) {
    try {
      guestsCurrentPage = Math.max(1, page);
      const query = (searchGuests ? searchGuests.value : '').trim();

      const res = await window.api.getGuestsPaginated({
        page: guestsCurrentPage,
        limit: guestsPageLimit,
        search: query
      });

      if (res && res.success) {
        guestsCache = res.data || [];
        const pag = res.pagination || {};
        guestsTotalCount = res.totalCount !== undefined ? res.totalCount : (pag.totalCount || 0);
        guestsTotalPages = res.totalPages !== undefined ? res.totalPages : (pag.totalPages || 1);
        guestsCurrentPage = res.page !== undefined ? res.page : (pag.page || 1);

        renderGuestsTable();
        updateGuestsPaginationUI();
      }
    } catch (err) {
      console.error('Error loading guests:', err);
      showToast('خطأ أثناء تحميل بيانات النزلاء.', 'error');
    }
  }

  function renderGuestsTable() {
    if (guestsCountBadge) guestsCountBadge.textContent = guestsTotalCount.toLocaleString();

    if (!guestsCache || guestsCache.length === 0) {
      guestsTableBody.innerHTML = '';
      if (guestsEmpty) guestsEmpty.style.display = 'block';
      return;
    }

    if (guestsEmpty) guestsEmpty.style.display = 'none';

    guestsTableBody.innerHTML = guestsCache.map(g => {
      const totalStays = parseInt(g.total_stays, 10) || 0;
      const totalSpent = parseFloat(g.total_spent) || 0;

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--primary);">#${g.id}</td>
          <td style="font-weight: 800; color: #1e293b; font-size: 0.9rem;">
            ${escapeHtml(g.name)}
          </td>
          <td style="font-family: monospace; color: var(--text-secondary);">${escapeHtml(g.phone || '-')}</td>
          <td style="color: var(--text-secondary);">${escapeHtml(g.id_number || '-')}</td>
          <td>
            <span class="badge" style="background: #fdfaf7; color: #a67c52; border: 1px solid rgba(166, 124, 82, 0.35); font-weight: 800;">
              ${totalStays} ${totalStays === 1 ? 'إقامة' : 'إقامات'}
            </span>
          </td>
          <td style="font-weight: 800; color: var(--primary);">${totalSpent.toLocaleString()} ريال</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(String(g.created_at || '').split(' ')[0])}</td>
        </tr>
      `;
    }).join('');
  }

  function updateGuestsPaginationUI() {
    if (guestsCurrentPageEl) guestsCurrentPageEl.textContent = guestsCurrentPage;
    if (guestsTotalPagesEl) guestsTotalPagesEl.textContent = Math.max(1, guestsTotalPages);
    if (guestsTotalCountEl) guestsTotalCountEl.textContent = guestsTotalCount.toLocaleString();

    if (guestsPageRangeEl) {
      if (guestsTotalCount === 0) {
        guestsPageRangeEl.textContent = '0 - 0';
      } else {
        const start = (guestsCurrentPage - 1) * guestsPageLimit + 1;
        const end = Math.min(guestsCurrentPage * guestsPageLimit, guestsTotalCount);
        guestsPageRangeEl.textContent = `${start} - ${end}`;
      }
    }

    if (btnGuestsPrevPage) {
      btnGuestsPrevPage.disabled = guestsCurrentPage <= 1;
    }
    if (btnGuestsNextPage) {
      btnGuestsNextPage.disabled = guestsCurrentPage >= guestsTotalPages;
    }
  }

  if (btnGuestsPrevPage) {
    btnGuestsPrevPage.addEventListener('click', () => {
      if (guestsCurrentPage > 1) {
        loadGuestsData(guestsCurrentPage - 1);
      }
    });
  }

  if (btnGuestsNextPage) {
    btnGuestsNextPage.addEventListener('click', () => {
      if (guestsCurrentPage < guestsTotalPages) {
        loadGuestsData(guestsCurrentPage + 1);
      }
    });
  }

  if (searchGuests) {
    searchGuests.addEventListener('input', () => {
      clearTimeout(guestSearchDebounceTimer);
      guestSearchDebounceTimer = setTimeout(() => {
        loadGuestsData(1);
      }, 250);
    });
  }

  // Export Guests to Excel (fetches full list from database)
  btnExportGuestsExcel.addEventListener('click', async () => {
    if (typeof XLSX === 'undefined') {
      showToast('مكتبة SheetJS غير متوفرة.', 'error');
      return;
    }

    try {
      showToast('جاري تحضير ملف Excel لكافة النزلاء...', 'info');
      const allRes = await window.api.getAllGuests();
      const allGuestsList = (allRes && allRes.data) ? allRes.data : guestsCache;

      if (!allGuestsList || allGuestsList.length === 0) {
        showToast('لا توجد بيانات نزلاء لتصديرها.', 'info');
        return;
      }

      const exportRows = allGuestsList.map(g => ({
        'معرف النزيل': g.id,
        'اسم النزيل': g.name,
        'رقم الجوال': g.phone || '',
        'رقم الهوية / الجواز': g.id_number || '',
        'عدد الإقامات': parseInt(g.total_stays, 10) || 0,
        'إجمالي المدفوعات': parseFloat(g.total_spent) || 0,
        'تاريخ التسجيل': g.created_at
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);

      ws['!cols'] = [
        { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 20 },
        { wch: 14 }, { wch: 18 }, { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'قائمة النزلاء');
      const filename = `hotel_guests_${getLocalDateString()}.xlsx`;
      XLSX.writeFile(wb, filename);

      showToast(`تم تصدير ${exportRows.length} نزيل إلى "${filename}" بنجاح!`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast(`فشل تصدير Excel: ${err.message}`, 'error');
    }
  });

  // Import Guests from CSV / Excel (with dual UTF-8 & Windows-1256 Arabic encoding support + smart column detector)
  if (inputImportGuestsExcel) {
    inputImportGuestsExcel.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function (evt) {
        try {
          const rawBuffer = evt.target.result;
          const uint8Array = new Uint8Array(rawBuffer);

          let wb;
          // Check magic numbers for binary Excel (XLSX = PK / 0x50 0x4B, XLS = 0xD0 0xCF)
          const isZip = uint8Array.length > 2 && uint8Array[0] === 0x50 && uint8Array[1] === 0x4b;
          const isCfb = uint8Array.length > 2 && uint8Array[0] === 0xd0 && uint8Array[1] === 0xcf;

          if (isZip || isCfb) {
            wb = XLSX.read(uint8Array, { type: 'array' });
          } else {
            // Plain text CSV: decode with UTF-8 or fallback to Windows-1256 (standard Arabic Windows Excel encoding)
            let decodedText = '';
            try {
              const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
              decodedText = utf8Decoder.decode(uint8Array);
              if (decodedText.includes('\uFFFD')) {
                throw new Error('Mojibake detected');
              }
            } catch (utfErr) {
              try {
                const win1256Decoder = new TextDecoder('windows-1256');
                decodedText = win1256Decoder.decode(uint8Array);
              } catch (winErr) {
                decodedText = new TextDecoder('utf-8').decode(uint8Array);
              }
            }
            wb = XLSX.read(decodedText, { type: 'string' });
          }

          const sheetName = wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          if (!sheet) {
            showToast('الملف المرفوع لا يحتوي على أي صفحات بيانات.', 'error');
            return;
          }

          const cleanVal = (v) => String(v !== undefined && v !== null ? v : '').trim();

          // 1. Try reading as Object rows with flexible key lookup
          const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
          let guestsData = [];

          if (rawRows && rawRows.length > 0) {
            guestsData = rawRows.map(row => {
              let name = '', phone = '', id_number = '';
              const cleanEntries = Object.entries(row).map(([k, v]) => [cleanVal(k).toLowerCase(), cleanVal(v)]);

              // Header mapping
              for (const [k, v] of cleanEntries) {
                if (!v) continue;
                if (!name && /^(الاسم|اسم النزيل|اسم العميل|الاسم الكامل|النزيل|العميل|name|guest_name|customer_name|fullname|full_name)$/i.test(k)) {
                  name = v;
                } else if (!phone && /^(الجوال|رقم الجوال|الهاتف|رقم الهاتف|الموبايل|رقم الموبايل|phone|mobile|tel|telephone|phone_number|mobile_number)$/i.test(k)) {
                  phone = v;
                } else if (!id_number && /^(الهوية|رقم الهوية|الهوية الوطنية|السجل المدني|الإقامة|رقم الإقامة|بطاقة الأحوال|الجواز|رقم الجواز|جواز السفر|رقم جواز السفر|passport|passport_number|id|id_number|national_id|iqama)$/i.test(k)) {
                  id_number = v;
                }
              }

              // Smart content-pattern heuristic fallback
              if (!name || !phone || !id_number) {
                for (const [, v] of cleanEntries) {
                  if (!v) continue;
                  const digits = v.replace(/\D/g, '');
                  if (!id_number && /^[12]\d{9}$/.test(digits)) {
                    id_number = digits;
                  } else if (!id_number && /^[A-Za-z0-9\-]{6,15}$/.test(v.trim()) && !/^(الاسم|الجوال|الهوية|name|phone|id)$/i.test(v)) {
                    id_number = v.trim();
                  } else if (!phone && ((digits.startsWith('05') && digits.length === 10) || (digits.startsWith('5') && (digits.length === 8 || digits.length === 9)) || (digits.startsWith('9665') && digits.length === 12))) {
                    phone = digits;
                  } else if (!name && v.length >= 2 && !/^\d+$/.test(v) && !/^(الاسم|الجوال|الهوية|name|phone|id)$/i.test(v)) {
                    name = v;
                  }
                }
              }

              // Normalize phone (prepend 0 if starting with 5)
              let normPhone = phone.replace(/\D/g, '');
              if (normPhone.startsWith('9665') && normPhone.length === 12) {
                normPhone = '0' + normPhone.substring(3);
              } else if (normPhone.startsWith('5') && (normPhone.length === 8 || normPhone.length === 9)) {
                normPhone = '0' + normPhone;
              }

              return {
                name,
                phone: normPhone,
                id_number: id_number.replace(/[^A-Za-z0-9\-]/g, '').trim(),
                guest_name: name,
                phone_number: normPhone
              };
            }).filter(g => g.name);
          }

          // 2. Fallback to 2D Array by column index if header-based parsing returned nothing
          if (guestsData.length === 0) {
            const rawArrays = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            for (const arr of rawArrays) {
              if (!Array.isArray(arr) || arr.length === 0) continue;
              const c0 = cleanVal(arr[0]);
              const c1 = cleanVal(arr[1]);
              const c2 = cleanVal(arr[2]);
              // Skip header line if detected
              if (/^(الاسم|name|اسم النزيل)$/i.test(c0) || /^(الجوال|phone|رقم الجوال)$/i.test(c1)) continue;
              if (c0 && c0.length >= 2 && !/^\d+$/.test(c0)) {
                let p = c1.replace(/\D/g, '');
                if (p.startsWith('5') && (p.length === 8 || p.length === 9)) p = '0' + p;
                guestsData.push({
                  name: c0,
                  phone: p,
                  id_number: c2.replace(/[^A-Za-z0-9\-]/g, '').trim(),
                  guest_name: c0,
                  phone_number: p
                });
              }
            }
          }

          if (guestsData.length === 0) {
            showToast('لم يتم العثور على بيانات نزلاء صالحة في الملف المرفوع.', 'error');
            return;
          }

          // إرسال المصفوفة عبر IPC إلى الباك إند
          const res = await window.api.importGuests(guestsData);

          if (res.success) {
            const count = res.importedCount ?? res.data?.inserted ?? 0;
            const updated = res.updatedCount ?? res.data?.updated ?? 0;
            const total = res.totalCount ?? guestsData.length;
            const updatedGuests = res.updatedGuests || [];

            // 1. تحديث جدول النزلاء في الشاشة فوراً حتى تكون البيانات جاهزة خلف النافذة
            await loadGuestsData();

            // 2. إشعار Toast علوي سريع
            showToast(`تم استيراد ${count} عميل بنجاح!`, 'success');

            // 3. فتح نافذة التقرير العصرية المنبثقة (بدون alert النظام القديم)
            openImportResultModal({
              importedCount: count,
              updatedCount: updated,
              totalCount: total,
              updatedGuests: updatedGuests
            });
          } else {
            showToast(res.message || res.error || 'فشل استيراد بيانات النزلاء.', 'error');
          }
        } catch (err) {
          console.error('Import error:', err);
          showToast(`خطأ في قراءة ملف البيانات: ${err.message}`, 'error');
        } finally {
          inputImportGuestsExcel.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Import Result Modal Handlers
  const importResultModal = document.getElementById('import-result-modal');
  const btnCloseImportResultModal = document.getElementById('btn-close-import-result-modal');
  const btnConfirmImportResult = document.getElementById('btn-confirm-import-result');
  const btnToggleUpdatedGuestsList = document.getElementById('btn-toggle-updated-guests-list');
  const importModalUpdatedContainer = document.getElementById('import-modal-updated-container');
  const importModalToggleArrow = document.getElementById('import-modal-toggle-arrow');

  function openImportResultModal({ importedCount, updatedCount, totalCount, updatedGuests }) {
    if (!importResultModal) return;

    const insertedEl = document.getElementById('import-modal-inserted');
    const updatedEl = document.getElementById('import-modal-updated');
    const totalEl = document.getElementById('import-modal-total');
    const totalSystemEl = document.getElementById('import-modal-total-system-guests');

    if (insertedEl) insertedEl.textContent = importedCount;
    if (updatedEl) updatedEl.textContent = updatedCount;
    if (totalEl) totalEl.textContent = totalCount;
    if (totalSystemEl) totalSystemEl.textContent = guestsCache.length;

    const dedupNotice = document.getElementById('import-modal-dedup-notice');
    const updatedInline = document.getElementById('import-modal-updated-inline');
    const updatedSection = document.getElementById('import-modal-updated-section');
    const mergedListCount = document.getElementById('import-modal-merged-list-count');
    const updatedTbody = document.getElementById('import-modal-updated-table-body');

    if (updatedCount > 0) {
      if (dedupNotice) dedupNotice.style.display = 'block';
      if (updatedInline) updatedInline.textContent = updatedCount;
      if (updatedSection) updatedSection.style.display = 'block';
      if (mergedListCount) mergedListCount.textContent = (updatedGuests && updatedGuests.length > 0) ? updatedGuests.length : updatedCount;

      if (updatedTbody) {
        if (updatedGuests && updatedGuests.length > 0) {
          updatedTbody.innerHTML = updatedGuests.map(g => `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <td style="padding: 8px 12px; font-weight: 700; color: #ffffff;">${escapeHtml(g.name || '-')}</td>
              <td style="padding: 8px 12px; font-family: monospace; color: var(--text-secondary);">${escapeHtml(g.phone || '-')}</td>
              <td style="padding: 8px 12px; font-family: monospace; color: var(--text-secondary);">${escapeHtml(g.id_number || '-')}</td>
              <td style="padding: 8px 12px; color: #f59e0b; font-weight: 600;">${escapeHtml(g.matchReason || 'تطابق بيانات')}</td>
            </tr>
          `).join('');
        } else {
          updatedTbody.innerHTML = `
            <tr>
              <td colspan="4" style="padding: 12px; text-align: center; color: var(--text-secondary);">
                تم دمج السجلات المكررة مع النزلاء المسجلين مسبقاً لمنع التكرار.
              </td>
            </tr>
          `;
        }
      }
    } else {
      if (dedupNotice) dedupNotice.style.display = 'none';
      if (updatedSection) updatedSection.style.display = 'none';
    }

    importResultModal.style.display = 'flex';
  }

  function closeImportResultModal() {
    if (importResultModal) {
      importResultModal.style.display = 'none';
    }
  }

  if (btnCloseImportResultModal) {
    btnCloseImportResultModal.addEventListener('click', closeImportResultModal);
  }

  if (btnConfirmImportResult) {
    btnConfirmImportResult.addEventListener('click', () => {
      closeImportResultModal();
      const tableCard = document.querySelector('#view-guests .card');
      if (tableCard) tableCard.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (btnToggleUpdatedGuestsList && importModalUpdatedContainer) {
    btnToggleUpdatedGuestsList.addEventListener('click', () => {
      const isVisible = importModalUpdatedContainer.style.display !== 'none';
      importModalUpdatedContainer.style.display = isVisible ? 'none' : 'block';
      if (importModalToggleArrow) {
        importModalToggleArrow.textContent = isVisible ? 'إظهار التفاصيل ▼' : 'إخفاء التفاصيل ▲';
      }
    });
  }

  // =========================================================================
  // SUBSEQUENT PAYMENT MODAL (تسجيل سداد دفعة جديدة للحجز)
  // =========================================================================
  const addPaymentModal = document.getElementById('add-payment-modal');
  const addPaymentForm = document.getElementById('add-payment-form');
  const paymentReservationId = document.getElementById('payment-reservation-id');
  const paymentModalGuestName = document.getElementById('payment-modal-guest-name');
  const paymentModalRoomInfo = document.getElementById('payment-modal-room-info');
  const paymentModalTotalPrice = document.getElementById('payment-modal-total-price');
  const paymentModalPaidAmount = document.getElementById('payment-modal-paid-amount');
  const paymentModalRemainingBalance = document.getElementById('payment-modal-remaining-balance');
  const paymentNewAmount = document.getElementById('payment-new-amount');
  const paymentMethodSelectModal = document.getElementById('payment-method-select-modal');
  const btnClosePaymentModal = document.getElementById('btn-close-payment-modal');
  const btnCancelPaymentModal = document.getElementById('btn-cancel-payment-modal');
  const btnPayFullRemaining = document.getElementById('btn-pay-full-remaining');

  let currentPayingReservation = null;

  window.openAddPaymentModal = async function openAddPaymentModal(reservationId) {
    const modal = document.getElementById('add-payment-modal');
    if (!modal) {
      console.error('Modal #add-payment-modal not found in DOM');
      return;
    }

    const targetId = parseInt(reservationId, 10);
    if (!targetId || isNaN(targetId)) {
      showToast('رقم الحجز غير صالح.', 'error');
      return;
    }

    // Find in cache or fetch
    let res = (reservationsCache || []).find(r => parseInt(r.id, 10) === targetId);
    if (!res) {
      try {
        const allRes = await window.api.getAllReservations();
        if (allRes && allRes.success && allRes.data) {
          reservationsCache = allRes.data;
          res = reservationsCache.find(r => parseInt(r.id, 10) === targetId);
        }
      } catch (err) {
        console.error('Error fetching reservation for payment:', err);
      }
    }

    if (!res) {
      showToast('تعذر العثور على بيانات الحجز المطلوب.', 'error');
      return;
    }

    currentPayingReservation = res;
    const total = Math.round((parseFloat(res.total_price || 0) + Number.EPSILON) * 100) / 100;
    const paid = Math.round((parseFloat(res.paid_amount || 0) + Number.EPSILON) * 100) / 100;
    const remaining = Math.max(0, Math.round((total - paid + Number.EPSILON) * 100) / 100);

    const inputResId = document.getElementById('payment-reservation-id');
    const nameEl = document.getElementById('payment-modal-guest-name');
    const roomEl = document.getElementById('payment-modal-room-info');
    const totalEl = document.getElementById('payment-modal-total-price');
    const paidEl = document.getElementById('payment-modal-paid-amount');
    const remEl = document.getElementById('payment-modal-remaining-balance');
    const inputAmount = document.getElementById('payment-new-amount');

    if (inputResId) inputResId.value = res.id;
    if (nameEl) nameEl.textContent = res.guest_name || 'نزيل';
    if (roomEl) roomEl.textContent = `حجز #${res.id} - غرفة ${res.room_number || '-'}`;
    if (totalEl) totalEl.textContent = `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال`;
    if (paidEl) paidEl.textContent = `${paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال`;
    if (remEl) remEl.textContent = `${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال`;

    if (inputAmount) {
      inputAmount.value = remaining > 0 ? remaining.toFixed(2) : '';
      inputAmount.max = remaining > 0 ? remaining.toFixed(2) : '';
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      if (inputAmount) {
        inputAmount.focus();
        inputAmount.select();
      }
    }, 50);
  };

  function closeAddPaymentModal() {
    if (addPaymentModal) {
      addPaymentModal.style.display = 'none';
    }
    if (addPaymentForm) {
      addPaymentForm.reset();
    }
    currentPayingReservation = null;
  }

  if (btnClosePaymentModal) {
    btnClosePaymentModal.addEventListener('click', closeAddPaymentModal);
  }

  if (btnCancelPaymentModal) {
    btnCancelPaymentModal.addEventListener('click', closeAddPaymentModal);
  }

  if (addPaymentModal) {
    addPaymentModal.addEventListener('click', (e) => {
      if (e.target === addPaymentModal) closeAddPaymentModal();
    });
  }

  if (btnPayFullRemaining) {
    btnPayFullRemaining.addEventListener('click', () => {
      if (!currentPayingReservation) return;
      const total = Math.round((parseFloat(currentPayingReservation.total_price || 0) + Number.EPSILON) * 100) / 100;
      const paid = Math.round((parseFloat(currentPayingReservation.paid_amount || 0) + Number.EPSILON) * 100) / 100;
      const remaining = Math.max(0, Math.round((total - paid + Number.EPSILON) * 100) / 100);
      if (paymentNewAmount) {
        paymentNewAmount.value = remaining.toFixed(2);
        paymentNewAmount.focus();
      }
    });
  }

  if (addPaymentForm) {
    addPaymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resId = parseInt(paymentReservationId.value, 10);
      const newAmount = Math.round((parseFloat(paymentNewAmount.value) + Number.EPSILON) * 100) / 100;
      const method = paymentMethodSelectModal ? paymentMethodSelectModal.value : 'نقداً';

      if (!resId || isNaN(resId)) {
        showToast('معرف الحجز غير صالح.', 'error');
        return;
      }
      if (!Number.isFinite(newAmount) || newAmount <= 0) {
        showToast('يرجى إدخال مبلغ سداد صحيح وموجب أكبر من الصفر.', 'error');
        return;
      }

      if (currentPayingReservation) {
        const total = Math.round((parseFloat(currentPayingReservation.total_price || 0) + Number.EPSILON) * 100) / 100;
        const paid = Math.round((parseFloat(currentPayingReservation.paid_amount || 0) + Number.EPSILON) * 100) / 100;
        const remaining = Math.max(0, Math.round((total - paid + Number.EPSILON) * 100) / 100);
        if (newAmount - remaining > 0.005) {
          showToast(`المبلغ المدخل (${newAmount.toLocaleString()} ريال) يتجاوز الرصيد المتبقي المستحق (${remaining.toLocaleString()} ريال).`, 'error');
          return;
        }
      }

      const activeUserId = localStorage.getItem('currentUserId') || (currentUser ? currentUser.id : null);

      try {
        const btnSave = document.getElementById('btn-save-payment');
        if (btnSave) {
          btnSave.disabled = true;
          btnSave.textContent = 'جاري الحفظ...';
        }

        const res = await window.api.addPayment({
          reservationId: resId,
          newAmount: newAmount,
          paymentMethod: method,
          userId: activeUserId ? parseInt(activeUserId, 10) : null
        });

        if (res.success) {
          const statusText = res.isFullyPaid || res.paymentStatus === 'مدفوع بالكامل' ? 'مدفوع بالكامل ✓' : 'مدفوع جزئياً';
          const receiptMsg = res.receiptNumber ? ` (رقم السند: ${res.receiptNumber})` : '';
          showToast(`تم تسجيل سداد مبلغ ${newAmount.toLocaleString()} ريال بنجاح!${receiptMsg} - [${statusText}]`, 'success');
          closeAddPaymentModal();

          // Refresh reservations, overview, and rooms data
          await Promise.all([
            loadReservationsData(),
            loadOverviewData(),
            loadRoomsData()
          ]);
        } else {
          showToast(res.error || 'فشل تسجيل الدفعة.', 'error');
        }
      } catch (err) {
        console.error('Payment submit error:', err);
        showToast(`خطأ أثناء تسجيل الدفعة: ${err.message}`, 'error');
      } finally {
        const btnSave = document.getElementById('btn-save-payment');
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.innerHTML = '<span>حفظ وتأكيد السداد ✓</span>';
        }
      }
    });
  }

  // Toggle & Submit Add Customer Form (Available to both Admin and User roles)
  if (btnToggleAddCustomer && addCustomerPanel) {
    btnToggleAddCustomer.addEventListener('click', () => {
      const isHidden = addCustomerPanel.style.display === 'none' || !addCustomerPanel.style.display;
      addCustomerPanel.style.display = isHidden ? 'block' : 'none';
      if (isHidden && newCustomerName) newCustomerName.focus();
    });
  }

  if (btnCancelAddCustomer && addCustomerPanel) {
    btnCancelAddCustomer.addEventListener('click', () => {
      addCustomerPanel.style.display = 'none';
      if (addCustomerForm) addCustomerForm.reset();
    });
  }

  if (addCustomerForm) {
    addCustomerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = newCustomerName ? newCustomerName.value.trim() : '';
      const phone = newCustomerPhone ? newCustomerPhone.value.trim() : '';
      const id_number = newCustomerId ? newCustomerId.value.trim() : '';

      // Strict Guest Data Validation
      const validation = validateGuestInputs({ name, phone, id_number });
      if (!validation.valid) {
        showToast(validation.error, 'error');
        return;
      }

      const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : 'User');

      try {
        const res = await window.api.addCustomer({ name, phone, id_number }, activeRole);
        if (res.success) {
          showToast(`تم تسجيل بيانات النزيل "${name}" بنجاح!`, 'success');
          addCustomerForm.reset();
          addCustomerPanel.style.display = 'none';
          await loadGuestsData();
        } else {
          showToast(res.error || 'فشل حفظ بيانات النزيل.', 'error');
        }
      } catch (err) {
        console.error('Add customer error:', err);
        showToast(`خطأ أثناء الحفظ: ${err.message}`, 'error');
      }
    });
  }

  // =========================================================================
  // VIEW 5: ADMIN PANEL & USER MANAGEMENT (RBAC)
  // =========================================================================
  async function loadAdminData() {
    const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : null);
    if (activeRole !== 'Admin') return;

    try {
      const res = await window.api.getAllUsers();
      if (res.success) {
        usersCache = res.data || [];
        renderUsersTable();
      } else {
        showToast(res.error || 'تعذر تحميل المستخدمين.', 'error');
      }
    } catch (err) {
      console.error('Load users error:', err);
    }
  }

  function renderUsersTable() {
    usersTableBody.innerHTML = usersCache.map(u => {
      const isAdmin = u.role === 'Admin';
      const isDefaultAdmin = u.username.toLowerCase() === 'admin';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--primary);">#${u.id}</td>
          <td style="font-weight: 700; font-size: 0.9rem;">
            ${escapeHtml(u.username)}
            ${currentUser && u.id === currentUser.id ? ' <span style="font-size: 0.7rem; color: var(--success); font-weight: 600;">(أنت)</span>' : ''}
          </td>
          <td>
            <span class="${isAdmin ? 'badge-role-admin' : 'badge-role-staff'}">
              ${isAdmin ? 'مدير نظام (Admin)' : 'مستخدم (User)'}
            </span>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(String(u.created_at || '').split(' ')[0])}</td>
          <td style="text-align: center;">
            ${!isDefaultAdmin && (!currentUser || u.id !== currentUser.id) ? `
              <button class="btn btn-danger btn-sm" data-action="delete-user" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="حذف المستخدم">
                حذف
              </button>
            ` : `<span style="font-size: 0.75rem; color: var(--text-light);">-</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Add User Form (Admin Only)
  addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = newUsernameInput.value.trim();
    const password = newUserPasswordInput.value;
    const role = newUserRoleSelect.value;

    if (!username || !password) {
      showToast('يرجى ملء اسم المستخدم وكلمة المرور.', 'error');
      return;
    }

    const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : 'User');

    try {
      const res = await window.api.addUser({ username, password, role }, activeRole);
      if (res.success) {
        showToast(`تم إنشاء حساب "${username}" بصلاحية ${role} بنجاح!`, 'success');
        addUserForm.reset();
        await loadAdminData();
      } else {
        showToast(res.error || 'فشل إنشاء المستخدم.', 'error');
      }
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  // Update Admin Password Form
  updatePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = currentAdminNewPasswordInput.value;
    if (!newPassword || newPassword.length < 3) {
      showToast('كلمة المرور يجب أن لا تقل عن 3 أحرف.', 'error');
      return;
    }

    try {
      const res = await window.api.updateUserPassword({
        userId: currentUser ? currentUser.id : null,
        newPassword
      });

      if (res.success) {
        showToast('تم تحديث كلمة المرور الخاصة بك بنجاح!', 'success');
        updatePasswordForm.reset();
      } else {
        showToast(res.error || 'فشل تحديث كلمة المرور.', 'error');
      }
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  btnRefreshUsers.addEventListener('click', loadAdminData);

  // Delete User delegation (Admin Only)
  usersTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-user"]');
    if (!btn) return;

    const userId = btn.dataset.id;
    const username = btn.dataset.username;
    const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : 'User');

    const confirmed = await showConfirmDialog({
      title: 'حذف مستخدم من النظام',
      message: `هل أنت متأكد من رغبتك في حذف المستخدم "${username}"؟\nلن يتمكن هذا المستخدم من تسجيل الدخول للنظام بعد الحذف.`,
      confirmText: 'نعم، حذف المستخدم',
      cancelText: 'إلغاء',
      isDanger: true
    });

    if (confirmed) {
      try {
        const res = await window.api.deleteUser(userId, activeRole);
        if (res.success) {
          showToast(`تم حذف المستخدم "${username}" بنجاح.`, 'info');
          await loadAdminData();
        } else {
          showToast(res.error || 'فشل حذف المستخدم.', 'error');
        }
      } catch (err) {
        showToast(`خطأ: ${err.message}`, 'error');
      }
    }
  });

  // =========================================================================
  // FACTORY RESET APP DATA (Requires Admin Role & Password Challenge)
  // =========================================================================
  const btnOpenFactoryReset = document.getElementById('btn-open-factory-reset');
  const factoryResetModal = document.getElementById('factory-reset-modal');
  const btnCloseFactoryReset = document.getElementById('btn-close-factory-reset');
  const btnCancelFactoryReset = document.getElementById('btn-cancel-factory-reset');
  const factoryResetForm = document.getElementById('factory-reset-form');
  const factoryResetPasswordInput = document.getElementById('factory-reset-password');
  const factoryResetErrorMsg = document.getElementById('factory-reset-error-msg');
  const btnSubmitFactoryReset = document.getElementById('btn-submit-factory-reset');

  function openFactoryResetModal() {
    const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : null);
    if (activeRole !== 'Admin') {
      showToast('غير مصرح: تصفير بيانات التطبيق يتطلب صلاحيات مدير النظام (Admin).', 'error');
      return;
    }
    if (factoryResetPasswordInput) factoryResetPasswordInput.value = '';
    if (factoryResetErrorMsg) {
      factoryResetErrorMsg.textContent = '';
      factoryResetErrorMsg.style.display = 'none';
    }
    if (factoryResetModal) {
      factoryResetModal.style.display = 'flex';
      setTimeout(() => {
        if (factoryResetPasswordInput) factoryResetPasswordInput.focus();
      }, 100);
    }
  }

  function closeFactoryResetModal() {
    if (factoryResetModal) factoryResetModal.style.display = 'none';
    if (factoryResetPasswordInput) factoryResetPasswordInput.value = '';
    if (factoryResetErrorMsg) {
      factoryResetErrorMsg.textContent = '';
      factoryResetErrorMsg.style.display = 'none';
    }
  }

  if (btnOpenFactoryReset) {
    btnOpenFactoryReset.addEventListener('click', openFactoryResetModal);
  }
  if (btnCloseFactoryReset) {
    btnCloseFactoryReset.addEventListener('click', closeFactoryResetModal);
  }
  if (btnCancelFactoryReset) {
    btnCancelFactoryReset.addEventListener('click', closeFactoryResetModal);
  }
  if (factoryResetModal) {
    factoryResetModal.addEventListener('click', (e) => {
      if (e.target === factoryResetModal) closeFactoryResetModal();
    });
  }

  if (factoryResetForm) {
    factoryResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = factoryResetPasswordInput ? factoryResetPasswordInput.value : '';
      if (!pwd) {
        if (factoryResetErrorMsg) {
          factoryResetErrorMsg.textContent = 'يرجى كتابة كلمة المرور لتأكيد تصفير البيانات.';
          factoryResetErrorMsg.style.display = 'block';
        }
        return;
      }

      if (btnSubmitFactoryReset) {
        btnSubmitFactoryReset.disabled = true;
        btnSubmitFactoryReset.textContent = 'جاري تصفير البيانات...';
      }

      try {
        const res = await window.api.factoryResetDatabase(pwd);
        if (res && res.success) {
          showToast(res.message || 'تم تصفير بيانات النظام بنجاح واستعادة تهيئة المصنع!', 'success');
          closeFactoryResetModal();
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          if (factoryResetErrorMsg) {
            factoryResetErrorMsg.textContent = res?.error || 'فشلت عملية تصفير البيانات: تأكد من صحة كلمة المرور.';
            factoryResetErrorMsg.style.display = 'block';
          }
          if (factoryResetPasswordInput) {
            factoryResetPasswordInput.focus();
            highlightField(factoryResetPasswordInput);
          }
        }
      } catch (err) {
        if (factoryResetErrorMsg) {
          factoryResetErrorMsg.textContent = `خطأ: ${err.message}`;
          factoryResetErrorMsg.style.display = 'block';
        }
      } finally {
        if (btnSubmitFactoryReset) {
          btnSubmitFactoryReset.disabled = false;
          btnSubmitFactoryReset.textContent = 'تأكيد التصفير واستعادة المصنع ⚠️';
        }
      }
    });
  }

  // =========================================================================
  // OFFICIAL HOTEL TAX INVOICE & RECEIPT (FEATURE 1)
  // =========================================================================
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
      const total = parseFloat(inv.total_price || 0);
      const paid = parseFloat(inv.paid_amount || 0);
      const deposit = parseFloat(inv.deposit_amount || 0);
      const remaining = Math.max(0, total - paid);

      const d1 = new Date(inv.check_in_date);
      const d2 = new Date(inv.check_out_date);
      const nights = (d1 && d2 && d2 > d1) ? Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24))) : 1;

      const invoiceNum = `SND-2026-${String(inv.id).padStart(5, '0')}`;
      const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      invoicePrintableArea.innerHTML = `
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 28px; background: white;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4338ca; padding-bottom: 20px; margin-bottom: 24px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 44px; height: 44px; border-radius: 10px; background: #4338ca; color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.3rem;">
                  ر
                </div>
                <div>
                  <h1 style="font-size: 1.5rem; font-weight: 800; color: #1e1b4b; margin: 0;">ريحانة للوحدات السكنية</h1>
                </div>
              </div>
              <div style="font-size: 0.82rem; color: #475569; margin-top: 10px; line-height: 1.6;">
                <div>العنوان: الخبر - الثقبة - طريق الملك خالد</div>
                <div>الرمز البريدي: 34625</div>
                <div>هاتف الاستقبال: 0560631783</div>
              </div>
            </div>

            <div style="text-align: left; direction: ltr;">
              <div style="background: #eef2ff; color: #3730a3; padding: 6px 18px; border-radius: 8px; font-weight: 800; font-size: 1.15rem; display: inline-block;">
                سند
              </div>
              <div style="font-size: 0.85rem; color: #334155; margin-top: 8px; font-weight: 700; direction: rtl; text-align: left;">
                رقم السند: <span style="font-family: monospace; color: #4338ca;">${invoiceNum}</span>
              </div>
              <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px; direction: rtl; text-align: left;">
                تاريخ الإصدار: <span>${printDate}</span>
              </div>
              <div style="margin-top: 6px; direction: rtl; text-align: left;">
                ${getPaymentStatusBadge(inv.payment_status)}
              </div>
            </div>
          </div>

          <!-- Guest & Reservation Info Box -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
            <div>
              <h4 style="font-size: 0.9rem; font-weight: 800; color: #334155; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">بيانات النزيل (Guest Details)</h4>
              <div style="font-size: 0.85rem; line-height: 1.7; color: #1e293b;">
                <div><strong>اسم النزيل:</strong> ${escapeHtml(inv.guest_name)}</div>
                <div><strong>رقم الجوال:</strong> ${escapeHtml(inv.guest_phone || '-')}</div>
                <div><strong>رقم الهوية / الإقامة:</strong> ${escapeHtml(inv.guest_id_number || 'غير مسجل')}</div>
              </div>
            </div>

            <div>
              <h4 style="font-size: 0.9rem; font-weight: 800; color: #334155; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">بيانات الإقامة والوحدة (Stay Details)</h4>
              <div style="font-size: 0.85rem; line-height: 1.7; color: #1e293b;">
                <div><strong>رقم الوحدة:</strong> ${escapeHtml(inv.room_number)} (${escapeHtml(inv.room_type || '')})</div>
                <div><strong>تاريخ الوصول:</strong> ${escapeHtml(inv.check_in_date)}</div>
                <div><strong>تاريخ المغادرة:</strong> ${escapeHtml(inv.check_out_date)} (${nights} ${nights === 1 ? 'ليلة' : 'ليالٍ'})</div>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.88rem;">
            <thead>
              <tr style="background: #1e1b4b; color: white;">
                <th style="padding: 10px 14px; text-align: right; border-radius: 0 6px 0 0;">الوصف والخدمة</th>
                <th style="padding: 10px 14px; text-align: center;">سعر الليلة</th>
                <th style="padding: 10px 14px; text-align: center;">عدد الليالي</th>
                <th style="padding: 10px 14px; text-align: left; border-radius: 6px 0 0 0;">المجموع</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 14px;">
                  <strong>إقامة سكنية - وحدة ${escapeHtml(inv.room_number)}</strong>
                  <div style="font-size: 0.78rem; color: #64748b;">نوع الوحدة: ${escapeHtml(inv.room_type || 'عادية')}</div>
                </td>
                <td style="padding: 12px 14px; text-align: center;">${parseFloat(inv.price_per_night || 0).toLocaleString()} ريال</td>
                <td style="padding: 12px 14px; text-align: center; font-weight: 700;">${nights}</td>
                <td style="padding: 12px 14px; text-align: left; font-weight: 800; color: #1e1b4b;">${total.toLocaleString()} ريال</td>
              </tr>
              ${deposit > 0 ? `
                <tr style="border-bottom: 1px solid #e2e8f0; background: #fdf4ff;">
                  <td style="padding: 10px 14px;">
                    <strong>مبلغ تأمين مسترد (Refundable Deposit)</strong>
                    <div style="font-size: 0.75rem; color: #64748b;">تأمين مسترد عند تسليم الوحدة وفحص المحتويات</div>
                  </td>
                  <td style="padding: 10px 14px; text-align: center;">-</td>
                  <td style="padding: 10px 14px; text-align: center;">-</td>
                  <td style="padding: 10px 14px; text-align: left; font-weight: 700; color: #701a75;">${deposit.toLocaleString()} ريال</td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <!-- Financial Breakdown & Totals -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;">
            <div style="max-width: 340px; font-size: 0.82rem; color: #64748b; line-height: 1.6;">
              <div style="font-weight: 700; color: #334155; margin-bottom: 4px;">طريقة السداد: ${escapeHtml(inv.payment_method || 'نقداً')}</div>
              <div>* يعتبر هذا المستند سند استلام رسمي ومعتمد.</div>
            </div>

            <div style="width: 280px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 0.88rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 800; font-size: 1rem; color: #1e1b4b;">
                <span>الإجمالي الكلي:</span>
                <span>${total.toFixed(2)} ريال</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #059669; font-weight: 700;">
                <span>المبلغ المدفوع:</span>
                <span>${paid.toFixed(2)} ريال</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-weight: 800; color: ${remaining > 0 ? '#dc2626' : '#059669'};">
                <span>المبلغ المتبقي:</span>
                <span>${remaining.toFixed(2)} ريال</span>
              </div>
            </div>
          </div>
        </div>
      `;

      if (invoiceModal) {
        invoiceModal.style.display = 'flex';
      }
    } catch (err) {
      console.error('Invoice error:', err);
      showToast(`خطأ في عرض الفاتورة: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // SHIFT AUDIT & NIGHT CLOSING (FEATURE 5)
  // =========================================================================
  async function openShiftAuditModal(targetDate) {
    try {
      const dateToUse = targetDate || getLocalDateString();
      const res = await window.api.getShiftAuditReport(dateToUse);
      if (!res || !res.success || !res.data) {
        showToast(res?.error || 'تعذر استخراج تقرير إقفال الوردية.', 'error');
        return;
      }

      const rep = res.data;
      const fin = rep.financials || {};
      const mov = rep.movements || {};
      const rm = rep.rooms || {};
      const txs = rep.transactions || [];
      const printTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

      shiftAuditContent.innerHTML = `
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 26px; background: white;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 20px;">
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; margin: 0;">تقرير الإقفال اليومي للوردية والموازنة المالية</h2>
              <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0 0 0;">Daily Shift Audit & Financial Closing Reconciliation</p>
            </div>
            <div style="text-align: left; font-size: 0.82rem; color: #334155;">
              <div>التاريخ المستهدف: <strong>${rep.date}</strong></div>
              <div>وقت الطباعة: <span>${printTime}</span></div>
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
            </div>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 0.78rem; color: #1d4ed8; font-weight: 700;">مقبوضات مدى / شبكة</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #1e40af; margin-top: 4px;">${parseFloat(fin.cardTotal || 0).toLocaleString()} <span style="font-size: 0.75rem;">ريال</span></div>
            </div>
            <div style="background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 0.78rem; color: #86198f; font-weight: 700;">تحويلات وتأمينات</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #701a75; margin-top: 4px;">${(parseFloat(fin.transferTotal || 0) + parseFloat(fin.depositTotal || 0)).toLocaleString()} <span style="font-size: 0.75rem;">ريال</span></div>
            </div>
          </div>

          <!-- Occupancy & Movements -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
              <h4 style="font-size: 0.88rem; font-weight: 800; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. حالة ونسبة إشغال الفندق (Occupancy Rate)</h4>
              <div style="font-size: 0.84rem; line-height: 1.8; color: #1e293b;">
                <div style="display: flex; justify-content: space-between;"><span>إجمالي غرف الفندق:</span> <strong>${rm.totalRooms || 0} غرف</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>الغرف المشغولة:</span> <strong style="color: #dc2626;">${rm.occupiedCount || 0}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>الغرف المتاحة:</span> <strong style="color: #059669;">${rm.availableCount || 0}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>الغرف قيد التنظيف:</span> <strong style="color: #d97706;">${rm.cleaningCount || 0}</strong></div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; font-weight: 800; color: #4338ca;">
                  <span>نسبة الإشغال الإجمالية:</span>
                  <span>${rm.occupancyRate || 0}%</span>
                </div>
              </div>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
              <h4 style="font-size: 0.88rem; font-weight: 800; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. حركة النزلاء خلال اليوم (Daily Movements)</h4>
              <div style="font-size: 0.84rem; line-height: 1.8; color: #1e293b;">
                <div style="display: flex; justify-content: space-between;"><span>عمليات تسجيل الدخول اليوم (Check-ins):</span> <strong style="color: #059669;">${mov.checkinsToday || 0}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>عمليات تسجيل الخروج اليوم (Check-outs):</span> <strong style="color: #d97706;">${mov.checkoutsToday || 0}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span>إجمالي الحجوزات المنفذة اليوم:</span> <strong>${mov.totalReservationsToday || 0}</strong></div>
              </div>
            </div>
          </div>

          <!-- Transactions Breakdown -->
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin-bottom: 10px;">4. سجل العمليات المالية والتحصيلات في هذا اليوم</h4>
          ${txs.length === 0 ? `
            <div style="padding: 16px; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 0.85rem; margin-bottom: 24px;">
              لا توجد عمليات مالية مسجلة في هذا اليوم.
            </div>
          ` : `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.82rem;">
              <thead>
                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                  <th style="padding: 8px 10px; text-align: right;">الحجز</th>
                  <th style="padding: 8px 10px; text-align: right;">النزيل</th>
                  <th style="padding: 8px 10px; text-align: right;">الغرفة</th>
                  <th style="padding: 8px 10px; text-align: center;">طريقة الدفع</th>
                  <th style="padding: 8px 10px; text-align: center;">المدفوع</th>
                  <th style="padding: 8px 10px; text-align: center;">التأمين</th>
                  <th style="padding: 8px 10px; text-align: center;">حالة السداد</th>
                </tr>
              </thead>
              <tbody>
                ${txs.map(t => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-family: monospace; font-weight: 700;">#${t.id}</td>
                    <td style="padding: 8px 10px; font-weight: 700;">${escapeHtml(t.guest_name)}</td>
                    <td style="padding: 8px 10px;">غرفة ${escapeHtml(t.room_number)}</td>
                    <td style="padding: 8px 10px; text-align: center;">${escapeHtml(t.payment_method || 'نقداً')}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #059669;">${parseFloat(t.paid_amount || 0).toLocaleString()} ريال</td>
                    <td style="padding: 8px 10px; text-align: center; color: #701a75;">${parseFloat(t.deposit_amount || 0).toLocaleString()} ريال</td>
                    <td style="padding: 8px 10px; text-align: center;">${getPaymentStatusBadge(t.payment_status)}</td>
                  </tr>
                `).join('')}
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
    const remaining = Math.max(0, total - paid);
    if (editInvRemainingPreview) {
      editInvRemainingPreview.textContent = `${remaining.toFixed(2)} ريال`;
      editInvRemainingPreview.style.color = remaining > 0 ? '#dc2626' : '#059669';
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
      if (totalPrice <= 0) {
        showToast('السعر الإجمالي يجب أن يكون أكبر من الصفر.', 'error');
        return;
      }
      if (paidAmount < 0) {
        showToast('المبلغ المدفوع لا يمكن أن يكون سالباً.', 'error');
        return;
      }
      if (paidAmount - totalPrice > 0.005) {
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
            loadOverviewData(),
            loadRoomsData(),
            loadReservationsData()
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
      printIsolatedElement(shiftAuditContent ? shiftAuditContent.innerHTML : '', 'تقرير إقفال الوردية والموازنة المالية', false);
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
        const res = await window.api.printToPdf({
          html: shiftAuditContent.innerHTML,
          title: 'تقرير إقفال الوردية والموازنة المالية',
          defaultFilename: `shift_audit_${getLocalDateString()}.pdf`
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
        await window.api.openPrintPreviewWindow({
          html: shiftAuditContent.innerHTML,
          title: 'معاينة تقرير إقفال الوردية والموازنة المالية'
        });
      } catch (err) {
        showToast(`تعذر فتح نافذة المعاينة: ${err.message}`, 'error');
      }
    });
  }

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
          await loadOverviewData();
          await loadReservationsData();
          await loadRoomsData();
          await loadGuestsData();
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

  function formatArabicDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) + ' ' + d.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  }

  async function openDailyBackupModal() {
    if (!dailyBackupModal) return;
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
                  await loadOverviewData();
                  await loadReservationsData();
                  await loadRoomsData();
                  await loadGuestsData();
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
        await window.api.openBackupsFolder();
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
    const res = reservationsCache.find(r => r.id === targetId);
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

  // =========================================================================
  // GLOBAL ACTIONS: CHECKOUT, CANCEL, INVOICE, QUICK-BOOK & QUICK-READY
  // =========================================================================
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id || btn.getAttribute('data-id'), 10);

    // Shift Audit Open
    if (action === 'open-shift-audit') {
      openShiftAuditModal();
      return;
    }

    // Daily Automated Backup Open
    if (action === 'open-daily-backup') {
      openDailyBackupModal();
      return;
    }

    // DB Backup & Restore
    if (action === 'backup-db') {
      if (btnBackupDb) btnBackupDb.click();
      return;
    }
    if (action === 'restore-db') {
      if (btnRestoreDb) btnRestoreDb.click();
      return;
    }

    // Invoice View & Print
    if (action === 'invoice') {
      openInvoiceModal(id);
      return;
    }

    // Send via WhatsApp
    if (action === 'whatsapp') {
      sendReservationWhatsApp(id);
      return;
    }

    // Edit Room Modal Open
    if (action === 'edit-room') {
      const roomId = btn.dataset.roomId || btn.dataset.id;
      openEditRoomModal(roomId);
      return;
    }

    // Quick Book from Room Card
    if (action === 'quick-book') {
      const roomId = btn.dataset.roomId;
      initiateRoomBooking(roomId);
      return;
    }

    // Quick Cleaned (1-click ready)
    if (action === 'quick-ready') {
      const roomId = btn.dataset.roomId;
      try {
        const res = await window.api.updateRoomStatus(roomId, 'متاحة');
        if (res.success) {
          showToast('تم تحديث حالة الغرفة إلى "متاحة" وجاهزة للتسكين بنجاح! ✓', 'success');
          await loadRoomsData();
          await loadOverviewData();
        } else {
          showToast('فشل تحديث حالة الغرفة.', 'error');
        }
      } catch (err) {
        showToast(`خطأ: ${err.message}`, 'error');
      }
      return;
    }

    // Add Subsequent Payment Modal Open
    if (action === 'add-payment') {
      openAddPaymentModal(id);
      return;
    }

    if (action === 'checkout') {
      const confirmed = await showConfirmDialog({
        title: 'تسجيل خروج النزيل',
        message: `هل أنت متأكد من تسجيل خروج النزيل للحجز #${id}؟\nسيتم إكمال الحجز وتحويل الغرفة تلقائياً لوضع "تنظيف".`,
        confirmText: 'تسجيل الخروج',
        cancelText: 'إلغاء',
        isDanger: false
      });

      if (confirmed) {
        try {
          const res = await window.api.checkoutReservation(id);
          if (res.success) {
            showToast(`تم تسجيل خروج الحجز #${id} بنجاح.`, 'success');
            await loadOverviewData();
            await loadReservationsData();
            await loadRoomsData();
          } else {
            showToast(res.error || 'فشل تسجيل الخروج.', 'error');
          }
        } catch (err) {
          showToast(`خطأ: ${err.message}`, 'error');
        }
      }
    } else if (action === 'cancel') {
      const confirmed = await showConfirmDialog({
        title: 'إلغاء الحجز الفندقي',
        message: `هل أنت متأكد من إلغاء الحجز #${id}؟\nستصبح الغرفة متاحة مجدداً للحجز وسيتم تصفير المبلغ المدفوع.`,
        confirmText: 'نعم، إلغاء الحجز',
        cancelText: 'تراجع',
        isDanger: true
      });

      if (confirmed) {
        try {
          const res = await window.api.cancelReservation(id);
          if (res.success) {
            showToast(`تم إلغاء الحجز #${id}.`, 'info');
            await loadOverviewData();
            await loadReservationsData();
            await loadRoomsData();
          } else {
            showToast(res.error || 'فشل إلغاء الحجز.', 'error');
          }
        } catch (err) {
          showToast(`خطأ: ${err.message}`, 'error');
        }
      }
    }
  });

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
      await window.api.openDbFolder();
    } catch (err) {
      console.error(err);
    }
  });

  // =========================================================================
  // VIEW 6: EMPLOYEE ACTIVITY LOGS (سجل نشاط الموظفين - Admin Only)
  // =========================================================================
  async function loadLogsData() {
    const activeRole = localStorage.getItem('currentUserRole') || (currentUser ? currentUser.role : null);
    if (activeRole !== 'Admin') return;

    try {
      const res = await window.api.getEmployeeLogs();
      if (res.success) {
        logsCache = res.data || [];
        renderLogsTable();
      } else {
        showToast(res.error || 'تعذر تحميل سجل الموظفين.', 'error');
      }
    } catch (err) {
      console.error('Load logs error:', err);
    }
  }

  function renderLogsTable() {
    const query = (searchLogs.value || '').toLowerCase().trim();

    const filtered = logsCache.filter(log => {
      if (!query) return true;
      return (
        String(log.id || '').includes(query) ||
        String(log.username || '').toLowerCase().includes(query) ||
        String(log.role || '').toLowerCase().includes(query)
      );
    });

    logsCountBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      logsTableBody.innerHTML = '';
      logsEmpty.style.display = 'block';
      return;
    }

    logsEmpty.style.display = 'none';

    logsTableBody.innerHTML = filtered.map(log => {
      const isAdmin = log.role === 'Admin';
      const isActive = !log.logout_time;

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--primary);">#${log.id}</td>
          <td style="font-weight: 700; font-size: 0.9rem;">
            ${escapeHtml(log.username)}
          </td>
          <td>
            <span class="${isAdmin ? 'badge-role-admin' : 'badge-role-staff'}">
              ${isAdmin ? 'مدير نظام (Admin)' : 'مستخدم (User)'}
            </span>
          </td>
          <td style="font-family: monospace; font-size: 0.82rem; color: #334155;">
            ${escapeHtml(log.login_time || '-')}
          </td>
          <td style="font-family: monospace; font-size: 0.82rem; color: #334155;">
            ${log.logout_time ? escapeHtml(log.logout_time) : '<span style="color: var(--text-light);">-</span>'}
          </td>
          <td>
            ${isActive ? `
              <span class="badge" style="background: #ecfdf5; color: #065f46; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                <span class="online-dot" style="display:inline-block; width:6px; height:6px;"></span>
                متصل حالياً (نشط)
              </span>
            ` : `
              <span class="badge" style="background: #f1f5f9; color: #64748b; font-weight: 700;">
                جلسة منتهية
              </span>
            `}
          </td>
        </tr>
      `;
    }).join('');
  }

  searchLogs.addEventListener('input', renderLogsTable);
  btnRefreshLogs.addEventListener('click', loadLogsData);

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
        userDisplayName.textContent = currentUser.username;
        userDisplayRole.textContent = currentUser.role === 'Admin' ? 'مدير نظام (Admin)' : 'مستخدم (User)';
        localStorage.setItem('currentUserRole', currentUser.role);
        localStorage.setItem('currentUsername', currentUser.username);
        localStorage.setItem('currentUserId', String(currentUser.id));

        applyRbacUi(currentUser.role);

        if (info.logId) {
          localStorage.setItem('ahmed_hotel_log_id', String(info.logId));
        }
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
      console.warn('App info error:', err);
    }

    // Default view: overview
    window.switchView('overview');
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.openInvoiceModal = openInvoiceModal;
  window.openShiftAuditModal = openShiftAuditModal;
  window.openDailyBackupModal = openDailyBackupModal;
  window.showConfirmDialog = showConfirmDialog;
  window.openNewReservationModal = openNewReservationModal;
  window.closeNewReservationModal = closeNewReservationModal;
  window.initiateRoomBooking = initiateRoomBooking;

  init();

})();
