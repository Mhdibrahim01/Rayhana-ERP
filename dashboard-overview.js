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

  // A transparent weekly demand baseline keeps this estimate useful before the
  // application has enough booking-pickup history for a learned forecast. Confirmed
  // reservations always take precedence over the baseline.
  const WEEKDAY_DEMAND_BASELINE = [45, 36, 55, 64, 82, 91, 73];
  const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  let occupancyForecastChart = null;

  function buildOccupancyForecast(reservations, totalCapacity) {
    const capacity = Math.max(0, Number(totalCapacity) || 0);
    if (capacity === 0) return [];

    const today = App.Helpers.getLocalDateString();
    const [year, month, day] = today.split('-').map(Number);
    const startDate = new Date(year, month - 1, day);
    const confirmedReservations = (reservations || []).filter(reservation => reservation.status === 'مؤكد');

    return Array.from({ length: 7 }, (_, dayOffset) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + dayOffset);
      const isoDate = App.Helpers.getLocalDateString(date);
      const bookedRoomIds = new Set();

      confirmedReservations.forEach(reservation => {
        const checkInDate = String(reservation.check_in_date || '').slice(0, 10);
        const checkOutDate = String(reservation.check_out_date || '').slice(0, 10);
        const openEndedStay = !checkOutDate || checkOutDate === 'مفتوح';
        const overlaps = checkInDate && checkInDate <= isoDate && (openEndedStay || checkOutDate > isoDate);
        if (overlaps && reservation.room_id !== null && reservation.room_id !== undefined) {
          bookedRoomIds.add(String(reservation.room_id));
        }
      });

      const weekdayIndex = date.getDay();
      const baselineRate = WEEKDAY_DEMAND_BASELINE[weekdayIndex];
      const bookedRooms = Math.min(capacity, bookedRoomIds.size);
      const projectedRooms = Math.min(capacity, Math.max(bookedRooms, Math.round(capacity * baselineRate / 100)));
      const occupancyRate = Math.round(projectedRooms / capacity * 100);
      const displayDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      const demandLevel = occupancyRate >= 85
        ? 'ذروة قصوى 🔥'
        : occupancyRate >= 75
          ? 'طلب مرتفع ⚡'
          : 'طلب اعتيادي 🟢';

      return {
        date: isoDate,
        displayDate,
        dayName: ARABIC_WEEKDAYS[weekdayIndex],
        bookedRooms,
        occupiedRooms: projectedRooms,
        availableRooms: Math.max(0, capacity - projectedRooms),
        totalCapacity: capacity,
        occupancyRate,
        isHighDemand: occupancyRate >= 80,
        demandLevel
      };
    });
  }

  function updateForecastTooltip(tooltipContext, forecast) {
    const tooltipElement = document.getElementById('occupancy-forecast-tooltip');
    if (!tooltipElement) return;

    const { chart, tooltip } = tooltipContext;
    if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
      tooltipElement.hidden = true;
      return;
    }

    const day = forecast[tooltip.dataPoints[0].dataIndex];
    if (!day) {
      tooltipElement.hidden = true;
      return;
    }

    const safeDayName = App.Helpers.escapeHtml(day.dayName);
    const safeDemand = App.Helpers.escapeHtml(day.demandLevel);
    tooltipElement.innerHTML = `
      <strong class="forecast-tooltip-heading">${safeDayName} · ${day.displayDate}</strong>
      <div class="forecast-tooltip-rate">${day.occupancyRate}% إشغال متوقع</div>
      <div>الحجوزات المؤكدة: ${day.bookedRooms} من ${day.totalCapacity} غرفة</div>
      <div>الإشغال المتوقع: ${day.occupiedRooms} من ${day.totalCapacity} غرفة</div>
      <div>الغرف المتاحة المتوقعة: ${day.availableRooms}</div>
      <span class="forecast-tooltip-tier ${day.isHighDemand ? 'is-high' : ''}">${safeDemand}</span>
    `;
    tooltipElement.hidden = false;

    const chartArea = chart.chartArea;
    const tooltipLeft = Math.min(chartArea.right - tooltipElement.offsetWidth, Math.max(chartArea.left, tooltip.caretX + 12));
    const tooltipTop = Math.max(4, tooltip.caretY - tooltipElement.offsetHeight - 12);
    tooltipElement.style.left = `${tooltipLeft}px`;
    tooltipElement.style.top = `${tooltipTop}px`;
  }

  function renderOccupancyForecast(reservations, rooms) {
    const chartCanvas = document.getElementById('occupancy-forecast-chart');
    const chartWrap = chartCanvas?.parentElement;
    const emptyState = document.getElementById('occupancy-forecast-empty');
    const daysContainer = document.getElementById('occupancy-forecast-days');
    if (!chartCanvas || !chartWrap || !daysContainer) return;

    const capacity = Array.isArray(rooms) ? rooms.length : 0;
    const forecast = buildOccupancyForecast(reservations, capacity);
    if (emptyState) emptyState.hidden = forecast.length > 0;
    chartWrap.hidden = forecast.length === 0;
    daysContainer.hidden = forecast.length === 0;

    if (!forecast.length) {
      daysContainer.replaceChildren();
      if (occupancyForecastChart) {
        occupancyForecastChart.destroy();
        occupancyForecastChart = null;
      }
      return;
    }

    const peak = forecast.reduce((highest, item) => item.occupancyRate > highest.occupancyRate ? item : highest, forecast[0]);
    const averageRate = Math.round(forecast.reduce((sum, item) => sum + item.occupancyRate, 0) / forecast.length);
    const highDemandDays = forecast.filter(item => item.isHighDemand);
    const peakElement = document.getElementById('forecast-peak-day');
    const averageElement = document.getElementById('forecast-average-rate');
    const highDaysElement = document.getElementById('forecast-high-demand-days');
    const alertBanner = document.getElementById('occupancy-forecast-alert');
    const alertCopy = document.getElementById('occupancy-forecast-alert-copy');

    if (peakElement) peakElement.textContent = `${peak.dayName} ${peak.occupancyRate}%`;
    if (averageElement) averageElement.textContent = `${averageRate}%`;
    if (highDaysElement) highDaysElement.textContent = String(highDemandDays.length);
    if (alertBanner) alertBanner.hidden = highDemandDays.length === 0;
    if (alertCopy && highDemandDays.length) {
      alertCopy.textContent = `تُظهر التوقعات طلباً مرتفعاً في ${highDemandDays.map(item => `${item.dayName} (${item.displayDate})`).join('، ')}. هذه تقديرات تخطيطية وليست حجوزات مؤكدة.`;
    }

    daysContainer.innerHTML = forecast.map(item => `
      <article class="occupancy-forecast-day ${item.isHighDemand ? 'is-high-demand' : ''}">
        <div class="forecast-day-heading"><strong>${item.dayName}</strong><time datetime="${item.date}">${item.displayDate}</time></div>
        <b class="forecast-day-rate">${item.occupancyRate}%</b>
        <span class="forecast-day-rooms">${item.occupiedRooms} / ${item.totalCapacity} غرفة</span>
        <span class="forecast-day-status ${item.isHighDemand ? 'is-high' : ''}">${item.isHighDemand ? 'ذروة طلب' : 'طلب هادئ'}</span>
      </article>
    `).join('');

    if (typeof Chart === 'undefined') return;
    if (occupancyForecastChart) occupancyForecastChart.destroy();

    occupancyForecastChart = new Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels: forecast.map((item, index) => `${index === 0 ? 'اليوم' : item.dayName} (${item.displayDate})`),
        datasets: [
          {
            type: 'bar',
            label: 'الغرف المشغولة والمتوقعة',
            data: forecast.map(item => item.occupiedRooms),
            yAxisID: 'rooms',
            backgroundColor: 'rgba(166, 124, 82, 0.25)',
            hoverBackgroundColor: 'rgba(166, 124, 82, 0.42)',
            borderColor: 'rgba(166, 124, 82, 0.48)',
            borderWidth: 1,
            borderRadius: 7,
            maxBarThickness: 28,
            order: 2
          },
          {
            type: 'line',
            label: 'نسبة الإشغال المتوقعة',
            data: forecast.map(item => item.occupancyRate),
            yAxisID: 'occupancy',
            borderColor: '#1a4332',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: forecast.map(item => item.isHighDemand ? '#a67c52' : '#1a4332'),
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            tension: 0.38,
            fill: true,
            backgroundColor: context => {
              const { chart } = context;
              const { ctx, chartArea } = chart;
              if (!chartArea) return 'rgba(26, 67, 50, 0.12)';
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, 'rgba(26, 67, 50, 0.30)');
              gradient.addColorStop(1, 'rgba(26, 67, 50, 0.015)');
              return gradient;
            },
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 12, right: 8, left: 4, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: context => updateForecastTooltip(context, forecast)
          }
        },
        scales: {
          occupancy: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              color: '#8391a2',
              font: { family: 'Cairo, Segoe UI, Tahoma', size: 10 },
              callback: value => `${value}%`
            },
            grid: { color: '#f1f5f9', drawBorder: false }
          },
          rooms: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: capacity,
            display: false,
            grid: { display: false }
          },
          x: {
            reverse: true,
            ticks: {
              color: '#53667a',
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false,
              font: { family: 'Cairo, Segoe UI, Tahoma', size: 10, weight: '700' }
            },
            grid: { display: false }
          }
        }
      },
      plugins: [{
        id: 'occupancy-demand-threshold',
        afterDatasetsDraw(chart) {
          const yScale = chart.scales.occupancy;
          const chartArea = chart.chartArea;
          if (!yScale || !chartArea) return;
          const y = yScale.getPixelForValue(80);
          const { ctx } = chart;
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#dc2626';
          ctx.font = '700 10px Cairo, Segoe UI, Tahoma';
          ctx.textAlign = 'right';
          ctx.direction = 'rtl';
          ctx.fillText('عتبة الذروة (80%)', chartArea.right - 4, y - 6);
          ctx.restore();
        }
      }]
    });
  }

  function renderExecutiveSummaryKpis(stats, reservations, rooms, shiftSummary) {
    const today = App.Helpers.getLocalDateString();
    const confirmedReservations = (reservations || []).filter(reservation => reservation.status === 'مؤكد');
    const checkInsToday = confirmedReservations.filter(reservation => String(reservation.check_in_date || '').slice(0, 10) === today).length;
    const checkoutsToday = confirmedReservations.filter(reservation => String(reservation.check_out_date || '').slice(0, 10) === today);
    const pendingCheckouts = checkoutsToday.length;
    const totalRooms = Math.max(0, Number(stats?.totalRooms) || (Array.isArray(rooms) ? rooms.length : 0));
    const roomStatusCount = (Array.isArray(rooms) ? rooms.filter(room => room.status === 'مشغولة').length : 0);
    const occupiedRooms = Math.min(totalRooms, Math.max(0, Number(stats?.occupiedRooms ?? roomStatusCount) || 0));
    const occupancyRate = totalRooms > 0 ? Math.round(occupiedRooms / totalRooms * 100) : 0;

    const occupancyRateEl = document.getElementById('overview-occupancy-rate');
    const occupancyBadge = document.getElementById('overview-occupancy-badge');
    const occupancyProgress = document.getElementById('overview-occupancy-progress');
    const occupiedCountEl = document.getElementById('overview-occupied-count');
    const checkInsEl = document.getElementById('overview-checkins-count');
    const checkOutsEl = document.getElementById('overview-checkouts-count');
    const pendingCheckoutsEl = document.getElementById('overview-pending-checkouts-count');
    const revenueTotalEl = document.getElementById('overview-shift-revenue-total');
    const revenueBreakdownEl = document.getElementById('overview-shift-revenue-breakdown');

    if (occupancyRateEl) occupancyRateEl.textContent = `${occupancyRate}%`;
    if (occupancyBadge) {
      occupancyBadge.textContent = occupancyRate >= 80
        ? 'إشغال مرتفع 🔥'
        : occupancyRate >= 50
          ? 'إشغال معتدل 🟢'
          : 'إشغال هادئ';
    }
    if (occupancyProgress) occupancyProgress.style.width = `${occupancyRate}%`;
    if (occupiedCountEl) occupiedCountEl.textContent = `${occupiedRooms} من ${totalRooms} غرف مسكونة`;
    if (checkInsEl) checkInsEl.textContent = String(checkInsToday);
    if (checkOutsEl) checkOutsEl.textContent = String(checkoutsToday.length);
    if (pendingCheckoutsEl) pendingCheckoutsEl.textContent = String(pendingCheckouts);

    if (shiftSummary && revenueTotalEl && revenueBreakdownEl) {
      const cash = Number(shiftSummary.cashTotal) || 0;
      const card = Number(shiftSummary.cardTotal) || 0;
      const transfer = Number(shiftSummary.transferTotal) || 0;
      const total = cash + card + transfer;
      revenueTotalEl.textContent = total.toLocaleString('en-US');
      revenueBreakdownEl.textContent = `كاش: ${cash.toLocaleString('en-US')} | شبكة: ${(card + transfer).toLocaleString('en-US')} ر.س`;
    } else {
      if (revenueTotalEl) revenueTotalEl.textContent = '—';
      if (revenueBreakdownEl) revenueBreakdownEl.textContent = 'بيانات الوردية غير متاحة';
    }
  }

  function initExecutiveSummaryKpiActions() {
    const occupancyKpi = document.getElementById('overview-kpi-occupancy');
    const checkInsKpi = document.getElementById('overview-kpi-checkins');
    const checkOutsKpi = document.getElementById('overview-kpi-checkouts');
    const shiftRevenueKpi = document.getElementById('overview-kpi-shift-revenue');

    occupancyKpi?.addEventListener('click', () => {
      if (typeof window.openRoomsFiltered === 'function') window.openRoomsFiltered('مشغولة');
      else if (typeof window.switchView === 'function') window.switchView('rooms');
    });
    checkInsKpi?.addEventListener('click', () => {
      document.getElementById('btn-open-new-reservation-modal')?.click();
    });
    checkOutsKpi?.addEventListener('click', () => {
      document.getElementById('tab-today-checkouts')?.click();
      document.getElementById('widget-today-checkouts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    shiftRevenueKpi?.addEventListener('click', () => {
      if (App.State.currentUser?.role === 'Admin' && typeof window.openShiftAuditModal === 'function') {
        window.openShiftAuditModal();
      } else {
        App.Helpers.showToast('تقرير الوردية التفصيلي متاح لمدير النظام فقط.', 'warning');
      }
    });
  }

  async function loadOccupancyForecast(stats) {
    try {
      const [reservationsResult, roomsResult, shiftSummaryResult] = await Promise.all([
        window.api.getAllReservations(),
        window.api.getAllRooms(),
        window.api.getCurrentShiftRevenueSummary().catch(err => {
          console.warn('Could not load current shift summary:', err);
          return null;
        })
      ]);
      if (!reservationsResult?.success || !roomsResult?.success) {
        throw new Error(reservationsResult?.error || roomsResult?.error || 'تعذر تحميل بيانات الإشغال.');
      }
      const reservations = reservationsResult.data || [];
      const rooms = roomsResult.data || [];
      renderOccupancyForecast(reservations, rooms);
      renderExecutiveSummaryKpis(stats, reservations, rooms, shiftSummaryResult?.success ? shiftSummaryResult.data : null);
    } catch (err) {
      console.error('Error loading 7-day occupancy forecast:', err);
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
        if (App.DOM.statAvailableRooms) App.DOM.statAvailableRooms.textContent = stats.availableRooms.toLocaleString();
        if (App.DOM.statOccupiedRooms) App.DOM.statOccupiedRooms.textContent = stats.occupiedRooms.toLocaleString();
        if (App.DOM.statCleaningRooms) App.DOM.statCleaningRooms.textContent = stats.cleaningRooms.toLocaleString();
        if (App.DOM.statTotalReservations) App.DOM.statTotalReservations.textContent = stats.totalReservations.toLocaleString();
      }

      // 2. Load Monthly Revenue for Analytics
      let monthlyData = [];
      const analyticsRes = await window.api.getMonthlyRevenue();
      if (analyticsRes.success) {
        monthlyData = analyticsRes.data || [];
      }

      // Render Charts
      renderAnalyticsCharts(monthlyData, stats);
      await loadOccupancyForecast();

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
        const activeBookingsCount = Number(resRes.data?.total ?? App.State.reservationsCache.length);
        const activeBookingsTabCount = document.getElementById('active-bookings-tab-count');
        if (activeBookingsTabCount) activeBookingsTabCount.textContent = String(activeBookingsCount);
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

  function renderLateCheckoutAlert(checkouts) {
    const alert = document.getElementById('late-checkout-alert');
    const counter = document.getElementById('late-checkout-count');
    const actions = document.getElementById('late-checkout-actions');
    if (!alert || !actions) return;

    const lateCheckouts = (checkouts || []).filter(row => App.Helpers.isLateCheckout(row));
    alert.hidden = lateCheckouts.length === 0;
    if (counter) counter.textContent = `${lateCheckouts.length} ${lateCheckouts.length === 1 ? 'غرفة متأخرة' : 'غرف متأخرة'}`;
    actions.innerHTML = lateCheckouts.map(row => {
      const id = Number(row.reservation_id ?? row.id);
      return `
        <article class="late-checkout-action-card">
          <div class="late-checkout-action-guest">
            <strong>غرفة ${App.Helpers.escapeHtml(row.room_number || '-')}</strong>
            <span>${App.Helpers.escapeHtml(row.guest_name || 'نزيل')}</span>
            <small dir="ltr">${App.Helpers.escapeHtml(row.guest_phone || 'لا يوجد رقم جوال')}</small>
          </div>
          <div class="late-checkout-action-buttons">
            <button type="button" class="late-checkout-button late-checkout-button-primary" data-action="checkout" data-id="${id}">🚪 خروج فوري</button>
            <button type="button" class="late-checkout-button late-checkout-button-secondary" data-action="extend" data-id="${id}">⏳ تمديد</button>
          </div>
        </article>
      `;
    }).join('');
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
    renderLateCheckoutAlert(checkouts);

    if (App.DOM.todayCheckoutsCountBadge) {
      const count = checkouts.length;
      App.DOM.todayCheckoutsCountBadge.textContent = `${count} ${count === 1 ? 'مغادرة' : 'مغادرات'}`;
      const todayCheckoutsTabCount = document.getElementById('today-checkouts-tab-count');
      if (todayCheckoutsTabCount) todayCheckoutsTabCount.textContent = String(count);
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
      const isLateCheckout = App.Helpers.isLateCheckout(r);
      const expectedCheckoutTime = isConfirmed && r.booking_type !== 'عقد مفتوح' && r.check_out_date && r.check_out_date !== 'مفتوح' ? '14:00' : '';

      return `
        <tr class="${isLateCheckout ? 'late-checkout-row' : ''}" style="border-bottom: 1px solid #f1f5f9;">
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
              ${App.Helpers.renderOverdueBadge(r, 'تأخر بالمغادرة (بعد 14:00)')}
              ${r.checkout_time ? `<div class="table-time"><span class="table-time-label">مغادرة فعلية:</span><bdi class="table-time-value">${App.Helpers.escapeHtml(r.checkout_time)}</bdi></div>` : (expectedCheckoutTime ? `<div class="table-time"><span class="table-time-label">مغادرة متوقعة:</span><bdi class="table-time-value">${expectedCheckoutTime}</bdi></div>` : '')}
            </div>
          </td>
          <td style="text-align: center;">
            ${isConfirmed ? `
              <div class="overview-row-actions ${isLateCheckout ? 'overview-row-actions-late-checkout' : ''}" role="group" aria-label="إجراءات الحجز">
                ${isLateCheckout ? `
                  <button type="button" class="checkout-row-action checkout-row-action-preview" data-action="preview-reservation" data-id="${r.id}" title="معاينة تفاصيل الحجز" aria-label="معاينة تفاصيل الحجز">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                  <button type="button" class="late-checkout-button late-checkout-button-primary" data-action="checkout" data-id="${r.id}" title="تسوية فورية وتسجيل المغادرة">🚪 خروج فوري</button>
                  <button type="button" class="late-checkout-button late-checkout-button-secondary" data-action="extend" data-id="${r.id}" title="تمديد فترة الإقامة">⏳ تمديد الإقامة</button>
                ` : `
                  <button type="button" class="checkout-row-action checkout-row-action-preview" data-action="preview-reservation" data-id="${r.id}" title="معاينة تفاصيل الحجز" aria-label="معاينة تفاصيل الحجز">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                  <button type="button" class="checkout-row-action checkout-row-action-extend" data-action="extend" data-id="${r.id}" title="تمديد فترة الإقامة" aria-label="تمديد فترة الإقامة">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg><span>تمديد</span>
                  </button>
                  <button type="button" class="checkout-row-action checkout-row-action-primary" data-action="checkout" data-id="${r.id}" title="تسجيل مغادرة النزيل وتسليم الغرفة" aria-label="تسجيل مغادرة النزيل وتسليم الغرفة">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v14h4M14 8l4 4-4 4M18 12H9"></path></svg><span>تسجيل المغادرة</span>
                  </button>
                `}
              </div>
            ` : isCompleted ? `
              <span class="badge" style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; font-weight: 800;">تمت المغادرة &check;</span>
            ` : `<span style="color: var(--text-secondary); font-size: 0.8rem;">-</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  function formatPreviewDate(value) {
    if (!value || value === 'مفتوح') return value || 'غير محدد';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }

  function previewField(label, value, detail = '') {
    const safe = App.Helpers.escapeHtml(value == null || value === '' ? 'غير متوفر' : String(value));
    return `<div class="reservation-preview-field"><span>${App.Helpers.escapeHtml(label)}</span><strong>${safe}</strong>${detail ? `<small>${App.Helpers.escapeHtml(detail)}</small>` : ''}</div>`;
  }

  App.Helpers.openReservationPreview = async function(reservationId) {
    const response = await window.api.getInvoiceData(reservationId);
    if (!response?.success || !response.data) {
      App.Helpers.showToast?.(response?.error || 'تعذر تحميل تفاصيل الحجز.', 'error');
      return;
    }

    let modal = document.getElementById('reservation-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'reservation-preview-modal';
      modal.className = 'reservation-preview-backdrop';
      modal.setAttribute('role', 'presentation');
      modal.innerHTML = '<section class="reservation-preview-dialog modal-layout" role="dialog" aria-modal="true" aria-labelledby="reservation-preview-title" dir="rtl"><div id="reservation-preview-content"></div></section>';
      document.body.appendChild(modal);
      modal.addEventListener('click', event => { if (event.target === modal) modal.style.display = 'none'; });
      modal.addEventListener('click', event => { if (event.target.closest('[data-preview-close]')) modal.style.display = 'none'; });
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.style.display === 'flex') modal.style.display = 'none'; });
    }

    const r = response.data;
    const total = Number(r.total_price) || 0;
    const paid = Number(r.ledger_paid_amount ?? r.paid_amount) || 0;
    const balance = Math.max(0, total - paid);
    const money = value => `${Number(value || 0).toLocaleString('ar-SA')} ر.س`;
    const status = App.Helpers.escapeHtml(r.status || 'غير محدد');
    const statusTone = r.status === 'مؤكد' ? 'active' : (r.status === 'مكتمل' ? 'done' : 'other');
    const content = modal.querySelector('#reservation-preview-content');
    content.innerHTML = `
      <header class="reservation-preview-header modal-layout__header">
        <div class="reservation-preview-heading">
          <div class="reservation-preview-room-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 18V8a2 2 0 0 1 2-2h3a3 3 0 0 1 3 3v2h6a4 4 0 0 1 4 4v3M3 14h18M5 18v2m14-2v2"></path></svg></div>
          <div><div class="reservation-preview-eyebrow">إقامة النزيل · رقم الحجز ${App.Helpers.escapeHtml(r.id)}</div><h2 id="reservation-preview-title">تفاصيل الغرفة ${App.Helpers.escapeHtml(r.room_number || '-')}</h2><p>${App.Helpers.escapeHtml(r.room_type || 'نوع الغرفة غير محدد')} · ${App.Helpers.escapeHtml(r.booking_type || 'حجز')} · السعر الأساسي ${money(r.custom_nightly_price || r.price_per_night)}/ليلة</p></div>
        </div>
        <div class="reservation-preview-header-side"><span class="reservation-preview-status is-${statusTone}">${status}</span><button type="button" class="reservation-preview-close modal-layout__close" data-preview-close aria-label="إغلاق">&times;</button></div>
      </header>
      <div class="reservation-preview-body modal-layout__body"><div class="reservation-preview-column">
        <section class="reservation-preview-section modal-section-card"><div class="reservation-preview-section-title modal-section-card__header"><span class="reservation-preview-title-icon">♙</span><div><strong>بيانات النزيل المقيم حالياً</strong><small>Guest Profile</small></div><div class="reservation-preview-contact-actions">${r.guest_phone ? `<a class="reservation-preview-contact" href="tel:${App.Helpers.escapeHtml(r.guest_phone)}">اتصال <span>☎</span></a>` : ''}<button type="button" class="reservation-preview-contact reservation-preview-whatsapp" data-action="whatsapp" data-id="${App.Helpers.escapeHtml(r.id)}">مراسلة واتساب <span>⌯</span></button></div></div><div class="reservation-preview-grid reservation-preview-grid-guest">${previewField('اسم النزيل الثنائي', r.guest_name, 'نزيل مسجل في النظام')}${previewField('رقم الجوال', r.guest_phone, 'متاح للإشعارات والاتصال')}${previewField('رقم الهوية / الإقامة', r.guest_id_number, 'إثبات ساري ومطابق للنظام')}</div></section>
        <section class="reservation-preview-section modal-section-card"><div class="reservation-preview-section-title modal-section-card__header"><span class="reservation-preview-title-icon">▦</span><div><strong>تفاصيل ومواعيد الإقامة</strong><small>Stay &amp; Contract Details</small></div><span class="reservation-preview-reference">رقم السند: RYH-${new Date().getFullYear()}-${String(r.id).padStart(5, '0')}</span></div><div class="reservation-preview-grid">${previewField('نوع الحجز', r.booking_type || 'حجز يومي', r.booking_type === 'عقد مفتوح' ? 'عقد إقامة مفتوح' : '')}${previewField('تاريخ الدخول', formatPreviewDate(r.check_in_date), r.booking_time ? `تسجيل: ${r.booking_time}` : '')}${previewField('تاريخ المغادرة المقررة', formatPreviewDate(r.check_out_date), r.checkout_time ? `تسليم المفتاح: ${r.checkout_time}` : '')}${previewField('سعر الليلة المتفق عليه', money(r.custom_nightly_price || r.price_per_night), Number(r.discount_amount) > 0 ? `خصم ${money(r.discount_amount)}` : '')}</div>${Number(r.discount_amount) > 0 || r.booking_type === 'عقد مفتوح' ? `<div class="reservation-preview-note"><strong>ملاحظات وتعليمات الإقامة:</strong> ${r.discount_reason ? App.Helpers.escapeHtml(r.discount_reason) : 'تطبق شروط العقد المسجلة على هذه الإقامة.'}</div>` : ''}</section>
        </div><div class="reservation-preview-column">
        <section class="reservation-preview-section modal-section-card"><div class="reservation-preview-section-title modal-section-card__header"><span class="reservation-preview-title-icon financial">ر.س</span><div><strong>المحاسبة والموقف المالي</strong><small>Financial Summary</small></div><span class="reservation-preview-paid-badge">${balance <= 0 ? 'مدفوع بالكامل' : 'مطلوب تحصيل'}</span></div><div class="reservation-preview-grid">${previewField('إجمالي الإقامة', money(total))}${previewField('إجمالي المبالغ المسددة', money(paid), r.payment_method || '')}${previewField('المبلغ المتبقي', money(balance), balance > 0 ? 'يستحق قبل المغادرة' : 'لا يوجد مبلغ مستحق')}${previewField('مبلغ التأمين', money(r.deposit_ledger_balance ?? r.deposit_amount), 'حسب سجل التأمين')}</div><div class="reservation-preview-payment-bar"><span style="width:${total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (paid > 0 ? 100 : 0)}%"></span></div></section>
        </div></div>
      <footer class="reservation-preview-footer modal-layout__footer">${r.status === 'مؤكد' ? `<button type="button" class="reservation-preview-action reservation-preview-checkout" data-action="checkout" data-id="${App.Helpers.escapeHtml(r.id)}"><span>⇥</span> تسوية ومغادرة (Check-out)</button><button type="button" class="reservation-preview-action reservation-preview-extend" data-action="extend" data-id="${App.Helpers.escapeHtml(r.id)}"><span>◷</span> تمديد الإقامة</button>` : ''}<button type="button" class="reservation-preview-action reservation-preview-invoice" data-action="invoice" data-id="${App.Helpers.escapeHtml(r.id)}"><span>▤</span> معاينة الفاتورة بالختم والتوقيع</button><button type="button" class="reservation-preview-footer-close" data-preview-close>إغلاق</button></footer>`;
    modal.style.display = 'flex';
    modal.querySelector('[data-preview-close]')?.focus();
  };

  App.Helpers.initOverview = function() {
  initExecutiveSummaryKpiActions();
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
