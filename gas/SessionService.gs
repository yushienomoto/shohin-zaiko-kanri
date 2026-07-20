/**
 * セッション管理
 * 正式な保存先: PropertiesService.getScriptProperties()
 * 高速参照用: CacheService.getScriptCache()（Cache欠落時はScriptPropertiesへフォールバックし、Cacheへ再セット）
 * PINそのものは保存せず、ランダムなセッショントークンをキーにする。
 */

function sessionKey_(token) {
  return SESSION_CONFIG.SESSION_KEY_PREFIX + token;
}

function saveSession_(token, session) {
  var key = sessionKey_(token);
  var json = JSON.stringify(session);
  CacheService.getScriptCache().put(key, json, SESSION_CONFIG.CACHE_TTL_SECONDS);
  PropertiesService.getScriptProperties().setProperty(key, json);
}

function loadSession_(token) {
  var key = sessionKey_(token);
  var cache = CacheService.getScriptCache();
  var json = cache.get(key);
  if (json) {
    return JSON.parse(json);
  }
  // Cacheに存在しない場合はScriptPropertiesへフォールバック
  json = PropertiesService.getScriptProperties().getProperty(key);
  if (!json) return null;
  var session = JSON.parse(json);
  // Cacheへ再セット(次回以降の高速参照のため)
  cache.put(key, json, SESSION_CONFIG.CACHE_TTL_SECONDS);
  return session;
}

function deleteSession_(token) {
  var key = sessionKey_(token);
  CacheService.getScriptCache().remove(key);
  PropertiesService.getScriptProperties().deleteProperty(key);
}

/**
 * PINログイン。設定シートに保存されたSHA-256ハッシュと照合する。
 * @param {string} role 'staff' | 'admin'
 * @param {string} pin
 * @param {string=} staffName
 */
function login_(role, pin, staffName) {
  if (ROLES.STAFF !== role && ROLES.ADMIN !== role) {
    throw new AppError_('VALIDATION_ERROR', 'roleが不正です。');
  }
  if (!pin) {
    throw new AppError_('VALIDATION_ERROR', 'PINを入力してください。');
  }
  var settingsSheet = getSheet_(SHEET_NAMES.SETTINGS);
  var records = getAllRecords_(settingsSheet);
  var target = records.filter(function (r) { return r['区分'] === (role === ROLES.STAFF ? '担当者' : '管理者'); })[0];
  if (!target) {
    throw new AppError_('INTERNAL_ERROR', 'PIN設定が見つかりません。');
  }
  var hash = hashPin_(pin);
  if (hash !== target['PINハッシュ']) {
    throw new AppError_('FORBIDDEN', 'PINが正しくありません。');
  }

  var token = Utilities.getUuid() + Utilities.getUuid();
  var now = Date.now();
  var session = {
    token: token,
    role: role,
    staffName: staffName || '',
    issuedAt: now,
    lastAccessAt: now
  };
  saveSession_(token, session);
  return session;
}

function hashPin_(pin) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin, Utilities.Charset.UTF_8);
  return digest.map(function (byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * 手動セットアップ用: スクリプトエディタから直接実行してPINを登録する。
 * 例: setPin_('staff', '1234'); setPin_('admin', '9999');
 */
function setPin_(role, pin) {
  var roleLabel = role === ROLES.STAFF ? '担当者' : '管理者';
  var settingsSheet = getSheet_(SHEET_NAMES.SETTINGS);
  var records = getAllRecords_(settingsSheet);
  var existing = records.filter(function (r) { return r['区分'] === roleLabel; })[0];
  var hash = hashPin_(pin);
  if (existing) {
    updateRecordFields_(settingsSheet, existing.__row, { 'PINハッシュ': hash, '更新日時': nowIso_() });
  } else {
    appendRecord_(settingsSheet, { '区分': roleLabel, 'PINハッシュ': hash, '更新日時': nowIso_() });
  }
}

/**
 * トークンを検証し、有効なら最終アクセス日時を更新して返す。
 * 無効・期限切れの場合はAppError_をthrowし、該当セッションを削除する。
 */
function verifySession_(token) {
  if (!token) {
    throw new AppError_('UNAUTHENTICATED', '認証情報がありません。');
  }
  var session = loadSession_(token);
  if (!session) {
    throw new AppError_('UNAUTHENTICATED', '認証情報が無効です。');
  }
  var now = Date.now();
  var idleMs = SESSION_CONFIG.IDLE_TIMEOUT_MINUTES * 60 * 1000;
  var absMs = SESSION_CONFIG.ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;
  if (now - session.lastAccessAt > idleMs || now - session.issuedAt > absMs) {
    deleteSession_(token);
    throw new AppError_('SESSION_EXPIRED', 'セッションの有効期限が切れました。再度ログインしてください。');
  }
  session.lastAccessAt = now;
  saveSession_(token, session);
  return session;
}

function requireRole_(session, role) {
  if (session.role !== role) {
    throw new AppError_('FORBIDDEN', 'この操作を行う権限がありません。');
  }
}

function logout_(token) {
  deleteSession_(token);
}

/**
 * 期限切れセッションの定期クリーンアップ。
 * 時間主導トリガー(例: 1時間ごと)で実行する。ScriptPropertiesの肥大化防止も兼ねる。
 * トリガー登録は SetupSheets.gs の installCleanupTrigger を実行する。
 * 手動実行にも対応させるため、末尾に "_" を付けていない。
 */
function cleanupExpiredSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  var absMs = SESSION_CONFIG.ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;
  var idleMs = SESSION_CONFIG.IDLE_TIMEOUT_MINUTES * 60 * 1000;
  var cache = CacheService.getScriptCache();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(SESSION_CONFIG.SESSION_KEY_PREFIX) !== 0) return;
    try {
      var session = JSON.parse(all[key]);
      if (now - session.issuedAt > absMs || now - session.lastAccessAt > idleMs) {
        props.deleteProperty(key);
        cache.remove(key);
      }
    } catch (e) {
      // 壊れたエントリは削除する
      props.deleteProperty(key);
      cache.remove(key);
    }
  });
}
