const MONITOR_PROPERTIES = {
  statePrefix: 'MONITOR_STATE_',
  lastValidPrefix: 'MONITOR_LAST_VALID_',
  watchdogNotified: 'WATCHDOG_NOTIFIED'
};

const DEFAULT_THRESHOLDS = {
  temp: { over: 30.0, hysteresis: 0.5 },
  hum: { over: 70.0, hysteresis: 5.0 },
  discomfortIndex: { over: 80.0, hysteresis: 0.5 }
};

const DEFAULT_SMOOTHING = {
  consecutiveK: 2
};

// ==========================================
// 1. 評価・判定（純粋ロジック）
// ==========================================

function evaluateMonitorConditions_(measurement) {
  const temp = measurement.temp;
  const hum = measurement.hum;
  const discomfortIndex = calculateDiscomfortIndex_(temp, hum);

  return {
    temp,
    hum,
    discomfortIndex,
    timestamp: new Date(),
    press: measurement.press
  };
}

function evaluateConditionState_(current, value, threshold, smoothing) {
  const isOver = value > threshold.over;
  const isRecovered = value <= threshold.over - threshold.hysteresis;
  let consecutive = current.consecutive || 0;
  let alert = current.alert || false;

  if (isOver) {
    consecutive += 1;
  } else {
    consecutive = 0;
  }

  if (isRecovered) {
    alert = false;
  } else if (consecutive >= (smoothing.consecutiveK || 2)) {
    alert = true;
  }

  return { consecutive, alert };
}

function detectAnomaly_(current, lastValid, limits) {
  if (!lastValid) {
    return false;
  }

  const deltaTemp = Math.abs(current.temp - lastValid.temp);
  const deltaHum = Math.abs(current.hum - lastValid.hum);
  const deltaPress = Math.abs(current.press - lastValid.press);

  const defaultLimits = {
    temp: 5.0,
    hum: 30.0,
    press: 20.0
  };
  limits = limits || defaultLimits;

  if (deltaTemp > limits.temp || deltaHum > limits.hum || deltaPress > limits.press) {
    return true;
  }

  return false;
}

function buildMonitorNotification_(conditions) {
  if (!conditions) {
    return null;
  }

  const tempStr = typeof conditions.temp === 'number' ? conditions.temp.toFixed(1) : '-';
  const humStr = typeof conditions.hum === 'number' ? Math.round(conditions.hum) : '-';

  return {
    text: `現在: ${tempStr} ℃ / ${humStr} %`,
    payload: conditions
  };
}

// ==========================================
// 2. 状態遷移・オーケストレーション（I/O + ロジック）
// ==========================================

function updateMonitorState_(measurement) {
  const conditions = evaluateMonitorConditions_(measurement);
  const properties = PropertiesService.getScriptProperties();
  const monitorConfig = getMonitorConfig_();
  const thresholds = monitorConfig.thresholds;
  const smoothing = monitorConfig.smoothing;
  const mergedConfig = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};

  const currentStates = loadMonitorStates_(properties);
  const lastValid = loadLastValidMeasurement_(properties);
  const anomaly = detectAnomaly_(conditions, lastValid, getAnomalyLimits_());

  if (!anomaly) {
    saveLastValidMeasurement_(properties, conditions);
  }

  const states = {
    temp: evaluateConditionState_(currentStates.temp, conditions.temp, thresholds.temp, smoothing),
    hum: evaluateConditionState_(currentStates.hum, conditions.hum, thresholds.hum, smoothing),
    discomfortIndex: evaluateConditionState_(currentStates.discomfortIndex, conditions.discomfortIndex, thresholds.discomfortIndex, smoothing)
  };

  const isOverThreshold = states.temp.alert || states.hum.alert || states.discomfortIndex.alert;

  const snoozeUntil = loadAlertSnoozeUntil_(properties);
  const lastSentTime = loadAlertLastSentTime_(properties);
  const dailyAlertInfo = loadDailyAlertInfo_(properties);

  const decision = typeof evaluateAlertDecision_ === 'function'
    ? evaluateAlertDecision_({
        temp: conditions.temp,
        hum: conditions.hum,
        press: conditions.press,
        isOverThreshold: isOverThreshold,
        nowMs: Date.now(),
        snoozeUntil: snoozeUntil,
        lastSentTime: lastSentTime,
        dailyAlertInfo: dailyAlertInfo,
        options: {
          cooldownMs: getConfigNumber_(mergedConfig, ['ALERT_COOLDOWN_MIN'], 60) * 60 * 1000,
          maxDailyCount: getConfigNumber_(mergedConfig, ['ALERT_MAX_DAILY_COUNT'], 5),
          minTemp: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MIN_TEMP'], -10.0),
          maxTemp: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MAX_TEMP'], 50.0),
          minHum: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MIN_HUM'], 0.0),
          maxHum: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MAX_HUM'], 100.0)
        }
      })
    : { shouldAlert: isOverThreshold && !(currentStates.temp.alert || currentStates.hum.alert || currentStates.discomfortIndex.alert) };

  let notification = null;
  if (decision.shouldAlert) {
    notification = buildMonitorNotification_(conditions);
    const nowMs = Date.now();
    saveAlertLastSentTime_(properties, nowMs);
    const todayJst = decision.todayJst || (typeof getJstDateString_ === 'function' ? getJstDateString_(nowMs) : new Date().toISOString().slice(0, 10));
    const newCount = (dailyAlertInfo && dailyAlertInfo.date === todayJst) ? (dailyAlertInfo.count + 1) : 1;
    saveDailyAlertInfo_(properties, { date: todayJst, count: newCount });
  }

  saveMonitorStates_(properties, states);

  return {
    states,
    notification,
    anomaly,
    decision
  };
}

function loadDailyAlertInfo_(properties) {
  const propKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.alertCountToday) || 'ALERT_COUNT_TODAY';
  const raw = properties.getProperty(propKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveDailyAlertInfo_(properties, info) {
  const propKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.alertCountToday) || 'ALERT_COUNT_TODAY';
  properties.setProperty(propKey, JSON.stringify(info));
}

function loadAlertLastSentTime_(properties) {
  const propKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.alertLastSentTime) || 'ALERT_LAST_SENT_TIME';
  return properties.getProperty(propKey);
}

function saveAlertLastSentTime_(properties, timestampMs) {
  const propKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.alertLastSentTime) || 'ALERT_LAST_SENT_TIME';
  properties.setProperty(propKey, String(timestampMs));
}

function loadAlertSnoozeUntil_(properties) {
  const primaryKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.alertSnoozeUntil) || 'ALERT_SNOOZE_UNTIL';
  return properties.getProperty(primaryKey) || properties.getProperty('MONITOR_SKIP_UNTIL');
}

function getAnomalyLimits_() {
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
  return {
    temp: getConfigNumber_(config, ['ANOMALY_TEMP'], 5.0),
    hum: getConfigNumber_(config, ['ANOMALY_HUM'], 30.0),
    press: getConfigNumber_(config, ['ANOMALY_PRESS'], 20.0)
  };
}

function getMonitorConfig_() {
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
  return {
    thresholds: {
      temp: {
        over: getConfigNumber_(config, ['TEMP_HIGH', 'MONITOR_TEMP_OVER'], DEFAULT_THRESHOLDS.temp.over),
        hysteresis: getConfigNumber_(config, ['HYSTERESIS_TEMP', 'MONITOR_TEMP_HYSTERESIS'], DEFAULT_THRESHOLDS.temp.hysteresis)
      },
      hum: {
        over: getConfigNumber_(config, ['HUM_HIGH', 'MONITOR_HUM_OVER'], DEFAULT_THRESHOLDS.hum.over),
        hysteresis: getConfigNumber_(config, ['HYSTERESIS_HUM', 'MONITOR_HUM_HYSTERESIS'], DEFAULT_THRESHOLDS.hum.hysteresis)
      },
      discomfortIndex: {
        over: getConfigNumber_(config, ['HEAT_INDEX_HIGH', 'MONITOR_DI_OVER'], DEFAULT_THRESHOLDS.discomfortIndex.over),
        hysteresis: getConfigNumber_(config, ['HYSTERESIS_HEAT_INDEX', 'MONITOR_DI_HYSTERESIS'], DEFAULT_THRESHOLDS.discomfortIndex.hysteresis)
      }
    },
    smoothing: {
      consecutiveK: getConfigNumber_(config, ['SMOOTH_K', 'MONITOR_CONSECUTIVE_K'], DEFAULT_SMOOTHING.consecutiveK)
    }
  };
}

function getConfigNumber_(config, keys, fallback) {
  for (const key of keys) {
    const value = Number(config[key]);
    if (isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function loadMonitorStates_(properties) {
  const result = {
    temp: { consecutive: 0, alert: false },
    hum: { consecutive: 0, alert: false },
    discomfortIndex: { consecutive: 0, alert: false }
  };

  for (const key of Object.keys(result)) {
    const raw = properties.getProperty(MONITOR_PROPERTIES.statePrefix + key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        result[key] = Object.assign({}, result[key], parsed);
      } catch (error) {
        // keep defaults on parse error
      }
    }
  }

  return result;
}

function saveMonitorStates_(properties, states) {
  for (const [key, value] of Object.entries(states)) {
    properties.setProperty(MONITOR_PROPERTIES.statePrefix + key, JSON.stringify(value));
  }
}

function loadLastValidMeasurement_(properties) {
  const raw = properties.getProperty(MONITOR_PROPERTIES.lastValidPrefix + 'payload');
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveLastValidMeasurement_(properties, conditions) {
  properties.setProperty(MONITOR_PROPERTIES.lastValidPrefix + 'payload', JSON.stringify(conditions));
}


function resetMonitorStates_() {
  const properties = PropertiesService.getScriptProperties();
  const defaults = {
    temp: { consecutive: 0, alert: false },
    hum: { consecutive: 0, alert: false },
    discomfortIndex: { consecutive: 0, alert: false }
  };

  saveMonitorStates_(properties, defaults);
}

function checkWatchdog() {
  const result = runWatchdogCheck_();
  if (result && result.notified && result.notification &&
      typeof pushMonitorNotification_ === 'function') {
    try {
      pushMonitorNotification_(result.notification.text);
    } catch (err) {
      if (typeof logError_ === 'function') {
        logError_('watchdog', 'line_push', 'push_failed', err);
      }
    }
  }
  return result;
}

function runWatchdogCheck_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('monitor_watchdog', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let dataSheet;
  if (typeof getRawDataSheet_ === 'function') {
    dataSheet = getRawDataSheet_(spreadsheet, properties);
  } else {
    const sheetName = properties.getProperty(sheetNameKey) || 'RawData';
    dataSheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.getSheetByName('2026') || spreadsheet.getSheetByName('DATA');
  }
  if (!dataSheet) {
    const error = new Error('Raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monitor_watchdog', 'RawData', 'data_sheet_not_found', error);
    }
    throw error;
  }

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || 15000;
  lock.waitLock(timeoutMs);

  try {
    const lastRow = dataSheet.getLastRow();
    if (lastRow < 2) {
      return {
        timeout: false,
        notified: false,
        notification: null,
        elapsedMinutes: null
      };
    }

    const lastRowValues = dataSheet.getRange(lastRow, 1, 1, 1).getValues()[0];
    const lastTimestamp = lastRowValues[0];
    let lastDate;
    if (Object.prototype.toString.call(lastTimestamp) === '[object Date]') {
      lastDate = lastTimestamp;
    } else if (lastTimestamp) {
      lastDate = new Date(lastTimestamp);
    }

    if (!lastDate || isNaN(lastDate.getTime())) {
      return {
        timeout: false,
        notified: false,
        notification: null,
        elapsedMinutes: null
      };
    }

    const now = new Date();
    const elapsedMinutes = (now.getTime() - lastDate.getTime()) / (1000 * 60);

    const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
    const timeoutMinutes = getConfigNumber_(config, ['WATCHDOG_TIMEOUT_MIN'], 4320);

    if (elapsedMinutes < timeoutMinutes) {
      return {
        timeout: false,
        notified: false,
        notification: null,
        elapsedMinutes: elapsedMinutes
      };
    }

    const alreadyNotified = properties.getProperty(MONITOR_PROPERTIES.watchdogNotified) === 'true';
    if (alreadyNotified) {
      return {
        timeout: true,
        notified: false,
        notification: null,
        elapsedMinutes: elapsedMinutes
      };
    }

    const daysOffline = (elapsedMinutes / (60 * 24)).toFixed(1);
    const notification = {
      text: `センサー未受信：約${daysOffline}日間（${Math.round(elapsedMinutes)}分）データが途絶えています。`,
      lastTimestamp: lastDate,
      elapsedMinutes: elapsedMinutes
    };

    properties.setProperty(MONITOR_PROPERTIES.watchdogNotified, 'true');

    return {
      timeout: true,
      notified: true,
      notification: notification,
      elapsedMinutes: elapsedMinutes
    };
  } finally {
    lock.releaseLock();
  }
}

function resetWatchdogState_() {
  const properties = PropertiesService.getScriptProperties();
  const wasNotified = properties.getProperty(MONITOR_PROPERTIES.watchdogNotified) === 'true';
  if (wasNotified) {
    properties.deleteProperty(MONITOR_PROPERTIES.watchdogNotified);
    resetMonitorStates_();
  }
}

function getMonitorStateForTest_() {
  return loadMonitorStates_(PropertiesService.getScriptProperties());
}

if (typeof module !== 'undefined') {
  module.exports = {
    MONITOR_PROPERTIES,
    DEFAULT_THRESHOLDS,
    DEFAULT_SMOOTHING,
    evaluateMonitorConditions_,
    evaluateConditionState_,
    detectAnomaly_,
    buildMonitorNotification_,
    updateMonitorState_,
    loadDailyAlertInfo_,
    saveDailyAlertInfo_,
    loadAlertLastSentTime_,
    saveAlertLastSentTime_,
    loadAlertSnoozeUntil_,
    getAnomalyLimits_,
    getMonitorConfig_,
    getConfigNumber_,
    loadMonitorStates_,
    saveMonitorStates_,
    loadLastValidMeasurement_,
    saveLastValidMeasurement_,
    resetMonitorStates_,
    checkWatchdog,
    runWatchdogCheck_,
    resetWatchdogState_,
    getMonitorStateForTest_
  };
}
