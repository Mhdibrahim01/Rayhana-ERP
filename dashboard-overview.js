(function(App) {
  'use strict';

  // =========================================================================
  // ANALYTICS & CHART.JS VISUALIZATION (Light White Glass with Forest Green)
  // =========================================================================
  function renderAnalyticsCharts(monthlyData, stats) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js is not loaded.');
      return;
    }

    // 1. Monthly Revenue Bar Chart (Expected vs Collected)
    const revenueCtx = document.getElementById('monthly-revenue-chart');
    if (revenueCtx) {
      let labels = [];
      let expectedValues = [];
      let collectedValues = [];

      if (monthlyData && monthlyData.length > 0) {
        labels = monthlyData.map(d => d.month);
        expectedValues = monthlyData.map(d => parseFloat(d.expected !== undefined ? d.expected : d.revenue) || 0);
        collectedValues = monthlyData.map(d => parseFloat(d.collected) || 0);
      } else {
        const curMonth = (typeof App.Helpers.getLocalDateString === 'function')
          ? App.Helpers.getLocalDateString().substring(0, 7)
          : new Date().toISOString().substring(0, 7);
        labels = [curMonth];
        expectedValues = [0];
        collectedValues = [0];
      }

      if (App.State.monthlyRevenueChart) {
        App.State.monthlyRevenueChart.destroy();
      }

      App.State.monthlyRevenueChart = new Chart(revenueCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'المتوقع (Expected)',
              data: expectedValues,
              backgroundColor: '#94a3b8',
              hoverBackgroundColor: '#64748b',
              borderColor: '#64748b',
              borderWidth: 1,
              borderRadius: 6,
              maxBarThickness: 45
            },
            {
              label: 'المحصّل فعلياً (Collected)',
              data: collectedValues,
              backgroundColor: '#059669',
              hoverBackgroundColor: '#047857',
              borderColor: '#047857',
              borderWidth: 1,
              borderRadius: 6,
              maxBarThickness: 45
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                boxWidth: 14,
                padding: 12,
                color: '#475569',
                font: { family: 'Cairo, Segoe UI, Tahoma', size: 12, weight: '700' }
              }
            },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#ffffff',
              bodyColor: '#f8fafc',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              callbacks: {
                label: function (ctx) {
                  const val = ctx.parsed.y !== null ? ctx.parsed.y : 0;
                  return ` ${ctx.dataset.label}: ${val.toLocaleString()} ريال`;
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
              ticks: { color: '#64748b', font: { size: 11, weight: '700' } },
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

      if (App.State.roomStatusChart) {
        App.State.roomStatusChart.destroy();
      }

      App.State.roomStatusChart = new Chart(roomCtx, {
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
        App.DOM.statAvailableRooms.textContent = stats.availableRooms.toLocaleString();
        App.DOM.statOccupiedRooms.textContent = stats.occupiedRooms.toLocaleString();
        App.DOM.statCleaningRooms.textContent = stats.cleaningRooms.toLocaleString();
        App.DOM.statTotalReservations.textContent = stats.totalReservations.toLocaleString();
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
      const currentSelectedVal = App.DOM.roomSelect ? App.DOM.roomSelect.value : '';
      const roomsRes = await window.api.getAvailableRooms();
      if (roomsRes.success) {
        let optionsHtml = `<option value="">-- اختر الغرفة --</option>`;
        (roomsRes.data || []).forEach(room => {
          const isReservedLater = room.status === 'محجوزة';
          optionsHtml += `
            <option value="${room.id}" data-price="${room.price_per_night}">
              غرفة رقم ${App.Helpers.escapeHtml(room.room_number)} (${App.Helpers.escapeHtml(room.type)}) - ${room.price_per_night} ريال/ليلة ${isReservedLater ? '⏳ (محجوزة لفترة لاحقة)' : '✓ (متاحة)'}
            </option>
          `;
        });
        App.DOM.roomSelect.innerHTML = optionsHtml;
        if (currentSelectedVal) {
          App.DOM.roomSelect.value = currentSelectedVal;
        }
      }

      // 4. Load Recent Reservations into Overview Table
      const resRes = await window.api.getReservationsPage({ page: 1, pageSize: 8, status: 'مؤكد' });
      if (resRes && resRes.success) {
        App.State.reservationsCache = resRes.data?.rows || [];
        renderOverviewTable();
      }

      // 5. Load Today's Check-outs Widget
      await loadTodayCheckouts();
    } catch (err) {
      console.error('Error loading overview data:', err);
    }
  }

  function renderOverviewTable() {
    const recent = App.State.reservationsCache.filter(r => r.status === 'مؤكد').slice(0, 8);

    if (recent.length === 0) {
      App.DOM.overviewTableBody.innerHTML = '';
      App.DOM.overviewEmpty.style.display = 'block';
      return;
    }

    App.DOM.overviewEmpty.style.display = 'none';

    App.DOM.overviewTableBody.innerHTML = recent.map(r => {
      const isConfirmed = r.status === 'مؤكد';
      const hasStarted = r.check_in_date ? App.Helpers.getLocalDateString() > r.check_in_date : false;
      const canCheckOut = isConfirmed && (App.Helpers.getLocalDateString() >= r.check_in_date);
      const canCancel = isConfirmed && !hasStarted;
      const isContract = r.booking_type === 'عقد مفتوح';
      const total = parseFloat(r.total_price || 0);
      const paid = parseFloat((r.status === 'ملغي جزئي' && r.payment_status === 'مدفوع جزئياً' ? r.ledger_paid_amount : r.paid_amount) || 0);
      const rawRemaining = total - paid;
      const isCredit = rawRemaining < -0.005;
      const remaining = isContract ? rawRemaining : Math.max(0, rawRemaining);
      const typeBadge = App.Helpers.getBookingTypeBadge(r.booking_type);
      const checkOutDisplay = r.check_out_date || (isContract ? 'مفتوح (غير محدد)' : '-');
      const expectedCheckoutTime = isConfirmed && !isContract && r.check_out_date && r.check_out_date !== 'مفتوح' ? '14:00' : '';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 800; color: var(--primary); white-space: nowrap;">#${r.id}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-weight: 800; color: #1e293b; font-size: 0.92rem; white-space: nowrap;">${App.Helpers.escapeHtml(r.guest_name)}</span>
              ${typeBadge}
            </div>
            ${r.guest_id_number ? `<small class="guest-id-number">هوية: ${App.Helpers.escapeHtml(r.guest_id_number)}</small>` : ''}
          </td>
          <td style="white-space: nowrap;">
            <span style="font-weight: 800; color: #1a4332;">غرفة ${App.Helpers.escapeHtml(r.room_number)}</span>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; font-family: monospace; direction: ltr; text-align: right;">${renderDateTimeCell(r.check_in_date, r.booking_time, '-', 'الوصول')}</td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; font-family: ${r.check_out_date ? 'monospace' : 'inherit'}; direction: ${r.check_out_date ? 'ltr' : 'rtl'}; text-align: right;">${renderDateTimeCell(r.check_out_date, expectedCheckoutTime || r.checkout_time, checkOutDisplay, expectedCheckoutTime ? 'متوقع' : (r.checkout_time ? 'فعلي' : ''))}</td>
          <td style="white-space: nowrap;">
            <div style="font-weight: 800; color: #1e293b; font-size: 0.9rem;">${total.toLocaleString()} ريال</div>
            ${r.original_calculated_charge != null ? `<div style="font-size: 0.70rem; color: #64748b; font-weight: 600;" title="المبلغ الأصلي قبل تعديل الإدارة">معدل يدوياً (أصلي: ${parseFloat(r.original_calculated_charge).toLocaleString()} ريال)</div>` : ''}
            <div style="font-size: 0.74rem; color: #059669; font-weight: 700;">مدفوع: ${paid.toLocaleString()}</div>
            ${isCredit ? `<div style="font-size: 0.74rem; color: #2563eb; font-weight: 800;">رصيد دائن: ${Math.abs(rawRemaining).toLocaleString()} ريال</div>` : (remaining > 0 ? `<div style="font-size: 0.74rem; color: #dc2626; font-weight: 800;">متبقي: ${remaining.toLocaleString()}</div>` : '')}
          </td>
          <td style="white-space: nowrap;">${App.Helpers.getPaymentStatusBadge(r.payment_status)}</td>
          <td style="white-space: nowrap;">
            ${App.Helpers.getReservationStatusBadge(r.status)}
            ${App.Helpers.renderOverdueBadge(r)}
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <div class="overview-row-actions">
              <button type="button" class="btn-action-icon" data-action="invoice" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #f0fdf4; color: #166534; border: 1.5px solid #bbf7d0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="طباعة سند الاستلام والإقامة (فاتورة)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              </button>
              ${isConfirmed && (remaining > 0 || isContract) ? `
                <button type="button" class="btn-action-icon btn-pay" data-action="add-payment" data-id="${r.id}" onclick="event.stopPropagation(); window.openAddPaymentModal && window.openAddPaymentModal(${r.id});" style="width: 30px; height: 30px; padding: 0; background: #a67c52; color: #ffffff; border: none; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; box-shadow: 0 2px 8px rgba(166, 124, 82, 0.35);" title="تسجيل دفعة سداد جديدة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                </button>
              ` : ''}
              ${isConfirmed ? `
                ${r.check_out_date && r.check_out_date !== 'مفتوح' ? `
                  <button type="button" class="btn-action-icon" data-action="extend" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #eff6ff; color: #1e40af; border: 1.5px solid #bfdbfe; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="تمديد فترة الإقامة">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  </button>
                ` : ''}
                ${canCheckOut ? `<button type="button" class="btn-action-icon" data-action="checkout" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #ffffff; color: #334155; border: 1.5px solid #cbd5e1; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="تسجيل مغادرة وتسليم الغرفة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>` : ''}
                <button type="button" class="btn-action-icon" data-action="whatsapp" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #f0fdf4; color: #16a34a; border: 1.5px solid #86efac; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="مراسلة النزيل عبر واتساب">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </button>
                ${canCancel ? `<button type="button" class="btn-action-icon" data-action="cancel" data-id="${r.id}" style="width: 30px; height: 30px; padding: 0; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s;" title="${r.check_in_date === App.Helpers.getLocalDateString() ? 'إبطال / إلغاء الحجز المباشر' : 'إلغاء الحجز'}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>` : ''}
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderDateTimeCell(dateValue, timeValue, fallback = '-', timeLabel = '') {
    const rawDate = String(dateValue || '').trim();
    if (!rawDate) return App.Helpers.escapeHtml(fallback);

    const [datePart, embeddedTime] = rawDate.split(/[T ]/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return App.Helpers.escapeHtml(rawDate);

    const time = String(timeValue || embeddedTime || '').trim().slice(0, 5);
    return `<div class="table-date">${App.Helpers.escapeHtml(datePart)}</div>${time ? `<div class="table-time">${timeLabel ? `<span class="table-time-label">${App.Helpers.escapeHtml(timeLabel)}:</span>` : ''}<bdi class="table-time-value">${App.Helpers.escapeHtml(time)}</bdi></div>` : ''}`;
  }

  // =========================================================================
  // TODAY'S CHECK-OUTS (مغادرات اليوم) WIDGET LOGIC
  // =========================================================================
  async function loadTodayCheckouts() {
    try {
      const todayStr = App.Helpers.getLocalDateString();
      if (App.DOM.todayDateBadge) {
        App.DOM.todayDateBadge.textContent = todayStr;
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
    if (!App.DOM.todayCheckoutsTableBody) return;

    const uniqueReservations = new Map();
    (checkouts || []).forEach(row => {
      const reservationId = row.reservation_id ?? row.id;
      const key = reservationId != null
        ? `reservation:${reservationId}`
        : `room:${row.room_id ?? row.room_number}|guest:${row.guest_id_number ?? row.guest_name ?? ''}|date:${row.check_in_date ?? ''}`;
      if (!uniqueReservations.has(key)) uniqueReservations.set(key, row);
    });

    // A room should appear once in today's operational list. Keep its newest
    // reservation when legacy/imported data contains repeated room entries.
    const latestFirst = [...uniqueReservations.values()].sort((a, b) => {
      const byCreatedAt = String(b.created_at || '').localeCompare(String(a.created_at || ''));
      return byCreatedAt || Number(b.id || 0) - Number(a.id || 0);
    });
    const latestByRoom = new Map();
    latestFirst.forEach(row => {
      const roomKey = row.room_id ?? row.room_number ?? `reservation:${row.reservation_id ?? row.id}`;
      if (!latestByRoom.has(String(roomKey))) latestByRoom.set(String(roomKey), row);
    });
    const latestRoomRows = [...latestByRoom.values()];
    const visibleReservationIds = new Set(latestRoomRows.map(row => String(row.reservation_id ?? row.id)));
    const overdueRows = latestFirst.filter(row =>
      row.status === 'مؤكد' &&
      String(row.check_out_date || '').slice(0, 10) < App.Helpers.getLocalDateString() &&
      !visibleReservationIds.has(String(row.reservation_id ?? row.id))
    );
    checkouts = [...latestRoomRows, ...overdueRows].sort((a, b) =>
      String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true })
    );
    App.State.todayCheckoutsRows = checkouts;

    if (App.DOM.todayCheckoutsCountBadge) {
      const count = checkouts.length;
      App.DOM.todayCheckoutsCountBadge.textContent = `${count} ${count === 1 ? 'مغادرة' : 'مغادرات'}`;
    }

    const searchTerm = String(App.DOM.todayCheckoutsSearch?.value || '').trim().toLocaleLowerCase();
    const visibleCheckouts = checkouts.filter(row => {
      const overdue = App.Helpers.isReservationOverdue(row);
      const statusMatches = App.State.todayCheckoutsActiveFilter === 'all'
        || (App.State.todayCheckoutsActiveFilter === 'pending' && row.status === 'مؤكد' && !overdue)
        || (App.State.todayCheckoutsActiveFilter === 'overdue' && overdue)
        || (App.State.todayCheckoutsActiveFilter === 'completed' && row.status === 'مكتمل');
      if (!statusMatches) return false;

      if (!searchTerm) return true;
      const searchableText = [row.room_number, row.room_type, row.guest_name, row.guest_phone, row.guest_id_number]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return searchableText.includes(searchTerm);
    });

    if (visibleCheckouts.length === 0) {
      App.DOM.todayCheckoutsTableBody.innerHTML = '';
      if (App.DOM.todayCheckoutsEmpty) App.DOM.todayCheckoutsEmpty.style.display = 'block';
      if (App.DOM.todayCheckoutsEmpty) {
        const title = App.DOM.todayCheckoutsEmpty.querySelector('h4');
        const description = App.DOM.todayCheckoutsEmpty.querySelector('p');
        const noRowsAtAll = checkouts.length === 0;
        if (title) title.textContent = noRowsAtAll ? 'لا توجد مغادرات مجدولة لهذا اليوم' : 'لا توجد نتائج مطابقة';
        if (description) description.textContent = noRowsAtAll
          ? 'جميع الغرف المشغولة لا تنتهي فترة إقامتها اليوم أو تم إنهاء إجراءات مغادرتها بالفعل.'
          : 'جرّب تغيير حالة المغادرة أو تعديل عبارة البحث.';
      }
      return;
    }

    if (App.DOM.todayCheckoutsEmpty) App.DOM.todayCheckoutsEmpty.style.display = 'none';

    App.DOM.todayCheckoutsTableBody.innerHTML = visibleCheckouts.map(r => {
      const isConfirmed = r.status === 'مؤكد';
      const isCompleted = r.status === 'مكتمل';
      const expectedCheckoutTime = isConfirmed && r.booking_type !== 'عقد مفتوح' && r.check_out_date && r.check_out_date !== 'مفتوح' ? '14:00' : '';

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td>
            <span style="font-weight: 800; font-size: 0.92rem; color: #1a4332; background: #ecfdf5; padding: 3px 8px; border-radius: 6px; border: 1px solid #a7f3d0;">
              غرفة ${App.Helpers.escapeHtml(r.room_number)}
            </span>
          </td>
          <td style="font-size: 0.88rem; color: var(--text-secondary);">${App.Helpers.escapeHtml(r.room_type || '')}</td>
          <td>
            <div class="checkout-cell-stack checkout-guest-stack">
              <div style="font-weight: 800; color: #1e293b; font-size: 0.92rem;">${App.Helpers.escapeHtml(r.guest_name)}</div>
              ${r.guest_id_number ? `<small class="guest-id-number">هوية: ${App.Helpers.escapeHtml(r.guest_id_number)}</small>` : ''}
            </div>
          </td>
          <td style="font-family: monospace; font-size: 0.88rem; color: var(--text-secondary);">${App.Helpers.escapeHtml(r.guest_phone || '-')}</td>
          <td style="font-size: 0.84rem; color: var(--text-secondary);">
            <div class="checkout-cell-stack checkout-date-stack">${renderDateTimeCell(r.check_in_date, r.booking_time, '-', 'الوصول')}</div>
          </td>
          <td style="font-weight: 800; color: var(--primary); font-size: 0.92rem;">${parseFloat(r.total_price || 0).toLocaleString()} ريال</td>
          <td>
            <div class="checkouts-status-stack">
              ${App.Helpers.getReservationStatusBadge(r.status)}
              ${App.Helpers.renderOverdueBadge(r, String(r.check_out_date || '').slice(0, 10) < App.Helpers.getLocalDateString() ? 'متأخر' : 'متأخر عن المغادرة')}
              ${r.checkout_time ? `<div class="table-time"><span class="table-time-label">مغادرة فعلية:</span><bdi class="table-time-value">${App.Helpers.escapeHtml(r.checkout_time)}</bdi></div>` : (expectedCheckoutTime ? `<div class="table-time"><span class="table-time-label">مغادرة متوقعة:</span><bdi class="table-time-value">${expectedCheckoutTime}</bdi></div>` : '')}
            </div>
          </td>
          <td style="text-align: center;">
            ${isConfirmed ? `
              <div class="overview-row-actions">
                <button class="btn btn-primary btn-sm checkout-row-action checkout-row-action-primary" data-action="checkout" data-id="${r.id}" title="تسجيل مغادرة النزيل وتسليم الغرفة">
                  تسجيل مغادرة &larr;
                </button>
                <button type="button" class="btn btn-secondary btn-sm checkout-row-action checkout-row-action-secondary" data-action="extend" data-id="${r.id}" title="تمديد فترة الإقامة">
                  تمديد ⏳
                </button>
              </div>
            ` : isCompleted ? `
              <span class="badge" style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; font-weight: 800;">تمت المغادرة &check;</span>
            ` : `<span style="color: var(--text-secondary); font-size: 0.8rem;">-</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  App.Helpers.initOverview = function() {
  document.querySelectorAll('[data-overview-table-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const selectedPanelId = tab.dataset.overviewTableTab;
      document.querySelectorAll('[data-overview-table-tab]').forEach(button => {
        const active = button === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-overview-table-panel]').forEach(panel => {
        const active = panel.id === selectedPanelId;
        panel.hidden = !active;
        panel.classList.toggle('active', active);
      });
    });
  });

  if (App.DOM.btnRefreshCheckouts) {
    App.DOM.btnRefreshCheckouts.addEventListener('click', loadTodayCheckouts);
  }

  if (App.DOM.todayCheckoutsSearch) {
    App.DOM.todayCheckoutsSearch.addEventListener('input', () => renderTodayCheckoutsTable(App.State.todayCheckoutsRows));
  }

  if (App.DOM.todayCheckoutsFilters) {
    App.DOM.todayCheckoutsFilters.addEventListener('click', event => {
      const button = event.target.closest('[data-checkout-filter]');
      if (!button) return;

      App.State.todayCheckoutsActiveFilter = button.dataset.checkoutFilter || 'all';
      App.DOM.todayCheckoutsFilters.querySelectorAll('[data-checkout-filter]').forEach(filterButton => {
        const active = filterButton === button;
        filterButton.classList.toggle('active', active);
        filterButton.setAttribute('aria-pressed', String(active));
      });
      renderTodayCheckoutsTable(App.State.todayCheckoutsRows);
    });
  }


  };
  App.Helpers.loadOverviewData = loadOverviewData;
  App.Helpers.loadTodayCheckouts = loadTodayCheckouts;

})(window.DashboardApp);
