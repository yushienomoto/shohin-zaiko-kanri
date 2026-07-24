/**
 * スプレッドシートアクセス共通ユーティリティ
 * シートの1行目をヘッダーとして扱い、オブジェクト配列⇔行の変換を行う。
 */

function getHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    map[headers[i]] = i;
  }
  return map;
}

/**
 * シート全行をヘッダーキーのオブジェクト配列として取得する。
 */
function getAllRecords_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var records = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var record = {};
    for (var c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c];
    }
    record.__row = r + 2; // シート上の実行番号(1-indexed)
    records.push(record);
  }
  return records;
}

/**
 * ヘッダー順に合わせてレコード(オブジェクト)を1行追記する。
 */
function appendRecord_(sheet, record) {
  var headers = getHeaderMap_(sheet);
  var lastCol = sheet.getLastColumn();
  var row = new Array(lastCol).fill('');
  Object.keys(headers).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      row[headers[key]] = record[key];
    }
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/**
 * 複数レコードを1回のAPI呼び出しでまとめて追記する(appendRecord_のN回呼び出しより高速)。
 */
function appendRecords_(sheet, records) {
  if (!records || records.length === 0) return;
  var headers = getHeaderMap_(sheet);
  var lastCol = sheet.getLastColumn();
  var startRow = sheet.getLastRow() + 1;
  var rows = records.map(function (record) {
    var row = new Array(lastCol).fill('');
    Object.keys(headers).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        row[headers[key]] = record[key];
      }
    });
    return row;
  });
  sheet.getRange(startRow, 1, rows.length, lastCol).setValues(rows);
}

/**
 * 指定行(1-indexed)を、渡したフィールドのみ更新する(部分更新)。
 */
function updateRecordFields_(sheet, rowIndex, fields) {
  var headers = getHeaderMap_(sheet);
  Object.keys(fields).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      sheet.getRange(rowIndex, headers[key] + 1).setValue(fields[key]);
    }
  });
}

/**
 * 指定列の値で最初に一致した行(オブジェクト)を返す。見つからなければnull。
 */
function findRecordByField_(sheet, fieldName, value) {
  var records = getAllRecords_(sheet);
  for (var i = 0; i < records.length; i++) {
    if (records[i][fieldName] === value) return records[i];
  }
  return null;
}

/**
 * LockServiceでロックしつつ採番する。例: genRecordId_('R') -> 'R20260718143012-482'
 */
function genRecordId_(prefix) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmssSSS');
    var rand = Math.floor(Math.random() * 900 + 100);
    return prefix + ts + '-' + rand;
  } finally {
    lock.releaseLock();
  }
}

function genItemId_() {
  var sheet = getSheet_(SHEET_NAMES.ITEM_MASTER);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var records = getAllRecords_(sheet);
    var max = 0;
    records.forEach(function (r) {
      var m = /^P(\d+)$/.exec(r['商品ID']);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var next = max + 1;
    return 'P' + ('000' + next).slice(-3);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ロックを取らずに一括採番する(1回のリクエスト内でメモリ上に全行を組み立ててから
 * まとめて書き込むバッチ処理向け。タイムスタンプ+連番+乱数のため衝突の可能性は無視できる)。
 */
function genRecordIdsForBatch_(prefix, count) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmssSSS');
  var ids = [];
  for (var i = 0; i < count; i++) {
    var rand = Math.floor(Math.random() * 900 + 100);
    ids.push(prefix + ts + '-' + i + '-' + rand);
  }
  return ids;
}

function genBatchId_(supplier) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  return ts + '-' + supplier;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}
