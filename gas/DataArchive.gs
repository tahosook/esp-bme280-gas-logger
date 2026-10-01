/**
 * 生データアーカイブ処理を手動または個別トリガーで実行する公開エントリポイント。
 * GAS エディタの関数一覧から直接実行可能です。
 * @return {Object} アーカイブ結果オブジェクト
 */
function archiveOldData() {
  return runDataArchive_();
}

function writeToArchiveSheets_(archiveSpreadsheet, groupedData, sortedYearMonths) {
  const sheetsToProcess = sortedYearMonths.map(yearMonth => {
    const targetSheetName = 'Raw_' + yearMonth.replace('-', '');
    const targetSheet = archiveSpreadsheet.getSheetByName(targetSheetName);
    return {
      yearMonth,
      rows: groupedData.get(yearMonth),
      targetSheetName,
      targetSheet,
      isNewSheet: !targetSheet,
      startRow: targetSheet ? targetSheet.getLastRow() + 1 : 2,
      currentMax: (targetSheet && typeof targetSheet.getMaxRows === 'function') ? targetSheet.getMaxRows() : 1000
    };
  });

  // Phase 2: Writes
  for (const op of sheetsToProcess) {
    if (op.isNewSheet) {
      op.targetSheet = archiveSpreadsheet.insertSheet(op.targetSheetName);
      op.targetSheet.appendRow(['timestamp', 'temp', 'press', 'hum', 'flag']);
      op.currentMax = (typeof op.targetSheet.getMaxRows === 'function') ? op.targetSheet.getMaxRows() : 1000;
    }

    const requiredRows = op.startRow + op.rows.length - 1;
    if (typeof op.targetSheet.insertRowsAfter === 'function' && op.currentMax < requiredRows) {
      op.targetSheet.insertRowsAfter(op.currentMax, requiredRows - op.currentMax);
    }
    op.targetSheet.getRange(op.startRow, 1, op.rows.length, op.rows[0].length).setValues(op.rows);
  }

  // Phase 3: Verifies (Reads)
  let totalArchived = 0;
  for (const op of sheetsToProcess) {
    const verifyRange = op.targetSheet.getRange(op.startRow, 1, op.rows.length, 1).getValues();
    if (verifyRange.length !== op.rows.length) {
      const error = new Error(`Verification failed for ${op.yearMonth}. Expected ${op.rows.length} rows, got ${verifyRange.length}`);
      if (typeof logError_ === 'function') {
        logError_('data_archive', op.targetSheetName, 'verify_failed', error);
      }
      throw error;
    }
    totalArchived += op.rows.length;
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

function updateDailyLastRowAfterPurge_(properties, totalArchived) {
  if (!properties || typeof totalArchived !== 'number' || totalArchived <= 0) {
    return;
  }
  const dailyLastRowKey = (typeof DAILY_AGGREGATION_PROPERTIES !== 'undefined' && DAILY_AGGREGATION_PROPERTIES.lastRow) || 'DAILY_LAST_ROW';
  const currentDailyLastRowStr = properties.getProperty(dailyLastRowKey);
  if (!currentDailyLastRowStr) {
    return;
  }
  const currentDailyLastRow = parseInt(currentDailyLastRowStr, 10);
  if (!isNaN(currentDailyLastRow)) {
    const updatedRow = Math.max(1, currentDailyLastRow - totalArchived);
    properties.setProperty(dailyLastRowKey, String(updatedRow));
  }
}

function runDataArchive_() {
  const properties = PropertiesService.getScriptProperties();
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : { ARCHIVE_RETENTION_MONTHS: 2 };
  const timeoutMs = (typeof config.INGEST_LOCK_TIMEOUT_MS === 'number') ? config.INGEST_LOCK_TIMEOUT_MS : 15000;

  const lock = LockService.getScriptLock();
  const hasLockAlready = typeof lock.hasLock === 'function' ? lock.hasLock() : false;
  if (!hasLockAlready) {
    lock.waitLock(timeoutMs);
  }

  try {
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

    // Purge: groupDataForArchive_ により RawData の先頭（Row 2）から連続する
    // 古いデータ行（prefix）のみがアーカイブ対象として抽出されていることが保証されているため、
    // deleteRows(2, totalArchived) により新しいデータを誤って巻き込むことなく安全にパージ可能。
    if (totalArchived > 0) {
      sourceSheet.deleteRows(2, totalArchived);
      updateDailyLastRowAfterPurge_(properties, totalArchived);
    }

    return {
      status: 'success',
      archivedRows: totalArchived,
      monthsArchived: sortedYearMonths,
      thresholdDate: thresholdDate.toISOString()
    };
  } finally {
    if (!hasLockAlready) {
      lock.releaseLock();
    }
  }
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

/**
 * RawData シートの先頭（Row 2）から走査し、
 * 閾値日時（thresholdDate）より前の「連続した古いデータ区間（prefix）」のみを月別にグループ化します。
 *
 * 【設計上の不変条件と deleteRows(2, totalArchived) が安全な理由】
 * 1. RawData は Ingest.gs において GAS サーバー時刻（now = new Date()）を LockService 排他制御下で
 *    appendRow するため、設計上「時系列昇順かつ追記専用（chronological append-only）」です。
 * 2. 本関数は先頭（Row 2 = values[0]）から 1 行ずつ走査し、以下のいずれかで即時 break（走査中断）します:
 *    - タイムスタンプの欠損または無効値（先頭からの連続性が保証できないため安全終了）
 *    - 時系列の逆転（万一データ順序が崩れていた場合、新しいデータ以降を巻き込まないよう安全終了）
 *    - 閾値日時に到達（最新データ側に到達したため終了）
 * 3. したがって、抽出される全行数（totalArchived）は「Row 2 から連続して存在する厳密に totalArchived 行」
 *    と完全に一致し、後続の deleteRows(2, totalArchived) で新しいデータが削除されるリスクは構造上排除されます。
 */
function groupDataForArchive_(values, thresholdDate) {
  const grouped = new Map();
  let previousTimestampMs = -Infinity;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const timestamp = row[0];

    // 1. タイムスタンプ欠損ガード: 連続性が保証できないため走査を終了
    if (!timestamp) {
      break;
    }

    let dateObj;
    if (Object.prototype.toString.call(timestamp) === '[object Date]') {
      dateObj = timestamp;
    } else {
      dateObj = new Date(timestamp);
    }

    const timeMs = dateObj.getTime();

    // 2. 不正日付ガード: タイムスタンプが無効な場合は走査を終了
    if (isNaN(timeMs)) {
      break;
    }

    // 3. 時系列逆転ガード: 万一データ順序が崩れている場合、新しいデータを巻き込まないよう安全終了
    if (timeMs < previousTimestampMs) {
      break;
    }
    previousTimestampMs = timeMs;

    // 4. 閾値到達ガード: 保持期間内のデータに達した時点で走査を終了
    if (timeMs >= thresholdDate.getTime()) {
      break;
    }

    let yearMonth = '';
    if (typeof formatYearMonthTokyo_ === 'function') {
      yearMonth = formatYearMonthTokyo_(dateObj);
    } else {
      const tokyoTime = new Date(timeMs + 9 * 60 * 60 * 1000);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    archiveOldData,
    updateDailyLastRowAfterPurge_,
    writeToArchiveSheets_,
    getArchiveSpreadsheets_,
    runDataArchive_,
    getArchiveThresholdDate_,
    groupDataForArchive_
  };
}
