/**
 * エントリーポイント。doGet/doPostでactionを振り分ける。
 */

var ROUTES_ = {
  'auth.login': { auth: 'none', handler: function (params) { return login_(params.role, params.pin, params.staffName); } },
  'auth.verify': { auth: 'any', handler: function (params, session) { return { valid: true, role: session.role }; } },

  'items.listByLocation': { auth: 'none', handler: function (params) { return handleItemsListByLocation_(params); } },
  'shortageReport.submit': { auth: 'none', handler: function (params) { return handleShortageReportSubmit_(params); } },
  'shortageReport.upgrade': { auth: 'none', handler: function (params) { return handleShortageReportUpgrade_(params); } },

  'checklist.getWeekly': { auth: 'staff', handler: function () { return handleChecklistGetWeekly_(); } },
  'checklist.getAll': { auth: 'staff', handler: function () { return handleChecklistGetAll_(); } },
  'stockCheck.submit': { auth: 'staff', handler: function (params) { return handleStockCheckSubmit_(params); } },
  'stockCheck.update': { auth: 'staff', handler: function (params) { return handleStockCheckUpdate_(params); } },
  'orderCandidates.list': { auth: 'staff', handler: function () { return handleOrderCandidatesList_(); } },
  'staffHome.getSummary': { auth: 'staff', handler: function () { return handleStaffHomeGetSummary_(); } },

  'orderText.generate': { auth: 'staff', handler: function (params, session) { return handleOrderTextGenerate_(params, session); } },
  'orderText.markCopied': { auth: 'staff', handler: function (params) { return handleOrderTextMarkCopied_(params); } },
  'orderProcess.completeEmail': { auth: 'staff', handler: function (params, session) { return handleOrderProcessCompleteEmail_(params, session); } },
  'orderProcess.completeWhiteboard': { auth: 'staff', handler: function (params, session) { return handleOrderProcessCompleteWhiteboard_(params, session); } },
  'orderDetail.recordActual': { auth: 'staff', handler: function (params) { return handleOrderDetailRecordActual_(params); } },

  'admin.masterList': { auth: 'admin', handler: function (params) { return handleAdminMasterList_(params); } },
  'admin.masterCreate': { auth: 'admin', handler: function (params) { return handleAdminMasterCreate_(params); } },
  'admin.masterUpdate': { auth: 'admin', handler: function (params, session) { return handleAdminMasterUpdate_(params, session); } },
  'admin.masterDeactivate': { auth: 'admin', handler: function (params, session) { return handleAdminMasterDeactivate_(params, session); } },
  'admin.historySearch': { auth: 'admin', handler: function (params) { return handleAdminHistorySearch_(params); } },
  'admin.historyExportCsv': { auth: 'admin', handler: function (params) { return handleAdminHistoryExportCsv_(params); } }
};

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return dispatch_(params.action, params.token, params);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return errorResponse_('VALIDATION_ERROR', 'リクエストボディがJSONとして不正です。');
  }
  return dispatch_(body.action, body.token, body.params || {});
}

function dispatch_(action, token, params) {
  try {
    var route = ROUTES_[action];
    if (!route) {
      throw new AppError_('NOT_FOUND', '不明なactionです: ' + action);
    }

    var session = null;
    if (route.auth === 'staff' || route.auth === 'admin') {
      session = verifySession_(token);
      requireRole_(session, route.auth);
    } else if (route.auth === 'any') {
      session = verifySession_(token);
    }

    var data = route.handler(params, session);
    return successResponse_(data);
  } catch (err) {
    if (err && err.name === 'AppError') {
      return errorResponse_(err.code, err.message, err.details);
    }
    Logger.log('INTERNAL_ERROR: ' + (err && err.stack ? err.stack : err));
    return errorResponse_('INTERNAL_ERROR', '予期しないエラーが発生しました。');
  }
}
