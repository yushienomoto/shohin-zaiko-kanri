(function () {
  var modal = document.getElementById('login-modal');
  var titleEl = document.getElementById('login-modal-title');
  var nameInput = document.getElementById('login-name');
  var nameLabel = document.getElementById('login-name-label');
  var pinInput = document.getElementById('login-pin');
  var errorEl = document.getElementById('login-error');
  var pendingRole = null;

  function openModal(role) {
    pendingRole = role;
    titleEl.textContent = role === 'staff' ? '担当者ログイン' : '管理者ログイン';
    nameLabel.textContent = role === 'staff' ? '担当者名（初回のみ入力）' : '管理者名（初回のみ入力）';
    nameInput.value = localStorage.getItem(role === 'staff' ? 'lastStaffName' : 'lastAdminName') || '';
    nameInput.style.display = 'block';
    pinInput.value = '';
    errorEl.style.display = 'none';
    modal.style.display = 'block';
  }

  document.getElementById('btn-staff-login').addEventListener('click', function () { openModal('staff'); });
  document.getElementById('btn-admin-login').addEventListener('click', function () { openModal('admin'); });
  document.getElementById('login-cancel').addEventListener('click', function () { modal.style.display = 'none'; });

  document.getElementById('login-submit').addEventListener('click', async function () {
    var pin = pinInput.value.trim();
    var name = nameInput.value.trim();
    if (!pin) {
      errorEl.textContent = 'PINを入力してください。';
      errorEl.style.display = 'flex';
      return;
    }
    if (!name) {
      errorEl.textContent = (pendingRole === 'staff' ? '担当者名' : '管理者名') + 'を入力してください。';
      errorEl.style.display = 'flex';
      return;
    }
    try {
      await login(pendingRole, pin, name);
      if (pendingRole === 'staff') {
        localStorage.setItem('lastStaffName', name);
        window.location.href = 'staff.html';
      } else {
        localStorage.setItem('lastAdminName', name);
        window.location.href = 'admin.html';
      }
    } catch (e) {
      errorEl.textContent = e.message || 'ログインに失敗しました。';
      errorEl.style.display = 'flex';
    }
  });
})();
