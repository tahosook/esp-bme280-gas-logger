# GAS API

ESP8266からのJSON POSTを受け取り、Googleスプレッドシートへ測定値を追記するGoogle Apps Scriptです。

## Script Properties

GASエディタの **プロジェクトの設定 → スクリプト プロパティ** に、次の値を登録します。実値はリポジトリへ保存しません。

| 名前 | 内容 |
| --- | --- |
| `SPREADSHEET_ID` | 追記先スプレッドシートのID |
| `API_TOKEN` | ESP8266と共有する簡易トークン |
| `SHEET_NAME` | 追記先生データシート名。省略時は`RawData`（旧名称`2026`、`DATA`への自動フォールバックあり） |
| `DAILY_LAST_ROW` | 日次集計の前回処理済み行番号（1始まり） |
| `MONTHLY_LAST_ROW` | 月次集計の前回処理済み行番号（1始まり） |
| `ARCHIVE_SPREADSHEET_ID` | アーカイブ先の別スプレッドシートID（省略時は同一スプレッドシート内） |
| `ARCHIVE_RETENTION_MONTHS` | RawDataシートに残すアーカイブ対象外の月数（デフォルト: 2） |
| `WATCHDOG_NOTIFIED` | センサー未受信ウォッチドッグ通知済みフラグ |
| `LINE_CHANNEL_SECRET` | LINE Developers のチャネルシークレット（署名検証用） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers のチャネルアクセストークン（長期） |
| `LINE_USER_ID` | LINE Push通知先のユーザーID |
| `ALERT_SNOOZE_UNTIL` | LINEスヌーズ停止期限（エポックミリ秒。`MONITOR_SKIP_UNTIL`も互換対応） |
| `ALERT_LAST_SENT_TIME` | 直近のアラートPush送信時刻（エポックミリ秒。クールダウン判定用） |
| `ALERT_COUNT_TODAY` | 当日のアラート送信件数（JSON: `{"date":"YYYY-MM-DD","count":N}`。1日上限ガード用） |

スプレッドシートとGASプロジェクトのタイムゾーンは`Asia/Tokyo`に設定します。コード側でも日時を`Asia/Tokyo`で文字列化し、`yyyy-MM-dd HH:mm:ss`（例：`2026-08-10 01:42:09`）としてから追記します。

## デプロイ

本番デプロイのチェックリストとロールバック手順は、[GAS本番デプロイ手順](../docs/deployment.md#gasデプロイ)を使用してください。

1. GASプロジェクトへ`Router.gs`、`Ingest.gs`、`Config.gs`、`ErrorLog.gs`、`Monitor.gs`、`DailyAggregation.gs`、`MonthlyAggregation.gs`、`DataArchive.gs`、`LineBot.gs`、`Metrics.gs`、`SetupTriggers.gs`、`DebugTest.gs`と`appsscript.json`を配置する。`appsscript.json`には`USER_DEPLOYING`と`ANYONE_ANONYMOUS`のWebアプリ設定を含める。`doGet`・`doPost`・`jsonResponse_`は`Router.gs`に実装されている（`Code.gs`は削除済み）。
2. Script Propertiesを設定する。
3. **デプロイ → 新しいデプロイ → ウェブアプリ** を選択する。
4. 実行ユーザーはスプレッドシートへ書き込めるアカウントを選択する。
5. アクセスできるユーザーをESP8266からの匿名HTTPS POSTが可能な設定にする。
6. 発行された`/exec` URLをローカルの秘密情報設定へ保存する。
7. 時間主導トリガーを設定する。**GASエディタで `setupAllTriggers` を一度だけ手動実行**するか、GASエディタのトリガー画面で個別に追加する。`SetupTriggers.gs` は重複チェック付きで安全に再実行できる。

   | 関数 | タイミング | 目的 |
   | --- | --- | --- |
   | `aggregateDaily` | 毎日 02:00 JST | 日次集計 |
   | `aggregateMonthly` | 毎月 1 日 01:00 JST | 月次集計 |
   | `checkWatchdog` | 毎時 | センサー未受信ウォッチドッグ |

GASの本番デプロイは、コードと設定を人間が確認してから実施します。

## curlテスト

`GAS_URL`と`API_TOKEN`はローカルシェルで設定し、ログや公開資料へ実値を残さないでください。

まずReady確認を実行します。これは設定とシートへのアクセス可否だけを確認し、行を追加しません。

```sh
curl -L -sS -i "$GAS_URL"
```

期待値は`{"ok":true,"ready":true}`です。

正常系：

```sh
curl -L -sS -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":24.5,\"press\":1012.3,\"hum\":55.8}"
```

期待値は`{"ok":true}`で、シートに`日時 | temp | press | hum | flag`の1行が追加されます。

## 自動テスト

GASコードのローカル検証は Node.js 20+ と Jest による単体テストスイート、および ESLint を使用して実行します。

```sh
npm test              # 単体テスト実行（Jest）
npm run test:coverage # カバレッジ測定（カバレッジ閾値の自動判定）
npm run lint          # ESLint検査（complexity 12 基準）
```

本番デプロイ後のスモークテストは、URLだけを指定するとReady確認と不正トークン確認を実行します。
正常POSTは行を追加するため、必要なときだけ`--write`を指定します。トークンは画面に表示されません。

```sh
GAS_URL='https://script.google.com/macros/s/DEPLOYMENT_ID/exec' \
  ./scripts/smoke-test-gas.sh

GAS_URL='https://script.google.com/macros/s/DEPLOYMENT_ID/exec' \
API_TOKEN='local-secret' ./scripts/smoke-test-gas.sh --write
```

異常系の例：

```sh
# JSON不正: invalid_json
curl -L -sS -X POST "$GAS_URL" -H 'Content-Type: application/json' -d '{'

# APIバージョン不一致: invalid_api_version
curl -L -sS -X POST "$GAS_URL" -H 'Content-Type: application/json' \
  -d "{\"api_version\":2,\"token\":\"$API_TOKEN\",\"temp\":24.5,\"press\":1012.3,\"hum\":55.8}"

# 不正トークン: invalid_token
curl -L -sS -X POST "$GAS_URL" -H 'Content-Type: application/json' \
  -d '{"api_version":1,"token":"wrong-token","temp":24.5,"press":1012.3,"hum":55.8}'

# 範囲外の測定値: invalid_payload
curl -L -sS -X POST "$GAS_URL" -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":85.1,\"press\":1012.3,\"hum\":55.8}"
```

検証エラーは現行仕様に従い、HTTPステータスではなくJSON本文の`ok:false`と`error`で判定します。

HTTP 302後に405が返る場合は、`/exec` URL、Webアプリデプロイ、匿名アクセス、`doPost(e)`を含むデプロイバージョンを確認してください。
