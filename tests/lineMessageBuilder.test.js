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
    test('スキップ完了カードが正しく生成され、CLEAR ボタンを含む', () => {
      const futureMs = Date.now() + 8 * 3600000;
      const messages = buildSkipFlexMessage_(futureMs);
      expect(messages.length).toBe(1);

      const bubble = messages[0].contents;
      expect(bubble.header.contents[0].text).toBe('🔕 SNOOZE設定完了');
      expect(bubble.footer.contents[0].action.text).toBe('CLEAR');
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
});
