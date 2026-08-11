const SENSOR_DUPLICATION_WINDOW_SECONDS = 180;

function handleSensorPost_(e) {
  let payload;

  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      return errorResponse_('invalid_json');
    }
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  const validationError = validateSensorPayload_(payload);
  if (validationError) {
    return errorResponse_(validationError);
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const apiToken = properties.getProperty(CONFIG_KEYS.apiToken);
    if (typeof apiToken !== 'string' || payload.token !== apiToken) {
      return errorResponse_('invalid_token');
    }

    checkAndAppendMeasurement_(payload, properties);
    return successResponse_();
  } catch (error) {
    console.error('internal_error');
    return errorResponse_('internal_error');
  }
}

function validateSensorPayload_(payload) {
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

function checkAndAppendMeasurement_(payload, properties) {
  const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('missing spreadsheet configuration');
  }

  const sheetName = properties.getProperty(CONFIG_KEYS.sheetName) || 'DATA';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('sheet not found');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const lastRow = sheet.getLastRow();
    const now = new Date();

    if (lastRow >= 1) {
      const lastValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
      const lastTimestamp = lastValues[0];
      const lastTemp = lastValues[1];
      const lastPress = lastValues[2];
      const lastHum = lastValues[3];

      const elapsedSec = (now.getTime() - lastTimestamp.getTime()) / 1000;

      const roundedTemp = Math.round(payload.temp * 100) / 100;
      const roundedPress = Math.round(payload.press * 100) / 100;
      const roundedHum = Math.round(payload.hum * 100) / 100;

      const isDuplicate = elapsedSec >= 0 &&
          elapsedSec <= SENSOR_DUPLICATION_WINDOW_SECONDS &&
          Math.abs(lastTemp - roundedTemp) < 1e-9 &&
          Math.abs(lastPress - roundedPress) < 1e-9 &&
          Math.abs(lastHum - roundedHum) < 1e-9;

      if (isDuplicate) {
        return;
      }
    }

    sheet.appendRow([now, payload.temp, payload.press, payload.hum, '']);
    const lastAppendedRow = sheet.getLastRow();
    sheet.getRange(lastAppendedRow, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');
  } finally {
    lock.releaseLock();
  }
}
