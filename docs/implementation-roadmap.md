# ESP8266 BME280 環境ロガー 実装ロードマップ（全体）

本ドキュメントは本プロジェクトの実装ロードマップの正本である。
基盤移行（Phase 0〜6）は完了しており、以降は日次集計・環境監視・LINE Bot の拡張（Phase 7〜19）を計画する。

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
| --- | --- |
| [README.md](README.md) | 文書目次 |
| [api-contract.md](api-contract.md) | センサー受信API契約 |
| [architecture.md](architecture.md) | システム構成・アーキテクチャ |
| [line-bot-ui.md](line-bot-ui.md) | LINE Bot UI/UX仕様 |
| [deployment.md](deployment.md) | セットアップ・デプロイ手順 |
| [archive/release-plan.md](archive/release-plan.md) | 旧リリース・ロールバック計画 |
| [implementation-tasks.md](implementation-tasks.md) | タスク一覧（決定 / 実装 / 検証） |
| [test-plan.md](test-plan.md) | テスト計画 |
| [test-results/](test-results/) | 検証記録 |

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
| 27 | 実装 — LINE Bot UI 近代化（NOW/SNOOZE/CLEAR/TRENDS、DIステータスバッジ、容積絶対湿度、スヌーズ期限表示、5段階アラート制御） | ✅ 完了 |
| 28 | 実装 — QuickChart による直近24h温湿度推移グラフ画像生成（URL 2,000文字圧縮、サンプリング最適化） | ✅ 完了 |
| 29 | 実装・検証 — 手動デバッグ関数（`DebugTest.gs` による URL 文字数検証、Webhook シミュレーション、全9本テスト通過） | ✅ 完了 |

## 設計レビューによる確定方針（Phase 7以降の前提）

受信基盤の上に日次集計・環境監視・LINE Bot を設計する設計レビュー
（「仕事部屋環境ロガー：GAS / Spreadsheet / LINE 側 設計レビュー」）を実施し、その結果を本ロードマップへ反映する。
レビューで確定した設計判断は次の通り。仕様として Phase 7 以降の前提となる。

1. **GASプロジェクトは1つのまま拡張する**。検証済みのESP8266宛先 URL（`/exec`）と Script Properties を維持するため、`.gs` ファイルを機能ごとに分割し、`doPost` 冒頭でペイロードの形（`events` 配列の有無）を見て処理を振り分ける。
2. **スプレッドシートは「DATA（生ログ追記のみ）＋ Daily（1日1行）」方式**。旧方式の日別シート（タブ）は Google Sheets の1ファイル最大200タブ制約により約7ヶ月で上限に達し、長期運用と矛盾するため採用しない。旧固定行範囲（`AVERAGE(B2:B290)` 等）も採用しない。
3. **重複POSTは排除する**。DATA最終行の測定値が今回のリクエストと一致し、記録時刻が現在時刻から規定秒数（**180秒、Phase 7で確定**）以内なら行を追加せず `{"ok":true}` を返す。
4. **監視ロジックはデータ受信（`doPost`）内で同居させる**。ambidata等の外部API中継やポーリングは不要。
5. **監視は状態遷移方式（正常⇄超過）**で、超過への遷移時のみ1回通知し、復帰後に再超過で再通知する。復帰しきい値を超過しきい値より低くするヒステリシス（不感帯）でフラッピングを防ぐ。各条件（気温・湿度・簡易暑さ指数）は独立に評価し、いずれか1つでも超過で通知対象とする。
6. **「WBGT」は名称から外し「簡易暑さ指数」へ変更**する（公式WBGTではないことを明示）。計算式は **不快指数（DI）へ変更**（Phase 14で確定）。
7. **LINE Webhook は `X-Line-Signature` 署名検証**を行う（チャネルシークレットによるHMAC-SHA256）。
8. **秘密情報をログへ出力しない**。ログはHTTPメソッドとURLのホスト部分程度に限定する。
9. **DATA書き込みを最優先**し、通知処理は独立に `try/catch` する（通知失敗でも記録は守る）。
10. **DATA保存列は5列固定にする**。列順は `日時 | temp | press | hum | flag` で、`flag` は空文字で確定する。
11. **センサー受信と LINE Webhook は同時着信し得る**ため、Spreadsheet書き込み/読み取りを伴うブロックでは `LockService` で排他する。センサー受信は **15秒（15000ms）**、LINE Webhook（状態変更）は **2秒（2000ms）** に分けてタイムアウトする。
12. **異常値判定の比較元は直近有効データ**とし、Script Properties に保持する。キャッシュ未存在時は異常判定をスキップする。`anomaly` が **2〜3回連続で互いに近い値** の場合は、正当な環境変化とみなし比較基準を更新してよい。
13. **Watchdog 復帰リセットは Ingest の DATA追記成功時に実行**し、この際 **Monitor の超過状態も通常状態へリセット**する。時間主導トリガーは通知のみを担当する。


## モジュール分割（GAS）

同一GASプロジェクト内の `.gs` ファイルは全て同じグローバルスコープ・同じ Script Properties を共有する。

| モジュール | 責務 | 対応Phase / 機能 |
| --- | --- | --- |
| `Router.gs` | `doGet`/`doPost` 入口。ペイロードの形でセンサー取り込みかLINEイベントかを振り分け | 8 |
| `Ingest.gs` | JSON検証・トークン照合・数値範囲チェック・重複排除・DATAへの追記・`flag`列固定5列化・Watchdog復帰リセット | 8 |
| `Monitor.gs` | 直近データ評価、状態遷移（正常⇄超過）判定、通知要否の決定、センサー未受信ウォッチドッグ、異常値判定の比較元（直近有効データ）を Script Properties で保持 | 11 |
| `DailyAggregation.gs` | 時間主導トリガー入口。前回処理済み行以降を読み、Dailyへ1日1行追記。`DAILY_LAST_ROW` は Script Properties で管理 | 15 |
| `MonthlyAggregation.gs` | 月次集計。Dailyを読み、Monthlyへ1行追記 | 18 |
| `DataArchive.gs` | 直近2ヶ月以前の生データのアーカイブ・パージ（MonthlyAggregationから呼び出し） | PR #34 |
| `LineBot.gs` | Webhook署名検証、コマンド解析（状況/スキップ/クリア/グラフ/推移）、Reply/Push送信、Flex Message/グラフ画像返信（Config/状態変更は排他制御） | 12 / PR #26-#27 |
| `Metrics.gs` | 不快指数 (DI)・容積絶対湿度 (AH) 計算、翌朝8時JST計算、QuickChart URL 生成（URL 圧縮・サンプリング）、5段階アラート優先度制御 | PR #26 |
| `Config.gs` | Script Properties / Configシートへのアクセス集約、しきい値デフォルト定義 | 15 |
| `ErrorLog.gs` | 例外記録のラッパー。秘密情報をログに残さない | 15 |
| `SetupTriggers.gs` | 時間主導トリガー自動設定および LINE 接続テスト | 15 / 17 / 18 |
| `DebugTest.gs` | GAS エディタからワンクリック実行可能な手動デバッグ・動作検証用関数群 | PR #28 |

## 決定済みの項目（Phase 7 / 10 / 14 / 15 で確定）

Phase 7 / 10 / 14 / 15 / 17 / 18 の未決項目は、人間の承認により以下のとおり決定済み。

### Phase 7（DATAシート・重複排除）
- シート名: `Sheet1` → `DATA` に変更
- 列追加: Phase 7 で `flag` を空文字で固定追加する。`device_id` は複数台化時に追加（未実装）
- 重複判定の時間窓: **180秒**
- 日時のセル保存形式: **Date値＋セル表示形式 `yyyy-MM-dd HH:mm:ss`**（Daily集計はこの前提）

### Phase 10（監視）
- 監視閾値: 気温 **30.0℃** / 湿度 **70%** / 簡易暑さ指数（不快指数DI）**80.0** 超過
- 平滑化方式: **直近K件連続超過、K=2**（Configで可変）
- ヒステリシス幅（復帰 = 超過しきい値 − 幅）: 気温 **0.5℃** / 湿度 **5%** / 簡易暑さ指数 **0.5**
- 異常値（急変）判定の変化量: 気温 **±5.0℃** / 湿度 **±30%** / 気圧 **±20hPa** → `anomaly` 記録し集計から除外。比較元は **直近の異常でない受信データ**（Script Properties に保持）。キャッシュ未存在時は異常判定をスキップする

### Phase 14（簡易暑さ指数）
- 名称: **「簡易暑さ指数」**（`WBGT` 表記は廃止）
- 計算式: **不快指数（DI）** `DI = 0.81×気温 + 0.01×湿度×(0.99×気温 − 14.3) + 46.3`
- 表記: 通知文面・列名に「公式WBGTとは異なる自宅用の目安」と明示

### Phase 15（設定）
- Configシート: **採用（ハイブリッド）**。秘密/コード寄りの値は Script Properties、季節調整する閾値は Configシート

### Phase 17（センサー未受信ウォッチドッグ）
- **実装する**。未受信とみなすしきい値 **3日**（Configキー `WATCHDOG_TIMEOUT_MIN=4320`、Configシートで調整可）
- 動作: 未受信なら1回だけLINE通知 → 復帰は Ingest の DATA追記成功時にリセット → 再び未受信で再通知

### Phase 18（月次ロールアップ）
- **実装する**。Dailyを月次で1行に集計し、Monthlyシートへ追記

### 見送り（#15）
- device_id 実運用: **見送り（保留）**。列追加・複数台運用は当面実施しない


---

## Phase 7：決定 — DATAシート列と重複排除仕様の確定（✅ 決定済み）

| 項目 | 内容 |
| --- | --- |
| 種別 | 決定 |
| 目的 | DATAシートの列構成を `日時 | temp | press | hum | flag` で確定する |
| 対象ファイル | `docs/architecture.md`、`docs/api-contract.md`（反映時） |
| 依存関係 | なし |
| 前提・未決事項 | 5列固定（`flag` は空文字）。日時は **Date値＋表示形式**、シート名は **`DATA`**（決定済み）。重複判定時間窓は 180 秒 |
| 受け入れ条件 | 列構成・シート名・重複判定の時間窓秒数が明確に決まる |
| 検証方法 | 設計レビュー / README |

## Phase 8：実装 — Router/Ingest 分割と重複排除

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | GASを Router/Ingest に分割し、重複排除を追加する |
| 対象ファイル | `gas/Router.gs`、`gas/Ingest.gs`（現行 `doPost`/`validatePayload_`/`appendMeasurement_` 相当の移設を含む） |
| 依存関係 | Phase 7 |
| 前提・未決事項 | `doGet`（Ready確認）は維持。最終行のみ参照し全件スキャンしない。センサー受信と LINE Webhook の同時着信に備え、DATA追記は LockService で排他する |
| 受け入れ条件 | 同一値・窓内の再送でDATAに1行しか増えない。`{"ok":true}`が毎回返る |
| 検証方法 | `scripts/test-gas-api.js` と実機 |

## Phase 9：検証 — 重複排除の実機・API検証

| 項目 | 内容 |
| --- | --- |
| 種別 | 検証 |
| 目的 | 重複排除が正しく動くことを確認する |
| 対象ファイル | `docs/test-results/*`、`docs/test-plan.md` |
| 依存関係 | Phase 8 |
| 受け入れ条件 | 意図的に同一リクエストを短時間で複数回送り、DATAに1行しか追加されず毎回 `{"ok":true}` が返る |
| 検証方法 | 実機・curlによる重複POST |

## Phase 10：決定 — 監視仕様の確定（✅ 決定済み）

| 項目 | 内容 |
| --- | --- |
| 種別 | 決定 |
| 目的 | 監視のしきい値（気温・湿度・簡易暑さ指数）、平滑化方式（連続K件 か 直近N件平均 か）、復帰しきい値（ヒステリシス幅）を確定する |
| 対象ファイル | `docs/architecture.md`（反映時） |
| 依存関係 | なし（Phase 7と並行可） |
| 前提・未決事項 | 各条件は独立OR評価。状態遷移方式と LINE 無料枠（月200通、Replyは非カウント/Pushはカウント）を踏まえ1回通知を基本とする |
| 受け入れ条件 | 閾値・平滑化・ヒステリシス幅が決まり、通知条件が再現できる |
| 検証方法 | 設計レビュー |

## Phase 11：実装 — Monitor.gs

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | 監視ロジック（状態遷移・ヒステリシス・平滑化・独立OR評価）を実装し、`Ingest.gs` の保存直後に呼び出す |
| 対象ファイル | `gas/Monitor.gs` |
| 依存関係 | Phase 8, 10, 14 |
| 前提・未決事項 | 状態は Script Properties（`ONHOLD_TIME` と同様）で管理。異常値判定の比較元は直近有効データ（Script Properties に保持）。キャッシュ未存在時は異常判定をスキップする |
| 受け入れ条件 | 超過遷移時のみ通知し、超過継続中は再通知しない。復帰後に再超過で再通知 |
| 検証方法 | 閾値を一時的に低く設定した動作確認 |

## Phase 12：実装 — LineBot.gs

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | Webhook署名検証、コマンド解析（状況/スキップ/クリア）、Reply/Push通知を実装する |
| 対象ファイル | `gas/LineBot.gs` |
| 依存関係 | Phase 11, 14 |
| 前提・未決事項 | センサー取り込みと LINE Webhook の同時着信に備え、Config/状態変更は LockService で排他する |
| 受け入れ条件 | 署名検証で不正を拒否。各コマンドが期待通り応答し、超過時Pushは1回 |
| 検証方法 | LINEアプリからの実操作 |

## Phase 13：検証 — LINE操作と通知

| 項目 | 内容 |
| --- | --- |
| 種別 | 検証 |
| 目的 | LINEから状況/スキップ/クリアを操作でき、通知の状態遷移が正しいことを確認する |
| 対象ファイル | `docs/test-results/*`、`docs/test-plan.md` |
| 依存関係 | Phase 12 |
| 受け入れ条件 | 各コマンドの応答を確認。閾値を一時的に低く設定し、Pushが1回だけ飛び超過継続中は再通知されない |
| 検証方法 | LINEアプリ実機確認 |

## Phase 14：決定 — 簡易暑さ指数の名称と計算式（✅ 決定済み）

| 項目 | 内容 |
| --- | --- |
| 種別 | 決定 |
| 目的 | 簡易暑さ指数の名称・計算式を確定する（正式WBGTとは異なる旨を明示） |
| 対象ファイル | `docs/architecture.md`、`docs/api-contract.md`（反映時） |
| 依存関係 | なし |
| 前提・未決事項 | 黒球温度なしでは正式WBGTは算出不可。計算式は **不快指数（DI）へ変更（決定済み）**、名称は **「簡易暑さ指数」**（決定済み） |
| 受け入れ条件 | 名称・式・通知文面での「公式WBGTではない」明示が決まる |
| 検証方法 | 設計レビュー |

## Phase 15a：実装 — Config.gs

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | Configシートと Script Properties のアクセス集約、しきい値デフォルト定義を実装する |
| 対象ファイル | `gas/Config.gs` |
| 依存関係 | Phase 8, 10, 14 |
| 前提・未決事項 | Configシートは `getValues()` で一括取得し、Script Properties は `getProperties()` で一括取得する |
| 受け入れ条件 | 設定キーの取得・フォールバックが機能し、デフォルト値がコードで保持される |
| 検証方法 | 設計レビュー / README |

## Phase 15b：実装 — ErrorLog.gs

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | 例外記録のラッパーを実装する |
| 対象ファイル | `gas/ErrorLog.gs` |
| 依存関係 | Phase 15a |
| 前提・未決事項 | 処理種別、対象シート/キー、エラーコードは残し、トークン・認可情報・機微なペイロードはマスクする |
| 受け入れ条件 | 例外発生時に診断情報が残り、秘密情報がログへ出力されない |
| 検証方法 | 設計レビュー / README |

## Phase 15c：実装 — DailyAggregation.gs

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | 日次集計（Daily 1日1行）を実装する。前回処理済み行は Script Properties の `DAILY_LAST_ROW` で管理し、更新は追記確定時のみ行う |
| 対象ファイル | `gas/DailyAggregation.gs` |
| 依存関係 | Phase 15a, 15b |
| 前提・未決事項 | 前回処理済み行からの差分読み込みで実装。`sample_count` で欠測を可視化。集計とポインタ更新は LockService で排他する |
| 受け入れ条件 | Dailyに1日1行追記され、前日分の平均・最小・最大と `sample_count` が正しい |
| 検証方法 | 実データでの集計確認 |

## Phase 16：検証 — Daily集計

| 項目 | 内容 |
| --- | --- |
| 種別 | 検証 |
| 目的 | 日次集計が正しいことを確認する |
| 対象ファイル | `docs/test-results/*`、`docs/test-plan.md` |
| 依存関係 | Phase 15 |
| 受け入れ条件 | 数日分のデータでDailyの平均・最小・最大が手計算と一致し、`sample_count` が実際の行数と一致 |
| 検証方法 | 実データ検証 |

## Phase 17：実装 — センサー未受信ウォッチドッグ（✅ 決定・対象）

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | DATAへの追記がしきい値（既定 **3日**、Configキー `WATCHDOG_TIMEOUT_MIN=4320`、Configシートで調整可）を超えて途絶えたら、**1回だけ** LINE通知する。復帰リセットは Ingest の DATA追記成功時に実行する |
| 対象ファイル | `gas/Monitor.gs` |
| 依存関係 | Phase 11 |
| 前提・未決事項 | 時間主導トリガーでDATA最終日時を定期評価し、通知状態は Script Properties で管理。復帰リセットは Ingest 側で行う |
| 受け入れ条件 | 未受信時に1回だけ通知され、復帰後はリセットされる |
| 検証方法 | 実機（送信停止）確認 |

## Phase 18：実装 — 月次ロールアップ（Monthlyシート）

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | Dailyを月次で1行に集計し、Monthlyシートへ追記する |
| 対象ファイル | `gas/MonthlyAggregation.gs`（DailyAggregation と同型） |
| 依存関係 | Phase 15 |
| 前提・未決事項 | 前月分のDaily行を集計し、Monthlyへ1行追記。列は `年月 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | days_count`。Monthly（毎月1日 01:00 JST）は前月確定分のDailyを集計し、Daily（毎日 02:00 JST）の当月分集計と分離する |
| 受け入れ条件 | 月に1行追記され、前月の平均・最小・最大と日数が正しい |
| 検証方法 | 実データ確認 |

## Phase 19：検証 — ウォッチドッグ・月次ロールアップ

| 項目 | 内容 |
| --- | --- |
| 種別 | 検証 |
| 目的 | ウォッチドッグの1回通知/復帰リセットと、Monthlyの集計整合を確認する |
| 対象ファイル | `docs/test-results/*`、`docs/test-plan.md` |
| 依存関係 | Phase 17, 18 |
| 受け入れ条件 | 未受信時に1回だけ通知され、復帰後はリセットされる。Monthlyが月1行・集計が手計算と一致 |
| 検証方法 | 実機（送信停止）確認・実データ確認 |

---

## Phase 20：決定 — リファクタリング方針・Baseline（v1.1.0 + PR #24）と不変条件の確定

| 項目 | 内容 |
| --- | --- |
| 種別 | 決定 |
| 目的 | v1.1.0-stable および LINE Bot 翌朝8:00スキップ機能（PR #24）を基準点とし、外部仕様・動作を変更しないリファクタリング方針・依存関係・不変条件を確定する |
| 対象ファイル | `docs/architecture.md`、`docs/implementation-roadmap.md`、`docs/implementation-tasks.md` |
| 依存関係 | なし |
| 前提・未決事項 | BME280校正・測定アルゴリズム、API契約、Spreadsheet構造、監視判定・Watchdog、LINE Botコマンド・翌朝8:00スキップ（PR #24）は一切変更しない |
| 受け入れ条件 | リファクタリング計画、不変条件、Phase 21〜26 のスコープがドキュメント化され、ユーザー承認を得る |
| 検証方法 | ドキュメントレビュー・既存テスト全件パス確認 |

## Phase 21：実装 — 低リスクな共通ユーティリティの集約

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | `DailyAggregation.gs` と `MonthlyAggregation.gs` で重複している計算処理（`calcAvg_`, `roundTwoDecimals_`）および日付フォーマット（`formatDateTokyo_`）を集約し、DRYを改善する |
| 対象ファイル | `gas/DailyAggregation.gs`、`gas/MonthlyAggregation.gs`、`gas/Config.gs` |
| 変更しない範囲 | 計算結果・丸め規則・日付出力形式・各関数の外部公開インターフェース |
| 前提・未決事項 | 既存の単体テストがそのままパスすること |
| 受け入れ条件 | 重複関数が一元化され、集計テストがすべて成功する |
| 検証方法 | `node scripts/test-daily-aggregation.js`、`node scripts/test-monthly-aggregation.js` |

## Phase 22：実装 — Config 整理と定数参照の一元化

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | `Router.gs` の `CONFIG_KEYS` と `Config.gs` の `SCRIPT_PROPERTY_KEYS` の重複を解消し、`Ingest.gs` などのハードコード値を `getMergedConfig_()` 経由の参照に統一する |
| 対象ファイル | `gas/Config.gs`、`gas/Router.gs`、`gas/Ingest.gs`、`gas/Monitor.gs` |
| 変更しない範囲 | 設定キー名、プロパティ名、デフォルト値、フォールバック優先順位 |
| 前提・未決事項 | LINE Bot の `SKIP_UNTIL_HOUR` 設定（PR #24）を含む全設定体系を維持する |
| 受け入れ条件 | 定数定義が一元化され、Config/Monitor/Ingest のテストがすべて成功する |
| 検証方法 | `node scripts/test-config-monitor.gs.js`、`node scripts/test-gas-api.js`、`node scripts/test-watchdog.js` |

## Phase 23：実装 — LINE 送信共通化と暗黙的依存の整理

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | `LineBot.gs` の `replyMessage_` と `pushMessage_` における HTTP 送信・エラーハンドリング処理を共通化し、コード内の暗黙的依存（過剰な `typeof` ガード）を整理する |
| 対象ファイル | `gas/LineBot.gs`、`gas/ErrorLog.gs`、`gas/Ingest.gs` |
| 変更しない範囲 | LINE API エンドポイント、ペイロード形式、署名検証、翌朝8:00スキップ機能（PR #24）、エラーログ記録仕様 |
| 前提・未決事項 | Node.js 単体テスト環境で各テストスクリプトが必要なモジュールを適切に解決できるようにする |
| 受け入れ条件 | LINE 送信ロジックが共通化され、LineBot / ErrorLog / Ingest のテストがすべて成功する |
| 検証方法 | `node scripts/test-line-bot.js`、`node scripts/test-errorlog.gs.js` |

## Phase 24：実装 — Monitor 内部の純粋ロジックと永続化I/Oの境界明確化

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | `Monitor.gs` における条件評価・ヒステリシス状態遷移・異常値判定・通知文生成（純粋ロジック）と、PropertiesService / Spreadsheet / Lock（I/O）の境界を明確にする |
| 対象ファイル | `gas/Monitor.gs` |
| 変更しない範囲 | 監視閾値、ヒステリシス幅、K=2平滑化判定、不快指数DI計算式、Watchdog動作、通知文面 |
| 前提・未決事項 | 既存の判定結果・状態遷移が完全に同一であること |
| 受け入れ条件 | 純粋関数と I/O 処理が分離され、Monitor / Watchdog のテストがすべて成功する |
| 検証方法 | `node scripts/test-monitor.gs.js`、`node scripts/test-watchdog.js` |

## Phase 25：実装 — Daily / Monthly Aggregation の集計ロジック純粋関数化

| 項目 | 内容 |
| --- | --- |
| 種別 | 実装 |
| 目的 | `DailyAggregation.gs` および `MonthlyAggregation.gs` の「行データ配列からの集計計算」を純粋関数として切り出し、Spreadsheet 読み書き・Lock制御・ポインタ更新と分離する |
| 対象ファイル | `gas/DailyAggregation.gs`、`gas/MonthlyAggregation.gs` |
| 変更しない範囲 | 集計結果（avg/min/max/count）、二重集計防止（既存日付除外）、当日/当月除外、anomaly除外、ポインタ更新規則 |
| 前提・未決事項 | 純粋関数単体でテスト可能な構造にすること |
| 受け入れ条件 | コア集計が純粋関数化され、日次・月次集計テストがすべて成功する |
| 検証方法 | `node scripts/test-daily-aggregation.js`、`node scripts/test-monthly-aggregation.js` |

## Phase 26：検証 — 全自動テスト・ドキュメント整合性確認（✅ 完了）

| 項目 | 内容 |
| --- | --- |
| 種別 | 検証 |
| 目的 | 全自動テストの実行、ファームウェア側の確認、ドキュメント（`docs/`）との整合性を確認し、リファクタリング完了を記録する |
| 対象ファイル | `scripts/*`、`docs/*`、`README.md` |
| 依存関係 | Phase 21〜25 |
| 受け入れ条件 | 全単体テストスクリプトが成功し、差分レビューで不要な変更・外部動作の変更がないことを確認できる |
| 検証方法 | `for f in scripts/test-*.js; do node "$f"; done` および `git diff` レビュー |

---

## 完了済み：Phase 27〜29（LINE Bot UI 近代化・QuickChart グラフ返信・手動検証機能）

PR #26, #27, #28 にて実装・検証を完了。詳細は [docs/line-bot-ui.md](line-bot-ui.md) を参照。

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 27 | 実装 — LINE Bot UI 近代化と Flex Message 対応（NOW/SNOOZE/CLEAR/TRENDS、DIステータスバッジ、容積絶対湿度、スヌーズ期限表示、5段階アラート制御） | ✅ 完了（PR #26, #27） |
| 28 | 実装 — QuickChart による直近24h温湿度推移グラフ画像生成（`buildQuickChartUrl`、URL 2,000文字圧縮、間引き・X軸ラベル最適化、フォールバック） | ✅ 完了（PR #26, #28） |
| 29 | 実装・検証 — GAS 手動デバッグ・動作検証関数群（`DebugTest.gs` による URL 文字数検証、Webhook シミュレーション、全9本テストパス） | ✅ 完了（PR #28） |

---

## 完了済み：Phase 30〜34（テスト基盤近代化・生データアーカイブ・ESLint複雑度管理）

PR #31〜#37 にて、GASアーキテクチャの整理、Jestテストスイートへの完全移行、CI自動化、生データのアーカイブ/パージ機能、およびESLint複雑度管理とマイクロヘルパーの集約を実施した。

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 30 | 実装 — GASバックエンドアーキテクチャのモジュール依存関係整理 | ✅ 完了（PR #31） |
| 31 | 実装・検証 — Node 20+ / Jest テストスイート移行および CI 自動化（GitHub Actions で `npm run test:coverage` カバレッジ閾値検査） | ✅ 完了（PR #32） |
| 32 | 実装 — SNOOZE カードの最小化および datetimepicker 対応 | ✅ 完了（PR #33） |
| 33 | 実装・検証 — 生データの自動アーカイブ・パージ（`DataArchive.gs`、直近2ヶ月以前を `Raw_YYYYMM` へ退避、`RawData` フォールバック対応） | ✅ 完了（PR #34） |
| 34 | 実装・リファクタリング — ESLint 循環的複雑度管理（threshold: 12）と過剰なマイクロヘルパーの集約・コールチェーン平坦化 | ✅ 完了（PR #36, #37） |

---

## 継続判断のルール

- 新たに生じた未決の値は、決定Phaseで確定するまで実装しない（主要項目は Phase 7 / 10 / 14 / 15 / 17 / 18 / 20 で決定済み）。
- 各Phase完了後、受け入れ条件を満たさない場合は次Phaseへ進まない。
- 人間による承認（GASデプロイ・LINE設定・実機書き込み）は明示的な確認を条件とする。
