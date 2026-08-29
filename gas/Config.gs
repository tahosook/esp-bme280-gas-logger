const SCRIPT_PROPERTY_KEYS = {
  spreadsheetId: 'SPREADSHEET_ID',
  apiToken: 'API_TOKEN',
  sheetName: 'SHEET_NAME',
  lineChannelSecret: 'LINE_CHANNEL_SECRET',
  lineChannelAccessToken: 'LINE_CHANNEL_ACCESS_TOKEN',
  lineUserId: 'LINE_USER_ID'
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
  SENSOR_DUPLICATION_WINDOW_SECONDS: 180,
  SKIP_HOURS: 8,
  INGEST_LOCK_TIMEOUT_MS: 15000,
  LINE_LOCK_TIMEOUT_MS: 2000
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
    if (['WATCHDOG_TIMEOUT_MIN', 'MONITOR_CONSECUTIVE_K', 'SENSOR_DUPLICATION_WINDOW_SECONDS', 'INGEST_LOCK_TIMEOUT_MS', 'LINE_LOCK_TIMEOUT_MS', 'SKIP_HOURS'].indexOf(key) >= 0) {
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
  const config = {};

  if (values.length === 0) {
    return config;
  }

  const header = values[0];
  const firstHeader = String(header[0] || '').trim().toLowerCase();
  const secondHeader = String(header[1] || '').trim().toLowerCase();

  // Backward-compatible vertical format: key | value, one setting per row.
  if (firstHeader === 'key' && secondHeader === 'value') {
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

  // Documented horizontal format: setting names in row 1, values below them.
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

function getSpreadsheetConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || null,
    apiToken: properties.getProperty(SCRIPT_PROPERTY_KEYS.apiToken) || null,
    sheetName: properties.getProperty(SCRIPT_PROPERTY_KEYS.sheetName) || 'DATA',
    lineChannelSecret: properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelSecret) || null,
    lineChannelAccessToken: properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelAccessToken) || null
  };
}

function getMergedConfigForTest_() {
  return getMergedConfig_();
}
