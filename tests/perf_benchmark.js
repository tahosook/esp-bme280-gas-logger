// Read baseline BEFORE code changes from a mock. Since we already replaced it, we will simulate the old code for the baseline.
let flushCount = 0;
let hasPendingWrites = false;

function resetStats() {
  flushCount = 0;
  hasPendingWrites = false;
}

function mockRead() {
  if (hasPendingWrites) {
    flushCount++;
    hasPendingWrites = false;
  }
}

function mockWrite() {
  hasPendingWrites = true;
}

const mockTargetSheet = {
  getLastRow: () => {
    mockRead();
    return 1;
  },
  getMaxRows: () => {
    mockRead();
    return 1000;
  },
  insertRowsAfter: () => {
    mockWrite();
  },
  getRange: (r, c, numRows) => ({
    setValues: () => {
      mockWrite();
    },
    getValues: () => {
      mockRead();
      return Array(numRows).fill([1]);
    }
  }),
  appendRow: () => {
    mockWrite();
  }
};

const mockArchiveSpreadsheet = {
  getSheetByName: () => { mockRead(); return mockTargetSheet; },
  insertSheet: () => { mockWrite(); return mockTargetSheet; }
};

function writeToArchiveSheets_Old(archiveSpreadsheet, groupedData, sortedYearMonths) {
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
    if (typeof targetSheet.getMaxRows === 'function' && typeof targetSheet.insertRowsAfter === 'function') {
      const currentMax = targetSheet.getMaxRows();
      const requiredRows = startRow + rows.length - 1;
      if (currentMax < requiredRows) {
        targetSheet.insertRowsAfter(currentMax, requiredRows - currentMax);
      }
    }
    targetSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    // Verify
    const verifyRange = targetSheet.getRange(startRow, 1, rows.length, 1).getValues();
    if (verifyRange.length !== rows.length) {
      throw new Error(`Verification failed for ${yearMonth}. Expected ${rows.length} rows, got ${verifyRange.length}`);
    }

    totalArchived += rows.length;
  }

  return totalArchived;
}

const { writeToArchiveSheets_ } = require('../gas/DataArchive.gs');

const groupedData = new Map();
const sortedYearMonths = [];
for (let i = 0; i < 12; i++) {
  const month = `2026-${String(i+1).padStart(2, '0')}`;
  groupedData.set(month, Array(100).fill(['2026-05-01', 20, 1010, 50, '']));
  sortedYearMonths.push(month);
}

resetStats();
writeToArchiveSheets_Old(mockArchiveSpreadsheet, groupedData, sortedYearMonths);
console.log(`Baseline Flush Count: ${flushCount}`);

resetStats();
writeToArchiveSheets_(mockArchiveSpreadsheet, groupedData, sortedYearMonths);
console.log(`Optimized Flush Count: ${flushCount}`);
