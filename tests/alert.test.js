/**
 * tests/alert.test.js
 *
 * アラート判定・優先順位制御・ヒステリシス・状態遷移・Watchdogの単体テストスイート
 */

const { createGasMockEnvironment, fixedDate } = require('./helpers/mockGasEnvironment');

describe('evaluateAlertDecision_ (アラート判定決定エンジン)', () => {
  const now = new Date('2026-08-31T14:00:00+09:00').getTime();
  const todayJst = '2026-08-31';

  test('正常域（閾値未満）は shouldAlert: false, reason: "normal"', () => {
    const res = evaluateAlertDecision_({
      temp: 25.0,
      hum: 50.0,
      press: 1013.2,
      isOverThreshold: false,
      nowMs: now,
      snoozeUntil: null,
      lastSentTime: null,
      dailyAlertInfo: null
    });
    expect(res.shouldAlert).toBe(false);
    expect(res.reason).toBe('normal');
  });

  describe('優先順位1: センサー異常値ガード', () => {
    test('気温が上限（50℃）を超過した場合はスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: 50.1,
        hum: 50.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('sensor_anomaly');
    });

    test('気温が下限（-10℃）を下回った場合はスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: -10.1,
        hum: 50.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('sensor_anomaly');
    });

    test('湿度が上限（100%）を超過した場合はスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: 25.0,
        hum: 100.1,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('sensor_anomaly');
    });

    test('湿度が下限（0%）を下回った場合はスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: 25.0,
        hum: -0.1,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('sensor_anomaly');
    });
  });

  describe('優先順位2: SNOOZE 優先制御', () => {
    test('ALERT_SNOOZE_UNTIL 有効期間中は閾値超過時でも無条件にスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: 31.0,
        hum: 75.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now,
        snoozeUntil: now + 3600000 // 1時間後までスヌーズ
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('snooze_active');
    });

    test('SNOOZE 期限が過去の場合はスヌーズ判定をパスする', () => {
      const res = evaluateAlertDecision_({
        temp: 31.0,
        hum: 75.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now,
        snoozeUntil: now - 1000 // 1秒前（期限切れ）
      });
      expect(res.shouldAlert).toBe(true);
      expect(res.reason).toBe('alert_triggered');
    });
  });

  describe('優先順位3: 1時間クールダウン', () => {
    test('前回送信から60分未満の場合はスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: 31.0,
        hum: 75.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now,
        lastSentTime: now - 30 * 60 * 1000, // 30分前
        dailyAlertInfo: { date: todayJst, count: 1 }
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('cooldown_active');
    });

    test('前回送信から60分以上の場合はアラートを許可する', () => {
      const res = evaluateAlertDecision_({
        temp: 31.0,
        hum: 75.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now,
        lastSentTime: now - 65 * 60 * 1000, // 65分前
        dailyAlertInfo: { date: todayJst, count: 1 }
      });
      expect(res.shouldAlert).toBe(true);
      expect(res.reason).toBe('alert_triggered');
    });
  });

  describe('優先順位4: 1日最大送信上限', () => {
    test('当日送信回数が上限（5回）に達した場合はスキップする', () => {
      const res = evaluateAlertDecision_({
        temp: 31.0,
        hum: 75.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now,
        lastSentTime: now - 70 * 60 * 1000,
        dailyAlertInfo: { date: todayJst, count: 5 }
      });
      expect(res.shouldAlert).toBe(false);
      expect(res.reason).toBe('daily_limit_reached');
    });

    test('日付が変更された場合は前日のカウントが5回でもリセットされ送信可能となる', () => {
      const res = evaluateAlertDecision_({
        temp: 31.0,
        hum: 75.0,
        press: 1013.2,
        isOverThreshold: true,
        nowMs: now,
        lastSentTime: now - 70 * 60 * 1000,
        dailyAlertInfo: { date: '2026-08-30', count: 5 } // 前日
      });
      expect(res.shouldAlert).toBe(true);
      expect(res.reason).toBe('alert_triggered');
    });
  });
});

describe('Monitor State Transitions & Hysteresis (状態遷移とヒステリシス)', () => {
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

  test('平滑化（K=2）: 1回目の閾値超過ではアラートにならず、2回連続で超過するとアラート発火する', () => {
    global.Date = fixedDate('2026-08-10T01:00:00Z');

    // 1回目: 29.5℃ (> 29.0) -> consecutive: 1, alert: false
    let result = updateMonitorState_({ temp: 29.5, hum: 50.0, press: 1013.0 });
    expect(result.states.temp.consecutive).toBe(1);
    expect(result.states.temp.alert).toBe(false);
    expect(result.notification).toBeNull();

    // 2回目: 29.8℃ (> 29.0) -> consecutive: 2, alert: true
    global.Date = fixedDate('2026-08-10T01:05:00Z');
    result = updateMonitorState_({ temp: 29.8, hum: 50.0, press: 1013.0 });
    expect(result.states.temp.consecutive).toBe(2);
    expect(result.states.temp.alert).toBe(true);
    expect(result.notification).not.toBeNull();
    expect(result.notification.text).toContain('29.8 ℃');
  });

  test('ヒステリシス判定: 29.0℃発火後、28.0℃以下になるまで通常状態に復帰しない', () => {
    global.Date = fixedDate('2026-08-10T01:00:00Z');
    updateMonitorState_({ temp: 29.5, hum: 50.0, press: 1013.0 });
    updateMonitorState_({ temp: 29.8, hum: 50.0, press: 1013.0 }); // alert active

    // 28.5℃ (29.0 未満だが 29.0 - 1.0 = 28.0 より高い) -> alert は維持
    global.Date = fixedDate('2026-08-10T02:10:00Z'); // クールダウン経過後
    let result = updateMonitorState_({ temp: 28.5, hum: 50.0, press: 1013.0 });
    expect(result.states.temp.alert).toBe(true);
    expect(result.states.temp.consecutive).toBe(0); // consecutive count はリセット

    // 27.9℃ (28.0 以下) -> 通常状態に復帰
    global.Date = fixedDate('2026-08-10T02:15:00Z');
    result = updateMonitorState_({ temp: 27.9, hum: 50.0, press: 1013.0 });
    expect(result.states.temp.alert).toBe(false);
    // 正常復帰時の通知は送信されないこと（廃止仕様）
    expect(result.notification).toBeNull();
  });

  test('不快指数（DI）のアラート発報とヒステリシス復帰', () => {
    // 湿度単独のアラートは100%設定により事実上無効化されたため、DIのヒステリシスのみを検証する。
    global.Date = fixedDate('2026-08-10T01:00:00Z');

    // 28.5℃ / 75% -> DI 79.82 (> 79.0) を2回連続で超過
    updateMonitorState_({ temp: 28.5, hum: 75.0, press: 1013.0 });
    let res = updateMonitorState_({ temp: 28.5, hum: 75.0, press: 1013.0 });
    expect(res.states.discomfortIndex.alert).toBe(true);

    // 27.5℃ / 75% -> DI 78.27 (79.0以下だが 79.0 - 1.0 = 78.0より高い) -> アラート維持
    // ※ 28.0℃ / 75% だと DI=79.04 となり、ヒステリシス幅(78.0〜79.0)ではなく単なる超過(>79.0)になってしまうため27.5℃を使用
    res = updateMonitorState_({ temp: 27.5, hum: 75.0, press: 1013.0 });
    expect(res.states.discomfortIndex.alert).toBe(true);

    // 25.0℃ / 75% -> DI 74.34 (78.0以下) -> 通常復帰
    res = updateMonitorState_({ temp: 25.0, hum: 75.0, press: 1013.0 });
    expect(res.states.discomfortIndex.alert).toBe(false);
  });

  test('旧設定からの移行: 湿度単独アラート状態(hum.alert=true)が残存していても、新設定(100%)では安全にクリアされること', () => {
    global.Date = fixedDate('2026-08-10T01:00:00Z');

    // 以前の設定（閾値70%等）で湿度が超過し、alert=true の状態がPropertiesに保存されていると仮定する
    env.propertiesStore.set('MONITOR_STATE_hum', JSON.stringify({ consecutive: 2, alert: true }));
    // 気温とDIは正常
    env.propertiesStore.set('MONITOR_STATE_temp', JSON.stringify({ consecutive: 0, alert: false }));
    env.propertiesStore.set('MONITOR_STATE_discomfortIndex', JSON.stringify({ consecutive: 0, alert: false }));

    // ケースA / B: 新しい閾値(100.0)のもとで、境界付近の95〜100%のデータを受信した場合
    // 古い復帰条件(100 - 5 = 95%)に基づけば96%は「復帰未達」としてalert=trueが維持されそうになるが、
    // 閾値100.0による無効化ロジックによって強制的にfalseへクリアされることを確認する。
    const testHumidities = [95.0, 97.0, 99.0, 100.0];

    testHumidities.forEach(humValue => {
      // 一度手動でPropertiesを汚染状態に戻す
      env.propertiesStore.set('MONITOR_STATE_hum', JSON.stringify({ consecutive: 2, alert: true }));
      let res = updateMonitorState_({ temp: 25.0, hum: humValue, press: 1013.0 });
      expect(res.states.hum.alert).toBe(false);
      expect(res.states.hum.consecutive).toBe(0);
      expect(res.notification).toBeNull();
    });

    // ケースC: 旧湿度アラートが残っている状態で、気温(またはDI)が新しく閾値を超えた場合
    env.propertiesStore.set('MONITOR_STATE_hum', JSON.stringify({ consecutive: 2, alert: true }));
    // 気温 29.5℃ (>29.0) を2回送信 -> 気温アラート発火
    // 直前の測定値(100.0%)からの急変判定(deltaHum <= 30.0%)を避けるため、許容範囲内の湿度(75.0%)を使用
    updateMonitorState_({ temp: 29.5, hum: 75.0, press: 1013.0 });
    let res = updateMonitorState_({ temp: 29.5, hum: 75.0, press: 1013.0 });

    // 湿度の古いアラートはクリアされつつ、気温のアラートは正常に処理・通知されること
    expect(res.states.hum.alert).toBe(false);
    expect(res.states.temp.alert).toBe(true);
    expect(res.notification).not.toBeNull();
  });

  test('25.1℃ / 湿度 78% において、湿度単体トリガーが発火せず shouldAlert: false となること', () => {
    // DI: 約74.9 なので正常範囲
    global.Date = fixedDate('2026-08-10T01:00:00Z');
    updateMonitorState_({ temp: 25.1, hum: 78.0, press: 1013.0 });
    let res = updateMonitorState_({ temp: 25.1, hum: 78.0, press: 1013.0 });
    // 気温・DI・湿度すべてアラートなし
    expect(res.states.temp.alert).toBe(false);
    expect(res.states.hum.alert).toBe(false);
    expect(res.states.discomfortIndex.alert).toBe(false);
    expect(res.notification).toBeNull();
  });

  test('28.5℃ / 湿度 75% で的確にアラートが発火すること (DI 79.8 > 79.0)', () => {
    global.Date = fixedDate('2026-08-10T01:00:00Z');
    updateMonitorState_({ temp: 28.5, hum: 75.0, press: 1013.0 });
    let res = updateMonitorState_({ temp: 28.5, hum: 75.0, press: 1013.0 });
    expect(res.states.discomfortIndex.alert).toBe(true);
    expect(res.notification).not.toBeNull();
  });

  test('異常値検出（detectAnomaly_）: 気温・湿度・気圧の急変判定', () => {
    // 正常値の保存
    updateMonitorState_({ temp: 25.0, hum: 50.0, press: 1013.0 });

    // 1. 気温急変 (delta 10.0 > 5.0)
    let result = updateMonitorState_({ temp: 35.0, hum: 50.0, press: 1013.0 });
    expect(result.anomaly).toBe(true);

    // 2. 湿度急変 (delta 35.0 > 30.0)
    result = updateMonitorState_({ temp: 25.0, hum: 90.0, press: 1013.0 });
    expect(result.anomaly).toBe(true);

    // 3. 気圧急変 (delta 25.0 > 20.0)
    result = updateMonitorState_({ temp: 25.0, hum: 50.0, press: 1040.0 });
    expect(result.anomaly).toBe(true);

    // 4. buildMonitorNotification_ の非数値ハンドリング
    const notif = buildMonitorNotification_({ temp: 'invalid', hum: 'invalid' });
    expect(notif.text).toBe('現在: - ℃ / - %');
  });
});

describe('Watchdog (死活監視)', () => {
  let env;
  let originalDate;

  beforeEach(() => {
    originalDate = global.Date;
    env = createGasMockEnvironment({
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        [new Date('2026-08-10T00:00:00Z'), 25.0, 1010.0, 50.0, '']
      ]
    });
    Object.assign(global, env.globals);
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  test('3日以内のデータ受信時はタイムアウトせず通知しない', () => {
    global.Date = fixedDate('2026-08-10T05:00:00Z'); // 5時間後
    const res = checkWatchdog();
    expect(res.timeout).toBe(false);
    expect(res.notified).toBe(false);
    expect(res.notification).toBeNull();
  });

  test('3日間（4320分）未受信で初回の通知を発行し、WATCHDOG_NOTIFIED を設定する', () => {
    global.Date = fixedDate('2026-08-13T01:00:00Z'); // 3日と1時間後
    const res = suppressConsoleError(() => checkWatchdog());
    expect(res.timeout).toBe(true);
    expect(res.notified).toBe(true);
    expect(res.notification.text).toContain('センサー未受信');
    expect(env.propertiesStore.get('WATCHDOG_NOTIFIED')).toBe('true');
  });

  test('未受信継続中は再通知を抑制する（1回のみ通知）', () => {
    env.propertiesStore.set('WATCHDOG_NOTIFIED', 'true');
    global.Date = fixedDate('2026-08-14T01:00:00Z'); // 4日後
    const res = checkWatchdog();
    expect(res.timeout).toBe(true);
    expect(res.notified).toBe(false);
    expect(res.notification).toBeNull();
  });

  test('新規測定値の受信時に WATCHDOG_NOTIFIED およびモニター状態がリセットされる', () => {
    env.propertiesStore.set('WATCHDOG_NOTIFIED', 'true');
    env.propertiesStore.set('MONITOR_STATE_temp', JSON.stringify({ consecutive: 5, alert: true }));

    global.Date = fixedDate('2026-08-14T02:00:00Z');
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          api_version: 1,
          token: 'test-token',
          temp: 24.0,
          press: 1012.0,
          hum: 55.0
        })
      }
    };

    const response = handleSensorPost_(postEvent);
    expect(response.getContent()).toContain('"ok":true');
    expect(env.propertiesStore.has('WATCHDOG_NOTIFIED')).toBe(false);

    // 復帰後の状態確認
    const monitorState = getMonitorStateForTest_();
    expect(monitorState.temp.alert).toBe(false);
  });

  test('Watchdog: 設定欠損・シート欠損・ヘッダーのみ・不正日付時のハンドリング', () => {
    suppressConsoleError(() => {
      // 1. SPREADSHEET_ID なし
      const envNoId = createGasMockEnvironment();
      envNoId.propertiesStore.delete('SPREADSHEET_ID');
      Object.assign(global, envNoId.globals);
      expect(() => checkWatchdog()).toThrow('missing spreadsheet configuration');

      // 2. DATA シートなし
      const envNoData = createGasMockEnvironment({ customSheets: { DATA: null } });
      Object.assign(global, envNoData.globals);
      expect(() => checkWatchdog()).toThrow('Raw data sheet not found');

      // 3. ヘッダーのみ (lastRow < 2)
      const envHeaderOnly = createGasMockEnvironment({ dataRows: [['日時', 'temp', 'press', 'hum', 'flag']] });
      Object.assign(global, envHeaderOnly.globals);
      const resHeader = checkWatchdog();
      expect(resHeader.timeout).toBe(false);

      // 4. 不正な日付文字列
      const envBadDate = createGasMockEnvironment({
        dataRows: [
          ['日時', 'temp', 'press', 'hum', 'flag'],
          ['invalid-date-string', 25.0, 1010.0, 50.0, '']
        ]
      });
      Object.assign(global, envBadDate.globals);
      const resBad = checkWatchdog();
      expect(resBad.timeout).toBe(false);

      // 5. 有効な文字列日付
      const envStrDate = createGasMockEnvironment({
        dataRows: [
          ['日時', 'temp', 'press', 'hum', 'flag'],
          ['2026-08-10T00:00:00Z', 25.0, 1010.0, 50.0, '']
        ]
      });
      Object.assign(global, envStrDate.globals);
      global.Date = fixedDate('2026-08-10T01:00:00Z');
      const resStr = checkWatchdog();
      expect(resStr.timeout).toBe(false);
    });
  });

  test('Monitor: buildMonitorNotification_ および loadLastValidMeasurement_ の不正値ハンドリング', () => {
    expect(buildMonitorNotification_(null)).toBeNull();

    env.propertiesStore.set('MONITOR_LAST_VALID_payload', 'invalid_json');
    expect(loadLastValidMeasurement_(PropertiesService.getScriptProperties())).toBeNull();

    env.propertiesStore.set('ALERT_COUNT_TODAY', 'invalid_json');
    expect(loadDailyAlertInfo_(PropertiesService.getScriptProperties())).toBeNull();
  });

  test('Metrics: evaluateAlertDecision_ の null 引数ハンドリング', () => {
    expect(evaluateAlertDecision_(null)).toEqual({
      shouldAlert: false,
      reason: 'invalid_params',
      todayJst: ''
    });
  });

  test('Watchdog: checkWatchdog で pushMonitorNotification_ が例外を投げた場合のエラーログ捕捉', () => {
    global.Date = fixedDate('2026-08-14T01:00:00Z');
    const origPush = global.pushMonitorNotification_;
    try {
      global.pushMonitorNotification_ = () => { throw new Error('Push network failed'); };
      const res = suppressConsoleError(() => checkWatchdog());
      expect(res.notified).toBe(true);
    } finally {
      global.pushMonitorNotification_ = origPush;
    }
  });
});
