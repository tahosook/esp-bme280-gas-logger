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

if (typeof module !== 'undefined') {
  module.exports = {
    calculateDiscomfortIndex_,
    calculateAbsoluteHumidity_,
    classifyDiscomfortIndex_,
    buildQuickChartConfig_
  };
}
