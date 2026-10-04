(function(App) {
  'use strict';

  // =========================================================================
  // VIEW 5: ADMIN PANEL & USER MANAGEMENT (RBAC)
  // =========================================================================
  async function loadAdminData() {
    const activeRole = localStorage.getItem('currentUserRole') || (App.State.currentUser ? App.State.currentUser.role : null);
    if (activeRole !== 'Admin') return;

    try {
      const res = await window.api.getAllUsers();
      if (res.success) {
        App.State.usersCache = res.data || [];
        renderUsersTable();
      } else {
        App.Helpers.showToast(res.error || 'تعذر تحميل المستخدمين.', 'error');
      }
    } catch (err) {
      console.error('Load users error:', err);
    }
  }

  function renderUsersTable() {
    App.DOM.usersTableBody.innerHTML = App.State.usersCache.map(u => {
      const isAdmin = u.role === 'Admin';
      const isDefaultAdmin = u.username.toLowerCase() === 'admin';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--primary);">#${u.id}</td>
          <td style="font-weight: 700; font-size: 0.9rem;">
            ${App.Helpers.escapeHtml(u.username)}
            ${App.State.currentUser && u.id === App.State.currentUser.id ? ' <span style="font-size: 0.7rem; color: var(--success); font-weight: 600;">(أنت)</span>' : ''}
          </td>
          <td>
            <span class="${isAdmin ? 'badge-role-admin' : 'badge-role-staff'}">
              ${isAdmin ? 'مدير نظام (Admin)' : 'مستخدم (User)'}
            </span>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${App.Helpers.escapeHtml(String(u.created_at || '').split(' ')[0])}</td>
          <td style="text-align: center;">
            ${!isDefaultAdmin && (!App.State.currentUser || u.id !== App.State.currentUser.id) ? `
              <button class="btn btn-danger btn-sm" data-action="delete-user" data-id="${u.id}" data-username="${App.Helpers.escapeHtml(u.username)}" title="حذف المستخدم">
                حذف
              </button>
            ` : `<span style="font-size: 0.75rem; color: var(--text-light);">-</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  App.Helpers.initAdmin = function() {
  // Add User Form (Admin Only)
  App.DOM.addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = App.DOM.newUsernameInput.value.trim();
    const password = App.DOM.newUserPasswordInput.value;
    const role = App.DOM.newUserRoleSelect.value;

    if (!username || !password) {
      App.Helpers.showToast('يرجى ملء اسم المستخدم وكلمة المرور.', 'error');
      return;
    }

    const activeRole = localStorage.getItem('currentUserRole') || (App.State.currentUser ? App.State.currentUser.role : 'User');

    try {
      const res = await window.api.addUser({ username, password, role }, activeRole);
      if (res.success) {
        App.Helpers.showToast(`تم إنشاء حساب "${username}" بصلاحية ${role} بنجاح!`, 'success');
        App.DOM.addUserForm.reset();
        await loadAdminData();
      } else {
        App.Helpers.showToast(res.error || 'فشل إنشاء المستخدم.', 'error');
      }
    } catch (err) {
      App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  // Update Admin Password Form
  App.DOM.updatePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = App.DOM.currentAdminNewPasswordInput.value;
    if (!newPassword || newPassword.length < 3) {
      App.Helpers.showToast('كلمة المرور يجب أن لا تقل عن 3 أحرف.', 'error');
      return;
    }

    try {
      const res = await window.api.updateUserPassword({
        userId: App.State.currentUser ? App.State.currentUser.id : null,
        newPassword
      });

      if (res.success) {
        App.Helpers.showToast('تم تحديث كلمة المرور الخاصة بك بنجاح!', 'success');
        App.DOM.updatePasswordForm.reset();
      } else {
        App.Helpers.showToast(res.error || 'فشل تحديث كلمة المرور.', 'error');
      }
    } catch (err) {
      App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
    }
  });

  App.DOM.btnRefreshUsers.addEventListener('click', loadAdminData);

  // Delete User delegation (Admin Only)
  App.DOM.usersTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-user"]');
    if (!btn) return;

    const userId = btn.dataset.id;
    const username = btn.dataset.username;
    const activeRole = localStorage.getItem('currentUserRole') || (App.State.currentUser ? App.State.currentUser.role : 'User');

    const confirmed = await App.Helpers.showConfirmDialog({
      title: 'حذف مستخدم من النظام',
      message: `هل أنت متأكد من رغبتك في حذف المستخدم "${username}"؟\nلن يتمكن هذا المستخدم من تسجيل الدخول للنظام بعد الحذف.`,
      confirmText: 'نعم، حذف المستخدم',
      cancelText: 'إلغاء',
      isDanger: true
    });

    if (confirmed) {
      try {
        const res = await window.api.deleteUser(userId, activeRole);
        if (res.success) {
          App.Helpers.showToast(`تم حذف المستخدم "${username}" بنجاح.`, 'info');
          await loadAdminData();
        } else {
          App.Helpers.showToast(res.error || 'فشل حذف المستخدم.', 'error');
        }
      } catch (err) {
        App.Helpers.showToast(`خطأ: ${err.message}`, 'error');
      }
    }
  });

  // =========================================================================
  // FACTORY RESET APP DATA (Requires Admin Role & Password Challenge)
  // =========================================================================

  function openFactoryResetModal() {
    const activeRole = localStorage.getItem('currentUserRole') || (App.State.currentUser ? App.State.currentUser.role : null);
    if (activeRole !== 'Admin') {
      App.Helpers.showToast('غير مصرح: تصفير بيانات التطبيق يتطلب صلاحيات مدير النظام (Admin).', 'error');
      return;
    }
    if (App.DOM.factoryResetPasswordInput) App.DOM.factoryResetPasswordInput.value = '';
    if (App.DOM.factoryResetErrorMsg) {
      App.DOM.factoryResetErrorMsg.textContent = '';
      App.DOM.factoryResetErrorMsg.style.display = 'none';
    }
    if (App.DOM.factoryResetModal) {
      App.DOM.factoryResetModal.style.display = 'flex';
      setTimeout(() => {
        if (App.DOM.factoryResetPasswordInput) App.DOM.factoryResetPasswordInput.focus();
      }, 100);
    }
  }

  function closeFactoryResetModal() {
    if (App.DOM.factoryResetModal) App.DOM.factoryResetModal.style.display = 'none';
    if (App.DOM.factoryResetPasswordInput) App.DOM.factoryResetPasswordInput.value = '';
    if (App.DOM.factoryResetErrorMsg) {
      App.DOM.factoryResetErrorMsg.textContent = '';
      App.DOM.factoryResetErrorMsg.style.display = 'none';
    }
  }

  if (App.DOM.btnOpenFactoryReset) {
    App.DOM.btnOpenFactoryReset.addEventListener('click', openFactoryResetModal);
  }
  if (App.DOM.btnCloseFactoryReset) {
    App.DOM.btnCloseFactoryReset.addEventListener('click', closeFactoryResetModal);
  }
  if (App.DOM.btnCancelFactoryReset) {
    App.DOM.btnCancelFactoryReset.addEventListener('click', closeFactoryResetModal);
  }
  if (App.DOM.factoryResetModal) {
    App.DOM.factoryResetModal.addEventListener('click', (e) => {
      if (e.target === App.DOM.factoryResetModal) closeFactoryResetModal();
    });
  }

  if (App.DOM.factoryResetForm) {
    App.DOM.factoryResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = App.DOM.factoryResetPasswordInput ? App.DOM.factoryResetPasswordInput.value : '';
      if (!pwd) {
        if (App.DOM.factoryResetErrorMsg) {
          App.DOM.factoryResetErrorMsg.textContent = 'يرجى كتابة كلمة المرور لتأكيد تصفير البيانات.';
          App.DOM.factoryResetErrorMsg.style.display = 'block';
        }
        return;
      }

      if (App.DOM.btnSubmitFactoryReset) {
        App.DOM.btnSubmitFactoryReset.disabled = true;
        App.DOM.btnSubmitFactoryReset.textContent = 'جاري تصفير البيانات...';
      }

      try {
        const res = await window.api.factoryResetDatabase(pwd);
        if (res && res.success) {
          App.Helpers.showToast(res.message || 'تم تصفير بيانات النظام بنجاح واستعادة تهيئة المصنع!', 'success');
          closeFactoryResetModal();
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          if (App.DOM.factoryResetErrorMsg) {
            App.DOM.factoryResetErrorMsg.textContent = res?.error || 'فشلت عملية تصفير البيانات: تأكد من صحة كلمة المرور.';
            App.DOM.factoryResetErrorMsg.style.display = 'block';
          }
          if (App.DOM.factoryResetPasswordInput) {
            App.DOM.factoryResetPasswordInput.focus();
            App.Helpers.highlightField(App.DOM.factoryResetPasswordInput);
          }
        }
      } catch (err) {
        if (App.DOM.factoryResetErrorMsg) {
          App.DOM.factoryResetErrorMsg.textContent = `خطأ: ${err.message}`;
          App.DOM.factoryResetErrorMsg.style.display = 'block';
        }
      } finally {
        if (App.DOM.btnSubmitFactoryReset) {
          App.DOM.btnSubmitFactoryReset.disabled = false;
          App.DOM.btnSubmitFactoryReset.textContent = 'تأكيد التصفير واستعادة المصنع ⚠️';
        }
      }
    });
  }

  };

  App.Helpers.loadAdminData = loadAdminData;

})(window.DashboardApp);
