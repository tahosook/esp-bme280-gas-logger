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
  const { headers = {}, parameter = {} } = e || {};
  const hasLineHeader = Boolean(
    headers['X-Line-Signature'] ||
    headers['x-line-signature'] ||
    parameter['X-Line-Signature'] ||
    parameter['x-line-signature']
  );

  const { events, destination } = payload || {};
  const isLinePayload = Boolean(Array.isArray(events) || typeof destination === 'string');

  return hasLineHeader || isLinePayload;
}

function doGet() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
    const apiTokenKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.apiToken) || 'API_TOKEN';
    const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';

    const spreadsheetId = properties.getProperty(spreadsheetIdKey);
    const apiToken = properties.getProperty(apiTokenKey);
    const sheetName = properties.getProperty(sheetNameKey) || 'RawData';

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isLineWebhookRequest_,
    LIMITS,
    doPost,
    doGet,
    successResponse_,
    errorResponse_,
    readinessResponse_,
    jsonResponse_
  };
}
