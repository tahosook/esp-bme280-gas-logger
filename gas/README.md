# GAS API

ESP8266からのJSON POSTを受け取り、Googleスプレッドシートへ測定値を追記するGoogle Apps Scriptです。

## Script Properties

GASエディタの **プロジェクトの設定 → スクリプト プロパティ** に、次の値を登録します。実値はリポジトリへ保存しません。

| 名前 | 内容 |
| --- | --- |
| `SPREADSHEET_ID` | 追記先スプレッドシートのID |
| `API_TOKEN` | ESP8266と共有する簡易トークン |
| `SHEET_NAME` | 追記先シート名。省略時は`Sheet1` |

スプレッドシートとGASプロジェクトのタイムゾーンは`Asia/Tokyo`に設定します。コード側でも日時を`Asia/Tokyo`で文字列化してから追記します。

## デプロイ

本番デプロイのチェックリストとロールバック手順は、[GAS本番デプロイ手順](../docs/deployment.md#gasデプロイ)を使用してください。

1. GASプロジェクトへ`Code.gs`と`appsscript.json`を配置する。`appsscript.json`には`USER_DEPLOYING`と`ANYONE_ANONYMOUS`のWebアプリ設定を含める。
2. Script Propertiesを設定する。
3. **デプロイ → 新しいデプロイ → ウェブアプリ** を選択する。
4. 実行ユーザーはスプレッドシートへ書き込めるアカウントを選択する。
5. アクセスできるユーザーをESP8266からの匿名HTTPS POSTが可能な設定にする。
6. 発行された`/exec` URLをローカルの秘密情報設定へ保存する。

GASの本番デプロイは、コードと設定を人間が確認してから実施します。

## curlテスト

`GAS_URL`と`API_TOKEN`はローカルシェルで設定し、ログや公開資料へ実値を残さないでください。

正常系：

```sh
curl -L -sS -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":24.5,\"press\":1012.3,\"hum\":55.8}"
```

期待値は`{"ok":true}`で、シートに`日時 | temp | press | hum`の1行が追加されます。

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
