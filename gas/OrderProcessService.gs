/**
 * 発注処理API（要認証: role=staff）
 * orderText.generate / orderText.markCopied
 * orderProcess.completeEmail / orderProcess.completeWhiteboard
 * orderDetail.recordActual
 */

function displayName_(candidate) {
  return candidate.officialName ? candidate.officialName : candidate.name;
}

function generateOrderText_(supplier, items) {
  var lines;
  if (supplier === '大矢荘平商店') {
    lines = ['増田さん', '', 'お疲れ様です。', '', '標題の件、下記ご確認の上、発注をお願いいたします。', ''];
    items.forEach(function (it) {
      lines.push('・' + displayName_(it) + '　' + it.standardOrderQty + it.unit);
    });
    lines.push('', '以上、ご確認お願いいたします。');
    return lines.join('\n');
  }
  if (supplier === 'ASKUL') {
    lines = ['専務', '', 'お疲れ様です。', '', '標題の件、下記ご確認の上、発注をお願いいたします。', ''];
    items.forEach(function (it) {
      lines.push('・' + displayName_(it) + '　' + it.standardOrderQty + it.unit);
      if (it.url) lines.push('　' + it.url);
      lines.push('');
    });
    lines.push('以上、ご確認お願いいたします。');
    return lines.join('\n');
  }
  if (supplier === HOMECENTER_SUPPLIER_NAME) {
    lines = ['ホームセンター購入品', ''];
    items.forEach(function (it) {
      lines.push('・' + displayName_(it) + '　' + it.standardOrderQty + it.unit);
    });
    lines.push('', '上記を倉庫内ホワイトボードへ記入してください。', '□ ホワイトボードへ記入しました');
    return lines.join('\n');
  }
  // その他仕入先向け汎用テンプレート
  lines = ['担当者様', '', 'お疲れ様です。', '', '標題の件、下記ご確認の上、発注をお願いいたします。', ''];
  items.forEach(function (it) {
    lines.push('・' + displayName_(it) + '　' + it.standardOrderQty + it.unit);
    if (it.url) lines.push('　' + it.url);
  });
  lines.push('', '以上、ご確認お願いいたします。');
  return lines.join('\n');
}

function handleOrderTextGenerate_(params, session) {
  var staffName = (params.staffName || session.staffName || '').toString().trim();
  if (!staffName) {
    throw new AppError_('VALIDATION_ERROR', '担当者名を入力してください。');
  }

  var weekly = handleChecklistGetWeekly_();
  if (weekly.items.length > 0) {
    throw new AppError_('VALIDATION_ERROR', '未確認の商品が残っています。', {
      uncheckedItems: weekly.items.map(function (i) { return { itemId: i.itemId, name: i.name }; })
    });
  }

  var candidatesResult = handleOrderCandidatesList_();
  if (candidatesResult.suppliers.length === 0) {
    throw new AppError_('VALIDATION_ERROR', '発注候補がありません。');
  }

  var processSheet = getSheet_(SHEET_NAMES.ORDER_PROCESS);
  var detailSheet = getSheet_(SHEET_NAMES.ORDER_DETAIL);
  var batches = [];

  candidatesResult.suppliers.forEach(function (s) {
    var isWhiteboard = s.supplier === HOMECENTER_SUPPLIER_NAME;
    var batchId = genBatchId_(s.supplier);
    var text = generateOrderText_(s.supplier, s.items);
    var createdAt = nowIso_();

    appendRecord_(processSheet, {
      '発注バッチID': batchId,
      '仕入先': s.supplier,
      '種別': isWhiteboard ? BATCH_TYPE.WHITEBOARD : BATCH_TYPE.EMAIL,
      '文面作成日時': createdAt,
      '文面作成者': staffName,
      '状態': BATCH_STATUS.TEXT_CREATED,
      '担当者': staffName,
      '本文': text
    });

    s.items.forEach(function (it) {
      appendRecord_(detailSheet, {
        '明細ID': genRecordId_('D'),
        '発注バッチID': batchId,
        '商品ID': it.itemId,
        '確認数量': it.checkedQty,
        '当時の発注点': it.reorderPoint,
        '標準発注数': it.standardOrderQty,
        '当時の重要度': it.importance,
        '仕入先': s.supplier
      });
    });

    batches.push({
      batchId: batchId,
      supplier: s.supplier,
      type: isWhiteboard ? BATCH_TYPE.WHITEBOARD : BATCH_TYPE.EMAIL,
      text: text,
      status: BATCH_STATUS.TEXT_CREATED
    });
  });

  return { batches: batches };
}

function findBatch_(batchId) {
  var sheet = getSheet_(SHEET_NAMES.ORDER_PROCESS);
  var batch = findRecordByField_(sheet, '発注バッチID', batchId);
  if (!batch) throw new AppError_('NOT_FOUND', '発注バッチが見つかりません。');
  return { sheet: sheet, batch: batch };
}

function handleOrderTextMarkCopied_(params) {
  var found = findBatch_(params.batchId);
  updateRecordFields_(found.sheet, found.batch.__row, { 'コピー日時': nowIso_() });
  return { batchId: params.batchId, copiedAt: nowIso_() };
}

function handleOrderProcessCompleteEmail_(params, session) {
  var found = findBatch_(params.batchId);
  var batch = found.batch;
  if (batch['種別'] !== BATCH_TYPE.EMAIL) {
    throw new AppError_('VALIDATION_ERROR', 'メール対象の仕入先ではありません。');
  }
  if (batch['状態'] === BATCH_STATUS.ORDER_REQUESTED) {
    throw new AppError_('CONFLICT', 'すでに発注依頼済みです。');
  }
  if (params.emailSentConfirmed !== true) {
    throw new AppError_('VALIDATION_ERROR', 'メール送信済みのチェックが必要です。');
  }
  var staffName = (params.staffName || session.staffName || '').toString().trim();
  var completedAt = nowIso_();
  updateRecordFields_(found.sheet, batch.__row, {
    'メール送信済みチェック日時': completedAt,
    '発注依頼済み日時': completedAt,
    '状態': BATCH_STATUS.ORDER_REQUESTED,
    '担当者': staffName || batch['担当者']
  });
  return { batchId: params.batchId, status: BATCH_STATUS.ORDER_REQUESTED, completedAt: completedAt };
}

function handleOrderProcessCompleteWhiteboard_(params, session) {
  var found = findBatch_(params.batchId);
  var batch = found.batch;
  if (batch['種別'] !== BATCH_TYPE.WHITEBOARD) {
    throw new AppError_('VALIDATION_ERROR', 'ホワイトボード対象の仕入先ではありません。');
  }
  if (batch['状態'] === BATCH_STATUS.WHITEBOARD_FILLED) {
    throw new AppError_('CONFLICT', 'すでに記入済みです。');
  }
  if (params.whiteboardConfirmed !== true) {
    throw new AppError_('VALIDATION_ERROR', 'ホワイトボード記入済みのチェックが必要です。');
  }
  var staffName = (params.staffName || session.staffName || '').toString().trim();
  var completedAt = nowIso_();
  updateRecordFields_(found.sheet, batch.__row, {
    'ホワイトボード記入済みチェック日時': completedAt,
    '発注依頼済み日時': completedAt,
    '状態': BATCH_STATUS.WHITEBOARD_FILLED,
    '担当者': staffName || batch['担当者']
  });
  return { batchId: params.batchId, status: BATCH_STATUS.WHITEBOARD_FILLED, completedAt: completedAt };
}

function handleOrderDetailRecordActual_(params) {
  var batchId = params.batchId;
  var itemId = params.itemId;
  var actualQty = params.actualQty;
  var reason = (params.reason || '').toString().trim();
  if (!batchId || !itemId || actualQty === undefined || actualQty === null || actualQty === '') {
    throw new AppError_('VALIDATION_ERROR', 'batchId, itemId, actualQtyは必須です。');
  }
  if (!reason) {
    throw new AppError_('VALIDATION_ERROR', '実発注数を標準と変更する場合は変更理由が必須です。');
  }
  var detailSheet = getSheet_(SHEET_NAMES.ORDER_DETAIL);
  var records = getAllRecords_(detailSheet);
  var target = records.filter(function (r) { return r['発注バッチID'] === batchId && r['商品ID'] === itemId; })[0];
  if (!target) throw new AppError_('NOT_FOUND', '発注明細が見つかりません。');

  updateRecordFields_(detailSheet, target.__row, { '実発注数': actualQty, '変更理由': reason });
  return { detailId: target['明細ID'] };
}
