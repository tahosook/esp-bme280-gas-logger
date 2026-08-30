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

  const sandbox = {
    console: {
      log: () => {},
      error: () => {},
      warn: () => {}
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
    errorLogs
  };

  const context = vm.createContext(sandbox);

  const files = ['Config.gs', 'ErrorLog.gs', 'Monitor.gs', 'Router.gs', 'LineBot.gs'];
  for (const file of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'gas', file), 'utf8');
    vm.runInContext(code, context);
  }

  return { context, sandbox, propertiesStore, fetchedUrls, errorLogs };
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

  // 3. コマンド「状況」 -> 監視状態を含む Reply が送信される
  {
    const secret = 'test-secret';
    const { context, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 28.5, hum: 65.0, discomfortIndex: 77.2, timestamp: new Date().toISOString() })
    });
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'token-123',
          message: { type: 'text', text: '状況' }
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
    assert.ok(payload.messages[0].text.includes('現在の監視状態：'), 'Test 3 Failed: reply text should contain status header');
    assert.ok(payload.messages[0].text.includes('28.50℃'), 'Test 3 Failed: reply text should contain temperature');
    console.log('  ✓ Test 3: Status command reply passed');
  }

  // 4. コマンド「スキップ」 -> MONITOR_SKIP_UNTIL が設定され、Push が抑制される
  {
    const secret = 'test-secret';
    const { context, propertiesStore, fetchedUrls } = createGasContext({
      LINE_CHANNEL_SECRET: secret,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_USER_ID: 'user-123'
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
    assert.ok(propertiesStore.MONITOR_SKIP_UNTIL, 'Test 4 Failed: MONITOR_SKIP_UNTIL should be set');

    // Push 送信が抑制されるか確認
    fetchedUrls.length = 0;
    const pushed = vm.runInContext('pushMonitorNotification_("test text")', context);
    assert.strictEqual(pushed, false, 'Test 4 Failed: Push should be suppressed when skip is active');
    assert.strictEqual(fetchedUrls.length, 0, 'Test 4 Failed: UrlFetchApp.fetch should not be called');
    console.log('  ✓ Test 4: Skip command and push suppression passed');
  }

  // 5. コマンド「クリア」 -> resetMonitorStates_ が呼ばれ状態がリセットされる
  {
    const secret = 'test-secret';
    const { context, propertiesStore } = createGasContext({
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
          message: { type: 'text', text: 'クリア' }
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
    assert.ok(payload.messages[0].text.includes('利用可能なコマンド:'), 'Test 6 Failed: should return help text');
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
    assert.strictEqual(payload.messages[0].text, 'test message');
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

  console.log('\nAll LineBot tests passed successfully!');
}

runTests();
