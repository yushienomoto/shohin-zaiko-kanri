/**
 * GAS Web App 呼び出し共通関数
 * GAS_API_URL は clasp deploy 後の Web アプリ URL に置き換えること。
 */
var GAS_API_URL = 'https://script.google.com/macros/s/AKfycby74a32MLlOUE9G0hf3VOI1VoCYAOIANpdoOWxI7YxYA2fRaBHGKZaMHIfRiYJ2QCmS/exec';

/**
 * @param {string} action
 * @param {Object} params
 * @param {boolean} requireAuth トークンを付与するか
 * @returns {Promise<Object>} data部分（成功時）
 */
async function callApi(action, params, requireAuth) {
  var body = { action: action, params: params || {} };
  if (requireAuth) {
    var session = getSession();
    if (!session) {
      redirectToLogin_();
      throw new Error('未ログインです。');
    }
    body.token = session.token;
  }

  var res = await fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  var json = await res.json();

  if (!json.success) {
    if (json.error && json.error.code === 'SESSION_EXPIRED') {
      clearSession();
      redirectToLogin_();
    }
    var err = new Error(json.error ? json.error.message : '不明なエラーが発生しました。');
    err.code = json.error ? json.error.code : 'UNKNOWN';
    err.details = json.error ? json.error.details : null;
    throw err;
  }

  if (requireAuth) touchSessionAccess_();
  return json.data;
}

function redirectToLogin_() {
  var role = sessionStorage.getItem('pendingRole');
  window.location.href = 'index.html';
}
