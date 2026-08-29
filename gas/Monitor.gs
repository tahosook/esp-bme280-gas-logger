const MONITOR_PROPERTIES = {
  statePrefix: 'MONITOR_STATE_',
  lastValidPrefix: 'MONITOR_LAST_VALID_'
};

const DEFAULT_THRESHOLDS = {
  temp: { over: 30.0, hysteresis: 0.5 },
  hum: { over: 70.0, hysteresis: 5.0 },
  discomfortIndex: { over: 80.0, hysteresis: 0.5 }
};

const DEFAULT_SMOOTHING = {
  consecutiveK: 2
};

function evaluateMonitorConditions_(measurement) {
  const temp = measurement.temp;
  const hum = measurement.hum;
  const discomfortIndex = 0.81 * temp + 0.01 * hum * (0.99 * temp - 14.3) + 46.3;

  return {
    temp,
    hum,
    discomfortIndex,
    timestamp: new Date(),
    press: measurement.press
  };
}

function updateMonitorState_(measurement) {
  const conditions = evaluateMonitorConditions_(measurement);
  const properties = PropertiesService.getScriptProperties();
  const monitorConfig = getMonitorConfig_();
  const thresholds = monitorConfig.thresholds;
  const smoothing = monitorConfig.smoothing;

  const currentStates = loadMonitorStates_(properties);
  const lastValid = loadLastValidMeasurement_(properties);
  const anomaly = detectAnomaly_(conditions, lastValid);

  if (!anomaly) {
    saveLastValidMeasurement_(properties, conditions);
  }

  const states = {
    temp: evaluateConditionState_(currentStates.temp, conditions.temp, thresholds.temp, smoothing),
    hum: evaluateConditionState_(currentStates.hum, conditions.hum, thresholds.hum, smoothing),
    discomfortIndex: evaluateConditionState_(currentStates.discomfortIndex, conditions.discomfortIndex, thresholds.discomfortIndex, smoothing)
  };

  const overallAlert = states.temp.alert || states.hum.alert || states.discomfortIndex.alert;
  const previousAlert = currentStates.temp.alert || currentStates.hum.alert || currentStates.discomfortIndex.alert;

  const notification = buildMonitorNotification_(states, overallAlert, previousAlert, conditions, anomaly);

  saveMonitorStates_(properties, states);

  return {
    states,
    notification,
    anomaly
  };
}

function getMonitorConfig_() {
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
  return {
    thresholds: {
      temp: {
        over: getConfigNumber_(config, ['TEMP_HIGH', 'MONITOR_TEMP_OVER'], DEFAULT_THRESHOLDS.temp.over),
        hysteresis: getConfigNumber_(config, ['HYSTERESIS_TEMP', 'MONITOR_TEMP_HYSTERESIS'], DEFAULT_THRESHOLDS.temp.hysteresis)
      },
      hum: {
        over: getConfigNumber_(config, ['HUM_HIGH', 'MONITOR_HUM_OVER'], DEFAULT_THRESHOLDS.hum.over),
        hysteresis: getConfigNumber_(config, ['HYSTERESIS_HUM', 'MONITOR_HUM_HYSTERESIS'], DEFAULT_THRESHOLDS.hum.hysteresis)
      },
      discomfortIndex: {
        over: getConfigNumber_(config, ['HEAT_INDEX_HIGH', 'MONITOR_DI_OVER'], DEFAULT_THRESHOLDS.discomfortIndex.over),
        hysteresis: getConfigNumber_(config, ['HYSTERESIS_HEAT_INDEX', 'MONITOR_DI_HYSTERESIS'], DEFAULT_THRESHOLDS.discomfortIndex.hysteresis)
      }
    },
    smoothing: {
      consecutiveK: getConfigNumber_(config, ['SMOOTH_K', 'MONITOR_CONSECUTIVE_K'], DEFAULT_SMOOTHING.consecutiveK)
    }
  };
}

function getConfigNumber_(config, keys, fallback) {
  for (const key of keys) {
    const value = Number(config[key]);
    if (isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function loadMonitorStates_(properties) {
  const result = {
    temp: { consecutive: 0, alert: false },
    hum: { consecutive: 0, alert: false },
    discomfortIndex: { consecutive: 0, alert: false }
  };

  for (const key of Object.keys(result)) {
    const raw = properties.getProperty(MONITOR_PROPERTIES.statePrefix + key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        result[key] = Object.assign({}, result[key], parsed);
      } catch (error) {
        // keep defaults on parse error
      }
    }
  }

  return result;
}

function saveMonitorStates_(properties, states) {
  for (const [key, value] of Object.entries(states)) {
    properties.setProperty(MONITOR_PROPERTIES.statePrefix + key, JSON.stringify(value));
  }
}

function loadLastValidMeasurement_(properties) {
  const raw = properties.getProperty(MONITOR_PROPERTIES.lastValidPrefix + 'payload');
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveLastValidMeasurement_(properties, conditions) {
  properties.setProperty(MONITOR_PROPERTIES.lastValidPrefix + 'payload', JSON.stringify(conditions));
}

function evaluateConditionState_(current, value, threshold, smoothing) {
  const isOver = value > threshold.over;
  const isRecovered = value <= threshold.over - threshold.hysteresis;
  let consecutive = current.consecutive || 0;
  let alert = current.alert || false;

  if (isOver) {
    consecutive += 1;
  } else {
    consecutive = 0;
  }

  if (isRecovered) {
    alert = false;
  } else if (consecutive >= (smoothing.consecutiveK || 2)) {
    alert = true;
  }

  return { consecutive, alert };
}

function detectAnomaly_(current, lastValid) {
  if (!lastValid) {
    return false;
  }

  const deltaTemp = Math.abs(current.temp - lastValid.temp);
  const deltaHum = Math.abs(current.hum - lastValid.hum);
  const deltaPress = Math.abs(current.press - lastValid.press);

  const limits = {
    temp: 5.0,
    hum: 30.0,
    press: 20.0
  };

  if (deltaTemp > limits.temp || deltaHum > limits.hum || deltaPress > limits.press) {
    return true;
  }

  return false;
}

function buildMonitorNotification_(states, overallAlert, previousAlert, conditions, anomaly) {
  if (!overallAlert) {
    return null;
  }

  if (previousAlert) {
    return null;
  }

  const lines = [
    '室温監視：超過しました。',
    `temp=${conditions.temp.toFixed(2)}℃ hum=${conditions.hum.toFixed(2)}% DI=${conditions.discomfortIndex.toFixed(2)}`
  ];

  if (anomaly) {
    lines.push('※ 急変と判定されたため参考値です。');
  }

  lines.push('（公式WBGTではなく自宅用目安です）');

  return {
    text: lines.join('\n'),
    payload: conditions
  };
}

function resetMonitorStates_() {
  const properties = PropertiesService.getScriptProperties();
  const defaults = {
    temp: { consecutive: 0, alert: false },
    hum: { consecutive: 0, alert: false },
    discomfortIndex: { consecutive: 0, alert: false }
  };

  saveMonitorStates_(properties, defaults);
}

function getMonitorStateForTest_() {
  return loadMonitorStates_(PropertiesService.getScriptProperties());
}
