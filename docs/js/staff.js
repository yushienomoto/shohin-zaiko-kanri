(function () {
  var session = requireRole('staff');
  if (!session) return;

  document.getElementById('btn-logout').addEventListener('click', logout);

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.style.display = 'none'; });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
      if (btn.dataset.tab === 'candidates') loadCandidates();
      if (btn.dataset.tab === 'all') loadAll();
    });
  });

  async function loadSummary() {
    try {
      var data = await callApi('staffHome.getSummary', {}, true);
      var cardsEl = document.getElementById('summary-cards');
      cardsEl.innerHTML =
        summaryCard('未確認', data.uncheckedCount, 'badge-low') +
        summaryCard('確認済(今週)', data.checkedCount, 'badge-done') +
        summaryCard('発注候補', data.orderCandidateCount, 'badge-info');

      var pendingEl = document.getElementById('pending-batches-area');
      if (data.pendingBatches.length > 0) {
        pendingEl.innerHTML = '<div class="alert alert-warning">未完了の発注処理があります: ' +
          data.pendingBatches.map(function (b) { return b.supplier + '(' + b.status + ')'; }).join(', ') + '</div>';
      } else {
        pendingEl.innerHTML = '';
      }
    } catch (e) {
      console.error(e);
    }
  }

  function summaryCard(label, value, badgeClass) {
    return '<div class="card"><div class="item-meta">' + label + '</div>' +
      '<div style="font-size:28px; font-weight:bold;">' + value + '</div></div>';
  }

  async function loadWeekly() {
    var el = document.getElementById('tab-weekly');
    el.innerHTML = '<div class="text-muted text-center">読み込み中...</div>';
    try {
      var data = await callApi('checklist.getWeekly', {}, true);
      if (data.items.length === 0) {
        el.innerHTML = '<div class="alert alert-success">今週確認すべき商品はありません。</div>';
        return;
      }
      el.innerHTML = '';
      data.items.forEach(function (item) {
        el.appendChild(renderWeeklyItem(item));
      });
    } catch (e) {
      el.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
    }
  }

  function renderWeeklyItem(item) {
    var card = document.createElement('div');
    card.className = 'card';

    var header = document.createElement('div');
    header.innerHTML = '<div class="item-name">' + item.name + '（' + item.location + '）</div>' +
      '<div class="item-meta">重要度' + item.importance + ' / 発注点 ' + item.reorderPoint + item.unit +
      ' / 前回確認: ' + (item.lastCheckedQty !== null ? item.lastCheckedQty + item.unit : '未確認') + '</div>' +
      '<div class="mt-8">' + item.reasons.map(function (r) { return '<span class="badge badge-info">' + r + '</span>'; }).join(' ') + '</div>';
    card.appendChild(header);

    var formRow = document.createElement('div');
    formRow.className = 'form-group mt-16';
    formRow.innerHTML =
      '<label>現在数量（' + item.unit + '）</label>' +
      '<input type="number" class="qty-input" min="0">';
    card.appendChild(formRow);

    var resultArea = document.createElement('div');
    card.appendChild(resultArea);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-block';
    submitBtn.textContent = '確認を登録';
    var qtyInput = formRow.querySelector('.qty-input');

    submitBtn.addEventListener('click', async function () {
      var qty = qtyInput.value;
      if (qty === '') { resultArea.innerHTML = '<div class="alert alert-error">数量を入力してください。</div>'; return; }
      try {
        var res = await callApi('stockCheck.submit', { itemId: item.itemId, currentQty: Number(qty), checkerName: session.staffName }, true);
        resultArea.innerHTML = '<div class="alert alert-' + (res.judgement === '発注候補' ? 'warning' : 'success') + '">判定: ' + res.judgement + '</div>';
        card.dataset.checkId = res.checkId;
        submitBtn.textContent = '数量を修正';
        loadSummary();
        enableEditMode(card, res.checkId, qtyInput, resultArea, item.unit);
      } catch (e) {
        resultArea.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
      }
    });
    card.appendChild(submitBtn);
    return card;
  }

  function enableEditMode(card, checkId, qtyInput, resultArea, unit) {
    var buttons = card.querySelectorAll('button');
    var submitBtn = buttons[buttons.length - 1];
    var newBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newBtn, submitBtn);
    newBtn.addEventListener('click', async function () {
      var qty = qtyInput.value;
      if (qty === '') return;
      try {
        var res = await callApi('stockCheck.update', { checkId: checkId, newQty: Number(qty), operatorName: session.staffName }, true);
        resultArea.innerHTML = '<div class="alert alert-' + (res.judgement === '発注候補' ? 'warning' : 'success') + '">判定(修正後): ' + res.judgement + '</div>';
        loadSummary();
      } catch (e) {
        resultArea.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
      }
    });
  }

  async function loadCandidates() {
    var el = document.getElementById('tab-candidates');
    el.innerHTML = '<div class="text-muted text-center">読み込み中...</div>';
    try {
      var data = await callApi('orderCandidates.list', {}, true);
      if (data.suppliers.length === 0) {
        el.innerHTML = '<div class="alert alert-success">発注候補はありません。</div>';
        return;
      }
      el.innerHTML = '';
      data.suppliers.forEach(function (s) {
        var card = document.createElement('div');
        card.className = 'card';
        var html = '<div class="card-title">' + s.supplier + '（' + s.items.length + '件）</div>';
        html += '<div class="table-scroll"><table class="data-table"><tr><th>商品</th><th>確認数</th><th>発注点</th><th>標準発注数</th></tr>';
        s.items.forEach(function (it) {
          html += '<tr><td>' + (it.officialName || it.name) + '</td><td>' + it.checkedQty + it.unit + '</td><td>' + it.reorderPoint + it.unit + '</td><td>' + it.standardOrderQty + it.unit + '</td></tr>';
        });
        html += '</table></div>';
        card.innerHTML = html;
        el.appendChild(card);
      });
    } catch (e) {
      el.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
    }
  }

  async function loadAll() {
    var el = document.getElementById('tab-all');
    el.innerHTML = '<div class="text-muted text-center">読み込み中...</div>';
    try {
      var data = await callApi('checklist.getAll', {}, true);
      var html = '<div class="card"><div class="table-scroll"><table class="data-table"><tr><th>場所</th><th>商品</th><th>重要度</th><th>発注点</th><th>前回確認数</th><th>前回確認日</th></tr>';
      data.items.forEach(function (it) {
        html += '<tr><td>' + it.location + '</td><td>' + it.name + '</td><td>' + it.importance + '</td><td>' + it.reorderPoint + it.unit + '</td>' +
          '<td>' + (it.lastCheckedQty !== null ? it.lastCheckedQty + it.unit : '-') + '</td>' +
          '<td>' + (it.lastCheckedAt ? new Date(it.lastCheckedAt).toLocaleString('ja-JP') : '-') + '</td></tr>';
      });
      html += '</table></div></div>';
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
    }
  }

  loadSummary();
  loadWeekly();
})();
