(function () {
  var session = requireRole('staff');
  if (!session) return;

  var BATCH_CACHE_KEY = 'pendingOrderBatchesCache';

  function saveBatchCache(batches) {
    var cache = loadBatchCache();
    batches.forEach(function (b) { cache[b.batchId] = b; });
    sessionStorage.setItem(BATCH_CACHE_KEY, JSON.stringify(cache));
  }
  function loadBatchCache() {
    try { return JSON.parse(sessionStorage.getItem(BATCH_CACHE_KEY)) || {}; } catch (e) { return {}; }
  }

  document.getElementById('btn-generate').addEventListener('click', async function () {
    var preArea = document.getElementById('pre-check-area');
    preArea.innerHTML = '';
    try {
      var data = await callApi('orderText.generate', { staffName: session.staffName }, true);
      saveBatchCache(data.batches);
      renderBatches(data.batches);
    } catch (e) {
      if (e.code === 'VALIDATION_ERROR' && e.details && e.details.uncheckedItems) {
        preArea.innerHTML = '<div class="alert alert-warning">未確認の商品が残っています: ' +
          e.details.uncheckedItems.map(function (i) { return i.name; }).join('、') + '</div>';
      } else {
        preArea.innerHTML = '<div class="alert alert-error">' + e.message + '</div>';
      }
    }
  });

  function renderBatches(batches) {
    var area = document.getElementById('batches-area');
    area.innerHTML = '';
    batches.forEach(function (b) {
      area.appendChild(renderBatchCard(b));
    });
  }

  function renderBatchCard(batch) {
    var card = document.createElement('div');
    card.className = 'card';

    var html = '<div class="card-title">' + batch.supplier +
      ' <span class="badge badge-info">' + batch.status + '</span></div>';
    html += '<pre class="order-text">' + escapeHtml_(batch.text) + '</pre>';
    card.innerHTML = html;

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-outline';
    copyBtn.textContent = '全文コピー';
    var copiedMsg = document.createElement('span');
    copiedMsg.className = 'badge badge-done';
    copiedMsg.style.display = 'none';
    copiedMsg.style.marginLeft = '8px';
    copiedMsg.textContent = 'コピーしました';

    copyBtn.addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(batch.text);
        await callApi('orderText.markCopied', { batchId: batch.batchId }, true);
        copiedMsg.style.display = 'inline-flex';
      } catch (e) {
        alert('コピーに失敗しました: ' + e.message);
      }
    });
    card.appendChild(copyBtn);
    card.appendChild(copiedMsg);

    var completeArea = document.createElement('div');
    completeArea.className = 'mt-16';

    if (batch.type === 'email') {
      var line = document.createElement('label');
      line.className = 'checkbox-line';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      var span = document.createElement('span');
      span.textContent = 'メールを送信しました';
      line.appendChild(cb);
      line.appendChild(span);
      completeArea.appendChild(line);

      var completeBtn = document.createElement('button');
      completeBtn.className = 'btn btn-primary btn-block mt-8';
      completeBtn.textContent = '発注依頼済みにする';
      completeBtn.addEventListener('click', async function () {
        if (!cb.checked) { alert('「メールを送信しました」にチェックしてください。'); return; }
        if (!confirm(batch.supplier + ' を発注依頼済みにします。よろしいですか？')) return;
        try {
          var res = await callApi('orderProcess.completeEmail', { batchId: batch.batchId, emailSentConfirmed: true, staffName: session.staffName }, true);
          markCardDone(card, res.status);
        } catch (e) {
          alert(e.message);
        }
      });
      completeArea.appendChild(completeBtn);
    } else {
      var line2 = document.createElement('label');
      line2.className = 'checkbox-line';
      var cb2 = document.createElement('input');
      cb2.type = 'checkbox';
      var span2 = document.createElement('span');
      span2.textContent = 'ホワイトボードへ記入しました';
      line2.appendChild(cb2);
      line2.appendChild(span2);
      completeArea.appendChild(line2);

      var completeBtn2 = document.createElement('button');
      completeBtn2.className = 'btn btn-primary btn-block mt-8';
      completeBtn2.textContent = '記入済みにする';
      completeBtn2.addEventListener('click', async function () {
        if (!cb2.checked) { alert('「ホワイトボードへ記入しました」にチェックしてください。'); return; }
        if (!confirm(batch.supplier + ' を記入済みにします。よろしいですか？')) return;
        try {
          var res = await callApi('orderProcess.completeWhiteboard', { batchId: batch.batchId, whiteboardConfirmed: true, staffName: session.staffName }, true);
          markCardDone(card, res.status);
        } catch (e) {
          alert(e.message);
        }
      });
      completeArea.appendChild(completeBtn2);
    }

    card.appendChild(completeArea);
    return card;
  }

  function markCardDone(card, status) {
    var doneMsg = document.createElement('div');
    doneMsg.className = 'alert alert-success mt-16';
    doneMsg.textContent = '処理完了: ' + status;
    card.appendChild(doneMsg);
    card.querySelectorAll('button, input').forEach(function (el) { el.disabled = true; });
  }

  function escapeHtml_(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ページ読み込み時、キャッシュされた未完了バッチがあれば復元表示する
  (function restorePending() {
    var cache = loadBatchCache();
    var batches = Object.keys(cache).map(function (k) { return cache[k]; })
      .filter(function (b) { return b.status !== '発注依頼済み' && b.status !== '記入済み'; });
    if (batches.length > 0) renderBatches(batches);
  })();
})();
