const MONTHLY_AGGREGATION_PROPERTIES = {
  lastRow: 'MONTHLY_LAST_ROW'
};

const MONTHLY_TARGET_SHEET_NAME = 'Monthly';
const MONTHLY_SOURCE_DAILY_SHEET_NAME = 'Daily';
const MONTHLY_LOCK_TIMEOUT_MS = 15000;

function aggregateMonthly() {
  return runMonthlyAggregation_();
}

function getMonthlyAggregationSheets_(spreadsheet) {
  const dailySheet = spreadsheet.getSheetByName(MONTHLY_SOURCE_DAILY_SHEET_NAME);
  if (!dailySheet) {
    const error = new Error('Daily sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_SOURCE_DAILY_SHEET_NAME, 'daily_sheet_not_found', error);
    }
    throw error;
  }

  const monthlySheet = spreadsheet.getSheetByName(MONTHLY_TARGET_SHEET_NAME);
  if (!monthlySheet) {
    const error = new Error('Monthly sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_TARGET_SHEET_NAME, 'monthly_sheet_not_found', error);
    }
    throw error;
  }

  return { dailySheet, monthlySheet };
}

function appendMonthlyDataRows_(monthlySheet, monthlyBuckets, existingMonthlyDates) {
  const sortedYearMonths = Array.from(monthlyBuckets.keys()).sort();
  let appendedCount = 0;

  for (let j = 0; j < sortedYearMonths.length; j += 1) {
    const yearMonth = sortedYearMonths[j];
    if (existingMonthlyDates.has(yearMonth)) {
      continue;
    }

    const bucket = monthlyBuckets.get(yearMonth);
    const rowData = buildMonthlyRowData_(yearMonth, bucket);

    if (!rowData) {
      continue;
    }

    monthlySheet.appendRow(rowData);
    appendedCount += 1;
    existingMonthlyDates.add(yearMonth);
  }

  return { sortedYearMonths, appendedCount };
}

function openMonthlyAggregationSpreadsheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getLastProcessedMonthlyRow_(properties) {
  const lastProcessedRowStr = properties.getProperty(MONTHLY_AGGREGATION_PROPERTIES.lastRow);
  const lastProcessedRow = lastProcessedRowStr ? parseInt(lastProcessedRowStr, 10) : 1;
  if (isNaN(lastProcessedRow) || lastProcessedRow < 1) {
    return 1;
  }
  return lastProcessedRow;
}

function triggerMonthlyDataArchive_(result) {
  try {
    if (typeof runDataArchive_ === 'function') {
      result.archive = runDataArchive_();
    }
  } catch (archiveError) {
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', 'DataArchive', 'archive_failed', archiveError);
    }
  }
}

function runMonthlyAggregation_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = openMonthlyAggregationSpreadsheet_(properties);
  const { dailySheet, monthlySheet } = getMonthlyAggregationSheets_(spreadsheet);

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || MONTHLY_LOCK_TIMEOUT_MS;
  lock.waitLock(timeoutMs);

  try {
    const lastProcessedRow = getLastProcessedMonthlyRow_(properties);
    const totalDailyRows = dailySheet.getLastRow();
    if (totalDailyRows <= lastProcessedRow) {
      return {
        processedMonths: 0,
        appendedMonths: 0,
        lastProcessedRow: lastProcessedRow
      };
    }

    const startRow = lastProcessedRow + 1;
    const numRows = totalDailyRows - lastProcessedRow;
    const dailyValues = dailySheet.getRange(startRow, 1, numRows, 12).getValues();

    const now = new Date();
    const currentYearMonth = formatYearMonthTokyo_(now);

    const { monthlyBuckets, lastConfirmedRow } = processMonthlyDataRows_(dailyValues, startRow, currentYearMonth, lastProcessedRow);

    const existingMonthlyDates = getExistingMonthlyDates_(monthlySheet);
    const { sortedYearMonths, appendedCount } = appendMonthlyDataRows_(monthlySheet, monthlyBuckets, existingMonthlyDates);

    if (lastConfirmedRow > lastProcessedRow) {
      properties.setProperty(MONTHLY_AGGREGATION_PROPERTIES.lastRow, String(lastConfirmedRow));
    }

    const result = {
      processedMonths: sortedYearMonths.length,
      appendedMonths: appendedCount,
      lastProcessedRow: lastConfirmedRow
    };

    triggerMonthlyDataArchive_(result);

    return result;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_TARGET_SHEET_NAME, 'aggregation_failed', error);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getExistingMonthlyDates_(monthlySheet) {
  const existingDates = new Set();
  const lastRow = monthlySheet.getLastRow();
  if (lastRow < 2) {
    return existingDates;
  }

  const values = monthlySheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    const rawDate = values[i][0];
    if (rawDate) {
      const yearMonth = formatYearMonthTokyo_(rawDate);
      if (yearMonth) {
        existingDates.add(yearMonth);
      }
    }
  }
  return existingDates;
}

function formatYearMonthTokyo_(dateInput) {
  if (!dateInput) {
    return null;
  }

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}/.test(dateInput)) {
    return dateInput.substring(0, 7);
  }

  if (typeof formatDateTokyo_ === 'function') {
    return formatDateTokyo_(dateInput, 'yyyy-MM');
  }

  let dateObj;
  if (Object.prototype.toString.call(dateInput) === '[object Date]') {
    if (isNaN(dateInput.getTime())) {
      return null;
    }
    dateObj = dateInput;
  } else {
    dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
  }

  const tokyoTime = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  const year = tokyoTime.getUTCFullYear();
  const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function isValidMonthlyRow_(row) {
  for (let idx = 1; idx <= 9; idx += 1) {
    const val = row[idx];
    if (typeof val !== 'number' || !isFinite(val)) {
      return false;
    }
  }
  return true;
}

function accumulateMonthlyRow_(bucket, row) {
  bucket.tempAvgs.push(row[1]);
  bucket.tempMins.push(row[2]);
  bucket.tempMaxs.push(row[3]);
  bucket.humAvgs.push(row[4]);
  bucket.humMins.push(row[5]);
  bucket.humMaxs.push(row[6]);
  bucket.pressAvgs.push(row[7]);
  bucket.pressMins.push(row[8]);
  bucket.pressMaxs.push(row[9]);
}

function processMonthlyDataRows_(dailyValues, startRow, currentYearMonth, lastProcessedRow) {
  const monthlyBuckets = new Map();
  let lastConfirmedRow = lastProcessedRow;

  for (let i = 0; i < dailyValues.length; i += 1) {
    const currentRowNumber = startRow + i;
    const row = dailyValues[i];
    const dateVal = row[0];

    if (!dateVal) {
      continue;
    }

    const rowYearMonth = formatYearMonthTokyo_(dateVal);
    if (!rowYearMonth) {
      continue;
    }

    // Dailyシートは時系列昇順の追記専用（append-only）を前提とする。
    // 当月以降のデータは未確定（月途中）のため集計対象外とし、走査を打ち切る。
    if (currentYearMonth && rowYearMonth >= currentYearMonth) {
      break;
    }

    lastConfirmedRow = currentRowNumber;

    if (!isValidMonthlyRow_(row)) {
      continue;
    }

    if (!monthlyBuckets.has(rowYearMonth)) {
      monthlyBuckets.set(rowYearMonth, {
        tempAvgs: [],
        tempMins: [],
        tempMaxs: [],
        humAvgs: [],
        humMins: [],
        humMaxs: [],
        pressAvgs: [],
        pressMins: [],
        pressMaxs: []
      });
    }

    const bucket = monthlyBuckets.get(rowYearMonth);
    accumulateMonthlyRow_(bucket, row);
  }

  return { monthlyBuckets, lastConfirmedRow };
}

function buildMonthlyRowData_(yearMonth, bucket) {
  const daysCount = bucket.tempAvgs.length;
  if (daysCount === 0) {
    return null;
  }

  const tempAvg = roundTwoDecimals_(calcAvg_(bucket.tempAvgs));
  const tempMin = Math.min(...bucket.tempMins);
  const tempMax = Math.max(...bucket.tempMaxs);

  const humAvg = roundTwoDecimals_(calcAvg_(bucket.humAvgs));
  const humMin = Math.min(...bucket.humMins);
  const humMax = Math.max(...bucket.humMaxs);

  const pressAvg = roundTwoDecimals_(calcAvg_(bucket.pressAvgs));
  const pressMin = Math.min(...bucket.pressMins);
  const pressMax = Math.max(...bucket.pressMaxs);

  return [
    yearMonth,
    tempAvg,
    tempMin,
    tempMax,
    humAvg,
    humMin,
    humMax,
    pressAvg,
    pressMin,
    pressMax,
    daysCount
  ];
}

if (typeof module !== 'undefined') {
  module.exports = {
    MONTHLY_AGGREGATION_PROPERTIES,
    MONTHLY_TARGET_SHEET_NAME,
    MONTHLY_SOURCE_DAILY_SHEET_NAME,
    MONTHLY_LOCK_TIMEOUT_MS,
    aggregateMonthly,
    openMonthlyAggregationSpreadsheet_,
    getLastProcessedMonthlyRow_,
    triggerMonthlyDataArchive_,
    getMonthlyAggregationSheets_,
    appendMonthlyDataRows_,
    runMonthlyAggregation_,
    getExistingMonthlyDates_,
    formatYearMonthTokyo_,
    isValidMonthlyRow_,
    accumulateMonthlyRow_,
    processMonthlyDataRows_,
    buildMonthlyRowData_
  };
}
