/**
 * 担当者向けAPI（要認証: role=staff）
 * checklist.getWeekly / checklist.getAll / stockCheck.submit / stockCheck.update
 * orderCandidates.list / staffHome.getSummary
 */

function getCurrentYearMonth_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
}

function getUnprocessedReportsByItem_() {
  var reportSheet = getSheet_(SHEET_NAMES.SHORTAGE_REPORT);
  var reports = getAllRecords_(reportSheet).filter(function (r) {
    return r['処理状態'] === SHORTAGE_PROCESS_STATE.UNPROCESSED;
  });
  var byItem = {};
  reports.forEach(function (r) {
    if (!byItem[r['商品ID']]) byItem[r['商品ID']] = [];
    byItem[r['商品ID']].push(r);
  });
  return byItem;
}

/** 当月、重要度B月次理由で確認済みの商品IDセットを返す */
function getMonthlyCheckedBItemIds_(checkRecords) {
  var ym = getCurrentYearMonth_();
  var set = {};
  checkRecords.forEach(function (r) {
    var checkYm = (r['確認日時'] || '').toString().slice(0, 7);
    if (checkYm === ym) {
      set[r['商品ID']] = true;
    }
  });
  return set;
}

/** 今週の開始日時(月曜0時、Asia/Tokyo基準)を返す */
function getStartOfWeek_() {
  var now = new Date();
  var start = new Date(now);
  var day = start.getDay() === 0 ? 7 : start.getDay();
  start.setDate(start.getDate() - (day - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** 今週すでに確認済みの商品IDセットを返す(重要度Aの毎週確認判定に使用) */
function getWeeklyCheckedItemIds_(checkRecords) {
  var start = getStartOfWeek_();
  var set = {};
  checkRecords.forEach(function (r) {
    if (new Date(r['確認日時']) >= start) {
      set[r['商品ID']] = true;
    }
  });
  return set;
}

function getLatestCheckByItem_(checkRecords) {
  var byItem = {};
  checkRecords.forEach(function (r) {
    var existing = byItem[r['商品ID']];
    if (!existing || new Date(r['確認日時']) > new Date(existing['確認日時'])) {
      byItem[r['商品ID']] = r;
    }
  });
  return byItem;
}

function handleChecklistGetWeekly_() {
  var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var items = getAllRecords_(itemSheet).filter(function (r) { return r['使用状態'] === ITEM_STATUS.ACTIVE; });

  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var checkRecords = getAllRecords_(checkSheet);
  var latestCheckByItem = getLatestCheckByItem_(checkRecords);
  var monthlyCheckedB = getMonthlyCheckedBItemIds_(checkRecords);
  var weeklyChecked = getWeeklyCheckedItemIds_(checkRecords);
  var unprocessedByItem = getUnprocessedReportsByItem_();

  var result = [];
  items.forEach(function (item) {
    var itemId = item['商品ID'];
    var reasons = [];
    if (unprocessedByItem[itemId]) reasons.push(CHECK_REASON.SHORTAGE_REPORT);
    if (item['重要度'] === 'A' && !weeklyChecked[itemId]) reasons.push(CHECK_REASON.IMPORTANCE_A_WEEKLY);
    if (item['重要度'] === 'B' && !monthlyCheckedB[itemId]) reasons.push(CHECK_REASON.IMPORTANCE_B_MONTHLY);
    if (reasons.length === 0) return;

    var lastCheck = latestCheckByItem[itemId];
    result.push({
      itemId: itemId,
      name: item['品名'],
      location: item['場所'],
      importance: item['重要度'],
      reorderPoint: item['発注点'],
      unit: item['単位'],
      lastCheckedQty: lastCheck ? lastCheck['現在数量'] : null,
      lastCheckedAt: lastCheck ? lastCheck['確認日時'] : null,
      reasons: reasons,
      shortageReports: (unprocessedByItem[itemId] || []).map(function (r) {
        return { reportId: r['報告ID'], state: r['状態'], reporterName: r['報告者名'], reportedAt: r['報告日時'] };
      })
    });
  });

  return { items: result };
}

function handleChecklistGetAll_() {
  var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var items = getAllRecords_(itemSheet).filter(function (r) { return r['使用状態'] === ITEM_STATUS.ACTIVE; });
  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var latestCheckByItem = getLatestCheckByItem_(getAllRecords_(checkSheet));

  var result = items.map(function (item) {
    var lastCheck = latestCheckByItem[item['商品ID']];
    return {
      itemId: item['商品ID'],
      name: item['品名'],
      location: item['場所'],
      importance: item['重要度'],
      reorderPoint: item['発注点'],
      unit: item['単位'],
      lastCheckedQty: lastCheck ? lastCheck['現在数量'] : null,
      lastCheckedAt: lastCheck ? lastCheck['確認日時'] : null,
      reasons: []
    };
  });
  return { items: result };
}

function computeJudgement_(qty, reorderPoint) {
  return Number(qty) <= Number(reorderPoint) ? CHECK_JUDGEMENT.CANDIDATE : CHECK_JUDGEMENT.NOT_CANDIDATE;
}

function handleStockCheckSubmit_(params) {
  var itemId = params.itemId;
  var currentQty = params.currentQty;
  var checkerName = (params.checkerName || '').toString().trim();
  if (!itemId || currentQty === undefined || currentQty === null || currentQty === '') {
    throw new AppError_('VALIDATION_ERROR', 'itemIdとcurrentQtyは必須です。');
  }
  if (!checkerName) {
    throw new AppError_('VALIDATION_ERROR', '確認者名を入力してください。');
  }
  var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var item = findRecordByField_(itemSheet, '商品ID', itemId);
  if (!item) throw new AppError_('NOT_FOUND', '商品が見つかりません。');

  var unprocessedByItem = getUnprocessedReportsByItem_();
  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var existingCheckRecords = getAllRecords_(checkSheet);
  var monthlyCheckedB = getMonthlyCheckedBItemIds_(existingCheckRecords);
  var weeklyChecked = getWeeklyCheckedItemIds_(existingCheckRecords);

  var reasons = [];
  if (unprocessedByItem[itemId]) reasons.push(CHECK_REASON.SHORTAGE_REPORT);
  if (item['重要度'] === 'A' && !weeklyChecked[itemId]) reasons.push(CHECK_REASON.IMPORTANCE_A_WEEKLY);
  if (item['重要度'] === 'B' && !monthlyCheckedB[itemId]) reasons.push(CHECK_REASON.IMPORTANCE_B_MONTHLY);

  var judgement = computeJudgement_(currentQty, item['発注点']);
  var checkId = genRecordId_('C');

  appendRecord_(checkSheet, {
    '確認ID': checkId,
    '確認日時': nowIso_(),
    '商品ID': itemId,
    '現在数量': currentQty,
    '当時の発注点': item['発注点'],
    '当時の重要度': item['重要度'],
    '当時の標準発注数': item['標準発注数'],
    '当時の単位': item['単位'],
    '由来理由': reasons.join(','),
    '判定結果': judgement,
    '確認者': checkerName
  });

  // この確認で不足報告は解消したものとして処理済みにする
  var reportSheet = getSheet_(SHEET_NAMES.SHORTAGE_REPORT);
  (unprocessedByItem[itemId] || []).forEach(function (r) {
    updateRecordFields_(reportSheet, r.__row, { '処理状態': SHORTAGE_PROCESS_STATE.PROCESSED, '更新日時': nowIso_() });
  });

  var data = { checkId: checkId, judgement: judgement };
  if (judgement === CHECK_JUDGEMENT.CANDIDATE) {
    data.orderCandidate = { supplier: item['発注先'], standardOrderQty: item['標準発注数'], unit: item['単位'] };
  }
  return data;
}

function handleStockCheckUpdate_(params) {
  var checkId = params.checkId;
  var newQty = params.newQty;
  var operatorName = (params.operatorName || '').toString().trim();
  if (!checkId || newQty === undefined || newQty === null || newQty === '') {
    throw new AppError_('VALIDATION_ERROR', 'checkIdとnewQtyは必須です。');
  }
  if (!operatorName) {
    throw new AppError_('VALIDATION_ERROR', '操作者名を入力してください。');
  }
  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var record = findRecordByField_(checkSheet, '確認ID', checkId);
  if (!record) throw new AppError_('NOT_FOUND', '確認履歴が見つかりません。');

  var judgement = computeJudgement_(newQty, record['当時の発注点']);
  updateRecordFields_(checkSheet, record.__row, {
    '修正前数量': record['現在数量'],
    '修正後数量': newQty,
    '修正日時': nowIso_(),
    '修正者': operatorName,
    '現在数量': newQty,
    '判定結果': judgement
  });

  var data = { checkId: checkId, judgement: judgement };
  if (judgement === CHECK_JUDGEMENT.CANDIDATE) {
    var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
    var item = findRecordByField_(itemSheet, '商品ID', record['商品ID']);
    data.orderCandidate = { supplier: item ? item['発注先'] : null, standardOrderQty: record['当時の標準発注数'], unit: record['当時の単位'] };
  }
  return data;
}

/**
 * 今週の確認を一括登録/一括修正する。
 * 商品ごとにAPIを分けず1回のリクエストで処理することで、シートの読み込み回数を
 * 商品数に依存させず一定に抑える(stockCheck.submit/updateの連続呼び出しより高速)。
 * items: [{ itemId, currentQty, checkId(修正時のみ) }]
 */
function handleStockCheckSyncBatch_(params) {
  var staffName = (params.staffName || '').toString().trim();
  var entries = params.items;
  if (!staffName) {
    throw new AppError_('VALIDATION_ERROR', '担当者名を入力してください。');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new AppError_('VALIDATION_ERROR', '登録する商品がありません。');
  }

  var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var itemsById = {};
  getAllRecords_(itemSheet).forEach(function (i) { itemsById[i['商品ID']] = i; });

  var unprocessedByItem = getUnprocessedReportsByItem_();
  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var existingCheckRecords = getAllRecords_(checkSheet);
  var monthlyCheckedB = getMonthlyCheckedBItemIds_(existingCheckRecords);
  var weeklyChecked = getWeeklyCheckedItemIds_(existingCheckRecords);
  var checkById = {};
  existingCheckRecords.forEach(function (r) { checkById[r['確認ID']] = r; });

  var newEntries = entries.filter(function (e) { return !e.checkId; });
  var updateEntries = entries.filter(function (e) { return !!e.checkId; });
  var newIds = genRecordIdsForBatch_('C', newEntries.length);

  var results = [];
  var newRows = [];
  var reportUpdateRows = [];
  var now = nowIso_();

  newEntries.forEach(function (entry, idx) {
    var item = itemsById[entry.itemId];
    if (!item || entry.currentQty === undefined || entry.currentQty === null || entry.currentQty === '') {
      results.push({ itemId: entry.itemId, error: 'VALIDATION_ERROR' });
      return;
    }
    var reasons = [];
    if (unprocessedByItem[entry.itemId]) reasons.push(CHECK_REASON.SHORTAGE_REPORT);
    if (item['重要度'] === 'A' && !weeklyChecked[entry.itemId]) reasons.push(CHECK_REASON.IMPORTANCE_A_WEEKLY);
    if (item['重要度'] === 'B' && !monthlyCheckedB[entry.itemId]) reasons.push(CHECK_REASON.IMPORTANCE_B_MONTHLY);

    var judgement = computeJudgement_(entry.currentQty, item['発注点']);
    var checkId = newIds[idx];

    newRows.push({
      '確認ID': checkId,
      '確認日時': now,
      '商品ID': entry.itemId,
      '現在数量': entry.currentQty,
      '当時の発注点': item['発注点'],
      '当時の重要度': item['重要度'],
      '当時の標準発注数': item['標準発注数'],
      '当時の単位': item['単位'],
      '由来理由': reasons.join(','),
      '判定結果': judgement,
      '確認者': staffName
    });

    (unprocessedByItem[entry.itemId] || []).forEach(function (r) { reportUpdateRows.push(r.__row); });

    var resultItem = { itemId: entry.itemId, checkId: checkId, judgement: judgement };
    if (judgement === CHECK_JUDGEMENT.CANDIDATE) {
      resultItem.orderCandidate = { supplier: item['発注先'], standardOrderQty: item['標準発注数'], unit: item['単位'] };
    }
    results.push(resultItem);
  });

  updateEntries.forEach(function (entry) {
    var record = checkById[entry.checkId];
    if (!record || entry.currentQty === undefined || entry.currentQty === null || entry.currentQty === '') {
      results.push({ itemId: entry.itemId, checkId: entry.checkId, error: 'NOT_FOUND' });
      return;
    }
    var judgement = computeJudgement_(entry.currentQty, record['当時の発注点']);
    updateRecordFields_(checkSheet, record.__row, {
      '修正前数量': record['現在数量'],
      '修正後数量': entry.currentQty,
      '修正日時': now,
      '修正者': staffName,
      '現在数量': entry.currentQty,
      '判定結果': judgement
    });

    var resultItem = { itemId: entry.itemId, checkId: entry.checkId, judgement: judgement };
    if (judgement === CHECK_JUDGEMENT.CANDIDATE) {
      var item = itemsById[entry.itemId];
      resultItem.orderCandidate = { supplier: item ? item['発注先'] : null, standardOrderQty: record['当時の標準発注数'], unit: record['当時の単位'] };
    }
    results.push(resultItem);
  });

  if (newRows.length > 0) {
    appendRecords_(checkSheet, newRows);
  }
  if (reportUpdateRows.length > 0) {
    var reportSheet = getSheet_(SHEET_NAMES.SHORTAGE_REPORT);
    reportUpdateRows.forEach(function (row) {
      updateRecordFields_(reportSheet, row, { '処理状態': SHORTAGE_PROCESS_STATE.PROCESSED, '更新日時': now });
    });
  }

  return { results: results };
}

/** 現在発注候補となっている商品(＝最新の確認が発注候補判定で、まだ発注文面生成前)を返す */
function getCurrentOrderCandidates_() {
  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var checkRecords = getAllRecords_(checkSheet);
  var latestByItem = getLatestCheckByItem_(checkRecords);

  var detailSheet = getSheet_(SHEET_NAMES.ORDER_DETAIL);
  var details = getAllRecords_(detailSheet);
  var processSheet = getSheet_(SHEET_NAMES.ORDER_PROCESS);
  var batchesById = {};
  getAllRecords_(processSheet).forEach(function (b) { batchesById[b['発注バッチID']] = b; });

  var itemSheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var itemsById = {};
  getAllRecords_(itemSheet).forEach(function (i) { itemsById[i['商品ID']] = i; });

  var candidates = [];
  Object.keys(latestByItem).forEach(function (itemId) {
    var check = latestByItem[itemId];
    if (check['判定結果'] !== CHECK_JUDGEMENT.CANDIDATE) return;
    var item = itemsById[itemId];
    if (!item || item['使用状態'] !== ITEM_STATUS.ACTIVE) return;

    var alreadyOrdered = details.some(function (d) {
      if (d['商品ID'] !== itemId) return false;
      var batch = batchesById[d['発注バッチID']];
      if (!batch) return false;
      return new Date(batch['文面作成日時']) > new Date(check['確認日時']);
    });
    if (alreadyOrdered) return;

    candidates.push({
      itemId: itemId,
      name: item['品名'],
      officialName: item['正式名称'] || '',
      checkedQty: check['現在数量'],
      reorderPoint: check['当時の発注点'],
      standardOrderQty: check['当時の標準発注数'],
      unit: check['当時の単位'],
      importance: check['当時の重要度'],
      url: item['URL'] || '',
      supplier: item['発注先']
    });
  });
  return candidates;
}

function handleOrderCandidatesList_() {
  var candidates = getCurrentOrderCandidates_();
  var bySupplier = {};
  candidates.forEach(function (c) {
    if (!bySupplier[c.supplier]) bySupplier[c.supplier] = [];
    bySupplier[c.supplier].push(c);
  });
  var suppliers = Object.keys(bySupplier).map(function (supplier) {
    return { supplier: supplier, items: bySupplier[supplier] };
  });
  return { suppliers: suppliers };
}

function handleStaffHomeGetSummary_() {
  var weekly = handleChecklistGetWeekly_();
  var candidates = getCurrentOrderCandidates_();

  var checkSheet = getSheet_(SHEET_NAMES.STOCK_CHECK);
  var checkRecords = getAllRecords_(checkSheet);
  var startOfWeek = getStartOfWeek_();
  var checkedCount = checkRecords.filter(function (r) {
    return new Date(r['確認日時']) >= startOfWeek;
  }).length;

  var processSheet = getSheet_(SHEET_NAMES.ORDER_PROCESS);
  var pendingBatches = getAllRecords_(processSheet).filter(function (b) {
    return b['状態'] !== BATCH_STATUS.ORDER_REQUESTED && b['状態'] !== BATCH_STATUS.WHITEBOARD_FILLED;
  }).map(function (b) {
    return { batchId: b['発注バッチID'], supplier: b['仕入先'], status: b['状態'] };
  });

  return {
    uncheckedCount: weekly.items.length,
    checkedCount: checkedCount,
    orderCandidateCount: candidates.length,
    pendingBatches: pendingBatches
  };
}
