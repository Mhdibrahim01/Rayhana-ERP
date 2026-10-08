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

  function getRooms() {
    const appRooms = Array.isArray(App?.State?.roomsCache) ? App.State.roomsCache : [];
    const localRooms = Array.isArray(localRoomsCache) ? localRoomsCache : [];
    if (localRooms.length >= appRooms.length && localRooms.length > 0) {
      return localRooms;
    }
    if (appRooms.length > 0) {
      return appRooms;
    }
    return localRooms;
  }

  function getReservations() {
    const appCache = Array.isArray(App?.State?.reservationsCache) ? App.State.reservationsCache : [];
    const localCache = Array.isArray(localReservationsCache) ? localReservationsCache : [];
    if (localCache.length >= appCache.length && localCache.length > 0) {
      return localCache;
    }
    if (appCache.length > 0) {
      return appCache;
    }
    return localCache;
  }

  function getGuests() {
    const appGuests = Array.isArray(App?.State?.guestsCache) ? App.State.guestsCache : [];
    const localGuests = Array.isArray(localGuestsCache) ? localGuestsCache : [];
    if (localGuests.length >= appGuests.length && localGuests.length > 0) {
      return localGuests;
    }
    if (appGuests.length > 0) {
      return appGuests;
    }
    return localGuests;
  }

  function syncDataFromDb() {
    if (typeof window === 'undefined' || !window.api) return Promise.resolve();
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      try {
        const currentBizDate = String(App?.State?.businessDate || (App?.Helpers?.getLocalDateString ? App.Helpers.getLocalDateString() : new Date().toISOString().slice(0, 10)));
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

  const ARABIC_INDIC_DIGITS = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
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
    return String(str).replace(/[٠-٩]/g, d => ARABIC_INDIC_DIGITS[d] || d);
  }

  function stripDiacritics(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/\u0640/g, '');
  }

  function normalizeArabic(str) {
    if (!str && str !== 0) return '';
    let res = normalizeDigits(String(str));
    res = stripDiacritics(res);
    res = res
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىئ]/g, 'ي')
      .trim();
    return res.toLowerCase();
  }

  function transliterateEnToAr(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .split('')
      .map(ch => EN_TO_AR_KEYMAP[ch] || ch)
      .join('');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. NEEDS-ATTENTION INBOX DATA ENGINE
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
    const currentBizDate = String(App?.State?.businessDate || (App?.Helpers?.getLocalDateString ? App.Helpers.getLocalDateString() : new Date().toISOString().slice(0, 10)));

    const lateCheckouts = [];
    const departuresToday = [];
    const unpaidBalances = [];
    const dirtyRooms = [];
    const monthlyDue = [];
    const legacyDeposits = [];

    // Evaluate Reservations
    reservations.forEach(res => {
      if (res.status !== 'مؤكد') return;

      const checkOutDate = String(res.check_out_date || '').slice(0, 10);
      const isContract = res.booking_type === 'عقد مفتوح';
      const isMonthly = res.booking_type === 'حجز شهري';
      const isOverdueByDate = Boolean(checkOutDate && checkOutDate < currentBizDate);
      const isLateByHelper = Boolean(App?.Helpers?.isLateCheckout && App.Helpers.isLateCheckout(res));
      const isLate = !isContract && (isOverdueByDate || isLateByHelper);

      const total = Number(res.total_price || 0);
      const paid = Number((res.ledger_paid_amount ?? res.paid_amount) || 0);
      const balance = Math.max(0, total - paid);

      // 1. Late checkouts
      if (isLate) {
        lateCheckouts.push({
          id: res.id,
          reservation: res,
          type: 'late-checkout',
          title: `متأخر عن المغادرة • غرفة ${res.room_number || '-'}`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • كان متوقعاً: ${checkOutDate || '-'} • المتبقي: ${balance.toLocaleString()} ر.س`,
          badge: 'متأخر ⚠️',
          badgeClass: 'danger',
          primaryActionText: 'تسجيل مغادرة',
          action: 'checkout'
        });
      }
      // 2. Departures due today (not yet late)
      else if (!isContract && checkOutDate === currentBizDate) {
        const expectedTime = App?.Helpers?.getExpectedCheckoutTime ? App.Helpers.getExpectedCheckoutTime(res) : '14:00';
        departuresToday.push({
          id: res.id,
          reservation: res,
          type: 'departures-today',
          title: `مغادرة مقررة اليوم • غرفة ${res.room_number || '-'}`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • موعد الإخلاء: الساعة ${expectedTime || '14:00'}`,
          badge: 'مغادرة اليوم 🚪',
          badgeClass: 'info',
          primaryActionText: 'تسجيل مغادرة',
          action: 'checkout'
        });
      }

      // 3. Unpaid balances (exclude those already flagged as late checkout to avoid duplicate noise)
      if (balance > 0.005 && !isLate) {
        unpaidBalances.push({
          id: res.id,
          reservation: res,
          type: 'unpaid-balance',
          title: `مستحقات معلقة • غرفة ${res.room_number || '-'} (${balance.toLocaleString()} ر.س)`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • المدفوع: ${paid.toLocaleString()} ر.س من إجمالي ${total.toLocaleString()} ر.س`,
          badge: 'مستحق سداد 💳',
          badgeClass: 'warning',
          primaryActionText: 'تحصيل دفعة',
          action: 'payment'
        });
      }

      // 4. Monthly contracts due soon (within 3 days of expiration or expired)
      if (isMonthly && checkOutDate) {
        const d1 = Date.parse(`${currentBizDate}T00:00:00Z`);
        const d2 = Date.parse(`${checkOutDate}T00:00:00Z`);
        const daysLeft = Math.round((d2 - d1) / 86400000);
        if (daysLeft <= 3) {
          monthlyDue.push({
            id: res.id,
            reservation: res,
            type: 'monthly-due',
            title: `إيجار شهري يقترب من التجديد • غرفة ${res.room_number || '-'}`,
            subtitle: `المستأجر: ${res.guest_name || 'مستأجر'} • تاريخ التجديد: ${checkOutDate} (${daysLeft <= 0 ? 'منتهي اليوم' : `متبقي ${daysLeft} يوم`})`,
            badge: daysLeft <= 0 ? 'مستحق التجديد 📅' : `يستحق بعد ${daysLeft} يوم 📅`,
            badgeClass: daysLeft <= 0 ? 'danger' : 'purple',
            primaryActionText: 'تمديد العقد',
            action: 'extend'
          });
        }
      }

      // 5. Unreconciled legacy deposits
      const hasLegacyDeposit = Number(res.deposit_legacy_unreconciled || 0) === 1 ||
        (Number(res.deposit_amount || 0) > 0 && Number(res.deposit_ledger_balance || 0) === 0);
      if (hasLegacyDeposit) {
        legacyDeposits.push({
          id: res.id,
          reservation: res,
          type: 'legacy-deposit',
          title: `تأمين سابق بحاجة لمطابقة • غرفة ${res.room_number || '-'}`,
          subtitle: `النزيل: ${res.guest_name || 'نزيل'} • مبلغ التأمين: ${Number(res.deposit_amount || 0).toLocaleString()} ر.س`,
          badge: 'تأمين معلق 💰',
          badgeClass: 'warning',
          primaryActionText: 'معاينة الحساب',
          action: 'preview'
        });
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
          subtitle: `النوع: ${room.type || 'عادية'} • الطابق: ${room.floor || '1'} • السعر: ${Number(room.price_per_night || 0).toLocaleString()} ر.س`,
          badge: 'تحت التنظيف 🧹',
          badgeClass: 'purple',
          primaryActionText: 'تم التنظيف ➔ متاحة ✓',
          action: 'mark-clean'
        });
      }
    });

    const totalCount = lateCheckouts.length + departuresToday.length + unpaidBalances.length +
      dirtyRooms.length + monthlyDue.length + legacyDeposits.length;

    return {
      lateCheckouts,
      departuresToday,
      unpaidBalances,
      dirtyRooms,
      monthlyDue,
      legacyDeposits,
      totalCount
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. NATURAL LANGUAGE & COMMAND INTENT PARSER
  // ─────────────────────────────────────────────────────────────────────────────

  function matchIntentFromNormalizedText(norm, rawQuery) {
    if (!norm) return { type: 'empty' };

    // A. Unpaid balances / debts intent: "مين عليه فلوس", "مين عليه مبالغ", "مين ما دفع", "المستحقات", "مديونية", "ديون", "unpaid"
    // MUST BE EVALUATED BEFORE shift-intent (so "فلوس" in "مين عليه فلوس" is not confused with cash drawer)
    const isUnpaidQuery = /^(?:مستحق|المستحق|ديون|الديون|مديوني|المديوني|غير\s+مدفوع|غير\s+مسدد|unpaid|debts|balances|outstanding)/i.test(norm) ||
      norm.includes('عليه فلوس') || norm.includes('عليه مبالغ') || norm.includes('ما دفع') ||
      norm.includes('مستحق') || norm.includes('مبالغ معلقه') || norm.includes('مبالغ معلقة') || norm.includes('باقي فلوس') ||
      norm.includes('مديون') || norm.includes('ديون');
    if (isUnpaidQuery) {
      return {
        type: 'unpaid-intent',
        originalQuery: rawQuery
      };
    }

    // B. Departures today intent: "مين خارج اليوم", "مغادرات اليوم", "مين بيخرج اليوم", "خروج اليوم", "departures"
    const isDeparturesQuery = /^(?:مغادر|المغادر|خروج|الخروج|departures?|checkouts?)/i.test(norm) ||
      norm.includes('خارج اليوم') || norm.includes('بيخرج اليوم') || norm.includes('يخرج اليوم') ||
      norm.includes('مغادرات') || norm.includes('مغادره اليوم') || norm.includes('مغادرة اليوم') || norm.includes('خروج اليوم') ||
      norm.includes('leaving today');
    if (isDeparturesQuery) {
      return {
        type: 'departures-intent',
        originalQuery: rawQuery
      };
    }

    // C. Late checkout / Overdue stays intent: "مين متأخر", "المتأخرين", "تأخير", "late"
    const isLateQuery = /^(?:متاخر|المتاخر|متأخر|المتأخر|تاخير|التاخير|تأخير|التأخير|late|overdue)/i.test(norm) ||
      norm.includes('متاخر') || norm.includes('متأخر') || norm.includes('تاخير') || norm.includes('تأخير') || norm.includes('overdue');
    if (isLateQuery) {
      return {
        type: 'late-intent',
        originalQuery: rawQuery
      };
    }

    // D. Available rooms intent: "غرف فاضية", "مين فاضي", "غرفة فاضية", "غرف متاحة", "متاحة", "available", "vacant"
    const hasDigits = /\d+/.test(norm);
    const isAvailableQuery = !hasDigits && (
      /^(?:فاضي|الفاضي|فاضيه|الفاضيه|فاضية|الفاضية|متاح|المتاح|متاحه|المتاحه|متاحة|المتاحة|شاغر|الشاغر|شاغره|الشاغره|شاغرة|الشاغرة|available|vacant)/i.test(norm) ||
      norm.includes('فاضي') || norm.includes('فاضيه') || norm.includes('فاضية') || norm.includes('متاح') || norm.includes('شاغر') || norm.includes('vacant')
    );
    if (isAvailableQuery) {
      return {
        type: 'available-intent',
        originalQuery: rawQuery
      };
    }

    // E. Occupied rooms intent: "غرف مشغولة", "مين ساكن", "الساكنين", "مشغولة", "occupied", "in-house"
    const isOccupiedQuery = !hasDigits && (
      /^(?:مشغول|المشغول|مشغوله|المشغوله|مشغولة|المشغولة|ساكن|الساكن|ساكنين|الساكنين|occupied|in-house)/i.test(norm) ||
      norm.includes('مشغول') || norm.includes('ساكنين') || (norm.includes('ساكن') && !norm.includes('تسكين')) || norm.includes('occupied')
    );
    if (isOccupiedQuery) {
      return {
        type: 'occupied-intent',
        originalQuery: rawQuery
      };
    }

    // F. Cleaning rooms: "غرف النظافة", "تنظيف", "نظافة"
    const isCleaningQuery = /^(?:نظافه|النظافه|نظافة|النظافة|تنظيف|التنظيف|cleaning|dirty)(?:\s|$)/i.test(norm) ||
      norm.includes('نظافه') || norm.includes('نظافة') || norm.includes('تنظيف') || norm.includes('cleaning');
    if (isCleaningQuery) {
      return {
        type: 'cleaning-intent',
        originalQuery: rawQuery
      };
    }

    // G. Booking / Check-in intent: "تسكين 105", "حجز 105", "تسكين غرفة 105", "حجز جديد"
    const bookingMatch = norm.match(/^(?:تسكين|حجز|booking|checkin)\s*(?:(?:غرف[هة]|الغرف[هة])\s+)?(\d{1,5})?/i);
    if (bookingMatch) {
      return {
        type: 'booking-intent',
        roomNumber: bookingMatch[1] ? normalizeDigits(bookingMatch[1]) : null,
        originalQuery: rawQuery
      };
    }

    // H. Cash drawer / Shift report: "فلوس الدرج", "الدرج", "تقرير الوردية", "الخزينة", "الكاش"
    const isShiftQuery = /^(?:فلوس|كاش|نقديه|نقدية|درج|الدرج|ورديه|وردية|الورديه|الوردية|خزينه|خزينة|الخزينه|الخزينة|audit|shift|cash|drawer)(?:\s|$)/i.test(norm) ||
      norm.includes('درج') || norm.includes('ورديه') || norm.includes('وردية') || norm.includes('خزينه') || norm.includes('خزينة') || norm.includes('كاش');
    if (isShiftQuery) {
      return {
        type: 'shift-intent',
        originalQuery: rawQuery
      };
    }

    // I. WhatsApp messaging: "واتساب 102", "واتساب محمد", "واتس 102"
    const whatsappMatch = norm.match(/^(?:واتساب|واتس|whatsapp|رسال[هة])\s*(?:(?:غرف[هة]|الغرف[هة])\s+)?(\S+)?/i);
    if (whatsappMatch) {
      return {
        type: 'whatsapp-intent',
        target: whatsappMatch[1] ? normalizeDigits(whatsappMatch[1]) : null,
        originalQuery: rawQuery
      };
    }

    // J. Room status inquiry: "مين في غرفة 204؟", "مين في 204", "غرفة 204", "204", "٢٠٤", "مين ساكن في 204"
    const roomInquiryMatch = norm.match(/^(?:(?:مين\s+(?:في\s+|ساكن\s+(?:في\s+)?)?|من\s+في\s+)?(?:غرف[هة]\s*|الغرف[هة]\s*|رقم\s*)?|رقم\s*)?(\d{1,5})(?:\s*؟|\s*\?|\s*$)/i);
    if (roomInquiryMatch && roomInquiryMatch[1]) {
      return {
        type: 'room-inquiry',
        roomNumber: normalizeDigits(roomInquiryMatch[1]),
        originalQuery: rawQuery
      };
    }

    // Fallback: General multi-entity search
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

    // 1. Direct normalized Arabic matching (converts digits, strips diacritics & normalizes chars)
    const norm = normalizeArabic(query);
    const parsed = matchIntentFromNormalizedText(norm, query);
    if (parsed.type !== 'search') {
      return parsed;
    }

    // 2. If it fell back to search, check if query contains ASCII/English layout characters
    // (receptionist typed while keyboard was accidentally set to English)
    if (/[a-zA-Z\[\];',.`]/.test(query)) {
      const transliterated = transliterateEnToAr(query);
      const normTrans = normalizeArabic(transliterated);
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
  // 3. COMMAND PALETTE UI CONTROLLER
  // ─────────────────────────────────────────────────────────────────────────────

  let paletteModal = null;
  let paletteInput = null;
  let paletteResults = null;
  let paletteCountLabel = null;
  let currentSelectedIndex = -1;
  let currentItemsList = [];

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

    // Close on Escape inside palette modal
    paletteModal.addEventListener('keydown', event => {
      if (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeCommandPalette();
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

    // Input listening
    paletteInput.addEventListener('input', e => {
      handlePaletteSearch(e.target.value);
    });

    // Keyboard navigation
    paletteInput.addEventListener('keydown', handlePaletteKeydown);
  }

  function openCommandPalette(initialQuery = '') {
    ensurePaletteElements();
    if (!paletteModal) return;

    // Refresh database cache in background
    syncDataFromDb();

    paletteModal.style.display = 'flex';
    paletteInput.value = initialQuery;
    paletteInput.focus();
    paletteInput.select();
    handlePaletteSearch(initialQuery);
  }

  function closeCommandPalette() {
    if (!paletteModal) return;
    paletteModal.style.display = 'none';
  }

  function handlePaletteKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
      return;
    }

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
    }
  }

  function moveSelection(direction) {
    if (!currentItemsList.length) return;
    currentSelectedIndex += direction;
    if (currentSelectedIndex < 0) currentSelectedIndex = currentItemsList.length - 1;
    if (currentSelectedIndex >= currentItemsList.length) currentSelectedIndex = 0;

    const items = paletteResults.querySelectorAll('.command-palette-item');
    items.forEach((el, index) => {
      el.classList.toggle('is-selected', index === currentSelectedIndex);
      if (index === currentSelectedIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // Generate Results according to Intent
  function handlePaletteSearch(rawQuery) {
    if (!paletteResults) return;
    const intent = parseCommandIntent(rawQuery);
    const rooms = getRooms();
    const reservations = getReservations();
    const guests = getGuests();
    const attention = computeAttentionInbox();

    const results = [];

    if (intent.type === 'empty') {
      // 1. High-priority attention items (if any exist)
      if (attention.totalCount > 0) {
        const topAttention = [
          ...attention.lateCheckouts,
          ...attention.departuresToday,
          ...attention.unpaidBalances,
          ...attention.dirtyRooms
        ].slice(0, 4);

        topAttention.forEach(item => {
          results.push({
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
      results.push({
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

      results.push({
        category: '🎯 إجراءات فندقية سريعة',
        icon: '💵',
        title: 'تقرير إقفال الوردية والدرج النقدي (Shift Audit)',
        subtitle: 'استعراض النقدية المتحصلة ورصيد الصندوق والمدفوعات',
        badge: 'الخزينة',
        actionFn: () => {
          if (typeof window.openShiftAuditModal === 'function') window.openShiftAuditModal();
        }
      });

      results.push({
        category: '🎯 إجراءات فندقية سريعة',
        icon: '⚡',
        title: 'صندوق المهام والتنبيهات العاجلة (Attention Inbox)',
        subtitle: `استعراض ${attention.totalCount} مهام وتنبيهات تحتاج متابعة الآن`,
        badge: `${attention.totalCount} مهام`,
        actionFn: () => openAttentionInboxModal()
      });

      // 3. Navigation shortcuts
      results.push({
        category: '🧭 التنقل السريع في النظام',
        icon: '🛏️',
        title: 'شاشة الغرف والوحدات',
        subtitle: 'استعراض خريطة الغرف وحالات الإشغال والنظافة',
        badge: 'الغرف',
        actionFn: () => switchViewSection('rooms')
      });
      results.push({
        category: '🧭 التنقل السريع في النظام',
        icon: '📋',
        title: 'سجل الحجوزات والعمليات',
        subtitle: 'جدول الحجوزات الكامل وسندات القبض',
        badge: 'الحجوزات',
        actionFn: () => switchViewSection('reservations')
      });
      results.push({
        category: '🧭 التنقل السريع في النظام',
        icon: '👥',
        title: 'دليل النزلاء والعملاء',
        subtitle: 'البحث في ملفات النزلاء، أرقام الهوية، وقوائم الحظر',
        badge: 'النزلاء',
        actionFn: () => switchViewSection('guests')
      });
    }

    else if (intent.type === 'unpaid-intent') {
      const unpaidItems = reservations
        .filter(r => r.status === 'مؤكد')
        .map(r => {
          const total = Number(r.total_price || 0);
          const paid = Number((r.ledger_paid_amount ?? r.paid_amount) || 0);
          const balance = Math.max(0, total - paid);
          return { res: r, balance, total, paid };
        })
        .filter(item => item.balance > 0.005)
        .sort((a, b) => b.balance - a.balance);

      if (unpaidItems.length > 0) {
        const totalDebt = unpaidItems.reduce((acc, cur) => acc + cur.balance, 0);
        results.push({
          category: `💳 المستحقات والمديونيات المعلقة (${unpaidItems.length} نزلاء)`,
          icon: '📊',
          title: `إجمالي المستحقات غير المسددة: ${totalDebt.toLocaleString()} ر.س`,
          subtitle: `يوجد ${unpaidItems.length} حجز نشط بمبالغ معلقة بحاجة للتحصيل`,
          badge: `${totalDebt.toLocaleString()} ر.س`,
          actionFn: () => openAttentionInboxModal('unpaid-balance')
        });

        unpaidItems.forEach(({ res: r, balance, total, paid }) => {
          results.push({
            category: '💳 نزلاء عليهم مبالغ معلقة',
            icon: '⚠️',
            title: `غرفة ${r.room_number || '-'} • ${r.guest_name || 'نزيل'} (متبقي: ${balance.toLocaleString()} ر.س)`,
            subtitle: `الجوال: ${r.guest_phone || '-'} • المسدد: ${paid.toLocaleString()} من ${total.toLocaleString()} ر.س • المغادرة: ${r.check_out_date || '-'}`,
            badge: `${balance.toLocaleString()} ر.س ⚠️`,
            actionFn: () => {
              if (window.openAddPaymentModal) {
                window.openAddPaymentModal(r.id);
              } else if (App.Helpers.openReservationPreview) {
                App.Helpers.openReservationPreview(r.id);
              }
            }
          });
        });
      } else {
        results.push({
          category: '💳 المستحقات والمديونيات',
          icon: '✓',
          title: 'لا توجد أي مبالغ معلقة أو غير مسددة!',
          subtitle: 'جميع الحجوزات النشطة تم سداد قيمتها بالكامل',
          badge: 'مسدد بالكامل ✓',
          actionFn: () => switchViewSection('reservations')
        });
      }
    }

    else if (intent.type === 'departures-intent') {
      const currentBizDate = String(App.State.businessDate || (App.Helpers.getLocalDateString ? App.Helpers.getLocalDateString() : new Date().toISOString().slice(0, 10)));
      const departingStays = reservations.filter(r =>
        r.status === 'مؤكد' &&
        r.booking_type !== 'عقد مفتوح' &&
        String(r.check_out_date || '').slice(0, 10) === currentBizDate
      );

      if (departingStays.length > 0) {
        results.push({
          category: `🚪 مغادرات اليوم المتوقعة (${departingStays.length} غرفة)`,
          icon: '🚪',
          title: `قائمة المغادرين اليوم (${currentBizDate})`,
          subtitle: `إجمالي ${departingStays.length} غرفة مقررة مغادرتها اليوم`,
          badge: `${departingStays.length} مغادرة`,
          actionFn: () => openAttentionInboxModal('departures-today')
        });

        departingStays.forEach(r => {
          const total = Number(r.total_price || 0);
          const paid = Number((r.ledger_paid_amount ?? r.paid_amount) || 0);
          const balance = Math.max(0, total - paid);
          const expectedTime = App.Helpers.getExpectedCheckoutTime ? App.Helpers.getExpectedCheckoutTime(r) : '14:00';
          results.push({
            category: '🚪 مغادرة اليوم',
            icon: '🚪',
            title: `غرفة ${r.room_number || '-'} • النزيل: ${r.guest_name || 'نزيل'}`,
            subtitle: `موعد الإخلاء: ${expectedTime || '14:00'} • الجوال: ${r.guest_phone || '-'} • المتبقي: ${balance.toLocaleString()} ر.س ${balance > 0 ? '⚠️' : '✓'}`,
            badge: balance > 0 ? 'متبقي مالي' : 'جاهز للإخلاء',
            actionFn: () => {
              if (App.Helpers.openContractSettleModal) {
                App.Helpers.openContractSettleModal(r);
              } else if (App.Helpers.openReservationPreview) {
                App.Helpers.openReservationPreview(r.id);
              }
            }
          });
        });
      } else {
        results.push({
          category: '🚪 مغادرات اليوم',
          icon: '✓',
          title: 'لا توجد مغادرات مقررة لليوم الحالي',
          subtitle: `تاريخ العمل الفندقي: ${currentBizDate}`,
          badge: 'لا توجد مغادرات',
          actionFn: () => switchViewSection('reservations')
        });
      }
    }

    else if (intent.type === 'late-intent') {
      const lateStays = reservations.filter(r =>
        r.status === 'مؤكد' &&
        r.booking_type !== 'عقد مفتوح' &&
        Boolean(App.Helpers.isLateCheckout && App.Helpers.isLateCheckout(r))
      );

      if (lateStays.length > 0) {
        results.push({
          category: `⚠️ النزلاء المتأخرون عن المغادرة (${lateStays.length})`,
          icon: '⚠️',
          title: `يوجد ${lateStays.length} نزيل تجاوزوا موعد الخروج المحدد`,
          subtitle: 'يجب التواصل معهم للتمديد أو تسليم الغرفة فوراً',
          badge: 'متأخرون ⚠️',
          actionFn: () => openAttentionInboxModal('late-checkout')
        });

        lateStays.forEach(r => {
          const total = Number(r.total_price || 0);
          const paid = Number((r.ledger_paid_amount ?? r.paid_amount) || 0);
          const balance = Math.max(0, total - paid);
          results.push({
            category: '⚠️ نزيل متأخر',
            icon: '🔴',
            title: `غرفة ${r.room_number || '-'} • ${r.guest_name || 'نزيل'}`,
            subtitle: `تاريخ المغادرة السابق: ${r.check_out_date || '-'} • الجوال: ${r.guest_phone || '-'} • المتبقي: ${balance.toLocaleString()} ر.س`,
            badge: 'تجاوز المغادرة ⚠️',
            actionFn: () => {
              if (App.Helpers.openContractSettleModal) {
                App.Helpers.openContractSettleModal(r);
              } else if (App.Helpers.openReservationPreview) {
                App.Helpers.openReservationPreview(r.id);
              }
            }
          });
        });
      } else {
        results.push({
          category: '⚠️ النزلاء المتأخرون',
          icon: '✓',
          title: 'لا يوجد أي نزلاء متأخرين عن المغادرة حالياً',
          subtitle: 'جميع الإقامات منتظمة وفق جداول المغادرة',
          badge: 'منضبط ✓',
          actionFn: () => switchViewSection('reservations')
        });
      }
    }

    else if (intent.type === 'available-intent') {
      const availRooms = rooms.filter(r => r.status === 'متاحة');
      if (availRooms.length > 0) {
        results.push({
          category: `🟢 الغرف المتاحة للتشغيل (${availRooms.length} غرف)`,
          icon: '🟢',
          title: `عدد الغرف الشاغرة الجاهزة: ${availRooms.length} غرفة`,
          subtitle: 'انقر على أي غرفة لبدء تسكين فوري',
          badge: `${availRooms.length} شاغرة`,
          actionFn: () => switchViewSection('rooms')
        });

        availRooms.forEach(r => {
          results.push({
            category: '🟢 غرفة متاحة للتسكين',
            icon: '🟢',
            title: `غرفة ${r.room_number} (${r.type || 'عادية'}) • الطابق ${r.floor || '1'}`,
            subtitle: `السعر: ${Number(r.price_per_night || 0).toLocaleString()} ر.س/ليلة • جاهزة للتسكين الفوري`,
            badge: 'تسكين ➕',
            actionFn: () => {
              if (App.Helpers.initiateRoomBooking) {
                App.Helpers.initiateRoomBooking(r.id);
              } else {
                switchViewSection('rooms');
              }
            }
          });
        });
      } else {
        results.push({
          category: '🟢 الغرف المتاحة',
          icon: 'ℹ️',
          title: 'لا توجد غرف شاغرة متاحة حالياً!',
          subtitle: 'نسبة الإشغال 100% أو الغرف تحت التنظيف والصيانة',
          badge: 'ممتلئ',
          actionFn: () => switchViewSection('rooms')
        });
      }
    }

    else if (intent.type === 'occupied-intent') {
      const occRooms = rooms.filter(r => r.status === 'مشغولة' || r.status === 'محجوزة');
      if (occRooms.length > 0) {
        results.push({
          category: `🔴 الغرف المشغولة والمحجوزة (${occRooms.length} غرف)`,
          icon: '🔴',
          title: `إجمالي الغرف المسكونة والمحجوزة: ${occRooms.length} غرفة`,
          subtitle: 'استعراض النزلاء المقيمين وتفاصيل الإقامة',
          badge: `${occRooms.length} مسكونة`,
          actionFn: () => switchViewSection('rooms')
        });

        occRooms.forEach(room => {
          const activeRes = reservations.find(r => (r.room_id === room.id || String(r.room_number) === String(room.room_number)) && r.status === 'مؤكد');
          results.push({
            category: '🔴 غرفة مشغولة',
            icon: '🔴',
            title: `غرفة ${room.room_number} • النزيل: ${activeRes ? activeRes.guest_name : 'نزيل مقيم'}`,
            subtitle: activeRes ? `الجوال: ${activeRes.guest_phone || '-'} • المغادرة: ${activeRes.check_out_date || 'مفتوح'}` : `حالة الغرفة: ${room.status}`,
            badge: room.status,
            actionFn: () => {
              if (activeRes && App.Helpers.openReservationPreview) {
                App.Helpers.openReservationPreview(activeRes.id);
              } else {
                switchViewSection('rooms');
              }
            }
          });
        });
      } else {
        results.push({
          category: '🔴 الغرف المشغولة',
          icon: 'ℹ️',
          title: 'لا توجد غرف مشغولة حالياً',
          subtitle: 'الفندق خالٍ من النزلاء حالياً',
          badge: 'فارغ',
          actionFn: () => switchViewSection('rooms')
        });
      }
    }

    else if (intent.type === 'room-inquiry') {
      const roomNum = intent.roomNumber;
      const room = rooms.find(r => String(r.room_number) === roomNum || String(r.id) === roomNum);

      // Find active reservation: check by room_id or by room_number string
      const activeRes = reservations.find(r =>
        ((room && r.room_id === room.id) || String(r.room_number) === roomNum) &&
        r.status === 'مؤكد'
      ) || (room && room.active_reservations ? room.active_reservations[0] : null);

      if (room || activeRes) {
        const displayRoomNum = room ? room.room_number : (activeRes ? activeRes.room_number : roomNum);
        const statusText = room ? room.status : (activeRes ? 'مشغولة' : 'غير محددة');

        // Case A: Room has an active reservation / occupant (whether marked as 'مشغولة' or 'محجوزة')
        if (activeRes) {
          const total = Number(activeRes.total_price || 0);
          const paid = Number((activeRes.ledger_paid_amount ?? activeRes.paid_amount) || 0);
          const balance = Math.max(0, total - paid);

          results.push({
            category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
            icon: '🔴',
            title: `غرفة ${displayRoomNum} (${statusText}) • النزيل: ${activeRes.guest_name || 'نزيل مقيم'}`,
            subtitle: `الجوال: ${activeRes.guest_phone || '-'} • المغادرة: ${activeRes.check_out_date || 'مفتوح'} • المتبقي: ${balance.toLocaleString()} ر.س ${balance > 0 ? '⚠️' : '✓'}`,
            badge: statusText,
            actionFn: () => {
              if (App.Helpers.openReservationPreview) {
                App.Helpers.openReservationPreview(activeRes.id);
              }
            }
          });

          results.push({
            category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
            icon: '🧾',
            title: `تسجيل مغادرة وتصفية الحساب • غرفة ${displayRoomNum}`,
            subtitle: `إنهاء إقامة النزيل (${activeRes.guest_name}) وتسليم الغرفة`,
            badge: 'مغادرة',
            actionFn: () => {
              if (App.Helpers.openContractSettleModal) {
                App.Helpers.openContractSettleModal(activeRes);
              } else if (App.Helpers.openReservationPreview) {
                App.Helpers.openReservationPreview(activeRes.id);
              }
            }
          });

          if (activeRes.guest_phone) {
            results.push({
              category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
              icon: '💬',
              title: `مراسلة النزيل (${activeRes.guest_name}) عبر واتساب`,
              subtitle: `إرسال رسالة سريعة إلى ${activeRes.guest_phone}`,
              badge: 'WhatsApp',
              actionFn: () => {
                if (window.sendReservationWhatsApp) window.sendReservationWhatsApp(activeRes.id);
              }
            });
          }

          if (balance > 0) {
            results.push({
              category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
              icon: '💳',
              title: `تسجيل دفعة سداد جديدة • متبقي ${balance.toLocaleString()} ر.س`,
              subtitle: `تحصيل مبلغ مالي للنزيل (${activeRes.guest_name})`,
              badge: 'سداد دفعة',
              actionFn: () => {
                if (window.openAddPaymentModal) {
                  window.openAddPaymentModal(activeRes.id);
                } else if (App.Helpers.openReservationPreview) {
                  App.Helpers.openReservationPreview(activeRes.id);
                }
              }
            });
          }
        }
        // Case B: Room is vacant / available
        else if (room && room.status === 'متاحة') {
          results.push({
            category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
            icon: '🟢',
            title: `غرفة ${displayRoomNum} (متاحة للتشغيل)`,
            subtitle: `النوع: ${room.type || 'عادية'} • السعر: ${Number(room.price_per_night || 0).toLocaleString()} ر.س/ليلة • الطابق: ${room.floor || '1'}`,
            badge: 'متاحة ✓',
            actionFn: () => {
              if (App.Helpers.initiateRoomBooking) App.Helpers.initiateRoomBooking(room.id);
            }
          });

          results.push({
            category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
            icon: '➕',
            title: `تسكين فوري للغرفة ${displayRoomNum}`,
            subtitle: 'فتح نموذج حجز جديد واختيار هذه الغرفة تلقائياً',
            badge: 'تسكين',
            actionFn: () => {
              if (App.Helpers.initiateRoomBooking) App.Helpers.initiateRoomBooking(room.id);
            }
          });
        }
        // Case C: Room under cleaning
        else if (room && room.status === 'تنظيف') {
          results.push({
            category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
            icon: '🧹',
            title: `غرفة ${displayRoomNum} (تحت التنظيف)`,
            subtitle: 'الغرفة بانتظار إشعار عمال النظافة قبل إتاحتها للحجز',
            badge: 'تنظيف',
            actionFn: () => markRoomCleanDirectly(room)
          });
          results.push({
            category: `⚡ إجراءات سريعة للغرفة ${displayRoomNum}`,
            icon: '✓',
            title: `تحويل غرفة ${displayRoomNum} إلى "متاحة" فوراً`,
            subtitle: 'تأكيد اكتمال التنظيف وتجهيز الغرفة للتسكين',
            badge: 'اعتماد',
            actionFn: () => markRoomCleanDirectly(room)
          });
        }
        // Case D: Other status (maintenance, etc.)
        else if (room) {
          results.push({
            category: `🚪 تفاصيل الغرفة ${displayRoomNum}`,
            icon: '🛠️',
            title: `غرفة ${displayRoomNum} (حالة: ${room.status})`,
            subtitle: `النوع: ${room.type || 'عادية'} • الطابق: ${room.floor || '1'}`,
            badge: room.status,
            actionFn: () => switchViewSection('rooms')
          });
        }
      } else {
        results.push({
          category: 'بحث الغرف',
          icon: '❓',
          title: `لم يتم العثور على غرفة برقم "${roomNum}"`,
          subtitle: 'تأكد من رقم الغرفة المدخل أو استعرض قائمة الغرف الكاملة',
          badge: 'غير موجودة',
          actionFn: () => switchViewSection('rooms')
        });
      }
    }

    else if (intent.type === 'booking-intent') {
      const roomNum = intent.roomNumber;
      if (roomNum) {
        const room = rooms.find(r => String(r.room_number) === roomNum || String(r.id) === roomNum);
        results.push({
          category: '🎯 إجراء تسكين وحجز',
          icon: '➕',
          title: `تسكين غرفة ${roomNum} مباشرة`,
          subtitle: room ? `الحالة: ${room.status} • السعر: ${Number(room.price_per_night || 0).toLocaleString()} ر.س` : 'فتح نموذج الحجز مع اختيار الغرفة',
          badge: 'تسكين فوري',
          actionFn: () => {
            if (room && App.Helpers.initiateRoomBooking) {
              App.Helpers.initiateRoomBooking(room.id);
            } else {
              const btn = document.getElementById('btn-open-new-reservation-modal');
              if (btn) btn.click();
            }
          }
        });
      } else {
        results.push({
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

    else if (intent.type === 'shift-intent') {
      results.push({
        category: '💵 الخزينة والسيولة',
        icon: '💵',
        title: 'عرض تقرير إقفال الوردية والموازنة المالية',
        subtitle: 'حساب النقدية المقبوضة، الشبكة، رصيد الدرج، والمصروفات',
        badge: 'تقرير الوردية',
        actionFn: () => {
          if (typeof window.openShiftAuditModal === 'function') window.openShiftAuditModal();
        }
      });
      results.push({
        category: '💵 الخزينة والسيولة',
        icon: '📊',
        title: 'لوحة التحكم والتحليلات المالية',
        subtitle: 'إجمالي إيرادات الشهر والوردية الحالية',
        badge: 'المؤشرات',
        actionFn: () => switchViewSection('overview')
      });
    }

    else if (intent.type === 'whatsapp-intent') {
      const target = intent.target;
      let matchedReservations = [];

      if (target) {
        // match by room number or guest name
        matchedReservations = reservations.filter(r =>
          r.status === 'مؤكد' && (
            String(r.room_number) === target ||
            String(r.guest_name || '').toLowerCase().includes(target.toLowerCase())
          )
        );
      } else {
        matchedReservations = reservations.filter(r => r.status === 'مؤكد' && r.guest_phone).slice(0, 5);
      }

      if (matchedReservations.length > 0) {
        matchedReservations.forEach(r => {
          results.push({
            category: '💬 مراسلة واتساب فورية',
            icon: '💬',
            title: `واتساب النزيل: ${r.guest_name || 'نزيل'} • غرفة ${r.room_number || '-'}`,
            subtitle: `رقم الجوال: ${r.guest_phone || 'غير مسجل'} • تاريخ المغادرة: ${r.check_out_date || '-'}`,
            badge: 'WhatsApp',
            actionFn: () => {
              if (window.sendReservationWhatsApp) window.sendReservationWhatsApp(r.id);
            }
          });
        });
      } else {
        results.push({
          category: '💬 مراسلة واتساب',
          icon: '❓',
          title: `لا يوجد نزيل مطابق للبحث "${target || ''}" مع رقم جوال نشط`,
          subtitle: 'تأكد من رقم الغرفة أو اسم النزيل المدخل',
          badge: 'غير متوفر'
        });
      }
    }

    else if (intent.type === 'cleaning-intent') {
      if (attention.dirtyRooms.length > 0) {
        attention.dirtyRooms.forEach(item => {
          results.push({
            category: '🧹 غرف بانتظار النظافة',
            icon: '🧹',
            title: `غرفة ${item.room.room_number} (${item.room.type || 'عادية'})`,
            subtitle: `الطابق: ${item.room.floor || '1'} • تحويل إلى متاحة بنقرة واحدة`,
            badge: 'تنظيف',
            actionFn: () => markRoomCleanDirectly(item.room)
          });
        });
      } else {
        results.push({
          category: '🧹 حالة النظافة',
          icon: '✓',
          title: 'جميع الغرف نظيفة ومتاحة!',
          subtitle: 'لا توجد أي غرف بحالة "تنظيف" حالياً',
          badge: 'ممتاز ✓',
          actionFn: () => switchViewSection('rooms')
        });
      }
    }

    else if (intent.type === 'search') {
      const q = intent.query || '';
      const transliterated = intent.transliterated || '';

      const matchText = (field) => {
        if (!field && field !== 0) return false;
        const normField = normalizeArabic(field);
        return (q && normField.includes(q)) || (transliterated && normField.includes(transliterated));
      };

      // Match Rooms
      rooms.filter(r =>
        normalizeDigits(String(r.room_number)).includes(q) ||
        (transliterated && normalizeDigits(String(r.room_number)).includes(transliterated)) ||
        matchText(r.type) ||
        matchText(r.status)
      ).slice(0, 5).forEach(r => {
        results.push({
          category: '🚪 الغرف والوحدات',
          icon: r.status === 'متاحة' ? '🟢' : (r.status === 'مشغولة' ? '🔴' : '🧹'),
          title: `غرفة ${r.room_number} • ${r.type || 'عادية'}`,
          subtitle: `الحالة: ${r.status} • السعر: ${Number(r.price_per_night || 0).toLocaleString()} ر.س/ليلة`,
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

      // Match Active Reservations
      reservations.filter(r =>
        normalizeDigits(String(r.id)) === q ||
        normalizeDigits(String(r.room_number)).includes(q) ||
        matchText(r.guest_name) ||
        normalizeDigits(String(r.guest_phone || '')).includes(q)
      ).slice(0, 5).forEach(r => {
        results.push({
          category: '📋 الحجوزات',
          icon: '📋',
          title: `حجز #${r.id} • ${r.guest_name || 'نزيل'} (غرفة ${r.room_number || '-'})`,
          subtitle: `الحالة: ${r.status} • الوصول: ${r.check_in_date || '-'} • المغادرة: ${r.check_out_date || '-'}`,
          badge: r.status,
          actionFn: () => {
            if (App.Helpers.openReservationPreview) App.Helpers.openReservationPreview(r.id);
          }
        });
      });

      // Match Guests
      guests.filter(g =>
        matchText(g.name) ||
        normalizeDigits(String(g.phone || '')).includes(q) ||
        normalizeDigits(String(g.id_number || '')).includes(q)
      ).slice(0, 5).forEach(g => {
        results.push({
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

    renderPaletteResults(results);
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
        <div class="command-palette-item ${isSelected ? 'is-selected' : ''} ${item.isUrgent ? 'is-urgent' : ''}" data-index="${index}" role="option" aria-selected="${isSelected}">
          <div class="command-palette-item-main">
            <div class="command-palette-item-icon">${item.icon || '⚡'}</div>
            <div class="command-palette-item-texts">
              <div class="command-palette-item-title">${escapePaletteText(item.title)}</div>
              <div class="command-palette-item-subtitle">${escapePaletteText(item.subtitle || '')}</div>
            </div>
          </div>
          ${item.badge ? `<span class="command-palette-item-badge">${escapePaletteText(item.badge)}</span>` : ''}
        </div>
      `;
    });

    paletteResults.innerHTML = html;

    // Attach click handlers
    paletteResults.querySelectorAll('.command-palette-item').forEach(el => {
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
    closeCommandPalette();
    if (typeof item.actionFn === 'function') {
      try {
        item.actionFn();
      } catch (err) {
        console.error('Error executing command palette action:', err);
      }
    }
  }

  function switchViewSection(sectionName) {
    const navLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
    if (navLink) navLink.click();
  }

  async function markRoomCleanDirectly(room) {
    if (!room || !window.api || !window.api.updateRoomStatus) return;
    try {
      const res = await window.api.updateRoomStatus(room.id, 'متاحة');
      if (res && res.success) {
        App.Helpers.showToast(`تم تحديث غرفة ${room.room_number} إلى "متاحة" بنجاح ✓`, 'success');
        room.status = 'متاحة';
        // Refresh room grid if active
        if (typeof window.DashboardApp?.Helpers?.renderRoomsGrid === 'function') {
          window.DashboardApp.Helpers.renderRoomsGrid();
        }
        updateAttentionInbox();
      } else {
        App.Helpers.showToast(res?.error || 'تعذر تحديث حالة الغرفة.', 'error');
      }
    } catch (err) {
      App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ATTENTION INBOX MODAL & OVERVIEW WIDGET
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

    // Close on Escape inside attention inbox modal
    attentionModal.addEventListener('keydown', event => {
      if (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeAttentionInboxModal();
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
    if (currentAttentionFilter === 'all') {
      items = [
        ...data.lateCheckouts,
        ...data.departuresToday,
        ...data.unpaidBalances,
        ...data.dirtyRooms,
        ...data.monthlyDue,
        ...data.legacyDeposits
      ];
    } else if (currentAttentionFilter === 'late-checkout') items = data.lateCheckouts;
    else if (currentAttentionFilter === 'departures-today') items = data.departuresToday;
    else if (currentAttentionFilter === 'unpaid-balance') items = data.unpaidBalances;
    else if (currentAttentionFilter === 'dirty-rooms') items = data.dirtyRooms;
    else if (currentAttentionFilter === 'monthly-due') items = data.monthlyDue;
    else if (currentAttentionFilter === 'legacy-deposit') items = data.legacyDeposits;

    if (!items.length) {
      listEl.innerHTML = `
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

    listEl.innerHTML = items.map((item, idx) => {
      const bStyle = badgeStyles[item.badgeClass] || badgeStyles.info;
      return `
        <div class="attention-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: transform 0.15s ease;">
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
      if (App.Helpers.openContractSettleModal) {
        App.Helpers.openContractSettleModal(item.reservation);
      }
    } else if (item.action === 'payment' && item.reservation) {
      if (window.openAddPaymentModal) {
        window.openAddPaymentModal(item.reservation.id);
      }
    } else if (item.action === 'extend' && item.reservation) {
      if (window.openExtendStayModal) {
        window.openExtendStayModal(item.reservation.id);
      }
    } else if (item.action === 'preview' && item.reservation) {
      if (App.Helpers.openReservationPreview) {
        App.Helpers.openReservationPreview(item.reservation.id);
      }
    } else if (item.action === 'mark-clean' && item.room) {
      markRoomCleanDirectly(item.room);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. GLOBAL SYNC & OVERVIEW WIDGET UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  function updateAttentionInbox() {
    const data = computeAttentionInbox();

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
  // 6. INITIALIZATION & EXPORTS
  // ─────────────────────────────────────────────────────────────────────────────

  function initCommandPalette() {
    ensurePaletteElements();
    ensureAttentionModal();

    // Sync database data right away so cache is ready before user interactions
    syncDataFromDb();

    // Wire Topbar Button
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
    setInterval(updateAttentionInbox, 20000);
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
    normalizeArabic,
    normalizeDigits,
    stripDiacritics,
    transliterateEnToAr,
    getRooms,
    getReservations,
    getGuests
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommandPalette, { once: true });
  } else {
    initCommandPalette();
  }

})(window, document, window.DashboardApp);
