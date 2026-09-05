function writeToArchiveSheets_(archiveSpreadsheet, groupedData, sortedYearMonths) {
  let totalArchived = 0;

  for (let i = 0; i < sortedYearMonths.length; i++) {
    const yearMonth = sortedYearMonths[i];
    const rows = groupedData.get(yearMonth);

    const targetSheetName = 'Raw_' + yearMonth.replace('-', '');
    let targetSheet = archiveSpreadsheet.getSheetByName(targetSheetName);

    if (!targetSheet) {
      targetSheet = archiveSpreadsheet.insertSheet(targetSheetName);
      targetSheet.appendRow(['timestamp', 'temp', 'press', 'hum', 'flag']);
    }

    const startRow = targetSheet.getLastRow() + 1;
    targetSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    // Verify
    const verifyRange = targetSheet.getRange(startRow, 1, rows.length, 1).getValues();
    if (verifyRange.length !== rows.length) {
      const error = new Error(`Verification failed for ${yearMonth}. Expected ${rows.length} rows, got ${verifyRange.length}`);
      if (typeof logError_ === 'function') {
        logError_('data_archive', targetSheetName, 'verify_failed', error);
      }
      throw error;
    }

    totalArchived += rows.length;
  }

  return totalArchived;
}

function getArchiveSpreadsheets_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);

  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration for archive');
    if (typeof logError_ === 'function') {
      logError_('data_archive', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = getRawDataSheet_(spreadsheet, properties);

  if (!sourceSheet) {
    const error = new Error('Source raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('data_archive', 'SourceSheet', 'sheet_not_found', error);
    }
    throw error;
  }

  const archiveSpreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.archiveSpreadsheetId) || 'ARCHIVE_SPREADSHEET_ID';
  const archiveSpreadsheetId = properties.getProperty(archiveSpreadsheetIdKey) || spreadsheetId;
  const archiveSpreadsheet = SpreadsheetApp.openById(archiveSpreadsheetId);

  return { sourceSheet, archiveSpreadsheet };
}

function runDataArchive_() {
  const properties = PropertiesService.getScriptProperties();
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : { ARCHIVE_RETENTION_MONTHS: 2 };
  const { sourceSheet, archiveSpreadsheet } = getArchiveSpreadsheets_(properties);

  const retentionMonths = typeof config.ARCHIVE_RETENTION_MONTHS === 'number' ? config.ARCHIVE_RETENTION_MONTHS : 2;
  const now = new Date();
  const thresholdDate = getArchiveThresholdDate_(now, retentionMonths);

  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) {
    return { status: 'skipped', reason: 'no_data' };
  }

  const maxRowsToRead = lastRow - 1;
  const values = sourceSheet.getRange(2, 1, maxRowsToRead, sourceSheet.getLastColumn()).getValues();

  const groupedData = groupDataForArchive_(values, thresholdDate);

  if (groupedData.size === 0) {
    return { status: 'skipped', reason: 'no_target_data', thresholdDate: thresholdDate.toISOString() };
  }

  const sortedYearMonths = Array.from(groupedData.keys()).sort();
  const totalArchived = writeToArchiveSheets_(archiveSpreadsheet, groupedData, sortedYearMonths);

  // Purge
  sourceSheet.deleteRows(2, totalArchived);

  return {
    status: 'success',
    archivedRows: totalArchived,
    monthsArchived: sortedYearMonths,
    thresholdDate: thresholdDate.toISOString()
  };
}

function getArchiveThresholdDate_(dateInput, retentionMonths) {
  const jstTime = new Date(dateInput.getTime() + 9 * 60 * 60 * 1000);
  let year = jstTime.getUTCFullYear();
  let month = jstTime.getUTCMonth(); // 0-indexed

  month -= (retentionMonths - 1);

  while (month < 0) {
    month += 12;
    year -= 1;
  }

  // Return UTC Date that equals to year-month-01 00:00:00 JST
  return new Date(Date.UTC(year, month, 1, -9, 0, 0, 0));
}

function groupDataForArchive_(values, thresholdDate) {
  const grouped = new Map();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const timestamp = row[0];

    if (!timestamp) continue;

    let dateObj;
    if (Object.prototype.toString.call(timestamp) === '[object Date]') {
      dateObj = timestamp;
    } else {
      dateObj = new Date(timestamp);
    }

    if (isNaN(dateObj.getTime())) continue;

    if (dateObj.getTime() >= thresholdDate.getTime()) {
      break; // Since data is appended sequentially, we can stop early
    }

    let yearMonth = '';
    if (typeof formatYearMonthTokyo_ === 'function') {
      yearMonth = formatYearMonthTokyo_(dateObj);
    } else {
      const tokyoTime = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
      const year = tokyoTime.getUTCFullYear();
      const monthStr = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
      yearMonth = `${year}-${monthStr}`;
    }

    if (!grouped.has(yearMonth)) {
      grouped.set(yearMonth, []);
    }
    grouped.get(yearMonth).push(row);
  }

  return grouped;
}

if (typeof module !== 'undefined') {
  module.exports = {
    writeToArchiveSheets_,
    getArchiveSpreadsheets_,
    runDataArchive_,
    getArchiveThresholdDate_,
    groupDataForArchive_
  };
}
