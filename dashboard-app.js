window.DashboardApp = {
  State: {
    testVar: 0,
    currentUser: null,
    businessDate: null,
    hotelTimezone: 'Asia/Riyadh',
    roomsCache: [],
    guestsCache: [],
    usersCache: [],
    logsCache: [],
    monthlyRevenueChart: null,
    roomStatusChart: null,
    reservationsCache: [],
    todayCheckoutsRows: [],
    todayCheckoutsActiveFilter: "all"
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

  function getHotelBusinessDate(d = new Date(), cutoffHour = 6) {
    const date = new Date(d);
    if (date.getHours() < cutoffHour) {
      date.setDate(date.getDate() - 1);
    }
    return getLocalDateString(date);
  }

  function getHotelTimezone() {
    return App.State.hotelTimezone || 'Asia/Riyadh';
  }

  function formatHotelDateTime(dateOrString) {
    if (!dateOrString) return '-';
    const tz = getHotelTimezone();
    const d = typeof dateOrString === 'string' ? parseStoredTimestamp(dateOrString) : dateOrString;
    if (!d || Number.isNaN(d.getTime())) return '-';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(d);
    const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  }

  function isLateCheckout(reservation) {
    if (!reservation || reservation.status !== 'مؤكد') return false;
    const checkOutDate = String(reservation.check_out_date || '').slice(0, 10);
    if (!checkOutDate || checkOutDate === 'مفتوح') return false;

    const todayStr = String(App.State.businessDate || getLocalDateString());
    if (checkOutDate < todayStr) return true;
    if (checkOutDate > todayStr) return false;

    // Use the configured hotel timezone cutoff (default 14:00, or 18:00 for day use / late checkout)
    const cutoffHour = (reservation.booking_type === 'استخدام يومي' || Number(reservation.late_checkout_fee || 0) > 0) ? 18 : 14;
    let hotelHour;
    try {
      const tz = getHotelTimezone();
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, hour: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      hotelHour = Number(parts.find(p => p.type === 'hour')?.value || 0);
    } catch (_) {
      hotelHour = new Date().getHours();
    }
    return hotelHour >= cutoffHour;
  }

  function getExpectedCheckoutTime(reservation) {
    if (!reservation) return '';
    const isConfirmed = reservation.status === 'مؤكد';
    if (!isConfirmed) return '';

    const checkOutDate = String(reservation.check_out_date || '').slice(0, 10);
    const isContract = reservation.booking_type === 'عقد مفتوح' || !checkOutDate || checkOutDate === 'مفتوح';
    if (isContract) return '';

    if (reservation.booking_type === 'استخدام يومي') {
      return '18:00';
    }

    if (Number(reservation.late_checkout_fee || 0) > 0) {
      return '18:00';
    }

    return '14:00';
  }

  function isReservationOverdue(reservation) {
    return isLateCheckout(reservation);
  }

  function renderOverdueBadge(reservation, label = 'متأخر عن المغادرة') {
    return isLateCheckout(reservation)
      ? `<span class="late-checkout-badge"><span aria-hidden="true">⚠️</span>${escapeHtml(label)}</span>`
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
      return `<span class="badge badge-unified badge-confirmed badge-res-confirmed">حجز مؤكد</span>`;
    } else if (status === 'مكتمل') {
      return `<span class="badge badge-unified badge-completed badge-res-completed">مكتمل</span>`;
    } else if (status === 'ملغي') {
      return `<span class="badge badge-unified badge-cancelled badge-res-cancelled">ملغي</span>`;
    } else if (status === 'ملغي جزئي') {
      return `<span class="badge badge-unified badge-res-partial-cancelled">ملغي جزئياً</span>`;
    }
    return `<span class="badge badge-unified">${escapeHtml(status)}</span>`;
  }

  function getPaymentStatusBadge(status) {
    if (status === 'مدفوع بالكامل' || status === 'مكتمل') {
      return `<span class="badge badge-unified badge-paid-full badge-pay-paid">مدفوع بالكامل ✓</span>`;
    } else if (status === 'رصيد دائن') {
      return `<span class="badge badge-unified badge-fin-credit">رصيد دائن 💳</span>`;
    } else if (status === 'مدفوع جزئياً') {
      return `<span class="badge badge-unified badge-paid-partial badge-pay-partial">مدفوع جزئياً</span>`;
    } else {
      return `<span class="badge badge-unified badge-unpaid badge-pay-unpaid">غير مدفوع</span>`;
    }
  }

  function getBookingTypeBadge(type) {
    if (type === 'عقد مفتوح') {
      return `<span class="badge badge-unified" style="background: rgba(14, 165, 233, 0.12); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.3); font-size: 0.72rem; font-weight: 800; padding: 2px 7px;">عقد مفتوح 📋</span>`;
    } else if (type === 'حجز شهري') {
      return `<span class="badge badge-unified" style="background: rgba(168, 85, 247, 0.12); color: #9333ea; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 0.72rem; font-weight: 800; padding: 2px 7px;">حجز شهري 📅</span>`;
    } else if (type === 'استخدام يومي') {
      return `<span class="badge badge-unified" style="background: rgba(16, 185, 81, 0.12); color: #047831; border: 1px solid rgba(16, 185, 81, 0.3); font-size: 0.72rem; font-weight: 800; padding: 2px 7px;">استخدام يومي ☀️</span>`;
    }
    return '';
  }

  function getRoomStatusBadge(status) {
    if (status === 'متاحة') {
      return `<span class="badge badge-unified badge-available badge-room-available">متاحة (جاهزة)</span>`;
    } else if (status === 'مشغولة') {
      return `<span class="badge badge-unified badge-occupied badge-room-occupied">مشغولة</span>`;
    } else if (status === 'تنظيف') {
      return `<span class="badge badge-unified badge-cleaning badge-room-cleaning">قيد التنظيف</span>`;
    } else if (status === 'محجوزة') {
      return `<span class="badge badge-unified badge-reserved badge-room-reserved">محجوزة (قادمة)</span>`;
    }
    return `<span class="badge badge-unified">${escapeHtml(status)}</span>`;
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

  function parseStoredTimestamp(timestamp) {
    if (!timestamp) return null;
    const raw = String(timestamp).trim();
    if (!raw) return null;

    // SQLite CURRENT_TIMESTAMP values are UTC but omit a timezone marker.
    // Parsing "YYYY-MM-DD HH:mm:ss" directly makes JavaScript treat it as
    // local time, which shifts the displayed date for post-midnight bookings.
    let normalized = raw.replace(' ', 'T');
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(normalized)) {
      normalized += 'Z';
    }

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatArabicDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = parseStoredTimestamp(isoString);
      if (!d) return isoString;
      const tz = getHotelTimezone();
      return d.toLocaleDateString('ar-EG', {
        timeZone: tz,
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) + ' ' + d.toLocaleTimeString('ar-EG', {
        timeZone: tz,
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

  function roundMoney(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0.0;
    const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  App.Helpers.roundMoney = roundMoney;
  window.roundMoney = roundMoney;
  App.Helpers.getLocalDateString = getLocalDateString;
  App.Helpers.getHotelBusinessDate = getHotelBusinessDate;
  window.getHotelBusinessDate = getHotelBusinessDate;
  App.Helpers.getHotelTimezone = getHotelTimezone;
  App.Helpers.formatHotelDateTime = formatHotelDateTime;
  App.Helpers.isLateCheckout = isLateCheckout;
  App.Helpers.getExpectedCheckoutTime = getExpectedCheckoutTime;
  App.Helpers.isReservationOverdue = isReservationOverdue;
  App.Helpers.renderOverdueBadge = renderOverdueBadge;
  App.Helpers.showToast = showToast;
  App.Helpers.getReservationStatusBadge = getReservationStatusBadge;
  App.Helpers.getPaymentStatusBadge = getPaymentStatusBadge;
  App.Helpers.getBookingTypeBadge = getBookingTypeBadge;
  App.Helpers.getRoomStatusBadge = getRoomStatusBadge;
  App.Helpers.formatArabicDateRange = formatArabicDateRange;
  App.Helpers.formatArabicDateTime = formatArabicDateTime;
  App.Helpers.parseStoredTimestamp = parseStoredTimestamp;
  App.Helpers.escapeHtml = escapeHtml;

})(window.DashboardApp);
