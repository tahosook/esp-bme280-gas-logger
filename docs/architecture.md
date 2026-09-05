# システム構成

## 目的

ESP8266で取得したBME280の測定値を、Google Apps Script（GAS）のWeb APIへHTTPS POSTし、
GoogleスプレッドシートのDATAシートへ追記する。あわせて、監視・通知（LINE）と日次集計（Daily）を
同じGASプロジェクト内で実現する。

## データフロー

```text
BME280
  ↓ I2C（0x76）
ESP8266 / ESPr Developer
  ↓ Wi-Fi / HTTPS POST（5分間隔、最大3回再送）
GAS Webアプリ（Router → Ingest）
  ↓ appendRow（重複排除あり、排他制御）
DATAシート（生ログ、追記専用）

LINEプラットフォーム
  ↓ Webhook POST（events 配列）
GAS Webアプリ（Router → LineBot）
  ↓ 状態変更（排他制御）
設定・状態ストア

時間主導トリガー（毎日 02:00 JST）
  ↓
GAS（DailyAggregation）
  ↓ appendRow（排他制御）
Dailyシート（1日1行）

時間主導トリガー（毎月 1日 01:00 JST）
  ↓
GAS（MonthlyAggregation）
  ↓
Monthlyシート（1月1行）

時間主導トリガー（毎時 0分：ウォッチドッグ）
  ↓
GAS（Monitor 未受信判定）
  ↓ 未受信時のみ
LINE Push通知（1回・復帰でリセット）
```

## コンポーネント

- **BME280読み取り**: 既存の手動I2C読み取りアルゴリズムを維持する
- **ESP8266ファームウェア**: Wi-Fi接続、測定、JSON生成、HTTPS POST、ログ出力、deep sleepを担当
- **GAS Web API（1プロジェクト内でモジュール分割）**:
  - `Router.gs`: `doGet`/`doPost` 入口。ペイロードの形でセンサー取り込みかLINEイベントかを振り分け
  - `Ingest.gs`: JSON検証・トークン照合・数値範囲チェック・重複排除・DATAへの追記・`flag`列固定5列化・Watchdog復帰リセット
  - `Monitor.gs`: 直近データ評価、状態遷移（正常⇄超過）判定、通知要否の決定、センサー未受信ウォッチドッグ、異常値判定の比較元（直近有効データ）を Script Properties で保持
  - `DailyAggregation.gs`: 日次集計（前回処理済み行以降を読み、Dailyへ1日1行）。処理済み行番号は Script Properties（`DAILY_LAST_ROW`）で管理し、追記確定時のみ更新する
  - `MonthlyAggregation.gs`: 月次集計（Dailyを読み、Monthlyへ1月1行）
  - `DataArchive.gs`: 直近2ヶ月以前の生データを別シート（`Raw_YYYYMM`）または外部スプレッドシートへ退避・パージするデータライフサイクル管理（`MonthlyAggregation` から呼び出し）
  - `LineBot.gs`: Webhook署名検証、コマンド解析（状況/スキップ/クリア/グラフ/推移）、Reply/Push送信、QuickChart 24hグラフ画像返信（Config/状態変更は排他制御）
  - `Metrics.gs`: 不快指数 (DI)・容積絶対湿度 (AH) 計算、翌朝8時JST計算、QuickChart URL 生成（URL 圧縮・サンプリング）などの純粋関数群
  - `Config.gs`: Script Properties / Configシートへのアクセス集約、しきい値デフォルト定義。**Configシートは `getValues()` で一括取得し、Script Properties は `getProperties()` で一括取得する**。個別の `getRange().getValue()` は極力避ける。
  - `ErrorLog.gs`: 例外記録のラッパー（秘密情報をログに残さない）。ログには処理種別、対象シート/キー、エラーコードといった診断情報を残し、トークン・認可情報・機微なペイロードはマスクする。
  - `SetupTriggers.gs`: 時間主導トリガー設定および LINE 接続テスト
  - `DebugTest.gs`: GAS エディタからワンクリック実行可能な手動デバッグ・動作検証用関数群（QuickChart URL 2,000文字検証、LINE Webhook 応答シミュレーション）
- **Googleスプレッドシート**:
  - RawData: `日時 | temp | press | hum | flag` の生ログ（追記専用）。デフォルトシート名は `RawData`（旧名称 `2026` または `DATA` からのフォールバックあり）、`日時` は **Date値＋表示形式 `yyyy-MM-dd HH:mm:ss`**
  - アーカイブ先シート (`Raw_YYYYMM`): 月次バッチにより `RawData` からパージされ退避された過去ログ
  - Daily: `日付 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | sample_count | alert_count` の日次集計（1日1行）
  - Monthly: `年月 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | days_count` の月次集計（1月1行）

## スプレッドシート設計

- RawData は追記専用。旧方式の日別シート（タブ）・固定行範囲（`AVERAGE(B2:B290)` 等）・TOTALシートは採用しない。
- 生データの肥大化を防ぐため、毎月1日の月次集計処理の直後に、**直近2ヶ月以前のデータを自動的に `Raw_YYYYMM` シート（デフォルトは同一スプレッドシート、設定により外部スプレッドシートへ退避可能）へアーカイブし、RawDataシートからパージ（削除）する** ライフサイクル管理を行う。
- シート名は `Sheet1` → `RawData` に変更。`flag` 列は Phase 7 で固定追加する。`device_id` 列は複数台化時に追加（未実装）。
- Daily の `sample_count`（＝その日の anomaly を除いた有効行数。平均・最小・最大を計算した行数と一致）により、欠測・異常値除外を集計結果から把握できる。
- Configシートを採用する（Phase 15・決定済み）。季節調整する閾値を置き、秘密/コード寄りの値（トークン等）は Script Properties に置く。

## 監視・通知

- 監視ロジックは `Ingest.gs` が1行追記した直後に `Monitor.gs` を呼び出す（データ受信時＝5分ごとの評価）。
- `Monitor.gs` は通知チャネルに依存しない通知要求（例: `sendAlert(text)`）だけを生成し、**実際の送信は `LineBot.gs` に委譲する**。
- 状態遷移: 正常 ⇄ 超過。超過への遷移時のみ1回Push通知し、復帰後に再超過で再通知する。
- ヒステリシス（復帰しきい値を超過しきい値より低く設定）でフラッピングを防ぐ。
- 気温・湿度・簡易暑さ指数の各条件は独立に評価し、いずれか1つでも超過で通知対象とする（OR条件）。
- 簡易暑さ指数（不快指数DI）: `DI = 0.81×気温 + 0.01×湿度×(0.99×気温 − 14.3) + 46.3`。通知文面・列名では「公式WBGTとは異なる自宅用の目安」と表記する。
- 監視閾値（決定済み）: 気温 **30.0℃** / 湿度 **70%** / 簡易暑さ指数（DI）**80.0** 超過。
- 平滑化方式（決定済み）: **直近K件連続超過、K=2**（Configで可変）。
- ヒステリシス幅（決定済み）: 復帰 = 超過しきい値 − 幅（気温 **0.5℃** / 湿度 **5%** / 簡易暑さ指数 **0.5**）。
- **5段階アラート優先度制御（LINE 無料枠保護と誤通知防止）**:
  1. センサー異常値ガード: `-10.0℃〜50.0℃` / `0.0%〜100.0%` の範囲外は通知対象外
  2. SNOOZE 優先判定: スヌーズ有効期限（`MONITOR_SKIP_UNTIL` / 翌朝8:00 JST）前は通知を完全抑制
  3. 警戒閾値判定: K=2件連続超過判定（`isOverThreshold`）
  4. 1時間クールダウン判定: 直近送信から `ALERT_COOLDOWN_MIN`（既定60分）以内の再通知を抑制
  5. 1日上限ガード: 1日のPush送信件数を `ALERT_MAX_DAILY_COUNT`（既定5通）までに制限
- 異常値（急変）判定（決定済み）: 気温 **±5.0℃** / 湿度 **±30%** / 気圧 **±20hPa** の変化を `anomaly` 扱いとして記録し、集計から除外する（受信契約の範囲チェックとは別レイヤー）。比較元は **直近の異常でない（有効な）受信データ** とし、その値は Script Properties に保持する。キャッシュ未存在時は異常判定をスキップする。`anomaly` が **2〜3回連続で互いに近い値** の場合は、正当な環境変化とみなし比較基準を更新してよい。
- センサー未受信ウォッチドッグ: DATAへの追記がしきい値（`WATCHDOG_TIMEOUT_MIN=4320`＝3日）を超えて途絶えたら、時間主導トリガーで判定し1回だけLINE通知する。**復帰リセットは Ingest が DATA 追記成功時に担当**し、この際 **Monitor の超過状態も通常状態へリセット**して復帰後最初の評価を確実に行う（Phase 17・決定済み）。

## 実行サイクル

1. ESP8266が起動する
2. BME280を初期化して測定値を取得する
3. Wi-Fiへ接続する（30秒タイムアウト内）
4. Wi-Fiが接続できない場合はGAS送信をスキップし、deep sleepへ進む
5. GASへHTTPS POSTする（30秒タイムアウト、最大3回再試行）
6. HTTPステータスとレスポンスをシリアル出力する
7. 成否にかかわらず、許容された処理後に約5分間deep sleepする
8. 次の起動で測定を繰り返す

## シリアルログ形式

すべてのログは `[tag] message` 形式で出力する。GAS側のログも秘密情報を出力しない。

| タグ | 意味 |
| --- | --- |
| `[sensor]` | BME280測定値 |
| `[wifi]` | Wi-Fi接続状況 |
| `[gas]` | GAS通信状況 |
| `[sleep]` | ディープスリープ開始 |

## セキュリティと運用上の前提

- センサー受信と LINE Webhook は同じ `doPost` 入口に非同期で到達し得るため、**Spreadsheetへの書き込み/読み取りを伴うクリティカルセクション** で `LockService` を用いる。
- ロック対象: Ingest の「最終行取得→重複判定→appendRow」、DailyAggregation の「前回行読み出し→集計→appendRow→ポインタ更新」、LineBot の「Config/状態変更→シート書き戻し」。
- ロックは最小時間で取得し、タイムアウトは用途で切り替える。センサー受信は **15秒（15000ms）**、LINE Webhook（状態変更）は **2秒（2000ms）** とする。取得失敗時は `internal_error` で制御する。

GAS WebアプリはESP8266からアクセスできる設定が必要なため、偶発的なアクセスを防ぐ簡易トークンを使用する。
ファームウェアに含まれるトークンは抽出可能であり、強固な認証とはみなさない。

- LINE Webhook は `X-Line-Signature` ヘッダー（チャネルシークレットによるHMAC-SHA256署名）を検証してから処理する（Phase 12で実装）。
- ログにはHTTPメソッドとURLのホスト部分程度のみ出力し、ヘッダー・トークン・ペイロード・LINE秘密情報は出力しない（`ErrorLog.gs`）。
- WiFi認証情報、GAS URL、APIトークン、LINE秘密情報はローカルの無視対象ファイルで管理し、Publicリポジトリへコミットしない。

### HTTPS証明書検証（決定事項）

ESP8266ファームウェアは`WiFiClientSecure::setInsecure()`でHTTPS証明書検証を省略する。これは個人用・簡易構成のための決定であり、次の理由による。

- GAS Web Appは`script.google.com`から`script.googleusercontent.com`へ302リダイレクトする。証明書検証を有効にするとリダイレクト先ホストも含めた検証が必要になり、Googleの証明書ローテーションで壊れやすい。
- 送信データは温度・気圧・湿度の非機密な環境測定値のみである。
- トークンは偶発的アクセス防止用であり、強固な認証ではない前提と整合する。
- ESP8266のフラッシュ/RAM制約で証明書バンドルは重い。

トレードオフとして、MITM攻撃には脆弱になる。非機密の環境データと偶発的アクセス防止トークンの組み合わせでは許容範囲と判断する。この決定を変更する場合は、リダイレクト先ホストを含む証明書検証方式を別途設計する。

## 変更しない範囲

移行作業では、配線、I2Cピン、BME280アドレス、既存の測定アルゴリズムを、必要性の確認と文書化なしに変更しない。受信基盤（Phase 0〜6、`v1.0.0-stable`）のAPI契約・レスポンス形式も基本変更しない。
