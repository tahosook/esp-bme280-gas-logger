/**
 * tests/firmwareResponse.test.js
 *
 * ESP8266 ファームウェア（GAS.ino）における HTTP レスポンス処理ロジックの単体テスト
 *
 * 検証項目:
 * - Content-Length <= 1024 の正常 JSON -> GAS_SEND_OK
 * - Content-Length > 1024 -> GAS_SEND_FATAL (本文読み込み前に中断)
 * - Content-Length unknown (-1) で 1024 バイト以内 -> GAS_SEND_OK
 * - Content-Length unknown (-1) で 1024 バイト超過 -> GAS_SEND_FATAL (BoundedResponseStreamで上限打ち切り)
 * - 正常 JSON { ok: true } -> GAS_SEND_OK
 * - { ok: false } -> GAS_SEND_FATAL (即時打ち切り)
 * - invalid JSON -> GAS_SEND_FATAL
 * - HTTP 4xx (401, 403, 404等) -> GAS_SEND_FATAL
 * - HTTP 5xx (500, 503等) -> GAS_SEND_RETRYABLE
 * - 接続エラー (httpCode <= 0) -> GAS_SEND_RETRYABLE
 * - Content-Type が text/html -> GAS_SEND_FATAL
 * - Content-Type の大文字小文字許容 (Application/JSON 等) -> GAS_SEND_OK
 */

const GAS_SEND_OK = 0;
const GAS_SEND_FATAL = 1;
const GAS_SEND_RETRYABLE = 2;
const MAX_LIMIT = 1024;

/**
 * GAS.ino の BoundedResponseStream クラスをシミュレート
 */
class BoundedResponseStreamSimulator {
  constructor() {
    this.content = '';
    this.overflow = false;
  }

  write(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      if (this.content.length < MAX_LIMIT) {
        this.content += chunk[i];
      } else {
        this.overflow = true;
        return;
      }
    }
  }
}

/**
 * GAS.ino の sendToGAS レスポンス処理ロジックをシミュレート
 */
function simulateGasResponseHandler({
  httpCode,
  contentType = 'application/json',
  contentLength = -1,
  rawResponseBody = ''
}) {
  // 1. 接続エラー
  if (httpCode <= 0) {
    return { result: GAS_SEND_RETRYABLE, bytesRead: 0, reason: 'connection_error' };
  }

  // 2. HTTP ステータス確認
  if (httpCode !== 200) {
    if (httpCode >= 400 && httpCode < 500) {
      return { result: GAS_SEND_FATAL, bytesRead: 0, reason: 'client_error' };
    }
    return { result: GAS_SEND_RETRYABLE, bytesRead: 0, reason: 'server_error' };
  }

  // 3. Content-Type チェック (case-insensitive)
  if (contentType && contentType.length > 0) {
    if (!contentType.toLowerCase().includes('application/json')) {
      return { result: GAS_SEND_FATAL, bytesRead: 0, reason: 'unexpected_content_type' };
    }
  }

  // 4. Content-Length 事前チェック
  if (contentLength > MAX_LIMIT) {
    return { result: GAS_SEND_FATAL, bytesRead: 0, reason: 'content_length_too_large' };
  }

  // 5. BoundedResponseStream による安全な読み込み
  const stream = new BoundedResponseStreamSimulator();
  stream.write(rawResponseBody);

  if (stream.overflow) {
    return { result: GAS_SEND_FATAL, bytesRead: stream.content.length, reason: 'response_exceeded_limit' };
  }

  const response = stream.content;

  // 6. JSON パース & 成否判定
  let respDoc;
  try {
    respDoc = JSON.parse(response);
  } catch (err) {
    return { result: GAS_SEND_FATAL, bytesRead: response.length, reason: 'invalid_json' };
  }

  if (typeof respDoc === 'object' && respDoc !== null && typeof respDoc.ok === 'boolean') {
    if (respDoc.ok === true) {
      return { result: GAS_SEND_OK, bytesRead: response.length, reason: 'ok' };
    }
    return { result: GAS_SEND_FATAL, bytesRead: response.length, reason: 'rejected_ok_false' };
  }

  return { result: GAS_SEND_FATAL, bytesRead: response.length, reason: 'invalid_ok_field' };
}

describe('Firmware: HTTP Response Handling Logic (GAS.ino)', () => {
  describe('Content-Length & Stream Size Limits', () => {
    test('Content-Length <= 1024 の正常 JSON -> GAS_SEND_OK', () => {
      const body = JSON.stringify({ ok: true });
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentLength: body.length,
        rawResponseBody: body
      });
      expect(res.result).toBe(GAS_SEND_OK);
      expect(res.bytesRead).toBe(body.length);
    });

    test('Content-Length > 1024 -> 本文読み込み前に即座に GAS_SEND_FATAL', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentLength: 2048,
        rawResponseBody: 'x'.repeat(2048)
      });
      expect(res.result).toBe(GAS_SEND_FATAL);
      expect(res.bytesRead).toBe(0);
      expect(res.reason).toBe('content_length_too_large');
    });

    test('Content-Length unknown (-1) で 1024 バイト以内のレスポンス -> 正常に読み込み GAS_SEND_OK', () => {
      const body = JSON.stringify({ ok: true });
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentLength: -1,
        rawResponseBody: body
      });
      expect(res.result).toBe(GAS_SEND_OK);
      expect(res.bytesRead).toBe(body.length);
    });

    test('Content-Length unknown (-1) で 1024 バイトを超えるレスポンス -> 最大1024バイトで停止し GAS_SEND_FATAL', () => {
      const hugeBody = '<!DOCTYPE html><html><body>' + 'A'.repeat(5000) + '</body></html>';
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentType: 'application/json',
        contentLength: -1,
        rawResponseBody: hugeBody
      });
      expect(res.result).toBe(GAS_SEND_FATAL);
      expect(res.bytesRead).toBe(1024);
      expect(res.reason).toBe('response_exceeded_limit');
    });
  });

  describe('Response Payload Content Validation', () => {
    test('{ ok: true } -> GAS_SEND_OK', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        rawResponseBody: JSON.stringify({ ok: true })
      });
      expect(res.result).toBe(GAS_SEND_OK);
    });

    test('{ ok: false, error: "invalid_token" } -> 即時リトライ打ち切り GAS_SEND_FATAL', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        rawResponseBody: JSON.stringify({ ok: false, error: 'invalid_token' })
      });
      expect(res.result).toBe(GAS_SEND_FATAL);
      expect(res.reason).toBe('rejected_ok_false');
    });

    test('不正な JSON (HTML エラーなど) -> GAS_SEND_FATAL', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        rawResponseBody: '<html>Server Error</html>'
      });
      expect(res.result).toBe(GAS_SEND_FATAL);
      expect(res.reason).toBe('invalid_json');
    });

    test('ok フィールドが存在しない JSON -> GAS_SEND_FATAL', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        rawResponseBody: JSON.stringify({ status: 'done' })
      });
      expect(res.result).toBe(GAS_SEND_FATAL);
      expect(res.reason).toBe('invalid_ok_field');
    });
  });

  describe('HTTP Status Code & Connection Errors', () => {
    test('接続エラー (httpCode <= 0) -> GAS_SEND_RETRYABLE', () => {
      const res = simulateGasResponseHandler({ httpCode: -1 });
      expect(res.result).toBe(GAS_SEND_RETRYABLE);
      expect(res.bytesRead).toBe(0);
    });

    test('HTTP 4xx (401, 403, 404) -> リトライ不要 GAS_SEND_FATAL', () => {
      expect(simulateGasResponseHandler({ httpCode: 401 }).result).toBe(GAS_SEND_FATAL);
      expect(simulateGasResponseHandler({ httpCode: 403 }).result).toBe(GAS_SEND_FATAL);
      expect(simulateGasResponseHandler({ httpCode: 404 }).result).toBe(GAS_SEND_FATAL);
    });

    test('HTTP 5xx (500, 502, 503) -> リトライ可能 GAS_SEND_RETRYABLE', () => {
      expect(simulateGasResponseHandler({ httpCode: 500 }).result).toBe(GAS_SEND_RETRYABLE);
      expect(simulateGasResponseHandler({ httpCode: 502 }).result).toBe(GAS_SEND_RETRYABLE);
      expect(simulateGasResponseHandler({ httpCode: 503 }).result).toBe(GAS_SEND_RETRYABLE);
    });
  });

  describe('Content-Type Header Handling', () => {
    test('Content-Type が text/html -> 本文読み込み前に即座に GAS_SEND_FATAL', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentType: 'text/html; charset=utf-8',
        rawResponseBody: '<html>Login</html>'
      });
      expect(res.result).toBe(GAS_SEND_FATAL);
      expect(res.bytesRead).toBe(0);
      expect(res.reason).toBe('unexpected_content_type');
    });

    test('Content-Type の大文字小文字 (Application/JSON; charset=UTF-8) -> 正常に受理', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentType: 'Application/JSON; charset=UTF-8',
        rawResponseBody: JSON.stringify({ ok: true })
      });
      expect(res.result).toBe(GAS_SEND_OK);
    });

    test('Content-Type が空の場合 (ヘッダー欠落) -> 本文パースで判定して正常 JSON なら GAS_SEND_OK', () => {
      const res = simulateGasResponseHandler({
        httpCode: 200,
        contentType: '',
        rawResponseBody: JSON.stringify({ ok: true })
      });
      expect(res.result).toBe(GAS_SEND_OK);
    });
  });
});
