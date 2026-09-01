/**
 * tests/aggregation.test.js
 *
 * 日次集計（DailyAggregation）および月次集計（MonthlyAggregation）の単体テストスイート
 */

const { createGasMockEnvironment, fixedDate } = require('./helpers/mockGasEnvironment');
const {
  generate24HourFullSensorRecords,
  generateSparseAndInvalidSensorRecords,
  generateDailySummaryRecords
} = require('./fixtures/sensorData');

describe('DailyAggregation (日次集計)', () => {
  let originalDate;

  beforeEach(() => {
    originalDate = global.Date;
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  test('288行フルデータから正しく avg / min / max / sample_count / alert_count を算出する', () => {
    const fullRecords = generate24HourFullSensorRecords('2026-08-10', {
      baseTemp: 25.0,
      basePress: 1010.0,
      baseHum: 50.0,
      tempVariation: 5.0,
      humVariation: 10.0
    });

    const env = createGasMockEnvironment({
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        ...fullRecords,
        // 翌日（当日）データ（未確定のため除外対象）
        [new Date('2026-08-11T01:00:00+09:00'), 26.0, 1010.0, 50.0, '']
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-11T05:00:00Z'); // 2026-08-11 14:00 JST

    const result = aggregateDaily();

    expect(result.appendedDays).toBe(1);
    expect(result.processedDays).toBe(1);
    expect(env.dailyRows.length).toBe(2); // header + 1 day

    const dayRow = env.dailyRows[1];
    expect(dayRow[0]).toBe('2026-08-10');
    expect(dayRow[1]).toBeCloseTo(25.0, 0); // temp_avg
    expect(dayRow[2]).toBeLessThanOrEqual(21.0); // temp_min
    expect(dayRow[3]).toBeGreaterThanOrEqual(29.0); // temp_max
    expect(dayRow[4]).toBeCloseTo(50.0, 0); // hum_avg
    expect(dayRow[5]).toBeLessThanOrEqual(41.0); // hum_min
    expect(dayRow[6]).toBeGreaterThanOrEqual(59.0); // hum_max
    expect(dayRow[7]).toBeCloseTo(1010.0, 0); // press_avg
    expect(dayRow[10]).toBe(288); // sample_count
    expect(dayRow[11]).toBe(0); // alert_count

    expect(env.propertiesStore.get('DAILY_LAST_ROW')).toBe('289'); // header (row 1) + 288 records = row 289

    const lockStatus = env.getLockStatus();
    expect(lockStatus.lockAcquired).toBe(true);
    expect(lockStatus.lockReleased).toBe(true);
  });

  test('anomaly フラグ行は集計から除外され、alert フラグ行はカウントされる', () => {
    const env = createGasMockEnvironment({
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        [new Date('2026-08-10T01:00:00+09:00'), 20.0, 1000.0, 40.0, ''],
        [new Date('2026-08-10T05:00:00+09:00'), 30.0, 1020.0, 80.0, 'alert'],
        [new Date('2026-08-10T09:00:00+09:00'), 99.0, 9999.0, 99.0, 'anomaly'] // 統計から除外
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-11T01:00:00Z');

    const result = aggregateDaily();
    expect(result.appendedDays).toBe(1);

    const dayRow = env.dailyRows[1];
    expect(dayRow[0]).toBe('2026-08-10');
    expect(dayRow[1]).toBe(25.0); // (20+30)/2
    expect(dayRow[2]).toBe(20.0); // min
    expect(dayRow[3]).toBe(30.0); // max
    expect(dayRow[4]).toBe(60.0); // (40+80)/2
    expect(dayRow[7]).toBe(1010.0); // (1000+1020)/2
    expect(dayRow[10]).toBe(2); // sample_count (anomaly 除外で2件)
    expect(dayRow[11]).toBe(1); // alert_count (1件)
  });

  test('欠損データや不正値（文字列・NaN・null）が混在してもクラッシュせず安全にスキップする', () => {
    const sparseRecords = generateSparseAndInvalidSensorRecords('2026-08-10');

    const env = createGasMockEnvironment({
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        ...sparseRecords
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-11T01:00:00Z');

    const result = aggregateDaily();
    expect(result.appendedDays).toBe(1);

    const dayRow = env.dailyRows[1];
    expect(dayRow[0]).toBe('2026-08-10');
    // 有効行: 25.0, 26.0, 31.0(alert), 25.2 -> 4件
    expect(dayRow[10]).toBe(4);
    expect(dayRow[11]).toBe(1);
    expect(dayRow[1]).toBe(roundTwoDecimals_((25.0 + 26.0 + 31.0 + 25.2) / 4));
  });

  test('有効サンプルが0件の日（全行異常値・不正値）はDailyシートへ追記されない（ゼロ埋め防止）', () => {
    const env = createGasMockEnvironment({
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        [new Date('2026-08-10T01:00:00+09:00'), 99.0, 999.0, 99.0, 'anomaly'],
        [new Date('2026-08-10T02:00:00+09:00'), 'bad', 'bad', 'bad', '']
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-11T01:00:00Z');

    const result = aggregateDaily();
    expect(result.appendedDays).toBe(0);
    expect(env.dailyRows.length).toBe(1); // header only
    expect(env.propertiesStore.get('DAILY_LAST_ROW')).toBe('3');
  });

  test('既にDailyシートに存在する日付は二重登録されない（冪等性の担保）', () => {
    const env = createGasMockEnvironment({
      initialProperties: {
        DAILY_LAST_ROW: '1' // 先頭から再スキャンを強制
      },
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, ''],
        [new Date('2026-08-11T01:00:00+09:00'), 22.0, 1015.0, 55.0, '']
      ],
      dailyRows: [
        ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
        ['2026-08-10', 25.0, 25.0, 25.0, 50.0, 50.0, 50.0, 1010.0, 1010.0, 1010.0, 1, 0] // 既に存在
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-12T01:00:00Z');

    const result = aggregateDaily();
    expect(result.appendedDays).toBe(1); // 2026-08-11 のみ追加
    expect(env.dailyRows.length).toBe(3);
    expect(env.dailyRows[1][0]).toBe('2026-08-10');
    expect(env.dailyRows[2][0]).toBe('2026-08-11');
  });

  test('シート追記エラー発生時に DAILY_LAST_ROW は更新されず、ロックは解放される', () => {
    const env = createGasMockEnvironment({
      initialProperties: {
        DAILY_LAST_ROW: '1'
      },
      failDailyAppend: true,
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, '']
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-11T01:00:00Z');

    expect(() => {
      aggregateDaily();
    }).toThrow(/Simulated append failure on Daily/);

    expect(env.propertiesStore.get('DAILY_LAST_ROW')).toBe('1');
    const lockStatus = env.getLockStatus();
    expect(lockStatus.lockReleased).toBe(true);
  });

  test('未処理の新規行が存在しない場合は安全に早期リターンする', () => {
    const env = createGasMockEnvironment({
      initialProperties: {
        DAILY_LAST_ROW: '2'
      },
      dataRows: [
        ['日時', 'temp', 'press', 'hum', 'flag'],
        [new Date('2026-08-10T01:00:00+09:00'), 25.0, 1010.0, 50.0, '']
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-11T01:00:00Z');

    const result = aggregateDaily();
    expect(result.appendedDays).toBe(0);
    expect(result.lastProcessedRow).toBe(2);
  });
});

describe('MonthlyAggregation (月次集計)', () => {
  let originalDate;

  beforeEach(() => {
    originalDate = global.Date;
  });

  afterEach(() => {
    global.Date = originalDate;
  });

  test('日次サマリー配列から月次統計（avg/min/max/days_count）を正しく算出する', () => {
    const juneRows = generateDailySummaryRecords('2026-06', 30);
    const julyRows = generateDailySummaryRecords('2026-07', 31);
    const augustRows = generateDailySummaryRecords('2026-08', 5); // 進行中の当月

    const env = createGasMockEnvironment({
      dailyRows: [
        ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
        ...juneRows,
        ...julyRows,
        ...augustRows
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-10T01:00:00Z'); // 2026-08-10 JST

    const result = aggregateMonthly();

    expect(result.appendedMonths).toBe(2); // 6月と7月
    expect(env.monthlyRows.length).toBe(3); // header + 2 rows

    // 2026-06
    const june = env.monthlyRows[1];
    expect(june[0]).toBe('2026-06');
    expect(june[10]).toBe(30); // 30 days
    expect(typeof june[1]).toBe('number'); // temp_avg
    expect(typeof june[7]).toBe('number'); // press_avg

    // 2026-07
    const july = env.monthlyRows[2];
    expect(july[0]).toBe('2026-07');
    expect(july[10]).toBe(31); // 31 days

    // MONTHLY_LAST_ROW should point to July 31st (header: 1, June: 30, July: 31 -> row 62)
    expect(env.propertiesStore.get('MONTHLY_LAST_ROW')).toBe('62');
  });

  test('うるう年（2月29日）および非うるう年（2月28日）の日数整合性を検証する', () => {
    // 2024年はうるう年（29日）
    const leapFebRows = generateDailySummaryRecords('2024-02');
    expect(leapFebRows.length).toBe(29);

    // 2026年は平年（28日）
    const nonLeapFebRows = generateDailySummaryRecords('2026-02');
    expect(nonLeapFebRows.length).toBe(28);

    const env = createGasMockEnvironment({
      dailyRows: [
        ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
        ...leapFebRows
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2024-03-05T01:00:00Z');

    const result = aggregateMonthly();
    expect(result.appendedMonths).toBe(1);
    expect(env.monthlyRows[1][0]).toBe('2024-02');
    expect(env.monthlyRows[1][10]).toBe(29); // 29 days correctly counted
  });

  test('既にMonthlyシートに存在する年月は二重登録されない（冪等性の担保）', () => {
    const env = createGasMockEnvironment({
      initialProperties: {
        MONTHLY_LAST_ROW: '1'
      },
      dailyRows: [
        ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
        ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0],
        ['2026-07-01', 25.0, 22.0, 28.0, 65.0, 55.0, 75.0, 1008.0, 1005.0, 1010.0, 285, 0]
      ],
      monthlyRows: [
        ['年月', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'days_count'],
        ['2026-06', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 1] // 既に存在
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-08-01T01:00:00Z');

    const result = aggregateMonthly();
    expect(result.appendedMonths).toBe(1); // 2026-07 のみ追加
    expect(env.monthlyRows.length).toBe(3);
    expect(env.monthlyRows[1][0]).toBe('2026-06');
    expect(env.monthlyRows[2][0]).toBe('2026-07');
  });

  test('月途中の中断・マルチステージ実行（月途中データが翌月に持ち越されて集計されること）', () => {
    const env = createGasMockEnvironment({
      dailyRows: [
        ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
        // 2026-07 (row 2-3)
        ['2026-07-15', 25.0, 22.0, 28.0, 65.0, 55.0, 75.0, 1008.0, 1005.0, 1010.0, 285, 0],
        ['2026-07-31', 29.0, 24.0, 32.0, 69.0, 58.0, 78.0, 1007.0, 1002.0, 1011.0, 286, 0],
        // 2026-08 mid-month (row 4-5)
        ['2026-08-01', 28.0, 23.0, 31.0, 62.0, 52.0, 72.0, 1010.0, 1006.0, 1013.0, 288, 0],
        ['2026-08-10', 32.0, 27.0, 35.0, 68.0, 58.0, 78.0, 1008.0, 1004.0, 1011.0, 288, 0]
      ]
    });

    Object.assign(global, env.globals);

    // Stage 1: 現在日時 2026-08-15
    global.Date = fixedDate('2026-08-15T01:00:00Z');
    const resultStage1 = aggregateMonthly();
    expect(resultStage1.appendedMonths).toBe(1); // 7月のみ集計
    expect(env.monthlyRows[1][0]).toBe('2026-07');
    expect(env.propertiesStore.get('MONTHLY_LAST_ROW')).toBe('3');

    // Stage 2: 時間が翌月 2026-09-01 に進み、8月後半のデータが追記された
    env.dailyRows.push(
      ['2026-08-20', 30.0, 25.0, 33.0, 65.0, 55.0, 75.0, 1009.0, 1005.0, 1012.0, 288, 0],
      ['2026-08-31', 26.0, 21.0, 29.0, 61.0, 51.0, 71.0, 1011.0, 1007.0, 1014.0, 288, 0]
    );

    global.Date = fixedDate('2026-09-01T01:00:00Z');
    const resultStage2 = aggregateMonthly();
    expect(resultStage2.appendedMonths).toBe(1); // 8月が集計される
    expect(env.monthlyRows.length).toBe(3);
    expect(env.monthlyRows[2][0]).toBe('2026-08');
    expect(env.monthlyRows[2][10]).toBe(4); // 8/1, 8/10, 8/20, 8/31 -> 4 days
    expect(env.monthlyRows[2][1]).toBe(29.0); // (28+32+30+26)/4 = 29.0
  });

  test('追記エラー発生時に MONTHLY_LAST_ROW は更新されず、ロックは解放される', () => {
    const env = createGasMockEnvironment({
      initialProperties: {
        MONTHLY_LAST_ROW: '1'
      },
      failMonthlyAppend: true,
      dailyRows: [
        ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count'],
        ['2026-06-15', 20.0, 18.0, 22.0, 50.0, 45.0, 55.0, 1010.0, 1008.0, 1012.0, 280, 0]
      ]
    });

    Object.assign(global, env.globals);
    global.Date = fixedDate('2026-07-01T01:00:00Z');

    expect(() => {
      aggregateMonthly();
    }).toThrow(/Simulated append failure on Monthly/);

    expect(env.propertiesStore.get('MONTHLY_LAST_ROW')).toBe('1');
    const lockStatus = env.getLockStatus();
    expect(lockStatus.lockReleased).toBe(true);
  });

  test('設定不足・シート未検出時の例外スローとエラーログ記録', () => {
    // 1. SPREADSHEET_ID 未設定
    const envNoSpreadsheet = createGasMockEnvironment();
    envNoSpreadsheet.propertiesStore.delete('SPREADSHEET_ID');
    Object.assign(global, envNoSpreadsheet.globals);
    expect(() => aggregateDaily()).toThrow('missing spreadsheet configuration');
    expect(() => aggregateMonthly()).toThrow('missing spreadsheet configuration');

    // 2. DATA シート未検出
    const envNoData = createGasMockEnvironment({
      customSheets: { DATA: null }
    });
    Object.assign(global, envNoData.globals);
    expect(() => aggregateDaily()).toThrow('Raw data sheet not found');

    // 3. Daily シート未検出
    const envNoDaily = createGasMockEnvironment({
      customSheets: { Daily: null }
    });
    Object.assign(global, envNoDaily.globals);
    expect(() => aggregateDaily()).toThrow('Daily sheet not found');
    expect(() => aggregateMonthly()).toThrow('Daily sheet not found');

    // 4. Monthly シート未検出
    const envNoMonthly = createGasMockEnvironment({
      customSheets: { Monthly: null }
    });
    Object.assign(global, envNoMonthly.globals);
    expect(() => aggregateMonthly()).toThrow('Monthly sheet not found');
  });

  describe('集計補助関数 (formatDateTokyo_, formatYearMonthTokyo_, calcAvg_)', () => {
    test('formatDateTokyo_ の各フォーマットおよび不正値処理', () => {
      expect(formatDateTokyo_(null)).toBeNull();
      expect(formatDateTokyo_('invalid-date')).toBeNull();
      expect(formatDateTokyo_(new Date('2026-08-30T10:00:00Z'), 'yyyy-MM-dd')).toBe('2026-08-30');
      expect(formatDateTokyo_('2026-08-30')).toBe('2026-08-30');
      expect(formatDateTokyo_(new Date('2026-08-30T10:00:00Z'), 'yyyy-MM')).toBe('2026-08');
      expect(formatDateTokyo_(new Date('2026-08-30T10:00:00Z'), 'yyyy-MM-dd HH:mm:ss')).toBe('2026-08-30 19:00:00');
      expect(formatDateTokyo_(new Date('2026-08-30T10:00:00Z'), 'MM/dd HH:mm')).toBe('08/30 19:00');
    });

    test('formatDateTokyo_ および formatYearMonthTokyo_ の Utilities 未定義フォールバック分岐', () => {
      const savedUtilities = global.Utilities;
      try {
        delete global.Utilities;

        const d = new Date('2026-08-30T10:00:00Z'); // 19:00 JST
        expect(formatDateTokyo_(d, 'yyyy-MM')).toBe('2026-08');
        expect(formatDateTokyo_(d, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-08-30 19:00:00');
        expect(formatDateTokyo_(d, 'MM/dd HH:mm')).toBe('08/30 19:00');
        expect(formatDateTokyo_(d, 'other-format')).toBe('2026-08-30');

        expect(formatYearMonthTokyo_(d)).toBe('2026-08');
      } finally {
        global.Utilities = savedUtilities;
      }
    });

    test('formatYearMonthTokyo_ の各フォーマットおよび不正値処理', () => {
      expect(formatYearMonthTokyo_(null)).toBeNull();
      expect(formatYearMonthTokyo_('2026-08-30')).toBe('2026-08');
      expect(formatYearMonthTokyo_(new Date('2026-08-30T10:00:00Z'))).toBe('2026-08');

      // formatDateTokyo_ 未定義時のフォールバック分岐（Utilities あり / なし）
      const savedFormat = global.formatDateTokyo_;
      try {
        delete global.formatDateTokyo_;
        expect(formatYearMonthTokyo_(new Date('2026-08-30T10:00:00Z'))).toBe('2026-08');
        expect(formatYearMonthTokyo_('invalid-date')).toBeNull();

        const savedUtils = global.Utilities;
        try {
          delete global.Utilities;
          expect(formatYearMonthTokyo_(new Date('2026-08-30T10:00:00Z'))).toBe('2026-08');
          expect(formatYearMonthTokyo_('invalid-date')).toBeNull();
        } finally {
          global.Utilities = savedUtils;
        }
      } finally {
        global.formatDateTokyo_ = savedFormat;
      }
    });

    test('calcAvg_ の空配列処理', () => {
      expect(calcAvg_([])).toBe(0);
      expect(calcAvg_(null)).toBe(0);
      expect(calcAvg_([10, 20, 30])).toBe(20);
    });

    test('MonthlyAggregation: buildMonthlyRowData_ の 0件バケットおよび processMonthlyDataRows_ の異常行スキップ', () => {
      // 0件バケット
      expect(buildMonthlyRowData_('2026-08', { tempAvgs: [] })).toBeNull();

      // 不正行データ（日付なし、不正値、NaNなど）
      const rows = [
        [null, 20, 10, 30, 50, 40, 60, 1000, 990, 1010, 280, 0],
        ['invalid-date', 20, 10, 30, 50, 40, 60, 1000, 990, 1010, 280, 0],
        ['2026-05-01', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN', 'NaN', 0, 0]
      ];
      const { monthlyBuckets } = processMonthlyDataRows_(rows, 2, '2026-06', 1);
      expect(monthlyBuckets.has('2026-05')).toBe(false);
    });

    test('MonthlyAggregation: MONTHLY_LAST_ROW が負数または未処理行なしの場合の安全な終了', () => {
      const env = createGasMockEnvironment({
        initialProperties: {
          SPREADSHEET_ID: 'test-spreadsheet-id',
          MONTHLY_LAST_ROW: '-10'
        },
        dailyRows: [
          ['日付', 'temp_avg', 'temp_min', 'temp_max', 'hum_avg', 'hum_min', 'hum_max', 'press_avg', 'press_min', 'press_max', 'sample_count', 'alert_count']
        ]
      });
      Object.assign(global, env.globals);
      expect(() => aggregateMonthly()).not.toThrow();
    });
  });
});
