(function(App) {
  'use strict';

  // =========================================================================
  // VIEW 6: EMPLOYEE ACTIVITY LOGS (سجل نشاط الموظفين - Admin Only)
  // =========================================================================
  async function loadLogsData() {
    const activeRole = localStorage.getItem('currentUserRole') || (App.State.currentUser ? App.State.currentUser.role : null);
    if (activeRole !== 'Admin') return;

    try {
      const res = await window.api.getEmployeeLogs();
      if (res.success) {
        App.State.logsCache = res.data || [];
        renderLogsTable();
      } else {
        App.Helpers.showToast(res.error || 'تعذر تحميل سجل الموظفين.', 'error');
      }
    } catch (err) {
      console.error('Load logs error:', err);
    }
  }

  function renderLogsTable() {
    const query = (App.DOM.searchLogs.value || '').toLowerCase().trim();

    const filtered = App.State.logsCache.filter(log => {
      if (!query) return true;
      return (
        String(log.id || '').includes(query) ||
        String(log.username || '').toLowerCase().includes(query) ||
        String(log.role || '').toLowerCase().includes(query)
      );
    });

    App.DOM.logsCountBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      App.DOM.logsTableBody.innerHTML = '';
      App.DOM.logsEmpty.style.display = 'block';
      return;
    }

    App.DOM.logsEmpty.style.display = 'none';

    App.DOM.logsTableBody.innerHTML = filtered.map(log => {
      const isAdmin = log.role === 'Admin';
      const isActive = !log.logout_time;

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--primary);">#${log.id}</td>
          <td style="font-weight: 700; font-size: 0.9rem;">
            ${App.Helpers.escapeHtml(log.username)}
          </td>
          <td>
            <span class="${isAdmin ? 'badge-role-admin' : 'badge-role-staff'}">
              ${isAdmin ? 'مدير نظام (Admin)' : 'مستخدم (User)'}
            </span>
          </td>
          <td style="font-family: monospace; font-size: 0.82rem; color: #334155;">
            ${App.Helpers.escapeHtml(log.login_time || '-')}
          </td>
          <td style="font-family: monospace; font-size: 0.82rem; color: #334155;">
            ${log.logout_time ? App.Helpers.escapeHtml(log.logout_time) : '<span style="color: var(--text-light);">-</span>'}
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

  App.Helpers.initLogs = function() {
    if (App.DOM.searchLogs) App.DOM.searchLogs.addEventListener('input', renderLogsTable);
    if (App.DOM.btnRefreshLogs) App.DOM.btnRefreshLogs.addEventListener('click', loadLogsData);
  };


  App.Helpers.loadLogsData = loadLogsData;

})(window.DashboardApp);
