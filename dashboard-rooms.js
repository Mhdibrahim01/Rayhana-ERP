(function(App) {
  'use strict';

  let currentRoomFilter = 'all';
  let currentRoomSearch = '';
  let currentRoomBookingType = 'all';
  let currentRoomPaymentFilter = 'all';


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
        App.State.roomsCache = roomsRes.data || [];
      }
      if (resRes && resRes.success) {
        App.State.reservationsCache = resRes.data || [];
      }
      renderRoomsGrid();
    } catch (err) {
      console.error('Error loading rooms:', err);
    }
  }

  /**
     * Current session role, read from the same source the other RBAC checks in this file
     * use. Presentation only — the main process is the security boundary.
     *
     * Needed here, and not the .admin-only class that applyRbacUi uses, because the rooms
     * grid is rebuilt via innerHTML on every loadRoomsData() (search, filter, checkout,
     * refresh) while applyRbacUi only runs once at login. A class-only button would be
     * re-inserted visible for a non-Admin on the next render. Static controls elsewhere
     * (e.g. #btn-toggle-add-room) can and do use the class.
     */
    function isCurrentUserAdmin() {
    const role = localStorage.getItem('currentUserRole') || (App.State.currentUser ? App.State.currentUser.role : null);
    return role === 'Admin';
  }

  function setActiveRoomFilterButton(buttons, selectedButton) {
    buttons.forEach(button => {
      const isSelected = button === selectedButton;
      button.classList.toggle('active', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    });
  }

  function updateRoomFilterSummary() {
    const activeCount = [
      currentRoomFilter !== 'all',
      currentRoomBookingType !== 'all',
      currentRoomPaymentFilter !== 'all',
      currentRoomSearch.trim() !== ''
    ].filter(Boolean).length;

    if (App.DOM.roomsFilterResult) App.DOM.roomsFilterResult.hidden = activeCount > 0;
    if (App.DOM.roomsActiveFilterCount) App.DOM.roomsActiveFilterCount.textContent = String(activeCount);
    if (App.DOM.roomsClearFiltersButton) App.DOM.roomsClearFiltersButton.classList.toggle('visible', activeCount > 0);
  }

  function renderRoomsGrid() {
    const searchTerm = currentRoomSearch.trim().toLowerCase();
    const today = String(App.State.businessDate || App.Helpers.getLocalDateString());
    const futureReservationByRoom = new Map();

    // Index each room's nearest future confirmed reservation once per render,
    // instead of filtering and sorting the full reservation cache for every card.
    App.State.reservationsCache.forEach(reservation => {
      if (reservation.status !== 'مؤكد' || !reservation.check_in_date || reservation.check_in_date <= today) return;

      const current = futureReservationByRoom.get(reservation.room_id);
      if (!current || reservation.check_in_date.localeCompare(current.check_in_date) < 0) {
        futureReservationByRoom.set(reservation.room_id, reservation);
      }
    });

    const filtered = App.State.roomsCache.filter(room => {
      // 1. Status tab filter (unchanged behaviour)
      if (currentRoomFilter !== 'all' && room.status !== currentRoomFilter) return false;

      // 2. Search filter: room_number or type, case-insensitive
      if (searchTerm) {
        const inNumber = String(room.room_number || '').toLowerCase().includes(searchTerm);
        const inType   = String(room.type || '').toLowerCase().includes(searchTerm);
        if (!inNumber && !inType) return false;
      }

      // 3. Booking-type filter: match against the room's active confirmed reservation.
      //    Rooms with no active reservation are excluded when a type filter is active.
      if (currentRoomBookingType !== 'all') {
        const activeRes = (room.active_reservations || [])[0];
        if (!activeRes || activeRes.booking_type !== currentRoomBookingType) return false;
      }

      if (currentRoomPaymentFilter !== 'all') {
        const currentGuestReservation = room.status === 'مشغولة'
          ? (room.active_reservations || [])[0]
          : (room.status === 'محجوزة' ? futureReservationByRoom.get(room.id) : null);
        if (!currentGuestReservation) return false;
        const paymentStatus = currentGuestReservation.payment_status === 'مكتمل'
          ? 'مدفوع بالكامل'
          : (currentGuestReservation.payment_status || 'غير مدفوع');
        if (paymentStatus !== currentRoomPaymentFilter) return false;
      }

      return true;
    });

    updateRoomFilterSummary();

    if (filtered.length === 0) {
      App.DOM.roomsGridContainer.innerHTML = `
        <div class="empty-state-unified" style="grid-column: 1 / -1; padding: 48px 24px;">
          <div class="empty-icon" aria-hidden="true" style="font-size: 2.2rem; margin-bottom: 8px;">🚪</div>
          <h4 style="font-weight: 800; color: #1e293b; margin: 0 0 6px;">لا توجد غرف مطابقة</h4>
          <p style="color: #64748b; font-size: 0.86rem; margin: 0;">لا توجد أي غرف مطابقة لمعايير البحث أو التصفية الحالية.</p>
        </div>
      `;
      return;
    }

    App.DOM.roomsGridContainer.innerHTML = filtered.map(room => {
      let borderClass = 'status-border-available';
      if (room.status === 'مشغولة') borderClass = 'status-border-occupied';
      else if (room.status === 'محجوزة') borderClass = 'status-border-reserved';
      else if (room.status === 'تنظيف') borderClass = 'status-border-cleaning';

      // The database supplies active reservations using the shared room-status definition.
      const activeReservations = room.active_reservations || [];
      const activeRes = room.status === 'مشغولة' ? activeReservations[0] || null : null;
      const nextActiveRes = room.status === 'مشغولة' ? activeReservations[1] || null : null;
      const activeLateCheckout = activeRes ? App.Helpers.isLateCheckout(activeRes) : false;

      // Future reservations remain a separate lookup; cleaning rooms show the next arrival too.
      const futureReservation = futureReservationByRoom.get(room.id) || null;
      const upcomingRes = (room.status === 'محجوزة' || room.status === 'متاحة')
        ? futureReservation
        : null;
      const cleaningIncomingRes = room.status === 'تنظيف'
        ? activeReservations[0] || futureReservation
        : null;

      const formatRoomCardMoney = value => `${Number(value || 0).toLocaleString('ar-SA-u-nu-latn')} ر.س`;
      const formatRoomCardDate = value => {
        const raw = String(value || '').slice(0, 10).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : App.Helpers.escapeHtml(String(value || ''));
      };
      const splitRoomType = value => {
        const match = String(value || '').match(/^\s*(.*?)\s*\(([^()]*)\)\s*$/);
        return { arabic: match?.[1] || String(value || 'نوع الغرفة'), english: match?.[2] || '' };
      };

      const renderRoomGuestBox = (reservation, label, dateLabel, dateValue) => {
        if (!reservation) return '';
        const total = Math.max(0, Number(reservation.total_price || 0));
        const paid = Math.max(0, Number((reservation.ledger_paid_amount ?? reservation.paid_amount) || 0));
        const rawRemaining = total - paid;
        const isCredit = rawRemaining < -0.005;
        const isOpenContract = reservation.booking_type === 'عقد مفتوح' || !reservation.check_out_date;
        const currentRoom = App.State.roomsCache.find(item => item.id === reservation.room_id) || room;
        const nightlyRate = Number(reservation.custom_nightly_price || reservation.price_per_night || currentRoom.price_per_night || 0);
        const start = String(reservation.check_in_date || today).slice(0, 10).split('-').map(Number);
        const end = today.split('-').map(Number);
        const elapsedNights = Math.max(1, Math.round((Date.UTC(end[0], end[1] - 1, end[2]) - Date.UTC(start[0], start[1] - 1, start[2])) / 86400000));
        const runningCharge = Math.max(0, Math.round((elapsedNights * nightlyRate - Number(reservation.discount_amount || 0)) * 100) / 100);

        const checkOutDateStr = String(reservation.check_out_date || '').slice(0, 10);
        const isOverdue = reservation.status === 'مؤكد' && !isOpenContract && checkOutDateStr && checkOutDateStr < today;
        const overdueDays = isOverdue
          ? Math.max(0, Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(checkOutDateStr + 'T00:00:00Z')) / 86400000))
          : 0;

        const effectiveTotal = (isOpenContract || isOverdue) ? Math.max(total, runningCharge) : total;
        const effectiveRawRemaining = effectiveTotal - paid;
        const isEffectiveCredit = effectiveRawRemaining < -0.005;
        const remaining = Math.max(0, effectiveRawRemaining);
        const ledgerDeposit = Number(reservation.deposit_ledger_balance || 0);
        const legacyDeposit = Number(reservation.deposit_legacy_unreconciled || 0) === 1
          ? Number(reservation.deposit_amount || 0) : 0;
        const deposit = Math.max(0, ledgerDeposit || legacyDeposit);
        const isLegacyDeposit = Number(reservation.deposit_legacy_unreconciled || 0) === 1 && deposit > 0;
        const depositBadge = isLegacyDeposit ? ` <span class="deposit-legacy-badge" title="تأمين مسجل بالنظام القديم يحتاج لمطابقة" style="color:#d97706;font-size:0.75rem;font-weight:700;">(قديم ⚠️)</span>` : '';
        const depositHtml = `${formatRoomCardMoney(deposit)}${depositBadge}`;

        let paymentStatus;
        if (isOpenContract) {
          paymentStatus = runningCharge <= 0
            ? (paid > 0 ? 'مدفوع بالكامل' : 'غير مدفوع')
            : (paid > runningCharge + 0.005 ? 'رصيد دائن' : (paid >= runningCharge - 0.005 ? 'مدفوع بالكامل' : (paid > 0 ? 'مدفوع جزئياً' : 'غير مدفوع')));
        } else if (isOverdue) {
          paymentStatus = isCredit
            ? 'مدفوع بالكامل'
            : (remaining <= 0.005 ? 'مدفوع بالكامل' : (paid > 0 ? 'مدفوع جزئياً' : 'غير مدفوع'));
        } else {
          paymentStatus = isCredit ? 'مدفوع بالكامل' : (reservation.payment_status || 'غير مدفوع');
        }

        const creditHtml = `<span style="color:#2563eb;">له رصيد: <strong>${Math.abs(rawRemaining).toLocaleString()} ريال</strong></span>`;
        const overdueRemainingHtml = isOverdue && effectiveTotal > total && remaining > 0
          ? `متبقي (مع ${overdueDays} ليالٍ تأخير): <strong style="color:#dc2626;">${formatRoomCardMoney(remaining)}</strong>`
          : `متبقي: ${formatRoomCardMoney(remaining)}`;

        const contractCreditHtml = `<span style="color:#2563eb;">له رصيد: <strong>${Math.abs(effectiveRawRemaining).toLocaleString()} ر.س</strong></span>`;
        const contractOwedHtml = remaining > 0
          ? `متبقي: <strong style="color:#dc2626;">${formatRoomCardMoney(remaining)}</strong>`
          : `مسدد بالكامل`;
        const financialLine = isOpenContract
          ? `المستحق (${elapsedNights} ليالٍ): ${formatRoomCardMoney(runningCharge)} · مدفوع: ${formatRoomCardMoney(paid)} · ${isEffectiveCredit ? contractCreditHtml : contractOwedHtml} · التأمين: ${depositHtml}`
          : `مدفوع: ${formatRoomCardMoney(paid)} · ${isCredit ? creditHtml : overdueRemainingHtml} · التأمين: ${depositHtml}`;
        const safeName = App.Helpers.escapeHtml(reservation.guest_name || 'نزيل');
        return `
          <div class="room-card-guest-box" dir="rtl">
            <div class="room-card-guest-heading">
              <strong class="room-card-guest-name" title="${safeName}">${safeName}</strong>
              <span class="room-card-guest-booking">#${String(reservation.id).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))}</span>
              ${App.Helpers.getPaymentStatusBadge(paymentStatus)}
            </div>
            <div class="room-card-guest-date">${App.Helpers.escapeHtml(label)}: <strong>${dateValue ? formatRoomCardDate(dateValue) : (isOpenContract ? 'عقد مفتوح' : 'غير محدد')}</strong></div>
            <div class="room-card-guest-financials">${financialLine}</div>
            <button type="button" class="room-card-guest-details" data-action="preview-reservation" data-id="${reservation.id}" data-no-card-click>التفاصيل ←</button>
          </div>
        `;
      };

      const typeNames = splitRoomType(room.type);
      const checkOutDateVal = (activeRes && activeRes.check_out_date) || room.check_out_date;
      const hasCheckOut = checkOutDateVal && String(checkOutDateVal).trim() !== '';
      const overflowItems = [
        `<button type="button" class="room-card-overflow-item" data-action="room-revenue" data-room-id="${room.id}" title="تقرير إيرادات الغرفة">إيرادات الغرفة</button>`,
        ...(room.status === 'مشغولة' && activeRes && hasCheckOut && String(checkOutDateVal) !== 'مفتوح' ? [`<button type="button" class="room-card-overflow-item" data-action="extend" data-id="${activeRes.id}" title="تمديد فترة الإقامة">تمديد الإقامة</button>`] : []),
        ...(room.status === 'مشغولة' && activeRes && activeRes.booking_type !== 'استخدام يومي' ? [`<button type="button" class="room-card-overflow-item" data-action="transfer" data-id="${activeRes.id}" title="نقل النزيل إلى غرفة أخرى">نقل الغرفة</button>`] : []),
        ...(room.status === 'محجوزة' && upcomingRes ? [`<button type="button" class="room-card-overflow-item is-danger" data-action="cancel" data-id="${upcomingRes.id}" aria-label="إلغاء الحجز" title="إلغاء الحجز">إلغاء الحجز</button>`] : []),
        ...((room.status === 'متاحة' || room.status === 'تنظيف') ? [`<label class="room-card-overflow-status">تغيير الحالة<select class="room-status-select" data-room-id="${room.id}"><option value="متاحة" ${room.status === 'متاحة' ? 'selected' : ''}>متاحة</option><option value="تنظيف" ${room.status === 'تنظيف' ? 'selected' : ''}>تنظيف</option></select></label>`] : [])
      ].join('');

      return `
        <div class="room-card room-card-redesigned room-card-ops-refined ${room.status === 'مشغولة' && activeRes ? 'room-card-ops-clickable' : ''} ${borderClass}" data-room-id="${room.id}" data-room-status="${App.Helpers.escapeHtml(room.status)}" ${room.status === 'مشغولة' && activeRes ? `tabindex="0" role="button" aria-label="تفاصيل الغرفة ${App.Helpers.escapeHtml(String(room.room_number))}"` : ''}>
          <div class="room-card-content room-card-ops-content">
            <div class="room-card-ops-header" data-room-card-header>
              <div class="room-card-ops-title">
                <div class="room-card-number">غرفة ${App.Helpers.escapeHtml(String(room.room_number).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))))}</div>
                <div class="room-card-type-ar">${App.Helpers.escapeHtml(typeNames.arabic)}</div>
                ${typeNames.english ? `<div class="room-card-type-en">${App.Helpers.escapeHtml(typeNames.english)}</div>` : ''}
              </div>
              <div class="room-card-ops-header-actions">
                <div class="room-card-ops-badges">${App.Helpers.getRoomStatusBadge(room.status)}</div>
                ${room.status === 'مشغولة' && activeRes ? `<button type="button" class="btn-row icon-ghost room-card-view-action" data-action="preview-reservation" data-id="${activeRes.id}" aria-label="تفاصيل الغرفة ${App.Helpers.escapeHtml(String(room.room_number))}" title="تفاصيل الغرفة">${App.Helpers.icons?.eye || '◉'}</button>` : ''}
                ${isCurrentUserAdmin() ? `<button type="button" class="btn-row icon-ghost room-card-edit-action" data-action="edit-room" data-room-id="${room.id}" aria-label="تعديل الغرفة ${App.Helpers.escapeHtml(String(room.room_number))}" title="تعديل تفاصيل الغرفة">✎</button>` : ''}
                <div class="room-card-overflow" data-no-card-click>
                  <button type="button" class="btn-row icon-ghost room-card-overflow-toggle" aria-label="إجراءات إضافية للغرفة ${App.Helpers.escapeHtml(String(room.room_number))}" aria-expanded="false" title="إجراءات إضافية">⋯</button>
                  <div class="overflow-menu room-card-overflow-menu" role="menu" hidden>${overflowItems}</div>
                </div>
              </div>
            </div>

            <div class="room-card-ops-price-row"><span class="room-card-ops-price-label">السعر اليومي</span><strong>${formatRoomCardMoney(room.price_per_night)}</strong></div>
            <div class="room-card-ops-price-row"><span class="room-card-ops-price-label">السعر الشهري</span><strong>${room.monthly_price == null ? 'غير محدد' : formatRoomCardMoney(room.monthly_price)}</strong></div>

            ${activeRes ? renderRoomGuestBox(activeRes, 'المغادرة', 'مغادرة', checkOutDateVal) : ''}
            ${!activeRes && room.status === 'محجوزة' && upcomingRes
              ? renderRoomGuestBox(upcomingRes, 'حجز قادم', 'الوصول', upcomingRes.check_in_date)
              : ''}
            ${nextActiveRes ? `<div class="room-card-incoming-note"><strong>${App.Helpers.escapeHtml(nextActiveRes.guest_name || 'نزيل')}</strong><span>قادم اليوم #${String(nextActiveRes.id)}</span><small>الوصول: ${formatRoomCardDate(nextActiveRes.check_in_date)}</small></div>` : ''}
            ${!activeRes && room.status !== 'محجوزة' && (upcomingRes || cleaningIncomingRes) ? (() => {
              const cardReservation = cleaningIncomingRes || upcomingRes;
              const arrivalLabel = room.status === 'تنظيف'
                ? (cardReservation.check_in_date === today ? 'قادم اليوم' : 'بانتظار جاهزية الغرفة')
                : 'حجز قادم';
              return `<div class="room-card-incoming-note"><strong>${App.Helpers.escapeHtml(cardReservation.guest_name || 'نزيل')}</strong><span>${arrivalLabel} #${String(cardReservation.id)}</span><small>الوصول: ${formatRoomCardDate(cardReservation.check_in_date)}</small></div>`;
            })() : ''}
            ${activeLateCheckout ? '<div class="room-late-checkout-alert">⚠️ تأخر بالمغادرة بعد الساعة 14:00 ظهراً - مطلوب إجراء فوري</div>' : ''}
          </div>

          <footer class="room-card-footer room-card-ops-footer">
            <div class="room-card-footer-actions">
              ${room.status === 'متاحة' ? `<button type="button" class="btn-row primary room-card-state-action" data-action="quick-book" data-room-id="${room.id}">+ تسكين وحجز فوري</button>` : ''}
              ${room.status === 'تنظيف' ? `<button type="button" class="btn-row primary room-card-state-action room-card-ready-action" data-action="quick-ready" data-room-id="${room.id}">اكتمال النظافة (جاهزة)</button>` : ''}
              ${room.status === 'مشغولة' && activeRes ? `
                <button type="button" class="btn-row primary room-card-checkout-action" data-action="checkout" data-id="${activeRes.id}">${activeLateCheckout ? '🚪 ' : ''}تسوية وخروج</button>
                <button type="button" class="btn-row icon-ghost room-card-invoice-action" data-action="invoice" data-id="${activeRes.id}" aria-label="الفاتورة" title="الفاتورة">▤</button>
              ` : ''}
              ${room.status === 'محجوزة' && upcomingRes ? `
                <button type="button" class="btn-row primary room-card-state-action" data-action="quick-book" data-room-id="${room.id}">تأكيد الوصول الآن</button>
                <button type="button" class="btn-row secondary room-card-state-action" data-action="invoice" data-id="${upcomingRes.id}">فاتورة الحجز</button>
              ` : ''}
            </div>
          </footer>
        </div>
      `;
    }).join('');
  }

  App.Helpers.initRooms = function() {
  App.DOM.roomsFilterTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveRoomFilterButton(App.DOM.roomsFilterTabs, btn);
      currentRoomFilter = btn.dataset.roomFilter;
      renderRoomsGrid();
    });
  });

  App.DOM.roomsPaymentFilterTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveRoomFilterButton(App.DOM.roomsPaymentFilterTabs, btn);
      currentRoomPaymentFilter = btn.dataset.roomPaymentStatus;
      renderRoomsGrid();
    });
  });

  if (App.DOM.roomsClearFiltersButton) {
    App.DOM.roomsClearFiltersButton.addEventListener('click', () => {
      currentRoomFilter = 'all';
      currentRoomBookingType = 'all';
      currentRoomPaymentFilter = 'all';
      currentRoomSearch = '';
      if (App.DOM.searchRoomsInput) App.DOM.searchRoomsInput.value = '';
      setActiveRoomFilterButton(App.DOM.roomsFilterTabs, App.DOM.roomsFilterTabs[0]);
      setActiveRoomFilterButton(App.DOM.roomsBookingTypeTabs, App.DOM.roomsBookingTypeTabs[0]);
      setActiveRoomFilterButton(App.DOM.roomsPaymentFilterTabs, App.DOM.roomsPaymentFilterTabs[0]);
      renderRoomsGrid();
    });
  }

  window.openRoomsFiltered = function (status) {
    window.switchView('rooms');
    const filterButton = Array.from(App.DOM.roomsFilterTabs).find(btn => btn.dataset.roomFilter === status);
    if (filterButton) filterButton.click();
  };

  // Search rooms by room_number / type — re-render on every keystroke
  if (App.DOM.searchRoomsInput) {
    App.DOM.searchRoomsInput.addEventListener('input', () => {
      currentRoomSearch = App.DOM.searchRoomsInput.value;
      renderRoomsGrid();
    });
  }

  // Booking-type filter tabs
  App.DOM.roomsBookingTypeTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveRoomFilterButton(App.DOM.roomsBookingTypeTabs, btn);
      currentRoomBookingType = btn.dataset.roomBookingType;
      renderRoomsGrid();
    });
  });

  // Delegated room-card interactions. Occupied cards reuse the existing reservation preview;
  // existing quick-book clicks on available/reserved cards remain intact.
  let roomPreviewOpening = false;
  const openOccupiedRoomPreview = async card => {
    const modal = document.getElementById('reservation-preview-modal');
    if (roomPreviewOpening || modal?.style.display === 'flex') return;

    const targetRoom = App.State.roomsCache.find(room => room.id === parseInt(card.dataset.roomId, 10));
    const reservation = targetRoom?.status === 'مشغولة' ? targetRoom.active_reservations?.[0] : null;
    if (!reservation) return;

    roomPreviewOpening = true;
    try {
      await App.Helpers.openReservationPreview(reservation.id);
      roomPreviewOpening = false;
      const openedModal = document.getElementById('reservation-preview-modal');
      if (!openedModal || openedModal.style.display !== 'flex') {
        if (card.isConnected) card.focus();
        return;
      }
      const observer = new MutationObserver(() => {
        if (openedModal.style.display === 'flex') return;
        observer.disconnect();
        if (card.isConnected) card.focus();
      });
      observer.observe(openedModal, { attributes: true, attributeFilter: ['style'] });
    } catch (error) {
      roomPreviewOpening = false;
      if (card.isConnected) card.focus();
      console.error('Unable to open room reservation preview:', error);
    }
  };

  App.DOM.roomsGridContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.room-card-ops-refined');
    const toggle = e.target.closest('.room-card-overflow-toggle');
    if (toggle && card) {
      const menu = card.querySelector('.room-card-overflow-menu');
      const opening = menu?.hidden;
      App.DOM.roomsGridContainer.querySelectorAll('.room-card-overflow-menu:not([hidden])').forEach(openMenu => {
        if (openMenu !== menu) {
          openMenu.hidden = true;
          openMenu.closest('.room-card-overflow')?.querySelector('.room-card-overflow-toggle')?.setAttribute('aria-expanded', 'false');
        }
      });
      if (menu) menu.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(Boolean(opening)));
      return;
    }
    if (e.target.closest('button, a, [data-no-card-click], .overflow-menu, select, input')) {
      const containingMenu = e.target.closest('.room-card-overflow-menu');
      if (containingMenu && !e.target.closest('select')) {
        containingMenu.hidden = true;
        containingMenu.closest('.room-card-overflow')?.querySelector('.room-card-overflow-toggle')?.setAttribute('aria-expanded', 'false');
      }
      return;
    }
    App.DOM.roomsGridContainer.querySelectorAll('.room-card-overflow-menu:not([hidden])').forEach(openMenu => {
      openMenu.hidden = true;
      openMenu.closest('.room-card-overflow')?.querySelector('.room-card-overflow-toggle')?.setAttribute('aria-expanded', 'false');
    });
    if (!card) return;

    const roomId = card.dataset.roomId;
    const targetRoom = App.State.roomsCache.find(r => r.id === parseInt(roomId, 10));
    if (targetRoom?.status === 'مشغولة') {
      openOccupiedRoomPreview(card);
    } else if (targetRoom && (targetRoom.status === 'متاحة' || targetRoom.status === 'محجوزة')) {
      window.DashboardApp.Helpers.initiateRoomBooking(roomId);
    }
  });

  App.DOM.roomsGridContainer.addEventListener('keydown', e => {
    const card = e.target.closest('.room-card-ops-clickable');
    if (!card || e.target !== card || !['Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    openOccupiedRoomPreview(card);
  });

  App.DOM.roomsGridContainer.addEventListener('change', async (e) => {
    const select = e.target.closest('.room-status-select');
    if (!select) return;

    const roomId = parseInt(select.dataset.roomId, 10);
    const newStatus = select.value;

    const targetRoom = App.State.roomsCache.find(r => r.id === roomId);
    if (targetRoom && targetRoom.status === 'مشغولة') {
      App.Helpers.showToast(`لا يمكن تغيير حالة الغرفة (${targetRoom.room_number}) لأنها مشغولة بحجز نشط. يجب تسجيل المغادرة أولاً.`, 'error');
      renderRoomsGrid();
      return;
    }

    try {
      const res = await window.api.updateRoomStatus(roomId, newStatus);
      if (res.success) {
        App.Helpers.showToast(`تم تحديث حالة الغرفة إلى "${newStatus}"`, 'success');
        await loadRoomsData();
        await App.Helpers.loadOverviewData();
      } else {
        App.Helpers.showToast('فشل تحديث حالة الغرفة.', 'error');
      }
    } catch (err) {
      App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
      await loadRoomsData();
    }
  });

  App.DOM.btnToggleAddRoom.addEventListener('click', () => {
    const isHidden = App.DOM.addRoomPanel.style.display === 'none';
    App.DOM.addRoomPanel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) App.DOM.newRoomNumber.focus();
  });

  App.DOM.btnCancelAddRoom.addEventListener('click', () => {
    App.DOM.addRoomPanel.style.display = 'none';
    App.DOM.addRoomForm.reset();
  });

  App.DOM.addRoomForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const room_number = App.DOM.newRoomNumber.value.trim();
    const type = App.DOM.newRoomType.value.trim();
    const price_per_night = parseFloat(App.DOM.newRoomPrice.value) || 0;
    const monthly_price = parseFloat(App.DOM.newRoomMonthlyPrice.value) || 0;
    const status = App.DOM.newRoomStatus.value;

    if (!room_number || !type || price_per_night <= 0 || monthly_price <= 0) {
      App.Helpers.showToast('يرجى إدخال السعر اليومي والسعر الشهري بقيمة أكبر من الصفر.', 'error');
      return;
    }

    try {
      const res = await window.api.addRoom({ room_number, type, price_per_night, monthly_price, status });
      if (res.success) {
        App.Helpers.showToast(`تمت إضافة الغرفة ${room_number} بنجاح!`, 'success');
        App.DOM.addRoomForm.reset();
        App.DOM.addRoomPanel.style.display = 'none';
        await loadRoomsData();
      } else {
        App.Helpers.showToast(res.error || 'فشل في إضافة الغرفة.', 'error');
      }
    } catch (err) {
      App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  // Edit Room Modal Functions
  App.Helpers.openEditRoomModal = function(roomId) {
    const room = App.State.roomsCache.find(r => r.id === parseInt(roomId, 10));
    if (!room) {
      App.Helpers.showToast('لم يتم العثور على بيانات الغرفة.', 'error');
      return;
    }
    if (App.DOM.editRoomId) App.DOM.editRoomId.value = room.id;
    if (App.DOM.editRoomNumber) App.DOM.editRoomNumber.value = room.room_number || '';
    if (App.DOM.editRoomType) App.DOM.editRoomType.value = room.type || '';
    if (App.DOM.editRoomPrice) App.DOM.editRoomPrice.value = room.price_per_night || '';
    if (App.DOM.editRoomMonthlyPrice) App.DOM.editRoomMonthlyPrice.value = room.monthly_price ?? '';

    const isOccupied = room.status === 'مشغولة';
    if (App.DOM.editRoomStatus) {
      App.DOM.editRoomStatus.value = room.status || 'متاحة';
      App.DOM.editRoomStatus.disabled = isOccupied;
      if (isOccupied) {
        App.DOM.editRoomStatus.title = "الغرفة مشغولة بنزيل حالياً - مقفلة حتى تسجيل المغادرة (Check-out)";
      } else {
        App.DOM.editRoomStatus.title = "";
      }
    }

    if (App.DOM.editRoomStatusLockedHint) {
      App.DOM.editRoomStatusLockedHint.style.display = isOccupied ? 'block' : 'none';
    }

    if (App.DOM.btnDeleteRoom) {
      if (isOccupied) {
        App.DOM.btnDeleteRoom.disabled = true;
        App.DOM.btnDeleteRoom.style.opacity = '0.5';
        App.DOM.btnDeleteRoom.style.cursor = 'not-allowed';
        App.DOM.btnDeleteRoom.title = "لا يمكن حذف الغرفة لأنها مشغولة بحجز نشط";
      } else {
        App.DOM.btnDeleteRoom.disabled = false;
        App.DOM.btnDeleteRoom.style.opacity = '1';
        App.DOM.btnDeleteRoom.style.cursor = 'pointer';
        App.DOM.btnDeleteRoom.title = "";
      }
    }

    if (App.DOM.editRoomModal) {
      App.DOM.editRoomModal.style.display = 'flex';
    }
    if (App.DOM.editRoomNumber) {
      App.DOM.editRoomNumber.focus();
    }
  }

  const closeEditRoomModal = function() {
    if (App.DOM.editRoomModal) {
      App.DOM.editRoomModal.style.display = 'none';
    }
    if (App.DOM.editRoomStatus) {
      App.DOM.editRoomStatus.disabled = false;
      App.DOM.editRoomStatus.title = "";
    }
    if (App.DOM.editRoomStatusLockedHint) {
      App.DOM.editRoomStatusLockedHint.style.display = 'none';
    }
    if (App.DOM.btnDeleteRoom) {
      App.DOM.btnDeleteRoom.disabled = false;
      App.DOM.btnDeleteRoom.style.opacity = '1';
      App.DOM.btnDeleteRoom.style.cursor = 'pointer';
      App.DOM.btnDeleteRoom.title = "";
    }
    if (App.DOM.editRoomForm) {
      App.DOM.editRoomForm.reset();
    }
  }

  if (App.DOM.btnCloseEditRoomModal) {
    App.DOM.btnCloseEditRoomModal.addEventListener('click', closeEditRoomModal);
  }
  if (App.DOM.btnCancelEditRoom) {
    App.DOM.btnCancelEditRoom.addEventListener('click', closeEditRoomModal);
  }
  if (App.DOM.editRoomModal) {
    App.DOM.editRoomModal.addEventListener('click', (e) => {
      if (e.target === App.DOM.editRoomModal) closeEditRoomModal();
    });
  }

  if (App.DOM.editRoomForm) {
    App.DOM.editRoomForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = parseInt(App.DOM.editRoomId.value, 10);
      const room_number = App.DOM.editRoomNumber.value.trim();
      const type = App.DOM.editRoomType.value.trim();
      const price_per_night = parseFloat(App.DOM.editRoomPrice.value) || 0;
      const monthly_price = parseFloat(App.DOM.editRoomMonthlyPrice.value) || 0;

      const currentRoom = App.State.roomsCache.find(r => r.id === id);
      const isOccupied = currentRoom && currentRoom.status === 'مشغولة';
      const status = isOccupied ? 'مشغولة' : App.DOM.editRoomStatus.value;

      if (!room_number || !type || price_per_night <= 0 || monthly_price <= 0) {
        App.Helpers.showToast('يرجى إدخال السعر اليومي والسعر الشهري بقيمة أكبر من الصفر.', 'error');
        return;
      }

      try {
        const res = await window.api.updateRoom({ id, room_number, type, price_per_night, monthly_price, status });
        if (res && res.success) {
          App.Helpers.showToast(`تم حفظ وتحديث بيانات الغرفة ${room_number} بنجاح! ✓`, 'success');
          closeEditRoomModal();
          await loadRoomsData();
          await App.Helpers.loadOverviewData();
          await App.Helpers.loadReservationsData();
        } else {
          App.Helpers.showToast(res?.error || 'فشل تحديث بيانات الغرفة.', 'error');
        }
      } catch (err) {
        App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
      }
    });
  }

  if (App.DOM.btnDeleteRoom) {
    App.DOM.btnDeleteRoom.addEventListener('click', async () => {
      const id = parseInt(App.DOM.editRoomId.value, 10);
      const roomNum = App.DOM.editRoomNumber.value.trim();
      if (!id) return;

      const currentRoom = App.State.roomsCache.find(r => r.id === id);
      if (currentRoom && currentRoom.status === 'مشغولة') {
        App.Helpers.showToast(`لا يمكن حذف الغرفة (${roomNum}) لأنها مشغولة بحجز نشط حالياً. يرجى إنهاء أو إلغاء الحجز أولاً.`, 'error');
        return;
      }

      const confirmed = await App.Helpers.showConfirmDialog({
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
          App.Helpers.showToast(`تم حذف الغرفة رقم ${roomNum} بنجاح.`, 'success');
          closeEditRoomModal();
          await loadRoomsData();
          await App.Helpers.loadOverviewData();
          await App.Helpers.loadReservationsData();
        } else {
          App.Helpers.showToast(res?.error || 'فشل حذف الغرفة.', 'error');
        }
      } catch (err) {
        App.Helpers.showToast(`خطأ أثناء الحذف: ${err.message}`, 'error');
      }
    });
  }

  };
  // =========================================================================
  // ROOM REVENUE REPORT MODAL
  // =========================================================================
  async function openRoomRevenueModal(roomId) {
    const targetId = parseInt(roomId, 10);
    if (!targetId || isNaN(targetId)) {
      App.Helpers.showToast('معرف الغرفة غير صالح.', 'error');
      return;
    }

    if (App.DOM.roomRevenueModal) {
      App.DOM.roomRevenueModal.style.display = 'flex';
    }

    if (App.DOM.roomRevenueContent) {
      App.DOM.roomRevenueContent.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <div class="spinner" style="margin: 0 auto 16px; border: 3px solid #cbd5e1; border-top: 3px solid #1a432a; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite;"></div>
          جاري استخراج تقرير إيرادات وحجوزات الغرفة...
        </div>
      `;
    }

    try {
      const res = await window.api.getRoomRevenue(targetId);
      if (!res || !res.success || !res.data) {
        if (App.DOM.roomRevenueContent) {
          App.DOM.roomRevenueContent.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #dc2626;">
              ${App.Helpers.escapeHtml(res?.error || 'تعذر تحميل بيانات إيرادات الغرفة.')}
            </div>
          `;
        }
        return;
      }

      const rev = res.data;
      const room = rev.room || {};
      const totalExpected = parseFloat(rev.total_expected || 0);
      const totalCollected = parseFloat(rev.total_collected || 0);
      const totalOutstanding = parseFloat(rev.total_outstanding || 0);
      const totalReservations = rev.total_reservations || 0;
      const breakdown = rev.breakdown || [];

      if (App.DOM.roomRevenueModalTitle) {
        App.DOM.roomRevenueModalTitle.textContent = `تقرير إيرادات غرفة ${room.room_number || ''} (${room.type || ''})`;
      }

      if (App.DOM.roomRevenueContent) {
        App.DOM.roomRevenueContent.innerHTML = `
          <!-- Room Info Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 style="margin: 0; font-size: 1.4rem; font-weight: 900; color: #1a432a;">غرفة ${App.Helpers.escapeHtml(room.room_number)}</h3>
                <span style="font-size: 0.85rem; color: #64748b; font-weight: 600;">${App.Helpers.escapeHtml(room.type)}</span>
                ${App.Helpers.getRoomStatusBadge(room.status)}
              </div>
              <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">
                السعر الأساسي: <strong style="color: #a67c52;">${parseFloat(room.price_per_night || 0).toLocaleString()} ر.س / ليلة</strong>
                <span style="margin: 0 6px;">|</span>
                إجمالي الحجوزات المسجلة: <strong>${totalReservations}</strong>
              </div>
            </div>
            <div style="text-align: left; font-size: 0.8rem; color: #64748b;">
              تاريخ الاستخراج: <span>${new Date().toLocaleDateString('ar-SA')}</span>
            </div>
          </div>

          <!-- Financial Summary Cards (3 Cards matching Shift Audit) -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
            <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="font-size: 0.8rem; color: #4338ca; font-weight: 700;">إجمالي متوقع</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #1e1b4b; margin-top: 4px;">
                ${totalExpected.toLocaleString()} <span style="font-size: 0.75rem;">ر.س</span>
              </div>
            </div>

            <div style="background: #ecfdf3; border: 1px solid #a7f3c4; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="font-size: 0.8rem; color: #047831; font-weight: 700;">محصّل فعلياً</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #065f28; margin-top: 4px;">
                ${totalCollected.toLocaleString()} <span style="font-size: 0.75rem;">ر.س</span>
              </div>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="font-size: 0.8rem; color: #b45309; font-weight: 700;">مبالغ لم تحصّل بعد</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #92400e; margin-top: 4px;">
                ${totalOutstanding.toLocaleString()} <span style="font-size: 0.75rem;">ر.س</span>
              </div>
            </div>
          </div>

          <!-- Breakdown Table -->
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e1b4b; margin-bottom: 12px;">سجل حجوزات الغرفة والعمليات المالية</h4>
          ${breakdown.length === 0 ? `
            <div style="padding: 30px; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 0.85rem;">
              لا توجد حجوزات مسجلة لهذه الغرفة حتى الآن.
            </div>
          ` : `
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                <thead style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                  <tr>
                    <th style="padding: 10px 12px; text-align: right; color: #334155;">#</th>
                    <th style="padding: 10px 12px; text-align: right; color: #334155;">اسم النزيل</th>
                    <th style="padding: 10px 12px; text-align: center; color: #334155;">تاريخ الوصول</th>
                    <th style="padding: 10px 12px; text-align: center; color: #334155;">تاريخ المغادرة</th>
                    <th style="padding: 10px 12px; text-align: left; color: #334155;">قيمة الحجز</th>
                    <th style="padding: 10px 12px; text-align: left; color: #334155;">المحصّل</th>
                    <th style="padding: 10px 12px; text-align: left; color: #334155;">المتبقي</th>
                    <th style="padding: 10px 12px; text-align: center; color: #334155;">الحالة</th>
                    <th style="padding: 10px 12px; text-align: center; color: #334155;">نوع الحجز</th>
                  </tr>
                </thead>
                <tbody>
                  ${breakdown.map((r, idx) => {
                    const price = parseFloat(r.total_price || 0);
                    const paid = parseFloat((r.ledger_paid_amount ?? r.paid_amount) || 0);
                    const collected = parseFloat(r.amount_collected || 0);
                    const rawRemaining = price - paid;
                    const isCredit = rawRemaining < -0.005;
                    const isOpenContract = r.booking_type === 'عقد مفتوح' || !r.check_out_date;
                    const remaining = isOpenContract ? rawRemaining : Math.max(0, rawRemaining);
                    const checkOutDisplay = (r.check_out_date === 'مفتوح' || !r.check_out_date) 
                      ? '<span style="color: #0284c7; font-weight: 700;">مفتوح</span>' 
                      : App.Helpers.escapeHtml(r.check_out_date);

                    return `
                      <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? 'background: #fcfcfc;' : ''}">
                        <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">#${r.id}</td>
                        <td style="padding: 9px 12px; font-weight: 700; color: #0f172a;">${App.Helpers.escapeHtml(r.guest_name || 'نزيل')}</td>
                        <td style="padding: 9px 12px; text-align: center; font-family: monospace; color: #334155;">${App.Helpers.escapeHtml(r.check_in_date || '-')}</td>
                        <td style="padding: 9px 12px; text-align: center; font-family: monospace; color: #334155;">${checkOutDisplay}</td>
                        <td style="padding: 9px 12px; text-align: left; font-weight: 700; color: #1e1b4b;">${price.toLocaleString()} ر.س</td>
                        <td style="padding: 9px 12px; text-align: left; font-weight: 700; color: #05963d;">${collected.toLocaleString()} ر.س</td>
                        <td style="padding: 9px 12px; text-align: left; font-weight: 700; color: ${isCredit ? '#2563eb' : (remaining > 0 ? '#dc2626' : '#64748b')};">
                          ${isCredit ? `له رصيد: ${Math.abs(rawRemaining).toLocaleString()} ريال` : (remaining > 0 ? `${remaining.toLocaleString()} ر.س` : '0 ر.س')}
                        </td>
                        <td style="padding: 9px 12px; text-align: center;">${App.Helpers.getReservationStatusBadge(r.status)}</td>
                        <td style="padding: 9px 12px; text-align: center;">${App.Helpers.getBookingTypeBadge(r.booking_type) || App.Helpers.escapeHtml(r.booking_type)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        `;
      }
    } catch (err) {
      console.error('Room revenue error:', err);
      App.Helpers.showToast(`خطأ في استخراج إيرادات الغرفة: ${err.message}`, 'error');
    }
  }


  App.Helpers.loadRoomsData = loadRoomsData;
  App.Helpers.openRoomRevenueModal = openRoomRevenueModal;
  App.Helpers.openRoomsFiltered = window.openRoomsFiltered;

})(window.DashboardApp);
