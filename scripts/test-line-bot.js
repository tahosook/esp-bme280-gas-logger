const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

function createGasContext(initialProps = {}, fetchedUrls = []) {
  const propertiesStore = Object.assign({}, initialProps);
  const errorLogs = [];

  const scriptProperties = {
    getProperty: (key) => (Object.prototype.hasOwnProperty.call(propertiesStore, key) ? propertiesStore[key] : null),
    setProperty: (key, val) => {
      propertiesStore[key] = String(val);
    },
    deleteProperty: (key) => {
      delete propertiesStore[key];
    },
    getProperties: () => Object.assign({}, propertiesStore)
  };

  const lock = {
    waitLock: () => true,
    releaseLock: () => true
  };

  const logEntries = [];
  const sandbox = {
    console: {
      log: () => {},
      error: () => {},
      warn: () => {}
    },
    Logger: {
      log: (msg) => {
        logEntries.push(msg);
      }
    },
    PropertiesService: {
      getScriptProperties: () => scriptProperties
    },
    LockService: {
      getScriptLock: () => lock
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        fetchedUrls.push({ url, options });
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ok: true })
        };
      }
    },
    Utilities: {
      computeHmacSha256Signature: (body, secret) => {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(body, 'utf8');
        return Array.from(hmac.digest());
      },
      base64Encode: (bytes) => {
        return Buffer.from(bytes).toString('base64');
      },
      formatDate: (date, tz, format) => {
        return '2026-08-29 10:30:00';
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (content) => ({
        content,
        setMimeType: function(mime) {
          this.mime = mime;
          return this;
        }
      })
    },
    Date: Date,
    Math: Math,
    JSON: JSON,
    parseInt: parseInt,
    isNaN: isNaN,
    Number: Number,
    Object: Object,
    Array: Array,
    String: String,
    Set: Set,
    propertiesStore,
    fetchedUrls,
    errorLogs,
    logEntries
  };

  const context = vm.createContext(sandbox);

  const files = ['Config.gs', 'ErrorLog.gs', 'DailyAggregation.gs', 'Metrics.gs', 'Monitor.gs', 'Router.gs', 'LineBot.gs', 'DebugTest.gs'];
  for (const file of files) {
    const filePath = path.join(__dirname, '..', 'gas', file);
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      vm.runInContext(code, context);
    }
  }

  return { context, sandbox, propertiesStore, fetchedUrls, errorLogs, logEntries };
}

function runTests() {
  console.log('Running LineBot tests...');

  // 1. 正しい署名 -> handleLineWebhook_ が正常処理 (ok: true)
  {
    const secret = 'test-secret';
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token'
    });
    const body = JSON.stringify({ events: [] });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');

    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };
    const res = vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    const resObj = JSON.parse(res.content);
    assert.strictEqual(resObj.ok, true, 'Test 1 Failed: expected ok: true');
    console.log('  ✓ Test 1: Valid signature passed');
  }

  // 2. 不正な署名 -> invalid_signature エラーレスポンス
  {
    const secret = 'test-secret';
    const { context } = createGasContext({
      LINE_CHANNEL_SECRET: secret
    });
    const body = JSON.stringify({ events: [] });
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': 'invalid-signature' }
    };
    const res = vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    const resObj = JSON.parse(res.content);
    assert.strictEqual(resObj.ok, false, 'Test 2 Failed: expected ok: false');
    assert.strictEqual(resObj.error, 'invalid_signature', 'Test 2 Failed: expected error invalid_signature');
    console.log('  ✓ Test 2: Invalid signature rejected passed');
  }

  // 3. コマンド「NOW」通常監視中 -> 監視中（Active）のFlex Messageが返信される
  {
    const secret = 'test-secret';
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 28.5, hum: 65.0, press: 1013.25, discomfortIndex: 77.2, timestamp: '2026-08-29T10:30:00.000Z' })
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: 'NOW' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(fetchedUrls.length, 1, 'Test 3 Failed: UrlFetchApp.fetch should be called');
    assert.strictEqual(fetchedUrls[0].url, 'https://api.line.me/v2/bot/message/reply');
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    assert.strictEqual(payload.replyToken, 'token-123');
    assert.strictEqual(payload.messages[0].type, 'flex', 'Test 3 Failed: expected flex message type');
    assert.strictEqual(payload.messages[0].altText, '現在の監視状態', 'Test 3 Failed: expected alt text for status message');
    const bubble = payload.messages[0].contents;
    assert.strictEqual(bubble.header.backgroundColor, '#27ae60', 'Test 3 Failed: header should be active green');
    assert.strictEqual(bubble.header.contents[0].text, '🔔 監視中（Active）', 'Test 3 Failed: header title mismatch');
    assert.strictEqual(bubble.footer.contents.length, 2, 'Test 3 Failed: active footer should have 2 buttons');
    assert.strictEqual(bubble.footer.contents[0].action.text, 'SNOOZE');
    assert.strictEqual(bubble.footer.contents[1].action.text, 'TRENDS');
    console.log('  ✓ Test 3: Status command flex reply (active) passed');
  }

  // 3B. コマンド「NOW」スヌーズ中 -> SNOOZE中（期限表示・CLEARボタン）のFlex Messageが返信される
  {
    const secret = 'test-secret';
    const futureMs = Date.now() + 3600000;
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      MONITOR_SKIP_UNTIL: String(futureMs),
      MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 28.5, hum: 65.0, press: 1013.25, discomfortIndex: 77.2, timestamp: '2026-08-29T10:30:00.000Z' })
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: '現在' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(fetchedUrls.length, 1, 'Test 3B Failed: reply should be called');
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    const bubble = payload.messages[0].contents;
    assert.strictEqual(bubble.header.backgroundColor, '#e67e22', 'Test 3B Failed: header should be orange');
    assert.strictEqual(bubble.header.contents[0].text, '🔕 SNOOZE中', 'Test 3B Failed: header title mismatch');
    assert.ok(bubble.header.contents[1].text.includes('停止期限:'), 'Test 3B Failed: subtext should show deadline');
    assert.strictEqual(bubble.footer.contents.length, 1, 'Test 3B Failed: snooze footer should have 1 button');
    assert.strictEqual(bubble.footer.contents[0].action.text, 'CLEAR');
    console.log('  ✓ Test 3B: Status command flex reply (snooze active) passed');
  }

  // 4. コマンド「SNOOZE」 -> MONITOR_SKIP_UNTIL が設定され、Push が抑制される
  {
    const secret = 'test-secret';
    const { context, propertiesStore, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_USER_ID: 'user-123',
      MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 28.5, hum: 65.0 })
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: 'SNOOZE' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.ok(propertiesStore.MONITOR_SKIP_UNTIL, 'Test 4 Failed: MONITOR_SKIP_UNTIL should be set');
    assert.strictEqual(fetchedUrls.length, 1, 'Test 4 Failed: reply should be sent');
    assert.strictEqual(fetchedUrls[0].url, 'https://api.line.me/v2/bot/message/reply');
    const replyPayload = JSON.parse(fetchedUrls[0].options.payload);
    assert.strictEqual(replyPayload.messages[0].type, 'flex', 'Test 4 Failed: expected flex message type');
    assert.strictEqual(replyPayload.messages[0].altText, 'スキップ設定完了', 'Test 4 Failed: reply altText mismatch');
    const bubble = replyPayload.messages[0].contents;
    assert.strictEqual(bubble.header.contents[0].text, '🔕 SNOOZE設定完了');
    assert.strictEqual(bubble.footer.contents[0].action.text, 'CLEAR');

    // Push 送信が抑制されるか確認
    fetchedUrls.length = 0;
    const pushed = vm.runInContext('pushMonitorNotification_("test text")', context);
    assert.strictEqual(pushed, false, 'Test 4 Failed: Push should be suppressed when skip is active');
    assert.strictEqual(fetchedUrls.length, 0, 'Test 4 Failed: UrlFetchApp.fetch should not be called');
    console.log('  ✓ Test 4: SNOOZE command and push suppression passed');
  }

  // 5. コマンド「CLEAR」 -> resetMonitorStates_ が呼ばれ状態がリセットされる
  {
    const secret = 'test-secret';
    const { context, propertiesStore, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      MONITOR_SKIP_UNTIL: String(Date.now() + 100000),
      MONITOR_STATE_temp: JSON.stringify({ consecutive: 2, alert: true })
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: 'CLEAR' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(propertiesStore.MONITOR_SKIP_UNTIL, undefined, 'Test 5 Failed: MONITOR_SKIP_UNTIL should be deleted');
    const tempState = JSON.parse(propertiesStore.MONITOR_STATE_temp);
    assert.strictEqual(tempState.alert, false, 'Test 5 Failed: alert state should be reset');
    assert.strictEqual(fetchedUrls.length, 1);
    const replyPayload = JSON.parse(fetchedUrls[0].options.payload);
    assert.ok(replyPayload.messages[0].text.includes('リセットしました'), 'Test 5 Failed: clear reply text mismatch');
    console.log('  ✓ Test 5: Clear command reset passed');
  }

  // 6. 不明コマンド -> ヘルプ Reply が返る
  {
    const secret = 'test-secret';
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token'
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: 'unknown command' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(fetchedUrls.length, 1, 'Test 6 Failed: UrlFetchApp.fetch should be called');
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    assert.ok(payload.messages[0].text.includes('NOW'), 'Test 6 Failed: should return help text with NOW');
    assert.ok(payload.messages[0].text.includes('SNOOZE'), 'Test 6 Failed: should return help text with SNOOZE');
    console.log('  ✓ Test 6: Unknown command help reply passed');
  }

  // 7. pushMonitorNotification_: スキップ有効期間内 -> Push しない
  {
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_USER_ID: 'user-123',
      MONITOR_SKIP_UNTIL: String(Date.now() + 100000)
    });
    const pushed = vm.runInContext('pushMonitorNotification_("test")', context);
    assert.strictEqual(pushed, false, 'Test 7 Failed: push should return false');
    assert.strictEqual(fetchedUrls.length, 0, 'Test 7 Failed: fetch should not be called');
    console.log('  ✓ Test 7: Push during active skip passed');
  }

  // 8. pushMonitorNotification_: スキップ期間外・LINE_USER_ID あり -> UrlFetchApp.fetch が呼ばれる
  {
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_USER_ID: 'user-123'
    });
    const pushed = vm.runInContext('pushMonitorNotification_("test message")', context);
    assert.strictEqual(pushed, true, 'Test 8 Failed: push should return true');
    assert.strictEqual(fetchedUrls.length, 1, 'Test 8 Failed: fetch should be called');
    assert.strictEqual(fetchedUrls[0].url, 'https://api.line.me/v2/bot/message/push');
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    assert.strictEqual(payload.to, 'user-123');
    assert.strictEqual(payload.messages[0].type, 'flex', 'Test 8 Failed: expected flex message');
    assert.strictEqual(payload.messages[0].altText, '監視アラート', 'Test 8 Failed: expected altText');
    const bubble = payload.messages[0].contents;
    assert.strictEqual(bubble.footer.contents[0].action.label, '🔕 翌朝8時までSNOOZE');
    assert.strictEqual(bubble.footer.contents[0].action.text, 'SNOOZE');
    console.log('  ✓ Test 8: Push with valid user ID passed');
  }

  // 9. pushMonitorNotification_: LINE_USER_ID 未設定 -> Push せず logError_ を呼ぶ
  {
    const { context, fetchedUrls, propertiesStore } = createGasContext({
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token'
    });
    const pushed = vm.runInContext('pushMonitorNotification_("test message")', context);
    assert.strictEqual(pushed, false, 'Test 9 Failed: push should return false');
    assert.strictEqual(fetchedUrls.length, 0, 'Test 9 Failed: fetch should not be called');
    const errorLogs = JSON.parse(propertiesStore.ERROR_LOG_ENTRIES || '[]');
    assert.ok(errorLogs.length > 0, 'Test 9 Failed: error log should be recorded');
    assert.strictEqual(errorLogs[0].errorCode, 'missing_user_id');
    console.log('  ✓ Test 9: Missing LINE_USER_ID handling passed');
  }

  // 10. doPost routing & reply without headers (GAS runtime simulation)
  {
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 26.0, hum: 60.0, discomfortIndex: 75.0, timestamp: new Date().toISOString() })
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-no-headers',
          message: { type: 'text', text: 'status' }
        }
      ]
    });
    // Request without headers (as happens in GAS environment)
    const req = {
      postData: { contents: body }
    };
    const res = vm.runInContext('doPost(e)', vm.createContext(Object.assign({}, context, { e: req })));
    const resObj = JSON.parse(res.content);
    assert.strictEqual(resObj.ok, true, 'Test 10 Failed: expected ok: true');
    assert.strictEqual(fetchedUrls.length, 1, 'Test 10 Failed: reply should be sent');
    assert.strictEqual(fetchedUrls[0].url, 'https://api.line.me/v2/bot/message/reply');
    console.log('  ✓ Test 10: GAS runtime without headers routes and replies passed');
  }

  // 11. calculateNextMorning8Am_: 各時間帯（JST）における翌朝8:00計算の正確性テスト
  {
    const { context } = createGasContext();
    // 補助関数: JST日時文字列からDate作成
    function parseJstDate(str) {
      // str format: "YYYY-MM-DDTHH:mm:ss"
      return new Date(str + '+09:00').getTime();
    }

    // ケースA: 昼 14:00 JST -> 翌日 08:00 JST
    const noon = parseJstDate('2026-08-30T14:00:00');
    const expectedA = parseJstDate('2026-08-31T08:00:00');
    const resultA = vm.runInContext(`calculateNextMorning8Am_(${noon})`, context);
    assert.strictEqual(resultA, expectedA, 'Test 11A Failed: 14:00 JST should yield next day 08:00 JST');

    // ケースB: 夜 23:30 JST -> 翌日 08:00 JST
    const night = parseJstDate('2026-08-30T23:30:00');
    const expectedB = parseJstDate('2026-08-31T08:00:00');
    const resultB = vm.runInContext(`calculateNextMorning8Am_(${night})`, context);
    assert.strictEqual(resultB, expectedB, 'Test 11B Failed: 23:30 JST should yield next day 08:00 JST');

    // ケースC: 深夜 01:15 JST -> 当日 08:00 JST (仕様B)
    const lateNight = parseJstDate('2026-08-31T01:15:00');
    const expectedC = parseJstDate('2026-08-31T08:00:00');
    const resultC = vm.runInContext(`calculateNextMorning8Am_(${lateNight})`, context);
    assert.strictEqual(resultC, expectedC, 'Test 11C Failed: 01:15 JST should yield same day 08:00 JST');

    // ケースD: 早朝 07:59 JST -> 当日 08:00 JST
    const earlyMorning = parseJstDate('2026-08-31T07:59:00');
    const expectedD = parseJstDate('2026-08-31T08:00:00');
    const resultD = vm.runInContext(`calculateNextMorning8Am_(${earlyMorning})`, context);
    assert.strictEqual(resultD, expectedD, 'Test 11D Failed: 07:59 JST should yield same day 08:00 JST');

    // ケースE: 朝 08:00 JST ちょうど -> 翌日 08:00 JST
    const exact8Am = parseJstDate('2026-08-31T08:00:00');
    const expectedE = parseJstDate('2026-09-01T08:00:00');
    const resultE = vm.runInContext(`calculateNextMorning8Am_(${exact8Am})`, context);
    assert.strictEqual(resultE, expectedE, 'Test 11E Failed: 08:00 JST should yield next day 08:00 JST');

    // ケースF: 月末 2026-08-31 22:00 JST -> 翌月 2026-09-01 08:00 JST
    const monthEnd = parseJstDate('2026-08-31T22:00:00');
    const expectedF = parseJstDate('2026-09-01T08:00:00');
    const resultF = vm.runInContext(`calculateNextMorning8Am_(${monthEnd})`, context);
    assert.strictEqual(resultF, expectedF, 'Test 11F Failed: Month rollover should yield 09-01 08:00 JST');

    // ケースG: 年末 2026-12-31 23:00 JST -> 翌年 2027-01-01 08:00 JST
    const yearEnd = parseJstDate('2026-12-31T23:00:00');
    const expectedG = parseJstDate('2027-01-01T08:00:00');
    const resultG = vm.runInContext(`calculateNextMorning8Am_(${yearEnd})`, context);
    assert.strictEqual(resultG, expectedG, 'Test 11G Failed: Year rollover should yield 2027-01-01 08:00 JST');

    console.log('  ✓ Test 11: calculateNextMorning8Am_ JST calculation across all time slots passed');
  }

  // 12. SKIP_UNTIL_HOUR 設定によるカスタム解除時刻の反映テスト
  {
    const secret = 'test-secret';
    const { context, propertiesStore } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      SKIP_UNTIL_HOUR: '9'
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: 'スキップ' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    const skipUntil = parseInt(propertiesStore.MONITOR_SKIP_UNTIL, 10);
    const jstTarget = new Date(skipUntil + 9 * 60 * 60 * 1000);
    assert.strictEqual(jstTarget.getUTCHours(), 9, 'Test 12 Failed: target hour should be 9');
    console.log('  ✓ Test 12: Custom SKIP_UNTIL_HOUR configuration passed');
  }

  // 13. コマンドエイリアス（大文字小文字・全角半角・日本語）の網羅的判定テスト
  {
    const secret = 'test-secret';
    const checkCommand = (cmdText, expectedAction) => {
      const { context, fetchedUrls, propertiesStore } = createGasContext({
        LINE_CHANNEL_SECRET: secret,
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
        MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 25.0, hum: 50.0 })
      });
      const body = JSON.stringify({
        events: [
          {
            type: 'message',
            replyToken: 'token-alias',
            message: { type: 'text', text: cmdText }
          }
        ]
      });
      const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
      const req = {
        postData: { contents: body },
        headers: { 'X-Line-Signature': hmac }
      };

      vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
      assert.strictEqual(fetchedUrls.length, 1, `Alias test failed for '${cmdText}': expected reply`);
      const payload = JSON.parse(fetchedUrls[0].options.payload);

      if (expectedAction === 'status') {
        assert.strictEqual(payload.messages[0].altText, '現在の監視状態', `Alias test for '${cmdText}' expected status altText`);
      } else if (expectedAction === 'snooze') {
        assert.strictEqual(payload.messages[0].altText, 'スキップ設定完了', `Alias test for '${cmdText}' expected snooze altText`);
      } else if (expectedAction === 'clear') {
        assert.ok(payload.messages[0].text.includes('リセットしました'), `Alias test for '${cmdText}' expected clear message`);
      } else if (expectedAction === 'trends') {
        // Without spreadsheet mock it returns fallback error text message
        assert.ok(payload.messages[0].text.includes('グラフを生成するためのデータが不足しています'), `Alias test for '${cmdText}' expected trends fallback`);
      }
    };

    ['NOW', 'now', ' 状況 ', '状態', '現在', 'status', 'ＮＯＷ'].forEach(t => checkCommand(t, 'status'));
    ['SNOOZE', 'snooze', 'スキップ', 'おやすみ', 'skip', 'ＳＮＯＯＺＥ'].forEach(t => checkCommand(t, 'snooze'));
    ['CLEAR', 'clear', 'クリア', '解除', 'ＣＬＥＡＲ'].forEach(t => checkCommand(t, 'clear'));
    ['TRENDS', 'trends', 'グラフ', '24h', '推移', ' グラフ ', 'ＴＲＥＮＤＳ'].forEach(t => checkCommand(t, 'trends'));

    console.log('  ✓ Test 13: Full command aliases (NOW/SNOOZE/CLEAR/TRENDS/推移) passed');
  }

  // 14. TRENDS コマンド正常系: Spreadsheetモックから288件取得し image メッセージ（URL < 2000文字）を返信する
  {
    const secret = 'test-secret';
    const mockRows = [['Timestamp', 'temp', 'press', 'hum']];
    const baseTime = new Date('2026-08-31T00:00:00+09:00').getTime();
    for (let i = 0; i < 288; i++) {
      mockRows.push([new Date(baseTime + i * 5 * 60 * 1000), 25.5, 1013.2, 60.5]);
    }

    const mockSheet = {
      getName: () => 'DATA',
      getLastRow: () => mockRows.length,
      getRange: (startRow, startCol, numRows, numCols) => ({
        getValues: () => mockRows.slice(startRow - 1, startRow - 1 + numRows)
      })
    };

    const mockSpreadsheet = {
      getSheetByName: (name) => (name === 'DATA' || name === '2026' ? mockSheet : null),
      getActiveSheet: () => mockSheet
    };

    const { context, fetchedUrls, sandbox } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      SPREADSHEET_ID: 'test-sheet-id',
      SHEET_NAME: 'DATA'
    });

    sandbox.SpreadsheetApp = {
      openById: (id) => (id === 'test-sheet-id' ? mockSpreadsheet : null)
    };

    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-trends-1',
          message: { type: 'text', text: 'グラフ' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(fetchedUrls.length, 1, 'Test 14 Failed: UrlFetchApp.fetch should be called');
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    assert.strictEqual(payload.replyToken, 'token-trends-1');
    assert.strictEqual(payload.messages[0].type, 'image', 'Test 14 Failed: expected image message type');
    assert.ok(typeof payload.messages[0].originalContentUrl === 'string', 'Test 14 Failed: originalContentUrl should be string');
    assert.ok(typeof payload.messages[0].previewImageUrl === 'string', 'Test 14 Failed: previewImageUrl should be string');
    assert.ok(payload.messages[0].originalContentUrl.length < 2000, 'Test 14 Failed: originalContentUrl must be < 2000 chars');
    assert.ok(payload.messages[0].originalContentUrl.includes('w=600&h=360&devicePixelRatio=2.0'), 'Test 14 Failed: responsive size mismatch');

    console.log('  ✓ Test 14: TRENDS command image message reply (URL < 2000 chars) passed');
  }

  // 15. TRENDS コマンド異常系: データ不足時はフォールバックテキストを返信する
  {
    const secret = 'test-secret';
    const mockSheet = {
      getName: () => 'DATA',
      getLastRow: () => 1, // only header
      getRange: () => ({ getValues: () => [] })
    };
    const mockSpreadsheet = {
      getSheetByName: () => mockSheet,
      getActiveSheet: () => mockSheet
    };

    const { context, fetchedUrls, sandbox } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      SPREADSHEET_ID: 'test-sheet-id',
      SHEET_NAME: 'DATA'
    });

    sandbox.SpreadsheetApp = {
      openById: () => mockSpreadsheet
    };

    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-trends-fallback',
          message: { type: 'text', text: '推移' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(fetchedUrls.length, 1);
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    assert.strictEqual(payload.messages[0].type, 'text');
    assert.ok(payload.messages[0].text.includes('グラフを生成するためのデータが不足しています'), 'Test 15 Failed: fallback text mismatch');

    console.log('  ✓ Test 15: TRENDS command fallback text reply on insufficient data passed');
  }

  // 16. LINE Webhook 実行時エラーハンドリング: 予期せぬ例外発生時にエラー返信とログ記録が行われる
  {
    const secret = 'test-secret';
    const { context, fetchedUrls, propertiesStore, sandbox } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token'
    });

    // Cause buildStatusFlexMessage_ to throw an error
    sandbox.buildStatusFlexMessage_ = () => {
      throw new Error('simulated_fatal_error');
    };

    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-err-1',
          message: { type: 'text', text: 'NOW' }
        }
      ]
    });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const req = {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };

    vm.runInContext('handleLineWebhook_(e)', vm.createContext(Object.assign({}, context, { e: req })));
    assert.strictEqual(fetchedUrls.length, 1, 'Test 16 Failed: reply should be sent');
    const payload = JSON.parse(fetchedUrls[0].options.payload);
    assert.strictEqual(payload.messages[0].type, 'text');
    assert.ok(payload.messages[0].text.includes('⚠️ GAS処理エラー: simulated_fatal_error'), 'Test 16 Failed: error text mismatch');

    const errorLogs = JSON.parse(propertiesStore.ERROR_LOG_ENTRIES || '[]');
    assert.ok(errorLogs.length > 0, 'Test 16 Failed: error log should be recorded');
    assert.strictEqual(errorLogs[0].errorCode, 'unhandled_error');

    console.log('  ✓ Test 16: LINE Webhook error handling and fallback error reply passed');
  }

  // 17. DebugTest.gs: debugTest_buildQuickChartUrl と debugTest_handleLineWebhook_Trends の動作検証
  {
    const mockRows = [['Timestamp', 'temp', 'press', 'hum']];
    for (let i = 0; i < 50; i++) {
      mockRows.push([new Date(Date.now() - (50 - i) * 5 * 60 * 1000), 24.0, 1012.0, 55.0]);
    }
    const mockSheet = {
      getName: () => '2026',
      getLastRow: () => mockRows.length,
      getRange: (startRow, startCol, numRows, numCols) => ({
        getValues: () => mockRows.slice(startRow - 1, startRow - 1 + numRows)
      })
    };
    const mockSpreadsheet = {
      getSheetByName: (name) => (name === 'DATA' || name === '2026' ? mockSheet : null),
      getActiveSheet: () => mockSheet
    };

    const { context, logEntries, sandbox } = createGasContext({
      SPREADSHEET_ID: 'test-sheet-id',
      SHEET_NAME: '2026'
    });

    sandbox.SpreadsheetApp = {
      openById: () => mockSpreadsheet
    };

    vm.runInContext('debugTest_buildQuickChartUrl()', context);
    assert.ok(logEntries.some(l => l.includes('QuickChart URL 生成成功')), 'Test 17 Failed: debugTest_buildQuickChartUrl should log success');
    assert.ok(logEntries.some(l => l.includes('2,000 文字制限をクリア')), 'Test 17 Failed: debugTest_buildQuickChartUrl should log 2000 chars pass');

    logEntries.length = 0;
    vm.runInContext('debugTest_handleLineWebhook_Trends()', context);
    assert.ok(logEntries.some(l => l.includes('正常な image メッセージが生成されました')), 'Test 17 Failed: debugTest_handleLineWebhook_Trends should log image message');

    console.log('  ✓ Test 17: DebugTest.gs functions debugTest_buildQuickChartUrl and debugTest_handleLineWebhook_Trends passed');
  }

  console.log('\nAll LineBot tests passed successfully!');
}

runTests();

