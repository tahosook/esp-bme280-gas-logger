#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = [
  fs.readFileSync(`${__dirname}/../gas/Code.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Router.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Ingest.gs`, 'utf8')
].join('\n');

const properties = new Map([
  ['SPREADSHEET_ID', 'test-spreadsheet'],
  ['API_TOKEN', 'test-token'],
  ['SHEET_NAME', 'DATA']
]);
const rows = [];
const numberFormats = [];
const sheet = {
  appendRow(row) {
    rows.push(row);
  },
  getLastRow() {
    return rows.length;
  },
  getRange() {
    return {
      getValues() {
        const row = rows[rows.length - 1] || [null, null, null, null, null];
        return [row];
      },
      setNumberFormat(format) {
        numberFormats.push(format);
      }
    };
  }
};

function createMockDate(fixedTime) {
  const base = new Date(fixedTime);
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

const context = {
  console,
  isFinite,
  JSON,
  Date,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) {
          return properties.get(key) || null;
        }
      };
    }
  },
  SpreadsheetApp: {
    openById(id) {
      if (id !== 'test-spreadsheet') {
        throw new Error('unexpected spreadsheet id');
      }
      return {
        getSheetByName(name) {
          return name === 'DATA' ? sheet : null;
        }
      };
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(value) {
      return {
        getContent() {
          return value;
        },
        setMimeType() {
          return this;
        }
      };
    }
  },
  LockService: {
    getScriptLock() {
      return {
        waitLock(ms) {},
        releaseLock() {}
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'gas/*.gs' });

function responseBody(response) {
  return JSON.parse(response.getContent());
}

assert.deepStrictEqual(responseBody(context.doGet()),
  { ok: true, ready: true }, 'ready response');

context.Date = createMockDate('2026-08-10T01:42:09Z');

const validRequest = {
  postData: {
    contents: JSON.stringify({
      api_version: 1,
      token: 'test-token',
      temp: 24.56,
      press: 1012.34,
      hum: 55.87
    })
  }
};

assert.deepStrictEqual(responseBody(context.doPost(validRequest)),
  { ok: true }, 'valid response');
assert.deepStrictEqual(rows[0].length, 5, 'saved row has 5 columns');
assert.deepStrictEqual(rows[0][4], '', 'flag is empty');
assert.deepStrictEqual(numberFormats[0], 'yyyy-MM-dd HH:mm:ss', 'timestamp format');
assert(rows[0][0] instanceof Date, 'timestamp is Date');

const duplicateRequest = {
  postData: {
    contents: JSON.stringify({
      api_version: 1,
      token: 'test-token',
      temp: 24.56,
      press: 1012.34,
      hum: 55.87
    })
  }
};
assert.deepStrictEqual(responseBody(context.doPost(duplicateRequest)),
  { ok: true }, 'duplicate response');
assert.deepStrictEqual(rows.length, 1, 'duplicate request does not append row');

const rowCount = rows.length;
const cases = [
  ['invalid JSON', { postData: { contents: '{' } }, 'invalid_json'],
  ['missing request', null, 'invalid_json'],
  ['invalid API version', {
    postData: { contents: JSON.stringify({ ...validRequestPayload(), api_version: 2 }) }
  }, 'invalid_api_version'],
  ['invalid token', {
    postData: { contents: JSON.stringify({ ...validRequestPayload(), token: 'wrong-token' }) }
  }, 'invalid_token'],
  ['out of range', {
    postData: { contents: JSON.stringify({ ...validRequestPayload(), hum: 100.1 }) }
  }, 'invalid_payload'],
  ['wrong type', {
    postData: { contents: JSON.stringify({ ...validRequestPayload(), temp: '24.5' }) }
  }, 'invalid_payload'],
  ['non-finite JSON token', {
    postData: { contents: '{"api_version":1,"token":"test-token","temp":NaN,"press":1012.3,"hum":55.8}' }
  }, 'invalid_json']
];

function validRequestPayload() {
  return { api_version: 1, token: 'test-token', temp: 24.5, press: 1012.3, hum: 55.8 };
}

for (const [name, request, error] of cases) {
  assert.deepStrictEqual(responseBody(context.doPost(request)),
    { ok: false, error }, `${name} response`);
}
assert.deepStrictEqual(rows.length, rowCount, 'invalid requests must not append rows');

context.Date = createMockDate('2026-08-10T03:42:10Z');
assert.deepStrictEqual(responseBody(context.doPost(validRequest)),
  { ok: true }, 'non-duplicate response after timeout');
assert.deepStrictEqual(rows.length, 2, 'new row appended after duplication timeout');

properties.delete('API_TOKEN');
assert.deepStrictEqual(responseBody(context.doGet()),
  { ok: false, ready: false, error: 'not_ready' }, 'not-ready response');

console.log('GAS API tests passed');
