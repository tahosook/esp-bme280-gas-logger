# GAS API

ESP8266からのJSON POSTを受け取り、Googleスプレッドシートへ測定値を追記するGoogle Apps Scriptです。

## Script Properties

GASエディタの **プロジェクトの設定 → スクリプト プロパティ** に、次の値を登録します。実値はリポジトリへ保存しません。

| 名前 | 内容 |
| --- | --- |
| `SPREADSHEET_ID` | 追記先スプレッドシートのID |
| `API_TOKEN` | ESP8266と共有する簡易トークン |
| `SHEET_NAME` | 追記先シート名。省略時は`DATA` |
| `DAILY_LAST_ROW` | 日次集計の前回処理済み行番号（1始まり） |
| `MONTHLY_LAST_ROW` | 月次集計の前回処理済み行番号（1始まり） |
| `WATCHDOG_NOTIFIED` | センサー未受信ウォッチドッグ通知済みフラグ |

スプレッドシートとGASプロジェクトのタイムゾーンは`Asia/Tokyo`に設定します。コード側でも日時を`Asia/Tokyo`で文字列化し、`yyyy-MM-dd HH:mm:ss`（例：`2026-08-10 01:42:09`）としてから追記します。

## デプロイ

本番デプロイのチェックリストとロールバック手順は、[GAS本番デプロイ手順](../docs/deployment.md#gasデプロイ)を使用してください。

1. GASプロジェクトへ`Router.gs`、`Ingest.gs`、`Config.gs`、`ErrorLog.gs`、`Monitor.gs`、`DailyAggregation.gs`、`MonthlyAggregation.gs`、`SetupTriggers.gs`と`appsscript.json`を配置する。`appsscript.json`には`USER_DEPLOYING`と`ANYONE_ANONYMOUS`のWebアプリ設定を含める。`doGet`・`doPost`・`jsonResponse_`は`Router.gs`に実装されている（`Code.gs`は削除済み）。
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

GASコードのローカル検証は、GASサービスをスタブ化した次のスクリプトで実行できます。

```sh
node scripts/test-gas-api.js
node scripts/test-config-monitor.gs.js
node scripts/test-errorlog.gs.js
node scripts/test-monitor.gs.js
node scripts/test-daily-aggregation.js
node scripts/test-watchdog.js
node scripts/test-monthly-aggregation.js
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
