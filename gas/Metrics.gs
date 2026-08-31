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
    temps.push(Number(row[1]).toFixed(1));
    hums.push(Number(row[3]).toFixed(1));
  });

  const chartConfig = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '温度 (℃)',
          data: temps,
          borderColor: '#e74c3c',
          backgroundColor: 'transparent',
          yAxisID: 'yTemp',
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: '湿度 (%)',
          data: hums,
          borderColor: '#3498db',
          backgroundColor: 'transparent',
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
            maxTicksLimit: 12,
            maxRotation: 45
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
            ticks: { suggestedMin: 0, suggestedMax: 40 }
          },
          {
            id: 'yHum',
            position: 'right',
            scaleLabel: {
              display: true,
              labelString: '湿度 (%)'
            },
            gridLines: { drawOnChartArea: false },
            ticks: { suggestedMin: 20, suggestedMax: 100 }
          }
        ]
      }
    }
  };

  return {
    chart: chartConfig,
    width: 800,
    height: 400
  };
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

if (typeof module !== 'undefined') {
  module.exports = {
    calculateDiscomfortIndex_,
    calculateAbsoluteHumidity_,
    classifyDiscomfortIndex_,
    buildQuickChartConfig_,
    calculateNextMorning8Am_,
    isSnoozeActive_,
    formatSnoozeUntilJst_
  };
}
