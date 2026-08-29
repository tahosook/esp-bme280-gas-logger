const ERROR_LOG_PROPERTIES = {
  errorLog: 'ERROR_LOG_ENTRIES'
};

const SENSITIVE_KEYS = [
  'token',
  'password',
  'secret',
  'accessToken',
  'accessTokenSecret',
  'lineChannelSecret',
  'lineChannelAccessToken',
  'authorization'
];

function logError_(operation, target, errorCode, error) {
  let safeErrorCode = 'unknown';
  try {
    safeErrorCode = typeof errorCode === 'string' ? errorCode : String(errorCode || 'unknown');
    const safeMessage = error instanceof Error ? error.message : String(error || 'no_message');

    const entry = {
      timestamp: new Date().toISOString(),
      operation,
      target,
      errorCode: safeErrorCode,
      message: maskSecret_(safeMessage)
    };

    const properties = PropertiesService.getScriptProperties();
    const existing = properties.getProperty(ERROR_LOG_PROPERTIES.errorLog);
    let log = [];
    if (existing) {
      try {
        log = JSON.parse(existing);
      } catch (error) {
        log = [];
      }
    }
    log.push(entry);
    if (log.length > 100) {
      log = log.slice(log.length - 100);
    }
    properties.setProperty(ERROR_LOG_PROPERTIES.errorLog, JSON.stringify(log));
    console.error(JSON.stringify({ operation, target, errorCode: safeErrorCode }));
  } catch (loggingError) {
    console.error(JSON.stringify({ operation: 'logError_failed', target, errorCode: safeErrorCode }));
  }
}

function maskSecret_(text) {
  if (typeof text !== 'string') {
    return String(text);
  }
  let masked = text;
  for (const key of SENSITIVE_KEYS) {
    const escapedKey = key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const pattern = new RegExp(escapedKey + '(?:\\s*[:=]\\s*\\S+)?', 'gi');
    masked = masked.replace(pattern, '***');
  }
  return masked;
}

function getErrorLogEntries_() {
  const properties = PropertiesService.getScriptProperties();
  const existing = properties.getProperty(ERROR_LOG_PROPERTIES.errorLog);
  if (!existing) {
    return [];
  }
  try {
    return JSON.parse(existing);
  } catch (error) {
    return [];
  }
}

function clearErrorLog_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(ERROR_LOG_PROPERTIES.errorLog);
}

function getErrorLogForTest_() {
  return getErrorLogEntries_();
}
