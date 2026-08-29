/**
 * SetupTriggers.gs
 *
 * 時間主導トリガーをプログラムで登録するセットアップスクリプト。
 * GAS エディタまたは clasp push 後に「一度だけ手動実行」する。
 * 実行後はこのファイル自体をそのまま残してよい（再実行しても重複チェックで安全）。
 *
 * 登録されるトリガー:
 *   - aggregateDaily  : 毎日 02:00（Asia/Tokyo）
 *   - aggregateMonthly: 毎月 1 日 01:00（Asia/Tokyo）
 *   - checkWatchdog   : 毎時 0 分
 */

/**
 * すべての時間主導トリガーをまとめて設定する。
 * GAS エディタの「実行」ボタンで手動実行すること。
 */
function setupAllTriggers() {
  setupDailyAggregationTrigger();
  setupMonthlyAggregationTrigger();
  setupWatchdogTrigger();
  Logger.log('All triggers have been set up.');
}

/**
 * aggregateMonthly を毎月 1 日 01:00 に実行するトリガーを登録する。
 * 同名トリガーが既に存在する場合はスキップする（重複防止）。
 */
function setupMonthlyAggregationTrigger() {
  var fnName = 'aggregateMonthly';
  if (triggerExists_(fnName)) {
    Logger.log('Trigger already exists: ' + fnName);
    return;
  }
  ScriptApp.newTrigger(fnName)
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .nearMinute(0)
    .inTimezone('Asia/Tokyo')
    .create();
  Logger.log('Trigger created: ' + fnName + ' (monthly, 1st day at 01:00 JST)');
}

/**
 * aggregateDaily を毎日 02:00 に実行するトリガーを登録する。
 * 同名トリガーが既に存在する場合はスキップする（重複防止）。
 */
function setupDailyAggregationTrigger() {
  var fnName = 'aggregateDaily';
  if (triggerExists_(fnName)) {
    Logger.log('Trigger already exists: ' + fnName);
    return;
  }
  ScriptApp.newTrigger(fnName)
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .nearMinute(0)
    .inTimezone('Asia/Tokyo')
    .create();
  Logger.log('Trigger created: ' + fnName + ' (daily at 02:00 JST)');
}

/**
 * checkWatchdog を毎時 0 分に実行するトリガーを登録する。
 * 同名トリガーが既に存在する場合はスキップする（重複防止）。
 */
function setupWatchdogTrigger() {
  var fnName = 'checkWatchdog';
  if (triggerExists_(fnName)) {
    Logger.log('Trigger already exists: ' + fnName);
    return;
  }
  ScriptApp.newTrigger(fnName)
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Trigger created: ' + fnName + ' (hourly)');
}

/**
 * 指定した関数名の時間主導トリガーが既に存在するか確認する。
 * @param {string} fnName 関数名
 * @return {boolean}
 */
function triggerExists_(fnName) {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === fnName;
  });
}
