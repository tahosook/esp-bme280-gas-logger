/**
 * tests/fixtures/sensorData.js
 *
 * Jest テスト用のセンサー時系列データ・集計データフィクスチャジェネレーター
 */

/**
 * 288 行（24時間 / 5分間隔）のフルセンサーログを生成する
 * @param {string} dateStr JST 日付文字列 (例: "2026-08-30")
 * @param {object} options オプション (baseTemp, basePress, baseHum, tempVariation, humVariation)
 * @returns {Array<Array>} [Date, temp, press, hum, flag] の配列 (288件)
 */
function generate24HourFullSensorRecords(dateStr = '2026-08-30', options = {}) {
  const baseTemp = options.baseTemp !== undefined ? options.baseTemp : 26.0;
  const basePress = options.basePress !== undefined ? options.basePress : 1013.25;
  const baseHum = options.baseHum !== undefined ? options.baseHum : 60.0;
  const tempVar = options.tempVariation !== undefined ? options.tempVariation : 4.0;
  const humVar = options.humVariation !== undefined ? options.humVariation : 10.0;

  const startMs = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  const records = [];

  for (let i = 0; i < 288; i++) {
    const timestamp = new Date(startMs + i * 5 * 60 * 1000);
    // 日周変動をシミュレート
    const angle = (i / 288) * 2 * Math.PI;
    const temp = Math.round((baseTemp + Math.sin(angle) * tempVar) * 100) / 100;
    const press = Math.round((basePress + Math.cos(angle) * 2.0) * 100) / 100;
    const hum = Math.round((baseHum - Math.sin(angle) * humVar) * 100) / 100;
    const flag = '';

    records.push([timestamp, temp, press, hum, flag]);
  }

  return records;
}

/**
 * 欠損値・不正値・異常値を含むセンサーログを生成する
 * @param {string} dateStr JST 日付文字列
 * @returns {Array<Array>} [Date, temp, press, hum, flag]
 */
function generateSparseAndInvalidSensorRecords(dateStr = '2026-08-30') {
  const startMs = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  return [
    // 正常行
    [new Date(startMs + 0 * 60 * 1000), 25.0, 1012.0, 50.0, ''],
    // 不正な温度（文字列）
    [new Date(startMs + 5 * 60 * 1000), 'invalid_temp', 1012.0, 50.0, ''],
    // NaN 気圧
    [new Date(startMs + 10 * 60 * 1000), 25.5, NaN, 52.0, ''],
    // 正常行
    [new Date(startMs + 15 * 60 * 1000), 26.0, 1011.5, 55.0, ''],
    // アラート行
    [new Date(startMs + 20 * 60 * 1000), 31.0, 1010.0, 72.0, 'alert'],
    // 異常値行 (anomaly フラグ)
    [new Date(startMs + 25 * 60 * 1000), 99.0, 9999.0, 99.0, 'anomaly'],
    // 不正なタイムスタンプ（null）
    [null, 25.0, 1012.0, 50.0, ''],
    // 不正な湿度（null）
    [new Date(startMs + 35 * 60 * 1000), 25.0, 1012.0, null, ''],
    // 正常行
    [new Date(startMs + 40 * 60 * 1000), 25.2, 1012.1, 51.0, '']
  ];
}

/**
 * 月次集計テスト用の日次サマリー配列を生成する
 * @param {string} yearMonth 年月文字列 (例: "2026-06", "2024-02")
 * @param {number} dayCount 日数 (指定しない場合は月の日数全日)
 * @returns {Array<Array>} Daily シート用データ行の配列
 */
function generateDailySummaryRecords(yearMonth = '2026-06', dayCount) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 当該月の日数を計算 (うるう年対応)
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const count = dayCount !== undefined ? Math.min(dayCount, totalDaysInMonth) : totalDaysInMonth;

  const records = [];
  for (let day = 1; day <= count; day++) {
    const dayPad = String(day).padStart(2, '0');
    const dateStr = `${yearStr}-${monthStr}-${dayPad}`;
    const tempAvg = 20.0 + (day % 10) * 0.5;
    const tempMin = tempAvg - 3.0;
    const tempMax = tempAvg + 4.0;
    const humAvg = 50.0 + (day % 5) * 2.0;
    const humMin = humAvg - 8.0;
    const humMax = humAvg + 10.0;
    const pressAvg = 1010.0 + (day % 4);
    const pressMin = pressAvg - 3.0;
    const pressMax = pressAvg + 3.0;
    const sampleCount = 288;
    const alertCount = day % 7 === 0 ? 1 : 0;

    records.push([
      dateStr,
      tempAvg,
      tempMin,
      tempMax,
      humAvg,
      humMin,
      humMax,
      pressAvg,
      pressMin,
      pressMax,
      sampleCount,
      alertCount
    ]);
  }

  return records;
}

module.exports = {
  generate24HourFullSensorRecords,
  generateSparseAndInvalidSensorRecords,
  generateDailySummaryRecords
};
