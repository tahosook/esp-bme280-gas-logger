# セットアップとデプロイ

本ドキュメントは、`esp-bme280-gas-logger` における開発環境構築、秘密情報管理、Google Apps Script（GAS）デプロイ、ESP8266ファームウェア書き込み、および各種トリガー設定の手順書です。

> [!IMPORTANT]
> **正本仕様書（Single Source of Truth: SSOT）**:
> 各機能の詳細仕様は以下を参照してください。
> - アラート判定・状態遷移: [`docs/specs/alert-state-machine.md`](specs/alert-state-machine.md)
> - LINE Webhook / UI 契約: [`docs/specs/line-webhook-contracts.md`](specs/line-webhook-contracts.md)
> - データ集計・アーカイブ: [`docs/specs/data-lifecycle-and-aggregation.md`](specs/data-lifecycle-and-aggregation.md)

---

## 1. 開発環境

- macOS（Apple Siliconを含む）
- Arduino IDE
- ESP8266ボードパッケージ
- BME280用ライブラリ（手動I2C読み取り）
- ArduinoJson（GAS送信用）

ESP8266の書き込みポートは接続状況で変わるため、固定値として文書やコードに保存しません。シリアルモニターは 115200 baud を使用します。

---

## 2. 秘密情報管理

Wi-Fi SSID、Wi-Fiパスワード、GAS WebアプリURL、GAS APIトークン、LINE秘密情報はローカル設定ファイルへ記載します。実ファイルは `.gitignore` 対象とし、Publicリポジトリへコミットしません。

ファームウェアの `secrets.h` は、`secrets.example.h` をコピーして次の4項目を設定します。

| 定義名 | 設定値 |
| :--- | :--- |
| `WIFI_SSID` | Wi-Fi SSID |
| `WIFI_PASSWORD` | Wi-Fiパスワード |
| `GAS_URL` | GAS Webアプリの `/exec` URL |
| `GAS_API_TOKEN` | GASのScript Propertiesに設定した `API_TOKEN` と同じ値 |

秘密情報を含むファイルを誤ってコミットした場合は、単に削除するだけでなく、該当するパスワードやトークンを無効化・再発行してください。

---

## 3. GAS デプロイ

### 3.1 本番デプロイ前の準備

次の作業は、対象コードと設定値を人間が確認し、明示的に承認してから行います。

1. 使用するコミットまたはPRの実装内容を確認する。可能なら `main` へマージ済みのコードを使用する。
2. Googleスプレッドシートを作成し、1行目を次の列順にする。追記先の生データシート名は `RawData` とする（旧名称 `DATA` や `2026` へのフォールバックあり）。

   ```text
   日時 | temp | press | hum | flag
   ```

   日時は Date 値で書き、列の表示形式を `yyyy-MM-dd HH:mm:ss` に設定する。
3. スプレッドシートのタイムゾーンを `Asia/Tokyo` に設定する。
4. Google Apps Script プロジェクトを作成し、`gas/` 配下の全 `.gs` ファイルを配置する。
5. GAS プロジェクトのタイムゾーンを `Asia/Tokyo` に設定する。
6. `appsscript.json` に Web アプリ設定があることを確認する。CLI で同期する場合は、次の設定を含める。

   ```json
   "webapp": {
     "executeAs": "USER_DEPLOYING",
     "access": "ANYONE_ANONYMOUS"
   }
   ```

7. GASエディタの **プロジェクトの設定 → スクリプト プロパティ** で必要なプロパティを登録する（後述の「Script Properties 一覧」参照）。

---

### 3.2 Script Properties 一覧

Script Properties はスクリプト単位で共有される設定値で、コードへ秘密情報を埋め込まずに安全に保存できます。実値は公開資料へ記載しません。

| プロパティ名 | 必須 | 既定値 / 例 | 説明 |
| :--- | :---: | :--- | :--- |
| **`SPREADSHEET_ID`** | **必須** | `1abc...` | メインスプレッドシートのID（URLの `/d/` と `/edit` の間） |
| **`API_TOKEN`** | **必須** | 任意のランダム文字列 | センサーからの POST を認証するトークン |
| `SHEET_NAME` | 任意 | `RawData` | 追記先の生データシート名。省略時は `RawData`（`2026`, `DATA` フォールバック対応） |
| `ARCHIVE_SPREADSHEET_ID` | 任意 | (未設定時は同一シート内) | 長期アーカイブ先の別スプレッドシートID |
| `ARCHIVE_RETENTION_MONTHS` | 任意 | `2` | `RawData` シートに残す月数（デフォルトは直近2ヶ月分） |
| `LINE_CHANNEL_SECRET` | 任意 | LINE Developers 参照 | LINE Webhook 署名検証用チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | 任意 | LINE Developers 参照 | LINE メッセージ送信用アクセストークン |
| `LINE_USER_ID` | 任意 | `U1234...` | アラート Push 送信先ユーザーID |
| `ALERT_SNOOZE_UNTIL` | 自動 | UNIX epoch (ms) | スヌーズ停止期限（旧互換: `MONITOR_SKIP_UNTIL`） |
| `ALERT_LAST_SENT_TIME` | 自動 | UNIX epoch (ms) | 直近のアラート Push 送信時刻（クールダウン判定用） |
| `ALERT_COUNT_TODAY` | 自動 | JSON文字列 | 当日のアラート送信件数（`{"date":"YYYY-MM-DD","count":N}`） |
| `DAILY_LAST_ROW` | 自動 | 数値 | 日次集計の前回処理済み行番号（1始まり） |
| `MONTHLY_LAST_ROW` | 自動 | 数値 | 月次集計の前回処理済み行番号（1始まり） |
| `MONITOR_STATE_*` | 自動 | 文字列 | 監視状態キャッシュ（temp, hum, discomfortIndex ごと） |
| `MONITOR_LAST_VALID_*` | 自動 | 数値 | 直近の有効測定値キャッシュ（急変判定比較元） |
| `WATCHDOG_NOTIFIED` | 自動 | `true`/`false` | ウォッチドッグ通知済みフラグ |
| `ERROR_LOG_ENTRIES` | 自動 | JSON配列 | エラーログ履歴（直近最大100件の診断情報） |

※ 監視閾値や各種パラメータのチューニング値は、Config シート（後述）または `gas/Config.gs` のデフォルト値で管理されます。

---

### 3.3 Webアプリの本番デプロイ（GASエディタ / clasp）

#### GASエディタからデプロイ
1. GASエディタ右上の **デプロイ → 新しいデプロイ** を選択する。
2. 種類で **ウェブアプリ** を選択する。
3. 実行ユーザー: **自分**
4. アクセスできるユーザー: **全員（匿名ユーザーを含む）**
5. **デプロイ** を押し、初回の権限確認が表示されたら、内容を確認して承認する。
6. 発行された本番URLの `/exec` URL をコピーして `secrets.h` に設定する。

#### clasp からデプロイ
```sh
cd gas
clasp push --force
clasp create-deployment --description "production"
clasp deployments
clasp open-web-app DEPLOYMENT_ID --json
```

> [!CAUTION]
> **GAS デプロイ URL 固定ルール**:
> ESP8266 ファームウェアの `GAS_URL` はビルド時に固定されます。コード変更時は **既存デプロイのバージョン更新（デプロイを管理）** を行い、`/exec` URL を絶対に変更しないでください。

---

### 3.4 本番スモークテスト

まず GET リクエストで Ready 状態を確認します。

```sh
read -r GAS_URL
curl -L -sS -i "$GAS_URL"
```
成功時の応答: `{"ok":true,"ready":true}`

続いて POST テストを行います。

```sh
read -r -s API_TOKEN
printf '\n'

curl -L -sS -i -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":24.5,\"press\":1012.3,\"hum\":55.8}"
```
成功時の応答: `{"ok":true}`（HTTP 200、`RawData` シートに 1 行追加）

---

## 4. ESP8266 ファームウェア書き込み

1. Arduino IDE で対象スケッチを開く
2. ESPr Developer / ESP8266 向けのボード設定を選択する
3. シリアルポートを接続状態から確認する
4. コンパイルする
5. 内容を確認したうえで書き込む
6. 115200 baud でシリアルログ（`[sensor]`, `[wifi]`, `[gas]`, `[sleep]`）を確認する

---

## 5. シート構成・トリガー・LINE Bot 設定

### 5.1 各種シートの初期作成

1. **`RawData` シート**:
   - ヘッダー: `日時 | temp | press | hum | flag`
   - 表示形式: A列の日時を `yyyy-MM-dd HH:mm:ss` に設定
2. **`Daily` シート**:
   - ヘッダー: `日付 | temp_avg | temp_min | temp_max | hum_avg | hum_min | hum_max | press_avg | press_min | press_max | sample_count | alert_count`
3. **`Monthly` シート**:
   - ヘッダー: `年月 | temp_avg | temp_min | temp_max | hum_avg | hum_min | hum_max | press_avg | press_min | press_max | days_count`
4. **`Config` シート（任意）**:
   - 1行目にキー名、2行目以降に値を配置（横形式または縦形式 `key | value` をサポート）。未設定キーは `gas/Config.gs` の既定値が自動適用されます。

### 5.2 時間主導型トリガー設定

GAS の時間主導型トリガーは、`SetupTriggers.gs` のワンクリック関数 `setupAllTriggers()` を実行するか、手動で登録します。

| 関数名 | 実行周期（正本仕様） | 概要 |
| :--- | :--- | :--- |
| `aggregateDaily` | **毎日 00:00〜01:00 JST** | 前日分の確定データを日次集計し `Daily` シートへ追記 |
| `aggregateMonthly` | **毎月 1日 00:00〜01:00 JST** | 前月分の確定データを月次集計し `Monthly` へ追記後、`DataArchive` を連動実行して 2 ヶ月前の生データを退避・パージ |
| `checkWatchdog` | **毎時 0 分** | `RawData` の最終記録時刻が 3 日以上途絶えた場合に 1 回通知 |

※ `SetupTriggers.gs` をプログラム実行した場合、GAS の制約上それぞれ指定の時刻（`aggregateDaily`: 02:00 JST, `aggregateMonthly`: 1日 01:00 JST, `checkWatchdog`: 毎時）に作成されます。手動でスケジュールを調整する場合は上記正本仕様の時間帯（00:00〜01:00 JST）を推奨します。

### 5.3 LINE Developer コンソール設定

1. LINE Developers コンソールで Messaging API チャネルを作成する。
2. チャネルシークレットとチャネルアクセストークン（長期）を取得し、Script Properties（`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID`）に登録する。
3. Webhook URL に本番の `/exec` URL を登録し、「Webhookの利用」を ON に設定する。
4. 応答設定で「応答メッセージ: OFF」「Webhook: ON」にする。
5. `SetupTriggers.gs` の `testLineBotConnection()` を GAS エディタから実行し、LINE への接続・通知テストを行う。

---

## 6. 手動検証・デバッグ手順（`DebugTest.gs`）

デプロイ後や不具合調査時にワンクリックで検証できる関数群が用意されています。

1. **QuickChart URL 生成と文字数検証 (`debugTest_buildQuickChartUrl`)**:
   - GAS エディタで実行し、生成された QuickChart URL が 2,000 文字以内（LINE 制限クリア）であることを確認。
   - ログの URL をブラウザで開き、2軸折れ線グラフが描画されることを確認。
2. **LINE Webhook（TRENDS 応答）シミュレーション (`debugTest_handleLineWebhook_Trends`)**:
   - LINE への実送信を行わずに、`type: 'image'` のメッセージオブジェクトが正しく構築されることを確認。
3. **アラート判定パイプライン検証 (`debugTest_checkAlertLogic`)**:
   - 正常値、異常値ガード、警戒超過、スヌーズ中、クールダウン中、1日上限到達の各ケースをシミュレートし、判定ロジックが期待通りに動作することを検証。
