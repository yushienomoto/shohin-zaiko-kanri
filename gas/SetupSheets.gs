/**
 * 初期セットアップ用スクリプト。
 * スクリプトエディタから setupAllSheets を一度だけ手動実行し、全シートとヘッダー行を作成する。
 * 既に存在するシートはヘッダーのみ検証し、データは変更しない。
 * 手動実行する関数はGASエディタの実行プルダウンに表示させるため、末尾に "_" を付けていない。
 */

var SHEET_HEADERS_ = {};
SHEET_HEADERS_[SHEET_NAMES.ITEM_MASTER] = [
  '商品ID', '場所', '分類', '品名', '正式名称', '発注先', 'URL',
  '重要度', '発注点', '標準発注数', '単位', '値段', '備考', '使用状態',
  '作成日時', '更新日時'
];
SHEET_HEADERS_[SHEET_NAMES.SHORTAGE_REPORT] = [
  '報告ID', '報告日時', '商品ID', '状態', '報告者名', '処理状態', '元報告ID', '更新日時'
];
SHEET_HEADERS_[SHEET_NAMES.STOCK_CHECK] = [
  '確認ID', '確認日時', '商品ID', '現在数量', '当時の発注点', '当時の重要度',
  '当時の標準発注数', '当時の単位', '由来理由', '判定結果', '確認者',
  '修正前数量', '修正後数量', '修正日時', '修正者'
];
SHEET_HEADERS_[SHEET_NAMES.ORDER_PROCESS] = [
  '発注バッチID', '仕入先', '種別', '文面作成日時', '文面作成者', 'コピー日時',
  'メール送信済みチェック日時', 'ホワイトボード記入済みチェック日時',
  '発注依頼済み日時', '状態', '担当者', '本文'
];
SHEET_HEADERS_[SHEET_NAMES.ORDER_DETAIL] = [
  '明細ID', '発注バッチID', '商品ID', '確認数量', '当時の発注点', '標準発注数',
  '実発注数', '変更理由', '当時の重要度', '仕入先'
];
SHEET_HEADERS_[SHEET_NAMES.MASTER_CHANGE] = [
  '変更ID', '変更日時', '商品ID', '変更項目', '変更前値', '変更後値', '変更者', '変更理由'
];
SHEET_HEADERS_[SHEET_NAMES.SETTINGS] = [
  '区分', 'PINハッシュ', '更新日時'
];

function setupAllSheets() {
  var ss = getSpreadsheet_();
  Object.keys(SHEET_HEADERS_).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    var headers = SHEET_HEADERS_[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });

  // GASのデフォルトシート「シート1」が残っていれば削除する
  var defaultSheet = ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('シート作成が完了しました。続けて setupStaffPin / setupAdminPin を実行してください（PINの数字は関数内を書き換えてから実行）。');
}

/**
 * セッションクリーンアップの時間主導トリガーを1時間おきに登録する。
 * 重複登録を避けるため、既存の同名トリガーは一度削除してから登録し直す。
 */
function installCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupExpiredSessions') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('cleanupExpiredSessions')
    .timeBased()
    .everyHours(1)
    .create();
}

/**
 * PIN初期設定用の手動実行関数。
 * setPin_ は引数が必要でプルダウン実行できないため、この2つを経由して呼び出す。
 * 実行前に下の '1234' / '9999' を実際に使うPINへ書き換えてから実行すること。
 */
function setupStaffPin() {
  setPin_(ROLES.STAFF, '1234');
  Logger.log('担当者PINを設定しました。');
}

function setupAdminPin() {
  setPin_(ROLES.ADMIN, '9999');
  Logger.log('管理者PINを設定しました。');
}
