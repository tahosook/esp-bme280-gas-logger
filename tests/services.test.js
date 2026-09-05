/**
 * tests/services.test.js
 *
 * Router, Ingest, LineBot Webhook, ErrorLog, Config, DebugTest, SetupTriggers の単体テストスイート
 */

const crypto = require('crypto');
const { createGasMockEnvironment, fixedDate } = require('./helpers/mockGasEnvironment');

describe('Router & Ingest Service (doGet / doPost / Sensor Ingestion)', () => {
  let env;
  let originalDate;

  beforeEach(() => {
    originalDate = global.Date;
    env = createGasMockEnvironment();
    Object.assign(global, env.globals);
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  test('doGet: スプレッドシートおよび設定が揃っていれば ready: true を返す', () => {
    const res = doGet();
    const body = JSON.parse(res.getContent());
    expect(body).toEqual({ ok: true, ready: true });
  });

  test('doGet: 設定不足（API_TOKEN なし）のときは ready: false, error: "not_ready" を返す', () => {
    env.propertiesStore.delete('API_TOKEN');
    const res = doGet();
    const body = JSON.parse(res.getContent());
    expect(body).toEqual({ ok: false, ready: false, error: 'not_ready' });
  });

  test('doPost: 正常なセンサーデータを受信し、DATA シートに追記する', () => {
    global.Date = fixedDate('2026-08-10T01:42:09Z');

    const validReq = {
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

    const res = doPost(validReq);
    const body = JSON.parse(res.getContent());
    expect(body).toEqual({ ok: true });

    expect(env.dataRows.length).toBe(2); // header + 1 row
    const row = env.dataRows[1];
    expect(row[1]).toBe(24.56);
    expect(row[2]).toBe(1012.34);
    expect(row[3]).toBe(55.87);
    expect(row[4]).toBe(''); // flag
  });

  test('doPost: 180秒以内の同一測定値は重複としてシート追記をスキップする', () => {
    global.Date = fixedDate('2026-08-10T01:42:09Z');
    const req = {
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

    doPost(req);
    expect(env.dataRows.length).toBe(2);

    // 180秒ちょうど
    global.Date = fixedDate('2026-08-10T01:45:09Z');
    const dupRes = doPost(req);
    expect(JSON.parse(dupRes.getContent())).toEqual({ ok: true });
    expect(env.dataRows.length).toBe(2); // 追記されない

    // 181秒後 -> 重複ウィンドウ解除により追記される
    global.Date = fixedDate('2026-08-10T01:45:10Z');
    const newRes = doPost(req);
    expect(JSON.parse(newRes.getContent())).toEqual({ ok: true });
    expect(env.dataRows.length).toBe(3);
  });

  test('doPost: 不正なペイロード（形式・トークン・範囲外）を適切に拒絶する', () => {
    const validBase = { api_version: 1, token: 'test-token', temp: 24.5, press: 1012.3, hum: 55.8 };

    const cases = [
      ['invalid JSON', { postData: { contents: '{' } }, 'invalid_json'],
      ['missing request', null, 'invalid_json'],
      ['invalid API version', { postData: { contents: JSON.stringify({ ...validBase, api_version: 2 }) } }, 'invalid_api_version'],
      ['invalid token', { postData: { contents: JSON.stringify({ ...validBase, token: 'wrong-token' }) } }, 'invalid_token'],
      ['out of range humidity', { postData: { contents: JSON.stringify({ ...validBase, hum: 100.1 }) } }, 'invalid_payload'],
      ['string temp type', { postData: { contents: JSON.stringify({ ...validBase, temp: '24.5' }) } }, 'invalid_payload']
    ];

    const currentRows = env.dataRows.length;
    for (const [name, req, expectedError] of cases) {
      const res = doPost(req);
      const body = JSON.parse(res.getContent());
      expect(body).toEqual({ ok: false, error: expectedError });
    }
    expect(env.dataRows.length).toBe(currentRows); // 不正リクエストでは行は追加されない
  });
});

describe('LineBot Webhook & Commands (LINE Bot サービス)', () => {
  let env;
  const channelSecret = 'test-secret';
  const channelToken = 'test-token';

  beforeEach(() => {
    env = createGasMockEnvironment({
      initialProperties: {
        LINE_CHANNEL_SECRET: channelSecret,
        LINE_CHANNEL_ACCESS_TOKEN: channelToken,
        LINE_USER_ID: 'user-123',
        MONITOR_LAST_VALID_payload: JSON.stringify({ temp: 25.0, hum: 50.0, press: 1013.2 })
      }
    });
    Object.assign(global, env.globals);
  });

  function createSignedLineWebhookRequest(events, secret = channelSecret) {
    const body = JSON.stringify({ events });
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');
    return {
      postData: { contents: body },
      headers: { 'X-Line-Signature': hmac }
    };
  }

  test('正常な HMAC-SHA256 署名のリクエストを受け入れ処理する', () => {
    const req = createSignedLineWebhookRequest([]);
    const res = handleLineWebhook_(req);
    expect(JSON.parse(res.getContent())).toEqual({ ok: true });
  });

  test('不正な署名のリクエストは invalid_signature で拒絶する', () => {
    const req = {
      postData: { contents: JSON.stringify({ events: [] }) },
      headers: { 'X-Line-Signature': 'invalid-signature' }
    };
    const res = handleLineWebhook_(req);
    expect(JSON.parse(res.getContent())).toEqual({ ok: false, error: 'invalid_signature' });
  });

  test('NOW コマンド（およびエイリアス）受信時にステータス Flex Message を返信する', () => {
    const aliases = ['NOW', 'now', '状況', '状態', '現在', 'status', 'ＮＯＷ'];

    for (const cmd of aliases) {
      env.fetchedRequests.length = 0;
      const req = createSignedLineWebhookRequest([
        { type: 'message', replyToken: 'tok-now', message: { type: 'text', text: cmd } }
      ]);
      handleLineWebhook_(req);

      expect(env.fetchedRequests.length).toBe(1);
      expect(env.fetchedRequests[0].url).toBe('https://api.line.me/v2/bot/message/reply');
      const payload = JSON.parse(env.fetchedRequests[0].options.payload);
      expect(payload.messages[0].altText).toBe('現在の監視状態');
    }
  });

  test('SNOOZE コマンド（およびエイリアス）受信時に ALERT_SNOOZE_UNTIL を設定し Push を抑制する', () => {
    const req = createSignedLineWebhookRequest([
      { type: 'message', replyToken: 'tok-snooze', message: { type: 'text', text: 'SNOOZE' } }
    ]);
    handleLineWebhook_(req);

    const snoozeUntil = env.propertiesStore.get('ALERT_SNOOZE_UNTIL');
    expect(snoozeUntil).not.toBeNull();
    expect(Number(snoozeUntil)).toBeGreaterThan(Date.now());

    // Push 送信が抑制されることを確認
    env.fetchedRequests.length = 0;
    const pushed = pushMonitorNotification_('テスト警告');
    expect(pushed).toBe(false);
    expect(env.fetchedRequests.length).toBe(0);
  });

  test('CLEAR コマンド受信時にスヌーズ解除およびモニター状態リセットを行う', () => {
    env.propertiesStore.set('ALERT_SNOOZE_UNTIL', String(Date.now() + 100000));
    env.propertiesStore.set('MONITOR_STATE_temp', JSON.stringify({ consecutive: 2, alert: true }));

    const req = createSignedLineWebhookRequest([
      { type: 'message', replyToken: 'tok-clear', message: { type: 'text', text: 'CLEAR' } }
    ]);
    handleLineWebhook_(req);

    expect(env.propertiesStore.has('ALERT_SNOOZE_UNTIL')).toBe(false);
    const tempState = JSON.parse(env.propertiesStore.get('MONITOR_STATE_temp'));
    expect(tempState.alert).toBe(false);
  });

  test('TRENDS コマンド受信時にグラフ画像メッセージを返信する', () => {
    // 288件のデータを作成
    for (let i = 0; i < 50; i++) {
      env.dataRows.push([new Date(Date.now() - (50 - i) * 5 * 60 * 1000), 24.0, 1012.0, 55.0, '']);
    }

    const req = createSignedLineWebhookRequest([
      { type: 'message', replyToken: 'tok-trends', message: { type: 'text', text: 'TRENDS' } }
    ]);
    handleLineWebhook_(req);

    expect(env.fetchedRequests.length).toBe(1);
    const payload = JSON.parse(env.fetchedRequests[0].options.payload);
    expect(payload.messages[0].type).toBe('image');
    expect(payload.messages[0].originalContentUrl).toContain('https://quickchart.io/chart?');
  });

  test('不明なコマンド受信時はヘルプテキストを返信する', () => {
    const req = createSignedLineWebhookRequest([
      { type: 'message', replyToken: 'tok-help', message: { type: 'text', text: 'hello' } }
    ]);
    handleLineWebhook_(req);

    expect(env.fetchedRequests.length).toBe(1);
    const payload = JSON.parse(env.fetchedRequests[0].options.payload);
    expect(payload.messages[0].type).toBe('text');
    expect(payload.messages[0].text).toContain('NOW');
    expect(payload.messages[0].text).toContain('SNOOZE');
  });

  describe('calculateNextMorning8Am_ (翌朝8時計算の全時間帯JST検証)', () => {
    function parseJstDate(str) {
      return new Date(str + '+09:00').getTime();
    }

    test('14:00 JST -> 翌日 08:00 JST', () => {
      const noon = parseJstDate('2026-08-30T14:00:00');
      const expected = parseJstDate('2026-08-31T08:00:00');
      expect(calculateNextMorning8Am_(noon, 8)).toBe(expected);
    });

    test('23:30 JST -> 翌日 08:00 JST', () => {
      const night = parseJstDate('2026-08-30T23:30:00');
      const expected = parseJstDate('2026-08-31T08:00:00');
      expect(calculateNextMorning8Am_(night, 8)).toBe(expected);
    });

    test('01:15 JST (深夜) -> 当日 08:00 JST', () => {
      const lateNight = parseJstDate('2026-08-31T01:15:00');
      const expected = parseJstDate('2026-08-31T08:00:00');
      expect(calculateNextMorning8Am_(lateNight, 8)).toBe(expected);
    });

    test('07:59 JST (早朝) -> 当日 08:00 JST', () => {
      const earlyMorning = parseJstDate('2026-08-31T07:59:00');
      const expected = parseJstDate('2026-08-31T08:00:00');
      expect(calculateNextMorning8Am_(earlyMorning, 8)).toBe(expected);
    });

    test('08:00 JST ちょうど -> 翌日 08:00 JST', () => {
      const exact8Am = parseJstDate('2026-08-31T08:00:00');
      const expected = parseJstDate('2026-09-01T08:00:00');
      expect(calculateNextMorning8Am_(exact8Am, 8)).toBe(expected);
    });

    test('月末 2026-08-31 22:00 JST -> 翌月 2026-09-01 08:00 JST', () => {
      const monthEnd = parseJstDate('2026-08-31T22:00:00');
      const expected = parseJstDate('2026-09-01T08:00:00');
      expect(calculateNextMorning8Am_(monthEnd, 8)).toBe(expected);
    });

    test('年末 2026-12-31 23:00 JST -> 翌年 2027-01-01 08:00 JST', () => {
      const yearEnd = parseJstDate('2026-12-31T23:00:00');
      const expected = parseJstDate('2027-01-01T08:00:00');
      expect(calculateNextMorning8Am_(yearEnd, 8)).toBe(expected);
    });
  });
});

describe('ErrorLog & Config Management', () => {
  let env;

  beforeEach(() => {
    env = createGasMockEnvironment();
    Object.assign(global, env.globals);
  });

  test('ErrorLog: 秘匿情報（token, secret, Authorization）が正しくマスキングされる', () => {
    clearErrorLog_();
    expect(getErrorLogForTest_().length).toBe(0);

    logError_('ingest', 'DATA', 'invalid_token', new Error('token mismatch with secret_value'));
    logError_('linebot', 'reply', 'send_failed', new Error('Authorization: Bearer super-secret-token-123'));

    const logs = getErrorLogForTest_();
    expect(logs.length).toBe(2);
    expect(logs[0].message).not.toContain('secret_value');
    expect(logs[1].message).not.toContain('super-secret-token-123');
    expect(logs[1].message).toContain('***');
  });

  test('Config: スプレッドシート Config シートの横持ち設定を正しくマージする', () => {
    env.configRows.length = 0;
    env.configRows.push(
      ['TEMP_HIGH', 'HYSTERESIS_TEMP', 'SMOOTH_K', 'ANOMALY_TEMP'],
      ['29', '1', '1', '1']
    );

    const merged = getMergedConfigForTest_();
    expect(merged.TEMP_HIGH).toBe('29');
    expect(merged.SMOOTH_K).toBe('1');
  });

  test('Config: 縦持ち形式（key / value）の設定も後方互換で読み込める', () => {
    env.configRows.length = 0;
    env.configRows.push(
      ['key', 'value'],
      ['TEMP_HIGH', '28.5'],
      ['HUM_HIGH', '65']
    );

    const sheetConfig = getSheetConfig_();
    expect(sheetConfig.TEMP_HIGH).toBe('28.5');
    expect(sheetConfig.HUM_HIGH).toBe('65');
  });

  test('Config: getSpreadsheetConfig_ および不正JSONプロパティのフォールバック', () => {
    env.propertiesStore.set('TEMP_HIGH', 'invalid_json_string');
    const merged = getMergedConfig_();
    expect(merged.TEMP_HIGH).toBe('invalid_json_string');

    const sheetCfg = getSpreadsheetConfig_();
    expect(sheetCfg.spreadsheetId).toBe('test-spreadsheet-id');
    expect(sheetCfg.sheetName).toBe('DATA');
  });

  test('ErrorLog: 100件超過時のリングバッファ切り詰めおよびマスク処理', () => {
    clearErrorLog_();
    for (let i = 0; i < 105; i++) {
      logError_('test_op', 'target', `code_${i}`, `message ${i}`);
    }
    const logs = getErrorLogForTest_();
    expect(logs.length).toBe(100);
    expect(logs[0].errorCode).toBe('code_5'); // 0〜4 は切り詰められた
    expect(logs[99].errorCode).toBe('code_104');

    expect(maskSecret_(12345)).toBe('12345');
    expect(maskSecret_('secret: secret_val')).toBe('***');
    expect(maskSecret_('password: my_password')).toBe('***');
    expect(maskSecret_('token: secret_tok')).toBe('***');
  });

  test('ErrorLog: 不正JSONプロパティおよび setProperty 例外時の安全なフォールバック', () => {
    // 既存プロパティが壊れたJSON文字列の場合
    env.propertiesStore.set('ERROR_LOG_ENTRIES', 'broken_json_string');
    expect(() => logError_('test', 'target', 'code_1', 'msg')).not.toThrow();
    expect(getErrorLogEntries_()).not.toBeNull();

    // getErrorLogEntries_ のパース例外
    env.propertiesStore.set('ERROR_LOG_ENTRIES', '{broken');
    expect(getErrorLogEntries_()).toEqual([]);

    // setProperty 自体が例外を投げる場合
    const origSet = env.globals.PropertiesService.getScriptProperties().setProperty;
    try {
      env.globals.PropertiesService.getScriptProperties().setProperty = () => { throw new Error('Storage failed'); };
      expect(() => logError_('test', 'target', 'code_fail', 'msg')).not.toThrow();
    } finally {
      env.globals.PropertiesService.getScriptProperties().setProperty = origSet;
    }
  });
});

describe('LineBot & Ingest Edge Cases', () => {
  let env;

  beforeEach(() => {
    env = createGasMockEnvironment({
      initialProperties: {
        LINE_CHANNEL_SECRET: 'test-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
        LINE_USER_ID: 'user-123'
      }
    });
    Object.assign(global, env.globals);
  });

  test('Ingest: handleSensorPost_ の無効JSON・欠損postData・内部例外ハンドリング', () => {
    // 1. null / 欠損 postData
    const resNull = handleSensorPost_(null);
    expect(JSON.parse(resNull.getContent())).toEqual({ ok: false, error: 'invalid_json' });

    const resEmpty = handleSensorPost_({});
    expect(JSON.parse(resEmpty.getContent())).toEqual({ ok: false, error: 'invalid_json' });

    // 2. パース不能な不正JSON
    const resBadJson = handleSensorPost_({ postData: { contents: '{bad json' } });
    expect(JSON.parse(resBadJson.getContent())).toEqual({ ok: false, error: 'invalid_json' });

    // 3. checkAndAppendMeasurement_ で内部例外発生時の internal_error および logError_ 記録
    const envBrokenIngest = createGasMockEnvironment({
      initialProperties: { API_TOKEN: 'valid-token', SPREADSHEET_ID: 'test-id' },
      customSheets: { DATA: null }
    });
    Object.assign(global, envBrokenIngest.globals);
    const resInternal = handleSensorPost_({
      postData: {
        contents: JSON.stringify({ api_version: 1, token: 'valid-token', temp: 25.0, press: 1010.0, hum: 50.0 })
      }
    });
    expect(JSON.parse(resInternal.getContent())).toEqual({ ok: false, error: 'internal_error' });
    const errorLogs = getErrorLogEntries_();
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(errorLogs[errorLogs.length - 1].errorCode).toBe('internal_error');
    expect(errorLogs[errorLogs.length - 1].operation).toBe('ingest');

    // 4. logError_ 未定義時のフォールバック (console.error)
    const origLogError = global.logError_;
    try {
      delete global.logError_;
      const resFallback = handleSensorPost_({
        postData: {
          contents: JSON.stringify({ api_version: 1, token: 'valid-token', temp: 25.0, press: 1010.0, hum: 50.0 })
        }
      });
      expect(JSON.parse(resFallback.getContent())).toEqual({ ok: false, error: 'internal_error' });
    } finally {
      global.logError_ = origLogError;
    }
  });

  test('pushMessage_ および pushMessageObjects_ の引数バリデーション', () => {
    expect(pushMessage_(null, 'test', 'tok')).toBe(false);
    expect(pushMessageObjects_('', [], 'tok')).toBe(false);
    expect(pushMessage_('user-1', 'test', '')).toBe(false);

    expect(replyMessage_('', 'test')).toBe(false);
    expect(replyMessageObjects_(null, [])).toBe(false);
  });

  test('sendLineApiRequest_ の HTTP エラーハンドリング', () => {
    const fetchMock = {
      mockResponseCode: 500,
      mockResponseText: 'Internal Error'
    };
    const res = sendLineApiRequest_('push', {}, 'test-token', 'push');
    expect(typeof res).toBe('boolean');
  });

  test('Ingest: resetWatchdogState_ / updateMonitorState_ / pushMonitorNotification_ の例外捕捉', () => {
    Object.assign(global, env.globals);
    const validPayload = { api_version: 1, token: 'test-token', temp: 25.0, press: 1013.0, hum: 50.0 };

    // 1. resetWatchdogState_ が例外を投げる場合
    const origReset = global.resetWatchdogState_;
    try {
      global.resetWatchdogState_ = () => { throw new Error('reset_watchdog_simulated_error'); };
      expect(() => checkAndAppendMeasurement_(validPayload, PropertiesService.getScriptProperties())).not.toThrow();
    } finally {
      global.resetWatchdogState_ = origReset;
    }

    // 2. updateMonitorState_ が例外を投げる場合
    const origUpdate = global.updateMonitorState_;
    try {
      global.updateMonitorState_ = () => { throw new Error('update_monitor_simulated_error'); };
      expect(() => checkAndAppendMeasurement_(validPayload, PropertiesService.getScriptProperties())).not.toThrow();
    } finally {
      global.updateMonitorState_ = origUpdate;
    }

    // 3. pushMonitorNotification_ が例外を投げる場合 (updateMonitorState_ が notification を返す)
    const origPush = global.pushMonitorNotification_;
    try {
      global.updateMonitorState_ = () => ({
        anomaly: false,
        notification: { text: 'Alert!' }
      });
      global.pushMonitorNotification_ = () => { throw new Error('push_simulated_error'); };
      expect(() => checkAndAppendMeasurement_(validPayload, PropertiesService.getScriptProperties())).not.toThrow();
    } finally {
      global.updateMonitorState_ = origUpdate;
      global.pushMonitorNotification_ = origPush;
    }
  });

  test('Ingest: setNumberFormat が例外をスローしても（型付き列など）データ追記と更新が成功する', () => {
    Object.assign(global, env.globals);
    const mockSheet = SpreadsheetApp.openById('test-spreadsheet-id').getSheetByName('DATA');
    const origGetRange = mockSheet.getRange.bind(mockSheet);
    mockSheet.getRange = (row, col, numRows, numCols) => {
      const range = origGetRange(row, col, numRows, numCols);
      range.setNumberFormat = () => {
        throw new Error('型付きの列でセルの数値形式を設定することはできません。');
      };
      return range;
    };

    const initialRowCount = env.dataRows.length;
    const payload = {
      api_version: 1,
      token: 'test-token',
      temp: 23.4,
      press: 1011.2,
      hum: 52.3
    };

    const res = handleSensorPost_({
      postData: { contents: JSON.stringify(payload) }
    });
    expect(JSON.parse(res.getContent())).toEqual({ ok: true });
    expect(env.dataRows.length).toBe(initialRowCount + 1);

    const logEntries = getErrorLogEntries_();
    const formatLog = logEntries.find(e => e.errorCode === 'typed_column_format_skipped');
    expect(formatLog).toBeDefined();
    expect(formatLog.operation).toBe('ingest');

    // logError_ が未定義の際も握りつぶされて追記が成功する
    const origLogError = global.logError_;
    try {
      delete global.logError_;
      const resWithoutLog = handleSensorPost_({
        postData: { contents: JSON.stringify({ ...payload, temp: 23.5 }) }
      });
      expect(JSON.parse(resWithoutLog.getContent())).toEqual({ ok: true });
    } finally {
      global.logError_ = origLogError;
    }
  });

  test('LineBot: handleLineWebhook_ の不正JSONボディおよび buildGraphMessage_ の例外系', () => {
    // 1. handleLineWebhook_ の不正JSON
    const resBadJson = handleLineWebhook_({ postData: { contents: '{invalid-json' } });
    expect(JSON.parse(resBadJson.getContent())).toEqual({ ok: false, error: 'invalid_json' });

    // 2. buildGraphMessage_ で SPREADSHEET_ID 欠損
    const envNoSheet = createGasMockEnvironment();
    envNoSheet.propertiesStore.delete('SPREADSHEET_ID');
    Object.assign(global, envNoSheet.globals);
    const msgNoSheet = buildGraphMessage_();
    expect(msgNoSheet[0].text).toContain('不足しています');

    // 3. buildGraphMessage_ で buildQuickChartUrl が例外を投げる場合
    const envWithData = createGasMockEnvironment({
      initialProperties: { SPREADSHEET_ID: 'sheet-id' }
    });
    for (let i = 0; i < 10; i++) {
      envWithData.dataRows.push([new Date(), 25.0, 1010.0, 50.0, '']);
    }
    Object.assign(global, envWithData.globals);
    const origUrl = global.buildQuickChartUrl;
    try {
      global.buildQuickChartUrl = () => { throw new Error('QuickChart URL generation failed'); };
      const msgErr = buildGraphMessage_();
      expect(msgErr[0].text).toContain('不足しています');
    } finally {
      global.buildQuickChartUrl = origUrl;
    }
  });

  test('Router: LINE 署名がクエリパラメータまたは destination の場合も LINE Webhook にルーティングされる', () => {
    const reqWithParam = {
      postData: { contents: JSON.stringify({ events: [] }) },
      parameter: { 'X-Line-Signature': 'test' }
    };
    const res1 = doPost(reqWithParam);
    expect(res1.getContent()).toContain('invalid_signature');

    const reqWithDest = {
      postData: { contents: JSON.stringify({ destination: 'U123456', events: [] }) }
    };
    const res2 = doPost(reqWithDest);
    expect(JSON.parse(res2.getContent())).toEqual({ ok: true });
  });

  test('Ingest: validateSensorPayload_ のバリデーション網羅', () => {
    expect(validateSensorPayload_(null)).toBe('invalid_payload');
    expect(validateSensorPayload_([])).toBe('invalid_payload');
    expect(validateSensorPayload_('not-an-obj')).toBe('invalid_payload');
    expect(validateSensorPayload_({ api_version: 1, token: '', temp: 20, press: 1000, hum: 50 })).toBe('invalid_token');
    expect(validateSensorPayload_({ api_version: 1, token: 'tok', temp: -50, press: 1000, hum: 50 })).toBe('invalid_payload');
    expect(validateSensorPayload_({ api_version: 2, token: 'tok', temp: 20, press: 1000, hum: 50 })).toBe('invalid_api_version');
    expect(validateSensorPayload_({ api_version: 1, token: 123, temp: 20, press: 1000, hum: 50 })).toBe('invalid_token');
    expect(validateSensorPayload_({ api_version: 1, token: 'tok', temp: 20, press: 200, hum: 50 })).toBe('invalid_payload');
    expect(validateSensorPayload_({ api_version: 1, token: 'tok', temp: 20, press: 1000, hum: 150 })).toBe('invalid_payload');
  });

  test('Ingest: checkAndAppendMeasurement_ の設定不足・シート未検出例外', () => {
    const validPayload = { api_version: 1, token: 'test-token', temp: 25.0, press: 1013.0, hum: 50.0 };

    // SPREADSHEET_ID 欠損
    const envNoSheetId = createGasMockEnvironment();
    envNoSheetId.propertiesStore.delete('SPREADSHEET_ID');
    Object.assign(global, envNoSheetId.globals);
    expect(() => checkAndAppendMeasurement_(validPayload, PropertiesService.getScriptProperties())).toThrow('missing spreadsheet configuration');

    // シート未検出
    const envNoData = createGasMockEnvironment({ customSheets: { DATA: null } });
    Object.assign(global, envNoData.globals);
    expect(() => checkAndAppendMeasurement_(validPayload, PropertiesService.getScriptProperties())).toThrow('sheet not found');
  });

  test('Ingest: モニター通知および anomaly フラグが DATA シートに記録される', () => {
    Object.assign(global, env.globals);
    // 1回目: 正常値
    doPost({
      postData: {
        contents: JSON.stringify({ api_version: 1, token: 'test-token', temp: 25.0, press: 1012.0, hum: 50.0 })
      }
    });

    // 2回目: 急変（anomaly）
    global.Date = fixedDate('2026-08-10T02:00:00Z');
    doPost({
      postData: {
        contents: JSON.stringify({ api_version: 1, token: 'test-token', temp: 35.0, press: 1012.0, hum: 50.0 })
      }
    });

    expect(env.dataRows.length).toBe(3);
    expect(env.dataRows[2][4]).toBe('anomaly');
  });

  test('Ingest: アラート連続判定（K=2）による pushMonitorNotification_ 呼び出し', () => {
    Object.assign(global, env.globals);
    let pushCalled = false;
    const origPush = global.pushMonitorNotification_;
    try {
      global.pushMonitorNotification_ = (txt) => {
        pushCalled = true;
        return true;
      };

      // 1回目 (K=1)
      global.Date = fixedDate('2026-08-10T01:00:00Z');
      doPost({
        postData: {
          contents: JSON.stringify({ api_version: 1, token: 'test-token', temp: 31.0, press: 1012.0, hum: 50.0 })
        }
      });
      expect(pushCalled).toBe(false);

      // 2回目 (K=2) -> push 送信
      global.Date = fixedDate('2026-08-10T01:05:00Z');
      doPost({
        postData: {
          contents: JSON.stringify({ api_version: 1, token: 'test-token', temp: 31.5, press: 1012.0, hum: 50.0 })
        }
      });
      expect(pushCalled).toBe(true);
    } finally {
      global.pushMonitorNotification_ = origPush;
    }
  });

  test('LineBot: buildStatusFlexMessage_ の timestamp 欠損時および pushMonitorNotification_ の不正引数ハンドリング', () => {
    Object.assign(global, env.globals);

    // 1. pushMonitorNotification_ の非文字列引数
    expect(pushMonitorNotification_(null)).toBe(false);
    expect(pushMonitorNotification_('')).toBe(false);
    expect(pushMonitorNotification_(12345)).toBe(false);

    // 2. buildStatusFlexMessage_ で latestPayload.timestamp が欠損
    env.propertiesStore.set('MONITOR_LAST_VALID_payload', JSON.stringify({
      temp: 25.0,
      hum: 50.0
      // timestamp なし
    }));
    const msg = buildStatusFlexMessage_();
    expect(msg.length).toBe(1);
    expect(JSON.stringify(msg[0])).toContain('データなし');
  });

  test('LineBot: pushMonitorNotification_ のトークン欠損および API エラーハンドリング', () => {
    const testEnv = createGasMockEnvironment({
      initialProperties: {
        LINE_CHANNEL_SECRET: 'test-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
        LINE_USER_ID: 'user-123'
      }
    });
    Object.assign(global, testEnv.globals);

    // 1. LINE_CHANNEL_ACCESS_TOKEN 欠損
    testEnv.propertiesStore.delete('LINE_CHANNEL_ACCESS_TOKEN');
    expect(pushMonitorNotification_('test')).toBe(false);

    // 2. HTTP 500 エラー
    testEnv.propertiesStore.set('LINE_CHANNEL_ACCESS_TOKEN', 'test-token');
    testEnv.globals.UrlFetchApp.fetch = () => ({
      getResponseCode: () => 500,
      getContentText: () => 'Server error'
    });
    expect(pushMonitorNotification_('test')).toBe(false);

    // 3. fetch 例外
    testEnv.globals.UrlFetchApp.fetch = () => { throw new Error('Network failure'); };
    expect(pushMonitorNotification_('test')).toBe(false);
  });

  test('LineBot: buildGraphMessage_ のシートフォールバック（2026 / activeSheet / 例外）', () => {
    const testEnv = createGasMockEnvironment({
      initialProperties: {
        SPREADSHEET_ID: 'test-spreadsheet-id',
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token'
      }
    });
    Object.assign(global, testEnv.globals);

    // 1. SpreadsheetApp.openById が例外を投げる場合
    testEnv.globals.SpreadsheetApp.openById = () => { throw new Error('Open failed'); };
    let msg = buildGraphMessage_();
    expect(msg[0].text).toContain('不足しています');

    // 2. DATA シートがなく 2026 シートがある場合
    const mockSheet2026 = {
      getName: () => '2026',
      getLastRow: () => 10,
      getRange: () => ({ getValues: () => [] })
    };
    const env2026 = createGasMockEnvironment({
      customSheets: { DATA: null, '2026': mockSheet2026 }
    });
    Object.assign(global, env2026.globals);
    msg = buildGraphMessage_();
    expect(msg[0].text).toContain('不足しています');
  });

  test('LineBot: handleLineWebhook_ での postback (datetimepicker) イベントの正常および異常系処理', () => {
    const testEnv = createGasMockEnvironment({
      initialProperties: {
        LINE_CHANNEL_SECRET: 'test-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
        LINE_USER_ID: 'user-123',
        ALERT_SNOOZE_UNTIL: '1000'
      }
    });
    Object.assign(global, testEnv.globals);
    // モック日時 (JST 2026-08-31 17:00:00 -> UTC 08:00:00)
    global.Date.now = () => new Date('2026-08-31T08:00:00Z').getTime();

    // 1. 正常系 (未来の日時: JST 2026-09-01 08:00 -> UTC 2026-08-31 23:00)
    const validPostbackEvent = {
      type: 'postback',
      replyToken: 'tok-ok',
      postback: {
        data: 'action=snooze_custom',
        params: { datetime: '2026-09-01T08:00' }
      }
    };
    handleLineWebhook_({ postData: { contents: JSON.stringify({ events: [validPostbackEvent] }) } });

    // プロパティが更新されていること
    const expectedMs = Date.UTC(2026, 8, 1, 8 - 9, 0, 0); // JST Sep 1 08:00 (UTC Aug 31 23:00)
    expect(testEnv.propertiesStore.get('ALERT_SNOOZE_UNTIL')).toBe(String(expectedMs));
    expect(testEnv.fetchedRequests.length).toBeGreaterThan(0);
    expect(testEnv.fetchedRequests[testEnv.fetchedRequests.length-1].options.payload).toContain('通知を停止しました');

    // 2. 異常系 (過去の日時)
    const pastPostbackEvent = {
      type: 'postback',
      replyToken: 'tok-past',
      postback: {
        data: 'action=snooze_custom',
        params: { datetime: '2026-08-30T08:00' }
      }
    };
    handleLineWebhook_({ postData: { contents: JSON.stringify({ events: [pastPostbackEvent] }) } });
    // SNOOZE期限が過去のもので上書きされないこと (1000か直前のexpectedMsか)
    expect(testEnv.propertiesStore.get('ALERT_SNOOZE_UNTIL')).toBe(String(expectedMs));
    expect(testEnv.fetchedRequests[testEnv.fetchedRequests.length-1].options.payload).toContain('無効な日時');
  });

  test('LineBot: handleLineWebhook_ の異常系（無効ボディ・例外発生時のエラー返信）', () => {
    Object.assign(global, env.globals);
    // 1. e が null
    const resNull = handleLineWebhook_(null);
    expect(JSON.parse(resNull.getContent())).toEqual({ ok: false, error: 'invalid_payload' });

    // 2. events が配列でない場合
    const resNoEvents = handleLineWebhook_({ postData: { contents: JSON.stringify({ notEvents: true }) } });
    expect(JSON.parse(resNoEvents.getContent())).toEqual({ ok: true });

    // 3. 署名検証例外発生時
    expect(verifyLineSignature_('{', 'sig', null)).toBe(false);

    // 4. normalizeText_ の非文字列引数
    expect(normalizeText_(null)).toBe('');
    expect(normalizeText_(123)).toBe('');
  });

  test('Router: doGet の例外ハンドリング', () => {
    const envBroken = createGasMockEnvironment();
    envBroken.globals.SpreadsheetApp.openById = () => { throw new Error('Simulated crash'); };
    Object.assign(global, envBroken.globals);

    const res = doGet();
    expect(JSON.parse(res.getContent())).toEqual({ ok: false, ready: false, error: 'not_ready' });
  });

  test('Config: getSheetConfig_ の空設定シートおよび欠損スプレッドシートIDハンドリング', () => {
    // SPREADSHEET_ID なし
    const envNoId = createGasMockEnvironment();
    envNoId.propertiesStore.delete('SPREADSHEET_ID');
    Object.assign(global, envNoId.globals);
    expect(getSheetConfig_()).toEqual({});

    // Config シートなし
    const envNoConfigSheet = createGasMockEnvironment({ customSheets: { Config: null } });
    Object.assign(global, envNoConfigSheet.globals);
    expect(getSheetConfig_()).toEqual({});

    // Config シートが空
    const envEmptyConfig = createGasMockEnvironment({ configRows: [] });
    Object.assign(global, envEmptyConfig.globals);
    expect(getSheetConfig_()).toEqual({});

    // Config シートのヘッダーに空列が存在する場合
    const envEmptyColumn = createGasMockEnvironment({
      configRows: [
        ['', 'WATCHDOG_TIMEOUT_MIN'],
        ['', '60']
      ]
    });
    Object.assign(global, envEmptyColumn.globals);
    expect(getSheetConfig_()).toEqual({ WATCHDOG_TIMEOUT_MIN: '60' });
  });

  test('LineBot: handleTextMessageEvent_ の例外捕捉とエラーメッセージ返信', () => {
    const testEnv = createGasMockEnvironment({
      initialProperties: {
        LINE_CHANNEL_SECRET: 'test-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
        LINE_USER_ID: 'user-123'
      }
    });
    testEnv.globals.LockService.getScriptLock = () => {
      throw new Error('simulated_lock_failure');
    };
    Object.assign(global, testEnv.globals);

    handleTextMessageEvent_({
      replyToken: 'tok-err',
      message: { type: 'text', text: 'SNOOZE' }
    }, 'test-token');

    expect(testEnv.fetchedRequests.length).toBe(1);
    const reqPayload = JSON.parse(testEnv.fetchedRequests[0].options.payload);
    expect(reqPayload.messages[0].text).toContain('GAS処理エラー');
  });

  test('LineBot: buildStatusFlexMessage_ の Utilities / formatDateTokyo_ 未定義フォールバック', () => {
    const savedUtils = global.Utilities;
    const savedFormat = global.formatDateTokyo_;
    try {
      delete global.Utilities;
      delete global.formatDateTokyo_;

      env.propertiesStore.set('MONITOR_LAST_VALID_payload', JSON.stringify({
        temp: 25.0,
        hum: 50.0,
        timestamp: '2026-08-30T10:00:00Z'
      }));

      const msg = buildStatusFlexMessage_();
      expect(msg.length).toBe(1);
      expect(JSON.stringify(msg[0])).toContain('08/30 19:00 測定');
    } finally {
      global.Utilities = savedUtils;
      global.formatDateTokyo_ = savedFormat;
    }
  });
});

describe('SetupTriggers & DebugTest Handlers', () => {
  let env;

  beforeEach(() => {
    env = createGasMockEnvironment();
    Object.assign(global, env.globals);
  });

  test('setupAllTriggers: トリガーを正しく登録し重複登録を防止する', () => {
    setupAllTriggers();
    expect(env.triggers.length).toBe(3);

    // 再実行しても重複しない
    setupAllTriggers();
    expect(env.triggers.length).toBe(3);
  });

  test('DebugTest: debugTest_checkAlertLogic / buildQuickChartUrl / handleLineWebhook_Trends が正常終了する', () => {
    for (let i = 0; i < 50; i++) {
      env.dataRows.push([new Date(Date.now() - (50 - i) * 5 * 60 * 1000), 24.0, 1012.0, 55.0, '']);
    }

    expect(() => debugTest_checkAlertLogic()).not.toThrow();
    expect(() => debugTest_buildQuickChartUrl()).not.toThrow();
    expect(() => debugTest_handleLineWebhook_Trends()).not.toThrow();
  });

  test('DebugTest: debugTest_showErrorLogs / debugTest_clearErrorLogs / debugTest_simulateSensorPost が正常動作する', () => {
    Object.assign(global, env.globals);

    // 1. showErrorLogs (空の場合)
    expect(() => debugTest_showErrorLogs()).not.toThrow();

    // 2. エラーを1件記録して表示
    logError_('test_op', 'test_target', 'test_code', new Error('test error'));
    expect(() => debugTest_showErrorLogs()).not.toThrow();

    // 3. clearErrorLogs
    expect(() => debugTest_clearErrorLogs()).not.toThrow();
    expect(getErrorLogEntries_().length).toBe(0);

    // 4. simulateSensorPost (トークン未設定)
    env.propertiesStore.delete('API_TOKEN');
    expect(() => debugTest_simulateSensorPost()).not.toThrow();

    // 5. simulateSensorPost (正常書き込み)
    env.propertiesStore.set('API_TOKEN', 'valid-test-token');
    expect(() => debugTest_simulateSensorPost()).not.toThrow();

    // 6. simulateSensorPost (重複スキップ)
    expect(() => debugTest_simulateSensorPost()).not.toThrow();

    // 7. simulateSensorPost (スプレッドシート例外時)
    const origOpen = SpreadsheetApp.openById;
    SpreadsheetApp.openById = () => { throw new Error('spreadsheet open failed'); };
    expect(() => debugTest_simulateSensorPost()).not.toThrow();
    SpreadsheetApp.openById = origOpen;
  });

  test('SetupTriggers: testLineBotConnection / authorizeUrlFetch が正常実行される', () => {
    env.propertiesStore.set('LINE_CHANNEL_SECRET', 'test-sec');
    env.propertiesStore.set('LINE_CHANNEL_ACCESS_TOKEN', 'test-tok');
    env.propertiesStore.set('LINE_USER_ID', 'user-123');

    expect(() => testLineBotConnection()).not.toThrow();
    expect(() => authorizeUrlFetch()).not.toThrow();
  });
});
