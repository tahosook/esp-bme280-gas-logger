const CONFIG_KEYS = {
  spreadsheetId: 'SPREADSHEET_ID',
  apiToken: 'API_TOKEN',
  sheetName: 'SHEET_NAME'
};

const LIMITS = {
  temp: { min: -40.0, max: 85.0 },
  press: { min: 300.0, max: 1100.0 },
  hum: { min: 0.0, max: 100.0 }
};

function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    return errorResponse_('invalid_json');
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  if (isLineWebhookRequest_(e, payload)) {
    return handleLineWebhook_(e);
  }

  return handleSensorPost_(e);
}

function isLineWebhookRequest_(e, payload) {
  const hasLineHeader = hasLineSignatureHeader_(e);
  const isLinePayload = payload && (Array.isArray(payload.events) || typeof payload.destination === 'string');
  return hasLineHeader || isLinePayload;
}

function hasLineSignatureHeader_(e) {
  if (!e) return false;
  if (e.headers && (e.headers['X-Line-Signature'] || e.headers['x-line-signature'])) return true;
  if (e.parameter && (e.parameter['X-Line-Signature'] || e.parameter['x-line-signature'])) return true;
  return false;
}

function doGet() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
    const apiToken = properties.getProperty(CONFIG_KEYS.apiToken);
    const sheetName = properties.getProperty(CONFIG_KEYS.sheetName) || 'RawData';

    if (!spreadsheetId || !apiToken) {
      return readinessResponse_(false);
    }

    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    return readinessResponse_(!!sheet);
  } catch (error) {
    console.error('not_ready');
    return readinessResponse_(false);
  }
}

function successResponse_() {
  return jsonResponse_({ ok: true });
}

function errorResponse_(errorCode) {
  return jsonResponse_({ ok: false, error: errorCode });
}

function readinessResponse_(ready) {
  if (ready) {
    return jsonResponse_({ ok: true, ready: true });
  }
  return jsonResponse_({ ok: false, ready: false, error: 'not_ready' });
}

function jsonResponse_(body) {
  return ContentService
      .createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') {
  module.exports = {
    hasLineSignatureHeader_,
    isLineWebhookRequest_,
    CONFIG_KEYS,
    LIMITS,
    doPost,
    doGet,
    successResponse_,
    errorResponse_,
    readinessResponse_,
    jsonResponse_
  };
}
