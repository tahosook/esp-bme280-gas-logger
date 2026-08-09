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
  let payload;

  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      return errorResponse_('invalid_json');
    }
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  const validationError = validatePayload_(payload);
  if (validationError) {
    return errorResponse_(validationError);
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const apiToken = properties.getProperty(CONFIG_KEYS.apiToken);
    if (typeof apiToken !== 'string' || payload.token !== apiToken) {
      return errorResponse_('invalid_token');
    }

    appendMeasurement_(payload, properties);
    return successResponse_();
  } catch (error) {
    console.error('internal_error');
    return errorResponse_('internal_error');
  }
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'invalid_payload';
  }

  if (typeof payload.api_version !== 'number' ||
      !isFinite(payload.api_version) || payload.api_version !== 1) {
    return 'invalid_api_version';
  }

  if (typeof payload.token !== 'string' || payload.token.length === 0) {
    return 'invalid_token';
  }

  const measurementNames = ['temp', 'press', 'hum'];
  for (let i = 0; i < measurementNames.length; i += 1) {
    const name = measurementNames[i];
    const value = payload[name];
    const limit = LIMITS[name];
    if (typeof value !== 'number' || !isFinite(value) ||
        value < limit.min || value > limit.max) {
      return 'invalid_payload';
    }
  }

  return null;
}

function appendMeasurement_(payload, properties) {
  const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('missing spreadsheet configuration');
  }

  const sheetName = properties.getProperty(CONFIG_KEYS.sheetName) || 'Sheet1';
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('sheet not found');
  }

  const timestamp = Utilities.formatDate(
      new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
  sheet.appendRow([timestamp, payload.temp, payload.press, payload.hum]);
}

function successResponse_() {
  return jsonResponse_({ ok: true });
}

function errorResponse_(errorCode) {
  return jsonResponse_({ ok: false, error: errorCode });
}

function jsonResponse_(body) {
  return ContentService
      .createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
}
