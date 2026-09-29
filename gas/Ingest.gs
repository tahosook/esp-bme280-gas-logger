function parseSensorRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    return { success: false, error: 'invalid_json' };
  }
  try {
    const payload = JSON.parse(e.postData.contents);
    return { success: true, payload };
  } catch (error) {
    return { success: false, error: 'invalid_json' };
  }
}

function getApiToken_(properties) {
  const apiTokenKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.apiToken) || 'API_TOKEN';
  return typeof properties.getProperty === 'function'
    ? properties.getProperty(apiTokenKey)
    : properties[apiTokenKey];
}

function authenticateSensorToken_(payload, properties) {
  if (!payload || typeof payload.token !== 'string' || !properties) {
    return false;
  }
  const apiToken = getApiToken_(properties);
  return typeof apiToken === 'string' && payload.token === apiToken;
}

function handleSensorPostInternalError_(error) {
  if (typeof logError_ === 'function') {
    logError_('ingest', 'sensor_post', 'internal_error', error);
  } else {
    console.error('internal_error');
  }
  return errorResponse_('internal_error');
}

function processSensorPayload_(payload) {
  const properties = PropertiesService.getScriptProperties();
  if (!authenticateSensorToken_(payload, properties)) {
    return errorResponse_('invalid_token');
  }
  checkAndAppendMeasurement_(payload, properties);
  return successResponse_();
}

function handleSensorPost_(e) {
  const parsed = parseSensorRequest_(e);
  if (!parsed.success) {
    return errorResponse_(parsed.error);
  }

  const payload = parsed.payload;
  const validationError = validateSensorPayload_(payload);
  if (validationError) {
    return errorResponse_(validationError);
  }

  try {
    return processSensorPayload_(payload);
  } catch (error) {
    return handleSensorPostInternalError_(error);
  }
}

function validateMeasurementLimits_(payload) {
  const measurementNames = ['temp', 'press', 'hum'];
  for (let i = 0; i < measurementNames.length; i += 1) {
    const name = measurementNames[i];
    const value = payload[name];
    const limit = LIMITS[name];
    if (typeof value !== 'number' || !isFinite(value) ||
        value < limit.min || value > limit.max) {
      return false;
    }
  }
  return true;
}

function isValidApiVersion_(version) {
  return typeof version === 'number' && isFinite(version) && version === 1;
}

function isValidTokenFormat_(token) {
  return typeof token === 'string' && token.length > 0;
}

function isBasicPayloadObjectValid_(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload);
}

function validateSensorPayload_(payload) {
  if (!isBasicPayloadObjectValid_(payload)) {
    return 'invalid_payload';
  }

  if (!isValidApiVersion_(payload.api_version)) {
    return 'invalid_api_version';
  }

  if (!isValidTokenFormat_(payload.token)) {
    return 'invalid_token';
  }

  if (!validateMeasurementLimits_(payload)) {
    return 'invalid_payload';
  }

  return null;
}

function isValidTimestampObject_(timestamp) {
  return Object.prototype.toString.call(timestamp) === '[object Date]' && !isNaN(timestamp.getTime());
}

function isRecentDuplicateMeasurement_(elapsedSec, dupWindowSec, lastValues, payload) {
  const lastTemp = lastValues[1];
  const lastPress = lastValues[2];
  const lastHum = lastValues[3];
  return elapsedSec >= 0 &&
      elapsedSec <= dupWindowSec &&
      lastTemp === payload.temp &&
      lastPress === payload.press &&
      lastHum === payload.hum;
}

function isDuplicateMeasurement_(sheet, payload, dupWindowSec, now) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return false;
  }

  const lastValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
  const lastTimestamp = lastValues[0];

  if (!isValidTimestampObject_(lastTimestamp)) {
    return false;
  }

  const elapsedSec = (now.getTime() - lastTimestamp.getTime()) / 1000;
  return isRecentDuplicateMeasurement_(elapsedSec, dupWindowSec, lastValues, payload);
}

function handleMonitorNotification_(notification) {
  if (!notification || typeof pushMonitorNotification_ !== 'function') {
    return;
  }
  try {
    pushMonitorNotification_(notification.text);
  } catch (err) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'line_push', 'push_failed', err);
    }
  }
}

function processMonitorResult_(sheet, lastAppendedRow, monitorResult) {
  if (!monitorResult) {
    return;
  }

  if (monitorResult.anomaly) {
    sheet.getRange(lastAppendedRow, 5).setValue('anomaly');
  } else if (monitorResult.notification) {
    sheet.getRange(lastAppendedRow, 5).setValue('alert');
  }

  handleMonitorNotification_(monitorResult.notification);
}

function applyMonitorStateSafely_(sheet, lastAppendedRow, payload) {
  if (typeof updateMonitorState_ !== 'function') {
    return;
  }
  try {
    const monitorResult = updateMonitorState_(payload);
    processMonitorResult_(sheet, lastAppendedRow, monitorResult);
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'monitor', 'monitor_update_failed', error);
    } else {
      console.error('monitor_update_failed');
    }
  }
}

function getIngestSheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    throw new Error('missing spreadsheet configuration');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getRawDataSheet_(spreadsheet, properties);
  if (!sheet) {
    throw new Error('sheet not found');
  }
  return sheet;
}

function appendAndFormatMeasurement_(sheet, payload, now) {
  sheet.appendRow([now, payload.temp, payload.press, payload.hum, '']);
  const lastAppendedRow = sheet.getLastRow();
  try {
    sheet.getRange(lastAppendedRow, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');
  } catch (formatError) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'sheet_format', 'typed_column_format_skipped', formatError);
    }
  }
  return lastAppendedRow;
}

function safeResetWatchdogState_() {
  if (typeof resetWatchdogState_ === 'function') {
    try {
      resetWatchdogState_();
    } catch (error) {
      if (typeof logError_ === 'function') {
        logError_('ingest', 'watchdog', 'watchdog_reset_failed', error);
      }
    }
  }
}

function checkAndAppendMeasurement_(payload, properties) {
  const sheet = getIngestSheet_(properties);
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG : {});
  const lockTimeoutMs = config.INGEST_LOCK_TIMEOUT_MS || 15000;
  const dupWindowSec = typeof config.SENSOR_DUPLICATION_WINDOW_SECONDS === 'number' ? config.SENSOR_DUPLICATION_WINDOW_SECONDS : 180;

  const lock = LockService.getScriptLock();
  lock.waitLock(lockTimeoutMs);

  try {
    const now = new Date();
    if (isDuplicateMeasurement_(sheet, payload, dupWindowSec, now)) {
      return false;
    }

    const lastAppendedRow = appendAndFormatMeasurement_(sheet, payload, now);
    safeResetWatchdogState_();
    applyMonitorStateSafely_(sheet, lastAppendedRow, payload);

    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseSensorRequest_,
    authenticateSensorToken_,
    handleSensorPost_,
    validateMeasurementLimits_,
    validateSensorPayload_,
    isDuplicateMeasurement_,
    getIngestSheet_,
    applyMonitorStateSafely_,
    checkAndAppendMeasurement_
  };
}
