const SCRIPT_PROPERTY_KEYS = {
  spreadsheetId: 'SPREADSHEET_ID',
  apiToken: 'API_TOKEN',
  sheetName: 'SHEET_NAME',
  lineChannelSecret: 'LINE_CHANNEL_SECRET',
  lineChannelAccessToken: 'LINE_CHANNEL_ACCESS_TOKEN',
  lineUserId: 'LINE_USER_ID',
  alertSnoozeUntil: 'ALERT_SNOOZE_UNTIL',
  alertLastSentTime: 'ALERT_LAST_SENT_TIME',
  alertCountToday: 'ALERT_COUNT_TODAY',
  archiveSpreadsheetId: 'ARCHIVE_SPREADSHEET_ID',
  archiveRetentionMonths: 'ARCHIVE_RETENTION_MONTHS'
};

const DEFAULT_CONFIG = {
  WATCHDOG_TIMEOUT_MIN: 4320,
  MONITOR_CONSECUTIVE_K: 2,
  MONITOR_TEMP_OVER: 30.0,
  MONITOR_TEMP_HYSTERESIS: 0.5,
  MONITOR_HUM_OVER: 70.0,
  MONITOR_HUM_HYSTERESIS: 5.0,
  MONITOR_DI_OVER: 80.0,
  MONITOR_DI_HYSTERESIS: 0.5,
  ALERT_COOLDOWN_MIN: 60,
  ALERT_MAX_DAILY_COUNT: 5,
  SENSOR_GUARD_MIN_TEMP: -10.0,
  SENSOR_GUARD_MAX_TEMP: 50.0,
  SENSOR_GUARD_MIN_HUM: 0.0,
  SENSOR_GUARD_MAX_HUM: 100.0,
  SENSOR_DUPLICATION_WINDOW_SECONDS: 180,
  SKIP_HOURS: 8,
  SKIP_UNTIL_HOUR: 8,
  INGEST_LOCK_TIMEOUT_MS: 15000,
  LINE_LOCK_TIMEOUT_MS: 2000,
  ARCHIVE_RETENTION_MONTHS: 2
};

function getMergedConfig_() {
  const config = Object.assign({}, DEFAULT_CONFIG);
  const scriptProps = PropertiesService.getScriptProperties().getProperties();
  const supportedKeys = new Set(Object.keys(DEFAULT_CONFIG).concat([
    'TEMP_HIGH', 'HUM_HIGH', 'HEAT_INDEX_HIGH',
    'HYSTERESIS_TEMP', 'HYSTERESIS_HUM', 'HYSTERESIS_HEAT_INDEX',
    'SMOOTH_K', 'ANOMALY_TEMP', 'ANOMALY_HUM', 'ANOMALY_PRESS'
  ]));
  for (const key of supportedKeys) {
    if (Object.prototype.hasOwnProperty.call(scriptProps, key)) {
      try {
        config[key] = JSON.parse(scriptProps[key]);
      } catch (error) {
        config[key] = scriptProps[key];
      }
    }
  }
  const sheetConfig = getSheetConfig_();
  for (const key of Object.keys(sheetConfig)) {
    const raw = sheetConfig[key];
    if (['WATCHDOG_TIMEOUT_MIN', 'MONITOR_CONSECUTIVE_K', 'SENSOR_DUPLICATION_WINDOW_SECONDS', 'INGEST_LOCK_TIMEOUT_MS', 'LINE_LOCK_TIMEOUT_MS', 'SKIP_HOURS', 'SKIP_UNTIL_HOUR', 'ALERT_COOLDOWN_MIN', 'ALERT_MAX_DAILY_COUNT'].indexOf(key) >= 0) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        config[key] = parsed;
      }
    } else {
      config[key] = raw;
    }
  }
  return config;
}

function parseVerticalSheetConfig_(values) {
  const config = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const key = row[0];
    const value = row[1];
    if (key && value !== undefined && value !== null && value !== '') {
      config[String(key).trim()] = String(value);
    }
  }
  return config;
}

function parseHorizontalSheetConfig_(header, values) {
  const config = {};
  for (let column = 0; column < header.length; column += 1) {
    const key = header[column];
    if (!key) {
      continue;
    }
    for (let row = 1; row < values.length; row += 1) {
      const value = values[row][column];
      if (value !== undefined && value !== null && value !== '') {
        config[String(key).trim()] = String(value);
        break;
      }
    }
  }
  return config;
}

function getSheetConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    return {};
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const configSheet = spreadsheet.getSheetByName('Config');
  if (!configSheet) {
    return {};
  }
  const values = configSheet.getDataRange().getValues();
  if (values.length === 0) {
    return {};
  }

  const header = values[0];
  const firstHeader = String(header[0] || '').trim().toLowerCase();
  const secondHeader = String(header[1] || '').trim().toLowerCase();

  // Backward-compatible vertical format: key | value, one setting per row.
  if (firstHeader === 'key' && secondHeader === 'value') {
    return parseVerticalSheetConfig_(values);
  }

  // Documented horizontal format: setting names in row 1, values below them.
  return parseHorizontalSheetConfig_(header, values);
}

function getSpreadsheetConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || null,
    apiToken: properties.getProperty(SCRIPT_PROPERTY_KEYS.apiToken) || null,
    sheetName: properties.getProperty(SCRIPT_PROPERTY_KEYS.sheetName) || 'RawData',
    lineChannelSecret: properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelSecret) || null,
    lineChannelAccessToken: properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelAccessToken) || null
  };
}

function getRawDataSheet_(spreadsheet, properties) {
  const customSheetName = properties ? properties.getProperty(SCRIPT_PROPERTY_KEYS.sheetName) : null;

  if (customSheetName) {
    const sheet = spreadsheet.getSheetByName(customSheetName);
    if (sheet) return sheet;
  }

  let sheet = spreadsheet.getSheetByName('RawData');
  if (sheet) return sheet;

  sheet = spreadsheet.getSheetByName('2026');
  if (sheet) return sheet;

  sheet = spreadsheet.getSheetByName('DATA');
  if (sheet) return sheet;

  return null;
}

function getMergedConfigForTest_() {
  return getMergedConfig_();
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCRIPT_PROPERTY_KEYS,
    DEFAULT_CONFIG,
    getMergedConfig_,
    getSheetConfig_,
    parseVerticalSheetConfig_,
    parseHorizontalSheetConfig_,
    getSpreadsheetConfig_,
    getRawDataSheet_,
    getMergedConfigForTest_
  };
}
