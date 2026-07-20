/**
 * セッション管理（クライアント側）
 * sessionStorageへ保存。アイドル60分/絶対8時間はサーバー側で必ず判定するが、
 * UX向上のためクライアント側でも簡易チェックし、期限切れなら再ログイン画面へ誘導する。
 */
var SESSION_STORAGE_KEY = 'inventory_session';
var IDLE_TIMEOUT_MS = 60 * 60 * 1000;
var ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

function saveSession(session) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function getSession() {
  var raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  var session;
  try {
    session = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  var now = Date.now();
  if (now - session.lastAccessAt > IDLE_TIMEOUT_MS || now - session.issuedAt > ABSOLUTE_TIMEOUT_MS) {
    clearSession();
    return null;
  }
  return session;
}

function touchSessionAccess_() {
  var raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return;
  var session = JSON.parse(raw);
  session.lastAccessAt = Date.now();
  saveSession(session);
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * PINログイン。成功したらsessionStorageへ保存する。
 */
async function login(role, pin, staffName) {
  var data = await callApi('auth.login', { role: role, pin: pin, staffName: staffName }, false);
  saveSession({
    token: data.token,
    role: data.role,
    staffName: staffName || '',
    issuedAt: Date.now(),
    lastAccessAt: Date.now()
  });
  return data;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

/**
 * ページ読み込み時に呼び出し、権限がなければホームへ戻す。
 */
function requireRole(role) {
  var session = getSession();
  if (!session || session.role !== role) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}
