/**
 * tests/helpers/testUtils.js
 *
 * テスト用共通ユーティリティ
 */

/**
 * 意図的な異常系テスト実行時に console.error の出力を一時的に抑制するヘルパー
 * 同期および非同期 (Promise) 関数に対応
 *
 * @param {Function} fn 実行するテスト関数
 * @returns {*} fn の戻り値
 */
function suppressConsoleError(fn) {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        spy.mockRestore();
      });
    }
    spy.mockRestore();
    return result;
  } catch (err) {
    spy.mockRestore();
    throw err;
  }
}

module.exports = {
  suppressConsoleError
};
