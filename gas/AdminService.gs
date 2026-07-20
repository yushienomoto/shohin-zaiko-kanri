/**
 * 管理者向けAPI（要認証: role=admin）
 * admin.masterList / admin.masterCreate / admin.masterUpdate / admin.masterDeactivate
 * admin.historySearch / admin.historyExportCsv
 */

var ITEM_MASTER_REQUIRED_FIELDS_ = ['場所', '品名', '発注先', '重要度', '発注点', '標準発注数', '単位'];
var ITEM_MASTER_EDITABLE_FIELDS_ = [
  '場所', '分類', '品名', '正式名称', '発注先', 'URL', '重要度',
  '発注点', '標準発注数', '単位', '値段', '備考'
];

function stripInternal_(record) {
  var copy = {};
  Object.keys(record).forEach(function (k) {
    if (k !== '__row') copy[k] = record[k];
  });
  return copy;
}

function handleAdminMasterList_(params) {
  var includeDeactivated = params.includeDeactivated === true || params.includeDeactivated === 'true';
  var sheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var records = getAllRecords_(sheet).filter(function (r) {
    return includeDeactivated || r['使用状態'] === ITEM_STATUS.ACTIVE;
  });
  return { items: records.map(stripInternal_) };
}

function handleAdminMasterCreate_(params) {
  ITEM_MASTER_REQUIRED_FIELDS_.forEach(function (f) {
    if (params[f] === undefined || params[f] === null || params[f] === '') {
      throw new AppError_('VALIDATION_ERROR', f + 'は必須です。');
    }
  });
  if (LOCATIONS.indexOf(params['場所']) === -1) {
    throw new AppError_('VALIDATION_ERROR', '場所はA/B/Cのいずれかです。');
  }
  if (IMPORTANCE_LEVELS.indexOf(params['重要度']) === -1) {
    throw new AppError_('VALIDATION_ERROR', '重要度はA/B/Cのいずれかです。');
  }

  var itemId = genItemId_();
  var sheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var now = nowIso_();
  var record = { '商品ID': itemId, '使用状態': ITEM_STATUS.ACTIVE, '作成日時': now, '更新日時': now };
  ITEM_MASTER_EDITABLE_FIELDS_.forEach(function (f) {
    if (params[f] !== undefined) record[f] = params[f];
  });
  appendRecord_(sheet, record);
  return { itemId: itemId };
}

function handleAdminMasterUpdate_(params, session) {
  var itemId = params.itemId;
  var changes = params.changes;
  var changedBy = (params.changedBy || session.staffName || '').toString().trim();
  var reason = (params.reason || '').toString().trim();
  if (!itemId || !changes || Object.keys(changes).length === 0) {
    throw new AppError_('VALIDATION_ERROR', 'itemIdとchangesは必須です。');
  }
  if (!changedBy || !reason) {
    throw new AppError_('VALIDATION_ERROR', '変更者と変更理由は必須です。');
  }

  var sheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var item = findRecordByField_(sheet, '商品ID', itemId);
  if (!item) throw new AppError_('NOT_FOUND', '商品が見つかりません。');

  var fieldsToUpdate = {};
  var changeLogSheet = getSheet_(SHEET_NAMES.MASTER_CHANGE);
  var now = nowIso_();

  Object.keys(changes).forEach(function (field) {
    if (ITEM_MASTER_EDITABLE_FIELDS_.indexOf(field) === -1) {
      throw new AppError_('VALIDATION_ERROR', field + 'は編集できません。');
    }
    var change = changes[field];
    fieldsToUpdate[field] = change.after;
    appendRecord_(changeLogSheet, {
      '変更ID': genRecordId_('M'),
      '変更日時': now,
      '商品ID': itemId,
      '変更項目': field,
      '変更前値': change.before !== undefined ? change.before : item[field],
      '変更後値': change.after,
      '変更者': changedBy,
      '変更理由': reason
    });
  });
  fieldsToUpdate['更新日時'] = now;
  updateRecordFields_(sheet, item.__row, fieldsToUpdate);

  return { itemId: itemId, updatedAt: now };
}

function handleAdminMasterDeactivate_(params, session) {
  var itemId = params.itemId;
  var reason = (params.reason || '').toString().trim();
  var changedBy = (params.changedBy || session.staffName || '').toString().trim();
  if (!itemId || !reason) {
    throw new AppError_('VALIDATION_ERROR', 'itemIdとreasonは必須です。');
  }
  var sheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var item = findRecordByField_(sheet, '商品ID', itemId);
  if (!item) throw new AppError_('NOT_FOUND', '商品が見つかりません。');
  if (item['使用状態'] === ITEM_STATUS.DEACTIVATED) {
    throw new AppError_('CONFLICT', 'すでに使用停止済みです。');
  }

  var now = nowIso_();
  updateRecordFields_(sheet, item.__row, { '使用状態': ITEM_STATUS.DEACTIVATED, '更新日時': now });
  appendRecord_(getSheet_(SHEET_NAMES.MASTER_CHANGE), {
    '変更ID': genRecordId_('M'),
    '変更日時': now,
    '商品ID': itemId,
    '変更項目': '使用状態',
    '変更前値': ITEM_STATUS.ACTIVE,
    '変更後値': ITEM_STATUS.DEACTIVATED,
    '変更者': changedBy,
    '変更理由': reason
  });
  return { itemId: itemId, deactivatedAt: now };
}

var HISTORY_TYPE_CONFIG_ = {
  shortageReport: { sheetName: SHEET_NAMES.SHORTAGE_REPORT, dateField: '報告日時', itemField: '商品ID', operatorField: '報告者名', statusField: '処理状態' },
  stockCheck: { sheetName: SHEET_NAMES.STOCK_CHECK, dateField: '確認日時', itemField: '商品ID', operatorField: '確認者', statusField: '判定結果', importanceField: '当時の重要度' },
  orderProcess: { sheetName: SHEET_NAMES.ORDER_PROCESS, dateField: '文面作成日時', operatorField: '担当者', statusField: '状態', supplierField: '仕入先' },
  orderDetail: { sheetName: SHEET_NAMES.ORDER_DETAIL, itemField: '商品ID', importanceField: '当時の重要度', supplierField: '仕入先' },
  masterChange: { sheetName: SHEET_NAMES.MASTER_CHANGE, dateField: '変更日時', itemField: '商品ID', operatorField: '変更者' }
};

function searchHistoryRecords_(params) {
  var config = HISTORY_TYPE_CONFIG_[params.historyType];
  if (!config) {
    throw new AppError_('VALIDATION_ERROR', 'historyTypeが不正です。');
  }
  var sheet = getSheet_(config.sheetName);
  var records = getAllRecords_(sheet);

  if (config.dateField && params.dateFrom) {
    var from = new Date(params.dateFrom);
    records = records.filter(function (r) { return new Date(r[config.dateField]) >= from; });
  }
  if (config.dateField && params.dateTo) {
    var to = new Date(params.dateTo);
    to.setHours(23, 59, 59, 999);
    records = records.filter(function (r) { return new Date(r[config.dateField]) <= to; });
  }
  if (config.itemField && params.itemId) {
    records = records.filter(function (r) { return r[config.itemField] === params.itemId; });
  }
  if (config.importanceField && params.importance) {
    records = records.filter(function (r) { return r[config.importanceField] === params.importance; });
  }
  if (config.supplierField && params.supplier) {
    records = records.filter(function (r) { return r[config.supplierField] === params.supplier; });
  }
  if (config.operatorField && params.operator) {
    records = records.filter(function (r) { return r[config.operatorField] === params.operator; });
  }
  if (config.statusField && params.status) {
    records = records.filter(function (r) { return r[config.statusField] === params.status; });
  }

  if (config.dateField) {
    records.sort(function (a, b) { return new Date(b[config.dateField]) - new Date(a[config.dateField]); });
  }

  return { config: config, sheet: sheet, records: records };
}

function handleAdminHistorySearch_(params) {
  var result = searchHistoryRecords_(params);
  var page = Number(params.page || 1);
  var pageSize = Number(params.pageSize || 100);
  var start = (page - 1) * pageSize;
  var pageRecords = result.records.slice(start, start + pageSize).map(stripInternal_);

  return {
    totalCount: result.records.length,
    page: page,
    pageSize: pageSize,
    records: pageRecords
  };
}

function handleAdminHistoryExportCsv_(params) {
  var result = searchHistoryRecords_(params);
  var headers = getHeaderMap_(result.sheet);
  var headerNames = Object.keys(headers).sort(function (a, b) { return headers[a] - headers[b]; });

  var csvRows = [headerNames.map(csvEscape_).join(',')];
  result.records.forEach(function (r) {
    csvRows.push(headerNames.map(function (h) { return csvEscape_(r[h]); }).join(','));
  });
  var csvString = csvRows.join('\r\n');
  var bom = '﻿'; // Excelでの文字化け防止
  var base64 = Utilities.base64Encode(bom + csvString, Utilities.Charset.UTF_8);
  return { csvBase64: base64, fileName: params.historyType + '_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss') + '.csv' };
}

function csvEscape_(value) {
  var s = value === null || value === undefined ? '' : String(value);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
