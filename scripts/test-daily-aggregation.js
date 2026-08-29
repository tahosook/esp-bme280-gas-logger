#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = [
  fs.readFileSync(`${__dirname}/../gas/Config.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/ErrorLog.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/DailyAggregation.gs`, 'utf8')
].join('\n');

function createMockEnvironment(options = {}) {
  const propertiesStore = new Map([
    ['SPREADSHEET_ID', 'test-spreadsheet-id'],
    ['SHEET_NAME', 'DATA']
  ]);

  if (options.initialProperties) {
    for (const [k, v] of Object.entries(options.initialProperties)) {
      propertiesStore.set(k, String(v));
    }
  }

  const dataRows = options.dataRows || [
    ['日時', 'temp', 'press', 'hum', 'flag']
  ];

  const dailyRows = options.dailyRows || [
    ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count']
  ];

  const errorLogs = [];
  let lockAcquired = false;
  let lockReleased = false;
  let failDailyAppend = options.failDailyAppend || false;

  const dataSheetMock = {
    getLastRow() {
      return dataRows.length;
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const slice = [];
          for (let r = row - 1; r < row - 1 + numRows; r += 1) {
            if (dataRows[r]) {
              slice.push(dataRows[r].slice(col - 1, col - 1 + numCols));
            }
          }
          return slice;
        }
      };
    }
  };

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
    },
    appendRow(rowValues) {
      if (failDailyAppend) {
        throw new Error('Simulated daily sheet append failure');
      }
      dailyRows.push(rowValues);
    }
  };

  const spreadsheetMock = {
    getSheetByName(name) {
      if (name === 'DATA') return dataSheetMock;
      if (name === 'Daily') return dailySheetMock;
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
        return `${year}-${month}-${day}`;
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'gas/DailyAggregation.gs' });

  return {
    context,
    propertiesStore,
    dataRows,
    dailyRows,
    errorLogs,
    getLockStatus: () => ({ lockAcquired, lockReleased }),
    setFailDailyAppend: (fail) => { failDailyAppend = fail; }
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

console.log('Running DailyAggregation tests...');

// ----------------------------------------------------
// Test 1: Basic aggregation for previous days, excluding today
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      // 2026-08-10 (Day 1)
      [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, ''],
      [new Date('2026-08-10T05:00:00+09:00'), 27.0, 1012.0, 60.0, ''],
      // 2026-08-11 (Day 2) - includes 1 anomaly and 1 alert
      [new Date('2026-08-11T01:00:00+09:00'), 20.0, 1000.0, 40.0, ''],
      [new Date('2026-08-11T05:00:00+09:00'), 30.0, 1020.0, 80.0, 'alert'],
      [new Date('2026-08-11T09:00:00+09:00'), 99.0, 9999.0, 99.0, 'anomaly'], // should be excluded from stats
      // 2026-08-12 (Today) - must be excluded as unfinalized
      [new Date('2026-08-12T01:00:00+09:00'), 22.0, 1015.0, 55.0, '']
    ]
  });

  // Current time: 2026-08-12 10:00:00 Tokyo
  env.context.Date = fixedDate('2026-08-12T01:00:00Z'); // 10:00 JST

  const result = env.context.aggregateDaily();

  assert.strictEqual(result.appendedDays, 2, 'Two days should be appended');
  assert.strictEqual(env.dailyRows.length, 3, 'Daily sheet should have header + 2 rows');

  // Day 1 (2026-08-10)
  const day1 = env.dailyRows[1];
  assert.strictEqual(day1[0], '2026-08-10', 'Day 1 date');
  assert.strictEqual(day1[1], 26.0, 'Day 1 temp_avg (25+27)/2');
  assert.strictEqual(day1[2], 25.0, 'Day 1 temp_min');
  assert.strictEqual(day1[3], 27.0, 'Day 1 temp_max');
  assert.strictEqual(day1[4], 55.0, 'Day 1 hum_avg (50+60)/2');
  assert.strictEqual(day1[5], 50.0, 'Day 1 hum_min');
  assert.strictEqual(day1[6], 60.0, 'Day 1 hum_max');
  assert.strictEqual(day1[7], 1011.0, 'Day 1 press_avg (1010+1012)/2');
  assert.strictEqual(day1[8], 1010.0, 'Day 1 press_min');
  assert.strictEqual(day1[9], 1012.0, 'Day 1 press_max');
  assert.strictEqual(day1[10], 2, 'Day 1 sample_count');
  assert.strictEqual(day1[11], 0, 'Day 1 alert_count');

  // Day 2 (2026-08-11)
  const day2 = env.dailyRows[2];
  assert.strictEqual(day2[0], '2026-08-11', 'Day 2 date');
  assert.strictEqual(day2[1], 25.0, 'Day 2 temp_avg (20+30)/2 (anomaly excluded)');
  assert.strictEqual(day2[2], 20.0, 'Day 2 temp_min');
  assert.strictEqual(day2[3], 30.0, 'Day 2 temp_max');
  assert.strictEqual(day2[4], 60.0, 'Day 2 hum_avg (40+80)/2');
  assert.strictEqual(day2[5], 40.0, 'Day 2 hum_min');
  assert.strictEqual(day2[6], 80.0, 'Day 2 hum_max');
  assert.strictEqual(day2[7], 1010.0, 'Day 2 press_avg (1000+1020)/2');
  assert.strictEqual(day2[8], 1000.0, 'Day 2 press_min');
  assert.strictEqual(day2[9], 1020.0, 'Day 2 press_max');
  assert.strictEqual(day2[10], 2, 'Day 2 sample_count (anomaly excluded)');
  assert.strictEqual(day2[11], 1, 'Day 2 alert_count');

  // Pointer DAILY_LAST_ROW should be set to the last confirmed row (row 6: 2026-08-11 anomaly row)
  // row 1: header, row 2-3: day 1, row 4-6: day 2, row 7: day 3 (today)
  assert.strictEqual(env.propertiesStore.get('DAILY_LAST_ROW'), '6', 'DAILY_LAST_ROW should advance to row 6');

  const lockStatus = env.getLockStatus();
  assert.ok(lockStatus.lockAcquired, 'Lock should be acquired');
  assert.ok(lockStatus.lockReleased, 'Lock should be released');

  console.log('  ✓ Test 1: Basic aggregation passed');
}

// ----------------------------------------------------
// Test 2: Idempotency / No duplicate rows on re-execution
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      DAILY_LAST_ROW: '1' // force re-scan from row 2
    },
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, ''],
      [new Date('2026-08-11T01:00:00+09:00'), 22.0, 1015.0, 55.0, '']
    ],
    dailyRows: [
      ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
      ['2026-08-10', 25.0, 25.0, 25.0, 50.0, 50.0, 50.0, 1010.0, 1010.0, 1010.0, 1, 0] // 2026-08-10 already exists
    ]
  });

  env.context.Date = fixedDate('2026-08-12T01:00:00Z');

  const result = env.context.aggregateDaily();
  assert.strictEqual(result.appendedDays, 1, 'Only non-existing day (2026-08-11) should be appended');
  assert.strictEqual(env.dailyRows.length, 3, 'Daily sheet should have header + 2 unique days');
  assert.strictEqual(env.dailyRows[2][0], '2026-08-11', 'Appended date is 2026-08-11');
  assert.strictEqual(env.propertiesStore.get('DAILY_LAST_ROW'), '3', 'DAILY_LAST_ROW should advance to row 3');

  console.log('  ✓ Test 2: Duplicate prevention passed');
}

// ----------------------------------------------------
// Test 3: Invalid numerical values and missing fields do not crash
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T01:00:00+09:00'), 'invalid_temp', 1010.0, 50.0, ''], // invalid temp
      [new Date('2026-08-10T02:00:00+09:00'), 24.0, NaN, 50.0, ''], // NaN press
      [new Date('2026-08-10T03:00:00+09:00'), 26.0, 1012.0, 60.0, ''], // valid
      [new Date('2026-08-10T04:00:00+09:00'), 28.0, 1014.0, 70.0, '']  // valid
    ]
  });

  env.context.Date = fixedDate('2026-08-11T01:00:00Z');

  const result = env.context.aggregateDaily();
  assert.strictEqual(result.appendedDays, 1, '1 day should be appended');
  const day = env.dailyRows[1];
  assert.strictEqual(day[0], '2026-08-10');
  assert.strictEqual(day[1], 27.0, 'temp_avg (26+28)/2');
  assert.strictEqual(day[2], 26.0, 'temp_min');
  assert.strictEqual(day[3], 28.0, 'temp_max');
  assert.strictEqual(day[4], 65.0, 'hum_avg (60+70)/2');
  assert.strictEqual(day[5], 60.0, 'hum_min');
  assert.strictEqual(day[6], 70.0, 'hum_max');
  assert.strictEqual(day[7], 1013.0, 'press_avg (1012+1014)/2');
  assert.strictEqual(day[8], 1012.0, 'press_min');
  assert.strictEqual(day[9], 1014.0, 'press_max');
  assert.strictEqual(day[10], 2, 'sample_count is 2 valid rows');
  assert.strictEqual(day[11], 0, 'alert_count is 0');

  console.log('  ✓ Test 3: Invalid numbers handling passed');
}

// ----------------------------------------------------
// Test 4: Day with 0 valid samples is not added (no zero-padding)
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T01:00:00+09:00'), 99.0, 999.0, 99.0, 'anomaly'],
      [new Date('2026-08-10T02:00:00+09:00'), 'bad', 'bad', 'bad', '']
    ]
  });

  env.context.Date = fixedDate('2026-08-11T01:00:00Z');

  const result = env.context.aggregateDaily();
  assert.strictEqual(result.appendedDays, 0, '0 days should be appended');
  assert.strictEqual(env.dailyRows.length, 1, 'Daily sheet should only have header');
  assert.strictEqual(env.propertiesStore.get('DAILY_LAST_ROW'), '3', 'DAILY_LAST_ROW advances past confirmed date');

  console.log('  ✓ Test 4: No zero-padding for days with 0 valid samples passed');
}

// ----------------------------------------------------
// Test 5: Failure during append does not advance DAILY_LAST_ROW
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      DAILY_LAST_ROW: '1'
    },
    failDailyAppend: true,
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, '']
    ]
  });

  env.context.Date = fixedDate('2026-08-11T01:00:00Z');

  assert.throws(() => {
    env.context.aggregateDaily();
  }, /Simulated daily sheet append failure/);

  assert.strictEqual(env.propertiesStore.get('DAILY_LAST_ROW'), '1', 'DAILY_LAST_ROW must not advance on failure');
  const lockStatus = env.getLockStatus();
  assert.ok(lockStatus.lockReleased, 'Lock must be released even on error');

  console.log('  ✓ Test 5: Failure safety passed');
}

// ----------------------------------------------------
// Test 6: When no new rows exist (totalDataRows <= DAILY_LAST_ROW)
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      DAILY_LAST_ROW: '2'
    },
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, '']
    ]
  });

  env.context.Date = fixedDate('2026-08-11T01:00:00Z');

  const result = env.context.aggregateDaily();
  assert.strictEqual(result.appendedDays, 0);
  assert.strictEqual(result.lastProcessedRow, 2);
  assert.strictEqual(env.propertiesStore.get('DAILY_LAST_ROW'), '2');

  console.log('  ✓ Test 6: No new rows handling passed');
}

console.log('\nAll DailyAggregation tests passed successfully!');
