/**
 * 消耗品在庫確認・発注支援システム - 共通設定
 */

var SHEET_NAMES = {
  ITEM_MASTER: '商品マスター',
  SHORTAGE_REPORT: '不足報告履歴',
  STOCK_CHECK: '在庫確認履歴',
  ORDER_PROCESS: '発注処理履歴',
  ORDER_DETAIL: '発注明細履歴',
  MASTER_CHANGE: 'マスター変更履歴',
  SETTINGS: '設定'
};

var SESSION_CONFIG = {
  IDLE_TIMEOUT_MINUTES: 60,
  ABSOLUTE_TIMEOUT_HOURS: 8,
  CACHE_TTL_SECONDS: 21600, // CacheServiceの上限(6時間)。絶対期限8hに満たない分はScriptPropertiesへフォールバック
  TOKEN_BYTE_LENGTH: 32,
  SESSION_KEY_PREFIX: 'session_'
};

var LOCATIONS = ['A', 'B', 'C'];

var LOCATION_A_CATEGORIES = ['テープ・固定用品', '梱包・施工用品', '清掃・共用品'];

var IMPORTANCE_LEVELS = ['A', 'B', 'C'];

var ITEM_STATUS = {
  ACTIVE: '使用中',
  DEACTIVATED: '廃止'
};

var SHORTAGE_STATE = {
  LOW: '少ない',
  OUT: '在庫なし'
};

var SHORTAGE_PROCESS_STATE = {
  UNPROCESSED: '未処理',
  PROCESSED: '確認済'
};

var CHECK_REASON = {
  SHORTAGE_REPORT: '不足報告',
  IMPORTANCE_A_WEEKLY: '重要度A週次',
  IMPORTANCE_B_MONTHLY: '重要度B月次'
};

var CHECK_JUDGEMENT = {
  CANDIDATE: '発注候補',
  NOT_CANDIDATE: '対象外'
};

var BATCH_TYPE = {
  EMAIL: 'email',
  WHITEBOARD: 'whiteboard'
};

var BATCH_STATUS = {
  TEXT_CREATED: '文面作成済み',
  ORDER_REQUESTED: '発注依頼済み',
  WHITEBOARD_FILLED: '記入済み'
};

var HOMECENTER_SUPPLIER_NAME = 'ホームセンター';

var ROLES = {
  STAFF: 'staff',
  ADMIN: 'admin'
};

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError_('INTERNAL_ERROR', 'シートが見つかりません: ' + sheetName);
  }
  return sheet;
}
