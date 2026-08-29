#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = [
  fs.readFileSync(`${__dirname}/../gas/Router.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Config.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/ErrorLog.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Monitor.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Ingest.gs`, 'utf8')
].join('\n');

function createMockEnvironment(options = {}) {
  const propertiesStore = new Map([
    ['SPREADSHEET_ID', 'test-spreadsheet-id'],
    ['API_TOKEN', 'test-token'],
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

  const configValues = options.configValues || [];
  let lockAcquired = false;
  let lockReleased = false;

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
        },
        setNumberFormat() {},
        setValue(val) {
          if (dataRows[row - 1]) {
            dataRows[row - 1][col - 1] = val;
          }
        }
      };
    },
    appendRow(row) {
      dataRows.push(row);
    }
  };

  const spreadsheetMock = {
    getSheetByName(name) {
      if (name === 'DATA') return dataSheetMock;
      if (name === 'Config') {
        return {
          getDataRange() {
            return {
              getValues() {
                return configValues;
              }
            };
          }
        };
      }
      return null;
    }
  };

  const context = {
    console,
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
    CONFIG_KEYS: {
      spreadsheetId: 'SPREADSHEET_ID',
      apiToken: 'API_TOKEN',
      sheetName: 'SHEET_NAME'
    },
    LIMITS: {
      temp: { min: -40.0, max: 85.0 },
      press: { min: 300.0, max: 1100.0 },
      hum: { min: 0.0, max: 100.0 }
    },
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
          waitLock() {
            lockAcquired = true;
          },
          releaseLock() {
            lockReleased = true;
          }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(value) {
        return {
          getContent() { return value; },
          setMimeType() { return this; }
        };
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'gas/Monitor.gs + Ingest.gs' });

  return {
    context,
    propertiesStore,
    dataRows,
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

console.log('Running Watchdog tests...');

// ----------------------------------------------------
// Test 1: Recent data (within 3 days) -> No alert, lock acquired/released
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T00:00:00Z'), 25.0, 1010.0, 50.0, '']
    ]
  });

  // Current time: 1 hour after last data
  env.context.Date = fixedDate('2026-08-10T01:00:00Z');

  const result = env.context.checkWatchdog();
  assert.strictEqual(result.timeout, false, 'Should not timeout within 3 days');
  assert.strictEqual(result.notified, false, 'Should not notify within 3 days');
  assert.strictEqual(result.notification, null);
  assert.ok(!env.propertiesStore.get('WATCHDOG_NOTIFIED'), 'WATCHDOG_NOTIFIED should remain unset');

  const lockStatus = env.getLockStatus();
  assert.ok(lockStatus.lockAcquired, 'Lock should be acquired during checkWatchdog');
  assert.ok(lockStatus.lockReleased, 'Lock should be released during checkWatchdog');

  console.log('  ✓ Test 1: Recent data within timeout and locking passed');
}

// ----------------------------------------------------
// Test 2: Offline 3 days (4320 mins) -> Notifies once
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T00:00:00Z'), 25.0, 1010.0, 50.0, '']
    ]
  });

  // Current time: 3 days + 1 hour (4380 minutes) later
  env.context.Date = fixedDate('2026-08-13T01:00:00Z');

  const result = env.context.checkWatchdog();
  assert.strictEqual(result.timeout, true, 'Should timeout after 3 days');
  assert.strictEqual(result.notified, true, 'Should notify on first timeout');
  assert.ok(result.notification && result.notification.text.includes('センサー未受信'), 'Notification text check');
  assert.strictEqual(env.propertiesStore.get('WATCHDOG_NOTIFIED'), 'true', 'WATCHDOG_NOTIFIED should be set to true');

  console.log('  ✓ Test 2: Timeout trigger passed');
}

// ----------------------------------------------------
// Test 3: Continuous offline -> Suppresses notification (only notifies once)
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      WATCHDOG_NOTIFIED: 'true'
    },
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T00:00:00Z'), 25.0, 1010.0, 50.0, '']
    ]
  });

  // Current time: 4 days later
  env.context.Date = fixedDate('2026-08-14T00:00:00Z');

  const result = env.context.checkWatchdog();
  assert.strictEqual(result.timeout, true, 'Still in timeout state');
  assert.strictEqual(result.notified, false, 'Should not notify again while offline');
  assert.strictEqual(result.notification, null, 'Notification is null');
  assert.strictEqual(env.propertiesStore.get('WATCHDOG_NOTIFIED'), 'true');

  console.log('  ✓ Test 3: Notification suppression passed');
}

// ----------------------------------------------------
// Test 4: Normal ingestion does NOT reset monitor consecutive state
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-14T09:55:00Z'), 31.0, 1012.0, 55.0, '']
    ]
  });

  // Ingest reading 1: temp 31.0 (>30.0 threshold) -> consecutive 1, no alert yet
  env.context.Date = fixedDate('2026-08-14T10:00:00Z');
  env.context.handleSensorPost_({
    postData: {
      contents: JSON.stringify({
        api_version: 1,
        token: 'test-token',
        temp: 31.0,
        press: 1012.0,
        hum: 55.0
      })
    }
  });

  let monitorState = env.context.getMonitorStateForTest_();
  assert.strictEqual(monitorState.temp.consecutive, 1, 'Consecutive should be 1 after first high temp');
  assert.strictEqual(monitorState.temp.alert, false, 'Should not alert on K=1');

  // Ingest reading 2: temp 31.5 (>30.0 threshold) -> consecutive should reach 2 and alert!
  env.context.Date = fixedDate('2026-08-14T10:05:00Z');
  env.context.handleSensorPost_({
    postData: {
      contents: JSON.stringify({
        api_version: 1,
        token: 'test-token',
        temp: 31.5,
        press: 1012.0,
        hum: 55.0
      })
    }
  });

  monitorState = env.context.getMonitorStateForTest_();
  assert.strictEqual(monitorState.temp.consecutive, 2, 'Consecutive should advance to 2 across normal readings');
  assert.strictEqual(monitorState.temp.alert, true, 'Monitor should alert on K=2 without being cleared by watchdog reset');

  console.log('  ✓ Test 4: Normal ingestion preserves monitor consecutive count passed');
}

// ----------------------------------------------------
// Test 5: Recovery on new measurement after actual watchdog notification
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    initialProperties: {
      WATCHDOG_NOTIFIED: 'true',
      MONITOR_STATE_temp: JSON.stringify({ consecutive: 5, alert: true })
    },
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T00:00:00Z'), 25.0, 1010.0, 50.0, '']
    ]
  });

  env.context.Date = fixedDate('2026-08-14T10:00:00Z');

  // Simulate new incoming measurement via handleSensorPost_
  const postEvent = {
    postData: {
      contents: JSON.stringify({
        api_version: 1,
        token: 'test-token',
        temp: 24.0,
        press: 1012.0,
        hum: 55.0
      })
    }
  };

  const response = env.context.handleSensorPost_(postEvent);
  assert.strictEqual(env.dataRows.length, 3, 'New measurement row should be appended');
  assert.ok(!env.propertiesStore.get('WATCHDOG_NOTIFIED'), 'WATCHDOG_NOTIFIED should be reset');

  // Verify monitor states were reset to false on actual recovery
  const monitorState = env.context.getMonitorStateForTest_();
  assert.strictEqual(monitorState.temp.alert, false, 'Monitor alert state should be reset on actual recovery');

  // Now checkWatchdog again right after recovery
  const watchdogResult = env.context.checkWatchdog();
  assert.strictEqual(watchdogResult.timeout, false, 'Watchdog should not timeout after recovery');
  assert.strictEqual(watchdogResult.notified, false);

  console.log('  ✓ Test 5: Recovery reset on Ingest passed');
}

// ----------------------------------------------------
// Test 6: Re-offline after recovery -> Notifies again
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-14T10:00:00Z'), 24.0, 1012.0, 55.0, '']
    ]
  });

  // Current time: 3 days and 2 hours after the recovered measurement
  env.context.Date = fixedDate('2026-08-17T12:00:00Z');

  const result = env.context.checkWatchdog();
  assert.strictEqual(result.timeout, true, 'Timeout again');
  assert.strictEqual(result.notified, true, 'Should notify again after recovery');
  assert.strictEqual(env.propertiesStore.get('WATCHDOG_NOTIFIED'), 'true');

  console.log('  ✓ Test 6: Re-offline alert passed');
}

// ----------------------------------------------------
// Test 7: Custom WATCHDOG_TIMEOUT_MIN from Config sheet
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    configValues: [
      ['WATCHDOG_TIMEOUT_MIN'],
      ['60'] // 1 hour timeout
    ],
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag'],
      [new Date('2026-08-10T00:00:00Z'), 25.0, 1010.0, 50.0, '']
    ]
  });

  // Current time: 90 minutes later (exceeds 60 min custom threshold)
  env.context.Date = fixedDate('2026-08-10T01:30:00Z');

  const result = env.context.checkWatchdog();
  assert.strictEqual(result.timeout, true, 'Should respect custom Config timeout');
  assert.strictEqual(result.notified, true);

  console.log('  ✓ Test 7: Custom config threshold passed');
}

// ----------------------------------------------------
// Test 8: Empty / Header-only DATA sheet
// ----------------------------------------------------
{
  const env = createMockEnvironment({
    dataRows: [
      ['日時', 'temp', 'press', 'hum', 'flag']
    ]
  });

  env.context.Date = fixedDate('2026-08-10T01:30:00Z');
  const result = env.context.checkWatchdog();
  assert.strictEqual(result.timeout, false, 'No error on header-only sheet');
  assert.strictEqual(result.notified, false);

  console.log('  ✓ Test 8: Header-only DATA sheet handling passed');
}

console.log('\nAll Watchdog tests passed successfully!');
