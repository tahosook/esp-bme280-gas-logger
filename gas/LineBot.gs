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
    const messages = buildStatusFlexMessage_();
    replyMessageObjects_(replyToken, messages);
  } else if (normalized === 'グラフ' || normalized === '24h') {
    const messages = buildGraphMessage_();
    replyMessageObjects_(replyToken, messages);
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
      const messages = buildSkipFlexMessage_();
      replyMessageObjects_(replyToken, messages);
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

function buildGraphMessage_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    return [{ type: 'text', text: 'スプレッドシートが設定されていません。' }];
  }

  const sheetName = properties.getProperty(sheetNameKey) || 'DATA';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return [{ type: 'text', text: 'データシートが見つかりません。' }];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [{ type: 'text', text: 'データがありません。' }];
  }

  // 24h * 12 (5m intervals) = 288
  const MAX_ROWS = 288;
  const startRow = Math.max(1, lastRow - MAX_ROWS + 1);
  const numRows = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, numRows, 4).getValues();

  // header might be included if startRow is 1, so filter out non-dates
  const records = values.filter(row => {
      const ts = row[0];
      return Object.prototype.toString.call(ts) === '[object Date]' || (typeof ts === 'string' && !isNaN(new Date(ts).getTime()));
  });

  if (records.length === 0) {
      return [{ type: 'text', text: 'グラフに描画できるデータがありません。' }];
  }

  let chartConfigObj = null;
  if (typeof buildQuickChartConfig_ === 'function') {
      chartConfigObj = buildQuickChartConfig_(records);
  }

  if (!chartConfigObj) {
       return [{ type: 'text', text: 'グラフ設定の生成に失敗しました。' }];
  }

  const chartUrl = fetchQuickChartShortUrl_(chartConfigObj);
  if (!chartUrl) {
       return [{ type: 'text', text: 'グラフ画像URLの取得に失敗しました。' }];
  }

  return [
    {
      type: 'image',
      originalContentUrl: chartUrl,
      previewImageUrl: chartUrl
    }
  ];
}

function fetchQuickChartShortUrl_(chartConfigObj) {
  const url = 'https://quickchart.io/chart/create';
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(chartConfigObj),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode ? response.getResponseCode() : 200;
    if (code === 200) {
      const responseText = response.getContentText ? response.getContentText() : '{}';
      const result = JSON.parse(responseText);
      if (result && result.success && result.url) {
        return result.url;
      }
    }
    return null;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('linebot', 'quickchart', 'fetch_failed', error);
    }
    return null;
  }
}

function buildStatusFlexMessage_() {
  const properties = PropertiesService.getScriptProperties();
  const states = typeof loadMonitorStates_ === 'function' ? loadMonitorStates_(properties) : {
    temp: { alert: false },
    hum: { alert: false },
    discomfortIndex: { alert: false }
  };
  const lastValid = typeof loadLastValidMeasurement_ === 'function' ? loadLastValidMeasurement_(properties) : null;

  let tempText = '-';
  let humText = '-';
  let diText = '-';
  let ahText = '-';
  let timeStr = 'データなし';
  let diColor = '#cccccc';
  let diLabel = '-';

  if (lastValid) {
    const tempVal = typeof lastValid.temp === 'number' ? lastValid.temp : null;
    const humVal = typeof lastValid.hum === 'number' ? lastValid.hum : null;
    let diVal = typeof lastValid.discomfortIndex === 'number' ? lastValid.discomfortIndex : null;

    if (tempVal !== null) tempText = `${tempVal.toFixed(2)}℃`;
    if (humVal !== null) humText = `${humVal.toFixed(2)}%`;

    if (tempVal !== null && humVal !== null) {
      if (typeof calculateDiscomfortIndex_ === 'function') {
         diVal = calculateDiscomfortIndex_(tempVal, humVal);
      }
      if (typeof calculateAbsoluteHumidity_ === 'function') {
         ahText = `${calculateAbsoluteHumidity_(tempVal, humVal).toFixed(2)} g/m³`;
      }
    }

    if (diVal !== null) {
        diText = diVal.toFixed(2);
        if (typeof classifyDiscomfortIndex_ === 'function') {
            const diInfo = classifyDiscomfortIndex_(diVal);
            diColor = diInfo.color;
            diLabel = diInfo.label;
        }
    }

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
  }

  const tempStatus = states.temp && states.temp.alert ? '🚨 超過' : '✅ 正常';
  const humStatus = states.hum && states.hum.alert ? '🚨 超過' : '✅ 正常';

  const flexJson = {
    type: "flex",
    altText: "現在の監視状態",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "現在の監視状況",
            weight: "bold",
            size: "lg",
            color: "#ffffff"
          }
        ],
        backgroundColor: "#2c3e50"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "気温", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: tempText, size: "sm", color: "#111111", align: "end", flex: 2 },
              { type: "text", text: tempStatus, size: "sm", align: "end", flex: 2, color: states.temp && states.temp.alert ? "#e74c3c" : "#27ae60" }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "湿度", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: humText, size: "sm", color: "#111111", align: "end", flex: 2 },
              { type: "text", text: humStatus, size: "sm", align: "end", flex: 2, color: states.hum && states.hum.alert ? "#e74c3c" : "#27ae60" }
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
              { type: "text", text: "不快指数", size: "sm", color: "#555555", flex: 2 },
              { type: "text", text: diText, size: "sm", color: "#111111", align: "end", flex: 2 },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  { type: "text", text: diLabel, size: "xs", color: "#ffffff", align: "center" }
                ],
                backgroundColor: diColor,
                cornerRadius: "20px",
                paddingAll: "2px",
                flex: 3,
                margin: "sm"
              }
            ],
            margin: "lg",
            alignItems: "center"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "容積絶対湿度", size: "sm", color: "#555555", flex: 2 },
              { type: "text", text: ahText, size: "sm", color: "#111111", align: "end", flex: 3 }
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
              { type: "text", text: "最終受信", size: "xs", color: "#aaaaaa" },
              { type: "text", text: timeStr, size: "xs", color: "#aaaaaa", align: "end" }
            ],
            margin: "lg"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#f39c12",
            action: {
              type: "message",
              label: "🔕 翌朝までスキップ",
              text: "スキップ"
            }
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "message",
              label: "🔔 クリア",
              text: "クリア"
            }
          }
        ]
      }
    }
  };
  return [flexJson];
}

function buildSkipFlexMessage_() {
  const flexJson = {
    type: "flex",
    altText: "スキップ設定完了",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "監視アラート通知を翌朝8:00までスキップに設定しました。",
            wrap: true,
            size: "md"
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
            color: "#3498db",
            action: {
              type: "message",
              label: "🔔 監視を再開（クリア）",
              text: "クリア"
            }
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
    altText: "監視アラート",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "⚠️ 監視アラート",
            weight: "bold",
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
            text: alertText,
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
              label: "🔕 翌朝8時までスキップ",
              text: "スキップ"
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
