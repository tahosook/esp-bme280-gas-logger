/**
 * DebugTest.gs
 *
 * GAS エディタの「実行」ボタンからワンクリックで手動動作検証を行えるデバッグ用テスト関数群。
 * Webhook 実行時のエラー原因特定や QuickChart URL の文字長（LINE 2,000文字制限）検証に使用します。
 */

/**
 * QuickChart グラフ URL 生成ロジック（buildQuickChartUrl）の単体手動検証関数。
 * GAS エディタで本関数を選択して「実行」をクリックしてください。
 */
function debugTest_buildQuickChartUrl() {
  Logger.log('=== [DEBUG TEST] buildQuickChartUrl 開始 ===');
  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
    const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';

    const spreadsheetId = properties.getProperty(spreadsheetIdKey);
    if (!spreadsheetId) {
      Logger.log('❌ スクリプトプロパティ SPREADSHEET_ID が設定されていません。');
      return;
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheetName = properties.getProperty(sheetNameKey) || 'DATA';
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('⚠️ 設定シート「' + sheetName + '」が見つからないため、「2026」またはアクティブシートを探索します。');
      sheet = spreadsheet.getSheetByName('2026') || spreadsheet.getActiveSheet();
    }

    if (!sheet) {
      Logger.log('❌ 探索可能なデータシートが見つかりません。');
      return;
    }

    const lastRow = sheet.getLastRow();
    Logger.log('対象シート名: ' + sheet.getName());
    Logger.log('シート最終行番号: ' + lastRow);

    if (lastRow < 2) {
      Logger.log('⚠️ データ行が存在しません（ヘッダーのみまたは空）。');
    }

    const startTime = Date.now();
    const chartUrl = buildQuickChartUrl(sheet);
    const elapsedMs = Date.now() - startTime;

    if (!chartUrl) {
      Logger.log('⚠️ buildQuickChartUrl の結果: null (描画可能なデータが不足しています)');
      return;
    }

    const urlLength = chartUrl.length;
    Logger.log('✅ QuickChart URL 生成成功 (所要時間: ' + elapsedMs + ' ms)');
    Logger.log('生成 URL: ' + chartUrl);
    Logger.log('URL 文字数: ' + urlLength + ' 文字 / 2,000文字制限');

    if (urlLength <= 2000) {
      Logger.log('🎉 判定: LINE Messaging API の 2,000 文字制限をクリアしています (残り許容: ' + (2000 - urlLength) + ' 文字)');
    } else {
      Logger.log('❌ 警告: LINE Messaging API の 2,000 文字制限を超過しています！ (+ ' + (urlLength - 2000) + ' 文字)');
    }
  } catch (err) {
    Logger.log('❌ エラー発生: ' + (err && err.message ? err.message : String(err)));
    Logger.log('エラー詳細: ' + (err && err.stack ? err.stack : 'スタック情報なし'));
    console.error('debugTest_buildQuickChartUrl failed:', err);
  }
}

/**
 * LINE Webhook「TRENDS / グラフ」受信時の擬似シミュレーションテスト関数。
 * 実際の LINE 送信を行わずに応答メッセージオブジェクトの構造を検証します。
 */
function debugTest_handleLineWebhook_Trends() {
  Logger.log('=== [DEBUG TEST] LINE Webhook TRENDS 応答テスト開始 ===');
  try {
    const messages = buildGraphMessage_();
    Logger.log('生成されたメッセージ数: ' + messages.length);
    Logger.log('メッセージ内容:\n' + JSON.stringify(messages, null, 2));

    if (messages.length > 0 && messages[0].type === 'image') {
      const imgMsg = messages[0];
      Logger.log('✅ 正常な image メッセージが生成されました。');
      Logger.log('originalContentUrl 長: ' + (imgMsg.originalContentUrl ? imgMsg.originalContentUrl.length : 0));
      Logger.log('previewImageUrl 長: ' + (imgMsg.previewImageUrl ? imgMsg.previewImageUrl.length : 0));
    } else if (messages.length > 0 && messages[0].type === 'text') {
      Logger.log('ℹ️ フォールバックテキストメッセージが返却されました: ' + messages[0].text);
    } else {
      Logger.log('⚠️ 予期しないメッセージ形式です。');
    }
  } catch (err) {
    Logger.log('❌ エラー発生: ' + (err && err.message ? err.message : String(err)));
    Logger.log('エラー詳細: ' + (err && err.stack ? err.stack : 'スタック情報なし'));
    console.error('debugTest_handleLineWebhook_Trends failed:', err);
  }
}
