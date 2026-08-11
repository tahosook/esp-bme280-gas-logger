# GAS API仕様

## 概要

ESP8266からGAS Webアプリへ、BME280の測定値をJSONで送信する。APIバージョンは`1`とする。

## リクエスト

- メソッド: `POST`
- Content-Type: `application/json`
- URL: GAS WebアプリのデプロイURL（秘密情報として扱う）

```json
{
  "api_version": 1,
  "token": "local-secret",
  "temp": 24.5,
  "press": 1012.3,
  "hum": 55.8
}
```

## フィールド

| フィールド | 型 | 必須 | 単位・条件 |
| --- | --- | --- | --- |
| `api_version` | integer | yes | 現在は`1`のみ |
| `token` | string | yes | GAS側で検証する簡易トークン |
| `temp` | number | yes | °C。`-40.0`以上`85.0`以下 |
| `press` | number | yes | hPa。`300.0`以上`1100.0`以下 |
| `hum` | number | yes | %。`0.0`以上`100.0`以下 |

### 入力検証規則

- 必須項目が欠損している場合は拒否する。
- `api_version`はJSONの数値型で、数値としての値`1`だけを受理する。文字列、真偽値、配列などは受理しない。
- `token`はJSONの文字列型で、GAS側の設定値と完全一致する必要がある。欠損、空文字、不一致は拒否する。
- 測定値はJSONの数値型かつ有限値でなければならない。`null`、文字列、配列は`invalid_payload`、`NaN`や`Infinity`はJSON解析時に`invalid_json`として拒否する。
- 上記の測定値の範囲は境界値を含む。
- 未知の追加フィールドは無視する。
- リクエスト本文をJSONとして解析できない場合は拒否する。

ESP8266側では、既存のAmbient送信処理の引数順（温度、湿度、気圧）とAPIの項目名（`temp`、`press`、`hum`）を混同しないようにする。

## 保存形式

GAS側で現在時刻を`Asia/Tokyo`として生成し、セルには`Date`オブジェクトを書き、セルの表示形式を`yyyy-MM-dd HH:mm:ss`（例：`2026-08-10 01:42:09`）にする（Phase 7で決定）。表示に`T`やタイムゾーン表記（`JST`、`+09:00`など）は付けない。シート名は`DATA`とし、次の列順で1行追記する。

```text
日時 | temp | press | hum | flag
```

- `flag`: GAS 内部で付与する補助列。正常データは空文字 `""`、異常値判定時は `anomaly` とする。
- ESP8266から日時と `flag` は送信しない。

### 重複送信の扱い（決定事項：排除する）

ファームウェアは通信失敗時に同一の測定値を最大3回・5秒間隔で再送する（実測待ち時間の上限は概ね100秒程度）。
このため、GAS側では同一値が短時間に複数回POSTされ得る。GASはDATAの**最終行のみ**を参照し、次の条件を満たす場合に
重複とみなして**行を追加せず**、成功レスポンス `{"ok":true}` を返す。

- 最終行の測定値（temp / press / hum）が今回のリクエストと一致する（`flag` は重複判定に含めない）
- 最終行の記録時刻が現在時刻から**180秒**以内である（重複判定の時間窓、Phase 7で決定）

重複と判定した場合でも `{"ok":true}` を返すのは、ESP8266が「前回レスポンスを受け取れなかった」場合に再送しており、
GAS側で既に前回リクエストが正常処理済みであるケースを含むため。これにより、ESP8266は送信成功として再送ループを終了できる。
ESP8266側はレスポンス JSON の `ok:true` を成功扱いとし、**行が追加されたかどうかは成否判定に使わない**。

### 保存列の追加（決定済み）

保存列は `日時 | temp | press | hum | flag` の5列に固定する。シート名は `Sheet1` → `DATA` に変更し、`日時` は Date値＋表示形式にする（Phase 7で決定）。
`flag` は Phase 7 で空文字列として追加し、異常値検知（Phase 10/11）で `anomaly` などを設定する。`device_id` 列は複数台化時に追加する（未実装）。

## センサーAPIとLINE Webhookの違い

本仕様はESP8266からのセンサー取り込みAPIを定義する。別エントリポイントとして、LINEプラットフォームからの
Webhook POST（`events` 配列を含むペイロード）も同じGAS Webアプリの `doPost` へ届くが、これはセンサーAPI契約とは
別であり、`docs/architecture.md` の `LineBot.gs` の仕様（`X-Line-Signature`署名検証・コマンド解析）に従う。

## 応答

### GET Ready確認

`GET`はデプロイ後の設定確認用に使用する。`SPREADSHEET_ID`、`API_TOKEN`、`SHEET_NAME`が設定され、対象シートへアクセスできる場合だけReadyとする。測定値の追記や秘密情報の返却は行わない。

Ready時：

```json
{
  "ok": true,
  "ready": true
}
```

未設定または対象シートへアクセスできない場合：

```json
{
  "ok": false,
  "ready": false,
  "error": "not_ready"
}
```

GETのReady確認が成功しても、POSTのJSON解析・トークン検証・行追記が成功することまでは保証しない。POSTの正常系・異常系テストは別途実施する。

成功時はHTTP 200と次のJSONを返す。

```json
{
  "ok": true
}
```

### エラーコード

エラー時は、次のJSONを返す。`error`はこの一覧に限定し、エラー本文に秘密情報や測定値を含めない。

| `error` | 意味 | 対象 |
| --- | --- | --- |
| `invalid_json` | JSONとして解析できない。`NaN`や`Infinity`のようなJSONで表現できない数値トークンを含む | JSON不正 |
| `invalid_api_version` | `api_version`が欠損、型不正、または`1`以外 | APIバージョン不一致 |
| `invalid_token` | `token`が欠損、空文字、型不正、または不一致 | 認証失敗 |
| `invalid_payload` | 測定値の欠損、型不正、または範囲外 | 入力値不正 |
| `internal_error` | シート追記など、サーバー側の予期しない失敗 | サーバー内部エラー |

```json
{
  "ok": false,
  "error": "invalid_payload"
}
```

#### HTTPステータスの扱い（決定事項）

GAS Webアプリの`doPost`は`ContentService`の`TextOutput`を返す仕組みであり、このプロジェクトではアプリケーションエラーに対してHTTP 400/401/500を設定できることを前提にしない。したがって、GAS実装は成功・検証エラーともHTTP 200でJSONを返し、ESP8266はHTTPステータスだけで成否を判定しない。

- HTTP 200かつ`{"ok":true}`: 成功。
- HTTP 200かつ`{"ok":false,"error":"..."}`: APIが返した失敗。`error`をログ出力し、成功扱いにしない。
- HTTP 200以外、レスポンス本文がJSONでない、または`ok`がbooleanでない: 通信またはサーバー障害として失敗扱いにする。

HTTP 400/401/500は、将来GAS以外の実装へ移行した場合に使用できる予約上の意味とするが、現行GAS実装の受け入れ条件にはしない。

エラー本文には秘密情報を含めない。

## 受け入れ条件

- 正常なデータで1行追加される
- 日時が`Asia/Tokyo`で生成される
- 必須項目の欠損が拒否される
- `api_version`の不一致が拒否される
- 不正トークンが拒否される
- 数値でない値、範囲外の値、JSONで表現できない非有限値が拒否される
- エラーコードが上記の最終一覧に一致する
- HTTPステータスに依存せず、レスポンスJSONの`ok`で成功・失敗を判定できる

## 仕様上の決定事項

- 現行GAS Webアプリでは、アプリケーションエラーのHTTP 400/401/500を必須にしない。
- 成否の正式な判定方法は、レスポンスJSONの`ok`フィールドとする。
- エラーコードの最終一覧は`invalid_json`、`invalid_api_version`、`invalid_token`、`invalid_payload`、`internal_error`とする。
- GAS実装時は、検証エラーと予期しないサーバーエラーを捕捉して、可能な限り上記形式のJSONを返す。捕捉できない失敗やGAS基盤の応答は、ESP8266側でHTTP非200またはJSON不正として失敗扱いにする。

GAS Webアプリの`doPost`と`ContentService`の仕様は、Google公式ドキュメントを参照する。

- <https://developers.google.com/apps-script/guides/web>
- <https://developers.google.com/apps-script/guides/content>
