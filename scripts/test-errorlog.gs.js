#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(`${__dirname}/../gas/ErrorLog.gs`, 'utf8');

const propertiesStore = new Map();

const context = {
  console,
  JSON,
  RegExp,
  PropertiesService: {
    getScriptProperties() {
      return {
        store: propertiesStore,
        getProperty(key) {
          return this.store.get(key) || null;
        },
        setProperty(key, value) {
          this.store.set(key, value);
        },
        deleteProperty(key) {
          this.store.delete(key);
        }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'gas/ErrorLog.gs' });

function responseBody(response) {
  return JSON.parse(response.getContent());
}

context.clearErrorLog_();
assert.deepStrictEqual(context.getErrorLogForTest_(), [], 'empty log initially');

context.logError_('ingest', 'DATA', 'invalid_token', new Error('token mismatch'));
context.logError_('linebot', 'reply', 'send_failed', new Error('accessToken expired'));

const log = context.getErrorLogForTest_();
assert.strictEqual(log.length, 2, 'two entries logged');
assert.strictEqual(log[0].operation, 'ingest', 'operation recorded');
assert.strictEqual(log[0].target, 'DATA', 'target recorded');
assert.strictEqual(log[0].errorCode, 'invalid_token', 'errorCode recorded');
assert.ok(log[0].timestamp, 'timestamp recorded');

const lastEntry = log[1];
assert.ok(!lastEntry.message.includes('accessToken'), 'secret masked in message');
assert.ok(lastEntry.message.includes('***') || lastEntry.message.includes('expired'), 'secret masked or message preserved');

context.clearErrorLog_();
assert.deepStrictEqual(context.getErrorLogForTest_(), [], 'cleared');

console.log('ErrorLog tests passed');
