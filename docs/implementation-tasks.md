# 実装タスク一覧

本一覧は `docs/implementation-roadmap.md` の Phase 7 以降（決定 / 実装 / 検証）に沿ってタスクを整理する。
1タスク = 1コミット を基本とする。未決の値は決定タスクで確定するまで実装しない（Phase 7 / 10 / 14 / 15 の主要値は決定済み）。

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

## 実装タスク

### 実装T1（Phase 8）：Router/Ingest 分割と重複排除
- 対象: `gas/Router.gs`、`gas/Ingest.gs`
- 内容: `doPost` 前段にペイロード振り分けを追加。既存 `validatePayload_` / `appendMeasurement_` を移設し、最終行参照による重複排除を追加
- テスト: 正常POST、重複POST（窓内は1行のみ）、不正POST
- 完了条件: 重複排除付き取り込みが期待通り動く

### 実装T2（Phase 11）：Monitor.gs
- 対象: `gas/Monitor.gs`
- 内容: 状態遷移（正常⇄超過）、ヒステリシス、平滑化、各条件の独立OR評価、Script Propertiesによる状態保持
- テスト: 超過遷移で1回通知、継続超過で非通知、復帰→再超過で再通知
- 完了条件: 通知の重複抑制と復帰後の再通知が動作

### 実装T3（Phase 12）：LineBot.gs
- 対象: `gas/LineBot.gs`
- 内容: `X-Line-Signature` 署名検証、状況 / スキップ / クリア、Reply/Push送信
- テスト: 各コマンド応答、不正シグネチャ拒否
- 完了条件: LINEで操作が完結し、秘密情報がログに出ない

### 実装T4（Phase 15）：Config/ErrorLog と DailyAggregation
- 対象: `gas/Config.gs`、`gas/ErrorLog.gs`、`gas/DailyAggregation.gs`
- 内容: 設定アクセス集約、例外ログラッパー、前回処理済み行からの差分読み込み日次集計（Daily 1日1行・`sample_count`）
- テスト: 実データ集計、Dailyの平均・最小・最大・`sample_count`整合
- 完了条件: Daily集計が正しく生成される

### 実装T5（Phase 17、任意）：センサー未受信ウォッチドッグ
- 対象: `gas/Monitor.gs`
- 内容: 一定時間DATAへの追記がなければ1回だけ通知
- テスト: 送信停止時に1回通知、復帰後リセット
- 完了条件: オフライン検知が1回通知で動作

---

## 検証タスク

### 検証T1（Phase 9）：重複排除の実機・API検証
- 対象: `docs/test-results/*`、`docs/test-plan.md`
- 内容: 意図的に同一リクエストを短時間で複数回送り、DATAに1行のみ、`{"ok":true}`が毎回返ることを確認

### 検証T2（Phase 13）：LINE操作と通知
- 対象: `docs/test-results/*`、`docs/test-plan.md`
- 内容: LINEから状況 / スキップ / クリアを操作し、閾値を一時的に低くしてPushが1回だけ飛ぶことを確認

### 検証T3（Phase 16）：Daily集計
- 対象: `docs/test-results/*`、`docs/test-plan.md`
- 内容: 数日分データでDailyの平均・最小・最大・`sample_count`が手計算と一致することを確認
