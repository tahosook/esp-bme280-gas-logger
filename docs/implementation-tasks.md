# 実装タスク一覧

本一覧は `docs/implementation-roadmap.md` の Phase 7 以降（決定 / 実装 / 検証）に沿ってタスクを整理する。
1タスク = 1コミット を基本とする。未決の値は決定タスクで確定するまで実装しない（Phase 7 / 10 / 14 / 15 / 17 / 18 の主要値は決定済み）。

---

## 決定タスク（Phase 7 / 10 / 14 / 15 は決定済み）

### 決定T1（Phase 7）：DATAシート列・シート名・重複判定窓の確定（✅ 決定済み）
- 決定値: シート名 `DATA`／列追加は見送り（`flag` は監視実装時・`device_id` は複数台化時）／重複時間窓 **180秒**／日時は **Date値＋表示形式**
- 対象: `docs/architecture.md`、`docs/api-contract.md`
- 状態: 決定済み（2026-08-11）

### 決定T2（Phase 10）：監視仕様の確定（✅ 決定済み）
- 決定値: 閾値 気温30.0℃/湿度70%/簡易暑さ指数（DI）80.0／平滑化 **K=2連続超過**／ヒステリシス 気温0.5℃・湿度5%・簡易0.5／異常値変化量 気温±5.0℃・湿度±30%・気圧±20hPa
- 対象: `docs/architecture.md`
- 状態: 決定済み（2026-08-11）

### 決定T3（Phase 14）：簡易暑さ指数の名称と計算式（✅ 決定済み）
- 決定値: 名称 **「簡易暑さ指数」**／計算式は **不快指数（DI）**
- 対象: `docs/architecture.md`、`docs/api-contract.md`
- 状態: 決定済み（2026-08-11）

### 決定T4（Phase 15）：Configシート採用（✅ 決定済み）
- 決定値: **Configシートを採用（ハイブリッド）**。秘密/コード寄り=Script Properties、季節調整値=Configシート
- 対象: `docs/architecture.md`、`docs/deployment.md`
- 状態: 決定済み（2026-08-11）

---

## 実装タスク（✅ 全完了）

### 実装T1（Phase 8）：Router/Ingest 分割と重複排除（✅ 完了）
- 対象: `gas/Router.gs`、`gas/Ingest.gs`
- 状態: 完了（PR #18 / #19）

### 実装T2（Phase 11）：Monitor.gs（✅ 完了）
- 対象: `gas/Monitor.gs`
- 状態: 完了（PR #19）

### 実装T3（Phase 12）：LineBot.gs（✅ 完了）
- 対象: `gas/LineBot.gs`
- 状態: 完了（PR #23）

### 実装T4（Phase 15）：Config/ErrorLog と DailyAggregation（✅ 完了）
- 対象: `gas/Config.gs`、`gas/ErrorLog.gs`、`gas/DailyAggregation.gs`
- 状態: 完了（PR #20）

### 実装T5（Phase 17）：センサー未受信ウォッチドッグ（✅ 完了）
- 対象: `gas/Monitor.gs`
- 状態: 完了（PR #21）

### 実装T6（Phase 18）：月次ロールアップ（✅ 完了）
- 対象: `gas/MonthlyAggregation.gs`
- 状態: 完了（PR #22）

※#15 device_id 実運用は見送り（保留）。列追加・複数台運用は当面実施しない。

---

## 検証タスク（✅ 全完了）

検証結果記録: [test-results/2026-08-30-phase-13-18-validation.md](test-results/2026-08-30-phase-13-18-validation.md)

### 検証T1（Phase 9）：重複排除の実機・API検証（✅ 完了）
- 状態: ユニットテストおよび実機POSTにて検証完了

### 検証T2（Phase 13）：LINE操作と通知（✅ 完了）
- 状態: 実機LINEアプリからの状況・スキップ・クリア・ヘルプおよびPushテスト完了

### 検証T3（Phase 16）：Daily集計（✅ 完了）
- 状態: 自動集計および単体テスト完了

### 検証T4（Phase 19）：ウォッチドッグ・月次ロールアップ（✅ 完了）
- 状態: aggregateMonthly手動実行およびウォッチドッグ単体・自動化設定完了

---

## リファクタリングタスク（Phase 20〜26）

`v1.1.0-stable` および LINE Bot 翌朝8:00スキップ機能（PR #24）の仕様・外部動作を完全に維持した内部品質改善タスク。

### 決定TR1（Phase 20）：リファクタリング方針と不変条件の確定（✅ 完了）
- 対象: `docs/architecture.md`、`docs/implementation-roadmap.md`、`docs/implementation-tasks.md`
- 内容: Baseline（v1.1.0 + PR #24）の確定、依存関係マップ作成、外部仕様変更なしの不変条件合意
- 状態: 完了（コミット `bcc3a0d`）

### 実装TR1（Phase 21）：低リスクな共通ユーティリティの集約（✅ 完了）
- 対象: `gas/DailyAggregation.gs`、`gas/MonthlyAggregation.gs`、`gas/Config.gs`
- 内容: 重複している `calcAvg_`, `roundTwoDecimals_`, `formatDateTokyo_` を一元化
- 状態: 完了（コミット `a0904dd`）

### 実装TR2（Phase 22）：Config 整理と定数参照の一元化（✅ 完了）
- 対象: `gas/Config.gs`、`gas/Router.gs`、`gas/Ingest.gs`、`gas/Monitor.gs`
- 内容: `CONFIG_KEYS` / `SCRIPT_PROPERTY_KEYS` の集約、`Ingest.gs` などのハードコード値を `getMergedConfig_()` 経由に統一
- 状態: 完了（コミット `f456a5c`）

### 実装TR3（Phase 23）：LINE 送信共通化と暗黙的依存の整理（✅ 完了）
- 対象: `gas/LineBot.gs`、`gas/ErrorLog.gs`、`gas/Ingest.gs`
- 内容: `replyMessage_` / `pushMessage_` の共通HTTP送信処理抽出、過剰な `typeof` ガードの整理
- 状態: 完了（コミット `74c992d`）

### 実装TR4（Phase 24）：Monitor 内部の純粋ロジックと永続化I/Oの境界明確化（✅ 完了）
- 対象: `gas/Monitor.gs`
- 内容: 条件評価・ヒステリシス状態遷移・異常値判定・通知文生成（純粋ロジック）と Properties 永続化（I/O）の分離
- 状態: 完了（コミット `eaa3ed7`）

### 実装TR5（Phase 25）：Daily / Monthly Aggregation の集計ロジック純粋関数化（✅ 完了）
- 対象: `gas/DailyAggregation.gs`、`gas/MonthlyAggregation.gs`
- 内容: 行データ配列からの日次・月次集計計算を純粋関数化し、Spreadsheet I/O・Lock処理と分離
- 状態: 完了（コミット `f70b207`）

### 検証TR1（Phase 26）：全自動テスト・ドキュメント整合性確認（✅ 完了）
- 対象: `scripts/*`、`docs/*`、`README.md`
- 内容: 全自動テスト（全単体テストスクリプト）の実行・差分レビュー・ドキュメント整合性確認
- 状態: 完了

---

## LINE Bot UI 近代化・QuickChart グラフ返信タスク（Phase 27〜29）

### 実装UI1（Phase 27）：LINE Bot UI 近代化と Flex Message 対応（✅ 完了）
- 対象: `gas/LineBot.gs`、`gas/Metrics.gs`、`gas/Config.gs`、`docs/line-bot-ui.md`
- 内容: NOW/SNOOZE/CLEAR/TRENDS コマンド体系、DIバッジ・容積絶対湿度・スヌーズ停止期限の Flex Message カード化、5段階アラート優先度制御（クールダウン・1日上限・センサーガード）
- 状態: 完了（PR #26, #27）

### 実装UI2（Phase 28）：QuickChart による直近24h温湿度推移グラフ画像生成（✅ 完了）
- 対象: `gas/Metrics.gs`、`gas/LineBot.gs`、`docs/line-bot-ui.md`
- 内容: `buildQuickChartUrl()` 実装、288点データの間引き（約30点）・X軸ラベル最適化による LINE 2,000文字制限クリア、データ不足時フォールバック
- 状態: 完了（PR #26, #28）

### 検証UI1（Phase 29）：手動デバッグ関数とテストスイート拡充（✅ 完了）
- 対象: `gas/DebugTest.gs`、`scripts/test-metrics.js`、`scripts/test-line-bot.js`、`docs/deployment.md`
- 内容: GAS エディタでのワンクリック検証関数（`debugTest_buildQuickChartUrl`, `debugTest_handleLineWebhook_Trends`）、全9本の単体テスト全件通過確認
- 状態: 完了（PR #28）

---

## テスト基盤近代化・生データアーカイブ・ESLint複雑度管理タスク（Phase 30〜34）

### 実装T7（Phase 30）：GASバックエンドアーキテクチャのモジュール依存関係整理（✅ 完了）
- 対象: `gas/*`
- 内容: GASバックエンド全体のモジュール責務と依存関係の整理
- 状態: 完了（PR #31）

### 実装・検証T8（Phase 31）：Jest テストスイート移行および CI 自動化（✅ 完了）
- 対象: `package.json`、`jest.config.js`、`tests/*`、`.github/workflows/ci.yml`
- 内容: レガシーな検証スクリプト群から Jest 単体テストスイートへの移行、GitHub Actions での `npm run test:coverage` によるカバレッジ閾値の自動検証
- 状態: 完了（PR #32）

### 実装UI3（Phase 32）：SNOOZE カードの最小化と datetimepicker UI（✅ 完了）
- 対象: `gas/LineBot.gs`、`docs/line-bot-ui.md`
- 内容: SNOOZE カードの UI をコンパクト化し、LINE の datetimepicker アクションによる柔軟なスヌーズ日時設定をサポート
- 状態: 完了（PR #33）

### 実装・検証T9（Phase 33）：生データの自動アーカイブ・パージ（✅ 完了）
- 対象: `gas/DataArchive.gs`、`gas/MonthlyAggregation.gs`、`gas/Config.gs`、`tests/archive.test.js`
- 内容: 直近2ヶ月以前の生データを別シート（`Raw_YYYYMM`）または外部スプレッドシートへ退避・パージする月次アーカイブ処理の実装、`RawData` へのフォールバック対応
- 状態: 完了（PR #34）

### 実装・リファクタリングT10（Phase 34）：ESLint 循環的複雑度管理とマイクロヘルパー集約（✅ 完了）
- 対象: `eslint.config.js`、`gas/*.gs`
- 内容: ESLint の complexity ルール導入（PR #36）、閾値を 12 に調整した上で、不要に細分化されたマイクロヘルパーを凝集度の高いドメイン処理へ集約・コールチェーンを平坦化（PR #37）
- 状態: 完了（PR #36, #37）
