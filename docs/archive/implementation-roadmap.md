# ESP8266 BME280 環境ロガー 実装ロードマップ（全体）

本ドキュメントは本プロジェクトの実装ロードマップの正本である。
基盤移行（Phase 0〜6）は完了しており、以降は日次集計・環境監視・LINE Bot の拡張（Phase 7〜19）、リファクタリング（Phase 20〜26）、UI 近代化（Phase 27〜29）、テスト基盤・アーカイブ・品質改善（Phase 30〜34）、および正本仕様書配備・ドキュメント整合性統一（Phase 35〜39）を実施した。

## 目的

ESP8266（ESPr Developer）とBME280で測定している温度・気圧・湿度を、Ambientから
Googleスプレッドシートへ移行する。個人利用・趣味のプロジェクトとして、無料で維持できる構成を優先する。

## 既存スケッチの原典

既存の動作確認済みスケッチは、次の公開リポジトリで管理されている。

https://github.com/tahosook/sketch_ambidata

移行先では、このリポジトリのBME280読み取り処理、Wi-Fi接続、ディープスリープ動作を
ベースラインとして扱う。Ambientへの送信部分だけを段階的に置き換える。
既存リポジトリのMITライセンスと著作権表示は引き継ぐ。

## 合意済みの方針

- GitHubリポジトリはPublicで運用する。
- Wi-Fiパスワード、APIトークン、GASの認証トークン、LINE秘密情報は公開しない。
- データ欠損は許容する。未送信データの永続キューは作らない。
- APIバージョンは最初から `1` とする。単位は `temp: °C`, `press: hPa`, `hum: %` に固定する。
- 日時はGAS側で生成し、タイムゾーンは `Asia/Tokyo` とする。
- 実機書き込みとGASデプロイはユーザーが確認してから行う。
- 安定版はGitタグで管理する。
- 追加サービスや有料インフラは使用しない。

## 文書マップ（docs/）

| 文書 | 役割 |
| :--- | :--- |
| [README.md](README.md) | 文書目次 |
| [api-contract.md](api-contract.md) | センサー受信API契約 |
| [architecture.md](architecture.md) | システム構成・アーキテクチャ概要 |
| [line-bot-ui.md](line-bot-ui.md) | LINE Bot UI/UX コンセプト概要 |
| [deployment.md](deployment.md) | セットアップ・デプロイ手順 |
| [archive/release-plan.md](archive/release-plan.md) | 旧リリース・ロールバック計画 |
| [implementation-tasks.md](implementation-tasks.md) | タスク一覧（決定 / 実装 / 検証） |
| [test-plan.md](test-plan.md) | テスト計画・CIゲート基準 |
| [test-results/](test-results/) | 検証記録 |
| **[specs/alert-state-machine.md](specs/alert-state-machine.md)** | **【SSOT】アラート判定・状態遷移ステートマシン仕様** |
| **[specs/line-webhook-contracts.md](specs/line-webhook-contracts.md)** | **【SSOT】LINE Webhook 応答および UI 契約仕様** |
| **[specs/data-lifecycle-and-aggregation.md](specs/data-lifecycle-and-aggregation.md)** | **【SSOT】データライフサイクルおよび集計・アーカイブ仕様** |

---

## 完了済み：Phase 0〜6（基盤移行）

Phase 0〜6 は完了し、動作確認済みのファームウェアは `v1.0.0-stable` としてタグ付けされている。
実機検証記録: [test-results/2026-08-10-phase-6-hardware-test.md](test-results/2026-08-10-phase-6-hardware-test.md)

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0 | GitHubと開発基盤の整備（Public repo / main / AGENTS / README / .gitignore / secrets.example.h / MIT引継ぎ） | ✅ 完了 |
| 1 | API仕様の確定（POST: api_version/token/temp/press/hum、列: 日時/temp/press/hum、正常/欠損/異常/不正トークンの扱い） | ✅ 完了 |
| 2 | GAS APIの実装（doPost・JSON解析・バージョン/トークン/数値・範囲検証・Asia/Tokyo・JSONレスポンス） | ✅ 完了 |
| 3 | Arduino送信処理の実装（BME280維持・Ambient→GAS送信へ置換・WiFiClientSecure/HTTPClient・ArduinoJson・リダイレクト対応・5分スリープ） | ✅ 完了 |
| 4 | 通信・実機検証（Wi-Fi / BME280 / HTTPS POST / HTTP200判定 / GASリダイレクト / 追記 / スリープ復帰 / タイムアウト） | ✅ 完了 |
| 5 | 最小限の安定化（Wi-Fi/HTTPSタイムアウト・再試行・無限ループ回避・ログ形式） | ✅ 完了 |
| 6 | レビューと安定版化（秘密情報なし・API一致・無限待機なし・リダイレクト上限・センサー保守・実機結果記録 → v1.0.0-stable） | ✅ 完了 |

## 完了済み：Phase 7〜19（日次・月次集計・環境監視・LINE Bot 拡張）

Phase 7〜19 はすべて実装・デプロイ・実機検証を含めて完了した。
実機検証記録: [test-results/2026-08-30-phase-13-18-validation.md](test-results/2026-08-30-phase-13-18-validation.md)

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 7 | 決定 — DATAシート列と重複排除仕様の確定（5列固定・180秒窓） | ✅ 完了 |
| 8 | 実装 — Router/Ingest 分割と重複排除 | ✅ 完了 |
| 9 | 検証 — 重複排除の実機・API検証 | ✅ 完了 |
| 10 | 決定 — 監視仕様の確定（閾値・K=2平滑化・ヒステリシス） | ✅ 完了 |
| 11 | 実装 — Monitor.gs（状態遷移・ヒステリシス・異常値判定） | ✅ 完了 |
| 12 | 実装 — LineBot.gs（LINE Webhook・Push/Reply・コマンド解析） | ✅ 完了 |
| 13 | 検証 — LINE操作と通知（状況/スキップ/クリア/ヘルプ・Pushテスト） | ✅ 完了 |
| 14 | 決定 — 簡易暑さ指数の名称と計算式（不快指数 DI） | ✅ 完了 |
| 15 | 実装 — Config.gs, ErrorLog.gs, DailyAggregation.gs（日次集計） | ✅ 完了 |
| 16 | 検証 — Daily集計 | ✅ 完了 |
| 17 | 実装 — センサー未受信ウォッチドッグ | ✅ 完了 |
| 18 | 実装 — 月次ロールアップ（MonthlyAggregation.gs） | ✅ 完了 |
| 19 | 検証 — ウォッチドッグ・月次ロールアップ | ✅ 完了 |

## 完了済み：Phase 20〜26（内部品質改善・リファクタリング）

`v1.1.0-stable` および LINE Bot 翌朝8:00スキップ機能（PR #24）の仕様・外部動作を完全に維持しながら、コードの可読性・保守性・テスト容易性・依存関係の明確性を改善した。

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 20 | 決定 — リファクタリング方針・Baseline（v1.1.0 + PR #24）と不変条件の確定 | ✅ 完了 |
| 21 | 実装 — 低リスクな共通ユーティリティの集約（calcAvg_, roundTwoDecimals_, 日付処理） | ✅ 完了 |
| 22 | 実装 — Config 整理と定数参照の一元化（CONFIG_KEYS統一、ハードコード解消） | ✅ 完了 |
| 23 | 実装 — LINE 送信共通化と暗黙的依存（typeof）の整理 | ✅ 完了 |
| 24 | 実装 — Monitor 内部の純粋ロジックと永続化I/Oの境界明確化 | ✅ 完了 |
| 25 | 実装 — Daily / Monthly Aggregation の集計ロジック純粋関数化 | ✅ 完了 |
| 26 | 検証 — 全自動テスト・ドキュメント整合性確認 | ✅ 完了 |

## 完了済み：Phase 27〜29（LINE Bot UI 近代化・QuickChart グラフ返信・手動検証）

PR #26, #27, #28 にて、LINE Bot の UI を視覚的な Flex Message に刷新し、直近24時間の温湿度推移グラフ画像返信（QuickChart）および GAS エディタでの手動検証関数を導入した。

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 27 | 実装 — LINE Bot UI 近代化（NOW/SNOOZE/CLEAR/TRENDS、DIステータスバッジ、スヌーズ期限表示、5段階アラート制御） | ✅ 完了（PR #26, #27） |
| 28 | 実装 — QuickChart による直近24h温湿度推移グラフ画像生成（URL 2,000文字圧縮、サンプリング最適化） | ✅ 完了（PR #26, #28） |
| 29 | 実装・検証 — 手動デバッグ関数（`DebugTest.gs` による URL 文字数検証、Webhook シミュレーション、全9本テスト通過） | ✅ 完了（PR #28） |

## 完了済み：Phase 30〜34（テスト基盤近代化・生データアーカイブ・ESLint複雑度管理）

PR #31〜#37 にて、GASアーキテクチャの整理、Jestテストスイートへの完全移行、CI自動化、生データのアーカイブ/パージ機能、およびESLint複雑度管理とマイクロヘルパーの集約を実施した。

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 30 | 実装 — GASバックエンドアーキテクチャのモジュール依存関係整理 | ✅ 完了（PR #31） |
| 31 | 実装・検証 — Node 20+ / Jest テストスイート移行および CI 自動化（GitHub Actions で `npm run test:coverage` カバレッジ閾値検査） | ✅ 完了（PR #32） |
| 32 | 実装 — SNOOZE カードの最小化および datetimepicker 対応 | ✅ 完了（PR #33） |
| 33 | 実装・検証 — 生データの自動アーカイブ・パージ（`DataArchive.gs`、直近2ヶ月以前を `Raw_YYYYMM` へ退避、`RawData` フォールバック対応） | ✅ 完了（PR #34） |
| 34 | 実装・リファクタリング — ESLint 循環的複雑度管理（threshold: 12）と過剰なマイクロヘルパーの集約・コールチェーン平坦化 | ✅ 完了（PR #36, #37） |

## 完了済み：Phase 35〜39（正本仕様書配備・エージェントガバナンス・ドキュメント整合性統一）

PR #41〜#44 および本タスクにて、システムの主要サブシステム（アラート判定、LINE Webhook 契約、データライフサイクル）の正本仕様書（SSOT）を `docs/specs/` 配下に配備し、AI エージェント規約の策定、および既存ドキュメント全体の整合性統一を完了した。

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 35 | 仕様策定 — アラート判定・状態遷移ステートマシン正本仕様書の策定（`docs/specs/alert-state-machine.md`） | ✅ 完了（PR #41） |
| 36 | ガバナンス — AI エージェント開発規約・ガバナンス策定（`AGENTS.md`） | ✅ 完了（PR #42） |
| 37 | 仕様策定 — LINE Webhook 応答および対話型 UI 契約正本仕様書の策定（`docs/specs/line-webhook-contracts.md`） | ✅ 完了（PR #43） |
| 38 | 仕様策定 — データライフサイクルおよび集計・アーカイブ正本仕様書の策定（`docs/specs/data-lifecycle-and-aggregation.md`） | ✅ 完了（PR #44） |
| 39 | ドキュメント統一 — docs/ 配下の棚卸しおよび SSOT 整合性統一（容積絶対湿度の削除、RawData統一、トリガー時刻統一） | ✅ 完了 |

---

## 設計レビューによる確定方針（Phase 7以降の前提）

受信基盤の上に日次集計・環境監視・LINE Bot を設計する設計レビュー
（「仕事部屋環境ロガー：GAS / Spreadsheet / LINE 側 設計レビュー」）を実施し、その結果を本ロードマップへ反映する。
レビューで確定した設計判断は次の通り。仕様として Phase 7 以降の前提となる。

1. **GASプロジェクトは1つのまま拡張する**。検証済みのESP8266宛先 URL（`/exec`）と Script Properties を維持するため、`.gs` ファイルを機能ごとに分割し、`doPost` 冒頭でペイロードの形（`events` 配列の有無）を見て処理を振り分ける。
2. **スプレッドシートは「RawData（生ログ追記のみ）＋ Daily（1日1行要約）」方式**。旧方式の日別シート（タブ）は Google Sheets の1ファイル最大200タブ制約により約7ヶ月で上限に達し、長期運用と矛盾するため採用しない。旧固定行範囲（`AVERAGE(B2:B290)` 等）も採用しない。
3. **重複POSTは排除する**。`RawData` 最終行の測定値が今回のリクエストと一致し、記録時刻が現在時刻から規定秒数（**180秒、Phase 7で確定**）以内なら行を追加せず `{"ok":true}` を返す。
4. **監視ロジックはデータ受信（`doPost`）内で同居させる**。ambidata等の外部API中継やポーリングは不要。
5. **監視は状態遷移方式（正常⇄超過）**で、超過への遷移時のみ1回通知し、復帰後に再超過で再通知する。復帰しきい値を超過しきい値より低くするヒステリシス（不感帯）でフラッピングを防ぐ。各条件（気温・湿度・簡易暑さ指数）は独立に評価し、いずれか1つでも超過で通知対象とする。
6. **「WBGT」は名称から外し「簡易暑さ指数」へ変更**する（公式WBGTではないことを明示）。計算式は **不快指数（DI）へ変更**（Phase 14で確定）。
7. **LINE Webhook は `X-Line-Signature` 署名検証**を行う（チャネルシークレットによるHMAC-SHA256）。
8. **秘密情報をログへ出力しない**。ログはHTTPメソッドとURLのホスト部分程度に限定する。
9. **`RawData` 書き込みを最優先**し、通知処理は独立に `try/catch` する（通知失敗でも記録は守る）。
10. **`RawData` 保存列は5列固定にする**。列順は `日時 | temp | press | hum | flag` で、`flag` は空文字で確定する。
11. **センサー受信と LINE Webhook は同時着信し得る**ため、Spreadsheet書き込み/読み取りを伴うブロックでは `LockService` で排他する。センサー受信・集計処理は **15秒（15000ms）**、LINE Webhook（状態変更）は **2秒（2000ms）** に分けてタイムアウトする。
12. **異常値判定の比較元は直近有効データ**とし、Script Properties に保持する。キャッシュ未存在時は異常判定をスキップする。`anomaly` が **2〜3回連続で互いに近い値** の場合は、正当な環境変化とみなし比較基準を更新してよい。
13. **Watchdog 復帰リセットは Ingest の `RawData` 追記成功時に実行**し、この際 **Monitor の超過状態も通常状態へリセット**する。時間主導トリガーは通知のみを担当する。

---

## モジュール分割（GAS）

同一GASプロジェクト内の `.gs` ファイルは全て同じグローバルスコープ・同じ Script Properties を共有する。

| モジュール | 責務 | 対応Phase / 機能 |
| --- | --- | --- |
| `Router.gs` | `doGet`/`doPost` 入口。ペイロードの形でセンサー取り込みかLINEイベントかを振り分け | 8 |
| `Ingest.gs` | JSON検証・トークン照合・数値範囲チェック・重複排除・`RawData`への追記・`flag`列固定5列化・Watchdog復帰リセット | 8 |
| `Monitor.gs` | 直近データ評価、状態遷移（正常⇄超過）判定、通知要否の決定、センサー未受信ウォッチドッグ、異常値判定の比較元（直近有効データ）を Script Properties で保持 | 11 |
| `DailyAggregation.gs` | 時間主導トリガー入口。前回処理済み行以降を読み、Dailyへ1日1行追記。`DAILY_LAST_ROW` は Script Properties で管理 | 15 |
| `MonthlyAggregation.gs` | 月次集計。Dailyを読み、Monthlyへ1行追記後、DataArchive を連動呼び出し | 18 / PR #34 |
| `DataArchive.gs` | 直近2ヶ月以前の生データのアーカイブ・パージ（MonthlyAggregationから呼び出し） | PR #34 |
| `LineBot.gs` | Webhook署名検証、コマンド解析（`NOW`/`SNOOZE`/`TRENDS`/`CLEAR`）、Reply/Push送信、Flex Message/グラフ画像返信 | 12 / PR #26-#27 |
| `Metrics.gs` | 不快指数 (DI)・気圧差分計算、翌朝8時JST計算、QuickChart URL 生成（URL 圧縮・サンプリング）、多層防御アラート判定 | PR #26 |
| `Config.gs` | Script Properties / Configシートへのアクセス集約、しきい値デフォルト定義 | 15 |
| `ErrorLog.gs` | 例外記録のラッパー。秘密情報をログに残さない | 15 |
| `SetupTriggers.gs` | 時間主導トリガー自動設定および LINE 接続テスト | 15 / 17 / 18 |
| `DebugTest.gs` | GAS エディタからワンクリック実行可能な手動デバッグ・動作検証用関数群 | PR #28 |

---

## 決定済みの項目

### 生データシート・重複排除
- シート名: `RawData`（旧名称 `DATA` または `2026` はフォールバック対応）
- 列構成: `日時 | temp | press | hum | flag` の5列固定（`flag` は空文字、異常値は `anomaly`）
- 重複判定の時間窓: **180秒**
- 日時のセル保存形式: **Date値＋セル表示形式 `yyyy-MM-dd HH:mm:ss`**

### 監視・アラート
- 監視閾値: 気温 **30.0℃** / 湿度 **70%** / 簡易暑さ指数（不快指数DI）**80.0** 超過
- 平滑化方式: **直近K件連続超過、K=2**
- ヒステリシス幅: 気温 **0.5℃** / 湿度 **5%** / 簡易暑さ指数 **0.5**
- 異常値（急変）判定の変化量: 気温 **±5.0℃** / 湿度 **±30%** / 気圧 **±20hPa** → `anomaly` 記録し集計から除外
- 抑制制御: SNOOZE 優先、1 時間クールダウン（`ALERT_COOLDOWN_MIN=60`）、1 日上限（`ALERT_MAX_DAILY_COUNT=5`）

### 簡易暑さ指数
- 名称: **「簡易暑さ指数」**（`WBGT` 表記は廃止）
- 計算式: **不快指数（DI）** `DI = 0.81×気温 + 0.01×湿度×(0.99×気温 − 14.3) + 46.3`
- 表記: 通知文面・列名に「公式WBGTとは異なる自宅用の目安」と明示

### 設定・ストレージ・トリガー
- Configシート: **採用（ハイブリッド）**。秘密/コード寄りの値は Script Properties、季節調整する閾値は Configシート
- センサー未受信ウォッチドッグ: 未受信しきい値 **3日**（`WATCHDOG_TIMEOUT_MIN=4320`）、時間主導トリガー（毎時）
- トリガー実行時間帯: 日次集計 **毎日 00:00〜01:00 JST**、月次集計 **毎月 1日 00:00〜01:00 JST**
- データアーカイブ: 直近 2 ヶ月以前の生データを `Raw_YYYYMM` へ退避・パージ

---

## 継続判断のルール

- 新たに生じた未決の値は、決定タスクで確定するまで実装しない。
- 各Phase完了後、受け入れ条件を満たさない場合は次Phaseへ進まない。
- 人間による承認（GASデプロイ・LINE設定・実機書き込み）は明示的な確認を条件とする。
