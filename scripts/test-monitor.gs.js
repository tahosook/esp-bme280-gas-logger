#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const sourceMetrics = fs.readFileSync(`${__dirname}/../gas/Metrics.gs`, 'utf8');
const sourceMonitor = fs.readFileSync(`${__dirname}/../gas/Monitor.gs`, 'utf8');

const propertiesStore = new Map();

const context = {
  console,
  isFinite,
  JSON,
  Object,
  Date,
  PropertiesService: {
    getScriptProperties() {
      return {
        store: propertiesStore,
        getProperties() { return Object.fromEntries(propertiesStore); },
        getProperty(key) {
          return this.store.get(key) || null;
        },
        setProperty(key, value) {
          this.store.set(key, value);
        }
      };
    }
  },
  SpreadsheetApp: {
    openById() {
      return { getSheetByName() { return null; } };
    }
  }
};

vm.createContext(context);
vm.runInContext(sourceMetrics, context, { filename: 'gas/Metrics.gs' });
vm.runInContext(sourceMonitor, context, { filename: 'gas/Monitor.gs' });

function fixedDate(iso) {
  const base = new Date(iso);
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

function runEvaluate(temp, hum, press) {
  const measurement = { temp, hum, press };
  return context.updateMonitorState_(measurement);
}

function stateEqual(actual, expected) {
  return actual.temp.alert === expected.temp &&
    actual.hum.alert === expected.hum &&
    actual.discomfortIndex.alert === expected.discomfortIndex;
}

context.Date = fixedDate('2026-08-10T01:00:00Z');
let result = runEvaluate(29.0, 69.0, 1009.0);
assert.ok(!stateEqual(result.states, { temp: true, hum: true, discomfortIndex: true }), 'no alert below thresholds');
assert.strictEqual(result.notification, null, 'no notification below thresholds');

result = runEvaluate(31.0, 72.0, 1007.0);
assert.ok(stateEqual(result.states, { temp: false, hum: false, discomfortIndex: false }), 'no alert on first over due to smoothing');
assert.strictEqual(result.notification, null, 'do not notify on first over due to smoothing');

result = runEvaluate(31.5, 73.0, 1006.5);
assert.ok(stateEqual(result.states, { temp: true, hum: true, discomfortIndex: true }), 'alert after consecutive over');
assert.ok(result.notification && result.notification.text.includes('超過しました'), 'notify after consecutive over');

context.Date = fixedDate('2026-08-10T02:00:00Z');
result = runEvaluate(29.3, 65.0, 1008.0);
assert.ok(stateEqual(result.states, { temp: false, hum: false, discomfortIndex: true }), 'recover temp/hum only');
assert.strictEqual(result.notification, null, 'no notification while normal');

result = runEvaluate(31.1, 71.5, 1007.0);
assert.ok(stateEqual(result.states, { temp: false, hum: false, discomfortIndex: true }), 'partial re-alert after recovery');
assert.strictEqual(result.notification, null, 'no notification because discomfortIndex remains alerted');

result = runEvaluate(31.1, 71.5, 1007.0);
assert.ok(stateEqual(result.states, { temp: true, hum: true, discomfortIndex: true }), 'remain alert on repeat');
assert.strictEqual(result.notification, null, 'do not notify repeatedly');

result = runEvaluate(32.0, 80.0, 1005.0);
assert.ok(result.anomaly === false, 'no anomaly when cache exists');

context.resetMonitorStates_();
const resetState = context.getMonitorStateForTest_();
assert.ok(!resetState.temp.alert, 'reset temp alert');
assert.ok(!resetState.hum.alert, 'reset hum alert');
assert.ok(!resetState.discomfortIndex.alert, 'reset di alert');

console.log('Monitor tests passed');
