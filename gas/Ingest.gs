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

/* eslint-disable complexity */
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

/* eslint-disable complexity */
function checkAndAppendMeasurement_(payload, properties) {
  const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('missing spreadsheet configuration');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getRawDataSheet_(spreadsheet, properties);
  if (!sheet) {
    throw new Error('sheet not found');
  }

  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG : {});
  const lockTimeoutMs = config.INGEST_LOCK_TIMEOUT_MS || 15000;
  const dupWindowSec = typeof config.SENSOR_DUPLICATION_WINDOW_SECONDS === 'number' ? config.SENSOR_DUPLICATION_WINDOW_SECONDS : 180;

  const lock = LockService.getScriptLock();
  lock.waitLock(lockTimeoutMs);

  try {
    const lastRow = sheet.getLastRow();
    const now = new Date();

    if (lastRow >= 1) {
      const lastValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
      const lastTimestamp = lastValues[0];
      const lastTemp = lastValues[1];
      const lastPress = lastValues[2];
      const lastHum = lastValues[3];

      // DATA row 1 is normally a header. Ignore any non-date row so the first
      // measurement can be appended without attempting timestamp arithmetic.
      const hasValidTimestamp = Object.prototype.toString.call(lastTimestamp) === '[object Date]' &&
          !isNaN(lastTimestamp.getTime());

      if (hasValidTimestamp) {
        const elapsedSec = (now.getTime() - lastTimestamp.getTime()) / 1000;

        const isDuplicate = elapsedSec >= 0 &&
            elapsedSec <= dupWindowSec &&
            lastTemp === payload.temp &&
            lastPress === payload.press &&
            lastHum === payload.hum;

        if (isDuplicate) {
          return false;
        }
      }
    }

    sheet.appendRow([now, payload.temp, payload.press, payload.hum, '']);
    const lastAppendedRow = sheet.getLastRow();
    sheet.getRange(lastAppendedRow, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');

    if (typeof resetWatchdogState_ === 'function') {
      try {
        resetWatchdogState_();
      } catch (error) {
        if (typeof logError_ === 'function') {
          logError_('ingest', 'watchdog', 'watchdog_reset_failed', error);
        }
      }
    }

    if (typeof updateMonitorState_ === 'function') {
      try {
        const monitorResult = updateMonitorState_(payload);
        if (monitorResult && monitorResult.anomaly) {
          sheet.getRange(lastAppendedRow, 5).setValue('anomaly');
        }
        if (monitorResult && monitorResult.notification &&
            typeof pushMonitorNotification_ === 'function') {
          try {
            pushMonitorNotification_(monitorResult.notification.text);
          } catch (err) {
            if (typeof logError_ === 'function') {
              logError_('ingest', 'line_push', 'push_failed', err);
            }
          }
        }
      } catch (error) {
        if (typeof logError_ === 'function') {
          logError_('ingest', 'monitor', 'monitor_update_failed', error);
        } else {
          console.error('monitor_update_failed');
        }
      }
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    handleSensorPost_,
    validateSensorPayload_,
    checkAndAppendMeasurement_
  };
}
