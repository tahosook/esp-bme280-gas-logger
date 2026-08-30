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

/**
 * LINE Bot の設定確認・OAuth権限承認・Push送信テスト関数。
 * GAS エディタの関数選択から「testLineBotConnection」を選んで「実行」する。
 * 初回実行時に Google からの権限承認（UrlFetchApp 等）ポップアップが表示される。
 */
function testLineBotConnection() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('LINE_CHANNEL_SECRET');
  var token = properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId = properties.getProperty('LINE_USER_ID');

  Logger.log('=== LINE Bot 設定確認 ===');
  Logger.log('LINE_CHANNEL_SECRET: ' + (secret ? '設定あり (先頭4文字: ' + secret.substring(0, 4) + '...)' : '未設定 ❌'));
  Logger.log('LINE_CHANNEL_ACCESS_TOKEN: ' + (token ? '設定あり (文字数: ' + token.length + ')' : '未設定 ❌'));
  Logger.log('LINE_USER_ID: ' + (userId ? '設定あり (' + userId + ')' : '未設定 ❌'));

  if (!token) {
    Logger.log('❌ LINE_CHANNEL_ACCESS_TOKEN がスクリプトプロパティに設定されていません。');
    return;
  }

  if (!userId) {
    Logger.log('❌ LINE_USER_ID がスクリプトプロパティに設定されていません。');
    return;
  }

  Logger.log('\n=== LINE Push 送信テスト中... ===');
  var success = pushMessage_(userId, '【テスト通知】GASからLINE Botへの接続に成功しました。', token);
  if (success) {
    Logger.log('✅ LINE Push 通知が正常に送信されました！ LINEアプリを確認してください。');
  } else {
    Logger.log('❌ LINE Push 通知の送信に失敗しました。直近のエラーログを確認してください。');
    var logs = typeof getErrorLogEntries_ === 'function' ? getErrorLogEntries_() : [];
    if (logs.length > 0) {
      Logger.log('エラー詳細: ' + JSON.stringify(logs[logs.length - 1]));
    }
  }
}

/**
 * Google 権限（UrlFetchApp / 外部通信）を確実に承認させるための専用関数。
 * try/catch を使わないため、GAS エディタで実行すると Google の「承認が必要です」ダイアログが必ず表示されます。
 */
function authorizeUrlFetch() {
  UrlFetchApp.fetch('https://api.line.me');
  Logger.log('✅ UrlFetchApp の権限が正常に承認されました。');
}
