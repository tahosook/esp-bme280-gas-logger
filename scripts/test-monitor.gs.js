const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const sourceMetrics = fs.readFileSync(`${__dirname}/../gas/Metrics.gs`, 'utf8');
const sourceConfig = fs.readFileSync(`${__dirname}/../gas/Config.gs`, 'utf8');
const sourceMonitor = fs.readFileSync(`${__dirname}/../gas/Monitor.gs`, 'utf8');

const propertiesStore = new Map();

const context = {
  console,
  isFinite,
  JSON,
  Object,
  Set,
  Number,
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
        },
        deleteProperty(key) {
          this.store.delete(key);
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
vm.runInContext(sourceConfig, context, { filename: 'gas/Config.gs' });
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

// 1. 閾値超過とミニマル通知カード
context.Date = fixedDate('2026-08-10T01:00:00Z');
let result = runEvaluate(29.0, 69.0, 1009.0);
assert.ok(!stateEqual(result.states, { temp: true, hum: true, discomfortIndex: true }), 'no alert below thresholds');
assert.strictEqual(result.notification, null, 'no notification below thresholds');

result = runEvaluate(31.0, 72.0, 1007.0);
assert.ok(stateEqual(result.states, { temp: false, hum: false, discomfortIndex: false }), 'no alert on first over due to smoothing');
assert.strictEqual(result.notification, null, 'do not notify on first over due to smoothing');

result = runEvaluate(31.5, 73.0, 1006.5);
assert.ok(stateEqual(result.states, { temp: true, hum: true, discomfortIndex: true }), 'alert after consecutive over');
assert.ok(result.notification && result.notification.text.includes('現在: 31.5 ℃ / 73 %'), 'minimal notification after consecutive over');

// 2. 5分後 (アラート継続中) -> 1hクールダウンにより通知スキップ
context.Date = fixedDate('2026-08-10T01:05:00Z');
result = runEvaluate(31.5, 73.0, 1006.5);
assert.strictEqual(result.notification, null, 'alert suppressed during 1h cooldown');

// 3. 正常域への復帰時 -> 復帰通知は送信しない（廃止仕様）
context.Date = fixedDate('2026-08-10T01:30:00Z');
result = runEvaluate(25.0, 50.0, 1010.0);
assert.ok(stateEqual(result.states, { temp: false, hum: false, discomfortIndex: false }), 'fully recovered to normal');
assert.strictEqual(result.notification, null, 'no notification while recovering (no return-to-normal alert)');

// 4. クールダウン経過後 (01:00の送信から70分後) に再度閾値超過 -> 通知送信
context.Date = fixedDate('2026-08-10T02:10:00Z');
result = runEvaluate(31.1, 71.5, 1007.0);
assert.strictEqual(result.notification, null, 'consecutive smoothing count reset on recovery');

result = runEvaluate(31.1, 71.5, 1007.0);
assert.ok(stateEqual(result.states, { temp: true, hum: true, discomfortIndex: true }), 'alert consecutive triggered');
assert.ok(result.notification, 'alert sent after cooldown passed');

// すぐ次の受信 (5分後) -> クールダウン中 (60分未満) なので通知スキップ
context.Date = fixedDate('2026-08-10T02:15:00Z');
result = runEvaluate(31.5, 72.0, 1007.0);
assert.strictEqual(result.notification, null, 'suppressed due to 1h cooldown');

// 65分後 -> クールダウン解除により通知送信
context.Date = fixedDate('2026-08-10T03:20:00Z');
result = runEvaluate(31.5, 72.0, 1007.0);
assert.ok(result.notification, 'alert sent after 60 min cooldown expired');

// 4. センサー異常値ガード (-10℃〜50℃, 0%〜100%)
context.Date = fixedDate('2026-08-10T05:00:00Z');
result = runEvaluate(60.0, 72.0, 1007.0); // 60℃
assert.strictEqual(result.notification, null, 'sensor anomaly (temp > 50) skipped');

result = runEvaluate(-15.0, 72.0, 1007.0); // -15℃
assert.strictEqual(result.notification, null, 'sensor anomaly (temp < -10) skipped');

result = runEvaluate(30.5, 105.0, 1007.0); // 105%
assert.strictEqual(result.notification, null, 'sensor anomaly (hum > 100) skipped');

// 5. SNOOZE 有効期間中
propertiesStore.set('ALERT_SNOOZE_UNTIL', String(new Date('2026-08-10T08:00:00Z').getTime()));
context.Date = fixedDate('2026-08-10T06:00:00Z');
result = runEvaluate(31.5, 72.0, 1007.0);
assert.strictEqual(result.notification, null, 'snooze active suppresses push alert');
propertiesStore.delete('ALERT_SNOOZE_UNTIL');

// 6. 1日上限ガード (同一日最大5回)
const todayJst = '2026-08-10';
propertiesStore.set('ALERT_COUNT_TODAY', JSON.stringify({ date: todayJst, count: 5 }));
propertiesStore.set('ALERT_LAST_SENT_TIME', String(new Date('2026-08-10T04:00:00Z').getTime()));
context.Date = fixedDate('2026-08-10T06:00:00Z');
result = runEvaluate(31.5, 72.0, 1007.0);
assert.strictEqual(result.notification, null, 'daily max 5 limit suppresses additional alerts');

// 翌日 (日付変更) -> 送信可能
context.Date = fixedDate('2026-08-11T01:00:00Z');
result = runEvaluate(31.5, 72.0, 1007.0);
assert.ok(result.notification, 'alert allowed on next day');

// 7. リセット
context.resetMonitorStates_();
const resetState = context.getMonitorStateForTest_();
assert.ok(!resetState.temp.alert, 'reset temp alert');
assert.ok(!resetState.hum.alert, 'reset hum alert');
assert.ok(!resetState.discomfortIndex.alert, 'reset di alert');

console.log('Monitor tests passed');
