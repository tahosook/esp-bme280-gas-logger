#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(
  `${__dirname}/../gas/Code.gs`,
  'utf8'
);

const properties = new Map([
  ['SPREADSHEET_ID', 'test-spreadsheet'],
  ['API_TOKEN', 'test-token'],
  ['SHEET_NAME', 'Measurements']
]);
const rows = [];
const sheet = {
  appendRow(row) {
    rows.push(row);
  }
};

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
          return name === 'Measurements' ? sheet : null;
        }
      };
    }
  },
  Utilities: {
    formatDate() {
      return '2026-08-10 01:42:09';
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
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'gas/Code.gs' });

function responseBody(response) {
  return JSON.parse(response.getContent());
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: got ${JSON.stringify(actual)}`);
}

assertDeepEqual(responseBody(context.doGet()),
  { ok: true, ready: true }, 'ready response');

const validRequest = {
  postData: {
    contents: JSON.stringify({
      api_version: 1,
      token: 'test-token',
      temp: 24.5,
      press: 1012.3,
      hum: 55.8,
      ignored: 'extra field'
    })
  }
};
assertDeepEqual(responseBody(context.doPost(validRequest)),
  { ok: true }, 'valid response');
assertDeepEqual(rows[0], ['2026-08-10 01:42:09', 24.5, 1012.3, 55.8],
  'saved row');
assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rows[0][0]),
  'timestamp format');

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
  assertDeepEqual(responseBody(context.doPost(request)),
    { ok: false, error }, `${name} response`);
}
assert(rows.length === rowCount, 'invalid requests must not append rows');

properties.delete('API_TOKEN');
assertDeepEqual(responseBody(context.doGet()),
  { ok: false, ready: false, error: 'not_ready' }, 'not-ready response');

console.log('GAS API tests passed');
