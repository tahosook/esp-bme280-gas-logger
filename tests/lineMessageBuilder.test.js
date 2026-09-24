/**
 * tests/lineMessageBuilder.test.js
 *
 * QuickChart URL 生成（2,000文字制限クリア）および LINE Flex Message 構築の単体テストスイート
 */

const { createGasMockEnvironment, fixedDate } = require('./helpers/mockGasEnvironment');
const { generate24HourFullSensorRecords } = require('./fixtures/sensorData');

describe('QuickChart URL Generator (buildQuickChartUrl / buildQuickChartUrlFromRecords_)', () => {
  test('288行（24時間）のフルデータから間引きサンプリングされ、2,000文字未満のURLが生成される', () => {
    const records288 = generate24HourFullSensorRecords('2026-08-31');

    const chartUrl = buildQuickChartUrlFromRecords_(records288);

    expect(typeof chartUrl).toBe('string');
    expect(chartUrl.startsWith('https://quickchart.io/chart?')).toBe(true);
    expect(chartUrl).toContain('w=600');
    expect(chartUrl).toContain('h=360');
    expect(chartUrl).toContain('devicePixelRatio=2.0');

    // LINE Messaging API の URL 長さ上限は 2,000 文字
    expect(chartUrl.length).toBeLessThan(2000);

    // デコードして Chart.js 構造を検証
    const encodedConfig = chartUrl.split('&c=')[1];
    const config = JSON.parse(decodeURIComponent(encodedConfig));

    expect(config.type).toBe('line');
    expect(config.data.datasets.length).toBe(2);

    // データセット0: 気温 (赤 #ef4444)
    const tempDs = config.data.datasets[0];
    expect(tempDs.borderColor).toBe('#ef4444');
    expect(tempDs.yAxisID).toBe('yTemp');

    // データセット1: 湿度 (青 #3b82f6)
    const humDs = config.data.datasets[1];
    expect(humDs.borderColor).toBe('#3b82f6');
    expect(humDs.yAxisID).toBe('yHum');

    // サンプリング点数は 25〜40 点の範囲
    expect(config.data.labels.length).toBeGreaterThanOrEqual(25);
    expect(config.data.labels.length).toBeLessThanOrEqual(40);

    // 数値は小数第1位に丸められていること
    tempDs.data.forEach(val => {
      expect(typeof val).toBe('number');
      expect(val).toBe(Number(val.toFixed(1)));
    });
    humDs.data.forEach(val => {
      expect(typeof val).toBe('number');
      expect(val).toBe(Number(val.toFixed(1)));
    });
  });

  test('空データまたは不正なシートの場合は null を返す', () => {
    expect(buildQuickChartUrl(null)).toBeNull();
    expect(buildQuickChartUrl([])).toBeNull();
    expect(buildQuickChartUrlFromRecords_(null)).toBeNull();
    expect(buildQuickChartUrlFromRecords_([])).toBeNull();

    const emptySheetMock = {
      getLastRow: () => 1,
      getRange: () => { throw new Error('should not be called'); }
    };
    expect(buildQuickChartUrl(emptySheetMock)).toBeNull();
  });
});

describe('Flex Message Builders (LINE メッセージ構築)', () => {
  let env;

  beforeEach(() => {
    env = createGasMockEnvironment();
    Object.assign(global, env.globals);
  });

  describe('buildStatusFlexMessage_ (NOW コマンド)', () => {
    test('通常監視中（Active）: ヘッダーが緑色（#27ae60）で [SNOOZE, TRENDS] の2ボタン構成となる', () => {
      env.propertiesStore.set('MONITOR_LAST_VALID_payload', JSON.stringify({
        temp: 26.5,
        hum: 55.0,
        press: 1012.3,
        discomfortIndex: 74.0,
        timestamp: '2026-08-30T10:30:00.000Z'
      }));

      const messages = buildStatusFlexMessage_();
      expect(messages.length).toBe(1);

      const flex = messages[0];
      expect(flex.type).toBe('flex');
      expect(flex.altText).toBe('現在の監視状態');

      const bubble = flex.contents;
      expect(bubble.header.backgroundColor).toBe('#27ae60');
      expect(bubble.header.contents[0].text).toBe('🔔 監視中（Active）');

      // フッターボタン
      expect(bubble.footer.contents.length).toBe(2);
      expect(bubble.footer.contents[0].action.text).toBe('SNOOZE');
      expect(bubble.footer.contents[1].action.text).toBe('TRENDS');

      // ボディの項目チェック
      const bodyJson = JSON.stringify(bubble.body);
      expect(bodyJson).toContain('室温');
      expect(bodyJson).toContain('湿度');
      expect(bodyJson).toContain('気圧');
      expect(bodyJson).toContain('快適度');
      expect(bodyJson).toContain('測定');
      // 容積絶対湿度は削除されていること
      expect(bodyJson.includes('容積絶対湿度')).toBe(false);
    });

    test('SNOOZE中: ヘッダーが橙色（#e67e22）で停止期限が表示され、ボタンが [CLEAR] の1ボタン構成となる', () => {
      const futureMs = Date.now() + 3600000;
      env.propertiesStore.set('ALERT_SNOOZE_UNTIL', String(futureMs));
      env.propertiesStore.set('MONITOR_LAST_VALID_payload', JSON.stringify({
        temp: 28.0,
        hum: 65.0,
        press: 1010.0,
        timestamp: '2026-08-30T10:30:00.000Z'
      }));

      const messages = buildStatusFlexMessage_();
      const bubble = messages[0].contents;

      expect(bubble.header.backgroundColor).toBe('#e67e22');
      expect(bubble.header.contents[0].text).toBe('🔕 SNOOZE中');
      expect(bubble.header.contents[1].text).toContain('停止期限:');
      expect(bubble.footer.contents.length).toBe(1);
      expect(bubble.footer.contents[0].action.text).toBe('CLEAR');
    });

    test('直近3時間の気圧データが存在する場合の気圧傾向表示', () => {
      for (let i = 0; i < 40; i++) {
        env.dataRows.push([new Date(Date.now() - (40 - i) * 5 * 60 * 1000), 25.0, 1015.0 - (i * 0.1), 50.0, '']);
      }
      env.propertiesStore.set('MONITOR_LAST_VALID_payload', JSON.stringify({
        temp: 26.0,
        hum: 55.0,
        press: 1010.0,
        discomfortIndex: 75.0,
        timestamp: new Date().toISOString()
      }));

      const messages = buildStatusFlexMessage_();
      expect(messages.length).toBe(1);
      const bodyStr = JSON.stringify(messages[0].contents.body);
      expect(bodyStr).toContain('hPa');
    });
  });

  describe('buildSkipFlexMessage_ (SNOOZE コマンド完了)', () => {
    test('スキップ完了カードが正しく生成され、kiloサイズでdatetimepickerとCLEARボタンを含む', () => {
      const futureMs = Date.now() + 8 * 3600000;
      const messages = buildSkipFlexMessage_(futureMs);
      expect(messages.length).toBe(1);

      const bubble = messages[0].contents;
      expect(bubble.size).toBe('kilo');

      const bodyContents = bubble.body.contents;
      expect(bodyContents[0].text).toBe('🔕 通知を停止しました');
      expect(bodyContents[1].text).toContain('期限:');

      // datetimepicker button
      const dtBtn = bodyContents[3];
      expect(dtBtn.type).toBe('button');
      expect(dtBtn.action.type).toBe('datetimepicker');
      expect(dtBtn.action.data).toBe('action=snooze_custom');
      expect(dtBtn.action.mode).toBe('datetime');

      // CLEAR button
      const clearBtn = bodyContents[4];
      expect(clearBtn.type).toBe('button');
      expect(clearBtn.action.type).toBe('message');
      expect(clearBtn.action.text).toBe('CLEAR');
    });
  });

  describe('buildAlertFlexMessage_ (アラート通知カード)', () => {
    test('赤色ヘッダーと SNOOZE ボタンを含む警告カードが生成される', () => {
      const messages = buildAlertFlexMessage_('現在: 31.5 ℃ / 73 %');
      expect(messages.length).toBe(1);

      const bubble = messages[0].contents;
      expect(bubble.header.backgroundColor).toBe('#e74c3c');
      expect(bubble.header.contents[0].text).toBe('⚠️ 室温・湿度 警告');
      expect(bubble.body.contents[0].text).toBe('現在: 31.5 ℃ / 73 %');
      expect(bubble.footer.contents[0].action.text).toBe('SNOOZE');
    });
  });
});

describe('Metrics & Indicators Calculation (各種指標の計算)', () => {
  test('不快指数（DI）計算', () => {
    const di1 = calculateDiscomfortIndex_(25, 50);
    expect(Math.round(di1 * 10) / 10).toBe(71.8);

    const di2 = calculateDiscomfortIndex_(30, 70);
    expect(Math.round(di2 * 10) / 10).toBe(81.4);
  });

  test('絶対湿度（AH）計算', () => {
    const ah1 = calculateAbsoluteHumidity_(25, 50);
    expect(Math.round(ah1 * 10) / 10).toBe(11.5);

    const ah2 = calculateAbsoluteHumidity_(30, 70);
    expect(Math.round(ah2 * 10) / 10).toBe(21.3);
  });

  test('不快指数（DI）のカラー・ラベル分類', () => {
    expect(classifyDiscomfortIndex_(81).color).toBe('#e74c3c');
    expect(classifyDiscomfortIndex_(76).color).toBe('#e67e22');
    expect(classifyDiscomfortIndex_(70).color).toBe('#27ae60');
    expect(classifyDiscomfortIndex_(55).color).toBe('#3498db');
  });

  test('気圧傾向（calculatePressureTrend_）', () => {
    expect(calculatePressureTrend_(null, 1013.2)).toBe('安定');
    expect(calculatePressureTrend_(1008.4, 1010.5)).toBe('↘ -2.1/3h');
    expect(calculatePressureTrend_(1015.0, 1013.5)).toBe('↗ +1.5/3h');
    expect(calculatePressureTrend_(1013.2, 1013.2)).toBe('安定');
    expect(calculatePressureTrend_(1013.6, 1013.2)).toBe('→ +0.4/3h');
    expect(calculatePressureTrend_(1012.7, 1013.2)).toBe('→ -0.5/3h');
  });

  test('buildQuickChartConfig_ の直接生成と空配列ハンドリング', () => {
    expect(buildQuickChartConfig_([])).toBeNull();
    expect(buildQuickChartConfig_(null)).toBeNull();

    const records = [
      [new Date('2026-08-30T10:00:00Z'), 25.0, 1013, 50.0],
      ['2026-08-30T10:05:00Z', 25.5, 1013, 55.0]
    ];
    const config = buildQuickChartConfig_(records);
    expect(config).not.toBeNull();
    expect(config.width).toBe(600);
    expect(config.height).toBe(360);
    expect(config.chart.type).toBe('line');
    expect(config.chart.data.labels.length).toBe(2);
  });

  test('isSnoozeActive_ および formatSnoozeUntilJst_ の境界値', () => {
    const now = Date.now();
    expect(isSnoozeActive_(null, now)).toBe(false);
    expect(isSnoozeActive_('invalid', now)).toBe(false);
    expect(isSnoozeActive_(now - 1000, now)).toBe(false);
    expect(isSnoozeActive_(now + 10000, now)).toBe(true);

    expect(formatSnoozeUntilJst_(null)).toBe('');
    expect(formatSnoozeUntilJst_('invalid')).toBe('');
    const testDateMs = new Date('2026-08-31T08:00:00+09:00').getTime();
    expect(formatSnoozeUntilJst_(testDateMs)).toBe('08/31 08:00');

    // formatSnoozeUntilJst_ で formatDateTokyo_ が未定義の場合
    const savedFormat = global.formatDateTokyo_;
    try {
      delete global.formatDateTokyo_;
      expect(formatSnoozeUntilJst_(testDateMs)).toBe('08/31 08:00');

      const savedUtils = global.Utilities;
      try {
        delete global.Utilities;
        expect(formatSnoozeUntilJst_(testDateMs)).toBe('08/31 08:00');
      } finally {
        global.Utilities = savedUtils;
      }
    } finally {
      global.formatDateTokyo_ = savedFormat;
    }
  });

  test('calculateNextMorning8Am_ の引数デフォルト値（nowMs / targetHour 省略時）', () => {
    const next8 = calculateNextMorning8Am_();
    expect(typeof next8).toBe('number');
    expect(next8).toBeGreaterThan(Date.now() - 1000);
  });

  test('parseJstDatetimepicker_ が正しいJST解釈を行い、過去日時の場合はnullを返す', () => {
    const mockNow = new Date('2026-08-31T08:00:00Z').getTime(); // JSTでは 08-31 17:00

    // JSTとして '2026-09-01T08:00' をパース -> UTCでは '2026-08-31T23:00'
    const futureDt = parseJstDatetimepicker_('2026-09-01T08:00', mockNow);
    const expectedFutureMs = Date.UTC(2026, 8, 1, 8 - 9, 0, 0);
    expect(futureDt).toBe(expectedFutureMs);

    // 過去日時: JSTとして '2026-08-30T08:00' -> mockNowより前
    const pastDt = parseJstDatetimepicker_('2026-08-30T08:00', mockNow);
    expect(pastDt).toBeNull();

    // 無効な形式
    expect(parseJstDatetimepicker_('invalid', mockNow)).toBeNull();
    expect(parseJstDatetimepicker_(null, mockNow)).toBeNull();
  });

  describe('getPastPressureFromSheet_ & isValidPressureValue_', () => {
    test('isValidPressureValue_: 境界値と異常値の判定', () => {
      expect(isValidPressureValue_(1013.2)).toBe(true);
      expect(isValidPressureValue_(300.0)).toBe(true);
      expect(isValidPressureValue_(1100.0)).toBe(true);

      expect(isValidPressureValue_(299.9)).toBe(false);
      expect(isValidPressureValue_(1100.1)).toBe(false);
      expect(isValidPressureValue_(0)).toBe(false);
      expect(isValidPressureValue_(-100)).toBe(false);
      expect(isValidPressureValue_(NaN)).toBe(false);
      expect(isValidPressureValue_(Infinity)).toBe(false);
      expect(isValidPressureValue_(null)).toBe(false);
      expect(isValidPressureValue_('1013.2')).toBe(false);
    });

    test('getReferenceTimestampMs_ および findPastPressureFromRows_: タイムスタンプ基準の気圧探索', () => {
      expect(getReferenceTimestampMs_(null)).toBeNull();
      expect(getReferenceTimestampMs_([])).toBeNull();
      expect(getReferenceTimestampMs_([['invalid_date', 25, 1013, 50]])).toBeNull();
      expect(getReferenceTimestampMs_([], 12345)).toBe(12345);

      const baseTime = 1700000000000;
      expect(getReferenceTimestampMs_([[new Date(baseTime), 25, 1013, 50]])).toBe(baseTime);

      // findPastPressureFromRows_: 空または異常引数
      expect(findPastPressureFromRows_(null)).toBeNull();
      expect(findPastPressureFromRows_([])).toBeNull();
      expect(findPastPressureFromRows_([['invalid', 25, 1013, 50]])).toBeNull();

      // 1分間隔データ（200行: 0〜200分前）
      const oneMinuteRows = [];
      for (let m = 200; m >= 0; m--) {
        const rowTime = new Date(baseTime - m * 60 * 1000);
        oneMinuteRows.push([rowTime, 25.0, 1000.0 + m, 50.0]); // 180分前は 1000 + 180 = 1180 -> 範囲外にならないよう調整
      }
      // 気圧は 1013.0 + m * 0.1 とする
      const validOneMinRows = [];
      for (let m = 200; m >= 0; m--) {
        const rowTime = new Date(baseTime - m * 60 * 1000);
        validOneMinRows.push([rowTime, 25.0, 1000.0 + (m * 0.1), 50.0]);
      }
      // 180分前の気圧は 1000.0 + 18.0 = 1018.0
      const pastFrom1Min = findPastPressureFromRows_(validOneMinRows, 180, 90, 270, baseTime);
      expect(pastFrom1Min).toBe(1018.0);

      // 5分間隔データ（48行: 0〜240分前）
      const fiveMinuteRows = [];
      for (let m = 48; m >= 0; m--) {
        const rowTime = new Date(baseTime - m * 5 * 60 * 1000);
        fiveMinuteRows.push([rowTime, 25.0, 1000.0 + m, 50.0]);
      }
      // 180分前は 36サンプル前 (m = 36) -> 1000 + 36 = 1036.0
      const pastFrom5Min = findPastPressureFromRows_(fiveMinuteRows, 180, 90, 270, baseTime);
      expect(pastFrom5Min).toBe(1036.0);

      // 欠測ケース: 180分前がなく、175分前 (1015.0) と 190分前 (1020.0) がある場合
      const gapRows = [
        [new Date(baseTime - 175 * 60 * 1000), 25.0, 1015.0, 50.0],
        [new Date(baseTime - 190 * 60 * 1000), 25.0, 1020.0, 50.0],
        [new Date(baseTime), 25.0, 1013.0, 50.0]
      ];
      // 175分前 (|175-180| = 5) は 190分前 (|190-180| = 10) より近いため 1015.0 が選ばれる
      expect(findPastPressureFromRows_(gapRows, 180, 90, 270, baseTime)).toBe(1015.0);

      // 履歴不足: 30分前しかない（minMinutes = 90 未満）
      const shortRows = [
        [new Date(baseTime - 30 * 60 * 1000), 25.0, 1013.0, 50.0],
        [new Date(baseTime), 25.0, 1013.0, 50.0]
      ];
      expect(findPastPressureFromRows_(shortRows, 180, 90, 270, baseTime)).toBeNull();

      // 履歴古すぎ: 300分前しかない（maxMinutes = 270 超過）
      const oldRows = [
        [new Date(baseTime - 300 * 60 * 1000), 25.0, 1013.0, 50.0],
        [new Date(baseTime), 25.0, 1013.0, 50.0]
      ];
      expect(findPastPressureFromRows_(oldRows, 180, 90, 270, baseTime)).toBeNull();
    });

    test('getPastPressureFromSheet_: properties が null または SPREADSHEET_ID がない場合は null', () => {
      expect(getPastPressureFromSheet_(null)).toBeNull();
      expect(getPastPressureFromSheet_({})).toBeNull();
      const mockPropsEmpty = { getProperty: () => null };
      expect(getPastPressureFromSheet_(mockPropsEmpty)).toBeNull();
    });

    test('getPastPressureFromSheet_: 行数が不足している場合（< 2行）は null を返す', () => {
      const rows = [['日時', 'temp', 'press', 'hum', 'flag']];
      const env = createGasMockEnvironment({ dataRows: rows });
      Object.assign(global, env.globals);
      const props = env.globals.PropertiesService.getScriptProperties();
      expect(getPastPressureFromSheet_(props)).toBeNull();
    });

    test('getPastPressureFromSheet_: 5分間隔および1分間隔の双方で正常に約3時間前の気圧を取得できる', () => {
      const now = Date.now();
      // 5分間隔: 50行（行1はヘッダー、行2〜51がデータ）
      const rows5Min = [['日時', 'temp', 'press', 'hum', 'flag']];
      for (let i = 1; i <= 50; i += 1) {
        // 51行目が最新 (i = 50, now)、i = 14 は 36行前 (約180分前)
        rows5Min.push([new Date(now - (50 - i) * 5 * 60 * 1000), 25.0, 1000.0 + i, 50.0, '']);
      }
      let env = createGasMockEnvironment({ dataRows: rows5Min });
      Object.assign(global, env.globals);
      let props = env.globals.PropertiesService.getScriptProperties();

      // i = 14 (36サンプル前 = 180分前) の気圧は 1000 + 14 = 1014.0
      expect(getPastPressureFromSheet_(props)).toBe(1014.0);

      // 1分間隔: 200行
      const rows1Min = [['日時', 'temp', 'press', 'hum', 'flag']];
      for (let i = 1; i <= 200; i += 1) {
        // 201行目が最新 (i = 200, now)、i = 20 は 180行前 (180分前)
        rows1Min.push([new Date(now - (200 - i) * 60 * 1000), 25.0, 1000.0 + i, 50.0, '']);
      }
      env = createGasMockEnvironment({ dataRows: rows1Min });
      Object.assign(global, env.globals);
      props = env.globals.PropertiesService.getScriptProperties();

      // i = 20 (180分前) の気圧は 1000 + 20 = 1020.0
      expect(getPastPressureFromSheet_(props)).toBe(1020.0);
    });

    test('getPastPressureFromSheet_: セル値が非数値または範囲外の場合は null を返す', () => {
      const now = Date.now();
      const rows = [['日時', 'temp', 'press', 'hum', 'flag']];
      for (let i = 1; i <= 50; i += 1) {
        rows.push([new Date(now - (50 - i) * 5 * 60 * 1000), 25.0, 1013.0, 50.0, '']);
      }
      // 180分前（i = 14, 15行目）の気圧を異常値に設定
      rows[14][2] = 'CORRUPTED';
      // 他の行も異常値にしてフォールバックできないようにする
      for (let i = 1; i < rows.length - 1; i++) {
        rows[i][2] = 'CORRUPTED';
      }
      let env = createGasMockEnvironment({ dataRows: rows });
      Object.assign(global, env.globals);
      let props = env.globals.PropertiesService.getScriptProperties();
      expect(getPastPressureFromSheet_(props)).toBeNull();

      // 範囲外気圧値 (200.0 < 300)
      for (let i = 1; i < rows.length - 1; i++) {
        rows[i][2] = 200.0;
      }
      env = createGasMockEnvironment({ dataRows: rows });
      Object.assign(global, env.globals);
      props = env.globals.PropertiesService.getScriptProperties();
      expect(getPastPressureFromSheet_(props)).toBeNull();
    });

    test('getPastPressureFromSheet_: 例外発生時は安全に null を返す', () => {
      const env = createGasMockEnvironment();
      Object.assign(global, env.globals);
      const savedSpreadsheetApp = global.SpreadsheetApp;
      try {
        global.SpreadsheetApp = {
          openById: () => { throw new Error('Database connection failed'); }
        };
        const props = env.globals.PropertiesService.getScriptProperties();
        expect(getPastPressureFromSheet_(props)).toBeNull();
      } finally {
        global.SpreadsheetApp = savedSpreadsheetApp;
      }
    });
  });
});
