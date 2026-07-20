/**
 * レスポンス生成・エラー型の共通ユーティリティ
 */

/**
 * ハンドラ内でthrowすると、Main側のcatchでエラーレスポンスへ変換される。
 * @param {string} code
 * @param {string} message
 * @param {Object=} details
 */
function AppError_(code, message, details) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.details = details || null;
}
AppError_.prototype = Object.create(Error.prototype);
AppError_.prototype.constructor = AppError_;

function successResponse_(data) {
  return jsonOutput_({ success: true, data: data });
}

function errorResponse_(code, message, details) {
  return jsonOutput_({
    success: false,
    error: { code: code, message: message, details: details || undefined }
  });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
