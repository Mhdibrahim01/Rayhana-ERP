/**
 * Rayhana Suites ERP - Guests Management Module (Frontend Vanilla JS)
 * High-performance Server-Side Pagination & Dynamic Filtering for 750+ Guests
 */

(function () {
  // =========================================================================
  // State Management
  // =========================================================================
  let guestsCurrentPage = 1;
  const guestsPageLimit = 50;
  let guestsTotalPages = 1;
  let guestsTotalCount = 0;
  let guestsCache = [];
  let guestSearchDebounceTimer = null;

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const guestsTableBody = document.getElementById('guests-table-body');
  const guestsCountBadge = document.getElementById('guests-count-badge');
  const guestsEmpty = document.getElementById('guests-empty');
  const searchGuests = document.getElementById('search-guests');

  // Pagination DOM Elements
  const btnPrevPage = document.getElementById('btn-guests-prev-page');
  const btnNextPage = document.getElementById('btn-guests-next-page');
  const currentPageEl = document.getElementById('guests-current-page');
  const totalPagesEl = document.getElementById('guests-total-pages');
  const pageRangeEl = document.getElementById('guests-page-range');
  const totalCountEl = document.getElementById('guests-total-count');

  /**
   * Helper: Escape HTML string to prevent XSS
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Helper: Safe Toast notification fallback
   */
  function notify(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console.log(`[Toast ${type}]: ${msg}`);
    }
  }

  // =========================================================================
  // Data Fetching (Server-Side Pagination via Electron IPC)
  // =========================================================================
  async function loadGuestsData(page = guestsCurrentPage) {
    try {
      guestsCurrentPage = Math.max(1, page);
      const query = (searchGuests ? searchGuests.value : '').trim();

      // Show temporary loading indicator or skeleton if desired
      if (guestsTableBody && guestsCache.length === 0) {
        guestsTableBody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-8 text-slate-400 font-semibold">
              <span class="inline-block animate-spin mr-2">&#9696;</span> جاري تحميل سجل النزلاء...
            </td>
          </tr>
        `;
      }

      // Invoke server-side paginated IPC handler
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
      } else {
        notify(res?.message || 'تعذر تحميل بيانات النزلاء.', 'error');
      }
    } catch (err) {
      console.error('Error fetching paginated guests:', err);
      notify('حدث خطأ أثناء تحميل بيانات النزلاء.', 'error');
    }
  }

  // =========================================================================
  // Table Rendering (Only 50 DOM rows rendered per page)
  // =========================================================================
  function renderGuestsTable() {
    if (guestsCountBadge) {
      guestsCountBadge.textContent = guestsTotalCount.toLocaleString();
    }

    if (!guestsCache || guestsCache.length === 0) {
      if (guestsTableBody) guestsTableBody.innerHTML = '';
      if (guestsEmpty) guestsEmpty.style.display = 'block';
      return;
    }

    if (guestsEmpty) {
      guestsEmpty.style.display = 'none';
    }

    if (!guestsTableBody) return;

    guestsTableBody.innerHTML = guestsCache.map(guest => {
      const totalStays = guest.total_stays || 0;
      const totalSpent = Number(guest.total_spent || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      return `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100" data-guest-id="${guest.id}">
          <td class="px-5 py-4 font-bold text-slate-900">${escapeHtml(guest.name || '-')}</td>
          <td class="px-5 py-4 font-mono text-slate-700" dir="ltr">${escapeHtml(guest.phone || '-')}</td>
          <td class="px-5 py-4 font-mono text-slate-600">${escapeHtml(guest.id_number || '-')}</td>
          <td class="px-5 py-4 text-center">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
              totalStays > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
            }">
              ${totalStays} إقامة
            </span>
          </td>
          <td class="px-5 py-4 font-bold text-emerald-700">
            ${totalSpent} <span class="text-xs font-normal text-slate-500">ر.س</span>
          </td>
          <td class="px-5 py-4 text-xs text-slate-400">
            ${guest.created_at ? escapeHtml(guest.created_at.substring(0, 10)) : '-'}
          </td>
          <td class="px-5 py-4 text-left">
            <button 
              type="button" 
              class="btn-guest-quick-book px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              data-guest-name="${escapeHtml(guest.name || '')}"
              data-guest-phone="${escapeHtml(guest.phone || '')}"
              data-guest-id="${escapeHtml(guest.id_number || '')}"
            >
              حجز جديد +
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach quick book handlers
    guestsTableBody.querySelectorAll('.btn-guest-quick-book').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const name = target.getAttribute('data-guest-name');
        const phone = target.getAttribute('data-guest-phone');
        const idNum = target.getAttribute('data-guest-id');

        if (typeof window.openBookingModalForGuest === 'function') {
          window.openBookingModalForGuest({ name, phone, id_number: idNum });
        }
      });
    });
  }

  // =========================================================================
  // Pagination UI Updates
  // =========================================================================
  function updateGuestsPaginationUI() {
    if (currentPageEl) currentPageEl.textContent = guestsCurrentPage;
    if (totalPagesEl) totalPagesEl.textContent = Math.max(1, guestsTotalPages);
    if (totalCountEl) totalCountEl.textContent = guestsTotalCount.toLocaleString();

    if (pageRangeEl) {
      if (guestsTotalCount === 0) {
        pageRangeEl.textContent = '0 - 0';
      } else {
        const start = (guestsCurrentPage - 1) * guestsPageLimit + 1;
        const end = Math.min(guestsCurrentPage * guestsPageLimit, guestsTotalCount);
        pageRangeEl.textContent = `${start} - ${end}`;
      }
    }

    // Disable Previous button on page 1
    if (btnPrevPage) {
      btnPrevPage.disabled = guestsCurrentPage <= 1;
    }

    // Disable Next button on the last page
    if (btnNextPage) {
      btnNextPage.disabled = guestsCurrentPage >= guestsTotalPages;
    }
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (guestsCurrentPage > 1) {
        loadGuestsData(guestsCurrentPage - 1);
      }
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      if (guestsCurrentPage < guestsTotalPages) {
        loadGuestsData(guestsCurrentPage + 1);
      }
    });
  }

  // Debounced server-side search (resets to page 1)
  if (searchGuests) {
    searchGuests.addEventListener('input', () => {
      clearTimeout(guestSearchDebounceTimer);
      guestSearchDebounceTimer = setTimeout(() => {
        loadGuestsData(1);
      }, 250);
    });
  }

  // Expose module functions globally for integration
  window.guestsModule = {
    loadGuestsData,
    renderGuestsTable,
    updateGuestsPaginationUI,
    getCurrentPage: () => guestsCurrentPage,
    getPageLimit: () => guestsPageLimit,
    getTotalPages: () => guestsTotalPages,
    getTotalCount: () => guestsTotalCount
  };
})();
