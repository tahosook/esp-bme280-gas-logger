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
  ↓ appendRow（重複排除あり）
DATAシート（生ログ、追記専用）

LINEプラットフォーム
  ↓ Webhook POST（events 配列）
GAS Webアプリ（Router → LineBot）

時間主導トリガー（1日1回）
  ↓
GAS（DailyAggregation）
  ↓
Dailyシート（1日1行）
```

## コンポーネント

- **BME280読み取り**: 既存の手動I2C読み取りアルゴリズムを維持する
- **ESP8266ファームウェア**: Wi-Fi接続、測定、JSON生成、HTTPS POST、ログ出力、deep sleepを担当
- **GAS Web API（1プロジェクト内でモジュール分割）**:
  - `Router.gs`: `doGet`/`doPost` 入口。ペイロードの形でセンサー取り込みかLINEイベントかを振り分け
  - `Ingest.gs`: JSON検証・トークン照合・数値範囲チェック・重複排除・DATAへの追記
  - `Monitor.gs`: 直近データ評価、状態遷移（正常⇄超過）判定、通知要否の決定
  - `DailyAggregation.gs`: 日次集計（前回処理済み行以降を読み、Dailyへ1日1行）
  - `LineBot.gs`: Webhook署名検証、コマンド解析（状況/スキップ/クリア）、Reply/Push送信
  - `Config.gs`: Script Properties / Configシートへのアクセス集約、しきい値デフォルト定義
  - `ErrorLog.gs`: 例外記録のラッパー（秘密情報をログに残さない）
- **Googleスプレッドシート**:
  - DATA: `日時 | temp | press | hum` の生ログ（追記専用）
  - Daily: `日付 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | sample_count | alert_count` の日次集計（1日1行）

## スプレッドシート設計

- DATA は追記専用。旧方式の日別シート（タブ）・固定行範囲（`AVERAGE(B2:B290)` 等）・TOTALシートは採用しない。
- DATA への列追加（`flag`: 空 / `dup` / `anomaly`、`device_id` など）と、シート名を `Sheet1` から `DATA` へ変更するかは、Phase 7 の決定Issueで確定する（未実装）。
- Daily の `sample_count` により、その日の有効行数（欠測の有無）を集計結果から把握できる。

## 監視・通知

- 監視ロジックは `Ingest.gs` が1行追記した直後に `Monitor.gs` を呼び出す（データ受信時＝5分ごとの評価）。
- 状態遷移: 正常 ⇄ 超過。超過への遷移時のみ1回Push通知し、復帰後に再超過で再通知する。
- ヒステリシス（復帰しきい値を超過しきい値より低く設定）でフラッピングを防ぐ。
- 気温・湿度・簡易暑さ指数の各条件は独立に評価し、いずれか1つでも超過で通知対象とする（OR条件）。
- 閾値・平滑化方式（直近K件連続 か 直近N件平均 か）・ヒステリシス幅は Phase 10 の決定Issueで確定する（未決）。

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
