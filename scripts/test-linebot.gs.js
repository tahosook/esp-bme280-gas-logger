#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = [
  fs.readFileSync(`${__dirname}/../gas/LineBot.gs`, 'utf8')
].join('\n');

const propertiesStore = new Map();

const context = {
  console,
  isFinite,
  JSON,
  Date,
  Utilities: {
    MacAlgorithm: { HMAC_SHA256: 'HmacSHA256' },
    computeHmacSignature(algorithm, value, secret) {
      return value + ':' + secret;
    },
    base64Encode(value) {
      return value;
    }
  },
  UrlFetchApp: {
    fetch(url, options) {
      return {
        getContentText() {
          return '{"ok":true}';
        }
      };
    }
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        store: propertiesStore,
        getProperty(key) {
          return this.store.get(key) || null;
        },
        setProperty(key, value) {
          this.store.set(key, value);
        },
        deleteProperty(key) {
          this.store.delete(key);
        }
      };
    }
  },
  LockService: {
    getScriptLock() {
      return {
        waitLock(ms) {},
        releaseLock() {}
      };
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(value) {
      return {
        getContent() {
          return value;
        },
        setMimeType() {
          return this;
        }
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'gas/LineBot.gs' });

function responseBody(response) {
  return JSON.parse(response.getContent());
}

function lineEvent(text) {
  return {
    type: 'message',
    replyToken: 'reply-token',
    source: { userId: 'user-id' },
    message: { type: 'text', text }
  };
}

const channelSecret = 'secret';
propertiesStore.set('LINE_CHANNEL_SECRET', channelSecret);
propertiesStore.set('MONITOR_LAST_VALID_payload', JSON.stringify({ temp: 31.0, hum: 72.0, discomfortIndex: 83.0 }));
propertiesStore.set('LINE_CHANNEL_ACCESS_TOKEN', 'access-token');

function buildSignedWebhook(text) {
  const contents = JSON.stringify({ events: [lineEvent(text)] });
  const signature = contents + ':' + channelSecret;
  return {
    postData: { contents },
    headers: { 'X-Line-Signature': signature }
  };
}

function buildSignedWebhookFromEvents(events) {
  const contents = JSON.stringify({ events });
  const signature = contents + ':' + channelSecret;
  return {
    postData: { contents },
    headers: { 'X-Line-Signature': signature }
  };
}


const validWebhook = buildSignedWebhook('状況');
assert.deepStrictEqual(responseBody(context.handleLineWebhook_(validWebhook)),
  { ok: true, replies: [{ status: 'ok', command: 'status' }] }, 'status response');

const skipWebhook = buildSignedWebhook('スキップ');
const skipResponse = responseBody(context.handleLineWebhook_(skipWebhook));
assert.deepStrictEqual(skipResponse.ok, true, 'skip ok');
assert.deepStrictEqual(skipResponse.replies.length, 1, 'skip replies length');
assert.deepStrictEqual(skipResponse.replies[0].status, 'ok', 'skip status');
assert.deepStrictEqual(skipResponse.replies[0].command, 'skip', 'skip command');
assert.ok(skipResponse.replies[0].until, 'skip until exists');

const clearWebhook = buildSignedWebhook('クリア');
propertiesStore.set('MONITOR_SKIP_UNTIL', new Date(Date.now() + 1000).toISOString());
assert.deepStrictEqual(responseBody(context.handleLineWebhook_(clearWebhook)),
  { ok: true, replies: [{ status: 'ok', command: 'clear' }] }, 'clear response');
assert.strictEqual(propertiesStore.has('MONITOR_SKIP_UNTIL'), false, 'skip cleared');

assert.deepStrictEqual(responseBody(context.handleLineWebhook_(validWebhook)),
  { ok: true, replies: [{ status: 'ok', command: 'status' }] }, 'status after clear');

const invalidSignatureWebhook = {
  postData: {
    contents: JSON.stringify({
      events: [lineEvent('状況')]
    })
  },
  headers: {
    'X-Line-Signature': 'bad-signature'
  }
};
assert.deepStrictEqual(responseBody(context.handleLineWebhook_(invalidSignatureWebhook)),
  { ok: false, error: 'invalid_signature' }, 'invalid signature');

const noReplyTokenWebhook = buildSignedWebhookFromEvents([
  { type: 'follow', replyToken: null, source: { userId: 'user-id' }, message: { type: 'text', text: '状況' } }
]);
assert.deepStrictEqual(responseBody(context.handleLineWebhook_(noReplyTokenWebhook)),
  { ok: true, replies: [] }, 'no reply token skipped');

const nonTextEvent = { type: 'message', replyToken: 'reply-token', source: { userId: 'user-id' }, message: { type: 'image', text: '画像' } };
const nonTextWebhook = buildSignedWebhookFromEvents([nonTextEvent]);
assert.deepStrictEqual(responseBody(context.handleLineWebhook_(nonTextWebhook)),
  { ok: true, replies: [] }, 'non-text event skipped');


console.log('LineBot tests passed');
