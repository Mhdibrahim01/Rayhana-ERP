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

  function renderRoomsGrid() {
    const searchTerm = currentRoomSearch.trim().toLowerCase();
    const today = App.Helpers.getLocalDateString();
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

    if (App.DOM.roomsPaymentFilterContainer) {
      App.DOM.roomsPaymentFilterContainer.style.display = currentRoomFilter === 'مشغولة' ? 'flex' : 'none';
    }

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
        const currentGuestReservation = room.status === 'مشغولة' ? (room.active_reservations || [])[0] : null;
        const paymentStatus = currentGuestReservation?.payment_status === 'مكتمل'
          ? 'مدفوع بالكامل'
          : (currentGuestReservation?.payment_status || 'غير مدفوع');
        if (paymentStatus !== currentRoomPaymentFilter) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      App.DOM.roomsGridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-light);">
          لا توجد غرف مطابقة لهذا التصنيف.
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

      // Future reservations remain a separate lookup; cleaning rooms show the next arrival too.
      const futureReservation = futureReservationByRoom.get(room.id) || null;
      const upcomingRes = (room.status === 'محجوزة' || room.status === 'متاحة')
        ? futureReservation
        : null;
      const cleaningIncomingRes = room.status === 'تنظيف'
        ? activeReservations[0] || futureReservation
        : null;

      const renderReservationPaymentSummary = reservation => {
        if (!reservation) return '';
        const total = Math.max(0, Number(reservation.total_price || 0));
        const paid = Math.max(0, Number(reservation.paid_amount || 0));
        const rawRemaining = total - paid;
        const isCredit = rawRemaining < -0.005;
        const remaining = Math.max(0, rawRemaining);
        const ledgerDeposit = Number(reservation.deposit_ledger_balance || 0);
        const legacyDeposit = Number(reservation.deposit_legacy_unreconciled || 0) === 1
          ? Number(reservation.deposit_amount || 0) : 0;
        const deposit = Math.max(0, ledgerDeposit || legacyDeposit);
        return `
          <div style="display:flex; flex-wrap:wrap; gap:5px 12px; margin-top:6px; font-size:0.72rem; line-height:1.5;">
            <span style="color:#047857;">مدفوع: <strong>${paid.toLocaleString()} ريال</strong></span>
            ${isCredit
              ? `<span style="color:#2563eb; font-weight:700;">له رصيد: <strong>${Math.abs(rawRemaining).toLocaleString()} ريال</strong></span>`
              : `<span style="color:${remaining > 0 ? '#dc2626' : '#64748b'};">متبقي: <strong>${remaining.toLocaleString()} ريال</strong></span>`
            }
            ${deposit > 0 ? `<span style="color:#7c3aed;">التأمين: <strong>${deposit.toLocaleString()} ريال</strong></span>` : ''}
          </div>
        `;
      };

      const checkOutDateVal = (activeRes && activeRes.check_out_date) || room.check_out_date;
      const hasCheckOut = checkOutDateVal && String(checkOutDateVal).trim() !== '';

      return `
        <div class="room-card room-card-redesigned ${borderClass}" data-room-id="${room.id}">
          <div class="room-card-content">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <div>
                <div style="font-size: 1.5rem; font-weight: 900; color: #1a4332; line-height: 1.2; letter-spacing: -0.01em;">
                  غرفة ${App.Helpers.escapeHtml(room.room_number)}
                </div>
                <p style="font-size: 0.84rem; font-weight: 600; color: #64748b; margin-top: 2px;">${App.Helpers.escapeHtml(room.type)}</p>
              </div>
              <div style="flex-shrink: 0;">
                ${App.Helpers.getRoomStatusBadge(room.status)}
              </div>
            </div>

            <div style="font-size: 1.1rem; font-weight: 900; color: #a67c52; margin-top: 8px;">
              ${parseFloat(room.price_per_night || 0).toLocaleString()} <span style="font-size: 0.75rem; font-weight: 600; color: #94a3b8;">ريال / ليلة</span>
            </div>

            <!-- Active Stay Box (Occupied Today) -->
            ${activeRes ? `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 9px 12px; margin-top: 10px;">
                <div style="font-weight: 700; color: #166534; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>👤 ${App.Helpers.escapeHtml(activeRes.guest_name)}</span>
                  <span style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                    <span style="font-size: 0.72rem; color: #a67c52; font-weight: 800;">حجز نشط #${activeRes.id}</span>
                    ${App.Helpers.getPaymentStatusBadge(activeRes.payment_status)}
                  </span>
                </div>
                ${App.Helpers.renderOverdueBadge(activeRes)}
                <div style="font-size: 0.74rem; color: #475569; margin-top: 4px;">
                  ${hasCheckOut 
                    ? `المغادرة: <strong style="color: #0f172a;">${App.Helpers.escapeHtml(checkOutDateVal)}</strong>` 
                    : `<span style="color: #0284c7; font-weight: 700;">المغادرة: عقد مفتوح (بدون تاريخ)</span>`}
                </div>
                ${renderReservationPaymentSummary(activeRes)}
              </div>
            ` : ''}

            ${nextActiveRes ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 9px 12px; margin-top: 8px;">
                <div style="font-weight: 700; color: #1e40af; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>📅 ${App.Helpers.escapeHtml(nextActiveRes.guest_name)}</span>
                  <span style="font-size: 0.72rem; color: #2563eb; font-weight: 800;">قادم اليوم #${nextActiveRes.id}</span>
                </div>
                ${App.Helpers.renderOverdueBadge(nextActiveRes)}
                ${renderReservationPaymentSummary(nextActiveRes)}
              </div>
            ` : ''}

            <!-- Upcoming Reservation Box (Future Booking) -->
            ${(!activeRes && (upcomingRes || cleaningIncomingRes)) ? (() => {
              const cardReservation = cleaningIncomingRes || upcomingRes;
              const cardLabel = room.status === 'تنظيف'
                ? (cardReservation.check_in_date === App.Helpers.getLocalDateString() ? 'قادم اليوم' : 'بانتظار جاهزية الغرفة')
                : 'حجز قادم';
              return `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 9px 12px; margin-top: 10px;">
                <div style="font-weight: 700; color: #1e40af; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>📅 ${App.Helpers.escapeHtml(cardReservation.guest_name)}</span>
                  <span style="font-size: 0.72rem; color: #2563eb; font-weight: 800;">${cardLabel} #${cardReservation.id}</span>
                </div>
                ${App.Helpers.renderOverdueBadge(cardReservation)}
                <div style="font-size: 0.74rem; color: #475569; margin-top: 4px;">
                  الوصول: <strong style="color: #1e3a8a;">${App.Helpers.escapeHtml(cardReservation.check_in_date)}</strong> | ${cardReservation.check_out_date ? `المغادرة: <strong>${App.Helpers.escapeHtml(cardReservation.check_out_date)}</strong>` : 'المغادرة: <strong style="color: #0284c7;">عقد مفتوح (بدون تاريخ)</strong>'}
                </div>
                ${renderReservationPaymentSummary(cardReservation)}
              </div>
              `;
            })() : ''}

            <!-- Quick Action Buttons -->
            <div class="room-card-quick-actions">
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
                ${activeRes.check_out_date && activeRes.check_out_date !== 'مفتوح' ? `
                  <button type="button" class="btn-room-action" data-action="extend" data-id="${activeRes.id}" style="border: none; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #1e3a8a; color: #ffffff;" title="تمديد فترة الإقامة">
                    <span>تمديد ⏳</span>
                  </button>
                ` : ''}
                <button type="button" class="btn-room-action" data-action="invoice" data-id="${activeRes.id}" style="border: none; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #1a4332; color: #ffffff;">
                  <span>فاتورة 🖨️</span>
                </button>
              ` : ''}

              ${room.status === 'محجوزة' && upcomingRes ? `
                <button type="button" class="btn-room-action" data-action="invoice" data-id="${upcomingRes.id}" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; background: #ffffff; color: #1e293b;">
                  <span>فاتورة الحجز 🖨️</span>
                </button>
                <button type="button" class="btn-room-action" data-action="cancel" data-id="${upcomingRes.id}" aria-label="إلغاء الحجز" title="إلغاء الحجز" style="border: 1px solid #fecaca; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.15s; background: #fef2f2; color: #b91c1c;">
                  <span>إلغاء الحجز ✕</span>
                </button>
              ` : ''}

              <button type="button" class="btn-room-action" data-action="room-revenue" data-room-id="${room.id}" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; background: #f8fafc; color: #334155;">
                <span>إيرادات 📊</span>
              </button>
            </div>
          </div>

          <!-- Seamless Acrylic Footer -->
                    <div class="room-card-footer">
            <div class="room-card-footer-status">
              ${room.status !== 'مشغولة' && room.status !== 'محجوزة' ? `
                <select class="room-status-select" data-room-id="${room.id}" style="width: auto; padding: 4px 8px; font-size: 0.8rem; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a;">
                  <option value="متاحة" ${room.status === 'متاحة' ? 'selected' : ''}>متاحة</option>
                  <option value="تنظيف" ${room.status === 'تنظيف' ? 'selected' : ''}>تنظيف</option>
                </select>
              ` : ''}
            </div>
            <!-- Editing a room changes its nightly price, so the main process refuses it for
                             anyone but an Admin (ipc/rooms.js). Gated with an inline role check,
                             not the .admin-only class: this markup is rebuilt on every grid render,
                             whereas applyRbacUi only runs at login. The status <select> above stays
                             visible for every role — marking a room cleaning is front-desk work and
                             is allowed over IPC. -->
                        ${isCurrentUserAdmin() ? `
                        <button type="button" class="btn-room-action" data-action="edit-room" data-room-id="${room.id}" style="background: #ffffff; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 700; font-size: 0.78rem; padding: 5px 12px; cursor: pointer; transition: all 0.15s;" title="تعديل تفاصيل الغرفة (الرقم، النوع، السعر)">
                          <span>تعديل ✏️</span>
                        </button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  App.Helpers.initRooms = function() {
  App.DOM.roomsFilterTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      App.DOM.roomsFilterTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRoomFilter = btn.dataset.roomFilter;
      if (currentRoomFilter !== 'مشغولة') {
        currentRoomPaymentFilter = 'all';
        App.DOM.roomsPaymentFilterTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.roomPaymentStatus === 'all'));
      }
      renderRoomsGrid();
    });
  });

  App.DOM.roomsPaymentFilterTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      App.DOM.roomsPaymentFilterTabs.forEach(tab => tab.classList.remove('active'));
      btn.classList.add('active');
      currentRoomPaymentFilter = btn.dataset.roomPaymentStatus;
      renderRoomsGrid();
    });
  });

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
      App.DOM.roomsBookingTypeTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRoomBookingType = btn.dataset.roomBookingType;
      renderRoomsGrid();
    });
  });

  // Room Card Click: Clicking an available or reserved room card initiates booking with auto-fill
  App.DOM.roomsGridContainer.addEventListener('click', (e) => {
    if (e.target.closest('button, select, input, a')) return;
    const card = e.target.closest('.room-card');
    if (!card) return;

    const roomId = card.dataset.roomId;
    const targetRoom = App.State.roomsCache.find(r => r.id === parseInt(roomId, 10));
    if (targetRoom && (targetRoom.status === 'متاحة' || targetRoom.status === 'محجوزة')) {
      window.DashboardApp.Helpers.initiateRoomBooking(roomId);
    }
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
    const status = App.DOM.newRoomStatus.value;

    if (!room_number || !type || !price_per_night) {
      App.Helpers.showToast('يرجى ملء جميع بيانات الغرفة.', 'error');
      return;
    }

    try {
      const res = await window.api.addRoom({ room_number, type, price_per_night, status });
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

      const currentRoom = App.State.roomsCache.find(r => r.id === id);
      const isOccupied = currentRoom && currentRoom.status === 'مشغولة';
      const status = isOccupied ? 'مشغولة' : App.DOM.editRoomStatus.value;

      if (!room_number || !type || !price_per_night) {
        App.Helpers.showToast('يرجى ملء جميع بيانات الغرفة المطلوبة.', 'error');
        return;
      }

      try {
        const res = await window.api.updateRoom({ id, room_number, type, price_per_night, status });
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
          <div class="spinner" style="margin: 0 auto 16px; border: 3px solid #cbd5e1; border-top: 3px solid #1a4332; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite;"></div>
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
                <h3 style="margin: 0; font-size: 1.4rem; font-weight: 900; color: #1a4332;">غرفة ${App.Helpers.escapeHtml(room.room_number)}</h3>
                <span style="font-size: 0.85rem; color: #64748b; font-weight: 600;">${App.Helpers.escapeHtml(room.type)}</span>
                ${App.Helpers.getRoomStatusBadge(room.status)}
              </div>
              <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">
                السعر الأساسي: <strong style="color: #a67c52;">${parseFloat(room.price_per_night || 0).toLocaleString()} ريال / ليلة</strong>
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
                ${totalExpected.toLocaleString()} <span style="font-size: 0.75rem;">ريال</span>
              </div>
            </div>

            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="font-size: 0.8rem; color: #047857; font-weight: 700;">محصّل فعلياً</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #065f46; margin-top: 4px;">
                ${totalCollected.toLocaleString()} <span style="font-size: 0.75rem;">ريال</span>
              </div>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="font-size: 0.8rem; color: #b45309; font-weight: 700;">مبالغ لم تحصّل بعد</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #92400e; margin-top: 4px;">
                ${totalOutstanding.toLocaleString()} <span style="font-size: 0.75rem;">ريال</span>
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
                    const paid = parseFloat(r.paid_amount || 0);
                    const collected = parseFloat(r.amount_collected || 0);
                    const rawRemaining = price - paid;
                    const isCredit = rawRemaining < -0.005;
                    const remaining = Math.max(0, rawRemaining);
                    const checkOutDisplay = (r.check_out_date === 'مفتوح' || !r.check_out_date) 
                      ? '<span style="color: #0284c7; font-weight: 700;">مفتوح</span>' 
                      : App.Helpers.escapeHtml(r.check_out_date);

                    return `
                      <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? 'background: #fcfcfc;' : ''}">
                        <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">#${r.id}</td>
                        <td style="padding: 9px 12px; font-weight: 700; color: #0f172a;">${App.Helpers.escapeHtml(r.guest_name || 'نزيل')}</td>
                        <td style="padding: 9px 12px; text-align: center; font-family: monospace; color: #334155;">${App.Helpers.escapeHtml(r.check_in_date || '-')}</td>
                        <td style="padding: 9px 12px; text-align: center; font-family: monospace; color: #334155;">${checkOutDisplay}</td>
                        <td style="padding: 9px 12px; text-align: left; font-weight: 700; color: #1e1b4b;">${price.toLocaleString()} ريال</td>
                        <td style="padding: 9px 12px; text-align: left; font-weight: 700; color: #059669;">${collected.toLocaleString()} ريال</td>
                        <td style="padding: 9px 12px; text-align: left; font-weight: 700; color: ${isCredit ? '#2563eb' : (remaining > 0 ? '#dc2626' : '#64748b')};">
                          ${isCredit ? `له رصيد: ${Math.abs(rawRemaining).toLocaleString()} ريال` : (remaining > 0 ? `${remaining.toLocaleString()} ريال` : '0 ريال')}
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
