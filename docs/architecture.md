# システム構成

## 目的

ESP8266で取得したBME280の測定値を、Google Apps Script（GAS）のWeb APIへHTTPS POSTし、
Googleスプレッドシートの `RawData` シートへ追記する（旧名称 `2026` または `DATA` へのフォールバックあり）。あわせて、監視・通知（LINE）と日次・月次集計、および生データ自動アーカイブを同じGASプロジェクト内で実現する。

> [!IMPORTANT]
> **正本仕様書（Single Source of Truth: SSOT）**:
> 各サブシステムの詳細仕様・アルゴリズム・契約は、以下の正本仕様書を参照してください。
> - アラート判定・状態遷移・クールダウン・1日上限: **[`docs/specs/alert-state-machine.md`](specs/alert-state-machine.md)**
> - LINE Webhook・Flex UI・QuickChart グラフ・Postback 契約: **[`docs/specs/line-webhook-contracts.md`](specs/line-webhook-contracts.md)**
> - データライフサイクル・日次/月次集計・自動退避/パージ: **[`docs/specs/data-lifecycle-and-aggregation.md`](specs/data-lifecycle-and-aggregation.md)**

---

## データフロー

```text
BME280
  ↓ I2C（0x76）
ESP8266 / ESPr Developer
  ↓ Wi-Fi / HTTPS POST（5分間隔、最大3回再送）
GAS Webアプリ（Router → Ingest）
  ↓ appendRow（重複排除あり、排他制御: 15秒）
Tier 1: RawData シート（生ログ、追記専用）

LINEプラットフォーム
  ↓ Webhook POST（events 配列）
GAS Webアプリ（Router → LineBot）
  ↓ 状態変更・スヌーズ設定（排他制御: 2秒）
設定・状態ストア（Script Properties / Configシート）

時間主導トリガー（毎日 00:00〜01:00 JST）
  ↓
GAS（DailyAggregation）
  ↓ appendRow（排他制御: 15秒）
Tier 2: Daily シート（1日1行要約）

時間主導トリガー（毎月 1日 00:00〜01:00 JST）
  ↓
GAS（MonthlyAggregation）
  ↓ appendRow（排他制御: 15秒）
Tier 3: Monthly シート（1月1行要約）
  ↓ 集計成功後に連動
GAS（DataArchive）
  ↓ 2ヶ月以前の生データを退避・書込検証・パージ
Tier 4: Raw_YYYYMM シート（アーカイブスプレッドシート）

時間主導トリガー（毎時 0分：ウォッチドッグ）
  ↓
GAS（Monitor 未受信判定）
  ↓ 未受信時のみ（WATCHDOG_TIMEOUT_MIN 超過）
LINE Push通知（1回通知・復帰でリセット）
```

---

## コンポーネント

- **BME280読み取り**: 既存の手動I2C読み取りアルゴリズムを維持する
- **ESP8266ファームウェア**: Wi-Fi接続、測定、JSON生成、HTTPS POST、ログ出力、deep sleepを担当
- **GAS Web API（1プロジェクト内でモジュール分割）**:
  - `Router.gs`: `doGet`/`doPost` 入口。ペイロードの形でセンサー取り込みかLINEイベントかを振り分け
  - `Ingest.gs`: JSON検証・トークン照合・数値範囲チェック・重複排除・`RawData`への追記・`flag`列固定5列化・Watchdog復帰リセット
  - `Monitor.gs`: 直近データ評価、状態遷移（正常⇄超過）判定、通知要否の決定、センサー未受信ウォッチドッグ、異常値判定の比較元（直近有効データ）を Script Properties で保持
  - `DailyAggregation.gs`: 日次集計（前回処理済み行以降を読み、`Daily`へ1日1行）。処理済み行番号は Script Properties（`DAILY_LAST_ROW`）で管理し、追記確定時のみ更新する
  - `MonthlyAggregation.gs`: 月次集計（`Daily`を読み、`Monthly`へ1月1行）。処理完了直後に `DataArchive.gs` を自動呼び出し
  - `DataArchive.gs`: 直近2ヶ月以前の生データを別シート（`Raw_YYYYMM`）または外部アーカイブ用スプレッドシートへ退避・検証・安全パージするライフサイクル管理
  - `LineBot.gs`: Webhook署名検証、コマンド解析（`NOW`/`SNOOZE`/`TRENDS`/`CLEAR`）、Reply/Push送信、QuickChart 24hグラフ画像返信、Flex Message UI 構築
  - `Metrics.gs`: 不快指数 (DI)・気圧傾向差分 ($\Delta P$) 計算、翌朝8時JST計算、QuickChart URL 生成（URL 圧縮・サンプリング最適化）、5段階アラート判定などの純粋関数群
  - `Config.gs`: Script Properties / Configシートへのアクセス集約、しきい値デフォルト定義。**Configシートは `getValues()` で一括取得し、Script Properties は `getProperties()` で一括取得する**
  - `ErrorLog.gs`: 例外記録のラッパー（秘密情報をログに残さない）。ログには処理種別、対象シート/キー、エラーコードといった診断情報を残し、トークン・認可情報・機微なペイロードはマスクする
  - `SetupTriggers.gs`: 時間主導トリガー設定および LINE 接続テスト
  - `DebugTest.gs`: GAS エディタからワンクリック実行可能な手動デバッグ・動作検証用関数群（QuickChart URL 2,000文字検証、LINE Webhook 応答シミュレーション）
- **Googleスプレッドシート（4層ストレージ階層）**:
  - **Tier 1: 生データ (`RawData`)**: `日時 | temp | press | hum | flag` の生ログ（追記専用）。デフォルトシート名は `RawData`（旧名称 `2026` または `DATA` からのフォールバックあり）、`日時` は **Date値＋表示形式 `yyyy-MM-dd HH:mm:ss`**
  - **Tier 2: 日次要約 (`Daily`)**: `日付 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | sample_count | alert_count` の日次集計（1日1行）
  - **Tier 3: 月次要約 (`Monthly`)**: `年月 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | days_count` の月次集計（1月1行）
  - **Tier 4: 長期アーカイブ (`Raw_YYYYMM`)**: 月次バッチにより `RawData` から退避された過去ログシート（外部アーカイブ先スプレッドシートまたは同一ブック内）

---

## スプレッドシート設計とライフサイクル

- `RawData` は追記専用。旧方式の日別シート（タブ）・固定行範囲（`AVERAGE(B2:B290)` 等）・TOTALシートは採用しない。
- 生データの肥大化を防ぐため、毎月1日の月次集計処理の直後に、**直近2ヶ月以前のデータを自動的に `Raw_YYYYMM` シート（デフォルトは同一スプレッドシート、`ARCHIVE_SPREADSHEET_ID` 指定時は外部スプレッドシートへ退避）へアーカイブし、`RawData` シートからパージ（削除）する** ライフサイクル管理を行う。
- シート名は `RawData` を正本とし、旧名称 `2026` または `DATA` も自動探索・フォールバックされる。`flag` 列は固定5列化されている。
- `Daily` の `sample_count`（＝その日の anomaly を除いた有効行数。平均・最小・最大を計算した行数と一致）により、欠測・異常値除外を集計結果から把握できる。
- Configシートを採用する。季節調整する閾値を置き、秘密/コード寄りの値（トークン等）は Script Properties に置く。

---

## 監視・通知

- 監視ロジックは `Ingest.gs` が1行追記した直後に `Monitor.gs` を呼び出す（データ受信時＝5分ごとの評価）。
- `Monitor.gs` は通知チャネルに依存しない通知要求（例: `sendAlert(text)`）だけを生成し、**実際の送信は `LineBot.gs` に委譲する**。
- 状態遷移: 正常 ⇄ 超過。超過への遷移時のみ1回Push通知し、復帰後に再超過で再通知する。ヒステリシスでフラッピングを防ぐ。
- 気温・湿度・簡易暑さ指数の各条件は独立に評価し、いずれか1つでも超過で通知対象とする（OR条件）。
- 簡易暑さ指数（不快指数DI）: `DI = 0.81×気温 + 0.01×湿度×(0.99×気温 − 14.3) + 46.3`。通知文面・列名では「公式WBGTとは異なる自宅用の目安」と表記する。
- 監視閾値（決定済み）: 気温 **30.0℃** / 湿度 **70%** / 簡易暑さ指数（DI）**80.0** 超過。
- 平滑化方式（決定済み）: **直近K件連続超過、K=2**（Configで可変）。
- ヒステリシス幅（決定済み）: 復帰 = 超過しきい値 − 幅（気温 **0.5℃** / 湿度 **5%** / 簡易暑さ指数 **0.5**）。
- **多層防御アラート制御（LINE 無料枠保護と誤通知防止）**:
  1. センサー異常値ガード: `-10.0℃〜50.0℃` / `0.0%〜100.0%` の範囲外は通知対象外
  2. SNOOZE 優先判定: スヌーズ有効期限（`ALERT_SNOOZE_UNTIL` / 翌朝8:00 JST 等）前は通知を完全抑制
  3. 警戒閾値判定: K=2件連続超過判定（`isOverThreshold`）
  4. 1時間クールダウン判定: 直近送信から `ALERT_COOLDOWN_MIN`（既定60分）以内の再通知を抑制
  5. 1日上限ガード: 1日のPush送信件数を `ALERT_MAX_DAILY_COUNT`（既定5通）までに制限
  ※ 詳細な判定パイプラインは [`docs/specs/alert-state-machine.md`](specs/alert-state-machine.md) を参照。
- 異常値（急変）判定（決定済み）: 気温 **±5.0℃** / 湿度 **±30%** / 気圧 **±20hPa** の変化を `anomaly` 扱いとして記録し、集計から除外する。比較元は **直近の異常でない（有効な）受信データ** とし、その値は Script Properties に保持する。
- センサー未受信ウォッチドッグ: `RawData` への追記がしきい値（`WATCHDOG_TIMEOUT_MIN=4320`＝3日）を超えて途絶えたら、時間主導トリガーで判定し1回だけLINE通知する。**復帰リセットは Ingest が `RawData` 追記成功時に担当**し、この際 **Monitor の超過状態も通常状態へリセット**して復帰後最初の評価を確実に行う。

---

## 実行サイクル

1. ESP8266が起動する
2. BME280を初期化して測定値を取得する
3. Wi-Fiへ接続する（30秒タイムアウト内）
4. Wi-Fiが接続できない場合はGAS送信をスキップし、deep sleepへ進む
5. GASへHTTPS POSTする（30秒タイムアウト、最大3回再試行）
6. HTTPステータスとレスポンスをシリアル出力する
7. 成否にかかわらず、許容された処理後に約5分間deep sleepする
8. 次の起動で測定を繰り返す

---

## シリアルログ形式

すべてのログは `[tag] message` 形式で出力する。GAS側のログも秘密情報を出力しない。

| タグ | 意味 |
| --- | --- |
| `[sensor]` | BME280測定値 |
| `[wifi]` | Wi-Fi接続状況 |
| `[gas]` | GAS通信状況 |
| `[sleep]` | ディープスリープ開始 |

---

## セキュリティと運用上の前提

- センサー受信と LINE Webhook は同じ `doPost` 入口に非同期で到達し得るため、**Spreadsheetへの書き込み/読み取りを伴うクリティカルセクション** で `LockService` を用いる。
- ロック対象: Ingest の「最終行取得→重複判定→appendRow」、DailyAggregation / MonthlyAggregation の集計処理、LineBot の状態変更。
- ロックは最小時間で取得し、タイムアウトは用途で切り替える。センサー受信・集計処理は **15秒（15000ms）**、LINE Webhook（状態変更）は **2秒（2000ms）** とする。取得失敗時は `internal_error` で制御する。
- LINE Webhook は `X-Line-Signature` ヘッダー（チャネルシークレットによるHMAC-SHA256署名）を検証してから処理する。
- ログにはHTTPメソッドとURLのホスト部分程度のみ出力し、ヘッダー・トークン・ペイロード・LINE秘密情報は出力しない（`ErrorLog.gs`）。
- WiFi認証情報、GAS URL、APIトークン、LINE秘密情報はローカルの無視対象ファイルで管理し、Publicリポジトリへコミットしない。

### HTTPS証明書検証（決定事項）

ESP8266ファームウェアは `WiFiClientSecure::setInsecure()` でHTTPS証明書検証を省略する。これは個人用・簡易構成のための決定であり、次の理由による。

- GAS Web Appは `script.google.com` から `script.googleusercontent.com` へ302リダイレクトする。証明書検証を有効にするとリダイレクト先ホストも含めた検証が必要になり、Googleの証明書ローテーションで壊れやすい。
- 送信データは温度・気圧・湿度の非機密な環境測定値のみである。
- トークンは偶発的アクセス防止用であり、強固な認証ではない前提と整合する。
- ESP8266のフラッシュ/RAM制約で証明書バンドルは重い。

トレードオフとして、MITM攻撃には脆弱になる。非機密の環境データと偶発的アクセス防止トークンの組み合わせでは許容範囲と判断する。

---

## 変更しない範囲

移行作業では、配線、I2Cピン、BME280アドレス、既存の測定アルゴリズムを、必要性の確認と文書化なしに変更しない。受信基盤（Phase 0〜6、`v1.0.0-stable`）のAPI契約・レスポンス形式も基本変更しない。
