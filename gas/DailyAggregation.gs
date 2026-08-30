const DAILY_AGGREGATION_PROPERTIES = {
  lastRow: 'DAILY_LAST_ROW'
};

const DAILY_SHEET_NAME = 'Daily';
const DATA_SHEET_NAME = 'DATA';
const DAILY_LOCK_TIMEOUT_MS = 15000;

function aggregateDaily() {
  return runDailyAggregation_();
}

function runDailyAggregation_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const dataSheetName = properties.getProperty(sheetNameKey) || DATA_SHEET_NAME;
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const dataSheet = spreadsheet.getSheetByName(dataSheetName);
  if (!dataSheet) {
    const error = new Error('DATA sheet not found');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', dataSheetName, 'data_sheet_not_found', error);
    }
    throw error;
  }

  const dailySheet = spreadsheet.getSheetByName(DAILY_SHEET_NAME);
  if (!dailySheet) {
    const error = new Error('Daily sheet not found');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', DAILY_SHEET_NAME, 'daily_sheet_not_found', error);
    }
    throw error;
  }

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || DAILY_LOCK_TIMEOUT_MS;
  lock.waitLock(timeoutMs);

  try {
    const lastProcessedRowStr = properties.getProperty(DAILY_AGGREGATION_PROPERTIES.lastRow);
    let lastProcessedRow = lastProcessedRowStr ? parseInt(lastProcessedRowStr, 10) : 1;
    if (isNaN(lastProcessedRow) || lastProcessedRow < 1) {
      lastProcessedRow = 1;
    }

    const totalDataRows = dataSheet.getLastRow();
    if (totalDataRows <= lastProcessedRow) {
      return {
        processedDays: 0,
        appendedDays: 0,
        lastProcessedRow: lastProcessedRow
      };
    }

    const startRow = lastProcessedRow + 1;
    const numRows = totalDataRows - lastProcessedRow;
    const dataValues = dataSheet.getRange(startRow, 1, numRows, 5).getValues();

    const now = new Date();
    const todayStr = formatDateTokyo_(now);

    const { dailyBuckets, lastConfirmedRow } = processDailyDataRows_(dataValues, startRow, todayStr, lastProcessedRow);

    // 既存のDailyシートに存在する日付を取得し、二重集計を防止
    const existingDailyDates = getExistingDailyDates_(dailySheet);
    const sortedDates = Array.from(dailyBuckets.keys()).sort();
    let appendedCount = 0;

    for (let j = 0; j < sortedDates.length; j += 1) {
      const dateStr = sortedDates[j];
      if (existingDailyDates.has(dateStr)) {
        continue;
      }

      const bucket = dailyBuckets.get(dateStr);
      const rowData = buildDailyRowData_(dateStr, bucket);

      // 有効データが存在しない日は追記をスキップ
      if (!rowData) {
        continue;
      }

      dailySheet.appendRow(rowData);
      appendedCount += 1;
      existingDailyDates.add(dateStr);
    }

    // 確定済み行まで進んだ場合のみ DAILY_LAST_ROW を更新
    if (lastConfirmedRow > lastProcessedRow) {
      properties.setProperty(DAILY_AGGREGATION_PROPERTIES.lastRow, String(lastConfirmedRow));
    }

    return {
      processedDays: sortedDates.length,
      appendedDays: appendedCount,
      lastProcessedRow: lastConfirmedRow
    };
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', DAILY_SHEET_NAME, 'aggregation_failed', error);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getExistingDailyDates_(dailySheet) {
  const existingDates = new Set();
  const lastRow = dailySheet.getLastRow();
  if (lastRow < 2) {
    return existingDates;
  }

  const values = dailySheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    const rawDate = values[i][0];
    if (rawDate) {
      const dateStr = formatDateTokyo_(rawDate);
      if (dateStr) {
        existingDates.add(dateStr);
      }
    }
  }
  return existingDates;
}

function formatDateTokyo_(dateInput, format) {
  if (!dateInput) {
    return null;
  }

  let dateObj;
  if (Object.prototype.toString.call(dateInput) === '[object Date]') {
    if (isNaN(dateInput.getTime())) {
      return null;
    }
    dateObj = dateInput;
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    if (!format || format === 'yyyy-MM-dd') {
      return dateInput.substring(0, 10);
    }
    dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
  } else {
    dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
  }

  const targetFormat = format || 'yyyy-MM-dd';

  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(dateObj, 'Asia/Tokyo', targetFormat);
  }

  const tokyoTime = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  const year = tokyoTime.getUTCFullYear();
  const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tokyoTime.getUTCDate()).padStart(2, '0');

  if (targetFormat === 'yyyy-MM') {
    return `${year}-${month}`;
  } else if (targetFormat === 'yyyy-MM-dd HH:mm:ss') {
    const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
    const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(tokyoTime.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  return `${year}-${month}-${day}`;
}

function calcAvg_(numbers) {
  if (!numbers || numbers.length === 0) {
    return 0;
  }
  const sum = numbers.reduce(function(acc, val) {
    return acc + val;
  }, 0);
  return sum / numbers.length;
}

function roundTwoDecimals_(num) {
  return Math.round(num * 100) / 100;
}

function processDailyDataRows_(dataValues, startRow, todayStr, lastProcessedRow) {
  const dailyBuckets = new Map();
  let lastConfirmedRow = lastProcessedRow;

  for (let i = 0; i < dataValues.length; i += 1) {
    const currentRowNumber = startRow + i;
    const row = dataValues[i];
    const timestamp = row[0];
    const temp = row[1];
    const press = row[2];
    const hum = row[3];
    const flag = row[4];

    if (!timestamp) {
      continue;
    }

    const rowDateStr = formatDateTokyo_(timestamp);
    if (!rowDateStr) {
      continue;
    }

    // 当日以降のデータは未確定として今回の集計から除外
    if (todayStr && rowDateStr >= todayStr) {
      break;
    }

    lastConfirmedRow = currentRowNumber;

    const flagStr = String(flag || '').trim().toLowerCase();
    const isAnomaly = flagStr === 'anomaly';
    const isAlert = flagStr === 'alert';

    if (!dailyBuckets.has(rowDateStr)) {
      dailyBuckets.set(rowDateStr, {
        temps: [],
        presses: [],
        hums: [],
        alertCount: 0
      });
    }

    const bucket = dailyBuckets.get(rowDateStr);

    if (isAlert) {
      bucket.alertCount += 1;
    }

    // anomaly 行は平均・最小・最大・sample_count から除外
    if (isAnomaly) {
      continue;
    }

    const isValidTemp = typeof temp === 'number' && isFinite(temp);
    const isValidPress = typeof press === 'number' && isFinite(press);
    const isValidHum = typeof hum === 'number' && isFinite(hum);

    if (isValidTemp && isValidPress && isValidHum) {
      bucket.temps.push(temp);
      bucket.presses.push(press);
      bucket.hums.push(hum);
    }
  }

  return { dailyBuckets, lastConfirmedRow };
}

function buildDailyRowData_(dateStr, bucket) {
  const sampleCount = bucket.temps.length;
  if (sampleCount === 0) {
    return null;
  }

  const tempAvg = roundTwoDecimals_(calcAvg_(bucket.temps));
  const tempMin = Math.min(...bucket.temps);
  const tempMax = Math.max(...bucket.temps);

  const humAvg = roundTwoDecimals_(calcAvg_(bucket.hums));
  const humMin = Math.min(...bucket.hums);
  const humMax = Math.max(...bucket.hums);

  const pressAvg = roundTwoDecimals_(calcAvg_(bucket.presses));
  const pressMin = Math.min(...bucket.presses);
  const pressMax = Math.max(...bucket.presses);

  return [
    dateStr,
    tempAvg,
    tempMin,
    tempMax,
    humAvg,
    humMin,
    humMax,
    pressAvg,
    pressMin,
    pressMax,
    sampleCount,
    bucket.alertCount
  ];
}
