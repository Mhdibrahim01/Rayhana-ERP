/**
 * نظام ريحانة لإدارة الفنادق (Rayhana Suites ERP)
 * Smart Command Palette (Ctrl + K) & Needs-Attention Inbox Engine
 */

(function initSmartCommandPalette(window, document, App) {
  'use strict';

  if (!App) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DATA CACHING & DATABASE HYDRATION
  // ─────────────────────────────────────────────────────────────────────────────

  let localRoomsCache = null;
  let localReservationsCache = null;
  let localGuestsCache = null;
  let localTodayCheckouts = null;
  let syncPromise = null;
  let paletteAttentionCache = null;

  function getCurrentBizDate() {
    if (App?.State?.businessDate) {
      return String(App.State.businessDate);
    }
    if (typeof App?.Helpers?.getLocalDateString === 'function') {
      return String(App.Helpers.getLocalDateString());
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getRooms() {
    const appRooms = Array.isArray(App?.State?.roomsCache) ? App.State.roomsCache : [];
    if (appRooms.length > 0) {
      return appRooms;
    }
    return Array.isArray(localRoomsCache) ? localRoomsCache : [];
  }

  function getReservations() {
    const appCache = Array.isArray(App?.State?.reservationsCache) ? App.State.reservationsCache : [];
    if (appCache.length > 0) {
      return appCache;
    }
    return Array.isArray(localReservationsCache) ? localReservationsCache : [];
  }

  function getGuests() {
    const appGuests = Array.isArray(App?.State?.guestsCache) ? App.State.guestsCache : [];
    if (appGuests.length > 0) {
      return appGuests;
    }
    return Array.isArray(localGuestsCache) ? localGuestsCache : [];
  }

  function syncDataFromDb() {
    if (typeof window === 'undefined' || !window.api) return Promise.resolve();
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      try {
        const currentBizDate = getCurrentBizDate();
        const promises = [
          typeof window.api.getAllRooms === 'function' ? window.api.getAllRooms().catch(() => null) : Promise.resolve(null),
          typeof window.api.getAllReservations === 'function' ? window.api.getAllReservations().catch(() => null) : Promise.resolve(null),
          typeof window.api.getAllGuests === 'function' ? window.api.getAllGuests().catch(() => null) : Promise.resolve(null),
          typeof window.api.getTodayCheckouts === 'function' ? window.api.getTodayCheckouts(currentBizDate).catch(() => null) : Promise.resolve(null)
        ];

        const [roomsRes, resRes, guestsRes, checkoutsRes] = await Promise.all(promises);

        if (roomsRes?.success && Array.isArray(roomsRes.data)) {
          localRoomsCache = roomsRes.data;
          if (!Array.isArray(App?.State?.roomsCache) || App.State.roomsCache.length === 0) {
            App.State.roomsCache = roomsRes.data;
          }
        }
        if (resRes?.success && Array.isArray(resRes.data)) {
          localReservationsCache = resRes.data;
          if (!Array.isArray(App?.State?.reservationsCache) || App.State.reservationsCache.length === 0) {
            App.State.reservationsCache = resRes.data;
          }
        }
        if (guestsRes?.success && Array.isArray(guestsRes.data)) {
          localGuestsCache = guestsRes.data;
          if (!Array.isArray(App?.State?.guestsCache) || App.State.guestsCache.length === 0) {
            App.State.guestsCache = guestsRes.data;
          }
        }
        if (checkoutsRes?.success && Array.isArray(checkoutsRes.data)) {
          localTodayCheckouts = checkoutsRes.data;
        }

        if (typeof updateAttentionInbox === 'function') {
          updateAttentionInbox();
        }
        if (typeof buildSearchIndex === 'function') {
          buildSearchIndex();
        }
        if (paletteModal && paletteModal.style.display !== 'none' && paletteInput) {
          handlePaletteSearch(paletteInput.value);
        }
      } catch (err) {
        console.warn('Failed to sync command palette data:', err);
      } finally {
        syncPromise = null;
      }
    })();

    return syncPromise;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ARABIC TEXT & KEYBOARD NORMALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  const ARABIC_INDIC_AND_PERSIAN_DIGITS = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };

  const EN_TO_AR_KEYMAP = {
    'q': 'ض', 'w': 'ص', 'e': 'ث', 'r': 'ق', 't': 'ف', 'y': 'غ', 'u': 'ع', 'i': 'ه', 'o': 'خ', 'p': 'ح', '[': 'ج', ']': 'د',
    'a': 'ش', 's': 'س', 'd': 'ي', 'f': 'ب', 'g': 'ل', 'h': 'ا', 'j': 'ت', 'k': 'ن', 'l': 'م', ';': 'ك', '\'': 'ط',
    'z': 'ئ', 'x': 'ء', 'c': 'ؤ', 'v': 'ر', 'b': 'لا', 'n': 'ى', 'm': 'ة', ',': 'و', '.': 'ز', '/': 'ظ',
    '`': 'ذ',
    'Q': 'ض', 'W': 'ص', 'E': 'ث', 'R': 'ق', 'T': 'ف', 'Y': 'غ', 'U': 'ع', 'I': 'ه', 'O': 'خ', 'P': 'ح', '{': 'ج', '}': 'د',
    'A': 'ش', 'S': 'س', 'D': 'ي', 'F': 'ب', 'G': 'ل', 'H': 'ا', 'J': 'ت', 'K': 'ن', 'L': 'م', ':': 'ك', '"': 'ط',
    'Z': 'ئ', 'X': 'ء', 'C': 'ؤ', 'V': 'ر', 'B': 'لا', 'N': 'ى', 'M': 'ة', '<': 'و', '>': 'ز', '?': 'ظ',
    '~': 'ذ'
  };

  function normalizeDigits(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[٠-٩۰-۹]/g, d => ARABIC_INDIC_AND_PERSIAN_DIGITS[d] || d);
  }

  function stripDiacritics(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/\u0640/g, '');
  }

  function canonicalizeTypoWords(str) {
    if (!str) return '';
    return str
      .replace(/(^|\s+)تسيكن(?=\s+|$)/g, '$1تسكين')
      .replace(/(^|\s+)مغاردرات(?=\s+|$)/g, '$1مغادرات')
      .replace(/(^|\s+)مسغوله(?=\s+|$)/g, '$1مشغوله')
      .replace(/(^|\s+)وريديه(?=\s+|$)/g, '$1ورديه')
      .replace(/(^|\s+)فتوره(?=\s+|$)/g, '$1فاتوره')
      .replace(/(^|\s+)تميد(?=\s+|$)/g, '$1تمديد')
      .replace(/(^|\s+)بخث(?=\s+|$)/g, '$1بحث');
  }

  function normalize(str) {
    if (!str && str !== 0) return '';
    let res = normalizeDigits(String(str));
    res = stripDiacritics(res);
    res = res
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىئ]/g, 'ي')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    res = canonicalizeTypoWords(res);
    return res;
  }

  const normalizeArabic = normalize;

  function transliterateEnToAr(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .split('')
      .map(ch => EN_TO_AR_KEYMAP[ch] || ch)
      .join('');
  }

  // Pre-normalized search cache (WeakMap) to eliminate redundant per-keystroke normalizations
  const entitySearchCache = new WeakMap();

  function getEntityNormalizedField(entity, fieldKey) {
    if (!entity || typeof entity !== 'object') return '';
    let cached = entitySearchCache.get(entity);
    if (!cached) {
      cached = {};
      entitySearchCache.set(entity, cached);
    }
    if (cached[fieldKey] !== undefined) {
      return cached[fieldKey];
    }
    const val = entity[fieldKey];
    const normalizedVal = (val || val === 0) ? normalize(String(val)) : '';
    cached[fieldKey] = normalizedVal;
    return normalizedVal;
  }

  function buildSearchIndex() {
    const rooms = getRooms();
    const reservations = getReservations();
    const guests = getGuests();

    rooms.forEach(r => {
      if (r && typeof r === 'object') {
        entitySearchCache.set(r, {
          room_number: normalize(String(r.room_number || '')),
          type: normalize(String(r.type || '')),
          status: normalize(String(r.status || ''))
        });
      }
    });

    reservations.forEach(res => {
      if (res && typeof res === 'object') {
        entitySearchCache.set(res, {
          id: normalize(String(res.id || '')),
          guest_name: normalize(String(res.guest_name || '')),
          guest_phone: normalize(String(res.guest_phone || '')),
          room_number: normalize(String(res.room_number || ''))
        });
      }
    });

    guests.forEach(g => {
      if (g && typeof g === 'object') {
        entitySearchCache.set(g, {
          name: normalize(String(g.name || '')),
          phone: normalize(String(g.phone || '')),
          id_number: normalize(String(g.id_number || '')),
          national_id: normalize(String(g.national_id || ''))
        });
      }
    });
  }

  const RECENT_ITEMS_STORAGE_KEY = 'rayhana_palette_recent_mru';

  function getRecentItems() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RECENT_ITEMS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function recordRecentItem(item) {
    if (!item || !item.title || typeof localStorage === 'undefined') return;
    try {
      let list = getRecentItems();
      list = list.filter(i => i.title !== item.title);
      list.unshift({
        id: item.id || `rec-${Date.now()}`,
        title: item.title,
        subtitle: item.subtitle || '',
        icon: typeof item.icon === 'string' ? item.icon.slice(0, 10) : '🕒',
        badge: item.badge || 'سابق'
      });
      list = list.slice(0, 5);
      localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SHARED FINANCIAL HELPER ADAPTER
  // ─────────────────────────────────────────────────────────────────────────────

  function getResFin(res, bizDate) {
    if (App?.Helpers?.getReservationFinancials) {
      return App.Helpers.getReservationFinancials(res, bizDate);
    }
    const total = parseFloat(res?.total_price || 0);
    const paid = parseFloat((res?.ledger_paid_amount ?? res?.paid_amount) || 0);
    const deposit = parseFloat(res?.deposit_ledger_balance || 0);
    const legacyDeposit = Number(res?.deposit_legacy_unreconciled || 0) === 1 ? parseFloat(res?.deposit_amount || 0) : 0;
    const remaining = Math.max(0, total - paid);
    return {
      total,
      effectiveTotal: total,
      paid,
      deposit,
      legacyDeposit,
      rawRemaining: total - paid,
      remaining,
      isCredit: (total - paid) < -0.005,
      hasUnpaidBalance: remaining > 0.005,
      paymentStatus: res?.payment_status || 'غير مدفوع',
      isOverdue: false,
      overdueDays: 0,
      elapsedStayNights: 0
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. NEEDS-ATTENTION INBOX DATA ENGINE
  // ─────────────────────────────────────────────────────────────────────────────

  function computeAttentionInbox() {
    const resMap = new Map();
    getReservations().forEach(r => {
      if (r && r.id != null) resMap.set(Number(r.id), r);
    });

    const checkoutsSources = [
      ...(Array.isArray(localTodayCheckouts) ? localTodayCheckouts : []),
      ...(Array.isArray(App?.State?.todayCheckoutsRows) ? App.State.todayCheckoutsRows : [])
    ];
    checkoutsSources.forEach(r => {
      const id = Number(r.reservation_id ?? r.id);
      if (id) {
        const existing = resMap.get(id);
        if (existing) {
          resMap.set(id, { ...existing, ...r });
        } else {
          resMap.set(id, r);
        }
      }
    });

    const reservations = [...resMap.values()];
    const rooms = getRooms();
    const currentBizDate = getCurrentBizDate();

    const lateCheckouts = [];
    const departuresToday = [];
    const completedDeparturesToday = [];
    const unpaidBalances = [];
    const dirtyRooms = [];
    const monthlyDue = [];
    const legacyDeposits = [];

    // Track per-reservation attention reasons for deduplication in "All" tab
    const resAttentionMap = new Map();

    function addReservationReason(res, reasonObj) {
      const resId = Number(res.id);
      if (!resAttentionMap.has(resId)) {
        resAttentionMap.set(resId, {
          id: resId,
          reservation: res,
          reasons: [],
          primaryAction: reasonObj.action,
          primaryActionText: reasonObj.primaryActionText
        });
      }
      const record = resAttentionMap.get(resId);
      record.reasons.push(reasonObj);

      // Priority ordering for primary action: checkout > payment > extend > preview
      const priorities = { 'checkout': 4, 'payment': 3, 'extend': 2, 'preview': 1 };
      const currentPriority = priorities[record.primaryAction] || 0;
      const newPriority = priorities[reasonObj.action] || 0;
      if (newPriority > currentPriority) {
        record.primaryAction = reasonObj.action;
        record.primaryActionText = reasonObj.primaryActionText;
      }
    }

    // Evaluate Reservations
    reservations.forEach(res => {
      const checkOutDate = String(res.check_out_date || '').slice(0, 10);
      const isContract = res.booking_type === 'عقد مفتوح';
      const isMonthly = res.booking_type === 'حجز شهري';

      // Track completed departures today (fixes "two leaving today" disparity)
      if (res.status === 'مكتمل' && checkOutDate === currentBizDate) {
        completedDeparturesToday.push({
          id: res.id,
          reservation: res,
          type: 'completed-departure',
          title: `غرفة ${res.room_number || '-'} • ${res.guest_name || 'نزيل'} (تمت المغادرة ✓)`,
          subtitle: `تاريخ المغادرة: ${checkOutDate} • الحالة: مكتمل وسدد الحساب`,
          badge: 'تمت المغادرة ✓',
          badgeClass: 'info',
          primaryActionText: 'معاينة الفاتورة',
          action: 'preview'
        });
      }

      if (res.status !== 'مؤكد') return;

      const isOverdueByDate = Boolean(checkOutDate && checkOutDate < currentBizDate);
      const isLateByHelper = Boolean(App?.Helpers?.isLateCheckout && App.Helpers.isLateCheckout(res));
      const isLate = !isContract && (isOverdueByDate || isLateByHelper);

      const fin = getResFin(res, currentBizDate);
      const balance = fin.remaining;
      const paid = fin.paid;
      const total = fin.effectiveTotal;

      // 1. Late checkouts
      if (isLate) {
        const item = {
          id: res.id,
          reservation: res,
          type: 'late-checkout',
          title: `متأخر عن المغادرة • غرفة ${res.room_number || '-'}`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • كان متوقعاً: ${checkOutDate || '-'} • المتبقي: ${balance.toLocaleString('en-US')} ر.س`,
          badge: 'متأخر ⚠️',
          badgeClass: 'danger',
          primaryActionText: 'تسجيل مغادرة',
          action: 'checkout'
        };
        lateCheckouts.push(item);
        addReservationReason(res, item);
      }
      // 2. Departures due today (not yet late)
      else if (!isContract && checkOutDate === currentBizDate) {
        const expectedTime = App?.Helpers?.getExpectedCheckoutTime ? App.Helpers.getExpectedCheckoutTime(res) : '14:00';
        const item = {
          id: res.id,
          reservation: res,
          type: 'departures-today',
          title: `مغادرة مقررة اليوم • غرفة ${res.room_number || '-'}`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • موعد الإخلاء: الساعة ${expectedTime || '14:00'}`,
          badge: 'مغادرة اليوم 🚪',
          badgeClass: 'info',
          primaryActionText: 'تسجيل مغادرة',
          action: 'checkout'
        };
        departuresToday.push(item);
        addReservationReason(res, item);
      }

      // 3. Unpaid balances (exclude those already flagged as late checkout from the tab list)
      if (balance > 0.005) {
        const unpaidItem = {
          id: res.id,
          reservation: res,
          type: 'unpaid-balance',
          title: `مستحقات معلقة • غرفة ${res.room_number || '-'} (${balance.toLocaleString('en-US')} ر.س)`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • المدفوع: ${paid.toLocaleString('en-US')} ر.س من إجمالي ${total.toLocaleString('en-US')} ر.س`,
          badge: 'مستحق سداد 💳',
          badgeClass: 'warning',
          primaryActionText: 'تحصيل دفعة',
          action: 'payment'
        };
        if (!isLate) {
          unpaidBalances.push(unpaidItem);
        }
        addReservationReason(res, unpaidItem);
      }

      // 4. Monthly contracts due soon (within 3 days of expiration or expired)
      if (isMonthly && checkOutDate) {
        const d1 = Date.parse(`${currentBizDate}T00:00:00Z`);
        const d2 = Date.parse(`${checkOutDate}T00:00:00Z`);
        const daysLeft = Math.round((d2 - d1) / 86400000);
        if (daysLeft <= 3) {
          let badgeText;
          let subtitleDesc;
          if (daysLeft === 0) {
            badgeText = 'مستحق التجديد اليوم 📅';
            subtitleDesc = 'مستحق التجديد اليوم';
          } else if (daysLeft < 0) {
            badgeText = `منتهي منذ ${Math.abs(daysLeft)} يوم ⚠️`;
            subtitleDesc = `منتهي منذ ${Math.abs(daysLeft)} يوم`;
          } else {
            badgeText = `يستحق بعد ${daysLeft} يوم 📅`;
            subtitleDesc = `متبقي ${daysLeft} يوم`;
          }

          const monthlyItem = {
            id: res.id,
            reservation: res,
            type: 'monthly-due',
            title: `إيجار شهري يقترب من التجديد • غرفة ${res.room_number || '-'}`,
            subtitle: `المستأجر: ${res.guest_name || 'مستأجر'} • تاريخ التجديد: ${checkOutDate} (${subtitleDesc})`,
            badge: badgeText,
            badgeClass: daysLeft <= 0 ? 'danger' : 'purple',
            primaryActionText: 'تمديد العقد',
            action: 'extend'
          };
          monthlyDue.push(monthlyItem);
          addReservationReason(res, monthlyItem);
        }
      }

      // 5. Unreconciled legacy deposits (strictly deposit_legacy_unreconciled === 1)
      const hasLegacyDeposit = Number(res.deposit_legacy_unreconciled || 0) === 1;
      if (hasLegacyDeposit) {
        const depositItem = {
          id: res.id,
          reservation: res,
          type: 'legacy-deposit',
          title: `تأمين سابق بحاجة لمطابقة • غرفة ${res.room_number || '-'}`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • مبلغ التأمين: ${Number(res.deposit_amount || 0).toLocaleString('en-US')} ر.س`,
          badge: 'تأمين معلق 💰',
          badgeClass: 'warning',
          primaryActionText: 'معاينة الحساب',
          action: 'preview'
        };
        legacyDeposits.push(depositItem);
        addReservationReason(res, depositItem);
      }
    });

    // 6. Rooms waiting for cleaning
    rooms.forEach(room => {
      if (room.status === 'تنظيف') {
        dirtyRooms.push({
          id: room.id,
          room,
          type: 'dirty-rooms',
          title: `غرفة بانتظار النظافة • غرفة ${room.room_number || '-'}`,
          subtitle: `النوع: ${room.type || 'عادية'} • الطابق: ${room.floor || '1'} • السعر: ${Number(room.price_per_night || 0).toLocaleString('en-US')} ر.س`,
          badge: 'تحت التنظيف 🧹',
          badgeClass: 'purple',
          primaryActionText: 'تأكيد جاهزية الغرفة',
          action: 'mark-clean'
        });
      }
    });

    // Build deduplicated items for "All" tab
    const deduplicatedAllItems = [];

    // Add consolidated reservations
    resAttentionMap.forEach(record => {
      const firstReason = record.reasons[0];
      const badges = record.reasons.map(r => r.badge);
      const isUrgent = record.reasons.some(r => r.badgeClass === 'danger');
      const badgeClass = isUrgent ? 'danger' : (record.reasons.some(r => r.badgeClass === 'warning') ? 'warning' : 'info');

      deduplicatedAllItems.push({
        id: record.id,
        reservation: record.reservation,
        type: firstReason.type,
        title: record.reasons.length > 1
          ? `غرفة ${record.reservation.room_number || '-'} • ${record.reservation.guest_name || 'نزيل'} (${record.reasons.length} متطلبات)`
          : firstReason.title,
        subtitle: record.reasons.map(r => r.subtitle).join(' | '),
        badge: badges.join(' • '),
        badgeClass,
        primaryActionText: record.primaryActionText,
        action: record.primaryAction
      });
    });

    // Add dirty rooms
    dirtyRooms.forEach(item => {
      deduplicatedAllItems.push(item);
    });

    const totalCount = deduplicatedAllItems.length;

    return {
      lateCheckouts,
      departuresToday,
      completedDeparturesToday,
      unpaidBalances,
      dirtyRooms,
      monthlyDue,
      legacyDeposits,
      deduplicatedAllItems,
      totalCount
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. COMMAND REGISTRY & PARSER
  // ─────────────────────────────────────────────────────────────────────────────

  // Shared helper to build room actions across room-inquiry and prefix-room commands
  function buildRoomActions(ctx, roomNum, options = {}) {
    const room = ctx.rooms.find(r => String(r.room_number) === String(roomNum) || String(r.id) === String(roomNum));
    const activeRes = ctx.reservations.find(r =>
      ((room && r.room_id === room.id) || String(r.room_number) === String(roomNum)) &&
      r.status === 'مؤكد'
    ) || (room && room.active_reservations ? room.active_reservations[0] : null);

    const resById = options.checkReservationId ? ctx.reservations.find(r => String(r.id) === String(roomNum)) : null;

    if (room || activeRes) {
      const displayRoomNum = room ? room.room_number : (activeRes ? activeRes.room_number : roomNum);
      const statusText = room ? room.status : (activeRes ? 'مشغولة' : 'غير محددة');

      if (activeRes) {
        const fin = getResFin(activeRes, ctx.currentBizDate);
        const balance = fin.remaining;

        ctx.results.push({
          category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
          icon: '🔴',
          title: `غرفة ${displayRoomNum} (${statusText}) • النزيل: ${activeRes.guest_name || 'نزيل مقيم'}`,
          subtitle: `الجوال: ${activeRes.guest_phone || '-'} • المغادرة: ${activeRes.check_out_date || 'مفتوح'} • المتبقي: ${balance.toLocaleString('en-US')} ر.س ${balance > 0 ? '⚠️' : '✓'}`,
          badge: statusText,
          actionFn: () => {
            if (App?.Helpers?.openReservationPreview) {
              App.Helpers.openReservationPreview(activeRes.id);
            } else {
              showMissingHelperToast();
            }
          }
        });

        ctx.results.push({
          category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
          icon: '🧾',
          title: `تسجيل مغادرة وتصفية الحساب • غرفة ${displayRoomNum}`,
          subtitle: `إنهاء إقامة النزيل (${activeRes.guest_name}) وتسليم الغرفة`,
          badge: 'مغادرة',
          actionFn: () => {
            if (App?.Helpers?.openContractSettleModal) {
              App.Helpers.openContractSettleModal(activeRes);
            } else if (App?.Helpers?.openReservationPreview) {
              App.Helpers.openReservationPreview(activeRes.id);
            } else {
              showMissingHelperToast();
            }
          }
        });

        if (activeRes.guest_phone) {
          ctx.results.push({
            category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
            icon: '💬',
            title: `مراسلة النزيل (${activeRes.guest_name}) عبر واتساب`,
            subtitle: `إرسال رسالة سريعة إلى ${activeRes.guest_phone}`,
            badge: 'WhatsApp',
            actionFn: () => {
              if (window.sendReservationWhatsApp) window.sendReservationWhatsApp(activeRes.id);
              else showMissingHelperToast();
            }
          });
        }

        if (balance > 0) {
          ctx.results.push({
            category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
            icon: '💳',
            title: `تسجيل دفعة سداد جديدة • متبقي ${balance.toLocaleString('en-US')} ر.س`,
            subtitle: `تحصيل مبلغ مالي للنزيل (${activeRes.guest_name})`,
            badge: 'سداد دفعة',
            actionFn: () => {
              if (window.openAddPaymentModal) {
                window.openAddPaymentModal(activeRes.id);
              } else if (App?.Helpers?.openReservationPreview) {
                App.Helpers.openReservationPreview(activeRes.id);
              } else {
                showMissingHelperToast();
              }
            }
          });
        }
      } else if (room && room.status === 'متاحة') {
        ctx.results.push({
          category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
          icon: '🟢',
          title: `غرفة ${displayRoomNum} (متاحة للتشغيل)`,
          subtitle: `النوع: ${room.type || 'عادية'} • السعر: ${Number(room.price_per_night || 0).toLocaleString('en-US')} ر.س/ليلة • الطابق: ${room.floor || '1'}`,
          badge: 'متاحة ✓',
          actionFn: () => {
            if (App?.Helpers?.initiateRoomBooking) App.Helpers.initiateRoomBooking(room.id);
            else switchViewSection('rooms');
          }
        });

        ctx.results.push({
          category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
          icon: '➕',
          title: `تسكين فوري للغرفة ${displayRoomNum}`,
          subtitle: 'فتح نموذج حجز جديد واختيار هذه الغرفة تلقائياً',
          badge: 'تسكين',
          actionFn: () => {
            if (App?.Helpers?.initiateRoomBooking) App.Helpers.initiateRoomBooking(room.id);
            else switchViewSection('rooms');
          }
        });
      } else if (room && room.status === 'تنظيف') {
        ctx.results.push({
          category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
          icon: '🧹',
          title: `غرفة ${displayRoomNum} (تحت التنظيف)`,
          subtitle: 'الغرفة بانتظار إشعار عمال النظافة قبل إتاحتها للحجز',
          badge: 'تنظيف',
          actionFn: () => requestRoomCleaningCompletion(room)
        });
      } else if (room) {
        ctx.results.push({
          category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
          icon: '🛠️',
          title: `غرفة ${displayRoomNum} (حالة: ${room.status})`,
          subtitle: `النوع: ${room.type || 'عادية'} • الطابق: ${room.floor || '1'}`,
          badge: room.status,
          actionFn: () => switchViewSection('rooms')
        });
      }
    }

    if (resById && (!activeRes || resById.id !== activeRes.id)) {
      ctx.results.push({
        category: '📋 نتيجة رقم الحجز',
        icon: '📋',
        title: `حجز رقم #${resById.id} • ${resById.guest_name || 'نزيل'} (غرفة ${resById.room_number || '-'})`,
        subtitle: `الحالة: ${resById.status} • الوصول: ${resById.check_in_date || '-'} • المغادرة: ${resById.check_out_date || '-'}`,
        badge: resById.status,
        actionFn: () => {
          if (App?.Helpers?.openReservationPreview) {
            App.Helpers.openReservationPreview(resById.id);
          } else {
            showMissingHelperToast();
          }
        }
      });
    }

    if (!room && !activeRes && !resById) {
      if (options.checkReservationId) {
        ctx.results.push({
          category: 'بحث الغرف والحجوزات',
          icon: '❓',
          title: `لم يتم العثور على غرفة أو حجز بالرقم "${roomNum}"`,
          subtitle: 'تأكد من الرقم المدخل أو استعرض قائمة الغرف والحجوزات',
          badge: 'غير موجود',
          actionFn: () => switchViewSection('rooms')
        });
      } else {
        ctx.results.push({
          category: '🚪 تفاصيل الغرفة',
          icon: '❓',
          title: `الغرفة غير موجودة بالرقم "${roomNum}"`,
          subtitle: 'تأكد من رقم الغرفة المدخل أو استعرض خريطة الغرف',
          badge: 'غير موجودة',
          actionFn: () => switchViewSection('rooms')
        });
      }
    }
  }

  // Prefix commands are placed at the very start of COMMAND_REGISTRY intentionally
  // to prioritize deterministic symbol shortcuts (#, @, !, r, ق) over natural language commands
  const COMMAND_REGISTRY = [
    {
      id: 'prefix-reservation',
      name: 'البحث السريع برقم الحجز',
      match: (norm) => {
        const m = norm.match(/^#\s*(.*)$/);
        if (m) {
          return { rawReservationQuery: (m[1] || '').trim() };
        }
        return null;
      },
      handle: (ctx, match) => {
        const raw = match?.rawReservationQuery;
        if (!raw) {
          ctx.results.push({
            category: '📋 البحث السريع برقم الحجز',
            icon: '📋',
            title: 'اكتب رقم الحجز بعد #',
            subtitle: 'مثال: #12 أو #105 لعرض ملف الحجز وفاتورته وسندات القبض والتمديد',
            badge: 'إرشاد'
          });
          return;
        }

        if (!/^\d+$/.test(raw)) {
          ctx.results.push({
            category: '📋 البحث السريع برقم الحجز',
            icon: '⚠️',
            title: 'رقم الحجز يجب أن يكون أرقاماً فقط',
            subtitle: 'أدخل رقم الحجز الصحيح (مثال: #12 أو #105)',
            badge: 'تنبيه'
          });
          return;
        }

        const resId = raw;
        const res = ctx.reservations.find(r => String(r.id) === resId);
        if (!res) {
          ctx.results.push({
            category: '📋 البحث السريع برقم الحجز',
            icon: '❓',
            title: `لا يوجد حجز برقم #${resId}`,
            subtitle: 'تأكد من رقم الحجز المدخل أو استعرض جدول الحجوزات',
            badge: 'غير موجود'
          });
          return;
        }

        const fin = getResFin(res, ctx.currentBizDate);

        // 1. Details item
        ctx.results.push({
          category: `📋 حجز #${res.id} • غرفة ${res.room_number || '-'}`,
          icon: '📋',
          title: `تفاصيل الحجز #${res.id} • ${res.guest_name || 'نزيل'} (غرفة ${res.room_number || '-'})`,
          subtitle: `الحالة: ${res.status} • الوصول: ${res.check_in_date || '-'} • المغادرة: ${res.check_out_date || '-'} • المتبقي: ${fin.remaining.toLocaleString('en-US')} ر.س`,
          badge: res.status,
          actionFn: () => {
            if (App?.Helpers?.openReservationPreview) {
              App.Helpers.openReservationPreview(res.id);
            } else {
              showMissingHelperToast();
            }
          }
        });

        // 2. Invoice item
        ctx.results.push({
          category: `📋 حجز #${res.id} • غرفة ${res.room_number || '-'}`,
          icon: '🧾',
          title: `فاتورة الحجز #${res.id}`,
          subtitle: `استعراض الفاتورة الضريبية والبنود المحسوبة (الإجمالي: ${fin.effectiveTotal.toLocaleString('en-US')} ر.س)`,
          badge: 'فاتورة ضريبية',
          actionFn: () => {
            if (window.openInvoiceModal) {
              window.openInvoiceModal(res.id);
            } else if (App?.Helpers?.openReservationPreview) {
              App.Helpers.openReservationPreview(res.id);
            } else {
              showMissingHelperToast();
            }
          }
        });

        // 3. Payment collection item (if remaining > 0)
        if (fin.remaining > 0.005) {
          ctx.results.push({
            category: `📋 حجز #${res.id} • غرفة ${res.room_number || '-'}`,
            icon: '💳',
            title: `تحصيل دفعة مالية • متبقي ${fin.remaining.toLocaleString('en-US')} ر.س`,
            subtitle: `تسجيل سند قبض لحساب النزيل (${res.guest_name || 'نزيل'})`,
            badge: 'سند قبض 💳',
            actionFn: () => {
              if (window.openAddPaymentModal) {
                window.openAddPaymentModal(res.id);
              } else if (App?.Helpers?.openReservationPreview) {
                App.Helpers.openReservationPreview(res.id);
              } else {
                showMissingHelperToast();
              }
            }
          });
        }

        // 4. Departure settlement (if confirmed)
        if (res.status === 'مؤكد') {
          ctx.results.push({
            category: `📋 حجز #${res.id} • غرفة ${res.room_number || '-'}`,
            icon: '🚪',
            title: `تسجيل مغادرة وتصفية الحساب • غرفة ${res.room_number || '-'}`,
            subtitle: `إنهاء إقامة النزيل وتسليم الغرفة`,
            badge: 'مغادرة',
            actionFn: () => {
              if (App?.Helpers?.openContractSettleModal) {
                App.Helpers.openContractSettleModal(res);
              } else if (App?.Helpers?.openReservationPreview) {
                App.Helpers.openReservationPreview(res.id);
              } else {
                showMissingHelperToast();
              }
            }
          });
        }

        // 5. Extend stay (if confirmed or monthly)
        if (res.status === 'مؤكد' || res.pricing_type === 'شهري') {
          ctx.results.push({
            category: `📋 حجز #${res.id} • غرفة ${res.room_number || '-'}`,
            icon: '📅',
            title: 'تمديد الإقامة وتحديث المغادرة',
            subtitle: `إضافة ليالٍ إضافية لحجز الغرفة ${res.room_number || '-'}`,
            badge: 'تمديد الإقامة',
            actionFn: () => {
              if (window.openExtendStayModal) {
                window.openExtendStayModal(res.id);
              } else {
                showMissingHelperToast();
              }
            }
          });
        }
      }
    },
    {
      id: 'prefix-guest',
      name: 'البحث السريع عن النزلاء',
      match: (norm) => {
        const m = norm.match(/^@\s*(.*)$/);
        if (m) {
          return { rawGuestQuery: (m[1] || '').trim() };
        }
        return null;
      },
      handle: (ctx, match) => {
        const query = match?.rawGuestQuery;
        if (!query) {
          ctx.results.push({
            category: '👤 البحث السريع عن النزلاء',
            icon: '👤',
            title: 'اكتب اسم أو جوال أو هوية النزيل بعد @',
            subtitle: 'مثال: @محمد أو @0500 للبحث المباشر في سجل النزلاء وإنشاء حجز فوري',
            badge: 'إرشاد'
          });
          return;
        }

        function computeScore(normTarget) {
          if (!normTarget) return 0;
          if (normTarget === query) return 100;
          if (normTarget.startsWith(query)) return 80;
          if (normTarget.split(' ').some(w => w.startsWith(query))) return 60;
          if (normTarget.includes(query)) return 40;
          return 0;
        }

        const guestMatches = [];
        ctx.guests.forEach(g => {
          const nameScore = computeScore(getEntityNormalizedField(g, 'name'));
          const phoneScore = computeScore(getEntityNormalizedField(g, 'phone'));
          const idScore = Math.max(
            computeScore(getEntityNormalizedField(g, 'id_number')),
            computeScore(getEntityNormalizedField(g, 'national_id'))
          );
          const maxScore = Math.max(nameScore, phoneScore, idScore);
          if (maxScore > 0) {
            guestMatches.push({ guest: g, score: maxScore });
          }
        });

        if (!guestMatches.length) {
          ctx.results.push({
            category: '👤 البحث السريع عن النزلاء',
            icon: '❓',
            title: `لم يتم العثور على نزيل يطابق "${query}"`,
            subtitle: 'تأكد من الاسم أو رقم الجوال أو الهوية المدخلة',
            badge: 'غير موجود'
          });
          return;
        }

        guestMatches.sort((a, b) => b.score - a.score).slice(0, 5).forEach(({ guest: g }) => {
          const isBanned = Boolean(g.is_banned || g.banned === 1 || g.status === 'محظور');

          // Item 1: Open guest file
          ctx.results.push({
            category: `👤 النزيل: ${g.name}`,
            icon: '👤',
            title: `فتح سجل النزيل • ${g.name}`,
            subtitle: `الجوال: ${g.phone || '-'} • الهوية: ${g.id_number || g.national_id || '-'} ${isBanned ? '• (محظور ⛔)' : ''}`,
            badge: isBanned ? 'محظور ⛔' : 'سجل النزيل',
            actionFn: () => {
              switchViewSection('guests');
              const searchInput = document.getElementById('search-guests');
              if (searchInput) {
                searchInput.value = g.name;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          });

          // Item 2: Create new reservation for this guest
          ctx.results.push({
            category: `👤 النزيل: ${g.name}`,
            icon: isBanned ? '⛔' : '➕',
            title: `إنشاء حجز جديد للنزيل • ${g.name}`,
            subtitle: isBanned ? 'تنبيه: النزيل مدرج في القائمة السوداء (يتطلب تأكيداً)' : 'فتح نموذج الحجز المباشر وتعبئة بيانات النزيل تلقائياً',
            badge: isBanned ? 'محظور ⚠️' : 'حجز جديد',
            actionFn: async () => {
              if (isBanned) {
                const showConfirm = App?.Helpers?.showConfirmDialog || window.showConfirmDialog;
                if (typeof showConfirm === 'function') {
                  const confirmed = await showConfirm({
                    title: 'تنبيه: نزيل في قائمة الحظر ⛔',
                    message: `النزيل (${g.name}) مدرج في القائمة السوداء للمحظورين. هل تريد المتابعة وفتح نموذج الحجز له على أي حال؟`,
                    confirmText: 'متابعة الحجز',
                    cancelText: 'إلغاء',
                    isDanger: true
                  });
                  if (!confirmed) return;
                }
              }

              const btnOpen = document.getElementById('btn-open-new-reservation-modal');
              if (btnOpen) btnOpen.click();

              setTimeout(() => {
                const phoneInput = document.getElementById('guest-phone');
                const nameInput = document.getElementById('guest-name');
                const idInput = document.getElementById('guest-id-number');

                if (phoneInput && g.phone) {
                  phoneInput.value = g.phone;
                  phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (nameInput && g.name) {
                  nameInput.value = g.name;
                  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (idInput && (g.id_number || g.national_id)) {
                  idInput.value = g.id_number || g.national_id;
                  idInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                if (App?.Helpers?.showToast) {
                  App.Helpers.showToast(`تم فتح نموذج الحجز وتعبئة بيانات النزيل: ${g.name}`, 'info');
                }
              }, 50);
            }
          });
        });
      }
    },
    {
      id: 'prefix-room',
      name: 'البحث السريع برقم الغرفة',
      match: (norm) => {
        // Match ! followed by anything (allowing validation inside handle)
        const mExcl = norm.match(/^!\s*(.*)$/);
        if (mExcl) return { rawRoomQuery: (mExcl[1] || '').trim() };

        // Match r or ق followed by digits or empty (prevent matching receipt, etc.)
        const mRQ = norm.match(/^(?:r|ق)\s*(\d*)$/);
        if (mRQ) return { rawRoomQuery: (mRQ[1] || '').trim() };

        return null;
      },
      handle: (ctx, match) => {
        const raw = match?.rawRoomQuery;
        if (!raw) {
          ctx.results.push({
            category: '🚪 الاستعلام السريع عن الغرفة',
            icon: '🚪',
            title: 'اكتب رقم الغرفة بعد ! أو r أو ق',
            subtitle: 'مثال: !206 أو r206 أو ق206 للاستعلام المباشر عن حالة الغرفة والنزيل والتسكين',
            badge: 'إرشاد'
          });
          return;
        }

        if (!/^\d{1,5}$/.test(raw)) {
          ctx.results.push({
            category: '🚪 الاستعلام السريع عن الغرفة',
            icon: '⚠️',
            title: 'رقم الغرفة يجب أن يتكون من أرقام فقط',
            subtitle: 'أدخل رقم الغرفة المطلوب (مثال: !206 أو r206)',
            badge: 'تنبيه'
          });
          return;
        }

        buildRoomActions(ctx, raw, { checkReservationId: false });
      }
    },
    {
      id: 'unpaid',
      name: 'المستحقات والديون المعلقة',
      match: (norm) => {
        return /^(?:مستحق|المستحق|ديون|الديون|مديوني|المديوني|غير\s+مدفوع|غير\s+مسدد|unpaid|debts|balances|outstanding)/i.test(norm) ||
          norm.includes('عليه فلوس') || norm.includes('عليه مبالغ') || norm.includes('ما دفع') ||
          norm.includes('مستحق') || norm.includes('مبالغ معلقه') || norm.includes('مبالغ معلقة') || norm.includes('باقي فلوس') ||
          norm.includes('مديون') || norm.includes('ديون');
      },
      handle: (ctx) => {
        const reservations = ctx.reservations;
        const unpaidItems = reservations
          .filter(r => r.status === 'مؤكد')
          .map(r => {
            const fin = getResFin(r, ctx.currentBizDate);
            return { res: r, balance: fin.remaining, total: fin.effectiveTotal, paid: fin.paid };
          })
          .filter(item => item.balance > 0.005)
          .sort((a, b) => b.balance - a.balance);

        if (unpaidItems.length > 0) {
          const totalDebt = unpaidItems.reduce((acc, cur) => acc + cur.balance, 0);
          ctx.results.push({
            category: `💳 المستحقات والمديونيات المعلقة (${unpaidItems.length} نزلاء)`,
            icon: '📊',
            title: `إجمالي المستحقات غير المسددة: ${totalDebt.toLocaleString('en-US')} ر.س`,
            subtitle: `يوجد ${unpaidItems.length} حجز نشط بمبالغ معلقة بحاجة للتحصيل`,
            badge: `${totalDebt.toLocaleString('en-US')} ر.س`,
            actionFn: () => openAttentionInboxModal('unpaid-balance')
          });

          unpaidItems.forEach(({ res: r, balance, total, paid }) => {
            ctx.results.push({
              category: '💳 نزلاء عليهم مبالغ معلقة',
              icon: '⚠️',
              title: `غرفة ${r.room_number || '-'} • ${r.guest_name || 'نزيل'} (متبقي: ${balance.toLocaleString('en-US')} ر.س)`,
              subtitle: `الجوال: ${r.guest_phone || '-'} • المسدد: ${paid.toLocaleString('en-US')} من ${total.toLocaleString('en-US')} ر.س • المغادرة: ${r.check_out_date || '-'}`,
              badge: `${balance.toLocaleString('en-US')} ر.س ⚠️`,
              actionFn: () => {
                if (window.openAddPaymentModal) {
                  window.openAddPaymentModal(r.id);
                } else if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(r.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          });
        } else {
          ctx.results.push({
            category: '💳 المستحقات والمديونيات',
            icon: '✓',
            title: 'لا توجد أي مبالغ معلقة أو غير مسددة!',
            subtitle: 'جميع الحجوزات النشطة تم سداد قيمتها بالكامل',
            badge: 'مسدد بالكامل ✓',
            actionFn: () => switchViewSection('reservations')
          });
        }
      }
    },
    {
      id: 'departures',
      name: 'مغادرات اليوم',
      match: (norm) => {
        return /^(?:مغادر|المغادر|خروج|الخروج|departures?|checkouts?)/i.test(norm) ||
          norm.includes('خارج اليوم') || norm.includes('بيخرج اليوم') || norm.includes('يخرج اليوم') ||
          norm.includes('مغادرات') || norm.includes('مغادره اليوم') || norm.includes('مغادرة اليوم') || norm.includes('خروج اليوم') ||
          norm.includes('leaving today');
      },
      handle: (ctx) => {
        const currentBizDate = ctx.currentBizDate;
        const departingStays = ctx.reservations.filter(r =>
          r.status === 'مؤكد' &&
          r.booking_type !== 'عقد مفتوح' &&
          String(r.check_out_date || '').slice(0, 10) === currentBizDate
        );
        const completedToday = ctx.attention.completedDeparturesToday || [];

        if (departingStays.length > 0 || completedToday.length > 0) {
          ctx.results.push({
            category: `🚪 مغادرات اليوم (${departingStays.length} بانتظار الإخلاء • ${completedToday.length} غادرت)`,
            icon: '🚪',
            title: `مغادرات تاريخ اليوم (${currentBizDate})`,
            subtitle: `متبقي ${departingStays.length} مغادرة مطلوبة • تم إنجاز ${completedToday.length} مغادرة بنجاح`,
            badge: `${departingStays.length} مطلوبة`,
            actionFn: () => openAttentionInboxModal('departures-today')
          });

          // Pending departures
          departingStays.forEach(r => {
            const fin = getResFin(r, currentBizDate);
            const balance = fin.remaining;
            const expectedTime = App?.Helpers?.getExpectedCheckoutTime ? App.Helpers.getExpectedCheckoutTime(r) : '14:00';
            ctx.results.push({
              category: '🚪 مغادرة مقررة اليوم (بانتظار الإخلاء)',
              icon: '🚪',
              title: `غرفة ${r.room_number || '-'} • النزيل: ${r.guest_name || 'نزيل'}`,
              subtitle: `موعد الإخلاء: ${expectedTime || '14:00'} • الجوال: ${r.guest_phone || '-'} • المتبقي: ${balance.toLocaleString('en-US')} ر.س ${balance > 0 ? '⚠️' : '✓'}`,
              badge: balance > 0 ? 'متبقي مالي' : 'جاهز للإخلاء',
              actionFn: () => {
                if (App?.Helpers?.openContractSettleModal) {
                  App.Helpers.openContractSettleModal(r);
                } else if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(r.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          });

          // Completed departures today
          completedToday.forEach(item => {
            const r = item.reservation;
            ctx.results.push({
              category: '🚪 تمت المغادرة اليوم بنجاح ✓',
              icon: '✓',
              title: `غرفة ${r.room_number || '-'} • النزيل: ${r.guest_name || 'نزيل'} (تمت المغادرة)`,
              subtitle: `تاريخ المغادرة: ${currentBizDate} • الحساب مصفى ومكتمل`,
              badge: 'مغادر ✓',
              actionFn: () => {
                if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(r.id);
                } else if (window.openInvoiceModal) {
                  window.openInvoiceModal(r.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          });
        } else {
          ctx.results.push({
            category: '🚪 مغادرات اليوم',
            icon: '✓',
            title: 'لا توجد مغادرات مقررة لليوم الحالي',
            subtitle: `تاريخ العمل الفندقي: ${currentBizDate}`,
            badge: 'لا توجد مغادرات',
            actionFn: () => switchViewSection('reservations')
          });
        }
      }
    },
    {
      id: 'late',
      name: 'النزلاء المتأخرون عن المغادرة',
      match: (norm) => {
        return /^(?:متاخر|المتاخر|متأخر|المتأخر|تاخير|التاخير|تأخير|التأخير|late|overdue)/i.test(norm) ||
          norm.includes('متاخر') || norm.includes('متأخر') || norm.includes('تاخير') || norm.includes('تأخير') || norm.includes('overdue');
      },
      handle: (ctx) => {
        const lateStays = ctx.reservations.filter(r =>
          r.status === 'مؤكد' &&
          r.booking_type !== 'عقد مفتوح' &&
          Boolean(App?.Helpers?.isLateCheckout && App.Helpers.isLateCheckout(r))
        );

        if (lateStays.length > 0) {
          ctx.results.push({
            category: `⚠️ النزلاء المتأخرون عن المغادرة (${lateStays.length})`,
            icon: '⚠️',
            title: `يوجد ${lateStays.length} نزيل تجاوزوا موعد الخروج المحدد`,
            subtitle: 'يجب التواصل معهم للتمديد أو تسليم الغرفة فوراً',
            badge: 'متأخرون ⚠️',
            actionFn: () => openAttentionInboxModal('late-checkout')
          });

          lateStays.forEach(r => {
            const fin = getResFin(r, ctx.currentBizDate);
            const balance = fin.remaining;
            ctx.results.push({
              category: '⚠️ نزيل متأخر',
              icon: '🔴',
              title: `غرفة ${r.room_number || '-'} • ${r.guest_name || 'نزيل'}`,
              subtitle: `تاريخ المغادرة السابق: ${r.check_out_date || '-'} • الجوال: ${r.guest_phone || '-'} • المتبقي: ${balance.toLocaleString('en-US')} ر.س`,
              badge: 'تجاوز المغادرة ⚠️',
              actionFn: () => {
                if (App?.Helpers?.openContractSettleModal) {
                  App.Helpers.openContractSettleModal(r);
                } else if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(r.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          });
        } else {
          ctx.results.push({
            category: '⚠️ النزلاء المتأخرون',
            icon: '✓',
            title: 'لا يوجد أي نزلاء متأخرين عن المغادرة حالياً',
            subtitle: 'جميع الإقامات منتظمة وفق جداول المغادرة',
            badge: 'منضبط ✓',
            actionFn: () => switchViewSection('reservations')
          });
        }
      }
    },
    {
      id: 'available',
      name: 'الغرف المتاحة',
      match: (norm) => {
        const hasDigits = /\d+/.test(norm);
        return !hasDigits && (
          /^(?:فاضي|الفاضي|فاضيه|الفاضيه|فاضية|الفاضية|متاح|المتاح|متاحه|المتاحه|متاحة|المتاحة|شاغر|الشاغر|شاغره|الشاغره|شاغرة|الشاغرة|available|vacant)/i.test(norm) ||
          norm.includes('فاضي') || norm.includes('فاضيه') || norm.includes('فاضية') || norm.includes('متاح') || norm.includes('شاغر') || norm.includes('vacant')
        );
      },
      handle: (ctx) => {
        const availRooms = ctx.rooms.filter(r => r.status === 'متاحة');
        if (availRooms.length > 0) {
          ctx.results.push({
            category: `🟢 الغرف المتاحة للتشغيل (${availRooms.length} غرف)`,
            icon: '🟢',
            title: `عدد الغرف الشاغرة الجاهزة: ${availRooms.length} غرفة`,
            subtitle: 'انقر على أي غرفة لبدء تسكين فوري',
            badge: `${availRooms.length} شاغرة`,
            actionFn: () => switchViewSection('rooms')
          });

          availRooms.forEach(r => {
            ctx.results.push({
              category: '🟢 غرفة متاحة للتسكين',
              icon: '🟢',
              title: `غرفة ${r.room_number} (${r.type || 'عادية'}) • الطابق ${r.floor || '1'}`,
              subtitle: `السعر: ${Number(r.price_per_night || 0).toLocaleString('en-US')} ر.س/ليلة • جاهزة للتسكين الفوري`,
              badge: 'تسكين ➕',
              actionFn: () => {
                if (App?.Helpers?.initiateRoomBooking) {
                  App.Helpers.initiateRoomBooking(r.id);
                } else {
                  switchViewSection('rooms');
                }
              }
            });
          });
        } else {
          ctx.results.push({
            category: '🟢 الغرف المتاحة',
            icon: 'ℹ️',
            title: 'لا توجد غرف شاغرة متاحة حالياً!',
            subtitle: 'نسبة الإشغال 100% أو الغرف تحت التنظيف والصيانة',
            badge: 'ممتلئ',
            actionFn: () => switchViewSection('rooms')
          });
        }
      }
    },
    {
      id: 'occupied',
      name: 'الغرف المشغولة',
      match: (norm) => {
        const hasDigits = /\d+/.test(norm);
        return !hasDigits && (
          /^(?:مشغول|المشغول|مشغوله|المشغوله|مشغولة|المشغولة|ساكن|الساكن|ساكنين|الساكنين|occupied|in-house)/i.test(norm) ||
          norm.includes('مشغول') || norm.includes('ساكنين') || (norm.includes('ساكن') && !norm.includes('تسكين')) || norm.includes('occupied')
        );
      },
      handle: (ctx) => {
        const occRooms = ctx.rooms.filter(r => r.status === 'مشغولة' || r.status === 'محجوزة');
        if (occRooms.length > 0) {
          ctx.results.push({
            category: `🔴 الغرف المشغولة والمحجوزة (${occRooms.length} غرف)`,
            icon: '🔴',
            title: `إجمالي الغرف المسكونة والمحجوزة: ${occRooms.length} غرفة`,
            subtitle: 'استعراض النزلاء المقيمين وتفاصيل الإقامة',
            badge: `${occRooms.length} مسكونة`,
            actionFn: () => switchViewSection('rooms')
          });

          occRooms.forEach(room => {
            const activeRes = ctx.reservations.find(r => (r.room_id === room.id || String(r.room_number) === String(room.room_number)) && r.status === 'مؤكد');
            ctx.results.push({
              category: '🔴 غرفة مشغولة',
              icon: '🔴',
              title: `غرفة ${room.room_number} • النزيل: ${activeRes ? activeRes.guest_name : 'نزيل مقيم'}`,
              subtitle: activeRes ? `الجوال: ${activeRes.guest_phone || '-'} • المغادرة: ${activeRes.check_out_date || 'مفتوح'}` : `حالة الغرفة: ${room.status}`,
              badge: room.status,
              actionFn: () => {
                if (activeRes && App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(activeRes.id);
                } else {
                  switchViewSection('rooms');
                }
              }
            });
          });
        } else {
          ctx.results.push({
            category: '🔴 الغرف المشغولة',
            icon: 'ℹ️',
            title: 'لا توجد غرف مشغولة حالياً',
            subtitle: 'الفندق خالٍ من النزلاء حالياً',
            badge: 'فارغ',
            actionFn: () => switchViewSection('rooms')
          });
        }
      }
    },
    {
      id: 'cleaning',
      name: 'غرف النظافة',
      match: (norm) => {
        return /^(?:نظافه|النظافه|نظافة|النظافة|تنظيف|التنظيف|cleaning|dirty)(?:\s|$)/i.test(norm) ||
          norm.includes('نظافه') || norm.includes('نظافة') || norm.includes('تنظيف') || norm.includes('cleaning');
      },
      handle: (ctx) => {
        if (ctx.attention.dirtyRooms.length > 0) {
          ctx.attention.dirtyRooms.forEach(item => {
            ctx.results.push({
              category: '🧹 غرف بانتظار النظافة',
              icon: '🧹',
              title: `غرفة ${item.room.room_number} (${item.room.type || 'عادية'})`,
              subtitle: `الطابق: ${item.room.floor || '1'} • انقر لتأكيد انتهاء التنظيف واكتمال الجاهزية`,
              badge: 'تنظيف',
              actionFn: () => requestRoomCleaningCompletion(item.room)
            });
          });
        } else {
          ctx.results.push({
            category: '🧹 حالة النظافة',
            icon: '✓',
            title: 'جميع الغرف نظيفة ومتاحة!',
            subtitle: 'لا توجد أي غرف بحالة "تنظيف" حالياً',
            badge: 'ممتاز ✓',
            actionFn: () => switchViewSection('rooms')
          });
        }
      }
    },
    {
      id: 'booking',
      name: 'حجز وتسكين',
      match: (norm) => {
        const m = norm.match(/^(?:تسكين|حجز|booking|checkin)\s*(?:(?:غرف[هة]|الغرف[هة])\s+)?(\d{1,5})?/i);
        if (m) {
          return { roomNumber: m[1] ? normalizeDigits(m[1]) : null };
        }
        return null;
      },
      handle: (ctx, match) => {
        const roomNum = match?.roomNumber;
        if (roomNum) {
          const room = ctx.rooms.find(r => String(r.room_number) === roomNum || String(r.id) === roomNum);
          const activeRes = ctx.reservations.find(r =>
            ((room && r.room_id === room.id) || String(r.room_number) === roomNum) &&
            r.status === 'مؤكد'
          );

          if (!room && !activeRes) {
            ctx.results.push({
              category: '🎯 إجراء تسكين وحجز',
              icon: '❓',
              title: `الغرفة رقم ${roomNum} غير موجودة في النظام`,
              subtitle: 'لا يمكن تسكين غرفة غير معرفة. يرجى التأكد من رقم الغرفة أو مراجعة قائمة الغرف.',
              badge: 'غير موجودة',
              actionFn: () => switchViewSection('rooms')
            });
            return;
          }

          if (activeRes || (room && (room.status === 'مشغولة' || room.status === 'محجوزة'))) {
            const guestName = activeRes ? activeRes.guest_name : 'نزيل مقيم';
            ctx.results.push({
              category: '🎯 حالة الغرفة وتسكينها',
              icon: '🔴',
              title: `الغرفة ${roomNum} مشغولة حالياً بالنزيل (${guestName})`,
              subtitle: 'لا يمكن إنشاء تسكين جديد على غرفة مشغولة. انقر لاستعراض تفاصيل الإقامة والحساب.',
              badge: 'مشغولة',
              actionFn: () => {
                if (activeRes && App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(activeRes.id);
                } else {
                  switchViewSection('rooms');
                }
              }
            });
            return;
          }

          if (room && room.status === 'تنظيف') {
            ctx.results.push({
              category: '🎯 حالة الغرفة وتسكينها',
              icon: '🧹',
              title: `الغرفة ${roomNum} تحت التنظيف حالياً`,
              subtitle: 'الغرفة بانتظار إشعار عمال النظافة. انقر لتأكيد الجاهزية أو الانتقال لخريطة الغرف.',
              badge: 'تنظيف',
              actionFn: () => requestRoomCleaningCompletion(room)
            });
            return;
          }

          if (room && room.status === 'صيانة') {
            ctx.results.push({
              category: '🎯 حالة الغرفة وتسكينها',
              icon: '🛠️',
              title: `الغرفة ${roomNum} خارج الخدمة (تحت الصيانة)`,
              subtitle: 'لا يمكن تسكين الغرفة حتى انتهاء أعمال الصيانة.',
              badge: 'صيانة',
              actionFn: () => switchViewSection('rooms')
            });
            return;
          }

          // Vacant room -> immediate booking
          ctx.results.push({
            category: '🎯 إجراء تسكين وحجز',
            icon: '➕',
            title: `تسكين غرفة ${roomNum} مباشرة`,
            subtitle: `الغرفة متاحة للتشغيل (${room?.type || 'عادية'} • السعر: ${Number(room?.price_per_night || 0).toLocaleString('en-US')} ر.س)`,
            badge: 'تسكين فوري',
            actionFn: () => {
              if (room && App?.Helpers?.initiateRoomBooking) {
                App.Helpers.initiateRoomBooking(room.id);
              } else {
                const btn = document.getElementById('btn-open-new-reservation-modal');
                if (btn) btn.click();
              }
            }
          });
        } else {
          ctx.results.push({
            category: '🎯 إجراء تسكين وحجز',
            icon: '➕',
            title: 'تسجيل حجز أو تسكين جديد',
            subtitle: 'فتح نموذج التسكين واختيار الغرفة والنزيل (F2)',
            badge: 'حجز جديد',
            actionFn: () => {
              const btn = document.getElementById('btn-open-new-reservation-modal');
              if (btn) btn.click();
            }
          });
        }
      }
    },
    {
      id: 'shift',
      name: 'تقرير الوردية والخزينة',
      match: (norm) => {
        return /^(?:فلوس|كاش|نقديه|نقدية|درج|الدرج|ورديه|وردية|الورديه|الوردية|خزينه|خزينة|الخزينه|الخزينة|audit|shift|cash|drawer)(?:\s|$)/i.test(norm) ||
          norm.includes('درج') || norm.includes('ورديه') || norm.includes('وردية') || norm.includes('خزينه') || norm.includes('خزينة') || norm.includes('كاش');
      },
      handle: (ctx) => {
        const currentUserRole = App?.State?.currentUser?.role || (typeof localStorage !== 'undefined' ? localStorage.getItem('currentUserRole') : null);
        const isAdmin = currentUserRole === 'Admin';

        ctx.results.push({
          category: '💵 الخزينة والسيولة',
          icon: '💵',
          title: 'عرض تقرير إقفال الوردية والموازنة المالية (Shift Audit)',
          subtitle: isAdmin
            ? 'حساب النقدية المقبوضة، الشبكة، رصيد الدرج، والمصروفات'
            : 'يتطلب صلاحية مدير النظام (Admin) للاطلاع على التقرير التفصيلي',
          badge: isAdmin ? 'تقرير الوردية' : 'مدير النظام فقط 🔒',
          actionFn: () => {
            if (!isAdmin) {
              if (App?.Helpers?.showToast) {
                App.Helpers.showToast('تقرير الوردية التفصيلي متاح لمدير النظام فقط (Admin).', 'warning');
              }
              return;
            }
            if (typeof window.openShiftAuditModal === 'function') {
              window.openShiftAuditModal();
            } else {
              showMissingHelperToast();
            }
          }
        });

        ctx.results.push({
          category: '💵 الخزينة والسيولة',
          icon: '📊',
          title: 'لوحة التحكم والتحليلات المالية',
          subtitle: 'إجمالي إيرادات الشهر والوردية الحالية',
          badge: 'المؤشرات',
          actionFn: () => switchViewSection('overview')
        });
      }
    },
    {
      id: 'whatsapp',
      name: 'مراسلة واتساب',
      match: (norm) => {
        const m = norm.match(/^(?:واتساب|واتس|whatsapp|رسال[هة])\s*(?:(?:غرف[هة]|الغرف[هة])\s+)?(.+)?/i);
        if (m) {
          const target = m[1]?.trim() ? normalizeDigits(m[1].trim()) : null;
          return { target };
        }
        return null;
      },
      handle: (ctx, match) => {
        const target = match?.target;
        let matchedReservations = [];

        if (target) {
          matchedReservations = ctx.reservations.filter(r =>
            r.status === 'مؤكد' && (
              String(r.room_number) === target ||
              normalize(r.guest_name || '').includes(normalize(target))
            )
          );
        } else {
          matchedReservations = ctx.reservations.filter(r => r.status === 'مؤكد' && r.guest_phone).slice(0, 5);
        }

        if (matchedReservations.length > 0) {
          const isWelcome = ctx.rawQuery && /ترحيب|welcome/i.test(ctx.rawQuery);
          const isInvoice = ctx.rawQuery && /فاتور|invoice/i.test(ctx.rawQuery);
          const templateName = isWelcome ? 'رسالة ترحيبية' : (isInvoice ? 'بيانات الفاتورة' : 'محادثة سريعة');

          matchedReservations.forEach(r => {
            ctx.results.push({
              category: '💬 مراسلة واتساب فورية',
              icon: '💬',
              title: `واتساب (${templateName}) • ${r.guest_name || 'نزيل'} (غرفة ${r.room_number || '-'})`,
              subtitle: `رقم الجوال: ${r.guest_phone || 'غير مسجل'} • تاريخ المغادرة: ${r.check_out_date || '-'}`,
              badge: isWelcome ? 'ترحيب 👋' : (isInvoice ? 'فاتورة 🧾' : 'WhatsApp'),
              actionFn: () => {
                if (window.sendReservationWhatsApp) {
                  window.sendReservationWhatsApp(r.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          });
        } else {
          ctx.results.push({
            category: '💬 مراسلة واتساب',
            icon: '❓',
            title: `لا يوجد نزيل مطابق للبحث "${target || ''}" مع رقم جوال نشط`,
            subtitle: 'تأكد من رقم الغرفة أو اسم النزيل المدخل',
            badge: 'غير متوفر'
          });
        }
      }
    },
    {
      id: 'extend',
      name: 'تمديد إقامة النزيل',
      match: (norm) => {
        const m = norm.match(/^(?:تمديد|extend)(?:\s+(?:حجز|اقام[هة]))?\s*(?:(?:غرف[هة]|الغرف[هة]|حجز)\s+)*(\d{1,5})?/i);
        if (m) {
          return { roomNumber: m[1] ? normalizeDigits(m[1]) : null };
        }
        return null;
      },
      handle: (ctx, match) => {
        const roomNum = match?.roomNumber;
        if (roomNum) {
          const activeRes = ctx.reservations.find(r =>
            (String(r.room_number) === roomNum || String(r.id) === roomNum) &&
            r.status === 'مؤكد'
          );
          if (activeRes) {
            ctx.results.push({
              category: '📅 تمديد الإقامة',
              icon: '📅',
              title: `تمديد إقامة النزيل: ${activeRes.guest_name || 'نزيل'} • غرفة ${activeRes.room_number || '-'}`,
              subtitle: `المغادرة المقررة: ${activeRes.check_out_date || '-'} • فتح نافذة التمديد واحتساب الليالي`,
              badge: 'تمديد فوري 📅',
              actionFn: () => {
                if (window.openExtendStayModal) {
                  window.openExtendStayModal(activeRes.id);
                } else if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(activeRes.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          } else {
            ctx.results.push({
              category: '📅 تمديد الإقامة',
              icon: '❓',
              title: `لا يوجد حجز مؤكد للغرفة ${roomNum} لتمديد إقامته`,
              subtitle: 'تأكد من رقم الغرفة أو وجود حجز نشط في النظام',
              badge: 'غير متاح',
              actionFn: () => switchViewSection('reservations')
            });
          }
        } else {
          ctx.results.push({
            category: '📅 تمديد الإقامة',
            icon: '📅',
            title: 'تمديد إقامة حجز نشط',
            subtitle: 'حدد رقم الغرفة لتمديد الحجز فوراً (مثال: "تمديد 104")',
            badge: 'تمديد',
            actionFn: () => switchViewSection('reservations')
          });
        }
      }
    },
    {
      id: 'invoice',
      name: 'معاينة وطباعة الفاتورة',
      match: (norm) => {
        const m = norm.match(/^(?:فاتور[هة]|الفاتور[هة]|طباع[هة]\s+فاتور[هة]|invoice)\s*(?:(?:غرف[هة]|الغرف[هة]|حجز)\s+)*(\d{1,5})?/i);
        if (m) {
          return { targetNumber: m[1] ? normalizeDigits(m[1]) : null };
        }
        return null;
      },
      handle: (ctx, match) => {
        const target = match?.targetNumber;
        if (target) {
          const res = ctx.reservations.find(r =>
            String(r.id) === target || String(r.room_number) === target
          );
          if (res) {
            ctx.results.push({
              category: '🧾 الفواتير والمستندات',
              icon: '🧾',
              title: `معاينة الفاتورة الضريبية • غرفة ${res.room_number || '-'}`,
              subtitle: `النزيل: ${res.guest_name || 'نزيل'} • حجز #${res.id} • الإجمالي: ${Number(res.total_price || 0).toLocaleString('en-US')} ر.س`,
              badge: 'فاتورة ضريبية 🧾',
              actionFn: () => {
                if (window.openInvoiceModal) {
                  window.openInvoiceModal(res.id);
                } else if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(res.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          } else {
            ctx.results.push({
              category: '🧾 الفواتير والمستندات',
              icon: '❓',
              title: `لم يتم العثور على حجز أو غرفة بالرقم "${target}" لإصدار الفاتورة`,
              subtitle: 'تأكد من رقم الحجز أو رقم الغرفة المدخل',
              badge: 'غير موجود'
            });
          }
        } else {
          ctx.results.push({
            category: '🧾 الفواتير والمستندات',
            icon: '🧾',
            title: 'إصدار ومعاينة الفاتورة الضريبية',
            subtitle: 'حدد رقم الغرفة أو الحجز (مثال: "فاتورة 202" أو "فاتورة 58")',
            badge: 'الفواتير',
            actionFn: () => switchViewSection('reservations')
          });
        }
      }
    },
    {
      id: 'voucher',
      name: 'سند قبض وتحصيل دفعة',
      match: (norm) => {
        const m = norm.match(/^(?:سند(?:\s+قبض)?|قبض|تحصيل|دفع[هة]?|سداد|receipt|payment|pay)(?=\s|\d|$)\s*(?:(?:غرف[هة]|الغرف[هة]|حجز)\s*)*(\d{1,5})?$/i);
        if (m) {
          return { targetNumber: m[1] ? normalizeDigits(m[1]) : null };
        }
        return null;
      },
      handle: (ctx, match) => {
        const target = match?.targetNumber;
        if (target) {
          const res = ctx.reservations.find(r =>
            (String(r.id) === target || String(r.room_number) === target) && r.status === 'مؤكد'
          );
          if (res) {
            const fin = getResFin(res, ctx.currentBizDate);
            ctx.results.push({
              category: '💳 سندات القبض والتحصيل',
              icon: '💳',
              title: `تحصيل دفعة وتسجيل سند قبض • غرفة ${res.room_number || '-'}`,
              subtitle: `النزيل: ${res.guest_name || 'نزيل'} • المتبقي: ${fin.remaining.toLocaleString('en-US')} ر.س من ${fin.effectiveTotal.toLocaleString('en-US')} ر.س`,
              badge: 'سند قبض 💳',
              actionFn: () => {
                if (window.openAddPaymentModal) {
                  window.openAddPaymentModal(res.id);
                } else if (App?.Helpers?.openReservationPreview) {
                  App.Helpers.openReservationPreview(res.id);
                } else {
                  showMissingHelperToast();
                }
              }
            });
          } else {
            ctx.results.push({
              category: '💳 سندات القبض والتحصيل',
              icon: '❓',
              title: `لا يوجد حجز مؤكد للغرفة أو الرقم "${target}" لتسجيل سند قبض`,
              subtitle: 'تأكد من رقم الغرفة أو حالة الحجز',
              badge: 'غير متاح'
            });
          }
        } else {
          ctx.results.push({
            category: '💳 سندات القبض والتحصيل',
            icon: '💳',
            title: 'تسجيل سند قبض ودفعات سداد',
            subtitle: 'حدد رقم الغرفة لتحصيل دفعة (مثال: "قبض 103" أو "سند 103")',
            badge: 'سند قبض',
            actionFn: () => openAttentionInboxModal('unpaid-balance')
          });
        }
      }
    },
    {
      id: 'floor',
      name: 'تصفية الغرف حسب الطابق',
      match: (norm) => {
        const m = norm.match(/^(?:الدور|طابق|الطابق|floor)\s*(\d{1,2}|الاول|الأول|الثاني|الثالث|الرابع|الخامس)?/i);
        if (m) {
          let fl = m[1];
          if (fl === 'الاول' || fl === 'الأول') fl = '1';
          else if (fl === 'الثاني') fl = '2';
          else if (fl === 'الثالث') fl = '3';
          else if (fl === 'الرابع') fl = '4';
          else if (fl === 'الخامس') fl = '5';
          return { floor: fl ? normalizeDigits(fl) : null };
        }
        return null;
      },
      handle: (ctx, match) => {
        const floor = match?.floor;
        if (floor) {
          const floorRooms = ctx.rooms.filter(r => String(r.floor) === String(floor));
          const availableCount = floorRooms.filter(r => r.status === 'متاحة').length;
          const occupiedCount = floorRooms.filter(r => r.status === 'مشغولة' || r.status === 'محجوزة').length;

          ctx.results.push({
            category: '🏢 تصفية الغرف بالطابق',
            icon: '🏢',
            title: `استعراض غرف الطابق ${floor} (${floorRooms.length} غرف)`,
            subtitle: `${availableCount} غرف متاحة • ${occupiedCount} غرف مسكونة ومحجوزة`,
            badge: `الطابق ${floor}`,
            actionFn: () => {
              switchViewSection('rooms');
              const filterSelect = document.getElementById('filter-floor') || document.getElementById('search-rooms');
              if (filterSelect) {
                if (filterSelect.tagName === 'SELECT') {
                  filterSelect.value = floor;
                  filterSelect.dispatchEvent(new Event('change'));
                } else {
                  filterSelect.value = `طابق ${floor}`;
                  filterSelect.dispatchEvent(new Event('input'));
                }
              }
            }
          });
        } else {
          ctx.results.push({
            category: '🏢 تصفية الغرف بالطابق',
            icon: '🏢',
            title: 'استعراض خريطة الغرف حسب الطوابق',
            subtitle: 'اكتب "طابق 1" أو "الدور الثاني" لفرز الغرف فوراً',
            badge: 'خريطة الأدوار',
            actionFn: () => switchViewSection('rooms')
          });
        }
      }
    },
    {
      id: 'blacklist',
      name: 'قائمة النزلاء المحظورين',
      match: (norm) => {
        return /^(?:محظور|المحظور|المحظورين|بلاك\s*ليست|قا[يئ]م[هة]\s+الحظر|blacklist|banned)/i.test(norm) ||
          norm.includes('محظور') || norm.includes('بلاك ليست') || norm.includes('الحظر') || norm.includes('حظر');
      },
      handle: (ctx) => {
        const bannedGuests = ctx.guests.filter(g => g.is_banned);
        ctx.results.push({
          category: '⛔ النزلاء المحظورون أمنياً',
          icon: '⛔',
          title: `قائمة النزلاء المحظورين (${bannedGuests.length} مسجلين)`,
          subtitle: `استعراض ملفات وأرقام هويات النزلاء الممنوعين من التسكين`,
          badge: `${bannedGuests.length} محظور ⛔`,
          actionFn: () => {
            switchViewSection('guests');
            const searchInput = document.getElementById('search-guests');
            if (searchInput) {
              searchInput.value = 'محظور';
              searchInput.dispatchEvent(new Event('input'));
            }
          }
        });
      }
    },
    {
      id: 'backup',
      name: 'النسخ الاحتياطي الفوري',
      match: (norm) => {
        return /^(?:نسخ[هة]\s+احتياطي[هة]|النسخ[هة]\s+الاحتياطي[هة]|باك\s*اب|باكاب|backup)/i.test(norm) ||
          norm.includes('احتياطيه') || norm.includes('احتياطية') || norm.includes('باك اب');
      },
      handle: (ctx) => {
        ctx.results.push({
          category: '💾 النسخ الاحتياطي والأمان',
          icon: '💾',
          title: 'إنشاء وحفظ نسخة احتياطية فورية (Daily Backup)',
          subtitle: 'تصدير نسخة كاملة لقاعدة بيانات الفندق وحفظها بأمان',
          badge: 'نسخ احتياطي 💾',
          actionFn: () => {
            if (typeof window.openDailyBackupModal === 'function') {
              window.openDailyBackupModal();
            } else {
              showMissingHelperToast();
            }
          }
        });
      }
    },
    {
      id: 'room-inquiry',
      name: 'استعلام الغرفة',
      match: (norm) => {
        const m = norm.match(/^(?:(?:مين\s+(?:في\s+|ساكن\s+(?:في\s+)?)?|من\s+في\s+)?(?:غرف[هة]\s*|الغرف[هة]\s*|رقم\s*)?|رقم\s*)?(\d{1,5})(?:\s*؟|\s*\?|\s*$)/i);
        if (m && m[1]) {
          return { roomNumber: normalizeDigits(m[1]) };
        }
        return null;
      },
      handle: (ctx, match) => {
        const roomNum = match?.roomNumber;
        buildRoomActions(ctx, roomNum, { checkReservationId: true });
      }
    }
  ];

  function matchIntentFromNormalizedText(norm, rawQuery) {
    if (!norm) return { type: 'empty' };

    for (const cmd of COMMAND_REGISTRY) {
      const matchResult = cmd.match(norm);
      if (matchResult) {
        const intentType = cmd.id === 'room-inquiry' ? 'room-inquiry' : `${cmd.id}-intent`;
        return {
          type: intentType,
          commandId: cmd.id,
          matchResult: typeof matchResult === 'object' ? matchResult : {},
          originalQuery: rawQuery,
          ...(typeof matchResult === 'object' ? matchResult : {})
        };
      }
    }

    return {
      type: 'search',
      query: norm,
      originalQuery: rawQuery
    };
  }

  function parseCommandIntent(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) {
      return { type: 'empty' };
    }

    const norm = normalize(query);
    const parsed = matchIntentFromNormalizedText(norm, query);
    if (parsed.type !== 'search') {
      return parsed;
    }

    if (/[a-zA-Z]/.test(query)) {
      const transliterated = transliterateEnToAr(query);
      const normTrans = normalize(transliterated);
      const transliteratedParsed = matchIntentFromNormalizedText(normTrans, query);
      if (transliteratedParsed.type !== 'search') {
        return transliteratedParsed;
      }
      return {
        type: 'search',
        query: norm,
        transliterated: normTrans,
        originalQuery: query
      };
    }

    return parsed;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. RANKED MULTI-ENTITY SEARCH
  // ─────────────────────────────────────────────────────────────────────────────

  function searchMultiEntity(normQuery, transliterated, ctx) {
    const q = normQuery || '';
    const trans = transliterated || '';

    function computeMatchScore(normTarget) {
      if (!normTarget || (!q && !trans)) return 0;

      let score = 0;
      const queries = [q, trans].filter(Boolean);

      for (const curQ of queries) {
        if (normTarget === curQ) {
          score = Math.max(score, 100);
        } else if (normTarget.startsWith(curQ)) {
          score = Math.max(score, 80);
        } else if (normTarget.split(' ').some(w => w.startsWith(curQ))) {
          score = Math.max(score, 60);
        } else if (normTarget.includes(curQ)) {
          score = Math.max(score, 40);
        }
      }
      return score;
    }

    // 1. Rooms
    const roomMatches = [];
    ctx.rooms.forEach(r => {
      const numScore = computeMatchScore(getEntityNormalizedField(r, 'room_number'));
      const typeScore = computeMatchScore(getEntityNormalizedField(r, 'type'));
      const statusScore = computeMatchScore(getEntityNormalizedField(r, 'status'));
      const maxScore = Math.max(numScore * 1.2, typeScore, statusScore);
      if (maxScore > 0) {
        roomMatches.push({ room: r, score: maxScore });
      }
    });

    roomMatches.sort((a, b) => b.score - a.score).slice(0, 5).forEach(({ room: r }) => {
      ctx.results.push({
        category: '🚪 الغرف والوحدات',
        icon: r.status === 'متاحة' ? '🟢' : (r.status === 'مشغولة' ? '🔴' : '🧹'),
        title: `غرفة ${r.room_number} • ${r.type || 'عادية'}`,
        subtitle: `الحالة: ${r.status} • السعر: ${Number(r.price_per_night || 0).toLocaleString('en-US')} ر.س/ليلة`,
        badge: r.status,
        actionFn: () => {
          switchViewSection('rooms');
          const searchInput = document.getElementById('search-rooms');
          if (searchInput) {
            searchInput.value = r.room_number;
            searchInput.dispatchEvent(new Event('input'));
          }
        }
      });
    });

    // 2. Reservations
    const resMatches = [];
    ctx.reservations.forEach(r => {
      const idScore = computeMatchScore(getEntityNormalizedField(r, 'id'));
      const roomScore = computeMatchScore(getEntityNormalizedField(r, 'room_number'));
      const nameScore = computeMatchScore(getEntityNormalizedField(r, 'guest_name'));
      const phoneScore = computeMatchScore(getEntityNormalizedField(r, 'guest_phone'));
      const maxScore = Math.max(idScore * 1.5, roomScore, nameScore, phoneScore);
      if (maxScore > 0) {
        resMatches.push({ res: r, score: maxScore });
      }
    });

    resMatches.sort((a, b) => b.score - a.score).slice(0, 5).forEach(({ res: r }) => {
      ctx.results.push({
        category: '📋 الحجوزات',
        icon: '📋',
        title: `حجز #${r.id} • ${r.guest_name || 'نزيل'} (غرفة ${r.room_number || '-'})`,
        subtitle: `الحالة: ${r.status} • الوصول: ${r.check_in_date || '-'} • المغادرة: ${r.check_out_date || '-'}`,
        badge: r.status,
        actionFn: () => {
          if (App?.Helpers?.openReservationPreview) {
            App.Helpers.openReservationPreview(r.id);
          } else {
            showMissingHelperToast();
          }
        }
      });
    });

    // 3. Guests
    const guestMatches = [];
    ctx.guests.forEach(g => {
      const nameScore = computeMatchScore(getEntityNormalizedField(g, 'name'));
      const phoneScore = computeMatchScore(getEntityNormalizedField(g, 'phone'));
      const idScore = Math.max(
        computeMatchScore(getEntityNormalizedField(g, 'id_number')),
        computeMatchScore(getEntityNormalizedField(g, 'national_id'))
      );
      const maxScore = Math.max(nameScore, phoneScore, idScore);
      if (maxScore > 0) {
        guestMatches.push({ guest: g, score: maxScore });
      }
    });

    guestMatches.sort((a, b) => b.score - a.score).slice(0, 5).forEach(({ guest: g }) => {
      ctx.results.push({
        category: '👤 قائمة النزلاء',
        icon: '👤',
        title: `النزيل: ${g.name}`,
        subtitle: `الجوال: ${g.phone || '-'} • الهوية: ${g.id_number || '-'} ${g.is_banned ? '• (محظور ⛔)' : ''}`,
        badge: g.is_banned ? 'محظور' : 'نشط',
        actionFn: () => {
          switchViewSection('guests');
          const searchInput = document.getElementById('search-guests');
          if (searchInput) {
            searchInput.value = g.name;
            searchInput.dispatchEvent(new Event('input'));
          }
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. COMMAND PALETTE UI CONTROLLER
  // ─────────────────────────────────────────────────────────────────────────────

  let paletteModal = null;
  let paletteInput = null;
  let paletteResults = null;
  let paletteCountLabel = null;
  let currentSelectedIndex = -1;
  let currentItemsList = [];
  let previouslyFocusedElement = null;
  let searchDebounceTimer = null;

  function ensurePaletteElements() {
    if (paletteModal) return;
    paletteModal = document.getElementById('command-palette-modal');
    paletteInput = document.getElementById('command-palette-input');
    paletteResults = document.getElementById('command-palette-results');
    paletteCountLabel = document.getElementById('command-palette-results-count');

    if (!paletteModal) return;

    // Close on backdrop click
    paletteModal.addEventListener('click', event => {
      if (event.target === paletteModal) closeCommandPalette();
    });

    // Trap focus inside modal
    paletteModal.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        trapModalFocus(event, paletteModal);
      }
    });

    // Close on hint close buttons
    const closeBtn = paletteModal.querySelector('[data-command-palette-close]');
    if (closeBtn) closeBtn.addEventListener('click', closeCommandPalette);

    // Click on suggestion chips
    paletteModal.querySelectorAll('.command-palette-hint-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.dataset.query || chip.textContent.trim();
        if (paletteInput) {
          paletteInput.value = query;
          paletteInput.focus();
          handlePaletteSearch(query);
        }
      });
    });

    // Input listening with 100ms debounce
    paletteInput.addEventListener('input', e => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        handlePaletteSearch(e.target.value);
      }, 100);
    });

    // Keyboard navigation
    paletteInput.addEventListener('keydown', handlePaletteKeydown);
  }

  function trapModalFocus(event, modalContainer) {
    const focusableSelectors = 'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(modalContainer.querySelectorAll(focusableSelectors));
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function openCommandPalette(initialQuery = '') {
    ensurePaletteElements();
    if (!paletteModal) return;

    previouslyFocusedElement = document.activeElement;

    // Refresh database cache in background
    syncDataFromDb();

    // Refresh session attention cache and rebuild search index
    paletteAttentionCache = computeAttentionInbox();
    buildSearchIndex();

    paletteModal.style.display = 'flex';
    paletteInput.value = initialQuery;
    paletteInput.focus();
    paletteInput.select();
    handlePaletteSearch(initialQuery);
  }

  function closeCommandPalette() {
    if (!paletteModal) return;
    paletteModal.style.display = 'none';

    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
      try {
        previouslyFocusedElement.focus();
      } catch {}
      previouslyFocusedElement = null;
    }
  }

  function handlePaletteKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentSelectedIndex >= 0 && currentSelectedIndex < currentItemsList.length) {
        executePaletteItem(currentItemsList[currentSelectedIndex]);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '5') {
      const targetIdx = parseInt(e.key, 10) - 1;
      if (targetIdx >= 0 && targetIdx < currentItemsList.length) {
        e.preventDefault();
        executePaletteItem(currentItemsList[targetIdx]);
        return;
      }
    }
  }

  function moveSelection(direction) {
    if (!currentItemsList.length) return;
    currentSelectedIndex += direction;
    if (currentSelectedIndex < 0) currentSelectedIndex = currentItemsList.length - 1;
    if (currentSelectedIndex >= currentItemsList.length) currentSelectedIndex = 0;

    updateSelectionUi();
  }

  function updateSelectionUi() {
    const items = paletteResults.querySelectorAll('.command-palette-item');
    items.forEach((el, index) => {
      const isSelected = index === currentSelectedIndex;
      el.classList.toggle('is-selected', isSelected);
      el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        el.scrollIntoView({ block: 'nearest' });
        if (paletteInput) {
          paletteInput.setAttribute('aria-activedescendant', `palette-item-${index}`);
        }
      }
    });
  }

  // Generate Results according to Intent via Command Registry
  function handlePaletteSearch(rawQuery) {
    if (!paletteResults) return;
    const intent = parseCommandIntent(rawQuery);
    const rooms = getRooms();
    const reservations = getReservations();
    const guests = getGuests();
    const attention = paletteAttentionCache || computeAttentionInbox();
    paletteAttentionCache = attention;
    const currentBizDate = getCurrentBizDate();

    const context = {
      rawQuery,
      rooms,
      reservations,
      guests,
      attention,
      currentBizDate,
      results: []
    };

    if (intent.type === 'empty') {
      // 0. Recent Items (if any recorded in localStorage)
      const recent = getRecentItems();
      if (recent.length > 0) {
        recent.forEach(rec => {
          context.results.push({
            category: '🕒 تم الوصول إليها مؤخراً',
            icon: rec.icon || '🕒',
            title: rec.title,
            subtitle: rec.subtitle || 'سجل العمليات السابقة',
            badge: rec.badge || 'أخير',
            actionFn: () => {
              if (paletteInput) {
                paletteInput.value = rec.title;
                handlePaletteSearch(rec.title);
              }
            }
          });
        });
      }

      // 1. High-priority attention items (if any exist)
      if (attention.totalCount > 0) {
        const topAttention = attention.deduplicatedAllItems.slice(0, 4);
        topAttention.forEach(item => {
          context.results.push({
            category: '⚡ تنبيهات عاجلة تتطلب متابعة',
            icon: item.badgeClass === 'danger' ? '⚠️' : (item.badgeClass === 'warning' ? '💳' : '🚪'),
            title: item.title,
            subtitle: item.subtitle,
            badge: item.badge,
            isUrgent: true,
            actionFn: () => executeAttentionAction(item)
          });
        });
      }

      // 2. Quick Suggested Actions
      context.results.push({
        category: '🎯 إجراءات فندقية سريعة',
        icon: '➕',
        title: 'تسجيل حجز أو تسكين جديد',
        subtitle: 'فتح نموذج التسكين والحجز الفوري (اختصار F2)',
        badge: 'F2',
        actionFn: () => {
          const btn = document.getElementById('btn-open-new-reservation-modal');
          if (btn) btn.click();
        }
      });

      const currentUserRole = App?.State?.currentUser?.role || (typeof localStorage !== 'undefined' ? localStorage.getItem('currentUserRole') : null);
      const isAdmin = currentUserRole === 'Admin';

      context.results.push({
        category: '🎯 إجراءات فندقية سريعة',
        icon: '💵',
        title: 'تقرير إقفال الوردية والدرج النقدي (Shift Audit)',
        subtitle: isAdmin ? 'استعراض النقدية المتحصلة ورصيد الصندوق والمدفوعات' : 'يتطلب صلاحية مدير النظام (Admin)',
        badge: isAdmin ? 'الخزينة' : 'مدير النظام 🔒',
        actionFn: () => {
          if (!isAdmin) {
            if (App?.Helpers?.showToast) App.Helpers.showToast('تقرير الوردية التفصيلي متاح لمدير النظام فقط (Admin).', 'warning');
            return;
          }
          if (typeof window.openShiftAuditModal === 'function') window.openShiftAuditModal();
          else showMissingHelperToast();
        }
      });

      context.results.push({
        category: '🎯 إجراءات فندقية سريعة',
        icon: '⚡',
        title: 'صندوق المهام والتنبيهات العاجلة (Attention Inbox)',
        subtitle: `استعراض ${attention.totalCount} مهام وتنبيهات تحتاج متابعة الآن`,
        badge: `${attention.totalCount} مهام`,
        actionFn: () => openAttentionInboxModal()
      });

      // 3. Navigation shortcuts
      context.results.push({
        category: '🧭 التنقل السريع في النظام',
        icon: '🛏️',
        title: 'شاشة الغرف والوحدات',
        subtitle: 'استعراض خريطة الغرف وحالات الإشغال والنظافة',
        badge: 'الغرف',
        actionFn: () => switchViewSection('rooms')
      });
      context.results.push({
        category: '🧭 التنقل السريع في النظام',
        icon: '📋',
        title: 'سجل الحجوزات والعمليات',
        subtitle: 'جدول الحجوزات الكامل وسندات القبض',
        badge: 'الحجوزات',
        actionFn: () => switchViewSection('reservations')
      });
      context.results.push({
        category: '🧭 التنقل السريع في النظام',
        icon: '👥',
        title: 'دليل النزلاء والعملاء',
        subtitle: 'البحث في ملفات النزلاء، أرقام الهوية، وقوائم الحظر',
        badge: 'النزلاء',
        actionFn: () => switchViewSection('guests')
      });
    } else {
      // Find matching command in registry
      const matchingCmd = COMMAND_REGISTRY.find(cmd => intent.commandId === cmd.id || intent.type === `${cmd.id}-intent`);
      if (matchingCmd) {
        matchingCmd.handle(context, intent.matchResult || intent);
      } else {
        // Fallback: Ranked multi-entity search
        searchMultiEntity(intent.query, intent.transliterated, context);
      }
    }

    renderPaletteResults(context.results);
  }

  function renderPaletteResults(results) {
    currentItemsList = results;
    currentSelectedIndex = results.length > 0 ? 0 : -1;

    if (paletteCountLabel) {
      paletteCountLabel.textContent = `${results.length} خيار`;
    }

    if (!results.length) {
      paletteResults.innerHTML = `
        <div style="padding: 32px 20px; text-align: center; color: #94a3b8;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 700; font-size: 0.95rem; color: #64748b;">لم يتم العثور على نتائج مطابقة</div>
          <div style="font-size: 0.82rem; margin-top: 4px;">جرب كتابة رقم غرفة، اسم نزيل، أو أمراً مثل: "تسكين 101" أو "فلوس الدرج"</div>
        </div>
      `;
      return;
    }

    let lastCategory = '';
    let html = '';

    results.forEach((item, index) => {
      if (item.category && item.category !== lastCategory) {
        lastCategory = item.category;
        html += `<div class="command-palette-category">${escapePaletteText(lastCategory)}</div>`;
      }

      const isSelected = index === currentSelectedIndex;
      html += `
        <div class="command-palette-item ${isSelected ? 'is-selected' : ''} ${item.isUrgent ? 'is-urgent' : ''}"
             id="palette-item-${index}"
             data-index="${index}"
             role="option"
             aria-selected="${isSelected}">
          <div class="command-palette-item-main">
            <div class="command-palette-item-icon">${escapePaletteText(item.icon || '⚡')}</div>
            <div class="command-palette-item-texts">
              <div class="command-palette-item-title">${escapePaletteText(item.title)}</div>
              <div class="command-palette-item-subtitle">${escapePaletteText(item.subtitle || '')}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            ${item.badge ? `<span class="command-palette-item-badge">${escapePaletteText(item.badge)}</span>` : ''}
            ${index < 5 ? `<kbd class="command-palette-keyhint" title="اضغط Ctrl+${index + 1}">Ctrl+${index + 1}</kbd>` : ''}
          </div>
        </div>
      `;
    });

    paletteResults.innerHTML = html;

    // Attach click and mouseenter handlers
    paletteResults.querySelectorAll('.command-palette-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const idx = Number(el.dataset.index);
        if (idx >= 0 && idx < currentItemsList.length) {
          currentSelectedIndex = idx;
          updateSelectionUi();
        }
      });

      el.addEventListener('click', () => {
        const idx = Number(el.dataset.index);
        if (idx >= 0 && idx < currentItemsList.length) {
          executePaletteItem(currentItemsList[idx]);
        }
      });
    });
  }

  function executePaletteItem(item) {
    if (!item) return;
    recordRecentItem(item);
    closeCommandPalette();
    safeExecute(item.actionFn);
  }

  function safeExecute(fn, missingMessage = 'الخدمة المطلوبة غير متوفرة حالياً.') {
    if (typeof fn === 'function') {
      try {
        fn();
      } catch (err) {
        console.error('Error executing palette action:', err);
        if (App?.Helpers?.showToast) {
          App.Helpers.showToast(`حدث خطأ أثناء تنفيذ الإجراء: ${err.message}`, 'error');
        }
      }
    } else if (missingMessage) {
      if (App?.Helpers?.showToast) {
        App.Helpers.showToast(missingMessage, 'warning');
      }
    }
  }

  function showMissingHelperToast(msg) {
    if (App?.Helpers?.showToast) {
      App.Helpers.showToast(msg || 'الخدمة المطلوبة غير متوفرة حالياً.', 'warning');
    }
  }

  function switchViewSection(sectionName) {
    const navLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
    if (navLink) {
      navLink.click();
      if (typeof updateAttentionInbox === 'function') {
        setTimeout(updateAttentionInbox, 100);
      }
    }
  }

  // Safe Confirmation Flow for Room Cleaning (replaces direct writes)
  async function requestRoomCleaningCompletion(room) {
    if (!room) return;

    const showConfirm = window.DashboardApp?.Helpers?.showConfirmDialog || window.showConfirmDialog;
    if (showConfirm) {
      const confirmed = await showConfirm({
        title: 'تأكيد جاهزية الغرفة للنظافة',
        message: `هل تم الانتهاء من تنظيف الغرفة (${room.room_number}) وتجهيزها للتسكين الفوري لتصبح "متاحة"؟`,
        confirmText: 'نعم، أصبحت متاحة',
        cancelText: 'إلغاء',
        isDanger: false
      });
      if (!confirmed) return;
    }

    if (window.api && typeof window.api.updateRoomStatus === 'function') {
      try {
        const res = await window.api.updateRoomStatus(room.id, 'متاحة');
        if (res && res.success) {
          if (App?.Helpers?.showToast) {
            App.Helpers.showToast(`تم تحديث غرفة ${room.room_number} إلى "متاحة" بنجاح ✓`, 'success');
          }
          room.status = 'متاحة';
          if (typeof window.DashboardApp?.Helpers?.renderRoomsGrid === 'function') {
            window.DashboardApp.Helpers.renderRoomsGrid();
          }
          if (typeof window.DashboardApp?.Helpers?.loadOverviewData === 'function') {
            window.DashboardApp.Helpers.loadOverviewData();
          }
          updateAttentionInbox();
        } else {
          if (App?.Helpers?.showToast) {
            App.Helpers.showToast(res?.error || 'تعذر تحديث حالة الغرفة.', 'error');
          }
        }
      } catch (err) {
        if (App?.Helpers?.showToast) {
          App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
        }
      }
    } else {
      switchViewSection('rooms');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. ATTENTION INBOX MODAL & OVERVIEW WIDGET
  // ─────────────────────────────────────────────────────────────────────────────

  let attentionModal = null;
  let currentAttentionFilter = 'all';

  function ensureAttentionModal() {
    if (attentionModal) return;
    attentionModal = document.getElementById('attention-inbox-modal');
    if (!attentionModal) return;

    attentionModal.addEventListener('click', event => {
      if (event.target === attentionModal) closeAttentionInboxModal();
    });

    // Trap focus inside attention modal
    attentionModal.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        trapModalFocus(event, attentionModal);
      }
    });

    const closeBtn = document.getElementById('btn-close-attention-inbox');
    if (closeBtn) closeBtn.addEventListener('click', closeAttentionInboxModal);

    const footerCloseBtn = document.getElementById('btn-footer-close-attention');
    if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeAttentionInboxModal);

    const tabsContainer = document.getElementById('attention-inbox-tabs');
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.attention-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          tabsContainer.querySelectorAll('.attention-tab').forEach(t => t.classList.remove('is-active', 'btn-primary'));
          tab.classList.add('is-active', 'btn-primary');
          currentAttentionFilter = tab.dataset.tab || 'all';
          renderAttentionModalList();
        });
      });
    }
  }

  function openAttentionInboxModal(filterTab = 'all') {
    ensureAttentionModal();
    if (!attentionModal) return;

    currentAttentionFilter = filterTab;
    const tabsContainer = document.getElementById('attention-inbox-tabs');
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.attention-tab').forEach(t => {
        const isMatch = t.dataset.tab === filterTab;
        t.classList.toggle('is-active', isMatch);
        t.classList.toggle('btn-primary', isMatch);
      });
    }

    renderAttentionModalList();
    attentionModal.style.display = 'flex';
  }

  function closeAttentionInboxModal() {
    if (!attentionModal) return;
    attentionModal.style.display = 'none';
  }

  function renderAttentionModalList() {
    const listEl = document.getElementById('attention-inbox-list');
    if (!listEl) return;

    const data = computeAttentionInbox();

    // Update tab counts
    setTabCount('tab-cnt-all', data.totalCount);
    setTabCount('tab-cnt-late', data.lateCheckouts.length);
    setTabCount('tab-cnt-dept', data.departuresToday.length);
    setTabCount('tab-cnt-unpaid', data.unpaidBalances.length);
    setTabCount('tab-cnt-dirty', data.dirtyRooms.length);
    setTabCount('tab-cnt-monthly', data.monthlyDue.length);
    setTabCount('tab-cnt-deposit', data.legacyDeposits.length);

    let items = [];
    let completedNoticeHtml = '';

    if (currentAttentionFilter === 'all') {
      items = data.deduplicatedAllItems;
    } else if (currentAttentionFilter === 'late-checkout') {
      items = data.lateCheckouts;
    } else if (currentAttentionFilter === 'departures-today') {
      items = data.departuresToday;
      // If there are completed checkouts today, display them as well to resolve receptionist questions
      if (data.completedDeparturesToday.length > 0) {
        completedNoticeHtml = `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="font-size: 0.88rem; color: #166534; font-weight: 700;">
              ✓ تم إنجاز وتصفية ${data.completedDeparturesToday.length} مغادرة لليوم بنجاح (${data.completedDeparturesToday.map(c => `غرفة ${c.reservation?.room_number}`).join('، ')})
            </div>
          </div>
        `;
        if (!items.length) {
          items = data.completedDeparturesToday;
        }
      }
    } else if (currentAttentionFilter === 'unpaid-balance') {
      items = data.unpaidBalances;
    } else if (currentAttentionFilter === 'dirty-rooms') {
      items = data.dirtyRooms;
    } else if (currentAttentionFilter === 'monthly-due') {
      items = data.monthlyDue;
    } else if (currentAttentionFilter === 'legacy-deposit') {
      items = data.legacyDeposits;
    }

    if (!items.length) {
      listEl.innerHTML = `
        ${completedNoticeHtml}
        <div style="padding: 40px 20px; text-align: center; color: #16a34a; background: #f0fdf4; border-radius: 12px; border: 1px dashed #bbf7d0;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">✓</div>
          <div style="font-weight: 800; font-size: 1.05rem; color: #15803d;">لا توجد أي مهام أو تنبيهات معلقة في هذا القسم!</div>
          <div style="font-size: 0.85rem; color: #166534; margin-top: 4px;">جميع الإجراءات منتظمة ومحدثة بالكامل.</div>
        </div>
      `;
      return;
    }

    const badgeStyles = {
      danger: 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;',
      warning: 'background: #fffbeb; color: #d97706; border: 1px solid #fde68a;',
      info: 'background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;',
      purple: 'background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe;'
    };

    listEl.innerHTML = completedNoticeHtml + items.map((item, idx) => {
      const bStyle = badgeStyles[item.badgeClass] || badgeStyles.info;
      return `
        <div class="attention-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 8px; transition: transform 0.15s ease;">
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-weight: 800; font-size: 0.95rem; color: #1e293b;">${escapePaletteText(item.title)}</span>
              <span style="font-size: 0.74rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; ${bStyle}">${escapePaletteText(item.badge)}</span>
            </div>
            <div style="font-size: 0.82rem; color: #64748b; line-height: 1.4;">
              ${escapePaletteText(item.subtitle)}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <button type="button" class="btn btn-sm btn-primary attention-action-btn" data-item-idx="${idx}" style="font-weight: 800; padding: 6px 14px; border-radius: 8px;">
              ${escapePaletteText(item.primaryActionText || 'اتخاذ إجراء')}
            </button>
            ${item.reservation && item.reservation.guest_phone ? `
              <button type="button" class="btn btn-sm btn-secondary attention-whatsapp-btn" data-res-id="${item.reservation.id}" title="مراسلة النزيل عبر واتساب" style="font-weight: 700; padding: 6px 10px; border-radius: 8px;">
                💬
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach actions
    listEl.querySelectorAll('.attention-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.itemIdx);
        if (idx >= 0 && idx < items.length) {
          closeAttentionInboxModal();
          executeAttentionAction(items[idx]);
        }
      });
    });

    listEl.querySelectorAll('.attention-whatsapp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const resId = btn.dataset.resId;
        if (resId && window.sendReservationWhatsApp) {
          window.sendReservationWhatsApp(resId);
        } else {
          showMissingHelperToast();
        }
      });
    });
  }

  function setTabCount(id, count) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(count || 0);
  }

  function executeAttentionAction(item) {
    if (!item) return;

    if (item.action === 'checkout' && item.reservation) {
      if (App?.Helpers?.openContractSettleModal) {
        App.Helpers.openContractSettleModal(item.reservation);
      } else if (App?.Helpers?.openReservationPreview) {
        App.Helpers.openReservationPreview(item.reservation.id);
      } else {
        showMissingHelperToast();
      }
    } else if (item.action === 'payment' && item.reservation) {
      if (window.openAddPaymentModal) {
        window.openAddPaymentModal(item.reservation.id);
      } else if (App?.Helpers?.openReservationPreview) {
        App.Helpers.openReservationPreview(item.reservation.id);
      } else {
        showMissingHelperToast();
      }
    } else if (item.action === 'extend' && item.reservation) {
      if (window.openExtendStayModal) {
        window.openExtendStayModal(item.reservation.id);
      } else if (App?.Helpers?.openReservationPreview) {
        App.Helpers.openReservationPreview(item.reservation.id);
      } else {
        showMissingHelperToast();
      }
    } else if (item.action === 'preview' && item.reservation) {
      if (App?.Helpers?.openReservationPreview) {
        App.Helpers.openReservationPreview(item.reservation.id);
      } else if (window.openInvoiceModal) {
        window.openInvoiceModal(item.reservation.id);
      } else {
        showMissingHelperToast();
      }
    } else if (item.action === 'mark-clean' && item.room) {
      requestRoomCleaningCompletion(item.room);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. OVERVIEW WIDGET & TOPBAR UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  function updateAttentionInbox() {
    const data = computeAttentionInbox();
    paletteAttentionCache = data;

    // 1. Topbar Badge & Button
    const badgeCount = document.getElementById('attention-badge-count');
    const topbarBtn = document.getElementById('btn-open-attention-inbox');
    if (badgeCount) badgeCount.textContent = String(data.totalCount);
    if (topbarBtn) {
      topbarBtn.classList.toggle('has-urgent', data.lateCheckouts.length > 0);
      topbarBtn.title = `صندوق المهام: ${data.totalCount} مهام تتطلب متابعة (${data.lateCheckouts.length} متأخرين)`;
    }

    // 2. Overview Widget
    const overviewWidget = document.getElementById('overview-attention-widget');
    if (overviewWidget) {
      if (data.totalCount === 0) {
        overviewWidget.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px; color: #15803d; font-weight: 800; font-size: 0.95rem;">
              <span>✓</span>
              <span>جميع العمليات الفندقية منتظمة (لا توجد متأخرات)</span>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" data-open-attention-tab="all" style="font-weight: 700; font-size: 0.78rem;">
              سجل المهام
            </button>
          </div>
        `;
        overviewWidget.style.borderColor = '#bbf7d0';
        overviewWidget.style.background = '#f0fdf4';
      } else {
        overviewWidget.style.borderColor = data.lateCheckouts.length > 0 ? '#fecaca' : '#fed7aa';
        overviewWidget.style.background = data.lateCheckouts.length > 0 ? '#fff5f5' : '#fffaf5';

        overviewWidget.innerHTML = `
          <div class="overview-attention-header">
            <div class="overview-attention-title" style="color: ${data.lateCheckouts.length > 0 ? '#b91c1c' : '#9a3412'};">
              <span>⚡</span>
              <span>مركز المتابعة والمهام العاجلة (Needs Attention)</span>
              <span class="badge-attention-count" style="background: ${data.lateCheckouts.length > 0 ? '#dc2626' : '#ea580c'};">${data.totalCount}</span>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" data-open-attention-tab="all" style="font-weight: 800; font-size: 0.8rem;">
              عرض التفاصيل الكاملة ←
            </button>
          </div>
          <div class="overview-attention-pills">
            ${data.lateCheckouts.length ? `
              <button type="button" class="attention-pill attention-pill-late" data-open-attention-tab="late-checkout">
                <span>⚠️</span> <span>متأخرون عن المغادرة (${data.lateCheckouts.length})</span>
              </button>
            ` : ''}
            ${data.departuresToday.length ? `
              <button type="button" class="attention-pill attention-pill-departures" data-open-attention-tab="departures-today">
                <span>🚪</span> <span>مغادرات مطلوبة اليوم (${data.departuresToday.length})</span>
              </button>
            ` : ''}
            ${data.unpaidBalances.length ? `
              <button type="button" class="attention-pill attention-pill-unpaid" data-open-attention-tab="unpaid-balance">
                <span>💳</span> <span>مبالغ معلقة بحاجة لسداد (${data.unpaidBalances.length})</span>
              </button>
            ` : ''}
            ${data.dirtyRooms.length ? `
              <button type="button" class="attention-pill attention-pill-dirty" data-open-attention-tab="dirty-rooms">
                <span>🧹</span> <span>غرف بانتظار النظافة (${data.dirtyRooms.length})</span>
              </button>
            ` : ''}
            ${data.monthlyDue.length ? `
              <button type="button" class="attention-pill attention-pill-monthly" data-open-attention-tab="monthly-due">
                <span>📅</span> <span>إيجارات شهرية تقترب من التجديد (${data.monthlyDue.length})</span>
              </button>
            ` : ''}
            ${data.legacyDeposits.length ? `
              <button type="button" class="attention-pill attention-pill-deposits" data-open-attention-tab="legacy-deposit">
                <span>💰</span> <span>تأمينات سابقة بحاجة لمطابقة (${data.legacyDeposits.length})</span>
              </button>
            ` : ''}
          </div>
        `;
      }

      overviewWidget.querySelectorAll('[data-open-attention-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          openAttentionInboxModal(btn.dataset.openAttentionTab || 'all');
        });
      });
    }
  }

  function escapePaletteText(str) {
    if (App?.Helpers?.escapeHtml) return App.Helpers.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. INITIALIZATION & EXPORTS
  // ─────────────────────────────────────────────────────────────────────────────

  function initCommandPalette() {
    ensurePaletteElements();
    ensureAttentionModal();

    // Sync database data right away so cache is ready before user interactions
    syncDataFromDb();

    // Wire Topbar Buttons
    const btnPalette = document.getElementById('btn-open-command-palette');
    if (btnPalette) {
      btnPalette.addEventListener('click', () => openCommandPalette());
    }

    const btnAttention = document.getElementById('btn-open-attention-inbox');
    if (btnAttention) {
      btnAttention.addEventListener('click', () => openAttentionInboxModal());
    }

    // Global Escape Key Listener (capture phase) to guarantee dismissal
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27) {
        if (attentionModal && attentionModal.style.display && attentionModal.style.display !== 'none') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeAttentionInboxModal();
          return;
        }
        if (paletteModal && paletteModal.style.display && paletteModal.style.display !== 'none') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeCommandPalette();
          return;
        }
      }
    }, true);

    // Initial Attention Computation (after small delay to allow caches to load)
    setTimeout(updateAttentionInbox, 600);

    // Listen to tab / navigation changes to refresh attention state on demand without polling
    document.querySelectorAll('.nav-link').forEach(nav => {
      nav.addEventListener('click', () => {
        setTimeout(updateAttentionInbox, 250);
      });
    });
  }

  // Public APIs
  window.openCommandPalette = openCommandPalette;
  window.closeCommandPalette = closeCommandPalette;
  window.openAttentionInboxModal = openAttentionInboxModal;
  window.closeAttentionInboxModal = closeAttentionInboxModal;
  window.updateAttentionInbox = updateAttentionInbox;

  // Helpers for testing / modular usage
  App.CommandPalette = {
    open: openCommandPalette,
    close: closeCommandPalette,
    parseCommandIntent,
    computeAttentionInbox,
    updateAttentionInbox,
    syncDataFromDb,
    normalize,
    normalizeArabic,
    normalizeDigits,
    stripDiacritics,
    transliterateEnToAr,
    getRooms,
    getReservations,
    getGuests,
    COMMAND_REGISTRY
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommandPalette, { once: true });
  } else {
    initCommandPalette();
  }

})(window, document, window.DashboardApp);
