const LINE_BOT_PROPERTIES = {
  skipUntil: 'MONITOR_SKIP_UNTIL'
};

function handleLineWebhook_(e) {
  let body;
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      return errorResponse_('invalid_payload');
    }
    body = e.postData.contents;
  } catch (error) {
    return errorResponse_('invalid_payload');
  }

  const headers = e && e.headers ? e.headers : {};
  const signature = headers['X-Line-Signature'] ||
    headers['x-line-signature'] ||
    (e && e.parameter ? (e.parameter['X-Line-Signature'] || e.parameter['x-line-signature']) : null);

  const properties = PropertiesService.getScriptProperties();
  const channelSecret = properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelSecret);

  if (signature) {
    if (!channelSecret || !verifyLineSignature_(body, signature, channelSecret)) {
      return errorResponse_('invalid_signature');
    }
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  const events = payload.events;
  if (!Array.isArray(events)) {
    return successResponse_();
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event && event.type === 'message' && event.message && event.message.type === 'text') {
      handleTextMessageEvent_(event);
    }
  }

  return successResponse_();
}

function verifyLineSignature_(body, signature, channelSecret) {
  try {
    const hmac = Utilities.computeHmacSha256Signature(body, channelSecret);
    const computedSignature = Utilities.base64Encode(hmac);
    return signature === computedSignature;
  } catch (error) {
    return false;
  }
}

function handleTextMessageEvent_(event) {
  const text = event.message.text || '';
  const replyToken = event.replyToken;
  const normalized = normalizeText_(text);

  if (normalized === '状況' || normalized === 'status') {
    const statusReply = buildStatusReply_();
    replyMessage_(replyToken, statusReply);
  } else if (normalized === 'スキップ' || normalized === 'skip') {
    const lock = LockService.getScriptLock();
    const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
    const timeoutMs = config.LINE_LOCK_TIMEOUT_MS || 2000;
    lock.waitLock(timeoutMs);
    try {
      const targetHour = typeof config.SKIP_UNTIL_HOUR === 'number' ? config.SKIP_UNTIL_HOUR : 8;
      const skipUntil = calculateNextMorning8Am_(Date.now(), targetHour);
      const properties = PropertiesService.getScriptProperties();
      properties.setProperty(LINE_BOT_PROPERTIES.skipUntil, String(skipUntil));
      replyMessage_(replyToken, '監視アラート通知を翌朝8:00までスキップに設定しました。');
    } finally {
      lock.releaseLock();
    }
  } else if (normalized === 'クリア' || normalized === 'clear') {
    const lock = LockService.getScriptLock();
    const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
    const timeoutMs = config.LINE_LOCK_TIMEOUT_MS || 2000;
    lock.waitLock(timeoutMs);
    try {
      if (typeof resetMonitorStates_ === 'function') {
        resetMonitorStates_();
      }
      const properties = PropertiesService.getScriptProperties();
      properties.deleteProperty(LINE_BOT_PROPERTIES.skipUntil);
      replyMessage_(replyToken, '監視状態およびスキップ設定を全リセットしました。');
    } finally {
      lock.releaseLock();
    }
  } else {
    const helpReply = [
      '利用可能なコマンド:',
      '・状況 (status): 現在の室温・湿度・監視状態を表示',
      '・スキップ (skip): アラート通知を一時スキップ',
      '・クリア (clear): 監視状態をリセット'
    ].join('\n');
    replyMessage_(replyToken, helpReply);
  }
}

function normalizeText_(text) {
  if (typeof text !== 'string') {
    return '';
  }
  let str = text.trim();
  str = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  return str.toLowerCase();
}

function buildStatusReply_() {
  const properties = PropertiesService.getScriptProperties();
  const states = typeof loadMonitorStates_ === 'function' ? loadMonitorStates_(properties) : {
    temp: { alert: false },
    hum: { alert: false },
    discomfortIndex: { alert: false }
  };
  const lastValid = typeof loadLastValidMeasurement_ === 'function' ? loadLastValidMeasurement_(properties) : null;

  const tempStatus = states.temp && states.temp.alert ? '[超過]' : '[正常]';
  const humStatus = states.hum && states.hum.alert ? '[超過]' : '[正常]';
  const diStatus = states.discomfortIndex && states.discomfortIndex.alert ? '[超過]' : '[正常]';

  const lines = ['現在の監視状態：'];

  if (lastValid) {
    const tempVal = typeof lastValid.temp === 'number' ? lastValid.temp.toFixed(2) : '-';
    const humVal = typeof lastValid.hum === 'number' ? lastValid.hum.toFixed(2) : '-';
    const diVal = typeof lastValid.discomfortIndex === 'number' ? lastValid.discomfortIndex.toFixed(2) : '-';
    let timeStr = '-';
    if (lastValid.timestamp) {
      if (typeof formatDateTokyo_ === 'function') {
        timeStr = formatDateTokyo_(lastValid.timestamp, 'yyyy-MM-dd HH:mm:ss');
      } else if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
        const d = new Date(lastValid.timestamp);
        timeStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
      } else {
        timeStr = String(lastValid.timestamp);
      }
    }

    lines.push(`気温: ${tempVal}℃ ${tempStatus}`);
    lines.push(`湿度: ${humVal}% ${humStatus}`);
    lines.push(`簡易暑さ指数: ${diVal} ${diStatus}`);
    lines.push(`最終受信: ${timeStr}`);
  } else {
    lines.push(`気温: - ${tempStatus}`);
    lines.push(`湿度: - ${humStatus}`);
    lines.push(`簡易暑さ指数: - ${diStatus}`);
    lines.push('最終受信: データなし');
  }

  return lines.join('\n');
}

function replyMessage_(replyToken, text) {
  if (!replyToken || typeof replyToken !== 'string') {
    return false;
  }
  const properties = PropertiesService.getScriptProperties();
  const channelAccessToken = properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelAccessToken);
  if (!channelAccessToken) {
    if (typeof logError_ === 'function') {
      logError_('linebot', 'reply', 'send_failed', new Error('LINE_CHANNEL_ACCESS_TOKEN is missing'));
    }
    return false;
  }

  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: text
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + channelAccessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode ? response.getResponseCode() : 200;
    if (code !== 200) {
      const responseText = response.getContentText ? response.getContentText() : '';
      if (typeof logError_ === 'function') {
        logError_('linebot', 'reply', 'send_failed', new Error('HTTP ' + code + ': ' + responseText));
      }
      return false;
    }
    return true;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('linebot', 'reply', 'send_failed', error);
    }
    return false;
  }
}

function pushMonitorNotification_(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const properties = PropertiesService.getScriptProperties();
  const skipUntilStr = properties.getProperty(LINE_BOT_PROPERTIES.skipUntil);
  if (skipUntilStr) {
    const skipUntil = parseInt(skipUntilStr, 10);
    if (!isNaN(skipUntil) && Date.now() < skipUntil) {
      return false;
    }
  }

  const userId = properties.getProperty(SCRIPT_PROPERTY_KEYS.lineUserId);
  if (!userId) {
    if (typeof logError_ === 'function') {
      logError_('linebot', 'push', 'missing_user_id', new Error('LINE_USER_ID is not configured'));
    }
    return false;
  }

  const channelAccessToken = properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelAccessToken);
  if (!channelAccessToken) {
    if (typeof logError_ === 'function') {
      logError_('linebot', 'push', 'send_failed', new Error('LINE_CHANNEL_ACCESS_TOKEN is missing'));
    }
    return false;
  }

  return pushMessage_(userId, text, channelAccessToken);
}

function pushMessage_(userId, text, channelAccessToken) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: userId,
    messages: [
      {
        type: 'text',
        text: text
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + channelAccessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode ? response.getResponseCode() : 200;
    if (code !== 200) {
      const responseText = response.getContentText ? response.getContentText() : '';
      if (typeof logError_ === 'function') {
        logError_('linebot', 'push', 'send_failed', new Error('HTTP ' + code + ': ' + responseText));
      }
      return false;
    }
    return true;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('linebot', 'push', 'send_failed', error);
    }
    return false;
  }
}

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
