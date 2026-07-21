(function () {
  var params = new URLSearchParams(window.location.search);
  var loc = params.get('loc') || 'A';
  document.getElementById('page-title').textContent = '場所' + loc;

  var nav = document.getElementById('location-nav');
  ['A', 'B', 'C', 'D'].forEach(function (l) {
    var a = document.createElement('a');
    a.href = 'location.html?loc=' + l;
    a.textContent = '場所' + l;
    if (l === loc) a.classList.add('active');
    nav.appendChild(a);
  });

  var reporterInput = document.getElementById('reporter-name');
  reporterInput.value = localStorage.getItem('lastReporterName') || '';

  var selections = {}; // itemId -> '少ない' | '在庫なし'

  function showAlert(message, type) {
    var area = document.getElementById('alert-area');
    area.innerHTML = '<div class="alert alert-' + type + '">' + message + '</div>';
    setTimeout(function () { area.innerHTML = ''; }, 4000);
  }

  function renderItem(item) {
    var row = document.createElement('div');
    row.className = 'item-row';

    var left = document.createElement('div');
    var nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;
    var metaEl = document.createElement('div');
    metaEl.className = 'item-meta';
    metaEl.textContent = '発注点 ' + item.reorderPoint + item.unit;
    left.appendChild(nameEl);
    left.appendChild(metaEl);
    row.appendChild(left);

    var right = document.createElement('div');
    right.className = 'item-actions';

    if (item.reportStatus.reported) {
      var badge = document.createElement('span');
      badge.className = 'badge ' + (item.reportStatus.state === '在庫なし' ? 'badge-out' : 'badge-low');
      badge.textContent = '報告済み: ' + item.reportStatus.state;
      right.appendChild(badge);

      if (item.reportStatus.state === '少ない') {
        var upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'btn btn-danger';
        upgradeBtn.textContent = '在庫なしへ更新';
        upgradeBtn.addEventListener('click', async function () {
          try {
            await callApi('shortageReport.upgrade', { reportId: item.reportStatus.reportId, newState: '在庫なし' }, false);
            showAlert(item.name + ' を「在庫なし」へ更新しました。', 'success');
            loadItems();
          } catch (e) {
            showAlert(e.message, 'error');
          }
        });
        right.appendChild(upgradeBtn);
      }
    } else {
      var lowBtn = document.createElement('button');
      lowBtn.className = 'btn btn-outline';
      lowBtn.textContent = '少ない';
      var outBtn = document.createElement('button');
      outBtn.className = 'btn btn-outline';
      outBtn.textContent = '在庫なし';

      function updateButtonState() {
        lowBtn.className = 'btn ' + (selections[item.itemId] === '少ない' ? 'btn-danger' : 'btn-outline');
        outBtn.className = 'btn ' + (selections[item.itemId] === '在庫なし' ? 'btn-danger' : 'btn-outline');
      }
      lowBtn.addEventListener('click', function () {
        selections[item.itemId] = selections[item.itemId] === '少ない' ? null : '少ない';
        if (!selections[item.itemId]) delete selections[item.itemId];
        updateButtonState();
      });
      outBtn.addEventListener('click', function () {
        selections[item.itemId] = selections[item.itemId] === '在庫なし' ? null : '在庫なし';
        if (!selections[item.itemId]) delete selections[item.itemId];
        updateButtonState();
      });
      right.appendChild(lowBtn);
      right.appendChild(outBtn);
    }

    row.appendChild(right);
    return row;
  }

  async function loadItems() {
    selections = {};
    var listEl = document.getElementById('item-list');
    listEl.innerHTML = '<div class="text-muted text-center">読み込み中...</div>';
    try {
      var data = await callApi('items.listByLocation', { location: loc }, false);
      listEl.innerHTML = '';
      data.categories.forEach(function (category) {
        var card = document.createElement('div');
        card.className = 'card';
        if (category.categoryName) {
          var title = document.createElement('div');
          title.className = 'card-title';
          title.textContent = category.categoryName;
          card.appendChild(title);
        }
        category.items.forEach(function (item) {
          card.appendChild(renderItem(item));
        });
        listEl.appendChild(card);
      });
    } catch (e) {
      listEl.innerHTML = '<div class="alert alert-error">読み込みに失敗しました: ' + e.message + '</div>';
    }
  }

  document.getElementById('btn-submit').addEventListener('click', async function () {
    var reporterName = reporterInput.value.trim();
    if (!reporterName) {
      showAlert('報告者名を入力してください。', 'error');
      return;
    }
    var reports = Object.keys(selections).map(function (itemId) {
      return { itemId: itemId, state: selections[itemId] };
    });
    if (reports.length === 0) {
      showAlert('報告する商品を選択してください。', 'error');
      return;
    }
    try {
      localStorage.setItem('lastReporterName', reporterName);
      var result = await callApi('shortageReport.submit', { reporterName: reporterName, reports: reports }, false);
      if (result.rejected.length > 0) {
        showAlert(result.accepted.length + '件送信しました。' + result.rejected.length + '件は既に報告済みのため送信できませんでした。', 'warning');
      } else {
        showAlert(result.accepted.length + '件送信しました。', 'success');
      }
      loadItems();
    } catch (e) {
      showAlert(e.message, 'error');
    }
  });

  loadItems();
})();
