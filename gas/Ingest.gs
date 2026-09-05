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

  if (!validateMeasurementLimits_(payload)) {
    return 'invalid_payload';
  }

  return null;
}

function isDuplicateMeasurement_(sheet, payload, dupWindowSec, now) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return false;
  }

  const lastValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
  const lastTimestamp = lastValues[0];
  const lastTemp = lastValues[1];
  const lastPress = lastValues[2];
  const lastHum = lastValues[3];

  const hasValidTimestamp = Object.prototype.toString.call(lastTimestamp) === '[object Date]' &&
      !isNaN(lastTimestamp.getTime());

  if (!hasValidTimestamp) {
    return false;
  }

  const elapsedSec = (now.getTime() - lastTimestamp.getTime()) / 1000;
  return elapsedSec >= 0 &&
      elapsedSec <= dupWindowSec &&
      lastTemp === payload.temp &&
      lastPress === payload.press &&
      lastHum === payload.hum;
}

function getIngestSheet_(properties) {
  const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
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

function getIngestConfig_() {
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG : {});
  const lockTimeoutMs = config.INGEST_LOCK_TIMEOUT_MS || 15000;
  const dupWindowSec = typeof config.SENSOR_DUPLICATION_WINDOW_SECONDS === 'number' ? config.SENSOR_DUPLICATION_WINDOW_SECONDS : 180;
  return { lockTimeoutMs, dupWindowSec };
}

function resetWatchdogSafely_() {
  if (typeof resetWatchdogState_ !== 'function') {
    return;
  }
  try {
    resetWatchdogState_();
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'watchdog', 'watchdog_reset_failed', error);
    }
  }
}

function pushMonitorNotificationSafely_(notification) {
  if (typeof pushMonitorNotification_ !== 'function') {
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

function applyMonitorStateSafely_(sheet, lastAppendedRow, payload) {
  if (typeof updateMonitorState_ !== 'function') {
    return;
  }
  try {
    const monitorResult = updateMonitorState_(payload);
    if (monitorResult && monitorResult.anomaly) {
      sheet.getRange(lastAppendedRow, 5).setValue('anomaly');
    }
    if (monitorResult && monitorResult.notification) {
      pushMonitorNotificationSafely_(monitorResult.notification);
    }
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'monitor', 'monitor_update_failed', error);
    } else {
      console.error('monitor_update_failed');
    }
  }
}

function checkAndAppendMeasurement_(payload, properties) {
  const sheet = getIngestSheet_(properties);
  const { lockTimeoutMs, dupWindowSec } = getIngestConfig_();

  const lock = LockService.getScriptLock();
  lock.waitLock(lockTimeoutMs);

  try {
    const now = new Date();
    if (isDuplicateMeasurement_(sheet, payload, dupWindowSec, now)) {
      return false;
    }

    sheet.appendRow([now, payload.temp, payload.press, payload.hum, '']);
    const lastAppendedRow = sheet.getLastRow();
    sheet.getRange(lastAppendedRow, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');

    resetWatchdogSafely_();
    applyMonitorStateSafely_(sheet, lastAppendedRow, payload);

    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    handleSensorPost_,
    validateMeasurementLimits_,
    validateSensorPayload_,
    isDuplicateMeasurement_,
    getIngestSheet_,
    getIngestConfig_,
    resetWatchdogSafely_,
    pushMonitorNotificationSafely_,
    applyMonitorStateSafely_,
    checkAndAppendMeasurement_
  };
}
