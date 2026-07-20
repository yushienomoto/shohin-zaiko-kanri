/**
 * 一般社員向けAPI（認証なし）
 * items.listByLocation / shortageReport.submit / shortageReport.upgrade
 */

function handleItemsListByLocation_(params) {
  var location = params.location;
  if (LOCATIONS.indexOf(location) === -1) {
    throw new AppError_('VALIDATION_ERROR', 'locationはA/B/Cのいずれかを指定してください。');
  }
  var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var items = getAllRecords_(itemSheet).filter(function (r) {
    return r['場所'] === location && r['使用状態'] === ITEM_STATUS.ACTIVE;
  });

  var reportSheet = getSheet_(SHEET_NAMES.SHORTAGE_REPORT);
  var reports = getAllRecords_(reportSheet).filter(function (r) {
    return r['処理状態'] === SHORTAGE_PROCESS_STATE.UNPROCESSED;
  });
  var latestUnprocessedByItem = {};
  reports.forEach(function (r) {
    var existing = latestUnprocessedByItem[r['商品ID']];
    if (!existing || new Date(r['報告日時']) > new Date(existing['報告日時'])) {
      latestUnprocessedByItem[r['商品ID']] = r;
    }
  });

  function toItemView(item) {
    var report = latestUnprocessedByItem[item['商品ID']];
    return {
      itemId: item['商品ID'],
      name: item['品名'],
      reorderPoint: item['発注点'],
      unit: item['単位'],
      reportStatus: report ? {
        reported: true,
        state: report['状態'],
        reportedAt: report['報告日時'],
        reportId: report['報告ID']
      } : { reported: false }
    };
  }

  var categories;
  if (location === 'A') {
    categories = LOCATION_A_CATEGORIES.map(function (categoryName) {
      return {
        categoryName: categoryName,
        items: items.filter(function (i) { return i['分類'] === categoryName; }).map(toItemView)
      };
    });
  } else {
    categories = [{ categoryName: null, items: items.map(toItemView) }];
  }

  return { location: location, categories: categories };
}

function handleShortageReportSubmit_(params) {
  var reporterName = (params.reporterName || '').toString().trim();
  var reports = params.reports;
  if (!reporterName) {
    throw new AppError_('VALIDATION_ERROR', '報告者名を入力してください。');
  }
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new AppError_('VALIDATION_ERROR', '報告する商品を選択してください。');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_(SHEET_NAMES.SHORTAGE_REPORT);
    var existing = getAllRecords_(sheet);
    var accepted = [];
    var rejected = [];

    reports.forEach(function (entry) {
      var itemId = entry.itemId;
      var state = entry.state;
      if ([SHORTAGE_STATE.LOW, SHORTAGE_STATE.OUT].indexOf(state) === -1) {
        rejected.push({ itemId: itemId, reason: 'VALIDATION_ERROR' });
        return;
      }
      var hasUnprocessed = existing.some(function (r) {
        return r['商品ID'] === itemId && r['処理状態'] === SHORTAGE_PROCESS_STATE.UNPROCESSED;
      });
      if (hasUnprocessed) {
        rejected.push({ itemId: itemId, reason: 'ALREADY_REPORTED' });
        return;
      }
      var reportId = genRecordId_('R');
      appendRecord_(sheet, {
        '報告ID': reportId,
        '報告日時': nowIso_(),
        '商品ID': itemId,
        '状態': state,
        '報告者名': reporterName,
        '処理状態': SHORTAGE_PROCESS_STATE.UNPROCESSED
      });
      existing.push({ '商品ID': itemId, '処理状態': SHORTAGE_PROCESS_STATE.UNPROCESSED });
      accepted.push(itemId);
    });

    return { accepted: accepted, rejected: rejected };
  } finally {
    lock.releaseLock();
  }
}

function handleShortageReportUpgrade_(params) {
  var reportId = params.reportId;
  var newState = params.newState;
  if (newState !== SHORTAGE_STATE.OUT) {
    throw new AppError_('VALIDATION_ERROR', 'newStateは「在庫なし」のみ指定できます。');
  }
  var sheet = getSheet_(SHEET_NAMES.SHORTAGE_REPORT);
  var original = findRecordByField_(sheet, '報告ID', reportId);
  if (!original) {
    throw new AppError_('NOT_FOUND', '指定の報告が見つかりません。');
  }
  if (original['状態'] !== SHORTAGE_STATE.LOW || original['処理状態'] !== SHORTAGE_PROCESS_STATE.UNPROCESSED) {
    throw new AppError_('CONFLICT', 'この報告は更新できません。');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    updateRecordFields_(sheet, original.__row, {
      '処理状態': SHORTAGE_PROCESS_STATE.PROCESSED,
      '更新日時': nowIso_()
    });
    var newReportId = genRecordId_('R');
    appendRecord_(sheet, {
      '報告ID': newReportId,
      '報告日時': nowIso_(),
      '商品ID': original['商品ID'],
      '状態': SHORTAGE_STATE.OUT,
      '報告者名': original['報告者名'],
      '処理状態': SHORTAGE_PROCESS_STATE.UNPROCESSED,
      '元報告ID': reportId
    });
    return { reportId: newReportId };
  } finally {
    lock.releaseLock();
  }
}
