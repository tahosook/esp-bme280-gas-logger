/**
 * tests/helpers/mockGasEnvironment.js
 *
 * Google Apps Script (GAS) 実行環境の包括的モックファクトリ
 */

const crypto = require('crypto');

function createGasMockEnvironment(options = {}) {
  const propertiesStore = new Map([
    ['SPREADSHEET_ID', 'test-spreadsheet-id'],
    ['API_TOKEN', 'test-token'],
    ['SHEET_NAME', 'DATA']
  ]);

  if (options.initialProperties) {
    for (const [k, v] of Object.entries(options.initialProperties)) {
      if (v === null || v === undefined) {
        propertiesStore.delete(k);
      } else {
        propertiesStore.set(k, String(v));
      }
    }
  }

  const dataRows = options.dataRows ? [...options.dataRows] : [
    ['日時', 'temp', 'press', 'hum', 'flag']
  ];

  const dailyRows = options.dailyRows ? [...options.dailyRows] : [
    ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count']
  ];

  const monthlyRows = options.monthlyRows ? [...options.monthlyRows] : [
    ['年月', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'days_count']
  ];

  const configRows = options.configRows ? [...options.configRows] : [
    ['INGEST_LOCK_TIMEOUT_MS', 'WATCHDOG_TIMEOUT_MIN'],
    ['15000', '4320']
  ];

  const customSheets = options.customSheets || {};

  let lockAcquired = false;
  let lockReleased = false;
  let lockWaitCount = 0;
  let failDailyAppend = options.failDailyAppend || false;
  let failMonthlyAppend = options.failMonthlyAppend || false;
  const fetchedRequests = [];
  const logEntries = [];
  const errorLogs = [];
  const triggers = options.triggers ? [...options.triggers] : [];

  function createSheetMock(sheetName, rowsArray, failAppendFlag) {
    return {
      getName() {
        return sheetName;
      },
      getLastRow() {
        return rowsArray.length;
      },
      getRange(row, col, numRows = 1, numCols = 1) {
        return {
          getValues() {
            const slice = [];
            for (let r = row - 1; r < row - 1 + numRows; r += 1) {
              if (rowsArray[r]) {
                slice.push(rowsArray[r].slice(col - 1, col - 1 + numCols));
              } else {
                slice.push(new Array(numCols).fill(null));
              }
            }
            return slice;
          },
          setNumberFormat(format) {
            // noop or record
          },
          setValue(val) {
            if (rowsArray[row - 1]) {
              rowsArray[row - 1][col - 1] = val;
            }
          }
        };
      },
      appendRow(rowValues) {
        if (failAppendFlag && failAppendFlag()) {
          throw new Error(`Simulated append failure on ${sheetName}`);
        }
        rowsArray.push(rowValues);
      },
      getDataRange() {
        return {
          getValues() {
            return rowsArray;
          }
        };
      }
    };
  }

  const dataSheetMock = createSheetMock('DATA', dataRows);
  const dailySheetMock = createSheetMock('Daily', dailyRows, () => failDailyAppend);
  const monthlySheetMock = createSheetMock('Monthly', monthlyRows, () => failMonthlyAppend);
  const configSheetMock = createSheetMock('Config', configRows);

  const spreadsheetMock = {
    getSheetByName(name) {
      if (customSheets && Object.prototype.hasOwnProperty.call(customSheets, name)) {
        return customSheets[name];
      }
      if (name === 'DATA') return dataSheetMock;
      if (name === 'Daily') return dailySheetMock;
      if (name === 'Monthly') return monthlySheetMock;
      if (name === 'Config') return configSheetMock;
      return null;
    },
    getActiveSheet() {
      return dataSheetMock;
    }
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        store: propertiesStore,
        getProperties() {
          return Object.fromEntries(propertiesStore);
        },
        getProperty(key) {
          return propertiesStore.has(key) ? propertiesStore.get(key) : null;
        },
        setProperty(key, value) {
          propertiesStore.set(key, String(value));
        },
        deleteProperty(key) {
          propertiesStore.delete(key);
        }
      };
    }
  };

  const SpreadsheetApp = {
    openById(id) {
      if (id !== propertiesStore.get('SPREADSHEET_ID')) {
        throw new Error('Spreadsheet not found: ' + id);
      }
      return spreadsheetMock;
    }
  };

  const LockService = {
    getScriptLock() {
      return {
        waitLock(ms) {
          lockAcquired = true;
          lockWaitCount += 1;
          return true;
        },
        releaseLock() {
          lockReleased = true;
          return true;
        }
      };
    }
  };

  const UrlFetchApp = {
    fetch(url, options = {}) {
      fetchedRequests.push({ url, options });
      return {
        getResponseCode() {
          return options.mockResponseCode || 200;
        },
        getContentText() {
          return options.mockResponseText || JSON.stringify({ ok: true });
        }
      };
    }
  };

  const Utilities = {
    computeHmacSha256Signature(body, secret) {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(body, 'utf8');
      return Array.from(hmac.digest());
    },
    base64Encode(bytes) {
      return Buffer.from(bytes).toString('base64');
    },
    formatDate(date, tz, format) {
      const d = new Date(date);
      const tokyoTime = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      const year = tokyoTime.getUTCFullYear();
      const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(tokyoTime.getUTCDate()).padStart(2, '0');
      const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
      const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
      const seconds = String(tokyoTime.getUTCSeconds()).padStart(2, '0');

      if (format === 'yyyy-MM') return `${year}-${month}`;
      if (format === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
      if (format === 'yyyy-MM-dd HH:mm:ss') return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      if (format === 'MM/dd HH:mm') return `${month}/${day} ${hours}:${minutes}`;
      return `${year}-${month}-${day}`;
    }
  };

  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(value) {
      return {
        content: value,
        getContent() {
          return this.content;
        },
        setMimeType(mime) {
          this.mime = mime;
          return this;
        }
      };
    }
  };

  const Logger = {
    log(msg) {
      logEntries.push(msg);
    }
  };

  const ScriptApp = {
    getProjectTriggers() {
      return triggers.map(t => ({
        getHandlerFunction: () => t.handlerFunction
      }));
    },
    newTrigger(fnName) {
      const triggerObj = { handlerFunction: fnName };
      return {
        timeBased() { return this; },
        onMonthDay(day) { return this; },
        atHour(hour) { return this; },
        nearMinute(min) { return this; },
        everyDays(days) { return this; },
        everyHours(hours) { return this; },
        inTimezone(tz) { return this; },
        create() {
          triggers.push(triggerObj);
          return triggerObj;
        }
      };
    }
  };

  return {
    propertiesStore,
    dataRows,
    dailyRows,
    monthlyRows,
    configRows,
    fetchedRequests,
    logEntries,
    errorLogs,
    triggers,
    getLockStatus: () => ({ lockAcquired, lockReleased, lockWaitCount }),
    setFailDailyAppend: (fail) => { failDailyAppend = fail; },
    setFailMonthlyAppend: (fail) => { failMonthlyAppend = fail; },
    globals: {
      PropertiesService,
      SpreadsheetApp,
      LockService,
      UrlFetchApp,
      Utilities,
      ContentService,
      Logger,
      ScriptApp
    }
  };
}

const NativeDate = global.Date;

function fixedDate(isoString) {
  const base = new NativeDate(isoString);
  class CustomDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) {
        super(base.getTime());
      } else {
        super(...args);
      }
    }
    static now() {
      return base.getTime();
    }
  }
  return CustomDate;
}

module.exports = {
  createGasMockEnvironment,
  fixedDate
};
