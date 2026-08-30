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

### 決定TR1（Phase 20）：リファクタリング方針と不変条件の確定（⏳ 進行中）
- 対象: `docs/architecture.md`、`docs/implementation-roadmap.md`、`docs/implementation-tasks.md`
- 内容: Baseline（v1.1.0 + PR #24）の確定、依存関係マップ作成、外部仕様変更なしの不変条件合意
- 状態: 進行中

### 実装TR1（Phase 21）：低リスクな共通ユーティリティの集約（⬜ 未着手）
- 対象: `gas/DailyAggregation.gs`、`gas/MonthlyAggregation.gs`、`gas/Config.gs`
- 内容: 重複している `calcAvg_`, `roundTwoDecimals_`, `formatDateTokyo_` を一元化
- 状態: 未着手

### 実装TR2（Phase 22）：Config 整理と定数参照の一元化（⬜ 未着手）
- 対象: `gas/Config.gs`、`gas/Router.gs`、`gas/Ingest.gs`、`gas/Monitor.gs`
- 内容: `CONFIG_KEYS` / `SCRIPT_PROPERTY_KEYS` の集約、`Ingest.gs` などのハードコード値を `getMergedConfig_()` 経由に統一
- 状態: 未着手

### 実装TR3（Phase 23）：LINE 送信共通化と暗黙的依存の整理（⬜ 未着手）
- 対象: `gas/LineBot.gs`、`gas/ErrorLog.gs`、`gas/Ingest.gs`
- 内容: `replyMessage_` / `pushMessage_` の共通HTTP送信処理抽出、過剰な `typeof` ガードの整理
- 状態: 未着手

### 実装TR4（Phase 24）：Monitor 内部の純粋ロジックと永続化I/Oの境界明確化（⬜ 未着手）
- 対象: `gas/Monitor.gs`
- 内容: 条件評価・ヒステリシス状態遷移・異常値判定・通知文生成（純粋ロジック）と Properties 永続化（I/O）の分離
- 状態: 未着手

### 実装TR5（Phase 25）：Daily / Monthly Aggregation の集計ロジック純粋関数化（⬜ 未着手）
- 対象: `gas/DailyAggregation.gs`、`gas/MonthlyAggregation.gs`
- 内容: 行データ配列からの日次・月次集計計算を純粋関数化し、Spreadsheet I/O・Lock処理と分離
- 状態: 未着手

### 検証TR1（Phase 26）：全自動テスト・ドキュメント整合性確認（⬜ 未着手）
- 対象: `scripts/*`、`docs/*`、`README.md`
- 内容: 全自動テスト（8ファイル）の実行・差分レビュー・ドキュメント整合性確認
- 状態: 未着手

