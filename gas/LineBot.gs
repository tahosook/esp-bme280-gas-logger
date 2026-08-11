const LINE_PROPERTIES = {
  channelSecret: 'LINE_CHANNEL_SECRET',
  skipUntil: 'MONITOR_SKIP_UNTIL'
};

const LINE_COMMANDS = {
  status: '状況',
  skip: 'スキップ',
  clear: 'クリア'
};

function handleLineWebhook_(e) {
  const signature = getHeader_(e, 'X-Line-Signature');
  if (!verifyLineSignature_(e, signature)) {
    console.error('linebot invalid_signature');
    return lineJsonResponse_({ ok: false, error: 'invalid_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    console.error('linebot invalid_json');
    return jsonResponse_({ ok: false, error: 'invalid_json' });
  }

  const events = payload.events || [];
  if (events.length === 0) {
    return jsonResponse_({ ok: true });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(2000);

  try {
    const replies = [];
    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') {
        continue;
      }
      const reply = processLineCommand_(event);
      if (reply) {
        replies.push(reply);
      }
    }
    return lineJsonResponse_({ ok: true, replies });
  } catch (error) {
    console.error('linebot internal_error');
    return lineJsonResponse_({ ok: false, error: 'internal_error' });
  } finally {
    lock.releaseLock();
  }
}

function processLineCommand_(event) {
  const text = String(event.message.text || '').trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  if (replyToken && text === LINE_COMMANDS.status) {
    const snapshot = buildMonitorSnapshot_();
    const lines = [
      `temp=${snapshot.temp.toFixed(2)}℃`,
      `hum=${snapshot.hum.toFixed(2)}%`,
      `DI=${snapshot.discomfortIndex.toFixed(2)}`,
      `skip=${snapshot.skipped ? 'ON' : 'OFF'}`
    ];
    sendLineReply_(replyToken, lines.join('\n'));
    return { status: 'ok', command: 'status' };
  }

  if (replyToken && text === LINE_COMMANDS.skip) {
    const until = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(LINE_PROPERTIES.skipUntil, until.toISOString());
    sendLineReply_(replyToken, '監視をスキップしました。');
    return { status: 'ok', command: 'skip', until: until.toISOString() };
  }

  if (replyToken && text === LINE_COMMANDS.clear) {
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(LINE_PROPERTIES.skipUntil);
    sendLineReply_(replyToken, '監視を再開しました。');
    return { status: 'ok', command: 'clear' };
  }

  if (replyToken) {
    sendLineReply_(replyToken, '対応コマンド: 状況 / スキップ / クリア');
    return { status: 'unknown_command', command: text };
  }

  return null;
}

function buildMonitorSnapshot_() {
  const properties = PropertiesService.getScriptProperties();
  const lastValidRaw = properties.getProperty('MONITOR_LAST_VALID_payload');
  let lastValid = { temp: null, hum: null, discomfortIndex: null };
  if (lastValidRaw) {
    try {
      lastValid = JSON.parse(lastValidRaw);
    } catch (error) {
      lastValid = { temp: null, hum: null, discomfortIndex: null };
    }
  }

  const skipUntilRaw = properties.getProperty(LINE_PROPERTIES.skipUntil);
  let skipped = false;
  if (skipUntilRaw) {
    const skipUntil = new Date(skipUntilRaw);
    skipped = new Date() < skipUntil;
  }

  return {
    temp: lastValid.temp != null ? lastValid.temp : 0,
    hum: lastValid.hum != null ? lastValid.hum : 0,
    discomfortIndex: lastValid.discomfortIndex != null ? lastValid.discomfortIndex : 0,
    skipped
  };
}

function sendLineReply_(replyToken, text) {
  if (!replyToken) {
    return;
  }

  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + getLineChannelAccessToken_()
      },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: [
          {
            type: 'text',
            text: text
          }
        ]
      }),
      muteHttpExceptions: true
    });
  } catch (error) {
    console.error('linebot send_reply_failed');
  }
}

function getLineChannelAccessToken_() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) {
    throw new Error('missing LINE channel access token');
  }
  return token;
}

function verifyLineSignature_(e, signature) {
  if (!signature || !e.postData || typeof e.postData.contents !== 'string') {
    return false;
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const channelSecret = properties.getProperty(LINE_PROPERTIES.channelSecret);
    if (!channelSecret) {
      return false;
    }

    const signatureBytes = Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA256,
      e.postData.contents,
      channelSecret
    );
    const computed = Utilities.base64Encode(signatureBytes);
    return signature === computed;
  } catch (error) {
    return false;
  }
}

function getHeader_(e, name) {
  if (!e || !e.headers || typeof e.headers[name] !== 'string') {
    return null;
  }
  return e.headers[name];
}

function isMonitorSkippedForTest_() {
  const properties = PropertiesService.getScriptProperties();
  const skipUntilRaw = properties.getProperty(LINE_PROPERTIES.skipUntil);
  if (!skipUntilRaw) {
    return false;
  }
  const skipUntil = new Date(skipUntilRaw);
  return new Date() < skipUntil;
}

function resetMonitorSkipForTest_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(LINE_PROPERTIES.skipUntil);
}

function lineJsonResponse_(body) {
  return ContentService
      .createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
}
