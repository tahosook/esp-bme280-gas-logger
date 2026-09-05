/**
 * DebugTest.gs
 *
 * GAS エディタの「実行」ボタンからワンクリックで手動動作検証を行えるデバッグ用テスト関数群。
 * Webhook 実行時のエラー原因特定や QuickChart URL の文字長（LINE 2,000文字制限）検証に使用します。
 */

/**
 * アラート通知制御ロジック（evaluateAlertDecision_）の単体手動検証関数。
 * GAS エディタで本関数を選択して「実行」をクリックしてください。
 * スヌーズ中、クールダウン中、正常値、閾値超過時、異常値ガード、1日上限到達の各ケースをシミュレート検証します。
 */
function debugTest_checkAlertLogic() {
  Logger.log('=== [DEBUG TEST] checkAlertLogic 開始 ===');
  try {
    const now = Date.now();
    const todayJst = typeof getJstDateString_ === 'function' ? getJstDateString_(now) : new Date().toISOString().slice(0, 10);

    const testCases = [
      {
        name: 'ケース1: 正常域 (25.0℃ / 50%)',
        params: {
          temp: 25.0,
          hum: 50.0,
          press: 1013.2,
          isOverThreshold: false,
          nowMs: now,
          snoozeUntil: null,
          lastSentTime: null,
          dailyAlertInfo: null
        },
        expectedShouldAlert: false,
        expectedReason: 'normal'
      },
      {
        name: 'ケース2: センサー異常値ガード (60.0℃ / 50%)',
        params: {
          temp: 60.0,
          hum: 50.0,
          press: 1013.2,
          isOverThreshold: true,
          nowMs: now,
          snoozeUntil: null,
          lastSentTime: null,
          dailyAlertInfo: null
        },
        expectedShouldAlert: false,
        expectedReason: 'sensor_anomaly'
      },
      {
        name: 'ケース3: 警戒閾値超過・初回 (31.0℃ / 75%)',
        params: {
          temp: 31.0,
          hum: 75.0,
          press: 1013.2,
          isOverThreshold: true,
          nowMs: now,
          snoozeUntil: null,
          lastSentTime: null,
          dailyAlertInfo: null
        },
        expectedShouldAlert: true,
        expectedReason: 'alert_triggered'
      },
      {
        name: 'ケース4: SNOOZE有効期間中 (31.0℃ / 75%)',
        params: {
          temp: 31.0,
          hum: 75.0,
          press: 1013.2,
          isOverThreshold: true,
          nowMs: now,
          snoozeUntil: now + 3600000,
          lastSentTime: null,
          dailyAlertInfo: null
        },
        expectedShouldAlert: false,
        expectedReason: 'snooze_active'
      },
      {
        name: 'ケース5: 1hクールダウン中 (前回送信から30分後)',
        params: {
          temp: 31.0,
          hum: 75.0,
          press: 1013.2,
          isOverThreshold: true,
          nowMs: now,
          snoozeUntil: null,
          lastSentTime: now - 30 * 60 * 1000,
          dailyAlertInfo: { date: todayJst, count: 1 }
        },
        expectedShouldAlert: false,
        expectedReason: 'cooldown_active'
      },
      {
        name: 'ケース6: 1日上限到達 (当日送信回数5回)',
        params: {
          temp: 31.0,
          hum: 75.0,
          press: 1013.2,
          isOverThreshold: true,
          nowMs: now,
          snoozeUntil: null,
          lastSentTime: now - 70 * 60 * 1000,
          dailyAlertInfo: { date: todayJst, count: 5 }
        },
        expectedShouldAlert: false,
        expectedReason: 'daily_limit_reached'
      }
    ];

    let passedCount = 0;
    for (let i = 0; i < testCases.length; i += 1) {
      const tc = testCases[i];
      const result = evaluateAlertDecision_(tc.params);
      const isPassed = (result.shouldAlert === tc.expectedShouldAlert) && (result.reason === tc.expectedReason);
      if (isPassed) {
        passedCount += 1;
        Logger.log(`✅ [PASS] ${tc.name} => shouldAlert: ${result.shouldAlert}, reason: '${result.reason}'`);
      } else {
        Logger.log(`❌ [FAIL] ${tc.name} => 期待値: { shouldAlert: ${tc.expectedShouldAlert}, reason: '${tc.expectedReason}' }, 実際: { shouldAlert: ${result.shouldAlert}, reason: '${result.reason}' }`);
      }
    }

    Logger.log(`=== checkAlertLogic 完了: ${passedCount}/${testCases.length} ケース合格 ===`);
  } catch (err) {
    Logger.log('❌ checkAlertLogic 実行時エラー: ' + (err && err.message ? err.message : String(err)));
    console.error('debugTest_checkAlertLogic failed:', err);
  }
}

function getTestTargetSheet_(spreadsheet, properties, sheetNameKey) {
  if (typeof getRawDataSheet_ === 'function') {
    return getRawDataSheet_(spreadsheet, properties) || spreadsheet.getActiveSheet();
  }
  const sheetName = properties.getProperty(sheetNameKey) || 'RawData';
  return spreadsheet.getSheetByName(sheetName) ||
    spreadsheet.getSheetByName('2026') ||
    spreadsheet.getSheetByName('DATA') ||
    spreadsheet.getActiveSheet();
}

function logDebugTestError_(funcName, err) {
  const message = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : 'スタック情報なし';
  Logger.log('❌ エラー発生: ' + message);
  Logger.log('エラー詳細: ' + stack);
  console.error(funcName + ' failed:', err);
}

function getDebugChartTargetSheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';

  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    Logger.log('❌ スクリプトプロパティ SPREADSHEET_ID が設定されていません。');
    return null;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getTestTargetSheet_(spreadsheet, properties, sheetNameKey);
  if (!sheet) {
    Logger.log('❌ 探索可能なデータシートが見つかりません。');
    return null;
  }
  return sheet;
}

/**
 * QuickChart グラフ URL 生成ロジック（buildQuickChartUrl）の単体手動検証関数。
 * GAS エディタで本関数を選択して「実行」をクリックしてください。
 */
function debugTest_buildQuickChartUrl() {
  Logger.log('=== [DEBUG TEST] buildQuickChartUrl 開始 ===');
  try {
    const properties = PropertiesService.getScriptProperties();
    const sheet = getDebugChartTargetSheet_(properties);
    if (!sheet) {
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
    logDebugTestError_('debugTest_buildQuickChartUrl', err);
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
    logDebugTestError_('debugTest_handleLineWebhook_Trends', err);
  }
}

function getDebugArchiveSourceSheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);

  if (!spreadsheetId) {
    Logger.log('❌ スクリプトプロパティ SPREADSHEET_ID が設定されていません。');
    return null;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = getRawDataSheet_(spreadsheet, properties);

  if (!sourceSheet) {
    Logger.log('❌ 探索可能な生データシートが見つかりません。');
    return null;
  }
  return sourceSheet;
}

/**
 * DataArchive（生データアーカイブ）の月次バッチ処理をシミュレートするドライラン関数。
 * 実際の行削除や新規シートへの書き込みは行わず、対象件数と処理内容をログに出力します。
 */
function debugTest_runDataArchiveDryRun() {
  Logger.log('=== [DEBUG TEST] DataArchive Dry-Run 開始 ===');
  try {
    const properties = PropertiesService.getScriptProperties();
    const sourceSheet = getDebugArchiveSourceSheet_(properties);
    if (!sourceSheet) {
      return;
    }

    const lastRow = sourceSheet.getLastRow();
    Logger.log('対象シート名: ' + sourceSheet.getName());
    Logger.log('シート最終行番号: ' + lastRow);

    if (lastRow < 2) {
      Logger.log('⚠️ データ行が存在しません。');
      return;
    }

    const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : { ARCHIVE_RETENTION_MONTHS: 2 };
    const retentionMonths = config.ARCHIVE_RETENTION_MONTHS || 2;
    const now = new Date();

    const thresholdDate = getArchiveThresholdDate_(now, retentionMonths);

    Logger.log(`基準日 (現在): ${now.toISOString()} / 退避基準閾値: ${thresholdDate.toISOString()} (左記より前のデータをアーカイブ)`);

    const values = sourceSheet.getRange(2, 1, lastRow - 1, sourceSheet.getLastColumn()).getValues();
    const groupedData = groupDataForArchive_(values, thresholdDate);

    if (groupedData.size === 0) {
      Logger.log('ℹ️ アーカイブ対象となるデータはありませんでした。');
      return;
    }

    let totalArchived = 0;
    const sortedYearMonths = Array.from(groupedData.keys()).sort();
    Logger.log(`\nアーカイブ対象年月: ${sortedYearMonths.join(', ')}`);

    for (let i = 0; i < sortedYearMonths.length; i++) {
      const ym = sortedYearMonths[i];
      const rows = groupedData.get(ym);
      totalArchived += rows.length;
      Logger.log(` - 年月 [${ym}]: ${rows.length} 行をシート [Raw_${ym.replace('-', '')}] に退避予定`);
    }

    Logger.log(`\n✅ ドライラン完了: 合計 ${totalArchived} 行のデータがアーカイブ・削除対象です。 (実際の変更は行っていません)`);
  } catch (err) {
    logDebugTestError_('debugTest_runDataArchiveDryRun', err);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    getTestTargetSheet_,
    logDebugTestError_,
    getDebugChartTargetSheet_,
    getDebugArchiveSourceSheet_,
    debugTest_checkAlertLogic,
    debugTest_buildQuickChartUrl,
    debugTest_handleLineWebhook_Trends,
    debugTest_runDataArchiveDryRun
  };
}
