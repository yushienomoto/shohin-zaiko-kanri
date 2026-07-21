(function () {
  var session = requireRole('admin');
  if (!session) return;

  document.getElementById('btn-logout').addEventListener('click', logout);

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.style.display = 'none'; });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
    });
  });

  var EDITABLE_FIELDS = ['場所', '分類', '品名', '正式名称', '発注先', 'URL', '重要度', '発注点', '標準発注数', '単位', '値段', '備考'];

  // ---- 新規追加フォーム ----
  var createForm = document.getElementById('create-form');
  var createInputs = {};
  EDITABLE_FIELDS.forEach(function (f) {
    var wrap = document.createElement('div');
    wrap.className = 'form-group';
    var input;
    if (f === '場所') {
      input = document.createElement('select');
      ['A', 'B', 'C', 'D'].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; input.appendChild(o); });
    } else if (f === '重要度') {
      input = document.createElement('select');
      ['A', 'B', 'C'].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; input.appendChild(o); });
    } else {
      input = document.createElement('input');
      input.type = (f === '発注点' || f === '標準発注数' || f === '値段') ? 'number' : 'text';
    }
    wrap.innerHTML = '<label>' + f + '</label>';
    wrap.appendChild(input);
    createForm.appendChild(wrap);
    createInputs[f] = input;
  });

  document.getElementById('btn-create').addEventListener('click', async function () {
    var params = {};
    EDITABLE_FIELDS.forEach(function (f) { params[f] = createInputs[f].value; });
    var resultEl = document.getElementById('create-result');
    try {
      var res = await callApi('admin.masterCreate', params, true);
      resultEl.innerHTML = '<div class="alert alert-success">追加しました（商品ID: ' + res.itemId + '）</div>';
      EDITABLE_FIELDS.forEach(function (f) { createInputs[f].value = ''; });
      loadMasterList();
    } catch (e) {
      resultEl.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
    }
  });

  // ---- マスター一覧 ----
  document.getElementById('chk-include-deactivated').addEventListener('change', loadMasterList);

  async function loadMasterList() {
    var area = document.getElementById('master-list-area');
    area.innerHTML = '<div class="text-muted text-center">読み込み中...</div>';
    try {
      var includeDeactivated = document.getElementById('chk-include-deactivated').checked;
      var data = await callApi('admin.masterList', { includeDeactivated: includeDeactivated }, true);
      var html = '<div class="card"><div class="table-scroll"><table class="data-table"><tr><th>ID</th><th>場所</th><th>品名</th><th>重要度</th><th>発注点</th><th>標準発注数</th><th>単位</th><th>発注先</th><th>状態</th><th></th></tr>';
      data.items.forEach(function (item) {
        html += '<tr><td>' + item['商品ID'] + '</td><td>' + item['場所'] + '</td><td>' + item['品名'] + '</td><td>' + item['重要度'] + '</td><td>' + item['発注点'] + '</td><td>' + item['標準発注数'] + '</td><td>' + item['単位'] + '</td><td>' + item['発注先'] + '</td><td>' + item['使用状態'] + '</td>' +
          '<td><button class="btn btn-outline" data-edit="' + item['商品ID'] + '" style="min-height:32px; padding:4px 10px;">編集</button></td></tr>';
      });
      html += '</table></div></div>';
      area.innerHTML = html;
      area.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () { openEditModal(data.items.filter(function (i) { return i['商品ID'] === btn.dataset.edit; })[0]); });
      });
    } catch (e) {
      area.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
    }
  }

  function openEditModal(item) {
    var modal = document.getElementById('edit-modal');
    var html = '<div class="card-title">商品編集: ' + item['品名'] + '（' + item['商品ID'] + '）</div>';
    var inputs = {};
    EDITABLE_FIELDS.forEach(function (f) {
      html += '<div class="form-group"><label>' + f + '</label><input type="text" data-field="' + f + '" value="' + (item[f] !== undefined ? String(item[f]).replace(/"/g, '&quot;') : '') + '"></div>';
    });
    html += '<div class="form-group"><label>変更理由（必須）</label><input type="text" id="edit-reason"></div>';
    html += '<div id="edit-error"></div>';
    html += '<button class="btn btn-primary btn-block" id="edit-save">保存</button>';
    html += '<button class="btn btn-danger btn-block mt-8" id="edit-deactivate">この商品を使用停止にする</button>';
    html += '<button class="btn btn-outline btn-block mt-8" id="edit-cancel">閉じる</button>';
    modal.innerHTML = html;
    modal.style.display = 'block';

    modal.querySelectorAll('[data-field]').forEach(function (input) { inputs[input.dataset.field] = input; });

    document.getElementById('edit-cancel').addEventListener('click', function () { modal.style.display = 'none'; });

    document.getElementById('edit-save').addEventListener('click', async function () {
      var reason = document.getElementById('edit-reason').value.trim();
      var errorEl = document.getElementById('edit-error');
      if (!reason) { errorEl.innerHTML = '<div class="alert alert-error">変更理由を入力してください。</div>'; return; }
      var changes = {};
      EDITABLE_FIELDS.forEach(function (f) {
        var newVal = inputs[f].value;
        if (String(item[f] || '') !== newVal) {
          changes[f] = { before: item[f], after: newVal };
        }
      });
      if (Object.keys(changes).length === 0) { errorEl.innerHTML = '<div class="alert alert-warning">変更点がありません。</div>'; return; }
      try {
        await callApi('admin.masterUpdate', { itemId: item['商品ID'], changes: changes, changedBy: session.staffName, reason: reason }, true);
        modal.style.display = 'none';
        loadMasterList();
      } catch (e) {
        errorEl.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
      }
    });

    document.getElementById('edit-deactivate').addEventListener('click', async function () {
      var reason = document.getElementById('edit-reason').value.trim();
      var errorEl = document.getElementById('edit-error');
      if (!reason) { errorEl.innerHTML = '<div class="alert alert-error">変更理由を入力してください。</div>'; return; }
      if (!confirm(item['品名'] + ' を使用停止にします。よろしいですか？')) return;
      try {
        await callApi('admin.masterDeactivate', { itemId: item['商品ID'], reason: reason, changedBy: session.staffName }, true);
        modal.style.display = 'none';
        loadMasterList();
      } catch (e) {
        errorEl.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
      }
    });
  }

  // ---- 履歴検索 ----
  var HISTORY_TYPES = [
    { value: 'shortageReport', label: '不足報告履歴' },
    { value: 'stockCheck', label: '在庫確認履歴' },
    { value: 'orderProcess', label: '発注処理履歴' },
    { value: 'orderDetail', label: '発注明細履歴' },
    { value: 'masterChange', label: 'マスター変更履歴' }
  ];
  var filterForm = document.getElementById('history-filter-form');
  filterForm.innerHTML =
    field('historyType', '履歴種別', 'select', HISTORY_TYPES) +
    field('dateFrom', '期間(開始)', 'date') +
    field('dateTo', '期間(終了)', 'date') +
    field('itemId', '商品ID', 'text') +
    field('importance', '重要度', 'text') +
    field('supplier', '仕入先', 'text') +
    field('operator', '担当者', 'text') +
    field('status', '状態', 'text');

  function field(name, label, type, options) {
    var inputHtml;
    if (type === 'select') {
      inputHtml = '<select id="f-' + name + '">' + options.map(function (o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('') + '</select>';
    } else {
      inputHtml = '<input type="' + type + '" id="f-' + name + '">';
    }
    return '<div class="form-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function collectFilterParams() {
    var params = {};
    ['historyType', 'dateFrom', 'dateTo', 'itemId', 'importance', 'supplier', 'operator', 'status'].forEach(function (n) {
      var el = document.getElementById('f-' + n);
      if (el.value) params[n] = el.value;
    });
    return params;
  }

  document.getElementById('btn-search').addEventListener('click', async function () {
    var area = document.getElementById('history-result-area');
    area.innerHTML = '<div class="text-muted text-center">検索中...</div>';
    try {
      var params = collectFilterParams();
      params.page = 1;
      params.pageSize = 200;
      var data = await callApi('admin.historySearch', params, true);
      if (data.records.length === 0) {
        area.innerHTML = '<div class="alert alert-info">該当する履歴がありません。</div>';
        return;
      }
      var keys = Object.keys(data.records[0]);
      var html = '<div class="card"><div class="item-meta">' + data.totalCount + '件中 ' + data.records.length + '件表示</div><div class="table-scroll"><table class="data-table"><tr>' +
        keys.map(function (k) { return '<th>' + k + '</th>'; }).join('') + '</tr>';
      data.records.forEach(function (r) {
        html += '<tr>' + keys.map(function (k) { return '<td>' + (r[k] !== undefined && r[k] !== null ? r[k] : '') + '</td>'; }).join('') + '</tr>';
      });
      html += '</table></div></div>';
      area.innerHTML = html;
    } catch (e) {
      area.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
    }
  });

  document.getElementById('btn-export').addEventListener('click', async function () {
    try {
      var params = collectFilterParams();
      var data = await callApi('admin.historyExportCsv', params, true);
      var byteChars = atob(data.csvBase64);
      var byteNumbers = new Array(byteChars.length);
      for (var i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      var blob = new Blob([new Uint8Array(byteNumbers)], { type: 'text/csv' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.fileName;
      link.click();
    } catch (e) {
      alert(e.message);
    }
  });

  loadMasterList();
})();
