# PR #36 Review Material

> 本資料は、**Gemini 3.1 Pro** が PR #36 のコード品質および `main` へのマージ可否（Approve / Request Changes）を厳正にレビュー・判断するために作成された詳細な Before / After 資料です。

---

## 1. PR Overview

- **Repository**: `https://github.com/tahosook/esp-bme280-gas-logger`
- **PR**: [PR #36 「Refactor codebase to resolve ESLint complexity warnings」](https://github.com/tahosook/esp-bme280-gas-logger/pull/36)
- **Base SHA**: `3369ba9fd01559ae53126ebe6d57b1ebc79eafab` (コミット: Merge pull request #34 from tahosook/task/data-archive-and-purge-13334255883338264188)
- **Head SHA**: `5f479d2a43aa5b0f2d788a9470e25780cf70fb3b` (コミット: refactor(gas): eliminate eslint-disable complexity comments and decompose complex functions)
- **Commits (3 commits)**:
  1. `a042d28` *Refactor: resolve ESLint complexity warnings across codebase* (Jules: ESLint Flat Config導入、Config.gs 分割)
  2. `9a6e598` *refactor: apply ESLint complexity rule with minimal pragmatic helper extraction* (Jules: Metrics/Monitor/Router分割、他ファイルに eslint-disable 追加)
  3. `5f479d2` *refactor(gas): eliminate eslint-disable complexity comments and decompose complex functions* (tahosook: 全ファイルの eslint-disable を撤廃し、関数を徹底的に helper 分割して全関数 complexity <= 10 を達成)
- **Changed Files**: 13 files (+1,876 lines, -904 lines)
- **Automated Test Results**: Jest 5 suites / 115 tests passed (100% pass)
- **Linter Status**: ESLint 0 errors, 0 warnings (threshold: `complexity: ["warn", 10]`)

---

## 2. Review Objective

本PRの目的は、ESLintの循環的複雑度（Cyclomatic Complexity）ルール（上限: 10）を導入し、既存のコードベースに存在した complexity 警告を解消することです。

レビューの核心となる論点は以下の通りです：

1. **「Complexity 数値を下げるためだけの機械的分割」になっていないか？**
   - 単に関数を細かく刻んだ結果、コードの文脈が分散し、元の大きな関数よりも全体の処理フローを追う認知的負荷が増大していないか。
2. **追加された Helper の粒度と抽象化は適切か？**
   - わずか 3〜6 行で 1 回しか呼ばれない自明なヘルパー（例: `buildWatchdogResult_`, `getArchiveRetentionMonths_`, `isTemperatureAnomaly_` など）が、独立した関数として存在する意味を持っているか。
3. **Call Tree（呼び出し階層）が深くなりすぎていないか？**
   - `A() -> B() -> C() -> D()` のように呼び出しが階層化し、スタックトレースやデバッグの難易度が上がっていないか。
4. **ビジネスロジック・JST日付処理・GAS/Jest互換性に意図せぬ変更や潜在的バグが生じていないか？**

---

## 3. Change Summary

| File | Status | Additions | Deletions | Description |
| :--- | :--- | :--- | :--- | :--- |
| `eslint.config.js` | Added | +1 | 0 | Flat Config形式で `{ rules: { complexity: ["warn", 10] } }` を設定 |
| `package.json` | Modified | +2 | -1 | devDependencies に `eslint: ^10.9.1` 追加、`lint` スクリプト追加 |
| `package-lock.json` | Modified | +646 | 0 | npm lockfile 更新 |
| `gas/Config.gs` | Modified | +42 | -20 | `getSheetConfig_` を Vertical/Horizontal 形式パーサーに分離 (+2 helpers) |
| `gas/DailyAggregation.gs` | Modified | +119 | -90 | 日次集計・日付パース・行累積処理を分割 (+7 helpers) |
| `gas/DataArchive.gs` | Modified | +58 | -35 | アーカイブ書き込み・保持月数取得を分割 (+3 helpers) |
| `gas/DebugTest.gs` | Modified | +117 | -76 | デバッグテスト内のログ出力・シート取得を共通化 (+7 helpers) |
| `gas/Ingest.gs` | Modified | +117 | -64 | センサ検証・重複測定判定・Watchdogリセット等の副作用を分離 (+7 helpers) |
| `gas/LineBot.gs` | Modified | +380 | -245 | Flex Message生成・コマンド振り分け・署名抽出等を分離 (+20 helpers) |
| `gas/Metrics.gs` | Modified | +189 | -145 | アラート判定・QuickChart生成・サンプリング等を分離 (+12 helpers) |
| `gas/Monitor.gs` | Modified | +136 | -93 | Watchdog判定・アラート副作用記録を分離 (+7 helpers) |
| `gas/MonthlyAggregation.gs` | Modified | +105 | -75 | 月次集計・行累積・アーカイブ呼び出しを分離 (+7 helpers) |
| `gas/Router.gs` | Modified | +16 | -7 | LINE Webhook 判定を分離 (+2 helpers) |
| **合計** | 13 files | **+1,876** | **-904** | **純増 +972 行 / 新規ヘルパー 74 個** |

---

## 4. Complexity Before / After

ESLint `complexity` ルールに基づき、PR 前後における各主要関数の Cyclomatic Complexity を測定した結果です。

| File | Function | Before Complexity | After Complexity | Delta | 変化の概要 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `gas/LineBot.gs` | `buildStatusFlexMessage_` | 50 | 5 | -45 | 状態取得、センサ値テキスト成形、Header/Footer生成を7個のヘルパーへ分離 |
| `gas/LineBot.gs` | `handleLineWebhook_` | 24 | 10 | -14 | 署名ヘッダー抽出とイベントディスパッチをヘルパーへ分離 |
| `gas/LineBot.gs` | `handleTextMessageEvent_` | 23 | 6 | -17 | コマンド振り分け、Snooze/Clear個別処理、エラーハンドラへ分離 |
| `gas/LineBot.gs` | `buildGraphMessage_` | 14 | 2 | -12 | シート探索とQuickChart URL取得処理へ分離 |
| `gas/LineBot.gs` | `pushMonitorNotification_` | 13 | 9 | -4 | SNOOZE判定の共通ヘルパー化 |
| `gas/LineBot.gs` | `handlePostbackEvent_` | 11 | 5 | -6 | 日時指定スヌーズ (action=snooze_custom) の処理を独立ヘルパーへ |
| `gas/Metrics.gs` | `evaluateAlertDecision_` | 28 | 9 | -19 | センサ異常値、クールダウン、日次上限判定を5個の述語関数へ分離 |
| `gas/Metrics.gs` | `buildQuickChartUrl` | 20 | 5 | -15 | 生データ抽出、レコード検証、日付判定の3ヘルパーへ分離 |
| `gas/Metrics.gs` | `buildQuickChartUrlFromRecords_` | 13 | 8 | -5 | オプション補完、URL文字列生成、サンプリング、Chart.js設定構築へ分離 |
| `gas/Ingest.gs` | `checkAndAppendMeasurement_` | 28 | 2 | -26 | 重複判定、シート/設定取得、Watchdogリセット、Monitor状態更新を6ヘルパーへ分離 |
| `gas/Ingest.gs` | `validateSensorPayload_` | 14 | 10 | -4 | 測定値の LIMITS 範囲チェックループを validateMeasurementLimits_ へ分離 |
| `gas/DailyAggregation.gs` | `runDailyAggregation_` | 23 | 7 | -16 | シート取得、行追記ループ、スプレッドシートオープンをヘルパーへ分離 |
| `gas/DailyAggregation.gs` | `formatDateTokyo_` | 16 | 6 | -10 | 日付入力パースとUTC+9フォールバックフォーマッタへ分離 |
| `gas/DailyAggregation.gs` | `processDailyDataRows_` | 16 | 7 | -9 | 1行ごとの測定値累積処理を accumulateDailyRow_ へ分離 |
| `gas/MonthlyAggregation.gs` | `processMonthlyDataRows_` | 25 | 8 | -17 | 行検証 isValidMonthlyRow_ と値累積 accumulateMonthlyRow_ へ分離 |
| `gas/MonthlyAggregation.gs` | `runMonthlyAggregation_` | 24 | 7 | -17 | シート取得、行追記ループ、アーカイブ呼び出しへ分離 |
| `gas/Monitor.gs` | `runWatchdogCheck_` | 19 | 4 | -15 | シート取得、最終日時取得、タイムアウト評価、結果ビルダーへ分離 |
| `gas/Monitor.gs` | `updateMonitorState_` | 14 | 5 | -9 | アラート判定の解決、通知オブジェクト記録をヘルパーへ分離 |
| `gas/DataArchive.gs` | `runDataArchive_` | 18 | 4 | -14 | シート書き込みと検証、スプレッドシート取得、保持月数取得へ分離 |
| `gas/Config.gs` | `getSheetConfig_` | 19 | 8 | -11 | Vertical (key|value) と Horizontal (1行目キー) のパースを2関数へ分離 |
| `gas/Router.gs` | `doPost` | 16 | 6 | -10 | LINE Webhook 判定 (isLineWebhookRequest_, hasLineSignatureHeader_) へ分離 |
| `gas/DebugTest.gs` | `debugTest_buildQuickChartUrl` | 21 | 4 | -17 | シート取得とログ出力へ分離 |
| `gas/DebugTest.gs` | `debugTest_runDataArchiveDryRun` | 15 | 7 | -8 | 生データシート取得と詳細ログ出力へ分離 |
| `gas/DebugTest.gs` | `debugTest_handleLineWebhook_Trends` | 12 | 2 | -10 | 返却メッセージ検証ログ出力へ分離 |

> [!NOTE]
> **結果として、コードベース内の全関数（テストファイル含む）が Cyclomatic Complexity <= 10 を達成しています。**

---

## 5. Helper Inventory

PR #36 で新しく追加された **全 74 個のヘルパー関数** の完全な台帳です。

| File | Helper Function | Caller(s) | Before存在 | 行数 | Complexity | 主な責務 | レビュー評価ポイント |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `gas/Config.gs` | `parseVerticalSheetConfig_` | `getSheetConfig_` | No | 12 | 6 | Vertical形式 (key | value) の設定シートパース | 形式ごとの責務分離として自然。可読性良好。 |
| `gas/Config.gs` | `parseHorizontalSheetConfig_` | `getSheetConfig_` | No | 17 | 7 | Horizontal形式 (1行目キー、2行目以降値) の設定シートパース | 形式ごとの責務分離として自然。可読性良好。 |
| `gas/DailyAggregation.gs` | `getDailyAggregationSheets_` | `runDailyAggregation_` | No | 21 | 5 | Daily集計用シート (Data/Daily) の取得と存在検証 | シート取得とエラーハンドリングの集約。適切。 |
| `gas/DailyAggregation.gs` | `appendDailyDataRows_` | `runDailyAggregation_` | No | 25 | 4 | 日次集計バケットからDailyシートへの行追記ループ処理 | 書き込みループの抽出。runDailyAggregation_ の行数削減に寄与。 |
| `gas/DailyAggregation.gs` | `openDailyAggregationSpreadsheet_` | `runDailyAggregation_` | No | 12 | 5 | SpreadsheetApp.openById によるスプレッドシート取得 | ID取得とオープン処理の定型ラッパー。他ファイルと統一パターン。 |
| `gas/DailyAggregation.gs` | `getLastProcessedDailyRow_` | `runDailyAggregation_` | No | 8 | 4 | プロパティから前回処理済み最終行を取得・正規化 | 8行。parseInt と NaN/1未満フォールバック処理。独立概念として妥当。 |
| `gas/DailyAggregation.gs` | `parseDateInput_` | `formatDateTokyo_` | No | 18 | 9 | Dateインスタンス/文字列日付の検証とDate変換 | yyyy-MM-dd文字列の短絡処理を含む。formatDateTokyo_ の前提パース処理。 |
| `gas/DailyAggregation.gs` | `formatTokyoFallback_` | `formatDateTokyo_` | No | 23 | 4 | Utilities不在時のUTC+9hオフセットによるTokyo時刻フォーマット | テスト環境/GAS環境のフォールバック責務の分離。妥当。 |
| `gas/DailyAggregation.gs` | `accumulateDailyRow_` | `processDailyDataRows_` | No | 24 | 10 | 単一行の測定値をdailyBucketへ累積 (anomaly除外、alert加算) | ループ内部の1行集計ロジック。processDailyDataRows_ のネスト緩和に寄与。 |
| `gas/DataArchive.gs` | `writeToArchiveSheets_` | `runDataArchive_` | No | 33 | 5 | アーカイブ先シート (Raw_YYYYMM) への行書き込みと検証 | シート作成・書き込み・行数検証を一括担当。まとまった責務。 |
| `gas/DataArchive.gs` | `getArchiveSpreadsheets_` | `runDataArchive_` | No | 29 | 10 | 元スプレッドシートと退避先アーカイブスプレッドシートの取得 | スプレッドシートオープンの集約。エラー処理含む。 |
| `gas/DataArchive.gs` | `getArchiveRetentionMonths_` | `runDataArchive_` | No | 3 | 2 | 保持月数設定の取得 (typeof number チェックとデフォルト2) | わずか3行。config.ARCHIVE_RETENTION_MONTHS の安全取得。過剰抽象化の疑いあり。 |
| `gas/DebugTest.gs` | `getTestTargetSheet_` | `getDebugChartTargetSheet_` | No | 10 | 7 | テスト用シートの取得共通処理 | テストコード内のシート探索共通化。 |
| `gas/DebugTest.gs` | `logQuickChartResult_` | `debugTest_buildQuickChartUrl` | No | 17 | 3 | QuickChart URL生成結果のLogger/URL長ログ出力 | ログ出力処理の分離。テスト本体の簡素化。 |
| `gas/DebugTest.gs` | `logDebugTestError_` | `debugTest_buildQuickChartUrl`, `debugTest_handleLineWebhook_Trends`, `debugTest_runDataArchiveDryRun` | No | 7 | 5 | デバッグテスト内のtry-catchエラーログ出力共通化 | 7行。共通エラーハンドラとして再利用されている（3箇所から呼び出し）。 |
| `gas/DebugTest.gs` | `getDebugChartTargetSheet_` | `debugTest_buildQuickChartUrl` | No | 18 | 7 | チャートテスト用のターゲットデータシート取得 | テストシート取得ロジック。 |
| `gas/DebugTest.gs` | `logTrendsTestMessage_` | `debugTest_handleLineWebhook_Trends` | No | 12 | 7 | Trendsテストの返却メッセージ検証とログ出力 | 画像/テキスト/予期しないメッセージの分岐ログ。 |
| `gas/DebugTest.gs` | `logArchiveDryRunDetails_` | `debugTest_runDataArchiveDryRun` | No | 13 | 2 | アーカイブドライランの年月別退避予定行数ログ出力 | ドライラン結果のコンソール表示責務。 |
| `gas/DebugTest.gs` | `getDebugArchiveSourceSheet_` | `debugTest_runDataArchiveDryRun` | No | 18 | 5 | アーカイブテスト用の生データシート取得 | テストシート取得ロジック。 |
| `gas/Ingest.gs` | `validateMeasurementLimits_` | `validateSensorPayload_` | No | 13 | 6 | temp, press, hum の LIMITS 範囲・有限数値チェック | 13行。ループによる範囲チェック。validateSensorPayload_ からの切り出しとして自然。 |
| `gas/Ingest.gs` | `isDuplicateMeasurement_` | `checkAndAppendMeasurement_` | No | 26 | 8 | 直前レコードとのタイムスタンプ差・全センサ値一致による二重送信判定 | 26行。二重測定判定という重要な独立概念。凝集度が高い。 |
| `gas/Ingest.gs` | `getIngestSheet_` | `checkAndAppendMeasurement_` | No | 13 | 3 | センサ受信用スプレッドシート・シートの取得と存在検証 | 13行。定型シート取得とエラー送出の分離。 |
| `gas/Ingest.gs` | `getIngestConfig_` | `checkAndAppendMeasurement_` | No | 6 | 5 | INGEST_LOCK_TIMEOUT_MS と SENSOR_DUPLICATION_WINDOW_SECONDS の取得 | 6行。設定2値のオブジェクト化。checkAndAppendMeasurement_ の前処理短縮。 |
| `gas/Ingest.gs` | `resetWatchdogSafely_` | `checkAndAppendMeasurement_` | No | 12 | 4 | watchdog状態リセットの try-catch 保護呼び出し | 12行。副作用を持つ外部関数呼び出しの安全保護。 |
| `gas/Ingest.gs` | `pushMonitorNotificationSafely_` | `applyMonitorStateSafely_` | No | 12 | 4 | Line通知送信の try-catch 保護呼び出し | 12行。副作用を持つ外部関数呼び出しの安全保護。 |
| `gas/Ingest.gs` | `applyMonitorStateSafely_` | `checkAndAppendMeasurement_` | No | 20 | 8 | updateMonitorState_ 呼び出しとシートへの anomaly マーク・通知トリガー | 20行。モニタリング連携ロジックの集約。 |
| `gas/LineBot.gs` | `extractLineSignature_` | `handleLineWebhook_` | No | 10 | 8 | リクエストヘッダーまたはパラメータからの X-Line-Signature 抽出 | 10行。大文字小文字/パラメータ両対応の抽出ロジック。独立性あり。 |
| `gas/LineBot.gs` | `dispatchLineEvents_` | `handleLineWebhook_` | No | 10 | 8 | Webhookイベント配列をループし text / postback をディスパッチ | 10行。イベント振り分けループの分離。 |
| `gas/LineBot.gs` | `handleSnoozeCustomPostback_` | `handlePostbackEvent_` | No | 26 | 7 | 日時指定スヌーズ (action=snooze_custom) の postback イベント処理 | 26行。カスタムスヌーズ固有のパース・ロック・プロパティ保存・返信。 |
| `gas/LineBot.gs` | `handleSnoozeCommand_` | `dispatchTextMessageCommand_` | No | 19 | 5 | SNOOZE テキストコマンド処理 (翌朝8時までのスヌーズ設定) | 19行。ロック取得・プロパティ保存・メッセージ返信。 |
| `gas/LineBot.gs` | `handleClearCommand_` | `dispatchTextMessageCommand_` | No | 17 | 4 | CLEAR テキストコマンド処理 (スヌーズ解除・モニタ状態リセット) | 17行。ロック取得・プロパティ削除・状態リセット・メッセージ返信。 |
| `gas/LineBot.gs` | `dispatchTextMessageCommand_` | `handleTextMessageEvent_` | No | 27 | 5 | 正規化テキストに応じた各コマンド処理の振り分け (now/trends/snooze/clear/help) | 27行。コマンドルーターとしての責務が明確。 |
| `gas/LineBot.gs` | `handleTextMessageError_` | `handleTextMessageEvent_` | No | 16 | 10 | テキストメッセージ処理例外のエラーログ記録とLINEエラー返信 | 16行。例外発生時のログとユーザー返信の責務。 |
| `gas/LineBot.gs` | `getGraphTargetSheet_` | `fetchGraphChartUrl_` | No | 18 | 7 | グラフ描画対象となる生データシートの探索・取得 | 18行。RawData/2026/DATA 等のフォールバック探索。 |
| `gas/LineBot.gs` | `fetchGraphChartUrl_` | `buildGraphMessage_` | No | 18 | 5 | シートから QuickChart 画像 URL を生成しバリデーション | 18行。buildQuickChartUrl 呼び出しと 2000文字制限チェック。 |
| `gas/LineBot.gs` | `getPastPressureFromSheet_` | `loadStatusFlexState_` | No | 20 | 10 | 直近3時間前（約36行前）の気圧値を取得し気圧傾向算出の準備 | 20行。シートの過去行参照ロジックの完全分離。 |
| `gas/LineBot.gs` | `formatStatusTimeString_` | `formatStatusMeasurements_` | No | 17 | 5 | ステータスメッセージ用の測定時刻フォーマット文字列作成 | 17行。Utilities.formatDate または UTC+9 手動計算。 |
| `gas/LineBot.gs` | `formatStatusTemperature_` | `formatStatusMeasurements_` | No | 4 | 3 | 室温の表示文字列成形 (例: '24.5 ℃ (正常)' / '⚠️ 超過') | 4行。単純な三項演算子フォーマット。単独関数としての必要性に議論の余地あり。 |
| `gas/LineBot.gs` | `formatStatusHumidity_` | `formatStatusMeasurements_` | No | 4 | 3 | 湿度の表示文字列成形 (例: '55 % (正常)' / '⚠️ 多湿') | 4行。単純な三項演算子フォーマット。単独関数としての必要性に議論の余地あり。 |
| `gas/LineBot.gs` | `formatStatusPressure_` | `formatStatusMeasurements_` | No | 7 | 4 | 気圧の表示文字列成形 (例: '1013.2 hPa (急降下)') | 7行。気圧傾向関数呼び出しと成形。 |
| `gas/LineBot.gs` | `formatStatusDiscomfortIndex_` | `formatStatusMeasurements_` | No | 18 | 7 | 不快指数の算出・分類ラベル・文字色の成形 | 18行。不快指数計算・色判定の集約。 |
| `gas/LineBot.gs` | `formatStatusMeasurements_` | `buildStatusFlexMessage_` | No | 37 | 9 | 全測定値 (室温/湿度/気圧/不快指数/測定時刻) のフォーマット統合 | 37行。各フォーマッタを呼び出してオブジェクトにまとめる中間レイヤ。 |
| `gas/LineBot.gs` | `buildStatusFlexHeader_` | `buildStatusFlexMessage_` | No | 30 | 3 | 監視中/SNOOZE中に応じた Flex Header コンポーネント生成 | 30行。Flex JSON のヘッダー部生成。 |
| `gas/LineBot.gs` | `buildStatusFlexFooter_` | `buildStatusFlexMessage_` | No | 38 | 2 | 監視中/SNOOZE中に応じた Flex Footer (ボタン群) コンポーネント生成 | 38行。Flex JSON のフッター部生成。 |
| `gas/LineBot.gs` | `loadStatusFlexState_` | `buildStatusFlexMessage_` | No | 17 | 7 | ステータス表示に必要な全状態 (スヌーズ/センサ値/過去気圧) のロード | 17行。プロパティおよびシートからの状態読み出しを集約。 |
| `gas/LineBot.gs` | `isSnoozeActiveForPush_` | `pushMonitorNotification_` | No | 10 | 5 | Push通知送信時にスヌーズ期限内であるかの判定 | 10行。MONITOR_SKIP_UNTIL と SKIP_UNTIL の両プロパティチェック。 |
| `gas/Metrics.gs` | `sampleRecordsForChart_` | `generateQuickChartUrlString_` | No | 35 | 9 | チャート用に指定件数 (targetCount) にレコードを間引きサンプリング | 35行。サンプリング間引きアルゴリズム。凝集度が高い。 |
| `gas/Metrics.gs` | `buildLineChartConfig_` | `generateQuickChartUrlString_` | No | 57 | 1 | QuickChart 用の Chart.js 設定オブジェクト (2軸折れ線グラフ) の構築 | 57行。Chart.js の巨大なオプション構造定義を完全分離。可読性に大きく貢献。 |
| `gas/Metrics.gs` | `normalizeQuickChartOptions_` | `buildQuickChartUrlFromRecords_` | No | 9 | 6 | QuickChart オプション (width, height, dpr, targetCount) のデフォルト補完 | 9行。引数のデフォルト値正規化。 |
| `gas/Metrics.gs` | `generateQuickChartUrlString_` | `buildQuickChartUrlFromRecords_` | No | 6 | 1 | サンプリング・設定構築・JSON化を経て QuickChart URL 文字列を生成 | 6行。中間組み立て関数。 |
| `gas/Metrics.gs` | `extractRawValues_` | `buildQuickChartUrl` | No | 14 | 5 | Sheetオブジェクトまたは配列から直近最大288行の生データを抽出 | 14行。ダックタイピングによる入力正規化。 |
| `gas/Metrics.gs` | `filterValidChartRecords_` | `buildQuickChartUrl` | No | 17 | 8 | 生データ配列から有効な日時・温度・湿度を持つレコードを抽出 | 17行。ループによるレコードフィルタリング。 |
| `gas/Metrics.gs` | `isValidChartDate_` | `filterValidChartRecords_` | No | 6 | 5 | タイムスタンプが有効な Date/文字列/数値であるかの判定 | 6行。Date妥当性判定。filterValidChartRecords_ からのみ呼び出し。 |
| `gas/Metrics.gs` | `isSensorAnomaly_` | `evaluateAlertDecision_` | No | 7 | 6 | 温度・湿度の NaN チェックおよび異常値範囲チェックの集約判定 | 7行。温度異常または湿度異常の統合。 |
| `gas/Metrics.gs` | `isTemperatureAnomaly_` | `isSensorAnomaly_` | No | 5 | 4 | 温度が minTemp〜maxTemp の許容範囲外であるかの判定 | 5行。単一比較式。isSensorAnomaly_ の下請け。 |
| `gas/Metrics.gs` | `isHumidityAnomaly_` | `isSensorAnomaly_` | No | 5 | 4 | 湿度が minHum〜maxHum の許容範囲外であるかの判定 | 5行。単一比較式。isSensorAnomaly_ の下請け。 |
| `gas/Metrics.gs` | `isCooldownActive_` | `evaluateAlertDecision_` | No | 6 | 5 | 前回通知時刻からの経過時間がクールダウン時間未満であるかの判定 | 6行。時間差計算とクールダウン判定。 |
| `gas/Metrics.gs` | `isDailyLimitReached_` | `evaluateAlertDecision_` | No | 6 | 5 | 本日の通知回数が最大日次通知数以上であるかの判定 | 6行。日次上限判定。 |
| `gas/Monitor.gs` | `buildAlertDecisionOptions_` | `resolveAlertDecision_` | No | 10 | 1 | mergedConfig からアラート判定用オプションオブジェクトを構築 | 10行。設定値の数値変換とオブジェクトまとめ。 |
| `gas/Monitor.gs` | `resolveAlertDecision_` | `updateMonitorState_` | No | 21 | 5 | evaluateAlertDecision_ またはフォールバックによるアラート判定の実行 | 21行。設定ロード・オプション構築・判定呼び出しの仲介。 |
| `gas/Monitor.gs` | `recordAlertNotification_` | `updateMonitorState_` | No | 15 | 7 | アラート発報時の通知オブジェクト生成・最終通知時刻保存・日次カウント加算 | 15行。アラート発報時の副作用（記録）処理の分離。 |
| `gas/Monitor.gs` | `getWatchdogDataSheet_` | `runWatchdogCheck_` | No | 18 | 7 | Watchdogチェック対象の生データシート取得とエラーハンドリング | 18行。シート取得とログ出力。 |
| `gas/Monitor.gs` | `getLastTimestampFromSheet_` | `runWatchdogCheck_` | No | 16 | 6 | データシート最終行からタイムスタンプを取得・Date変換 | 16行。最終行の存在確認とDate変換。 |
| `gas/Monitor.gs` | `evaluateWatchdogTimeout_` | `runWatchdogCheck_` | No | 24 | 4 | 経過時間と WATCHDOG_TIMEOUT_MIN の比較・通知作成・フラグ管理 | 24行。Watchdogのコアタイムアウト判定。 |
| `gas/Monitor.gs` | `buildWatchdogResult_` | `runWatchdogCheck_`, `evaluateWatchdogTimeout_` | No | 3 | 1 | Watchdogチェック結果オブジェクト { timeout, notified, notification, elapsedMinutes } を生成 | 3行。単なるオブジェクトリテラル生成関数。過剰抽象化の代表例。 |
| `gas/MonthlyAggregation.gs` | `getMonthlyAggregationSheets_` | `runMonthlyAggregation_` | No | 21 | 5 | 月次集計用シート (Daily/Monthly) の取得と存在検証 | 21行。シート取得とエラーハンドリングの集約。 |
| `gas/MonthlyAggregation.gs` | `appendMonthlyDataRows_` | `runMonthlyAggregation_` | No | 24 | 4 | 月次集計バケットからMonthlyシートへの行追記ループ処理 | 24行。書き込みループの抽出。 |
| `gas/MonthlyAggregation.gs` | `openMonthlyAggregationSpreadsheet_` | `runMonthlyAggregation_` | No | 12 | 5 | SpreadsheetApp.openById によるスプレッドシート取得 | 12行。オープン処理の定型ラッパー。 |
| `gas/MonthlyAggregation.gs` | `getLastProcessedMonthlyRow_` | `runMonthlyAggregation_` | No | 8 | 4 | プロパティから前回処理済み最終行を取得・正規化 | 8行。parseInt とフォールバック処理。 |
| `gas/MonthlyAggregation.gs` | `triggerMonthlyDataArchive_` | `runMonthlyAggregation_` | No | 11 | 4 | 月次集計成功後の runDataArchive_ の try-catch 保護呼び出し | 11行。アーカイブ実行とエラーハンドリング。 |
| `gas/MonthlyAggregation.gs` | `isValidMonthlyRow_` | `processMonthlyDataRows_` | No | 9 | 4 | Dailyシートの1〜9列目が全て有限数値であるかの判定 | 9行。数値バリデーションループ。 |
| `gas/MonthlyAggregation.gs` | `accumulateMonthlyRow_` | `processMonthlyDataRows_` | No | 11 | 1 | 単一行の各測定値 (temp/hum/press の avg/min/max) をbucket配列へpush | 11行。9個の配列へのpush処理。 |
| `gas/Router.gs` | `isLineWebhookRequest_` | `doPost` | No | 5 | 4 | リクエストが LINE Webhook (署名ヘッダーまたはイベント配列) かの判定 | 5行。署名またはペイロードによるLINE判定。 |
| `gas/Router.gs` | `hasLineSignatureHeader_` | `isLineWebhookRequest_` | No | 6 | 8 | X-Line-Signature ヘッダーまたはパラメータの存在確認 | 6行。大文字小文字・パラメータの存在確認。 |

---

## 6. Helper Call Graph

各主要ファイルにおけるヘルパー関数の呼び出し関係（Call Tree）です。深いネストやコールチェーンの構造を確認してください。

```text
================ 1. gas/LineBot.gs ================
handleLineWebhook_
├─ extractLineSignature_
├─ verifyLineSignature_
└─ dispatchLineEvents_
   ├─ handleTextMessageEvent_
   │  ├─ normalizeText_
   │  ├─ dispatchTextMessageCommand_
   │  │  ├─ buildStatusFlexMessage_
   │  │  │  ├─ loadStatusFlexState_
   │  │  │  │  ├─ getSnoozeUntilProperty_
   │  │  │  │  └─ getPastPressureFromSheet_
   │  │  │  ├─ formatStatusMeasurements_
   │  │  │  │  ├─ formatStatusTimeString_
   │  │  │  │  ├─ formatStatusTemperature_
   │  │  │  │  ├─ formatStatusHumidity_
   │  │  │  │  ├─ formatStatusPressure_
   │  │  │  │  └─ formatStatusDiscomfortIndex_
   │  │  │  ├─ buildStatusFlexHeader_
   │  │  │  └─ buildStatusFlexFooter_
   │  │  ├─ buildGraphMessage_
   │  │  │  └─ fetchGraphChartUrl_
   │  │  │     └─ getGraphTargetSheet_
   │  │  ├─ handleSnoozeCommand_
   │  │  │  ├─ calculateNextMorning8Am_
   │  │  │  ├─ buildSkipFlexMessage_
   │  │  │  │  └─ getSnoozeUntilProperty_
   │  │  │  └─ replyMessageObjects_ -> sendLineApiRequest_
   │  │  ├─ handleClearCommand_
   │  │  │  └─ replyMessage_ -> replyMessageObjects_ -> sendLineApiRequest_
   │  │  └─ replyMessage_ -> replyMessageObjects_ -> sendLineApiRequest_
   │  └─ handleTextMessageError_
   │     └─ replyMessage_ -> replyMessageObjects_ -> sendLineApiRequest_
   └─ handlePostbackEvent_
      └─ handleSnoozeCustomPostback_
         ├─ parseJstDatetimepicker_
         ├─ buildSkipFlexMessage_ -> getSnoozeUntilProperty_
         └─ replyMessageObjects_ -> sendLineApiRequest_

pushMonitorNotification_
├─ isSnoozeActiveForPush_
│  └─ getSnoozeUntilProperty_
├─ buildAlertFlexMessage_
└─ pushMessageObjects_ -> sendLineApiRequest_

================ 2. gas/Metrics.gs ================
evaluateAlertDecision_
├─ isSensorAnomaly_
│  ├─ isTemperatureAnomaly_
│  └─ isHumidityAnomaly_
├─ isSnoozeActive_
├─ isCooldownActive_
├─ isDailyLimitReached_
└─ getJstDateString_

buildQuickChartUrl
├─ extractRawValues_
├─ filterValidChartRecords_
│  └─ isValidChartDate_
└─ buildQuickChartUrlFromRecords_
   ├─ normalizeQuickChartOptions_
   └─ generateQuickChartUrlString_
      ├─ sampleRecordsForChart_
      └─ buildLineChartConfig_

================ 3. gas/Ingest.gs ================
validateSensorPayload_
└─ validateMeasurementLimits_

checkAndAppendMeasurement_
├─ getIngestSheet_
├─ getIngestConfig_
├─ isDuplicateMeasurement_
├─ resetWatchdogSafely_
└─ applyMonitorStateSafely_
   └─ pushMonitorNotificationSafely_

================ 4. gas/Monitor.gs ================
updateMonitorState_
├─ evaluateMonitorConditions_
├─ evaluateConditionState_
├─ detectAnomaly_
├─ resolveAlertDecision_
│  ├─ buildAlertDecisionOptions_
│  │  └─ getConfigNumber_
│  ├─ loadDailyAlertInfo_
│  ├─ loadAlertLastSentTime_
│  └─ loadAlertSnoozeUntil_
├─ recordAlertNotification_
│  ├─ buildMonitorNotification_
│  ├─ saveDailyAlertInfo_
│  └─ saveAlertLastSentTime_
├─ loadMonitorStates_ / saveMonitorStates_
└─ loadLastValidMeasurement_ / saveLastValidMeasurement_

runWatchdogCheck_
├─ getWatchdogDataSheet_
├─ getLastTimestampFromSheet_
├─ evaluateWatchdogTimeout_
│  ├─ getConfigNumber_
│  └─ buildWatchdogResult_
└─ buildWatchdogResult_

================ 5. gas/Router.gs ================
doPost
├─ isLineWebhookRequest_
│  └─ hasLineSignatureHeader_
├─ handleLineWebhook_
└─ handleSensorPost_

================ 6. gas/DailyAggregation.gs ================
runDailyAggregation_
├─ openDailyAggregationSpreadsheet_
├─ getDailyAggregationSheets_
├─ getLastProcessedDailyRow_
├─ processDailyDataRows_
│  ├─ formatDateTokyo_
│  │  ├─ parseDateInput_
│  │  └─ formatTokyoFallback_
│  └─ accumulateDailyRow_
├─ getExistingDailyDates_
│  └─ formatDateTokyo_ (同上)
└─ appendDailyDataRows_
   └─ buildDailyRowData_ -> calcAvg_, roundTwoDecimals_

================ 7. gas/MonthlyAggregation.gs ================
runMonthlyAggregation_
├─ openMonthlyAggregationSpreadsheet_
├─ getMonthlyAggregationSheets_
├─ getLastProcessedMonthlyRow_
├─ processMonthlyDataRows_
│  ├─ formatYearMonthTokyo_
│  ├─ isValidMonthlyRow_
│  └─ accumulateMonthlyRow_
├─ getExistingMonthlyDates_
│  └─ formatYearMonthTokyo_
├─ appendMonthlyDataRows_ -> buildMonthlyRowData_
└─ triggerMonthlyDataArchive_ -> runDataArchive_

================ 8. gas/DataArchive.gs ================
runDataArchive_
├─ getArchiveSpreadsheets_
├─ getArchiveRetentionMonths_
├─ getArchiveThresholdDate_
├─ groupDataForArchive_
└─ writeToArchiveSheets_
```

---

## 7. LineBot.gs Before / After

`LineBot.gs` は本リファクタリングで最も多くの変更（+380 / -245行、新規ヘルパー20個）が集中したファイルです。
特に `buildStatusFlexMessage_` は complexity が 50 から 5 へ、`handleTextMessageEvent_` は 23 から 6 へ低減されました。

### 7.1 `buildStatusFlexMessage_` (Complexity: 50 -> 5)

#### 【構造変化の解説】
- **Before**: 単一の関数内で「SNOOZE状態の判定」「モニタ状態の読み出し」「直近3時間の気圧データ取得（スプレッドシート検索）」「測定値（室温・湿度・気圧・不快指数）のテキスト成形」「Flex Message の Header / Body / Footer JSON の組み立て」をすべて直線的に実行していました（約170行、complexity 50）。
- **After**: 以下の 8 つのヘルパーに責務が分離されました：
  - `loadStatusFlexState_` (状態の読み出し)
  - `getPastPressureFromSheet_` (スプレッドシートからの過去気圧検索)
  - `formatStatusMeasurements_` (測定値フォーマットの統合)
    - `formatStatusTemperature_` (室温)
    - `formatStatusHumidity_` (湿度)
    - `formatStatusPressure_` (気圧・傾向)
    - `formatStatusDiscomfortIndex_` (不快指数)
    - `formatStatusTimeString_` (測定時刻)
  - `buildStatusFlexHeader_` (Flexヘッダー生成)
  - `buildStatusFlexFooter_` (Flexフッター生成)
  - `buildStatusFlexMessage_` 本体は各パーツを呼び出して JSON を組み合わせるだけ（complexity 5）。

#### Before (Base: 3369ba9)
```javascript
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

  let tempText = '-';
  let humText = '-';
  let pressText = '-';
  let diText = '-';
  let timeStr = 'データなし';
  let diColor = '#27ae60';
  let diLabel = '快適';

  let currentPress = null;
  let pastPress = null;

  if (lastValid) {
    const tempVal = typeof lastValid.temp === 'number' ? lastValid.temp : null;
    const humVal = typeof lastValid.hum === 'number' ? lastValid.hum : null;
    const pressVal = typeof lastValid.press === 'number' ? lastValid.press : null;
    currentPress = pressVal;
    let diVal = typeof lastValid.discomfortIndex === 'number' ? lastValid.discomfortIndex : null;

    if (tempVal !== null) {
      const isTempAlert = states.temp && states.temp.alert;
      tempText = isTempAlert ? `${tempVal.toFixed(1)} ℃ (⚠️ 超過)` : `${tempVal.toFixed(1)} ℃ (正常)`;
    }

    if (humVal !== null) {
      const isHumAlert = states.hum && states.hum.alert;
      humText = isHumAlert ? `${Math.round(humVal)} % (⚠️ 多湿)` : `${Math.round(humVal)} % (正常)`;
    }

    if (tempVal !== null && humVal !== null) {
      if (typeof calculateDiscomfortIndex_ === 'function') {
        diVal = calculateDiscomfortIndex_(tempVal, humVal);
      }
    }

    if (diVal !== null) {
      if (typeof classifyDiscomfortIndex_ === 'function') {
        const diInfo = classifyDiscomfortIndex_(diVal);
        diColor = diInfo.color;
        diLabel = diInfo.label;
      }
      diText = `${diVal.toFixed(1)}（${diLabel}）`;
    }

    if (lastValid.timestamp) {
      let formattedDate = '';
      if (typeof formatDateTokyo_ === 'function') {
        formattedDate = formatDateTokyo_(lastValid.timestamp, 'MM/dd HH:mm');
      } else if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
        const d = new Date(lastValid.timestamp);
        formattedDate = Utilities.formatDate(d, 'Asia/Tokyo', 'MM/dd HH:mm');
      } else {
        const d = new Date(lastValid.timestamp);
        const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(jst.getUTCDate()).padStart(2, '0');
        const hh = String(jst.getUTCHours()).padStart(2, '0');
        const min = String(jst.getUTCMinutes()).padStart(2, '0');
        formattedDate = `${mm}/${dd} ${hh}:${min}`;
      }
      timeStr = `${formattedDate} 測定`;
    }
  }

  // 直近3時間の気圧データ取得
  try {
    const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
    const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
    const spreadsheetId = properties.getProperty(spreadsheetIdKey);
    if (spreadsheetId) {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = getRawDataSheet_(spreadsheet, properties) || spreadsheet.getActiveSheet();
      if (sheet && sheet.getLastRow() >= 2) {
        const lastRow = sheet.getLastRow();
        const targetRow = Math.max(2, lastRow - 36);
        const rowValues = sheet.getRange(targetRow, 1, 1, 4).getValues()[0];
        const p = Number(rowValues[2]);
        if (!isNaN(p) && isFinite(p)) {
          pastPress = p;
        }
      }
    }
  } catch (e) {
    // ignore sheet lookup error
  }

  if (currentPress !== null) {
    const trendStr = (typeof calculatePressureTrend_ === 'function' && pastPress !== null)
      ? calculatePressureTrend_(currentPress, pastPress)
      : '安定';
    pressText = `${currentPress.toFixed(1)} hPa (${trendStr})`;
  }

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

  const isTempAlert = states.temp && states.temp.alert;
  const isHumAlert = states.hum && states.hum.alert;

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
              { type: "text", text: tempText, size: "sm", color: isTempAlert ? "#e74c3c" : "#111111", align: "end", flex: 3 }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "湿度", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: humText, size: "sm", color: isHumAlert ? "#e74c3c" : "#111111", align: "end", flex: 3 }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "気圧", size: "sm", color: "#555555", flex: 1 },
              { type: "text", text: pressText, size: "sm", color: "#111111", align: "end", flex: 3 }
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
              { type: "text", text: diText, size: "sm", color: diColor, align: "end", flex: 3 }
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
              { type: "text", text: timeStr, size: "xs", color: "#aaaaaa", align: "end" }
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
```

#### After (Head: 5f479d2)
```javascript
// --- 追加された関連ヘルパー群 ---

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

function formatStatusTemperature_(tempVal, isTempAlert) {
  if (tempVal === null) return '-';
  return isTempAlert ? `${tempVal.toFixed(1)} ℃ (⚠️ 超過)` : `${tempVal.toFixed(1)} ℃ (正常)`;
}

function formatStatusHumidity_(humVal, isHumAlert) {
  if (humVal === null) return '-';
  return isHumAlert ? `${Math.round(humVal)} % (⚠️ 多湿)` : `${Math.round(humVal)} % (正常)`;
}

function formatStatusPressure_(pressVal, pastPress) {
  if (pressVal === null) return '-';
  const trendStr = (typeof calculatePressureTrend_ === 'function' && pastPress !== null)
    ? calculatePressureTrend_(pressVal, pastPress)
    : '安定';
  return `${pressVal.toFixed(1)} hPa (${trendStr})`;
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

  const tempText = formatStatusTemperature_(tempVal, isTempAlert);
  const humText = formatStatusHumidity_(humVal, isHumAlert);
  const pressText = formatStatusPressure_(pressVal, pastPress);
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

function buildStatusFlexHeader_(isSnooze, snoozeTimeStr) {
  if (isSnooze) {
    return [
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
    ];
  }

  return [
    {
      type: "text",
      text: "🔔 監視中（Active）",
      weight: "bold",
      size: "lg",
      color: "#ffffff"
    }
  ];
}

function buildStatusFlexFooter_(isSnooze) {
  if (isSnooze) {
    return [
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
    ];
  }

  return [
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
}

function loadStatusFlexState_(properties) {
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

  return { isSnooze, snoozeTimeStr, states, lastValid, pastPress };
}

// --- buildStatusFlexMessage_ 本体 ---
function buildStatusFlexMessage_() {
  const properties = PropertiesService.getScriptProperties();
  const { isSnooze, snoozeTimeStr, states, lastValid, pastPress } = loadStatusFlexState_(properties);
  const m = formatStatusMeasurements_(lastValid, states, pastPress);

  const headerContents = buildStatusFlexHeader_(isSnooze, snoozeTimeStr);
  const footerContents = buildStatusFlexFooter_(isSnooze);

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
```

### 7.2 `handleTextMessageEvent_` (Complexity: 23 -> 6)

#### 【構造変化の解説】
- **Before**: テキストメッセージの正規化、コマンド振り分け（now, snooze, trends, clear, help）、Snooze/Clear時の排他ロック取得とプロパティ操作、例外発生時のLINEエラー返信処理が1つの try-catch 内に同居していました（約75行、complexity 23）。
- **After**:
  - `dispatchTextMessageCommand_` (コマンドルーティング)
  - `handleSnoozeCommand_` (SNOOZE実行処理)
  - `handleClearCommand_` (CLEAR実行処理)
  - `handleTextMessageError_` (エラーハンドリング)
  に分離され、本体はイベント入力検証とルーティング呼び出しのみになりました。

#### Before (Base: 3369ba9)
```javascript
function handleTextMessageEvent_(event) {
  const text = event.message.text || '';
  const replyToken = event.replyToken;
  const normalized = normalizeText_(text);

  try {
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
    } else if (clearCommands.indexOf(normalized) !== -1) {
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
  } catch (err) {
    console.error('LINE Webhook Error:', err && err.toString ? err.toString() : String(err), err && err.stack ? err.stack : '');
    if (typeof logError_ === 'function') {
      logError_('linebot', 'webhook', 'unhandled_error', err);
    }
    if (replyToken) {
      try {
        replyMessage_(replyToken, '⚠️ GAS処理エラー: ' + (err && err.message ? err.message : String(err)));
      } catch (replyErr) {
        console.error('Failed to reply error message to LINE:', replyErr);
      }
    }
  }
}
```

#### After (Head: 5f479d2)
```javascript
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
```

### 7.3 `handleLineWebhook_` (Complexity: 24 -> 10)

#### 【構造変化の解説】
- **Before**: 署名ヘッダー抽出（複数ケース対応）、署名検証、JSONパース、イベントループ処理（message / postback のディスパッチ）を一括実行（complexity 24）。
- **After**: 署名抽出を `extractLineSignature_` に、イベントループ処理を `dispatchLineEvents_` に分離（complexity 10）。

#### Before (Base: 3369ba9)
```javascript
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
    } else if (event && event.type === 'postback') {
      handlePostbackEvent_(event);
    }
  }

  return successResponse_();
}
```

#### After (Head: 5f479d2)
```javascript
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
```

### 7.4 `handlePostbackEvent_` (Complexity: 11 -> 5)

#### Before (Base: 3369ba9)
```javascript
function handlePostbackEvent_(event) {
  if (!event || !event.postback || !event.postback.data) {
    return;
  }
  const replyToken = event.replyToken;
  if (event.postback.data === 'action=snooze_custom') {
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
}
```

#### After (Head: 5f479d2)
```javascript
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
```

### 7.5 `buildGraphMessage_` (Complexity: 14 -> 2) & `pushMonitorNotification_` (Complexity: 13 -> 9)

#### `buildGraphMessage_` Before / After
```javascript
// === Before (Base: 3369ba9) ===
function buildGraphMessage_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    return [{ type: 'text', text: 'グラフを生成するためのデータが不足しています。' }];
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    console.error('Failed to open spreadsheet:', err);
    if (typeof logError_ === 'function') {
      logError_('linebot', 'graph', 'spreadsheet_open_failed', err);
    }
    return [{ type: 'text', text: 'グラフを生成するためのデータが不足しています。' }];
  }

  const sheet = getRawDataSheet_(spreadsheet, properties) || spreadsheet.getActiveSheet();
  if (!sheet) {
    return [{ type: 'text', text: 'グラフを生成するためのデータが不足しています。' }];
  }

  let chartUrl = null;
  if (typeof buildQuickChartUrl === 'function') {
    try {
      chartUrl = buildQuickChartUrl(sheet);
    } catch (err) {
      console.error('buildQuickChartUrl error:', err);
      if (typeof logError_ === 'function') {
        logError_('linebot', 'quickchart', 'build_url_failed', err);
      }
    }
  }

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

// === After (Head: 5f479d2) ===
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
```

#### `pushMonitorNotification_` Before / After
```javascript
// === Before (Base: 3369ba9) ===
function pushMonitorNotification_(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const properties = PropertiesService.getScriptProperties();
  const skipUntilStr = typeof getSnoozeUntilProperty_ === 'function'
    ? getSnoozeUntilProperty_(properties)
    : (properties.getProperty(LINE_BOT_PROPERTIES.skipUntil) || properties.getProperty('MONITOR_SKIP_UNTIL'));
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

// === After (Head: 5f479d2) ===
function isSnoozeActiveForPush_(properties) {
  const skipUntilStr = typeof getSnoozeUntilProperty_ === 'function'
    ? getSnoozeUntilProperty_(properties)
    : (properties.getProperty(LINE_BOT_PROPERTIES.skipUntil) || properties.getProperty('MONITOR_SKIP_UNTIL'));
  if (!skipUntilStr) {
    return false;
  }
  const skipUntil = parseInt(skipUntilStr, 10);
  return !isNaN(skipUntil) && Date.now() < skipUntil;
}

function pushMonitorNotification_(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const properties = PropertiesService.getScriptProperties();
  if (isSnoozeActiveForPush_(properties)) {
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
```

---

## 8. Metrics.gs Before / After

`Metrics.gs` では、アラート判定の核心ロジック `evaluateAlertDecision_` と、QuickChart URL 生成処理 `buildQuickChartUrl` / `buildQuickChartUrlFromRecords_` がリファクタリング対象となりました。

### 8.1 `evaluateAlertDecision_` (Complexity: 28 -> 9)

#### 【変更点と追加ヘルパーの詳細】
| 関数名 | Before存在 | 追加理由 | 呼び出し元 | 内部処理 |
| :--- | :---: | :--- | :--- | :--- |
| `isSensorAnomaly_` | No | センサ値の型・NaN・範囲異常の判定を統合 | `evaluateAlertDecision_` | `temp`/`hum` の数値妥当性を確認し、下請けヘルパーを呼ぶ |
| `isTemperatureAnomaly_` | No | 室温の許容上下限チェック | `isSensorAnomaly_` | `temp < minTemp || temp > maxTemp` |
| `isHumidityAnomaly_` | No | 湿度の許容上下限チェック | `isSensorAnomaly_` | `hum < minHum || hum > maxHum` |
| `isCooldownActive_` | No | 1時間クールダウン期間中かの判定 | `evaluateAlertDecision_` | `(nowMs - lastSentMs) < cooldownMs` |
| `isDailyLimitReached_` | No | 本日の発報上限（5回）到達判定 | `evaluateAlertDecision_` | `dailyAlertInfo.count >= maxDailyCount` |

#### Before (Base: 3369ba9)
```javascript
function evaluateAlertDecision_(params) {
  if (!params) {
    return { shouldAlert: false, reason: 'invalid_params', todayJst: '' };
  }

  const temp = typeof params.temp === 'number' ? params.temp : NaN;
  const hum = typeof params.hum === 'number' ? params.hum : NaN;
  const nowMs = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
  const todayJst = getJstDateString_(nowMs);

  const opts = params.options || {};
  const minTemp = typeof opts.minTemp === 'number' ? opts.minTemp : -10.0;
  const maxTemp = typeof opts.maxTemp === 'number' ? opts.maxTemp : 50.0;
  const minHum = typeof opts.minHum === 'number' ? opts.minHum : 0.0;
  const maxHum = typeof opts.maxHum === 'number' ? opts.maxHum : 100.0;
  const cooldownMs = typeof opts.cooldownMs === 'number' ? opts.cooldownMs : 60 * 60 * 1000;
  const maxDailyCount = typeof opts.maxDailyCount === 'number' ? opts.maxDailyCount : 5;

  // 1. センサー異常値ガード
  if (isNaN(temp) || isNaN(hum) || temp < minTemp || temp > maxTemp || hum < minHum || hum > maxHum) {
    return { shouldAlert: false, reason: 'sensor_anomaly', todayJst: todayJst };
  }

  // 2. SNOOZE（通知停止期限）の優先判定
  if (isSnoozeActive_(params.snoozeUntil, nowMs)) {
    return { shouldAlert: false, reason: 'snooze_active', todayJst: todayJst };
  }

  // 3. 警戒閾値の判定
  if (!params.isOverThreshold) {
    return { shouldAlert: false, reason: 'normal', todayJst: todayJst };
  }

  // 4. 1時間クールダウン判定（無料枠保護）
  if (params.lastSentTime) {
    const lastSentMs = typeof params.lastSentTime === 'number'
      ? params.lastSentTime
      : parseInt(params.lastSentTime, 10);
    if (!isNaN(lastSentMs) && (nowMs - lastSentMs) < cooldownMs) {
      return { shouldAlert: false, reason: 'cooldown_active', todayJst: todayJst };
    }
  }

  // 5. 1日あたりの上限ガード（セーフティネット）
  if (params.dailyAlertInfo && params.dailyAlertInfo.date === todayJst) {
    const count = typeof params.dailyAlertInfo.count === 'number' ? params.dailyAlertInfo.count : 0;
    if (count >= maxDailyCount) {
      return { shouldAlert: false, reason: 'daily_limit_reached', todayJst: todayJst };
    }
  }

  return { shouldAlert: true, reason: 'alert_triggered', todayJst: todayJst };
}
```

#### After (Head: 5f479d2)
```javascript
function isTemperatureAnomaly_(temp, opts) {
  const minTemp = typeof opts.minTemp === 'number' ? opts.minTemp : -10.0;
  const maxTemp = typeof opts.maxTemp === 'number' ? opts.maxTemp : 50.0;
  return temp < minTemp || temp > maxTemp;
}

function isHumidityAnomaly_(hum, opts) {
  const minHum = typeof opts.minHum === 'number' ? opts.minHum : 0.0;
  const maxHum = typeof opts.maxHum === 'number' ? opts.maxHum : 100.0;
  return hum < minHum || hum > maxHum;
}

function isSensorAnomaly_(temp, hum, opts) {
  if (typeof temp !== 'number' || typeof hum !== 'number' || isNaN(temp) || isNaN(hum)) {
    return true;
  }
  if (isTemperatureAnomaly_(temp, opts)) return true;
  return isHumidityAnomaly_(hum, opts);
}

function isCooldownActive_(lastSentTime, nowMs, cooldownMsOpt) {
  if (!lastSentTime) return false;
  const cooldownMs = typeof cooldownMsOpt === 'number' ? cooldownMsOpt : 60 * 60 * 1000;
  const lastSentMs = typeof lastSentTime === 'number' ? lastSentTime : parseInt(lastSentTime, 10);
  return !isNaN(lastSentMs) && (nowMs - lastSentMs) < cooldownMs;
}

function isDailyLimitReached_(dailyAlertInfo, todayJst, maxDailyCountOpt) {
  if (!dailyAlertInfo || dailyAlertInfo.date !== todayJst) return false;
  const maxDailyCount = typeof maxDailyCountOpt === 'number' ? maxDailyCountOpt : 5;
  const count = typeof dailyAlertInfo.count === 'number' ? dailyAlertInfo.count : 0;
  return count >= maxDailyCount;
}

function evaluateAlertDecision_(params) {
  if (!params) {
    return { shouldAlert: false, reason: 'invalid_params', todayJst: '' };
  }

  const nowMs = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
  const todayJst = getJstDateString_(nowMs);
  const opts = params.options || {};

  if (isSensorAnomaly_(params.temp, params.hum, opts)) {
    return { shouldAlert: false, reason: 'sensor_anomaly', todayJst: todayJst };
  }

  if (isSnoozeActive_(params.snoozeUntil, nowMs)) {
    return { shouldAlert: false, reason: 'snooze_active', todayJst: todayJst };
  }

  if (!params.isOverThreshold) {
    return { shouldAlert: false, reason: 'normal', todayJst: todayJst };
  }

  if (isCooldownActive_(params.lastSentTime, nowMs, opts.cooldownMs)) {
    return { shouldAlert: false, reason: 'cooldown_active', todayJst: todayJst };
  }

  if (isDailyLimitReached_(params.dailyAlertInfo, todayJst, opts.maxDailyCount)) {
    return { shouldAlert: false, reason: 'daily_limit_reached', todayJst: todayJst };
  }

  return { shouldAlert: true, reason: 'alert_triggered', todayJst: todayJst };
}
```

### 8.2 `buildQuickChartUrl` (Complexity: 20 -> 5) & `buildQuickChartUrlFromRecords_` (Complexity: 13 -> 8)

#### 【変更点と追加ヘルパーの詳細】
- `extractRawValues_`: 引数が Sheet か 配列 かをダックタイピングで判定し、最大288行を取得。
- `filterValidChartRecords_` & `isValidChartDate_`: 行データの日付型・数値型を検証し、有効なレコード配列に整形。
- `sampleRecordsForChart_`: 指定目標件数（targetCount）への等間隔サンプリング間引きアルゴリズム。
- `buildLineChartConfig_`: Chart.js の 2 軸（温度/湿度）設定オブジェクト生成。
- `normalizeQuickChartOptions_`: 幅・高さ・DPR 等のデフォルト補完。
- `generateQuickChartUrlString_`: サンプリングと設定構築を呼んで URL 文字列化。

#### Before (Base: 3369ba9)
```javascript
// --- buildQuickChartUrlFromRecords_ (Before) ---
function buildQuickChartUrlFromRecords_(records, options) {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return null;
  }

  const opts = options || {};
  const width = opts.width || 600;
  const height = opts.height || 360;
  const dpr = typeof opts.devicePixelRatio === 'number' ? opts.devicePixelRatio : 2.0;
  let targetCount = opts.targetCount || 30;

  // Helper to generate URL given target sample count
  function generateWithTargetCount(count) {
    const step = Math.max(1, Math.floor(records.length / count));
    const sampled = [];
    for (let i = 0; i < records.length; i += step) {
      sampled.push(records[i]);
    }
    const lastRecord = records[records.length - 1];
    if (sampled[sampled.length - 1] !== lastRecord) {
      sampled.push(lastRecord);
    }

    const labels = [];
    const temps = [];
    const hums = [];
    let lastLabeledHour = -1;

    for (let i = 0; i < sampled.length; i += 1) {
      const row = sampled[i];
      const ts = row[0];
      const d = (ts instanceof Date) ? ts : new Date(ts);
      const h = d.getHours();
      const m = d.getMinutes();
      let label = '';
      // Show label on first point, last point, or every 3 hours
      if (i === 0 || i === sampled.length - 1 || (h % 3 === 0 && h !== lastLabeledHour)) {
        label = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        lastLabeledHour = h;
      }
      labels.push(label);
      temps.push(Number(Number(row[1]).toFixed(1)));
      hums.push(Number(Number(row[3]).toFixed(1)));
    }

    const chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '温度 (℃)',
            data: temps,
            borderColor: '#ef4444',
            fill: false,
            yAxisID: 'yTemp',
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: '湿度 (%)',
            data: hums,
            borderColor: '#3b82f6',
            fill: false,
            yAxisID: 'yHum',
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      options: {
        title: {
          display: true,
          text: '直近24時間の温湿度推移'
        },
        scales: {
          yAxes: [
            {
              id: 'yTemp',
              position: 'left',
              scaleLabel: {
                display: true,
                labelString: '℃'
              }
            },
            {
              id: 'yHum',
              position: 'right',
              scaleLabel: {
                display: true,
                labelString: '%'
              },
              gridLines: {
                drawOnChartArea: false
              }
            }
          ]
        }
      }
    };

    const chartJson = JSON.stringify(chartConfig);
    return `https://quickchart.io/chart?w=${width}&h=${height}&devicePixelRatio=${dpr.toFixed(1)}&c=${encodeURIComponent(chartJson)}`;
  }

  let url = generateWithTargetCount(targetCount);

  // Safeguard: if URL still exceeds 2000 chars, progressively reduce sampling
  if (url.length > 2000 && targetCount > 15) {
    url = generateWithTargetCount(20);
  }
  if (url.length > 2000 && targetCount > 10) {
    url = generateWithTargetCount(12);
  }

  return url;
}

// --- buildQuickChartUrl (Before) ---
function buildQuickChartUrl(sheetOrRecords, options) {
  if (!sheetOrRecords) {
    return null;
  }

  let rawValues = [];

  // If a Sheet object is provided (duck-typing getLastRow and getRange)
  if (typeof sheetOrRecords.getLastRow === 'function' && typeof sheetOrRecords.getRange === 'function') {
    const lastRow = sheetOrRecords.getLastRow();
    if (lastRow < 2) {
      return null;
    }
    const MAX_ROWS = 288;
    const startRow = Math.max(1, lastRow - MAX_ROWS + 1);
    const numRows = lastRow - startRow + 1;
    rawValues = sheetOrRecords.getRange(startRow, 1, numRows, 4).getValues();
  } else if (Array.isArray(sheetOrRecords)) {
    rawValues = sheetOrRecords.slice(-288);
  } else {
    return null;
  }

  // Filter valid measurement records
  const validRecords = [];
  for (let i = 0; i < rawValues.length; i += 1) {
    const row = rawValues[i];
    if (!row || row.length < 4) {
      continue;
    }
    const ts = row[0];
    const temp = Number(row[1]);
    const hum = Number(row[3]);

    const isValidDate = (Object.prototype.toString.call(ts) === '[object Date]' && !isNaN(ts.getTime())) ||
      (typeof ts === 'string' && ts.trim() !== '' && !isNaN(new Date(ts).getTime())) ||
      (typeof ts === 'number' && !isNaN(new Date(ts).getTime()));

    if (isValidDate && !isNaN(temp) && !isNaN(hum)) {
      const dateObj = (ts instanceof Date) ? ts : new Date(ts);
      validRecords.push([dateObj, temp, row[2], hum]);
    }
  }

  if (validRecords.length === 0) {
    return null;
  }

  return buildQuickChartUrlFromRecords_(validRecords, options);
}
```

#### After (Head: 5f479d2)
```javascript
function isValidChartDate_(ts) {
  if (Object.prototype.toString.call(ts) === '[object Date]') return !isNaN(ts.getTime());
  if (typeof ts === 'string' && ts.trim() !== '') return !isNaN(new Date(ts).getTime());
  if (typeof ts === 'number') return !isNaN(new Date(ts).getTime());
  return false;
}

function filterValidChartRecords_(rawValues) {
  const validRecords = [];
  for (let i = 0; i < rawValues.length; i += 1) {
    const row = rawValues[i];
    if (!row || row.length < 4) continue;

    const ts = row[0];
    const temp = Number(row[1]);
    const hum = Number(row[3]);

    if (isValidChartDate_(ts) && !isNaN(temp) && !isNaN(hum)) {
      const dateObj = (ts instanceof Date) ? ts : new Date(ts);
      validRecords.push([dateObj, temp, row[2], hum]);
    }
  }
  return validRecords;
}

function extractRawValues_(sheetOrRecords) {
  if (typeof sheetOrRecords.getLastRow === 'function' && typeof sheetOrRecords.getRange === 'function') {
    const lastRow = sheetOrRecords.getLastRow();
    if (lastRow < 2) return [];
    const MAX_ROWS = 288;
    const startRow = Math.max(1, lastRow - MAX_ROWS + 1);
    const numRows = lastRow - startRow + 1;
    return sheetOrRecords.getRange(startRow, 1, numRows, 4).getValues();
  }
  if (Array.isArray(sheetOrRecords)) {
    return sheetOrRecords.slice(-288);
  }
  return [];
}

function sampleRecordsForChart_(records, count) {
  const step = Math.max(1, Math.floor(records.length / count));
  const sampled = [];
  for (let i = 0; i < records.length; i += step) {
    sampled.push(records[i]);
  }
  const lastRecord = records[records.length - 1];
  if (sampled[sampled.length - 1] !== lastRecord) {
    sampled.push(lastRecord);
  }

  const labels = [];
  const temps = [];
  const hums = [];
  let lastLabeledHour = -1;

  for (let i = 0; i < sampled.length; i += 1) {
    const row = sampled[i];
    const ts = row[0];
    const d = (ts instanceof Date) ? ts : new Date(ts);
    const h = d.getHours();
    const m = d.getMinutes();
    let label = '';
    // Show label on first point, last point, or every 3 hours
    if (i === 0 || i === sampled.length - 1 || (h % 3 === 0 && h !== lastLabeledHour)) {
      label = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      lastLabeledHour = h;
    }
    labels.push(label);
    temps.push(Number(Number(row[1]).toFixed(1)));
    hums.push(Number(Number(row[3]).toFixed(1)));
  }

  return { labels, temps, hums };
}

function buildLineChartConfig_(labels, temps, hums) {
  return {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '温度 (℃)',
          data: temps,
          borderColor: '#ef4444',
          fill: false,
          yAxisID: 'yTemp',
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: '湿度 (%)',
          data: hums,
          borderColor: '#3b82f6',
          fill: false,
          yAxisID: 'yHum',
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: '直近24時間の温湿度推移'
      },
      scales: {
        yAxes: [
          {
            id: 'yTemp',
            position: 'left',
            scaleLabel: {
              display: true,
              labelString: '℃'
            }
          },
          {
            id: 'yHum',
            position: 'right',
            scaleLabel: {
              display: true,
              labelString: '%'
            },
            gridLines: {
              drawOnChartArea: false
            }
          }
        ]
      }
    }
  };
}

function normalizeQuickChartOptions_(options) {
  const opts = options || {};
  return {
    width: opts.width || 600,
    height: opts.height || 360,
    dpr: typeof opts.devicePixelRatio === 'number' ? opts.devicePixelRatio : 2.0,
    targetCount: opts.targetCount || 30
  };
}

function generateQuickChartUrlString_(records, count, width, height, dpr) {
  const { labels, temps, hums } = sampleRecordsForChart_(records, count);
  const chartConfig = buildLineChartConfig_(labels, temps, hums);
  const chartJson = JSON.stringify(chartConfig);
  return `https://quickchart.io/chart?w=${width}&h=${height}&devicePixelRatio=${dpr.toFixed(1)}&c=${encodeURIComponent(chartJson)}`;
}

function buildQuickChartUrlFromRecords_(records, options) {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return null;
  }

  const { width, height, dpr, targetCount } = normalizeQuickChartOptions_(options);

  let url = generateQuickChartUrlString_(records, targetCount, width, height, dpr);

  // Safeguard: if URL still exceeds 2000 chars, progressively reduce sampling
  if (url.length > 2000 && targetCount > 15) {
    url = generateQuickChartUrlString_(records, 20, width, height, dpr);
  }
  if (url.length > 2000 && targetCount > 10) {
    url = generateQuickChartUrlString_(records, 12, width, height, dpr);
  }

  return url;
}

function buildQuickChartUrl(sheetOrRecords, options) {
  if (!sheetOrRecords) return null;

  const rawValues = extractRawValues_(sheetOrRecords);
  if (!rawValues || rawValues.length === 0) return null;

  const validRecords = filterValidChartRecords_(rawValues);
  if (validRecords.length === 0) return null;

  return buildQuickChartUrlFromRecords_(validRecords, options);
}
```

---

## 9. Other Important Before / After

### 9.1 Ingest.gs: `checkAndAppendMeasurement_` (28 -> 2) & `validateSensorPayload_` (14 -> 10)
```javascript
// === Before (Base: 3369ba9) ===
function validateSensorPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'invalid_payload';
  }

  if (typeof payload.api_version !== 'number' ||
      !isFinite(payload.api_version) || payload.api_version !== 1) {
    return 'invalid_api_version';
  }

  if (typeof payload.token !== 'string' || payload.token.length === 0) {
    return 'invalid_token';
  }

  const measurementNames = ['temp', 'press', 'hum'];
  for (let i = 0; i < measurementNames.length; i += 1) {
    const name = measurementNames[i];
    const value = payload[name];
    const limit = LIMITS[name];
    if (typeof value !== 'number' || !isFinite(value) ||
        value < limit.min || value > limit.max) {
      return 'invalid_payload';
    }
  }

  return null;
}

function checkAndAppendMeasurement_(payload, properties) {
  const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('missing spreadsheet configuration');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getRawDataSheet_(spreadsheet, properties);
  if (!sheet) {
    throw new Error('sheet not found');
  }

  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG : {});
  const lockTimeoutMs = config.INGEST_LOCK_TIMEOUT_MS || 15000;
  const dupWindowSec = typeof config.SENSOR_DUPLICATION_WINDOW_SECONDS === 'number' ? config.SENSOR_DUPLICATION_WINDOW_SECONDS : 180;

  const lock = LockService.getScriptLock();
  lock.waitLock(lockTimeoutMs);

  try {
    const lastRow = sheet.getLastRow();
    const now = new Date();

    if (lastRow >= 1) {
      const lastValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
      const lastTimestamp = lastValues[0];
      const lastTemp = lastValues[1];
      const lastPress = lastValues[2];
      const lastHum = lastValues[3];

      // DATA row 1 is normally a header. Ignore any non-date row so the first
      // measurement can be appended without attempting timestamp arithmetic.
      const hasValidTimestamp = Object.prototype.toString.call(lastTimestamp) === '[object Date]' &&
          !isNaN(lastTimestamp.getTime());

      if (hasValidTimestamp) {
        const elapsedSec = (now.getTime() - lastTimestamp.getTime()) / 1000;

        const isDuplicate = elapsedSec >= 0 &&
            elapsedSec <= dupWindowSec &&
            lastTemp === payload.temp &&
            lastPress === payload.press &&
            lastHum === payload.hum;

        if (isDuplicate) {
          return false;
        }
      }
    }

    sheet.appendRow([now, payload.temp, payload.press, payload.hum, '']);
    const lastAppendedRow = sheet.getLastRow();
    sheet.getRange(lastAppendedRow, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');

    if (typeof resetWatchdogState_ === 'function') {
      try {
        resetWatchdogState_();
      } catch (error) {
        if (typeof logError_ === 'function') {
          logError_('ingest', 'watchdog', 'watchdog_reset_failed', error);
        }
      }
    }

    if (typeof updateMonitorState_ === 'function') {
      try {
        const monitorResult = updateMonitorState_(payload);
        if (monitorResult && monitorResult.anomaly) {
          sheet.getRange(lastAppendedRow, 5).setValue('anomaly');
        }
        if (monitorResult && monitorResult.notification &&
            typeof pushMonitorNotification_ === 'function') {
          try {
            pushMonitorNotification_(monitorResult.notification.text);
          } catch (err) {
            if (typeof logError_ === 'function') {
              logError_('ingest', 'line_push', 'push_failed', err);
            }
          }
        }
      } catch (error) {
        if (typeof logError_ === 'function') {
          logError_('ingest', 'monitor', 'monitor_update_failed', error);
        } else {
          console.error('monitor_update_failed');
        }
      }
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

// === After (Head: 5f479d2) ===
function validateMeasurementLimits_(payload) {
  const measurementNames = ['temp', 'press', 'hum'];
  for (let i = 0; i < measurementNames.length; i += 1) {
    const name = measurementNames[i];
    const value = payload[name];
    const limit = LIMITS[name];
    if (typeof value !== 'number' || !isFinite(value) ||
        value < limit.min || value > limit.max) {
      return false;
    }
  }
  return true;
}

function validateSensorPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'invalid_payload';
  }

  if (typeof payload.api_version !== 'number' ||
      !isFinite(payload.api_version) || payload.api_version !== 1) {
    return 'invalid_api_version';
  }

  if (typeof payload.token !== 'string' || payload.token.length === 0) {
    return 'invalid_token';
  }

  if (!validateMeasurementLimits_(payload)) {
    return 'invalid_payload';
  }

  return null;
}

function isDuplicateMeasurement_(sheet, payload, dupWindowSec, now) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return false;
  }

  const lastValues = sheet.getRange(lastRow, 1, 1, 5).getValues()[0];
  const lastTimestamp = lastValues[0];
  const lastTemp = lastValues[1];
  const lastPress = lastValues[2];
  const lastHum = lastValues[3];

  const hasValidTimestamp = Object.prototype.toString.call(lastTimestamp) === '[object Date]' &&
      !isNaN(lastTimestamp.getTime());

  if (!hasValidTimestamp) {
    return false;
  }

  const elapsedSec = (now.getTime() - lastTimestamp.getTime()) / 1000;
  return elapsedSec >= 0 &&
      elapsedSec <= dupWindowSec &&
      lastTemp === payload.temp &&
      lastPress === payload.press &&
      lastHum === payload.hum;
}

function getIngestSheet_(properties) {
  const spreadsheetId = properties.getProperty(CONFIG_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('missing spreadsheet configuration');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getRawDataSheet_(spreadsheet, properties);
  if (!sheet) {
    throw new Error('sheet not found');
  }
  return sheet;
}

function getIngestConfig_() {
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG : {});
  const lockTimeoutMs = config.INGEST_LOCK_TIMEOUT_MS || 15000;
  const dupWindowSec = typeof config.SENSOR_DUPLICATION_WINDOW_SECONDS === 'number' ? config.SENSOR_DUPLICATION_WINDOW_SECONDS : 180;
  return { lockTimeoutMs, dupWindowSec };
}

function resetWatchdogSafely_() {
  if (typeof resetWatchdogState_ !== 'function') {
    return;
  }
  try {
    resetWatchdogState_();
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'watchdog', 'watchdog_reset_failed', error);
    }
  }
}

function pushMonitorNotificationSafely_(notification) {
  if (typeof pushMonitorNotification_ !== 'function') {
    return;
  }
  try {
    pushMonitorNotification_(notification.text);
  } catch (err) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'line_push', 'push_failed', err);
    }
  }
}

function applyMonitorStateSafely_(sheet, lastAppendedRow, payload) {
  if (typeof updateMonitorState_ !== 'function') {
    return;
  }
  try {
    const monitorResult = updateMonitorState_(payload);
    if (monitorResult && monitorResult.anomaly) {
      sheet.getRange(lastAppendedRow, 5).setValue('anomaly');
    }
    if (monitorResult && monitorResult.notification) {
      pushMonitorNotificationSafely_(monitorResult.notification);
    }
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('ingest', 'monitor', 'monitor_update_failed', error);
    } else {
      console.error('monitor_update_failed');
    }
  }
}

function checkAndAppendMeasurement_(payload, properties) {
  const sheet = getIngestSheet_(properties);
  const { lockTimeoutMs, dupWindowSec } = getIngestConfig_();

  const lock = LockService.getScriptLock();
  lock.waitLock(lockTimeoutMs);

  try {
    const now = new Date();
    if (isDuplicateMeasurement_(sheet, payload, dupWindowSec, now)) {
      return false;
    }

    sheet.appendRow([now, payload.temp, payload.press, payload.hum, '']);
    const lastAppendedRow = sheet.getLastRow();
    sheet.getRange(lastAppendedRow, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');

    resetWatchdogSafely_();
    applyMonitorStateSafely_(sheet, lastAppendedRow, payload);

    return true;
  } finally {
    lock.releaseLock();
  }
}
```

### 9.2 Monitor.gs: `runWatchdogCheck_` (19 -> 4) & `updateMonitorState_` (14 -> 5)
```javascript
// === Before (Base: 3369ba9) ===
function runWatchdogCheck_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('monitor_watchdog', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const dataSheet = getRawDataSheet_(spreadsheet, properties);
  if (!dataSheet) {
    const error = new Error('Raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monitor_watchdog', 'RawData', 'data_sheet_not_found', error);
    }
    throw error;
  }

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || 15000;
  lock.waitLock(timeoutMs);

  try {
    const lastRow = dataSheet.getLastRow();
    if (lastRow < 2) {
      return {
        timeout: false,
        notified: false,
        notification: null,
        elapsedMinutes: null
      };
    }

    const lastRowValues = dataSheet.getRange(lastRow, 1, 1, 1).getValues()[0];
    const lastTimestamp = lastRowValues[0];
    let lastDate;
    if (Object.prototype.toString.call(lastTimestamp) === '[object Date]') {
      lastDate = lastTimestamp;
    } else if (lastTimestamp) {
      lastDate = new Date(lastTimestamp);
    }

    if (!lastDate || isNaN(lastDate.getTime())) {
      return {
        timeout: false,
        notified: false,
        notification: null,
        elapsedMinutes: null
      };
    }

    const now = new Date();
    const elapsedMinutes = (now.getTime() - lastDate.getTime()) / (1000 * 60);

    const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
    const timeoutMinutes = getConfigNumber_(config, ['WATCHDOG_TIMEOUT_MIN'], 4320);

    if (elapsedMinutes < timeoutMinutes) {
      return {
        timeout: false,
        notified: false,
        notification: null,
        elapsedMinutes: elapsedMinutes
      };
    }

    const alreadyNotified = properties.getProperty(MONITOR_PROPERTIES.watchdogNotified) === 'true';
    if (alreadyNotified) {
      return {
        timeout: true,
        notified: false,
        notification: null,
        elapsedMinutes: elapsedMinutes
      };
    }

    const daysOffline = (elapsedMinutes / (60 * 24)).toFixed(1);
    const notification = {
      text: `センサー未受信：約${daysOffline}日間（${Math.round(elapsedMinutes)}分）データが途絶えています。`,
      lastTimestamp: lastDate,
      elapsedMinutes: elapsedMinutes
    };

    properties.setProperty(MONITOR_PROPERTIES.watchdogNotified, 'true');

    return {
      timeout: true,
      notified: true,
      notification: notification,
      elapsedMinutes: elapsedMinutes
    };
  } finally {
    lock.releaseLock();
  }
}

function updateMonitorState_(measurement) {
  const conditions = evaluateMonitorConditions_(measurement);
  const properties = PropertiesService.getScriptProperties();
  const monitorConfig = getMonitorConfig_();
  const thresholds = monitorConfig.thresholds;
  const smoothing = monitorConfig.smoothing;
  const mergedConfig = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};

  const currentStates = loadMonitorStates_(properties);
  const lastValid = loadLastValidMeasurement_(properties);
  const anomaly = detectAnomaly_(conditions, lastValid, getAnomalyLimits_());

  if (!anomaly) {
    saveLastValidMeasurement_(properties, conditions);
  }

  const states = {
    temp: evaluateConditionState_(currentStates.temp, conditions.temp, thresholds.temp, smoothing),
    hum: evaluateConditionState_(currentStates.hum, conditions.hum, thresholds.hum, smoothing),
    discomfortIndex: evaluateConditionState_(currentStates.discomfortIndex, conditions.discomfortIndex, thresholds.discomfortIndex, smoothing)
  };

  const isOverThreshold = states.temp.alert || states.hum.alert || states.discomfortIndex.alert;

  const snoozeUntil = loadAlertSnoozeUntil_(properties);
  const lastSentTime = loadAlertLastSentTime_(properties);
  const dailyAlertInfo = loadDailyAlertInfo_(properties);

  const decision = typeof evaluateAlertDecision_ === 'function'
    ? evaluateAlertDecision_({
        temp: conditions.temp,
        hum: conditions.hum,
        press: conditions.press,
        isOverThreshold: isOverThreshold,
        nowMs: Date.now(),
        snoozeUntil: snoozeUntil,
        lastSentTime: lastSentTime,
        dailyAlertInfo: dailyAlertInfo,
        options: {
          cooldownMs: getConfigNumber_(mergedConfig, ['ALERT_COOLDOWN_MIN'], 60) * 60 * 1000,
          maxDailyCount: getConfigNumber_(mergedConfig, ['ALERT_MAX_DAILY_COUNT'], 5),
          minTemp: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MIN_TEMP'], -10.0),
          maxTemp: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MAX_TEMP'], 50.0),
          minHum: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MIN_HUM'], 0.0),
          maxHum: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MAX_HUM'], 100.0)
        }
      })
    : { shouldAlert: isOverThreshold && !(currentStates.temp.alert || currentStates.hum.alert || currentStates.discomfortIndex.alert) };

  let notification = null;
  if (decision.shouldAlert) {
    notification = buildMonitorNotification_(conditions);
    const nowMs = Date.now();
    saveAlertLastSentTime_(properties, nowMs);
    const todayJst = decision.todayJst || (typeof getJstDateString_ === 'function' ? getJstDateString_(nowMs) : new Date().toISOString().slice(0, 10));
    const newCount = (dailyAlertInfo && dailyAlertInfo.date === todayJst) ? (dailyAlertInfo.count + 1) : 1;
    saveDailyAlertInfo_(properties, { date: todayJst, count: newCount });
  }

  saveMonitorStates_(properties, states);

  return {
    states,
    notification,
    anomaly,
    decision
  };
}

// === After (Head: 5f479d2) ===
function getWatchdogDataSheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') logError_('monitor_watchdog', 'Config', 'missing_spreadsheet_id', error);
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const dataSheet = getRawDataSheet_(spreadsheet, properties);
  if (!dataSheet) {
    const error = new Error('Raw data sheet not found');
    if (typeof logError_ === 'function') logError_('monitor_watchdog', 'RawData', 'data_sheet_not_found', error);
    throw error;
  }
  return dataSheet;
}

function getLastTimestampFromSheet_(dataSheet) {
  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return null;

  const lastRowValues = dataSheet.getRange(lastRow, 1, 1, 1).getValues()[0];
  const lastTimestamp = lastRowValues[0];
  let lastDate;
  if (Object.prototype.toString.call(lastTimestamp) === '[object Date]') {
    lastDate = lastTimestamp;
  } else if (lastTimestamp) {
    lastDate = new Date(lastTimestamp);
  }

  if (!lastDate || isNaN(lastDate.getTime())) return null;
  return lastDate;
}

function buildWatchdogResult_(timeout, notified, notification, elapsedMinutes) {
  return { timeout, notified, notification, elapsedMinutes };
}

function evaluateWatchdogTimeout_(lastDate, properties) {
  const elapsedMinutes = (Date.now() - lastDate.getTime()) / (1000 * 60);
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};
  const timeoutMinutes = getConfigNumber_(config, ['WATCHDOG_TIMEOUT_MIN'], 4320);

  if (elapsedMinutes < timeoutMinutes) {
    return buildWatchdogResult_(false, false, null, elapsedMinutes);
  }

  const alreadyNotified = properties.getProperty(MONITOR_PROPERTIES.watchdogNotified) === 'true';
  if (alreadyNotified) {
    return buildWatchdogResult_(true, false, null, elapsedMinutes);
  }

  const daysOffline = (elapsedMinutes / (60 * 24)).toFixed(1);
  const notification = {
    text: `センサー未受信：約${daysOffline}日間（${Math.round(elapsedMinutes)}分）データが途絶えています。`,
    lastTimestamp: lastDate,
    elapsedMinutes: elapsedMinutes
  };

  properties.setProperty(MONITOR_PROPERTIES.watchdogNotified, 'true');
  return buildWatchdogResult_(true, true, notification, elapsedMinutes);
}

function runWatchdogCheck_() {
  const properties = PropertiesService.getScriptProperties();
  const dataSheet = getWatchdogDataSheet_(properties);

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || 15000;
  lock.waitLock(timeoutMs);

  try {
    const lastDate = getLastTimestampFromSheet_(dataSheet);
    if (!lastDate) {
      return buildWatchdogResult_(false, false, null, null);
    }

    return evaluateWatchdogTimeout_(lastDate, properties);
  } finally {
    lock.releaseLock();
  }
}

function buildAlertDecisionOptions_(mergedConfig) {
  return {
    cooldownMs: getConfigNumber_(mergedConfig, ['ALERT_COOLDOWN_MIN'], 60) * 60 * 1000,
    maxDailyCount: getConfigNumber_(mergedConfig, ['ALERT_MAX_DAILY_COUNT'], 5),
    minTemp: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MIN_TEMP'], -10.0),
    maxTemp: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MAX_TEMP'], 50.0),
    minHum: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MIN_HUM'], 0.0),
    maxHum: getConfigNumber_(mergedConfig, ['SENSOR_GUARD_MAX_HUM'], 100.0)
  };
}

function resolveAlertDecision_(conditions, isOverThreshold, currentStates, properties, mergedConfig) {
  if (typeof evaluateAlertDecision_ !== 'function') {
    return { shouldAlert: isOverThreshold && !(currentStates.temp.alert || currentStates.hum.alert || currentStates.discomfortIndex.alert) };
  }

  const snoozeUntil = loadAlertSnoozeUntil_(properties);
  const lastSentTime = loadAlertLastSentTime_(properties);
  const dailyAlertInfo = loadDailyAlertInfo_(properties);

  return evaluateAlertDecision_({
    temp: conditions.temp,
    hum: conditions.hum,
    press: conditions.press,
    isOverThreshold: isOverThreshold,
    nowMs: Date.now(),
    snoozeUntil: snoozeUntil,
    lastSentTime: lastSentTime,
    dailyAlertInfo: dailyAlertInfo,
    options: buildAlertDecisionOptions_(mergedConfig)
  });
}

function recordAlertNotification_(properties, decision, conditions, dailyAlertInfo) {
  if (!decision || !decision.shouldAlert) {
    return null;
  }

  const notification = buildMonitorNotification_(conditions);
  const nowMs = Date.now();
  saveAlertLastSentTime_(properties, nowMs);

  const todayJst = decision.todayJst || (typeof getJstDateString_ === 'function' ? getJstDateString_(nowMs) : new Date().toISOString().slice(0, 10));
  const newCount = (dailyAlertInfo && dailyAlertInfo.date === todayJst) ? (dailyAlertInfo.count + 1) : 1;
  saveDailyAlertInfo_(properties, { date: todayJst, count: newCount });

  return notification;
}

function updateMonitorState_(measurement) {
  const conditions = evaluateMonitorConditions_(measurement);
  const properties = PropertiesService.getScriptProperties();
  const monitorConfig = getMonitorConfig_();
  const thresholds = monitorConfig.thresholds;
  const smoothing = monitorConfig.smoothing;
  const mergedConfig = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : {};

  const currentStates = loadMonitorStates_(properties);
  const lastValid = loadLastValidMeasurement_(properties);
  const anomaly = detectAnomaly_(conditions, lastValid, getAnomalyLimits_());

  if (!anomaly) {
    saveLastValidMeasurement_(properties, conditions);
  }

  const states = {
    temp: evaluateConditionState_(currentStates.temp, conditions.temp, thresholds.temp, smoothing),
    hum: evaluateConditionState_(currentStates.hum, conditions.hum, thresholds.hum, smoothing),
    discomfortIndex: evaluateConditionState_(currentStates.discomfortIndex, conditions.discomfortIndex, thresholds.discomfortIndex, smoothing)
  };

  const isOverThreshold = states.temp.alert || states.hum.alert || states.discomfortIndex.alert;
  const dailyAlertInfo = loadDailyAlertInfo_(properties);
  const decision = resolveAlertDecision_(conditions, isOverThreshold, currentStates, properties, mergedConfig);
  const notification = recordAlertNotification_(properties, decision, conditions, dailyAlertInfo);

  saveMonitorStates_(properties, states);

  return {
    states,
    notification,
    anomaly,
    decision
  };
}
```

### 9.3 Router.gs: `doPost` (16 -> 6)
```javascript
// === Before (Base: 3369ba9) ===
function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    return errorResponse_('invalid_json');
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  const headers = e && e.headers ? e.headers : {};
  const hasLineHeader = !!(headers['X-Line-Signature'] || headers['x-line-signature'] ||
    (e && e.parameter && (e.parameter['X-Line-Signature'] || e.parameter['x-line-signature'])));

  const isLinePayload = payload && (Array.isArray(payload.events) || typeof payload.destination === 'string');

  if (hasLineHeader || isLinePayload) {
    return handleLineWebhook_(e);
  }

  return handleSensorPost_(e);
}

// === After (Head: 5f479d2) ===
function hasLineSignatureHeader_(e) {
  if (!e) return false;
  if (e.headers && (e.headers['X-Line-Signature'] || e.headers['x-line-signature'])) return true;
  if (e.parameter && (e.parameter['X-Line-Signature'] || e.parameter['x-line-signature'])) return true;
  return false;
}

function isLineWebhookRequest_(e, payload) {
  const hasLineHeader = hasLineSignatureHeader_(e);
  const isLinePayload = payload && (Array.isArray(payload.events) || typeof payload.destination === 'string');
  return hasLineHeader || isLinePayload;
}

function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    return errorResponse_('invalid_json');
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return errorResponse_('invalid_json');
  }

  if (isLineWebhookRequest_(e, payload)) {
    return handleLineWebhook_(e);
  }

  return handleSensorPost_(e);
}
```

### 9.4 DailyAggregation.gs: `runDailyAggregation_` (23 -> 7) & `formatDateTokyo_` (16 -> 6)
```javascript
// === Before (Base: 3369ba9) ===
function runDailyAggregation_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const sheetNameKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.sheetName) || 'SHEET_NAME';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const dataSheet = getRawDataSheet_(spreadsheet, properties);
  if (!dataSheet) {
    const error = new Error('Raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', 'RawData', 'data_sheet_not_found', error);
    }
    throw error;
  }

  const dailySheet = spreadsheet.getSheetByName(DAILY_SHEET_NAME);
  if (!dailySheet) {
    const error = new Error('Daily sheet not found');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', DAILY_SHEET_NAME, 'daily_sheet_not_found', error);
    }
    throw error;
  }

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || DAILY_LOCK_TIMEOUT_MS;
  lock.waitLock(timeoutMs);

  try {
    const lastProcessedRowStr = properties.getProperty(DAILY_AGGREGATION_PROPERTIES.lastRow);
    let lastProcessedRow = lastProcessedRowStr ? parseInt(lastProcessedRowStr, 10) : 1;
    if (isNaN(lastProcessedRow) || lastProcessedRow < 1) {
      lastProcessedRow = 1;
    }

    const totalDataRows = dataSheet.getLastRow();
    if (totalDataRows <= lastProcessedRow) {
      return {
        processedDays: 0,
        appendedDays: 0,
        lastProcessedRow: lastProcessedRow
      };
    }

    const startRow = lastProcessedRow + 1;
    const numRows = totalDataRows - lastProcessedRow;
    const dataValues = dataSheet.getRange(startRow, 1, numRows, 5).getValues();

    const now = new Date();
    const todayStr = formatDateTokyo_(now);

    const { dailyBuckets, lastConfirmedRow } = processDailyDataRows_(dataValues, startRow, todayStr, lastProcessedRow);

    // 既存のDailyシートに存在する日付を取得し、二重集計を防止
    const existingDailyDates = getExistingDailyDates_(dailySheet);
    const sortedDates = Array.from(dailyBuckets.keys()).sort();
    let appendedCount = 0;

    for (let j = 0; j < sortedDates.length; j += 1) {
      const dateStr = sortedDates[j];
      if (existingDailyDates.has(dateStr)) {
        continue;
      }

      const bucket = dailyBuckets.get(dateStr);
      const rowData = buildDailyRowData_(dateStr, bucket);

      // 有効データが存在しない日は追記をスキップ
      if (!rowData) {
        continue;
      }

      dailySheet.appendRow(rowData);
      appendedCount += 1;
      existingDailyDates.add(dateStr);
    }

    // 確定済み行まで進んだ場合のみ DAILY_LAST_ROW を更新
    if (lastConfirmedRow > lastProcessedRow) {
      properties.setProperty(DAILY_AGGREGATION_PROPERTIES.lastRow, String(lastConfirmedRow));
    }

    return {
      processedDays: sortedDates.length,
      appendedDays: appendedCount,
      lastProcessedRow: lastConfirmedRow
    };
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', DAILY_SHEET_NAME, 'aggregation_failed', error);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function formatDateTokyo_(dateInput, format) {
  if (!dateInput) {
    return null;
  }

  let dateObj;
  if (Object.prototype.toString.call(dateInput) === '[object Date]') {
    if (isNaN(dateInput.getTime())) {
      return null;
    }
    dateObj = dateInput;
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    if (!format || format === 'yyyy-MM-dd') {
      return dateInput.substring(0, 10);
    }
    dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
  } else {
    dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
  }

  const targetFormat = format || 'yyyy-MM-dd';

  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(dateObj, 'Asia/Tokyo', targetFormat);
  }

  const tokyoTime = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  const year = tokyoTime.getUTCFullYear();
  const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tokyoTime.getUTCDate()).padStart(2, '0');

  if (targetFormat === 'yyyy-MM') {
    return `${year}-${month}`;
  } else if (targetFormat === 'yyyy-MM-dd HH:mm:ss') {
    const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
    const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(tokyoTime.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } else if (targetFormat === 'MM/dd HH:mm') {
    const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
    const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }

  return `${year}-${month}-${day}`;
}

// === After (Head: 5f479d2) ===
function openDailyAggregationSpreadsheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getDailyAggregationSheets_(spreadsheet, properties) {
  const dataSheet = getRawDataSheet_(spreadsheet, properties);
  if (!dataSheet) {
    const error = new Error('Raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', 'RawData', 'data_sheet_not_found', error);
    }
    throw error;
  }

  const dailySheet = spreadsheet.getSheetByName(DAILY_SHEET_NAME);
  if (!dailySheet) {
    const error = new Error('Daily sheet not found');
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', DAILY_SHEET_NAME, 'daily_sheet_not_found', error);
    }
    throw error;
  }

  return { dataSheet, dailySheet };
}

function getLastProcessedDailyRow_(properties) {
  const lastProcessedRowStr = properties.getProperty(DAILY_AGGREGATION_PROPERTIES.lastRow);
  const lastProcessedRow = lastProcessedRowStr ? parseInt(lastProcessedRowStr, 10) : 1;
  if (isNaN(lastProcessedRow) || lastProcessedRow < 1) {
    return 1;
  }
  return lastProcessedRow;
}

function appendDailyDataRows_(dailySheet, dailyBuckets, existingDailyDates) {
  const sortedDates = Array.from(dailyBuckets.keys()).sort();
  let appendedCount = 0;

  for (let j = 0; j < sortedDates.length; j += 1) {
    const dateStr = sortedDates[j];
    if (existingDailyDates.has(dateStr)) {
      continue;
    }

    const bucket = dailyBuckets.get(dateStr);
    const rowData = buildDailyRowData_(dateStr, bucket);

    // 有効データが存在しない日は追記をスキップ
    if (!rowData) {
      continue;
    }

    dailySheet.appendRow(rowData);
    appendedCount += 1;
    existingDailyDates.add(dateStr);
  }

  return { sortedDates, appendedCount };
}

function runDailyAggregation_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = openDailyAggregationSpreadsheet_(properties);
  const { dataSheet, dailySheet } = getDailyAggregationSheets_(spreadsheet, properties);

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || DAILY_LOCK_TIMEOUT_MS;
  lock.waitLock(timeoutMs);

  try {
    const lastProcessedRow = getLastProcessedDailyRow_(properties);
    const totalDataRows = dataSheet.getLastRow();
    if (totalDataRows <= lastProcessedRow) {
      return {
        processedDays: 0,
        appendedDays: 0,
        lastProcessedRow: lastProcessedRow
      };
    }

    const startRow = lastProcessedRow + 1;
    const numRows = totalDataRows - lastProcessedRow;
    const dataValues = dataSheet.getRange(startRow, 1, numRows, 5).getValues();

    const now = new Date();
    const todayStr = formatDateTokyo_(now);

    const { dailyBuckets, lastConfirmedRow } = processDailyDataRows_(dataValues, startRow, todayStr, lastProcessedRow);

    // 既存のDailyシートに存在する日付を取得し、二重集計を防止
    const existingDailyDates = getExistingDailyDates_(dailySheet);
    const { sortedDates, appendedCount } = appendDailyDataRows_(dailySheet, dailyBuckets, existingDailyDates);

    // 確定済み行まで進んだ場合のみ DAILY_LAST_ROW を更新
    if (lastConfirmedRow > lastProcessedRow) {
      properties.setProperty(DAILY_AGGREGATION_PROPERTIES.lastRow, String(lastConfirmedRow));
    }

    return {
      processedDays: sortedDates.length,
      appendedDays: appendedCount,
      lastProcessedRow: lastConfirmedRow
    };
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('daily_aggregation', DAILY_SHEET_NAME, 'aggregation_failed', error);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function parseDateInput_(dateInput, format) {
  if (!dateInput) {
    return null;
  }

  if (Object.prototype.toString.call(dateInput) === '[object Date]') {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }

  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    if (!format || format === 'yyyy-MM-dd') {
      return dateInput.substring(0, 10);
    }
  }

  const dateObj = new Date(dateInput);
  return isNaN(dateObj.getTime()) ? null : dateObj;
}

function formatTokyoFallback_(dateObj, targetFormat) {
  const tokyoTime = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  const year = tokyoTime.getUTCFullYear();
  const month = String(tokyoTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tokyoTime.getUTCDate()).padStart(2, '0');

  if (targetFormat === 'yyyy-MM') {
    return `${year}-${month}`;
  }
  if (targetFormat === 'yyyy-MM-dd HH:mm:ss') {
    const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
    const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(tokyoTime.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  if (targetFormat === 'MM/dd HH:mm') {
    const hours = String(tokyoTime.getUTCHours()).padStart(2, '0');
    const minutes = String(tokyoTime.getUTCMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }

  return `${year}-${month}-${day}`;
}

function formatDateTokyo_(dateInput, format) {
  const parsed = parseDateInput_(dateInput, format);
  if (!parsed) {
    return null;
  }
  if (typeof parsed === 'string') {
    return parsed;
  }

  const targetFormat = format || 'yyyy-MM-dd';
  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', targetFormat);
  }

  return formatTokyoFallback_(parsed, targetFormat);
}

function accumulateDailyRow_(bucket, temp, press, hum, flag) {
  const flagStr = String(flag || '').trim().toLowerCase();
  const isAnomaly = flagStr === 'anomaly';
  const isAlert = flagStr === 'alert';

  if (isAlert) {
    bucket.alertCount += 1;
  }

  // anomaly 行は平均・最小・最大・sample_count から除外
  if (isAnomaly) {
    return;
  }

  const isValidTemp = typeof temp === 'number' && isFinite(temp);
  const isValidPress = typeof press === 'number' && isFinite(press);
  const isValidHum = typeof hum === 'number' && isFinite(hum);

  if (isValidTemp && isValidPress && isValidHum) {
    bucket.temps.push(temp);
    bucket.presses.push(press);
    bucket.hums.push(hum);
  }
}

function processDailyDataRows_(dataValues, startRow, todayStr, lastProcessedRow) {
  const dailyBuckets = new Map();
  let lastConfirmedRow = lastProcessedRow;

  for (let i = 0; i < dataValues.length; i += 1) {
    const currentRowNumber = startRow + i;
    const row = dataValues[i];
    const timestamp = row[0];
    const temp = row[1];
    const press = row[2];
    const hum = row[3];
    const flag = row[4];

    if (!timestamp) {
      continue;
    }

    const rowDateStr = formatDateTokyo_(timestamp);
    if (!rowDateStr) {
      continue;
    }

    // 当日以降のデータは未確定として今回の集計から除外
    if (todayStr && rowDateStr >= todayStr) {
      break;
    }

    lastConfirmedRow = currentRowNumber;

    if (!dailyBuckets.has(rowDateStr)) {
      dailyBuckets.set(rowDateStr, {
        temps: [],
        presses: [],
        hums: [],
        alertCount: 0
      });
    }

    const bucket = dailyBuckets.get(rowDateStr);
    accumulateDailyRow_(bucket, temp, press, hum, flag);
  }

  return { dailyBuckets, lastConfirmedRow };
}
```

### 9.5 MonthlyAggregation.gs: `runMonthlyAggregation_` (24 -> 7) & `processMonthlyDataRows_` (25 -> 8)
```javascript
// === Before (Base: 3369ba9) ===
function runMonthlyAggregation_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const dailySheet = spreadsheet.getSheetByName(MONTHLY_SOURCE_DAILY_SHEET_NAME);
  if (!dailySheet) {
    const error = new Error('Daily sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_SOURCE_DAILY_SHEET_NAME, 'daily_sheet_not_found', error);
    }
    throw error;
  }

  const monthlySheet = spreadsheet.getSheetByName(MONTHLY_TARGET_SHEET_NAME);
  if (!monthlySheet) {
    const error = new Error('Monthly sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_TARGET_SHEET_NAME, 'monthly_sheet_not_found', error);
    }
    throw error;
  }

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || MONTHLY_LOCK_TIMEOUT_MS;
  lock.waitLock(timeoutMs);

  try {
    const lastProcessedRowStr = properties.getProperty(MONTHLY_AGGREGATION_PROPERTIES.lastRow);
    let lastProcessedRow = lastProcessedRowStr ? parseInt(lastProcessedRowStr, 10) : 1;
    if (isNaN(lastProcessedRow) || lastProcessedRow < 1) {
      lastProcessedRow = 1;
    }

    const totalDailyRows = dailySheet.getLastRow();
    if (totalDailyRows <= lastProcessedRow) {
      return {
        processedMonths: 0,
        appendedMonths: 0,
        lastProcessedRow: lastProcessedRow
      };
    }

    const startRow = lastProcessedRow + 1;
    const numRows = totalDailyRows - lastProcessedRow;
    const dailyValues = dailySheet.getRange(startRow, 1, numRows, 12).getValues();

    const now = new Date();
    const currentYearMonth = formatYearMonthTokyo_(now);

    const { monthlyBuckets, lastConfirmedRow } = processMonthlyDataRows_(dailyValues, startRow, currentYearMonth, lastProcessedRow);

    const existingMonthlyDates = getExistingMonthlyDates_(monthlySheet);
    const sortedYearMonths = Array.from(monthlyBuckets.keys()).sort();
    let appendedCount = 0;

    for (let j = 0; j < sortedYearMonths.length; j += 1) {
      const yearMonth = sortedYearMonths[j];
      if (existingMonthlyDates.has(yearMonth)) {
        continue;
      }

      const bucket = monthlyBuckets.get(yearMonth);
      const rowData = buildMonthlyRowData_(yearMonth, bucket);

      if (!rowData) {
        continue;
      }

      monthlySheet.appendRow(rowData);
      appendedCount += 1;
      existingMonthlyDates.add(yearMonth);
    }

    if (lastConfirmedRow > lastProcessedRow) {
      properties.setProperty(MONTHLY_AGGREGATION_PROPERTIES.lastRow, String(lastConfirmedRow));
    }

    const result = {
      processedMonths: sortedYearMonths.length,
      appendedMonths: appendedCount,
      lastProcessedRow: lastConfirmedRow
    };

    try {
      if (typeof runDataArchive_ === 'function') {
        result.archive = runDataArchive_();
      }
    } catch (archiveError) {
      if (typeof logError_ === 'function') {
        logError_('monthly_aggregation', 'DataArchive', 'archive_failed', archiveError);
      }
    }

    return result;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_TARGET_SHEET_NAME, 'aggregation_failed', error);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function processMonthlyDataRows_(dailyValues, startRow, currentYearMonth, lastProcessedRow) {
  const monthlyBuckets = new Map();
  let lastConfirmedRow = lastProcessedRow;

  for (let i = 0; i < dailyValues.length; i += 1) {
    const currentRowNumber = startRow + i;
    const row = dailyValues[i];
    const dateVal = row[0];

    if (!dateVal) {
      continue;
    }

    const rowYearMonth = formatYearMonthTokyo_(dateVal);
    if (!rowYearMonth) {
      continue;
    }

    // Dailyシートは時系列昇順の追記専用（append-only）を前提とする。
    // 当月以降のデータは未確定（月途中）のため集計対象外とし、走査を打ち切る。
    if (currentYearMonth && rowYearMonth >= currentYearMonth) {
      break;
    }

    lastConfirmedRow = currentRowNumber;

    const tempAvg = row[1];
    const tempMin = row[2];
    const tempMax = row[3];
    const humAvg = row[4];
    const humMin = row[5];
    const humMax = row[6];
    const pressAvg = row[7];
    const pressMin = row[8];
    const pressMax = row[9];

    const isValidValues = typeof tempAvg === 'number' && isFinite(tempAvg) &&
      typeof tempMin === 'number' && isFinite(tempMin) &&
      typeof tempMax === 'number' && isFinite(tempMax) &&
      typeof humAvg === 'number' && isFinite(humAvg) &&
      typeof humMin === 'number' && isFinite(humMin) &&
      typeof humMax === 'number' && isFinite(humMax) &&
      typeof pressAvg === 'number' && isFinite(pressAvg) &&
      typeof pressMin === 'number' && isFinite(pressMin) &&
      typeof pressMax === 'number' && isFinite(pressMax);

    if (!isValidValues) {
      continue;
    }

    if (!monthlyBuckets.has(rowYearMonth)) {
      monthlyBuckets.set(rowYearMonth, {
        tempAvgs: [],
        tempMins: [],
        tempMaxs: [],
        humAvgs: [],
        humMins: [],
        humMaxs: [],
        pressAvgs: [],
        pressMins: [],
        pressMaxs: []
      });
    }

    const bucket = monthlyBuckets.get(rowYearMonth);
    bucket.tempAvgs.push(tempAvg);
    bucket.tempMins.push(tempMin);
    bucket.tempMaxs.push(tempMax);
    bucket.humAvgs.push(humAvg);
    bucket.humMins.push(humMin);
    bucket.humMaxs.push(humMax);
    bucket.pressAvgs.push(pressAvg);
    bucket.pressMins.push(pressMin);
    bucket.pressMaxs.push(pressMax);
  }

  return { monthlyBuckets, lastConfirmedRow };
}

// === After (Head: 5f479d2) ===
function openMonthlyAggregationSpreadsheet_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);
  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getMonthlyAggregationSheets_(spreadsheet) {
  const dailySheet = spreadsheet.getSheetByName(MONTHLY_SOURCE_DAILY_SHEET_NAME);
  if (!dailySheet) {
    const error = new Error('Daily sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_SOURCE_DAILY_SHEET_NAME, 'daily_sheet_not_found', error);
    }
    throw error;
  }

  const monthlySheet = spreadsheet.getSheetByName(MONTHLY_TARGET_SHEET_NAME);
  if (!monthlySheet) {
    const error = new Error('Monthly sheet not found');
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_TARGET_SHEET_NAME, 'monthly_sheet_not_found', error);
    }
    throw error;
  }

  return { dailySheet, monthlySheet };
}

function getLastProcessedMonthlyRow_(properties) {
  const lastProcessedRowStr = properties.getProperty(MONTHLY_AGGREGATION_PROPERTIES.lastRow);
  const lastProcessedRow = lastProcessedRowStr ? parseInt(lastProcessedRowStr, 10) : 1;
  if (isNaN(lastProcessedRow) || lastProcessedRow < 1) {
    return 1;
  }
  return lastProcessedRow;
}

function appendMonthlyDataRows_(monthlySheet, monthlyBuckets, existingMonthlyDates) {
  const sortedYearMonths = Array.from(monthlyBuckets.keys()).sort();
  let appendedCount = 0;

  for (let j = 0; j < sortedYearMonths.length; j += 1) {
    const yearMonth = sortedYearMonths[j];
    if (existingMonthlyDates.has(yearMonth)) {
      continue;
    }

    const bucket = monthlyBuckets.get(yearMonth);
    const rowData = buildMonthlyRowData_(yearMonth, bucket);

    if (!rowData) {
      continue;
    }

    monthlySheet.appendRow(rowData);
    appendedCount += 1;
    existingMonthlyDates.add(yearMonth);
  }

  return { sortedYearMonths, appendedCount };
}

function triggerMonthlyDataArchive_(result) {
  try {
    if (typeof runDataArchive_ === 'function') {
      result.archive = runDataArchive_();
    }
  } catch (archiveError) {
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', 'DataArchive', 'archive_failed', archiveError);
    }
  }
}

function runMonthlyAggregation_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = openMonthlyAggregationSpreadsheet_(properties);
  const { dailySheet, monthlySheet } = getMonthlyAggregationSheets_(spreadsheet);

  const lock = LockService.getScriptLock();
  const timeoutMs = (typeof getMergedConfig_ === 'function' && getMergedConfig_().INGEST_LOCK_TIMEOUT_MS) || MONTHLY_LOCK_TIMEOUT_MS;
  lock.waitLock(timeoutMs);

  try {
    const lastProcessedRow = getLastProcessedMonthlyRow_(properties);
    const totalDailyRows = dailySheet.getLastRow();
    if (totalDailyRows <= lastProcessedRow) {
      return {
        processedMonths: 0,
        appendedMonths: 0,
        lastProcessedRow: lastProcessedRow
      };
    }

    const startRow = lastProcessedRow + 1;
    const numRows = totalDailyRows - lastProcessedRow;
    const dailyValues = dailySheet.getRange(startRow, 1, numRows, 12).getValues();

    const now = new Date();
    const currentYearMonth = formatYearMonthTokyo_(now);

    const { monthlyBuckets, lastConfirmedRow } = processMonthlyDataRows_(dailyValues, startRow, currentYearMonth, lastProcessedRow);

    const existingMonthlyDates = getExistingMonthlyDates_(monthlySheet);
    const { sortedYearMonths, appendedCount } = appendMonthlyDataRows_(monthlySheet, monthlyBuckets, existingMonthlyDates);

    if (lastConfirmedRow > lastProcessedRow) {
      properties.setProperty(MONTHLY_AGGREGATION_PROPERTIES.lastRow, String(lastConfirmedRow));
    }

    const result = {
      processedMonths: sortedYearMonths.length,
      appendedMonths: appendedCount,
      lastProcessedRow: lastConfirmedRow
    };

    triggerMonthlyDataArchive_(result);

    return result;
  } catch (error) {
    if (typeof logError_ === 'function') {
      logError_('monthly_aggregation', MONTHLY_TARGET_SHEET_NAME, 'aggregation_failed', error);
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function isValidMonthlyRow_(row) {
  for (let idx = 1; idx <= 9; idx += 1) {
    const val = row[idx];
    if (typeof val !== 'number' || !isFinite(val)) {
      return false;
    }
  }
  return true;
}

function accumulateMonthlyRow_(bucket, row) {
  bucket.tempAvgs.push(row[1]);
  bucket.tempMins.push(row[2]);
  bucket.tempMaxs.push(row[3]);
  bucket.humAvgs.push(row[4]);
  bucket.humMins.push(row[5]);
  bucket.humMaxs.push(row[6]);
  bucket.pressAvgs.push(row[7]);
  bucket.pressMins.push(row[8]);
  bucket.pressMaxs.push(row[9]);
}

function processMonthlyDataRows_(dailyValues, startRow, currentYearMonth, lastProcessedRow) {
  const monthlyBuckets = new Map();
  let lastConfirmedRow = lastProcessedRow;

  for (let i = 0; i < dailyValues.length; i += 1) {
    const currentRowNumber = startRow + i;
    const row = dailyValues[i];
    const dateVal = row[0];

    if (!dateVal) {
      continue;
    }

    const rowYearMonth = formatYearMonthTokyo_(dateVal);
    if (!rowYearMonth) {
      continue;
    }

    // Dailyシートは時系列昇順の追記専用（append-only）を前提とする。
    // 当月以降のデータは未確定（月途中）のため集計対象外とし、走査を打ち切る。
    if (currentYearMonth && rowYearMonth >= currentYearMonth) {
      break;
    }

    lastConfirmedRow = currentRowNumber;

    if (!isValidMonthlyRow_(row)) {
      continue;
    }

    if (!monthlyBuckets.has(rowYearMonth)) {
      monthlyBuckets.set(rowYearMonth, {
        tempAvgs: [],
        tempMins: [],
        tempMaxs: [],
        humAvgs: [],
        humMins: [],
        humMaxs: [],
        pressAvgs: [],
        pressMins: [],
        pressMaxs: []
      });
    }

    const bucket = monthlyBuckets.get(rowYearMonth);
    accumulateMonthlyRow_(bucket, row);
  }

  return { monthlyBuckets, lastConfirmedRow };
}
```

### 9.6 DataArchive.gs: `runDataArchive_` (18 -> 4)
```javascript
// === Before (Base: 3369ba9) ===
function runDataArchive_() {
  const properties = PropertiesService.getScriptProperties();
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : { ARCHIVE_RETENTION_MONTHS: 2 };

  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);

  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration for archive');
    if (typeof logError_ === 'function') {
      logError_('data_archive', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

  const sourceSheet = getRawDataSheet_(spreadsheet, properties);

  if (!sourceSheet) {
    const error = new Error('Source raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('data_archive', 'SourceSheet', 'sheet_not_found', error);
    }
    throw error;
  }

  const retentionMonths = typeof config.ARCHIVE_RETENTION_MONTHS === 'number' ? config.ARCHIVE_RETENTION_MONTHS : 2;
  const now = new Date();

  const thresholdDate = getArchiveThresholdDate_(now, retentionMonths);

  const archiveSpreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.archiveSpreadsheetId) || 'ARCHIVE_SPREADSHEET_ID';
  const archiveSpreadsheetId = properties.getProperty(archiveSpreadsheetIdKey) || spreadsheetId;
  const archiveSpreadsheet = SpreadsheetApp.openById(archiveSpreadsheetId);

  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) {
    return { status: 'skipped', reason: 'no_data' };
  }

  const maxRowsToRead = lastRow - 1;
  const values = sourceSheet.getRange(2, 1, maxRowsToRead, sourceSheet.getLastColumn()).getValues();

  const groupedData = groupDataForArchive_(values, thresholdDate);

  let totalArchived = 0;

  if (groupedData.size === 0) {
    return { status: 'skipped', reason: 'no_target_data', thresholdDate: thresholdDate.toISOString() };
  }

  const sortedYearMonths = Array.from(groupedData.keys()).sort();

  for (let i = 0; i < sortedYearMonths.length; i++) {
    const yearMonth = sortedYearMonths[i];
    const rows = groupedData.get(yearMonth);

    const targetSheetName = 'Raw_' + yearMonth.replace('-', '');
    let targetSheet = archiveSpreadsheet.getSheetByName(targetSheetName);

    if (!targetSheet) {
      targetSheet = archiveSpreadsheet.insertSheet(targetSheetName);
      targetSheet.appendRow(['timestamp', 'temp', 'press', 'hum', 'flag']);
    }

    const startRow = targetSheet.getLastRow() + 1;
    targetSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    // Verify
    const verifyRange = targetSheet.getRange(startRow, 1, rows.length, 1).getValues();
    if (verifyRange.length !== rows.length) {
      const error = new Error(`Verification failed for ${yearMonth}. Expected ${rows.length} rows, got ${verifyRange.length}`);
      if (typeof logError_ === 'function') {
        logError_('data_archive', targetSheetName, 'verify_failed', error);
      }
      throw error;
    }

    totalArchived += rows.length;
  }

  // Purge
  sourceSheet.deleteRows(2, totalArchived);

  return {
    status: 'success',
    archivedRows: totalArchived,
    monthsArchived: sortedYearMonths,
    thresholdDate: thresholdDate.toISOString()
  };
}

// === After (Head: 5f479d2) ===
function writeToArchiveSheets_(archiveSpreadsheet, groupedData, sortedYearMonths) {
  let totalArchived = 0;

  for (let i = 0; i < sortedYearMonths.length; i++) {
    const yearMonth = sortedYearMonths[i];
    const rows = groupedData.get(yearMonth);

    const targetSheetName = 'Raw_' + yearMonth.replace('-', '');
    let targetSheet = archiveSpreadsheet.getSheetByName(targetSheetName);

    if (!targetSheet) {
      targetSheet = archiveSpreadsheet.insertSheet(targetSheetName);
      targetSheet.appendRow(['timestamp', 'temp', 'press', 'hum', 'flag']);
    }

    const startRow = targetSheet.getLastRow() + 1;
    targetSheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    // Verify
    const verifyRange = targetSheet.getRange(startRow, 1, rows.length, 1).getValues();
    if (verifyRange.length !== rows.length) {
      const error = new Error(`Verification failed for ${yearMonth}. Expected ${rows.length} rows, got ${verifyRange.length}`);
      if (typeof logError_ === 'function') {
        logError_('data_archive', targetSheetName, 'verify_failed', error);
      }
      throw error;
    }

    totalArchived += rows.length;
  }

  return totalArchived;
}

function getArchiveSpreadsheets_(properties) {
  const spreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.spreadsheetId) || 'SPREADSHEET_ID';
  const spreadsheetId = properties.getProperty(spreadsheetIdKey);

  if (!spreadsheetId) {
    const error = new Error('missing spreadsheet configuration for archive');
    if (typeof logError_ === 'function') {
      logError_('data_archive', 'Config', 'missing_spreadsheet_id', error);
    }
    throw error;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = getRawDataSheet_(spreadsheet, properties);

  if (!sourceSheet) {
    const error = new Error('Source raw data sheet not found');
    if (typeof logError_ === 'function') {
      logError_('data_archive', 'SourceSheet', 'sheet_not_found', error);
    }
    throw error;
  }

  const archiveSpreadsheetIdKey = (typeof SCRIPT_PROPERTY_KEYS !== 'undefined' && SCRIPT_PROPERTY_KEYS.archiveSpreadsheetId) || 'ARCHIVE_SPREADSHEET_ID';
  const archiveSpreadsheetId = properties.getProperty(archiveSpreadsheetIdKey) || spreadsheetId;
  const archiveSpreadsheet = SpreadsheetApp.openById(archiveSpreadsheetId);

  return { sourceSheet, archiveSpreadsheet };
}

function getArchiveRetentionMonths_(config) {
  return typeof config.ARCHIVE_RETENTION_MONTHS === 'number' ? config.ARCHIVE_RETENTION_MONTHS : 2;
}

function runDataArchive_() {
  const properties = PropertiesService.getScriptProperties();
  const config = typeof getMergedConfig_ === 'function' ? getMergedConfig_() : { ARCHIVE_RETENTION_MONTHS: 2 };
  const { sourceSheet, archiveSpreadsheet } = getArchiveSpreadsheets_(properties);

  const retentionMonths = getArchiveRetentionMonths_(config);
  const now = new Date();
  const thresholdDate = getArchiveThresholdDate_(now, retentionMonths);

  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) {
    return { status: 'skipped', reason: 'no_data' };
  }

  const maxRowsToRead = lastRow - 1;
  const values = sourceSheet.getRange(2, 1, maxRowsToRead, sourceSheet.getLastColumn()).getValues();

  const groupedData = groupDataForArchive_(values, thresholdDate);

  if (groupedData.size === 0) {
    return { status: 'skipped', reason: 'no_target_data', thresholdDate: thresholdDate.toISOString() };
  }

  const sortedYearMonths = Array.from(groupedData.keys()).sort();
  const totalArchived = writeToArchiveSheets_(archiveSpreadsheet, groupedData, sortedYearMonths);

  // Purge
  sourceSheet.deleteRows(2, totalArchived);

  return {
    status: 'success',
    archivedRows: totalArchived,
    monthsArchived: sortedYearMonths,
    thresholdDate: thresholdDate.toISOString()
  };
}
```

### 9.7 Config.gs: `getSheetConfig_` (19 -> 8)
```javascript
// === Before (Base: 3369ba9) ===
function getSheetConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    return {};
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const configSheet = spreadsheet.getSheetByName('Config');
  if (!configSheet) {
    return {};
  }
  const values = configSheet.getDataRange().getValues();
  const config = {};

  if (values.length === 0) {
    return config;
  }

  const header = values[0];
  const firstHeader = String(header[0] || '').trim().toLowerCase();
  const secondHeader = String(header[1] || '').trim().toLowerCase();

  // Backward-compatible vertical format: key | value, one setting per row.
  if (firstHeader === 'key' && secondHeader === 'value') {
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const key = row[0];
      const value = row[1];
      if (key && value !== undefined && value !== null && value !== '') {
        config[String(key).trim()] = String(value);
      }
    }
    return config;
  }

  // Documented horizontal format: setting names in row 1, values below them.
  for (let column = 0; column < header.length; column += 1) {
    const key = header[column];
    if (!key) {
      continue;
    }
    for (let row = 1; row < values.length; row += 1) {
      const value = values[row][column];
      if (value !== undefined && value !== null && value !== '') {
        config[String(key).trim()] = String(value);
        break;
      }
    }
  }
  return config;
}

// === After (Head: 5f479d2) ===
function parseVerticalSheetConfig_(values) {
  const config = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const key = row[0];
    const value = row[1];
    if (key && value !== undefined && value !== null && value !== '') {
      config[String(key).trim()] = String(value);
    }
  }
  return config;
}

function parseHorizontalSheetConfig_(header, values) {
  const config = {};
  for (let column = 0; column < header.length; column += 1) {
    const key = header[column];
    if (!key) {
      continue;
    }
    for (let row = 1; row < values.length; row += 1) {
      const value = values[row][column];
      if (value !== undefined && value !== null && value !== '') {
        config[String(key).trim()] = String(value);
        break;
      }
    }
  }
  return config;
}

function getSheetConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId);
  if (!spreadsheetId) {
    return {};
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const configSheet = spreadsheet.getSheetByName('Config');
  if (!configSheet) {
    return {};
  }
  const values = configSheet.getDataRange().getValues();
  if (values.length === 0) {
    return {};
  }

  const header = values[0];
  const firstHeader = String(header[0] || '').trim().toLowerCase();
  const secondHeader = String(header[1] || '').trim().toLowerCase();

  // Backward-compatible vertical format: key | value, one setting per row.
  if (firstHeader === 'key' && secondHeader === 'value') {
    return parseVerticalSheetConfig_(values);
  }

  // Documented horizontal format: setting names in row 1, values below them.
  return parseHorizontalSheetConfig_(header, values);
}
```

---

## 10. ESLint Configuration

### 10.1 設定ファイル差分
- **`eslint.config.js`** (新規作成):
```javascript
module.exports = [{rules: {complexity: ["warn", 10]}}];
```
- **`package.json`** の差分:
```diff
   "scripts": {
     "test": "jest",
-    "test:coverage": "jest --coverage"
+    "test:coverage": "jest --coverage",
+    "lint": "eslint gas/ --ext .js,.gs"
   },
   "devDependencies": {
+    "eslint": "^10.9.1",
     "jest": "^30.5.0"
   }
```

### 10.2 コミット履歴に見る `eslint-disable` の変遷
1. **コミット 1 (`a042d28`)**: ESLint Flat Config (`complexity: ["warn", 10]`) を導入。`Config.gs` のみリファクタリング。
2. **コミット 2 (`9a6e598`)**: `Metrics.gs`, `Monitor.gs`, `Router.gs` を部分的にリファクタリングする一方、未着手だった `DailyAggregation.gs`, `DataArchive.gs`, `DebugTest.gs`, `Ingest.gs`, `LineBot.gs`, `MonthlyAggregation.gs` の先頭に `/* eslint-disable complexity */` を付与して CI を一時通過。
3. **コミット 3 (`5f479d2`)**: 全ての `/* eslint-disable complexity */` コメントを完全撤廃し、対象ファイルを徹底的にヘルパー分割して、全ファイルで ESLint 警告ゼロ（complexity <= 10）を達成。

現在、`grep -R "eslint-disable.*complexity" gas/` の実行結果は **0 件（検出なし）** です。

---

## 11. GAS / Jest Compatibility

本プロジェクトは Google Apps Script（GAS）環境で動作する `.gs` ファイルを、Node.js 上の Jest で単体テストしています。

### 11.1 `typeof module !== 'undefined'` による保護
すべての新設ヘルパー関数は、ファイル末尾の以下のガード句内部で `module.exports` に追加されています：
```javascript
if (typeof module !== 'undefined') {
  module.exports = {
    // 新設ヘルパー関数群
  };
}
```
- **GAS 実行環境**: `module` が未定義のため、このブロックはスキップされ、関数宣言のみが GAS のグローバルスコープに登録されます。
- **Jest 実行環境**: `module.exports` が有効になり、各テストファイルからヘルパー関数を直接 import してテスト可能になっています。

### 11.2 重複 export の解消
コミット 2 で `Metrics.gs` に一部関数の export 重複が発生していましたが、コミット 3 で重複が解消され、全ファイルの export リストが整理されています。

---

## 12. JST / Date Handling

日付・時刻処理に関する変更点およびリスク評価です。

### 12.1 `formatDateTokyo_` の分割 (`DailyAggregation.gs`)
- **入力判定**: `parseDateInput_` に切り出され、`Date` インスタンス判定と `yyyy-MM-dd` 短絡文字列の抽出を実施。
- **タイムゾーン変換**: GAS 環境では `Utilities.formatDate(date, "Asia/Tokyo", targetFormat)` を使用。
- **フォールバック**: Node.js/Jest 環境では `formatTokyoFallback_` を使用し、`getTime() + 9 * 3600 * 1000`（UTC+9時間）オフセットを加算して `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()` 等で成形。
- **リスク評価**:
  - 年末年始（12/31〜1/1）や月末（2/28、うるう年）における境界値計算ロジックは Before と完全に一致。
  - `Date` のミリ秒加算方式も同一のため、タイムゾーン起因の挙動変化はありません。

---

## 13. Business Logic Risk

主要なビジネスロジックについて、Before / After の等価性を精査した結果です。

| 領域 | 対象ファイル | 判定 | 精査結果 |
| :--- | :--- | :---: | :--- |
| **Ingest** | `Ingest.gs` | **変更なし (等価)** | センサ値の範囲チェック、180秒重複ウィンドウ判定、Watchdogリセット、異常値フラグ書き込み、Line通知呼び出しの順序と例外捕捉が完全に維持されています。 |
| **Metrics** | `Metrics.gs` | **変更なし (等価)** | 異常値ガード（-10〜50℃、0〜100%）、SNOOZE判定、閾値判定、1時間クールダウン判定、日次最大5回上限判定の優先度・短絡評価（early return）の順序が完全に同一です。 |
| **Monitor** | `Monitor.gs` | **変更なし (等価)** | Watchdogのタイムアウト判定（4320分＝3日間）、多重通知防止フラグ（watchdogNotified）の管理、アラート通知時のカウント加算とタイムスタンプ記録が完全に維持されています。 |
| **Router / LineBot** | `Router.gs`, `LineBot.gs` | **変更なし (等価)** | LINE Webhook 署名ヘッダーの取得優先度、HMAC-SHA256 署名検証、コマンドルーティング（NOW/SNOOZE/TRENDS/CLEAR/HELP）、排他ロック（LockService）の取得・解放が完全に維持されています。 |
| **Aggregation** | `DailyAggregation.gs`, `MonthlyAggregation.gs` | **変更なし (等価)** | 二重集計防止（既存日付スキップ）、anomaly フラグ行の除外、平均値丸め（小数点以下2桁）、処理済み最終行（lastProcessedRow）の進捗管理が完全に同一です。 |
| **DataArchive** | `DataArchive.gs` | **変更なし (等価)** | 保持期間（2ヶ月）以前のデータ抽出、シート作成（Raw_YYYYMM）、書き込み件数の整合性検証（verify）、元シートからの削除（deleteRows）の挙動が完全に維持されています。 |

> [!NOTE]
> 115件の既存 Jest テストスイートがすべてパスしており、自動テストの観点でも挙動の非互換性は検出されていません。

---

## 14. Potential Over-Refactoring（過剰リファクタリングの評価論点）

Gemini 3.1 Pro がコードレビューを行うにあたり、**最も慎重に評価すべき「Helper 過多・過剰抽象化」の具体的論点** です。

### 14.1 「単なる数行ヘルパー」の一覧（過剰抽象化の疑いがある関数群）

以下のヘルパーは行数が 3〜7 行と極めて短く、呼び出し箇所が 1 箇所しかない、または処理内容が単純な getter / 一行比較です。

| File | Helper | 行数 | 呼び出し元 | 実装内容 | 議論のポイント |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `gas/Monitor.gs` | `buildWatchdogResult_` | 3 | `runWatchdogCheck_`, `evaluateWatchdogTimeout_` | `return { timeout, notified, notification, elapsedMinutes };` | 単なるオブジェクトリテラルの生成。関数化の価値があるか？ |
| `gas/DataArchive.gs` | `getArchiveRetentionMonths_` | 3 | `runDataArchive_` | `return typeof config.ARCHIVE_RETENTION_MONTHS === 'number' ? config.ARCHIVE_RETENTION_MONTHS : 2;` | 1行のプロパティ参照とデフォルト値フォールバック。独立関数として必要か？ |
| `gas/LineBot.gs` | `formatStatusTemperature_` | 4 | `formatStatusMeasurements_` | `return isTempAlert ? `${tempVal.toFixed(1)} ℃ (⚠️ 超過)` : `${tempVal.toFixed(1)} ℃ (正常)`;` | `formatStatusMeasurements_` の中にインラインで残すべきではなかったか？ |
| `gas/LineBot.gs` | `formatStatusHumidity_` | 4 | `formatStatusMeasurements_` | `return isHumAlert ? `${Math.round(humVal)} % (⚠️ 多湿)` : `${Math.round(humVal)} % (正常)`;` | 同上。 |
| `gas/Metrics.gs` | `isTemperatureAnomaly_` | 5 | `isSensorAnomaly_` | `return temp < minTemp || temp > maxTemp;` | `isSensorAnomaly_` の中にインラインで書けば済むのではないか？ |
| `gas/Metrics.gs` | `isHumidityAnomaly_` | 5 | `isSensorAnomaly_` | `return hum < minHum || hum > maxHum;` | 同上。 |
| `gas/Metrics.gs` | `isCooldownActive_` | 6 | `evaluateAlertDecision_` | `return !isNaN(lastSentMs) && (nowMs - lastSentMs) < cooldownMs;` | 独立したビジネス概念として名前が付くメリット vs 関数ジャンプの認知負荷。 |
| `gas/Metrics.gs` | `isDailyLimitReached_` | 6 | `evaluateAlertDecision_` | `return count >= maxDailyCount;` | 同上。 |
| `gas/Router.gs` | `isLineWebhookRequest_` | 5 | `doPost` | `return hasLineHeader || isLinePayload;` | `doPost` の complexity を 6 に下げるためだけに分離された疑い。 |
| `gas/Router.gs` | `hasLineSignatureHeader_` | 6 | `isLineWebhookRequest_` | ヘッダー存在確認 | `isLineWebhookRequest_` からしか呼ばれず、2段階の関数ジャンプが発生。 |

### 14.2 深いコールチェーン（Call Chain Depth）
- **LineBot.gs**:
  `handleLineWebhook_` -> `dispatchLineEvents_` -> `handleTextMessageEvent_` -> `dispatchTextMessageCommand_` -> `buildStatusFlexMessage_` -> `formatStatusMeasurements_` -> `formatStatusTemperature_`
  - **深さ 7 階層** に達しており、デバッグ時にブレークポイントを置く位置や、関数間の引数リレー（引数の受け渡し）の追跡が複雑化している可能性があります。
- **Metrics.gs**:
  `evaluateAlertDecision_` -> `isSensorAnomaly_` -> `isTemperatureAnomaly_`
  - 単純な 1 つの if 文が 3 階層に分散しています。

### 14.3 認知的負荷のトレードオフ
- **肯定的な見方 (Approve 視点)**:
  - 各関数の単一責任（SRP）が明確になり、関数の行数が 30 行前後に収まり見通しが良い。
  - `isCooldownActive_` や `isSensorAnomaly_` などの述語関数に名前がついたことで、ドメインの意図が自己文書化（self-documenting）されている。
  - 個別の関数を Jest から単体テスト可能（ユニットテストの自由度向上）。
- **批判的な見方 (Request Changes 視点)**:
  - ESLint の complexity 制限（10）を形式的にパスさせるため、本質的に一体であるべき処理（温度・湿度の範囲判定など）まで機械的に細分化されている。
  - 1 画面に収まるはずの処理フローを理解するために、何個もの関数定義を行き来（跳躍）しなければならず、開発者の短期記憶への負荷（認知負荷）が増大している。

---

## 15. Questions for Gemini

Gemini 3.1 Pro は、本資料のコードと分析に基づき、以下の 11 の論点について明確な見解を示してレビューを実施してください：

1. **complexity 削減は本当に設計改善につながっているか？**
   - 単に complexity 数値を 10 以下にするための形式的なハックになっていないか。
2. **helper を増やしすぎていないか？**
   - 新規 74 個のヘルパー追加は、この規模の GAS プロジェクトに対して過剰ではないか。
3. **Before より After の方が理解しやすいか？**
   - 新しい開発者がこのコードベースを読んだとき、After の方が処理の流れを追いやすいか、それとも Before の方が一連の流れを素直に把握しやすいか。
4. **helper の粒度は適切か？**
   - 3〜6行のヘルパー（`buildWatchdogResult_`, `formatStatusTemperature_`, `isTemperatureAnomaly_` 等）は独立した関数として妥当か、インラインに戻すべきか。
5. **call chain が深くなっていないか？**
   - LineBot の 7 階層の呼び出しチェーンは許容範囲か。
6. **complexity を単に関数間へ移動しただけではないか？**
   - 本質的な複雑さが解消されたのか、ただ分散されただけなのか。
7. **PR の変更範囲は適切か？**
   - 10 個のファイルすべてを 1 つの PR で一括リファクタリングしたスコープは妥当か。
8. **business logic が変わっていないか？**
   - 潜在的なリグレッションやエッジケースの挙動変化がないか。
9. **GAS / Jest compatibility に問題がないか？**
   - `module.exports` ガードや GAS グローバル空間の汚染リスクはないか。
10. **JST / date 処理に問題がないか？**
    - タイムゾーン計算や日付境界処理にリスクがないか。
11. **総合判定：main へマージすべきか？**
    - **Approve** (このままマージ) すべきか、それとも **Request Changes** (ヘルパーの再統合や過剰分割の是正を要求) すべきか。

---

## 16. Objective Review Request

Gemini 3.1 Pro への依頼要領：

- **無批判な Approve を避けてください。**
- 「ESLintの警告が消えた」「テストが通っている」という外形的事実にとらわれず、**「可読性」「保守性」「認知的負荷」「過剰設計（Over-engineering）」** の観点から、コードそのものを厳しく批評してください。
- **「この PR を Approve する理由」** だけでなく、**「Request Changes にすべき理由（差し戻して改善させるべき理由）」** を積極的に提示してください。
- もし過剰分割と判断される関数がある場合は、具体的にどの関数を親関数に再統合（inline 化）すべきかを指摘してください。

---

## 17. Review Result & Final Recommendation (Gemini 3.1 Pro)

### レビュー判定
**APPROVE WITH MINOR CONCERNS (マージ承認・軽微な懸念あり)**

### 講評・判断理由
> ESLintの数値を下げるためだけに機械的に抽出された過剰なマイクロ関数（`buildWatchdogResult_` 等）は散見されますが、それらが引き起こす認知負荷の微増よりも、`LineBot.gs` や `Metrics.gs` の巨大なFat関数が解体され、純粋関数としてテスト可能な単位に分割されたことによる「保守性・可読性の向上メリット」の方が遥かに上回っています。
>
> 現状のコードはBeforeと比較して明確にシステム全体として改善されているため、マージをブロックする必要はありません。指摘した過剰抽象化の関数については、今後のリファクタリングや機能追加の際にインライン化して再統合することをお勧めします。

### 今後のフォローアップ事項
- 本リファクタリングで機械的に抽出された以下のマイクロヘルパー群については、今後の機能改修やメンテナンス時に親関数へのインライン化・再統合を検討する：
  - `gas/Monitor.gs`: `buildWatchdogResult_` (単なるオブジェクトリテラル返却)
  - `gas/DataArchive.gs`: `getArchiveRetentionMonths_` (単純なプロパティ取得)
  - `gas/LineBot.gs`: `formatStatusTemperature_`, `formatStatusHumidity_` (単一行の三項演算子成形)
  - `gas/Metrics.gs`: `isTemperatureAnomaly_`, `isHumidityAnomaly_` (単一比較式)
  - `gas/Router.gs`: `isLineWebhookRequest_`, `hasLineSignatureHeader_` (呼び出しチェーンの浅化)
