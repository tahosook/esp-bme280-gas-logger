#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = [
  fs.readFileSync(`${__dirname}/../gas/Config.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/ErrorLog.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/DailyAggregation.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/MonthlyAggregation.gs`, 'utf8')
].join('\n');

function createMockEnvironment(options = {}) {
  const propertiesStore = new Map([
    ['SPREADSHEET_ID', 'test-spreadsheet-id']
  ]);

  if (options.initialProperties) {
    for (const [k, v] of Object.entries(options.initialProperties)) {
      propertiesStore.set(k, String(v));
    }
  }

  const dailyRows = options.dailyRows || [
    ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count']
  ];

  const monthlyRows = options.monthlyRows || [
    ['年月', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'days_count']
  ];

  const errorLogs = [];
  let lockAcquired = false;
  let lockReleased = false;
  let failMonthlyAppend = options.failMonthlyAppend || false;

  const dailySheetMock = {
    getLastRow() {
      return dailyRows.length;
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const slice = [];
          for (let r = row - 1; r < row - 1 + numRows; r += 1) {
            if (dailyRows[r]) {
              slice.push(dailyRows[r].slice(col - 1, col - 1 + numCols));
            }
          }
          return slice;
        }
      };
    }
  };

  const monthlySheetMock = {
    getLastRow() {
      return monthlyRows.length;
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const slice = [];
          for (let r = row - 1; r < row - 1 + numRows; r += 1) {
            if (monthlyRows[r]) {
              slice.push(monthlyRows[r].slice(col - 1, col - 1 + numCols));
            }
          }
          return slice;
        }
      };
    },
    appendRow(rowValues) {
      if (failMonthlyAppend) {
        throw new Error('Simulated monthly sheet append failure');
      }
      monthlyRows.push(rowValues);
    }
  };

  const spreadsheetMock = {
    getSheetByName(name) {
      if (name === 'Daily') return dailySheetMock;
      if (name === 'Monthly') return monthlySheetMock;
      if (name === 'Config') {
        return {
          getDataRange() {
            return {
              getValues() {
                return [['INGEST_LOCK_TIMEOUT_MS'], ['15000']];
              }
            };
          }
        };
      }
      return null;
    }
  };

  const context = {
    console: {
      log: console.log,
      error(...args) {
        errorLogs.push(args);
      },
      warn: console.warn
    },
    isFinite,
    isNaN,
    parseInt,
    Number,
    Math,
    Date,
    Array,
    Object,
    Set,
    Map,
    String,
    Error,
    JSON,
    PropertiesService: {
      getScriptProperties() {
        return {
          store: propertiesStore,
          getProperties() {
            return Object.fromEntries(propertiesStore);
          },
          getProperty(key) {
            return propertiesStore.get(key) || null;
          },
          setProperty(key, value) {
            propertiesStore.set(key, String(value));
          },
          deleteProperty(key) {
            propertiesStore.delete(key);
          }
        };
      }
    },
    SpreadsheetApp: {
      openById(id) {
        if (id !== 'test-spreadsheet-id') {
          throw new Error('Spreadsheet not found: ' + id);
        }
        return spreadsheetMock;
      }
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock(ms) {
            lockAcquired = true;
          },
          releaseLock() {
            lockReleased = true;
          }
        };
      }
    },
    Utilities: {
      formatDate(date, tz, format) {
        const d = new Date(date);
        const tokyoTime = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const year = tokyoTime.getUTCFullYear();
        const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(tokyoTime.getUTCDate()).padStart(2, '0');
        if (format === 'yyyy-MM') {
          return `${year}-${month}`;
        }
        return `${year}-${month}-${day}`;
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'gas/MonthlyAggregation.gs' });

  return {
    context,
    propertiesStore,
    dailyRows,
    monthlyRows,
    errorLogs,
    getLockStatus: () => ({ lockAcquired, lockReleased })
  };
}

function fixedDate(isoString) {
  const base = new Date(isoString);
  return class extends Date {
    constructor(...args) {
      if (args.length === 0) {
        return new Date(base.getTime());
      }
      return new Date(...args);
    }
    static now() {
      return base.getTime();
    }
  };
}

console.log('Running MonthlyAggregation tests...');

// ----------------------------------------------------
// Test 1: Basic monthly aggregation for previous months, excluding current month
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dailyRows: [
      ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
      // 2026-06 (2 days)
      ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0],
      ['2026-06-20', 24.0, 20.0, 28.0, 60.0, 50.0, 70.0, 1012.0, 1010.0, 1014.0, 288, 1],
      // 2026-07 (3 days)
      ['2026-07-01', 25.0, 22.0, 28.0, 65.0, 55.0, 75.0, 1008.0, 1005.0, 1010.0, 285, 0],
      ['2026-07-15', 30.0, 26.0, 34.0, 70.0, 60.0, 80.0, 1005.0, 1000.0, 1009.0, 288, 2],
      ['2026-07-31', 29.0, 24.0, 32.0, 69.0, 58.0, 78.0, 1007.0, 1002.0, 1011.0, 286, 0],
      // 2026-08 (Current month - must be excluded as unfinalized)
      ['2026-08-01', 28.0, 23.0, 31.0, 62.0, 52.0, 72.0, 1010.0, 1006.0, 1013.0, 288, 0]
    ]
  });

  // Current time: 2026-08-10
  env.context.Date = fixedDate('2026-08-10T01:00:00Z');

  const result = env.context.aggregateMonthly();
  assert.strictEqual(result.appendedMonths, 2, 'Two months should be appended');
  assert.strictEqual(env.monthlyRows.length, 3, 'Monthly sheet should have header + 2 rows');

  // Month 1: 2026-06
  const month1 = env.monthlyRows[1];
  assert.strictEqual(month1[0], '2026-06', 'Month 1 yearMonth');
  assert.strictEqual(month1[1], 22.0, 'Month 1 temp_avg (20+24)/2');
  assert.strictEqual(month1[2], 18.0, 'Month 1 temp_min min(18, 20)');
  assert.strictEqual(month1[3], 28.0, 'Month 1 temp_max max(22, 28)');
  assert.strictEqual(month1[4], 55.0, 'Month 1 hum_avg (50+60)/2');
  assert.strictEqual(month1[5], 45.0, 'Month 1 hum_min min(45, 50)');
  assert.strictEqual(month1[6], 70.0, 'Month 1 hum_max max(55, 70)');
  assert.strictEqual(month1[7], 1011.0, 'Month 1 press_avg (1010+1012)/2');
  assert.strictEqual(month1[8], 1008.0, 'Month 1 press_min min(1008, 1010)');
  assert.strictEqual(month1[9], 1014.0, 'Month 1 press_max max(1012, 1014)');
  assert.strictEqual(month1[10], 2, 'Month 1 days_count');

  // Month 2: 2026-07
  const month2 = env.monthlyRows[2];
  assert.strictEqual(month2[0], '2026-07', 'Month 2 yearMonth');
  assert.strictEqual(month2[1], 28.0, 'Month 2 temp_avg (25+30+29)/3');
  assert.strictEqual(month2[2], 22.0, 'Month 2 temp_min min(22, 26, 24)');
  assert.strictEqual(month2[3], 34.0, 'Month 2 temp_max max(28, 34, 32)');
  assert.strictEqual(month2[4], 68.0, 'Month 2 hum_avg (65+70+69)/3');
  assert.strictEqual(month2[5], 55.0, 'Month 2 hum_min min(55, 60, 58)');
  assert.strictEqual(month2[6], 80.0, 'Month 2 hum_max max(75, 80, 78)');
  assert.strictEqual(month2[7], 1006.67, 'Month 2 press_avg (1008+1005+1007)/3 rounded to 2 decimals');
  assert.strictEqual(month2[8], 1000.0, 'Month 2 press_min min(1005, 1000, 1002)');
  assert.strictEqual(month2[9], 1011.0, 'Month 2 press_max max(1010, 1009, 1011)');
  assert.strictEqual(month2[10], 3, 'Month 2 days_count');

  // Pointer MONTHLY_LAST_ROW should advance to row 6 (last row of 2026-07)
  // row 1: header, row 2-3: June, row 4-6: July, row 7: August
  assert.strictEqual(env.propertiesStore.get('MONTHLY_LAST_ROW'), '6', 'MONTHLY_LAST_ROW should advance to row 6');

  const lockStatus = env.getLockStatus();
  assert.ok(lockStatus.lockAcquired, 'Lock should be acquired');
  assert.ok(lockStatus.lockReleased, 'Lock should be released');

  console.log('  ✓ Test 1: Basic monthly aggregation passed');
}

// ----------------------------------------------------
// Test 2: Idempotency / No duplicate months on re-execution
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      MONTHLY_LAST_ROW: '1'
    },
    dailyRows: [
      ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
      ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0],
      ['2026-07-01', 25.0, 22.0, 28.0, 65.0, 55.0, 75.0, 1008.0, 1005.0, 1010.0, 285, 0]
    ],
    monthlyRows: [
      ['年月', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'days_count'],
      ['2026-06', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 1] // 2026-06 already exists
    ]
  });

  env.context.Date = fixedDate('2026-08-01T01:00:00Z');

  const result = env.context.aggregateMonthly();
  assert.strictEqual(result.appendedMonths, 1, 'Only 2026-07 should be appended');
  assert.strictEqual(env.monthlyRows.length, 3);
  assert.strictEqual(env.monthlyRows[2][0], '2026-07');
  assert.strictEqual(env.propertiesStore.get('MONTHLY_LAST_ROW'), '3');

  console.log('  ✓ Test 2: Duplicate prevention passed');
}

// ----------------------------------------------------
// Test 3: Invalid numerical values handling
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dailyRows: [
      ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
      ['2026-06-10', 'invalid', 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0], // bad row
      ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0], // valid row
      ['2026-06-20', 24.0, 20.0, 28.0, 60.0, 50.0, 70.0, 1012.0, 1010.0, 1014.0, 288, 0]  // valid row
    ]
  });

  env.context.Date = fixedDate('2026-07-01T01:00:00Z');

  const result = env.context.aggregateMonthly();
  assert.strictEqual(result.appendedMonths, 1);
  const m = env.monthlyRows[1];
  assert.strictEqual(m[0], '2026-06');
  assert.strictEqual(m[1], 22.0, 'temp_avg (20+24)/2');
  assert.strictEqual(m[10], 2, 'days_count is 2 valid days');

  console.log('  ✓ Test 3: Invalid numbers handling passed');
}

// ----------------------------------------------------
// Test 4: Failure during append does not advance MONTHLY_LAST_ROW
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      MONTHLY_LAST_ROW: '1'
    },
    failMonthlyAppend: true,
    dailyRows: [
      ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
      ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0]
    ]
  });

  env.context.Date = fixedDate('2026-07-01T01:00:00Z');

  assert.throws(() => {
    env.context.aggregateMonthly();
  }, /Simulated monthly sheet append failure/);

  assert.strictEqual(env.propertiesStore.get('MONTHLY_LAST_ROW'), '1', 'MONTHLY_LAST_ROW must not advance on failure');
  const lockStatus = env.getLockStatus();
  assert.ok(lockStatus.lockReleased, 'Lock must be released on error');

  console.log('  ✓ Test 4: Failure safety passed');
}

// ----------------------------------------------------
// Test 5: When no new rows exist (totalDailyRows <= MONTHLY_LAST_ROW)
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      MONTHLY_LAST_ROW: '2'
    },
    dailyRows: [
      ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
      ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0]
    ]
  });

  env.context.Date = fixedDate('2026-07-01T01:00:00Z');

  const result = env.context.aggregateMonthly();
  assert.strictEqual(result.appendedMonths, 0);
  assert.strictEqual(result.lastProcessedRow, 2);

  console.log('  ✓ Test 5: No new rows handling passed');
}

console.log('\nAll MonthlyAggregation tests passed successfully!');
