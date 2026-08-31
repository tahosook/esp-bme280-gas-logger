const assert = require('assert');
const {
  calculateDiscomfortIndex_,
  calculateAbsoluteHumidity_,
  classifyDiscomfortIndex_,
  buildQuickChartConfig_,
  calculateNextMorning8Am_,
  isSnoozeActive_,
  formatSnoozeUntilJst_
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
    assert.strictEqual(configObj.width, 800, 'Test 4 Failed: incorrect width');
    assert.strictEqual(configObj.height, 400, 'Test 4 Failed: incorrect height');
    assert.strictEqual(configObj.chart.type, 'line', 'Test 4 Failed: incorrect chart type');
    assert.strictEqual(configObj.chart.data.labels.length, 2, 'Test 4 Failed: incorrect labels length');
    assert.strictEqual(configObj.chart.data.datasets.length, 2, 'Test 4 Failed: incorrect datasets length');
    console.log('  ✓ Test 4: QuickChart Config builder passed');
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

  console.log('\nAll Metrics tests passed successfully!');
}

runTests();
