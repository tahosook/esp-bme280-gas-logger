#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = [
  fs.readFileSync(`${__dirname}/../gas/Metrics.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Config.gs`, 'utf8'),
  fs.readFileSync(`${__dirname}/../gas/Monitor.gs`, 'utf8')
].join('\n');

const propertiesStore = new Map([['SPREADSHEET_ID', 'test-spreadsheet']]);
const configRows = [
  ['TEMP_HIGH', 'HYSTERESIS_TEMP', 'SMOOTH_K', 'ANOMALY_TEMP'],
  ['29', '1', '1', '1']
];

const context = {
  console,
  isFinite,
  JSON,
  Number,
  Object,
  Set,
  Date,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperties() { return Object.fromEntries(propertiesStore); },
        getProperty(key) { return propertiesStore.get(key) || null; },
        setProperty(key, value) { propertiesStore.set(key, value); }
      };
    }
  },
  SpreadsheetApp: {
    openById(id) {
      assert.strictEqual(id, 'test-spreadsheet');
      return {
        getSheetByName(name) {
          return name === 'Config' ? {
            getDataRange() { return { getValues() { return configRows; } }; }
          } : null;
        }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'gas/Config.gs + gas/Monitor.gs' });

const merged = context.getMergedConfigForTest_();
assert.strictEqual(merged.TEMP_HIGH, '29', 'Config sheet value is loaded');
assert.strictEqual(merged.SMOOTH_K, '1', 'smoothing alias is loaded');

context.resetMonitorStates_();
const result = context.updateMonitorState_({ temp: 29.5, hum: 50, press: 1012 });
assert.ok(result.states.temp.alert, 'Config temperature threshold is applied');

const anomalyResult = context.updateMonitorState_({ temp: 31, hum: 50, press: 1012 });
assert.ok(anomalyResult.anomaly, 'Config anomaly threshold is applied');

console.log('Config/Monitor integration tests passed');
