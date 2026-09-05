const LINE_BOT_PROPERTIES = {
  skipUntil: 'ALERT_SNOOZE_UNTIL',
  legacySkipUntil: 'MONITOR_SKIP_UNTIL'
};

function getSnoozeUntilProperty_(properties) {
  return properties.getProperty(LINE_BOT_PROPERTIES.skipUntil) ||
    properties.getProperty(LINE_BOT_PROPERTIES.legacySkipUntil);
}

function extractLineSignature_(e) {
  if (!e) return null;
  const headers = e.headers || {};
  if (headers['X-Line-Signature']) return headers['X-Line-Signature'];
  if (headers['x-line-signature']) return headers['x-line-signature'];
  if (e.parameter) {
    return e.parameter['X-Line-Signature'] || e.parameter['x-line-signature'] || null;
  }
  return null;
}

function dispatchLineEvents_(events) {
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event && event.type === 'message' && event.message && event.message.type === 'text') {
      handleTextMessageEvent_(event);
    } else if (event && event.type === 'postback') {
      handlePostbackEvent_(event);
    }
  }
}

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

  const signature = extractLineSignature_(e);
  const properties = PropertiesService.getScriptProperties();
  const channelSecret = properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelSecret);

  if (signature && (!channelSecret || !verifyLineSignature_(body, signature, channelSecret))) {
    return errorResponse_('invalid_signature');
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  if (Array.isArray(payload.events)) {
    dispatchLineEvents_(payload.events);
  }

  return successResponse_();
}

function handleSnoozeCustomPostback_(event) {
  const replyToken = event.replyToken;
  const datetimeStr = event.postback.params ? event.postback.params.datetime : null;
  if (!datetimeStr) {
    return;
  }
  const targetMs = typeof parseJstDatetimepicker_ === 'function' ? parseJstDatetimepicker_(datetimeStr) : null;
  if (!targetMs) {
    replyMessage_(replyToken, '無効な日時、または過去の日時が指定されました。未来の日時を指定してください。');
    return;
  }

  const lock = LockService.getScriptLock();
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
  const timeoutMs = config.LINE_LOCK_TIMEOUT_MS || 2000;
  lock.waitLock(timeoutMs);
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(LINE_BOT_PROPERTIES.skipUntil, String(targetMs));
    properties.setProperty(LINE_BOT_PROPERTIES.legacySkipUntil, String(targetMs));
    const messages = buildSkipFlexMessage_(targetMs);
    replyMessageObjects_(replyToken, messages);
  } finally {
    lock.releaseLock();
  }
}

function handlePostbackEvent_(event) {
  if (!event || !event.postback || !event.postback.data) {
    return;
  }
  if (event.postback.data === 'action=snooze_custom') {
    handleSnoozeCustomPostback_(event);
  }
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

function handleSnoozeCommand_(replyToken) {
  const lock = LockService.getScriptLock();
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
  const timeoutMs = config.LINE_LOCK_TIMEOUT_MS || 2000;
  lock.waitLock(timeoutMs);
  try {
    const targetHour = typeof config.SKIP_UNTIL_HOUR === 'number' ? config.SKIP_UNTIL_HOUR : 8;
    const skipUntil = typeof calculateNextMorning8Am_ === 'function'
      ? calculateNextMorning8Am_(Date.now(), targetHour)
      : Date.now() + 8 * 3600 * 1000;
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(LINE_BOT_PROPERTIES.skipUntil, String(skipUntil));
    properties.setProperty(LINE_BOT_PROPERTIES.legacySkipUntil, String(skipUntil));
    const messages = buildSkipFlexMessage_(skipUntil);
    replyMessageObjects_(replyToken, messages);
  } finally {
    lock.releaseLock();
  }
}

function handleClearCommand_(replyToken) {
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
    properties.deleteProperty(LINE_BOT_PROPERTIES.legacySkipUntil);
    replyMessage_(replyToken, '🔔 監視状態およびスヌーズ設定をリセットしました（監視再開）。');
  } finally {
    lock.releaseLock();
  }
}

function dispatchTextMessageCommand_(normalized, replyToken) {
  const nowCommands = ['now', '状況', '状態', '現在', 'status'];
  const snoozeCommands = ['snooze', 'スキップ', 'おやすみ', 'skip'];
  const trendsCommands = ['trends', 'グラフ', '24h', '推移'];
  const clearCommands = ['clear', 'クリア', '解除'];

  if (nowCommands.indexOf(normalized) !== -1) {
    const messages = buildStatusFlexMessage_();
    replyMessageObjects_(replyToken, messages);
  } else if (trendsCommands.indexOf(normalized) !== -1) {
    const messages = buildGraphMessage_();
    replyMessageObjects_(replyToken, messages);
  } else if (snoozeCommands.indexOf(normalized) !== -1) {
    handleSnoozeCommand_(replyToken);
  } else if (clearCommands.indexOf(normalized) !== -1) {
    handleClearCommand_(replyToken);
  } else {
    const helpReply = [
      '利用可能なコマンド:',
      '・NOW (状況): 現在の室温・湿度・気圧・監視状態を表示',
      '・SNOOZE (おやすみ/スキップ): アラート通知を翌朝8:00まで停止',
      '・TRENDS (グラフ/24h): 直近24時間の温湿度推移グラフ画像を表示',
      '・CLEAR (解除/クリア): 監視状態およびスヌーズ設定をリセット'
    ].join('\n');
    replyMessage_(replyToken, helpReply);
  }
}

function handleTextMessageError_(err, replyToken) {
  const errStr = err && err.toString ? err.toString() : String(err);
  const errStack = err && err.stack ? err.stack : '';
  console.error('LINE Webhook Error:', errStr, errStack);
  if (typeof logError_ === 'function') {
    logError_('linebot', 'webhook', 'unhandled_error', err);
  }
  if (replyToken) {
    try {
      const errMsg = err && err.message ? err.message : String(err);
      replyMessage_(replyToken, '⚠️ GAS処理エラー: ' + errMsg);
    } catch (replyErr) {
      console.error('Failed to reply error message to LINE:', replyErr);
    }
  }
}

function handleTextMessageEvent_(event) {
  const text = (event && event.message && event.message.text) || '';
  const replyToken = event && event.replyToken;
  const normalized = normalizeText_(text);

  try {
    dispatchTextMessageCommand_(normalized, replyToken);
  } catch (err) {
    handleTextMessageError_(err, replyToken);
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

function getGraphTargetSheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    return null;
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    return getRawDataSheet_(spreadsheet, properties) || spreadsheet.getActiveSheet();
  } catch (err) {
    console.error('Failed to open spreadsheet:', err);
    if (typeof logError_ === 'function') {
      logError_('linebot', 'graph', 'spreadsheet_open_failed', err);
    }
    return null;
  }
}

function fetchGraphChartUrl_(properties) {
  const sheet = getGraphTargetSheet_(properties);
  if (!sheet) {
    return null;
  }

  if (typeof buildQuickChartUrl === 'function') {
    try {
      return buildQuickChartUrl(sheet);
    } catch (err) {
      console.error('buildQuickChartUrl error:', err);
      if (typeof logError_ === 'function') {
        logError_('linebot', 'quickchart', 'build_url_failed', err);
      }
    }
  }
  return null;
}

function buildGraphMessage_() {
  const properties = PropertiesService.getScriptProperties();
  const chartUrl = fetchGraphChartUrl_(properties);

  if (!chartUrl) {
    return [{ type: 'text', text: 'グラフを生成するためのデータが不足しています。' }];
  }

  return [
    {
      type: 'image',
      originalContentUrl: chartUrl,
      previewImageUrl: chartUrl
    }
  ];
}

function getPastPressureFromSheet_(properties) {
  try {
    const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
    const spreadsheetId = properties.getProperty(spreadsheetIdKey);
    if (!spreadsheetId) {
      return null;
    }
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = getRawDataSheet_(spreadsheet, properties) || spreadsheet.getActiveSheet();
    if (!sheet || sheet.getLastRow() < 2) {
      return null;
    }
    const targetRow = Math.max(2, sheet.getLastRow() - 36);
    const rowValues = sheet.getRange(targetRow, 1, 1, 4).getValues()[0];
    const p = Number(rowValues[2]);
    return (!isNaN(p) && isFinite(p)) ? p : null;
  } catch (e) {
    return null;
  }
}

function formatStatusTimeString_(timestamp) {
  if (!timestamp) return 'データなし';
  let formattedDate = '';
  if (typeof formatDateTokyo_ === 'function') {
    formattedDate = formatDateTokyo_(timestamp, 'MM/dd HH:mm');
  } else if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    formattedDate = Utilities.formatDate(new Date(timestamp), 'Asia/Tokyo', 'MM/dd HH:mm');
  } else {
    const jst = new Date(new Date(timestamp).getTime() + 9 * 60 * 60 * 1000);
    const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(jst.getUTCDate()).padStart(2, '0');
    const hh = String(jst.getUTCHours()).padStart(2, '0');
    const min = String(jst.getUTCMinutes()).padStart(2, '0');
    formattedDate = `${mm}/${dd} ${hh}:${min}`;
  }
  return `${formattedDate} 測定`;
}

function formatStatusDiscomfortIndex_(tempVal, humVal, lastValidDi) {
  let diVal = typeof lastValidDi === 'number' ? lastValidDi : null;
  if (tempVal !== null && humVal !== null && typeof calculateDiscomfortIndex_ === 'function') {
    diVal = calculateDiscomfortIndex_(tempVal, humVal);
  }
  if (diVal === null) {
    return { diText: '-', diColor: '#27ae60' };
  }

  let diLabel = '快適';
  let diColor = '#27ae60';
  if (typeof classifyDiscomfortIndex_ === 'function') {
    const diInfo = classifyDiscomfortIndex_(diVal);
    diColor = diInfo.color;
    diLabel = diInfo.label;
  }
  return { diText: `${diVal.toFixed(1)}（${diLabel}）`, diColor };
}

/* eslint-disable complexity -- Format measurements (temp, hum, press, DI) cohesively to avoid micro-helper fragmentation. */
function formatStatusMeasurements_(lastValid, states, pastPress) {
  const isTempAlert = Boolean(states && states.temp && states.temp.alert);
  const isHumAlert = Boolean(states && states.hum && states.hum.alert);

  if (!lastValid) {
    return {
      tempText: '-',
      humText: '-',
      pressText: '-',
      diText: '-',
      timeStr: 'データなし',
      diColor: '#27ae60',
      isTempAlert,
      isHumAlert
    };
  }

  const tempVal = typeof lastValid.temp === 'number' ? lastValid.temp : null;
  const humVal = typeof lastValid.hum === 'number' ? lastValid.hum : null;
  const pressVal = typeof lastValid.press === 'number' ? lastValid.press : null;

  const tempText = tempVal !== null
    ? (isTempAlert ? `${tempVal.toFixed(1)} ℃ (⚠️ 超過)` : `${tempVal.toFixed(1)} ℃ (正常)`)
    : '-';
  const humText = humVal !== null
    ? (isHumAlert ? `${Math.round(humVal)} % (⚠️ 多湿)` : `${Math.round(humVal)} % (正常)`)
    : '-';
  const trendStr = (pressVal !== null && typeof calculatePressureTrend_ === 'function' && pastPress !== null)
    ? calculatePressureTrend_(pressVal, pastPress)
    : '安定';
  const pressText = pressVal !== null ? `${pressVal.toFixed(1)} hPa (${trendStr})` : '-';
  const { diText, diColor } = formatStatusDiscomfortIndex_(tempVal, humVal, lastValid.discomfortIndex);

  return {
    tempText,
    humText,
    pressText,
    diText,
    timeStr: formatStatusTimeString_(lastValid.timestamp),
    diColor,
    isTempAlert,
    isHumAlert
  };
}
/* eslint-enable complexity */

/* eslint-disable complexity -- Keep Flex Message construction cohesive to avoid unnecessary helper/call-chain fragmentation. */
function buildStatusFlexMessage_() {
  const properties = PropertiesService.getScriptProperties();
  const skipUntil = typeof getSnoozeUntilProperty_ === 'function'
    ? getSnoozeUntilProperty_(properties)
    : (properties.getProperty(LINE_BOT_PROPERTIES.skipUntil) || properties.getProperty('MONITOR_SKIP_UNTIL'));
  const isSnooze = typeof isSnoozeActive_ === 'function' ? isSnoozeActive_(skipUntil, Date.now()) : false;
  const snoozeTimeStr = typeof formatSnoozeUntilJst_ === 'function' ? formatSnoozeUntilJst_(skipUntil) : '';

  const states = typeof loadMonitorStates_ === 'function' ? loadMonitorStates_(properties) : {
    temp: { alert: false },
    hum: { alert: false },
    discomfortIndex: { alert: false }
  };
  const lastValid = typeof loadLastValidMeasurement_ === 'function' ? loadLastValidMeasurement_(properties) : null;
  const pastPress = getPastPressureFromSheet_(properties);
  const m = formatStatusMeasurements_(lastValid, states, pastPress);

  const headerContents = isSnooze ? [
    {
      type: "text",
      text: "🔕 SNOOZE中",
      weight: "bold",
      size: "lg",
      color: "#ffffff"
    },
    {
      type: "text",
      text: `停止期限: ${snoozeTimeStr || '翌朝08:00'} まで (翌朝自動再開)`,
      size: "xs",
      color: "#ffffff",
      margin: "xs"
    }
  ] : [
    {
      type: "text",
      text: "🔔 監視中（Active）",
      weight: "bold",
      size: "lg",
      color: "#ffffff"
    }
  ];

  const footerContents = isSnooze ? [
    {
      type: "button",
      style: "primary",
      color: "#3498db",
      action: {
        type: "message",
        label: "🔔 監視を再開（CLEAR）",
        text: "CLEAR"
      }
    }
  ] : [
    {
      type: "button",
      style: "primary",
      color: "#f39c12",
      action: {
        type: "message",
        label: "🔕 翌朝までSNOOZE",
        text: "SNOOZE"
      }
    },
    {
      type: "button",
      style: "secondary",
      action: {
        type: "message",
        label: "📈 TRENDS",
        text: "TRENDS"
      }
    }
  ];

  const flexJson = {
    type: "flex",
    altText: "現在の監視状態",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: headerContents,
        backgroundColor: isSnooze ? "#e67e22" : "#27ae60"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "室温", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: m.tempText, size: "sm", color: m.isTempAlert ? "#e74c3c" : "#111111", align: "end", flex: 3 }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "湿度", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: m.humText, size: "sm", color: m.isHumAlert ? "#e74c3c" : "#111111", align: "end", flex: 3 }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "気圧", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: m.pressText, size: "sm", color: "#111111", align: "end", flex: 3 }
            ],
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "快適度", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: m.diText, size: "sm", color: m.diColor, align: "end", flex: 3 }
            ],
            margin: "lg",
            alignItems: "center"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "計測日時", size: "xs", color: "#aaaaaa" },
              { type: "text", text: m.timeStr, size: "xs", color: "#aaaaaa", align: "end" }
            ],
            margin: "lg"
          }
        ]
      },
      footer: {
        type: "box",
        layout: isSnooze ? "vertical" : "horizontal",
        spacing: "sm",
        contents: footerContents
      }
    }
  };
  return [flexJson];
}
/* eslint-enable complexity */

function buildSkipFlexMessage_(skipUntil) {
  const properties = PropertiesService.getScriptProperties();
  const untilVal = skipUntil || (typeof getSnoozeUntilProperty_ === 'function' ? getSnoozeUntilProperty_(properties) : properties.getProperty(LINE_BOT_PROPERTIES.skipUntil));
  const snoozeTimeStr = typeof formatSnoozeUntilJst_ === 'function' ? formatSnoozeUntilJst_(untilVal) : '';

  const flexJson = {
    type: "flex",
    altText: "SNOOZE設定完了",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🔕 通知を停止しました",
            weight: "bold",
            color: "#d97706",
            size: "sm"
          },
          {
            type: "text",
            text: `期限: ${snoozeTimeStr || '翌朝 08:00'} まで`,
            size: "xs",
            color: "#888888",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "datetimepicker",
              label: "🗓️ 日時を指定（期間を変更）",
              data: "action=snooze_custom",
              mode: "datetime"
            },
            margin: "lg",
            height: "sm"
          },
          {
            type: "button",
            style: "primary",
            color: "#3498db",
            action: {
              type: "message",
              label: "🔔 監視を再開（CLEAR）",
              text: "CLEAR"
            },
            margin: "sm",
            height: "sm"
          }
        ]
      }
    }
  };
  return [flexJson];
}

function buildAlertFlexMessage_(alertText) {
  const flexJson = {
    type: "flex",
    altText: "⚠️ 室温・湿度 警告",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "⚠️ 室温・湿度 警告",
            weight: "bold",
            size: "lg",
            color: "#ffffff"
          }
        ],
        backgroundColor: "#e74c3c"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: alertText || "室温・湿度の警戒閾値を超過しました。",
            weight: "bold",
            size: "md",
            color: "#333333",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#f39c12",
            action: {
              type: "message",
              label: "🔕 翌朝8時までSNOOZE",
              text: "SNOOZE"
            }
          }
        ]
      }
    }
  };
  return [flexJson];
}

function replyMessage_(replyToken, text) {
  return replyMessageObjects_(replyToken, [{ type: 'text', text: text }]);
}

function replyMessageObjects_(replyToken, messagesArray) {
  if (!replyToken || typeof replyToken !== 'string') {
    return false;
  }
  const properties = PropertiesService.getScriptProperties();
  const channelAccessToken = properties.getProperty(SCRIPT_PROPERTY_KEYS.lineChannelAccessToken);
  const payload = {
    replyToken: replyToken,
    messages: messagesArray
  };
  return sendLineApiRequest_('reply', payload, channelAccessToken, 'reply');
}

function pushMonitorNotification_(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const properties = PropertiesService.getScriptProperties();
  const skipUntil = typeof getSnoozeUntilProperty_ === 'function'
    ? getSnoozeUntilProperty_(properties)
    : (properties.getProperty(LINE_BOT_PROPERTIES.skipUntil) || properties.getProperty('MONITOR_SKIP_UNTIL'));
  if (typeof isSnoozeActive_ === 'function' && isSnoozeActive_(skipUntil, Date.now())) {
    return false;
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

  const messages = typeof buildAlertFlexMessage_ === 'function' ? buildAlertFlexMessage_(text) : [{ type: 'text', text: text }];
  return pushMessageObjects_(userId, messages, channelAccessToken);
}

function pushMessage_(userId, text, channelAccessToken) {
  return pushMessageObjects_(userId, [{ type: 'text', text: text }], channelAccessToken);
}

function pushMessageObjects_(userId, messagesArray, channelAccessToken) {
  if (!userId || typeof userId !== 'string') {
    return false;
  }
  const payload = {
    to: userId,
    messages: messagesArray
  };
  return sendLineApiRequest_('push', payload, channelAccessToken, 'push');
}

function sendLineApiRequest_(endpoint, payload, channelAccessToken, operation) {
  if (!channelAccessToken) {
    if (typeof logError_ === 'function') {
      logError_('linebot', operation, 'send_failed', new Error('LINE_CHANNEL_ACCESS_TOKEN is missing'));
    }
    return false;
  }

  const url = 'https://api.line.me/v2/bot/message/' + endpoint;
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
        logError_('linebot', operation, 'send_failed', new Error('HTTP ' + code + ': ' + responseText));
      }
      return false;
    }
    return true;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('linebot', operation, 'send_failed', error);
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

if (typeof module !== 'undefined') {
  module.exports = {
    LINE_BOT_PROPERTIES,
    getSnoozeUntilProperty_,
    extractLineSignature_,
    dispatchLineEvents_,
    handleLineWebhook_,
    handleSnoozeCustomPostback_,
    handlePostbackEvent_,
    verifyLineSignature_,
    handleSnoozeCommand_,
    handleClearCommand_,
    dispatchTextMessageCommand_,
    handleTextMessageError_,
    handleTextMessageEvent_,
    normalizeText_,
    getGraphTargetSheet_,
    fetchGraphChartUrl_,
    buildGraphMessage_,
    getPastPressureFromSheet_,
    formatStatusTimeString_,
    formatStatusDiscomfortIndex_,
    formatStatusMeasurements_,
    buildStatusFlexMessage_,
    buildSkipFlexMessage_,
    buildAlertFlexMessage_,
    replyMessage_,
    replyMessageObjects_,
    pushMonitorNotification_,
    pushMessage_,
    pushMessageObjects_,
    sendLineApiRequest_,
    calculateNextMorning8Am_
  };
}
