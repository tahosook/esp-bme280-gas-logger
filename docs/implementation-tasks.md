# 実装タスク一覧

本一覧は `docs/implementation-roadmap.md` の Phase 7 以降（決定 / 実装 / 検証）に沿ってタスクを整理する。
1タスク = 1コミット を基本とする。未決の値（閾値・平滑化・計算式など）は決定タスクで確定するまで実装しない。

---

## 決定タスク

### 決定T1（Phase 7）：DATAシート列・シート名・重複判定窓の確定
- 目的: DATAシート構成と重複排除仕様を確定する
- 対象: `docs/architecture.md`、`docs/api-contract.md`
- 内容: `flag`（空 / `dup` / `anomaly`）・`device_id` 列追加の要否、シート名変更（`Sheet1`→`DATA`）要否、重複判定の時間窓秒数、日時のセル保存形式
- 完了条件: 列構成・シート名・時間窓秒数が固定される

### 決定T2（Phase 10）：監視仕様の確定
- 目的: 監視の閾値・平滑化・ヒステリシスを確定する
- 対象: `docs/architecture.md`
- 内容: 気温 / 湿度 / 簡易暑さ指数の閾値、平滑化方式（直近K件連続 か 直近N件平均 か）と件数、復帰しきい値（ヒステリシス幅）
- 完了条件: 閾値・平滑化・ヒステリシス幅が固定される

### 決定T3（Phase 14）：簡易暑さ指数の名称と計算式
- 目的: 簡易暑さ指数の名称・計算式を確定する
- 対象: `docs/architecture.md`、`docs/api-contract.md`
- 内容: 「WBGT」を名称から外す。現在の式を維持（名称変更のみ）か、不快指数などの確立式へ変更かを決定
- 完了条件: 名称・式・通知文面での表記が確定する

### 決定T4（Phase 15）：Configシート採用
- 目的: Configシートを採用するか確定する
- 対象: `docs/architecture.md`、`docs/deployment.md`
- 内容: 頻繁に調整する閾値をConfigシートへ置くか、Script Propertiesへ寄せるか
- 完了条件: 設定値の配置場所が確定する

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
