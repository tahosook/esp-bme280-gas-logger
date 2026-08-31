const assert = require('assert');
const {
  calculateDiscomfortIndex_,
  calculateAbsoluteHumidity_,
  classifyDiscomfortIndex_,
  buildQuickChartConfig_
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

  console.log('\nAll Metrics tests passed successfully!');
}

runTests();
