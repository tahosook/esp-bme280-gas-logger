// ==========================================
// Metrics Calculation Module (Pure functions)
// ==========================================

/**
 * Calculates the Discomfort Index (DI).
 * @param {number} temp - Temperature in Celsius
 * @param {number} hum - Relative humidity in %
 * @returns {number} Discomfort Index
 */
function calculateDiscomfortIndex_(temp, hum) {
  return 0.81 * temp + 0.01 * hum * (0.99 * temp - 14.3) + 46.3;
}

/**
 * Calculates Absolute Humidity (AH) in g/m^3.
 * @param {number} temp - Temperature in Celsius
 * @param {number} hum - Relative humidity in %
 * @returns {number} Absolute Humidity (g/m^3)
 */
function calculateAbsoluteHumidity_(temp, hum) {
  // Saturated vapor pressure E(T)
  const eT = 6.1078 * Math.pow(10, (7.5 * temp) / (237.3 + temp));
  // Absolute humidity AH
  const ah = (217 * (eT * (hum / 100))) / (temp + 273.15);
  return ah;
}

/**
 * Classifies Discomfort Index into categories and colors.
 * @param {number} di - Discomfort Index
 * @returns {object} Status with label and color
 */
function classifyDiscomfortIndex_(di) {
  if (di >= 80) {
    return { label: '暑くてたまらない', color: '#e74c3c' }; // Red
  } else if (di >= 75) {
    return { label: 'やや暑い', color: '#e67e22' }; // Orange
  } else if (di < 60) {
    return { label: '肌寒い', color: '#3498db' }; // Blue
  } else {
    return { label: '快適', color: '#27ae60' }; // Green
  }
}

/**
 * Builds QuickChart Configuration object for 24h temperature and humidity.
 * @param {Array} records - Array of [timestamp, temp, press, hum]
 * @returns {object} QuickChart configuration object
 */
function buildQuickChartConfig_(records) {
  if (!records || records.length === 0) return null;

  const labels = [];
  const temps = [];
  const hums = [];

  records.forEach(row => {
    let dateStr;
    const ts = row[0];
    if (Object.prototype.toString.call(ts) === '[object Date]') {
      const h = String(ts.getHours()).padStart(2, '0');
      const m = String(ts.getMinutes()).padStart(2, '0');
      dateStr = `${h}:${m}`;
    } else {
      const d = new Date(ts);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      dateStr = `${h}:${m}`;
    }

    labels.push(dateStr);
    temps.push(Number(Number(row[1]).toFixed(1)));
    hums.push(Number(Number(row[3]).toFixed(1)));
  });

  const chartConfig = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '温度 (℃)',
          data: temps,
          borderColor: '#ef4444',
          fill: false,
          yAxisID: 'yTemp',
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: '湿度 (%)',
          data: hums,
          borderColor: '#3b82f6',
          fill: false,
          yAxisID: 'yHum',
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: '直近24時間の温湿度推移'
      },
      scales: {
        xAxes: [{
          ticks: {
            maxRotation: 0,
            autoSkip: false
          }
        }],
        yAxes: [
          {
            id: 'yTemp',
            position: 'left',
            scaleLabel: {
              display: true,
              labelString: '温度 (℃)'
            },
            ticks: { suggestedMin: 15, suggestedMax: 35 }
          },
          {
            id: 'yHum',
            position: 'right',
            scaleLabel: {
              display: true,
              labelString: '湿度 (%)'
            },
            gridLines: { drawOnChartArea: false },
            ticks: { suggestedMin: 30, suggestedMax: 90 }
          }
        ]
      }
    }
  };

  return {
    chart: chartConfig,
    width: 600,
    height: 360
  };
}

/**
 * Builds QuickChart GET URL from an array of measurement records.
 * Pure function independent of SpreadsheetApp.
 * Optimizes URL length to fit within LINE's 2,000-character limit by:
 *  1. Sampling 288 points down to ~30 points (~45-min intervals)
 *  2. Displaying X-axis labels every ~3 hours and using empty strings for intermediate ticks
 *  3. Rounding numerical values to 1 decimal place
 *
 * @param {Array} records - Array of [timestamp, temp, press, hum]
 * @param {object} [options] - Options (width, height, devicePixelRatio, targetCount)
 * @returns {string|null} QuickChart image URL or null if records are empty
 */
function buildQuickChartUrlFromRecords_(records, options) {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return null;
  }

  const opts = options || {};
  const width = opts.width || 600;
  const height = opts.height || 360;
  const dpr = typeof opts.devicePixelRatio === 'number' ? opts.devicePixelRatio : 2.0;
  let targetCount = opts.targetCount || 30;

  // Helper to generate URL given target sample count
  function generateWithTargetCount(count) {
    const step = Math.max(1, Math.floor(records.length / count));
    const sampled = [];
    for (let i = 0; i < records.length; i += step) {
      sampled.push(records[i]);
    }
    const lastRecord = records[records.length - 1];
    if (sampled[sampled.length - 1] !== lastRecord) {
      sampled.push(lastRecord);
    }

    const labels = [];
    const temps = [];
    const hums = [];
    let lastLabeledHour = -1;

    for (let i = 0; i < sampled.length; i += 1) {
      const row = sampled[i];
      const ts = row[0];
      const d = (ts instanceof Date) ? ts : new Date(ts);
      const h = d.getHours();
      const m = d.getMinutes();
      let label = '';
      // Show label on first point, last point, or every 3 hours
      if (i === 0 || i === sampled.length - 1 || (h % 3 === 0 && h !== lastLabeledHour)) {
        label = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        lastLabeledHour = h;
      }
      labels.push(label);
      temps.push(Number(Number(row[1]).toFixed(1)));
      hums.push(Number(Number(row[3]).toFixed(1)));
    }

    const chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '温度 (℃)',
            data: temps,
            borderColor: '#ef4444',
            fill: false,
            yAxisID: 'yTemp',
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: '湿度 (%)',
            data: hums,
            borderColor: '#3b82f6',
            fill: false,
            yAxisID: 'yHum',
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      options: {
        title: {
          display: true,
          text: '直近24時間の温湿度推移'
        },
        scales: {
          yAxes: [
            {
              id: 'yTemp',
              position: 'left',
              scaleLabel: {
                display: true,
                labelString: '℃'
              }
            },
            {
              id: 'yHum',
              position: 'right',
              scaleLabel: {
                display: true,
                labelString: '%'
              },
              gridLines: {
                drawOnChartArea: false
              }
            }
          ]
        }
      }
    };

    const chartJson = JSON.stringify(chartConfig);
    return `https://quickchart.io/chart?w=${width}&h=${height}&devicePixelRatio=${dpr.toFixed(1)}&c=${encodeURIComponent(chartJson)}`;
  }

  let url = generateWithTargetCount(targetCount);

  // Safeguard: if URL still exceeds 2000 chars, progressively reduce sampling
  if (url.length > 2000 && targetCount > 15) {
    url = generateWithTargetCount(20);
  }
  if (url.length > 2000 && targetCount > 10) {
    url = generateWithTargetCount(12);
  }

  return url;
}

/**
 * Builds QuickChart GET URL from a Google Sheet object or a 2D array of records.
 * Extracts up to the last 288 rows (5-min intervals x 24 hours).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet|Array} sheetOrRecords - Sheet or array of records
 * @param {object} [options] - Options (width, height, devicePixelRatio, targetCount)
 * @returns {string|null} QuickChart image URL or null if data is insufficient
 */
function buildQuickChartUrl(sheetOrRecords, options) {
  if (!sheetOrRecords) {
    return null;
  }

  let rawValues = [];

  // If a Sheet object is provided (duck-typing getLastRow and getRange)
  if (typeof sheetOrRecords.getLastRow === 'function' && typeof sheetOrRecords.getRange === 'function') {
    const lastRow = sheetOrRecords.getLastRow();
    if (lastRow < 2) {
      return null;
    }
    const MAX_ROWS = 288;
    const startRow = Math.max(1, lastRow - MAX_ROWS + 1);
    const numRows = lastRow - startRow + 1;
    rawValues = sheetOrRecords.getRange(startRow, 1, numRows, 4).getValues();
  } else if (Array.isArray(sheetOrRecords)) {
    rawValues = sheetOrRecords.slice(-288);
  } else {
    return null;
  }

  // Filter valid measurement records
  const validRecords = [];
  for (let i = 0; i < rawValues.length; i += 1) {
    const row = rawValues[i];
    if (!row || row.length < 4) {
      continue;
    }
    const ts = row[0];
    const temp = Number(row[1]);
    const hum = Number(row[3]);

    const isValidDate = (Object.prototype.toString.call(ts) === '[object Date]' && !isNaN(ts.getTime())) ||
      (typeof ts === 'string' && ts.trim() !== '' && !isNaN(new Date(ts).getTime())) ||
      (typeof ts === 'number' && !isNaN(new Date(ts).getTime()));

    if (isValidDate && !isNaN(temp) && !isNaN(hum)) {
      const dateObj = (ts instanceof Date) ? ts : new Date(ts);
      validRecords.push([dateObj, temp, row[2], hum]);
    }
  }

  if (validRecords.length === 0) {
    return null;
  }

  return buildQuickChartUrlFromRecords_(validRecords, options);
}

/**
 * Parses a datetimepicker string ("YYYY-MM-DDTHH:mm") as JST (UTC+9) and returns timestamp in ms.
 * If invalid or in the past compared to nowMs, returns null.
 * @param {string} datetimeStr - Format "YYYY-MM-DDTHH:mm"
 * @param {number} [nowMs] - Current timestamp in ms (defaults to Date.now())
 * @returns {number|null} Timestamp in ms or null
 */
function parseJstDatetimepicker_(datetimeStr, nowMs) {
  if (!datetimeStr || typeof datetimeStr !== 'string') return null;
  const match = datetimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const min = parseInt(match[5], 10);

  // UTC equivalent time representing the JST time, then subtract 9 hours to get true UTC timestamp
  const utcMs = Date.UTC(year, month, day, hour, min, 0, 0);
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const targetMs = utcMs - jstOffsetMs;

  const currentMs = typeof nowMs === 'number' ? nowMs : Date.now();
  if (targetMs <= currentMs) {
    return null;
  }

  return targetMs;
}

/**
 * Calculates next morning target hour (default 8:00 AM JST) as UTC timestamp (ms).
 * @param {number} [nowMs] - Current timestamp in ms
 * @param {number} [targetHour] - Target hour in JST (default: 8)
 * @returns {number} UTC timestamp in ms
 */
function calculateNextMorning8Am_(nowMs, targetHour) {
  const hour = typeof targetHour === 'number' ? targetHour : 8;
  const currentMs = typeof nowMs === 'number' ? nowMs : Date.now();

  const jstNow = new Date(currentMs + 9 * 60 * 60 * 1000);
  const jstYear = jstNow.getUTCFullYear();
  const jstMonth = jstNow.getUTCMonth();
  const jstDate = jstNow.getUTCDate();
  const jstCurrentHour = jstNow.getUTCHours();

  let targetDay = jstDate;
  if (jstCurrentHour >= hour) {
    targetDay += 1;
  }

  return Date.UTC(jstYear, jstMonth, targetDay, hour - 9, 0, 0, 0);
}

/**
 * Checks whether snooze is currently active.
 * @param {string|number|null} skipUntil - Timestamp (ms) until snooze expires
 * @param {number} [nowMs] - Optional current timestamp in ms (defaults to Date.now())
 * @returns {boolean} True if snooze is active, false otherwise
 */
function isSnoozeActive_(skipUntil, nowMs) {
  if (!skipUntil) {
    return false;
  }
  const untilMs = typeof skipUntil === 'number' ? skipUntil : parseInt(skipUntil, 10);
  if (isNaN(untilMs)) {
    return false;
  }
  const currentMs = typeof nowMs === 'number' ? nowMs : Date.now();
  return currentMs < untilMs;
}

/**
 * Formats snooze deadline in JST format (e.g. "08/31 08:00").
 * @param {string|number} skipUntil - Timestamp in ms
 * @returns {string} Formatted JST date string
 */
function formatSnoozeUntilJst_(skipUntil) {
  if (!skipUntil) return '';
  const untilMs = typeof skipUntil === 'number' ? skipUntil : parseInt(skipUntil, 10);
  if (isNaN(untilMs)) return '';

  if (typeof formatDateTokyo_ === 'function') {
    return formatDateTokyo_(untilMs, 'MM/dd HH:mm');
  }

  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(new Date(untilMs), 'Asia/Tokyo', 'MM/dd HH:mm');
  }

  const tokyoTime = new Date(untilMs + 9 * 60 * 60 * 1000);
  const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tokyoTime.getUTCDate()).padStart(2, '0');
  const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
  const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

/**
 * Calculates pressure trend Delta P from current and 3h-ago pressure.
 * @param {number} currentPress - Current pressure in hPa
 * @param {number} pastPress - Pressure approx 3 hours ago in hPa
 * @returns {string} Formatted trend label e.g. "↘ -2.1/3h", "↗ +1.5/3h", "安定", or "→ +0.4/3h"
 */
function calculatePressureTrend_(currentPress, pastPress) {
  if (typeof currentPress !== 'number' || typeof pastPress !== 'number' ||
      isNaN(currentPress) || isNaN(pastPress)) {
    return '安定';
  }
  const delta = Number((currentPress - pastPress).toFixed(1));
  if (delta <= -1.0) {
    return `↘ ${delta.toFixed(1)}/3h`;
  } else if (delta >= 1.0) {
    return `↗ +${delta.toFixed(1)}/3h`;
  } else if (Math.abs(delta) <= 0.2) {
    return '安定';
  } else {
    return `→ ${delta > 0 ? '+' : ''}${delta.toFixed(1)}/3h`;
  }
}

/**
 * Gets JST date string (YYYY-MM-DD) from UTC timestamp (ms).
 * @param {number} [ms] - Timestamp in ms (defaults to Date.now())
 * @returns {string} JST date string YYYY-MM-DD
 */
function getJstDateString_(ms) {
  const currentMs = typeof ms === 'number' ? ms : Date.now();
  const jstDate = new Date(currentMs + 9 * 60 * 60 * 1000);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Evaluates whether to send push alert notification based on 5-step priority control.
 * Pure function independent of Apps Script services.
 *
 * Priority flow:
 *  1. Sensor anomaly guard (-10℃〜50℃, 0%〜100%)
 *  2. SNOOZE priority check (ALERT_SNOOZE_UNTIL)
 *  3. Warning threshold check (isOverThreshold)
 *  4. 1-hour cooldown check (ALERT_LAST_SENT_TIME)
 *  5. Daily max limit guard (ALERT_COUNT_TODAY, max 5/day)
 *
 * @param {object} params - Input parameters
 * @param {number} params.temp - Temperature in Celsius
 * @param {number} params.hum - Humidity in %
 * @param {number} [params.press] - Pressure in hPa
 * @param {boolean} params.isOverThreshold - Whether temperature or humidity is in alert state
 * @param {number} [params.nowMs] - Current timestamp in ms
 * @param {number|string|null} [params.snoozeUntil] - Snooze deadline timestamp in ms
 * @param {number|string|null} [params.lastSentTime] - Last push alert sent timestamp in ms
 * @param {object|null} [params.dailyAlertInfo] - { date: 'YYYY-MM-DD', count: number }
 * @param {object} [params.options] - Custom options
 * @returns {object} { shouldAlert: boolean, reason: string, todayJst: string }
 */
function evaluateAlertDecision_(params) {
  if (!params) {
    return { shouldAlert: false, reason: 'invalid_params', todayJst: '' };
  }

  const temp = typeof params.temp === 'number' ? params.temp : NaN;
  const hum = typeof params.hum === 'number' ? params.hum : NaN;
  const nowMs = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
  const todayJst = getJstDateString_(nowMs);

  const opts = params.options || {};
  const minTemp = typeof opts.minTemp === 'number' ? opts.minTemp : -10.0;
  const maxTemp = typeof opts.maxTemp === 'number' ? opts.maxTemp : 50.0;
  const minHum = typeof opts.minHum === 'number' ? opts.minHum : 0.0;
  const maxHum = typeof opts.maxHum === 'number' ? opts.maxHum : 100.0;
  const cooldownMs = typeof opts.cooldownMs === 'number' ? opts.cooldownMs : 60 * 60 * 1000;
  const maxDailyCount = typeof opts.maxDailyCount === 'number' ? opts.maxDailyCount : 5;

  // 1. センサー異常値ガード
  if (isNaN(temp) || isNaN(hum) || temp < minTemp || temp > maxTemp || hum < minHum || hum > maxHum) {
    return { shouldAlert: false, reason: 'sensor_anomaly', todayJst: todayJst };
  }

  // 2. SNOOZE（通知停止期限）の優先判定
  if (isSnoozeActive_(params.snoozeUntil, nowMs)) {
    return { shouldAlert: false, reason: 'snooze_active', todayJst: todayJst };
  }

  // 3. 警戒閾値の判定
  if (!params.isOverThreshold) {
    return { shouldAlert: false, reason: 'normal', todayJst: todayJst };
  }

  // 4. 1時間クールダウン判定（無料枠保護）
  if (params.lastSentTime) {
    const lastSentMs = typeof params.lastSentTime === 'number'
      ? params.lastSentTime
      : parseInt(params.lastSentTime, 10);
    if (!isNaN(lastSentMs) && (nowMs - lastSentMs) < cooldownMs) {
      return { shouldAlert: false, reason: 'cooldown_active', todayJst: todayJst };
    }
  }

  // 5. 1日あたりの上限ガード（セーフティネット）
  if (params.dailyAlertInfo && params.dailyAlertInfo.date === todayJst) {
    const count = typeof params.dailyAlertInfo.count === 'number' ? params.dailyAlertInfo.count : 0;
    if (count >= maxDailyCount) {
      return { shouldAlert: false, reason: 'daily_limit_reached', todayJst: todayJst };
    }
  }

  return { shouldAlert: true, reason: 'alert_triggered', todayJst: todayJst };
}

if (typeof module !== 'undefined') {
  module.exports = {
    calculateDiscomfortIndex_,
    calculateAbsoluteHumidity_,
    classifyDiscomfortIndex_,
    buildQuickChartConfig_,
    buildQuickChartUrlFromRecords_,
    buildQuickChartUrl,
    calculateNextMorning8Am_,
    isSnoozeActive_,
    formatSnoozeUntilJst_,
    calculatePressureTrend_,
    getJstDateString_,
    evaluateAlertDecision_,
    parseJstDatetimepicker_
  };
}
