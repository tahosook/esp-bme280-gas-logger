const assert = require('assert');
const {
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
  evaluateAlertDecision_
} = require('../gas/Metrics.gs');

function runTests() {
  console.log('Running Metrics tests...');

  // 1. DI Calculation
  {
    const di1 = calculateDiscomfortIndex_(25, 50);
    assert.strictEqual(Math.round(di1 * 10) / 10, 71.8, 'Test 1 Failed: DI calc for 25C 50%');

    const di2 = calculateDiscomfortIndex_(30, 70);
    assert.strictEqual(Math.round(di2 * 10) / 10, 81.4, 'Test 1 Failed: DI calc for 30C 70%');
    console.log('  ✓ Test 1: DI calculation passed');
  }

  // 2. AH Calculation
  {
    const ah1 = calculateAbsoluteHumidity_(25, 50);
    assert.strictEqual(Math.round(ah1 * 10) / 10, 11.5, 'Test 2 Failed: AH calc for 25C 50%'); // roughly 11.5

    const ah2 = calculateAbsoluteHumidity_(30, 70);
    assert.strictEqual(Math.round(ah2 * 10) / 10, 21.3, 'Test 2 Failed: AH calc for 30C 70%'); // roughly 21.2-21.3
    console.log('  ✓ Test 2: AH calculation passed');
  }

  // 3. DI Classification
  {
    const c1 = classifyDiscomfortIndex_(80.5);
    assert.strictEqual(c1.color, '#e74c3c');

    const c2 = classifyDiscomfortIndex_(75);
    assert.strictEqual(c2.color, '#e67e22');

    const c3 = classifyDiscomfortIndex_(74.9);
    assert.strictEqual(c3.color, '#27ae60');

    const c4 = classifyDiscomfortIndex_(59);
    assert.strictEqual(c4.color, '#3498db');
    console.log('  ✓ Test 3: DI classification passed');
  }

  // 4. QuickChart URL Builder
  {
    const records = [
      [new Date('2026-08-30T10:00:00Z'), 25.0, 1013, 50.0],
      [new Date('2026-08-30T10:05:00Z'), 25.5, 1013, 55.0]
    ];
    const configObj = buildQuickChartConfig_(records);
    assert.ok(configObj !== null, 'Test 4 Failed: Config object is null');
    assert.strictEqual(configObj.width, 600, 'Test 4 Failed: incorrect width');
    assert.strictEqual(configObj.height, 360, 'Test 4 Failed: incorrect height');
    assert.strictEqual(configObj.chart.type, 'line', 'Test 4 Failed: incorrect chart type');
    assert.strictEqual(configObj.chart.data.labels.length, 2, 'Test 4 Failed: incorrect labels length');
    assert.strictEqual(configObj.chart.data.datasets.length, 2, 'Test 4 Failed: incorrect datasets length');
    console.log('  ✓ Test 4: QuickChart Config builder passed');
  }

  // 4B. QuickChart URL from 288 records (24h) meets LINE 2000-character limit & design spec
  {
    const records288 = [];
    const baseTime = new Date('2026-08-31T00:00:00+09:00').getTime();
    for (let i = 0; i < 288; i++) {
      const d = new Date(baseTime + i * 5 * 60 * 1000);
      const temp = 26.12345 + Math.sin(i / 10) * 5;
      const press = 1013.25;
      const hum = 62.98765 + Math.cos(i / 10) * 15;
      records288.push([d, temp, press, hum]);
    }

    const chartUrl = buildQuickChartUrlFromRecords_(records288);
    assert.ok(typeof chartUrl === 'string', 'Test 4B Failed: chartUrl should be a string');
    assert.ok(chartUrl.startsWith('https://quickchart.io/chart?'), 'Test 4B Failed: URL should start with QuickChart base URL');
    assert.ok(chartUrl.includes('w=600'), 'Test 4B Failed: URL should specify width 600');
    assert.ok(chartUrl.includes('h=360'), 'Test 4B Failed: URL should specify height 360');
    assert.ok(chartUrl.includes('devicePixelRatio=2.0'), 'Test 4B Failed: URL should specify devicePixelRatio 2.0');

    // Crucial check: LINE Messaging API limit is 2,000 characters
    assert.ok(chartUrl.length < 2000, `Test 4B Failed: URL length ${chartUrl.length} exceeds 2000 characters!`);

    // Verify decoded chart config contents
    const encodedConfig = chartUrl.split('&c=')[1];
    const decodedConfig = JSON.parse(decodeURIComponent(encodedConfig));
    assert.strictEqual(decodedConfig.type, 'line');
    assert.strictEqual(decodedConfig.data.datasets.length, 2);

    // Dataset 0: Temp (Red #ef4444)
    const tempDs = decodedConfig.data.datasets[0];
    assert.strictEqual(tempDs.borderColor, '#ef4444');
    assert.strictEqual(tempDs.yAxisID, 'yTemp');

    // Dataset 1: Hum (Blue #3b82f6)
    const humDs = decodedConfig.data.datasets[1];
    assert.strictEqual(humDs.borderColor, '#3b82f6');
    assert.strictEqual(humDs.yAxisID, 'yHum');

    // Verify sampling count is approx 30-40 points
    assert.ok(decodedConfig.data.labels.length >= 25 && decodedConfig.data.labels.length <= 40,
      `Test 4B Failed: sampled points count ${decodedConfig.data.labels.length} not in expected 25-40 range`);

    // Verify numerical rounding to 1 decimal place
    tempDs.data.forEach(val => {
      assert.strictEqual(typeof val, 'number');
      assert.strictEqual(val, Number(val.toFixed(1)), 'Test 4B Failed: Temp value not rounded to 1 decimal place');
    });
    humDs.data.forEach(val => {
      assert.strictEqual(typeof val, 'number');
      assert.strictEqual(val, Number(val.toFixed(1)), 'Test 4B Failed: Hum value not rounded to 1 decimal place');
    });

    console.log(`  ✓ Test 4B: QuickChart 24h 288-record URL (${chartUrl.length} chars < 2000) & design passed`);
  }

  // 4C. buildQuickChartUrl with Sheet object mock & edge cases
  {
    // Empty records / null handling
    assert.strictEqual(buildQuickChartUrl(null), null, 'Test 4C-1 Failed: null input should return null');
    assert.strictEqual(buildQuickChartUrl([]), null, 'Test 4C-2 Failed: empty array should return null');
    assert.strictEqual(buildQuickChartUrlFromRecords_(null), null, 'Test 4C-3 Failed: null records should return null');
    assert.strictEqual(buildQuickChartUrlFromRecords_([]), null, 'Test 4C-4 Failed: empty records should return null');

    // Mock sheet with lastRow < 2 (only header)
    const mockEmptySheet = {
      getLastRow: () => 1,
      getRange: () => { throw new Error('should not be called'); }
    };
    assert.strictEqual(buildQuickChartUrl(mockEmptySheet), null, 'Test 4C-5 Failed: empty sheet should return null');

    // Mock sheet with 10 rows of data
    const mockSheetData = [
      ['Timestamp', 'Temp', 'Press', 'Hum'],
      [new Date('2026-08-31T12:00:00Z'), 28.5, 1012, 60.0],
      [new Date('2026-08-31T12:05:00Z'), 28.6, 1012, 60.5],
      [new Date('2026-08-31T12:10:00Z'), 28.7, 1012, 61.0]
    ];
    const mockSheet = {
      getLastRow: () => mockSheetData.length,
      getRange: (startRow, startCol, numRows, numCols) => ({
        getValues: () => mockSheetData.slice(startRow - 1, startRow - 1 + numRows)
      })
    };
    const sheetUrl = buildQuickChartUrl(mockSheet);
    assert.ok(typeof sheetUrl === 'string', 'Test 4C-6 Failed: sheetUrl should be a string');
    assert.ok(sheetUrl.length < 2000, 'Test 4C-6 Failed: sheetUrl should be under 2000 chars');

    console.log('  ✓ Test 4C: buildQuickChartUrl Sheet mock & edge cases passed');
  }

  // 5. calculateNextMorning8Am_ calculation
  {
    function parseJstDate(str) {
      return new Date(str + '+09:00').getTime();
    }
    const noon = parseJstDate('2026-08-30T14:00:00');
    const expectedNoon = parseJstDate('2026-08-31T08:00:00');
    assert.strictEqual(calculateNextMorning8Am_(noon, 8), expectedNoon, 'Test 5A Failed');

    const night = parseJstDate('2026-08-30T23:30:00');
    const expectedNight = parseJstDate('2026-08-31T08:00:00');
    assert.strictEqual(calculateNextMorning8Am_(night, 8), expectedNight, 'Test 5B Failed');

    const lateNight = parseJstDate('2026-08-31T01:15:00');
    const expectedLateNight = parseJstDate('2026-08-31T08:00:00');
    assert.strictEqual(calculateNextMorning8Am_(lateNight, 8), expectedLateNight, 'Test 5C Failed');
    console.log('  ✓ Test 5: calculateNextMorning8Am_ passed');
  }

  // 6. isSnoozeActive_ checks
  {
    const now = Date.now();
    assert.strictEqual(isSnoozeActive_(null, now), false, 'Test 6A Failed: null should be false');
    assert.strictEqual(isSnoozeActive_('invalid', now), false, 'Test 6B Failed: invalid should be false');
    assert.strictEqual(isSnoozeActive_(now - 1000, now), false, 'Test 6C Failed: past should be false');
    assert.strictEqual(isSnoozeActive_(now + 10000, now), true, 'Test 6D Failed: future should be true');
    assert.strictEqual(isSnoozeActive_(String(now + 10000), now), true, 'Test 6E Failed: string future should be true');
    console.log('  ✓ Test 6: isSnoozeActive_ passed');
  }

  // 7. formatSnoozeUntilJst_ checks
  {
    const testDateMs = new Date('2026-08-31T08:00:00+09:00').getTime();
    const formatted = formatSnoozeUntilJst_(testDateMs);
    assert.strictEqual(formatted, '08/31 08:00', 'Test 7 Failed: formatted snooze timestamp mismatch');
    assert.strictEqual(formatSnoozeUntilJst_(null), '', 'Test 7B Failed: null should return empty string');
    console.log('  ✓ Test 7: formatSnoozeUntilJst_ passed');
  }

  // 8. calculatePressureTrend_ checks
  {
    assert.strictEqual(calculatePressureTrend_(null, 1013.2), '安定', 'Test 8A Failed: null should return 安定');
    assert.strictEqual(calculatePressureTrend_(1008.4, 1010.5), '↘ -2.1/3h', 'Test 8B Failed: drop trend');
    assert.strictEqual(calculatePressureTrend_(1015.0, 1013.5), '↗ +1.5/3h', 'Test 8C Failed: rise trend');
    assert.strictEqual(calculatePressureTrend_(1013.2, 1013.2), '安定', 'Test 8D Failed: flat trend');
    assert.strictEqual(calculatePressureTrend_(1013.6, 1013.2), '→ +0.4/3h', 'Test 8E Failed: small rise trend');
    assert.strictEqual(calculatePressureTrend_(1012.7, 1013.2), '→ -0.5/3h', 'Test 8F Failed: small drop trend');
    console.log('  ✓ Test 8: calculatePressureTrend_ passed');
  }

  // 9. evaluateAlertDecision_ 5-step priority flow checks
  {
    const now = new Date('2026-08-31T14:00:00+09:00').getTime();
    const todayJst = '2026-08-31';

    // 1. Normal state -> no alert
    const r1 = evaluateAlertDecision_({
      temp: 25.0,
      hum: 50.0,
      press: 1013.2,
      isOverThreshold: false,
      nowMs: now,
      snoozeUntil: null,
      lastSentTime: null,
      dailyAlertInfo: null
    });
    assert.strictEqual(r1.shouldAlert, false);
    assert.strictEqual(r1.reason, 'normal');

    // 2. Sensor anomaly (temp > 50) -> skipped
    const r2A = evaluateAlertDecision_({
      temp: 60.0,
      hum: 50.0,
      isOverThreshold: true,
      nowMs: now
    });
    assert.strictEqual(r2A.shouldAlert, false);
    assert.strictEqual(r2A.reason, 'sensor_anomaly');

    // Sensor anomaly (temp < -10) -> skipped
    const r2B = evaluateAlertDecision_({
      temp: -15.0,
      hum: 50.0,
      isOverThreshold: true,
      nowMs: now
    });
    assert.strictEqual(r2B.shouldAlert, false);
    assert.strictEqual(r2B.reason, 'sensor_anomaly');

    // Sensor anomaly (hum > 100) -> skipped
    const r2C = evaluateAlertDecision_({
      temp: 25.0,
      hum: 105.0,
      isOverThreshold: true,
      nowMs: now
    });
    assert.strictEqual(r2C.shouldAlert, false);
    assert.strictEqual(r2C.reason, 'sensor_anomaly');

    // 3. SNOOZE active -> skipped
    const r3 = evaluateAlertDecision_({
      temp: 31.0,
      hum: 75.0,
      isOverThreshold: true,
      nowMs: now,
      snoozeUntil: now + 3600000
    });
    assert.strictEqual(r3.shouldAlert, false);
    assert.strictEqual(r3.reason, 'snooze_active');

    // 4. Warning threshold exceeded (first time) -> should alert
    const r4 = evaluateAlertDecision_({
      temp: 31.0,
      hum: 75.0,
      isOverThreshold: true,
      nowMs: now,
      snoozeUntil: null,
      lastSentTime: null,
      dailyAlertInfo: null
    });
    assert.strictEqual(r4.shouldAlert, true);
    assert.strictEqual(r4.reason, 'alert_triggered');

    // 5. 1-hour cooldown active (< 60 min) -> skipped
    const r5A = evaluateAlertDecision_({
      temp: 31.0,
      hum: 75.0,
      isOverThreshold: true,
      nowMs: now,
      lastSentTime: now - 30 * 60 * 1000,
      dailyAlertInfo: { date: todayJst, count: 1 }
    });
    assert.strictEqual(r5A.shouldAlert, false);
    assert.strictEqual(r5A.reason, 'cooldown_active');

    // Cooldown expired (> 60 min) -> should alert
    const r5B = evaluateAlertDecision_({
      temp: 31.0,
      hum: 75.0,
      isOverThreshold: true,
      nowMs: now,
      lastSentTime: now - 65 * 60 * 1000,
      dailyAlertInfo: { date: todayJst, count: 1 }
    });
    assert.strictEqual(r5B.shouldAlert, true);
    assert.strictEqual(r5B.reason, 'alert_triggered');

    // 6. Daily limit reached (count 5 today) -> skipped
    const r6A = evaluateAlertDecision_({
      temp: 31.0,
      hum: 75.0,
      isOverThreshold: true,
      nowMs: now,
      lastSentTime: now - 70 * 60 * 1000,
      dailyAlertInfo: { date: todayJst, count: 5 }
    });
    assert.strictEqual(r6A.shouldAlert, false);
    assert.strictEqual(r6A.reason, 'daily_limit_reached');

    // Daily count 5 on yesterday's date -> should alert (reset on new day)
    const r6B = evaluateAlertDecision_({
      temp: 31.0,
      hum: 75.0,
      isOverThreshold: true,
      nowMs: now,
      lastSentTime: now - 70 * 60 * 1000,
      dailyAlertInfo: { date: '2026-08-30', count: 5 }
    });
    assert.strictEqual(r6B.shouldAlert, true);
    assert.strictEqual(r6B.reason, 'alert_triggered');

    console.log('  ✓ Test 9: evaluateAlertDecision_ passed');
  }

  console.log('\nAll Metrics tests passed successfully!');
}

runTests();
