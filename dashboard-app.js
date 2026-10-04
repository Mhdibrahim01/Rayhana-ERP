window.DashboardApp = {
  State: {
    testVar: 0,
    currentUser: null
  },
  DOM: {},
  Helpers: {}
};

(function(App) {
  "use strict";

  const ARABIC_MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  App.Helpers.ARABIC_MONTHS = ARABIC_MONTHS;

  function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isReservationOverdue(reservation) {
    if (!reservation || reservation.status !== 'مؤكد') return false;
    const checkOutDate = String(reservation.check_out_date || '').slice(0, 10);
    if (!checkOutDate || checkOutDate === 'مفتوح') return false;

    const todayStr = getLocalDateString();
    if (checkOutDate < todayStr) return true;
    if (checkOutDate > todayStr) return false;

    const now = new Date();
    return now.getHours() > 14 || (now.getHours() === 14 && (now.getMinutes() > 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0));
  }

  function renderOverdueBadge(reservation, label = 'متأخر عن المغادرة') {
    return isReservationOverdue(reservation)
      ? `<span class="badge" style="display: inline-block; margin-top: 4px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-size: 0.7rem; font-weight: 800;">${escapeHtml(label)}</span>`
      : '';
  }

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

  function getReservationStatusBadge(status) {
    if (status === 'مؤكد') {
      return `<span class="badge badge-confirmed">حجز مؤكد</span>`;
    } else if (status === 'مكتمل') {
      return `<span class="badge badge-completed">تم تسجيل الخروج</span>`;
    } else if (status === 'ملغي') {
      return `<span class="badge badge-cancelled">ملغي</span>`;
    } else if (status === 'ملغي جزئي') {
      return `<span class="badge" style="background: rgba(234, 88, 12, 0.12); color: #ea580c; border: 1px solid rgba(234, 88, 12, 0.3); font-weight: 700;">ملغي جزئياً</span>`;
    }
    return `<span class="badge">${escapeHtml(status)}</span>`;
  }

  function getPaymentStatusBadge(status) {
    // PERF: Using CSS classes (not inline styles) — browser caches style rules once.
    if (status === 'مدفوع بالكامل' || status === 'مكتمل') {
      return `<span class="badge badge-paid-full">مدفوع بالكامل ✓</span>`;
    } else if (status === 'رصيد دائن') {
      return `<span class="badge" style="background: rgba(37, 99, 235, 0.12); color: #2563eb; border: 1px solid rgba(37, 99, 235, 0.3); font-weight: 800;">رصيد دائن 💳</span>`;
    } else if (status === 'مدفوع جزئياً') {
      return `<span class="badge badge-paid-partial">مدفوع جزئياً</span>`;
    } else {
      return `<span class="badge badge-unpaid">غير مدفوع</span>`;
    }
  }

  function getBookingTypeBadge(type) {
    if (type === 'عقد مفتوح') {
      return `<span class="badge" style="background: rgba(14, 165, 233, 0.12); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.3); font-size: 0.72rem; font-weight: 800; padding: 2px 7px;">عقد مفتوح 📋</span>`;
    } else if (type === 'حجز شهري') {
      return `<span class="badge" style="background: rgba(168, 85, 247, 0.12); color: #9333ea; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 0.72rem; font-weight: 800; padding: 2px 7px;">حجز شهري 📅</span>`;
    } else if (type === 'استخدام يومي') {
      return `<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.72rem; font-weight: 800; padding: 2px 7px;">استخدام يومي ☀️</span>`;
    }
    return '';
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

  function formatArabicDateRange(startStr, endStr) {
    if (!startStr) return '';
    if (!endStr || startStr === endStr) {
      const parts = startStr.split('-').map(Number);
      if (parts.length !== 3 || isNaN(parts[0])) return startStr;
      const [y, m, d] = parts;
      return `${d} ${ARABIC_MONTHS[m - 1] || ''} ${y}`;
    }
    const [y1, m1, d1] = startStr.split('-').map(Number);
    const [y2, m2, d2] = endStr.split('-').map(Number);
    if (y1 === y2) {
      if (m1 === m2) {
        return `${d1} - ${d2} ${ARABIC_MONTHS[m1 - 1] || ''} ${y1}`;
      }
      return `${d1} ${ARABIC_MONTHS[m1 - 1] || ''} - ${d2} ${ARABIC_MONTHS[m2 - 1] || ''} ${y1}`;
    }
    return `${d1} ${ARABIC_MONTHS[m1 - 1] || ''} ${y1} - ${d2} ${ARABIC_MONTHS[m2 - 1] || ''} ${y2}`;
  }

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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  App.Helpers.getLocalDateString = getLocalDateString;
  App.Helpers.isReservationOverdue = isReservationOverdue;
  App.Helpers.renderOverdueBadge = renderOverdueBadge;
  App.Helpers.showToast = showToast;
  App.Helpers.getReservationStatusBadge = getReservationStatusBadge;
  App.Helpers.getPaymentStatusBadge = getPaymentStatusBadge;
  App.Helpers.getBookingTypeBadge = getBookingTypeBadge;
  App.Helpers.getRoomStatusBadge = getRoomStatusBadge;
  App.Helpers.formatArabicDateRange = formatArabicDateRange;
  App.Helpers.formatArabicDateTime = formatArabicDateTime;
  App.Helpers.escapeHtml = escapeHtml;

})(window.DashboardApp);
