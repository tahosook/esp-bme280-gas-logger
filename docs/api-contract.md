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
| :--- | :--- | :--- | :--- |
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

GAS側で現在時刻を`Asia/Tokyo`として生成し、セルには`Date`オブジェクトを書き、セルの表示形式を`yyyy-MM-dd HH:mm:ss`（例：`2026-08-10 01:42:09`）にする。表示に`T`やタイムゾーン表記（`JST`、`+09:00`など）は付けない。シート名は `RawData`（旧名称 `DATA` または `2026` へのフォールバックあり）とし、次の列順で1行追記する。

```text
日時 | temp | press | hum | flag
```

- `flag`: GAS 内部で付与する補助列。正常データは空文字 `""`、異常値判定時は `anomaly` とする。
- ESP8266から日時と `flag` は送信しない。

### 重複送信の扱い（決定事項：排除する）

ファームウェアは通信失敗時に同一の測定値を最大3回・5秒間隔で再送する（実測待ち時間の上限は概ね100秒程度）。
このため、GAS側では同一値が短時間に複数回POSTされ得る。GASは `RawData` の**最終行のみ**を参照し、次の条件を満たす場合に
重複とみなして**行を追加せず**、成功レスポンス `{"ok":true}` を返す。

- 最終行の測定値（temp / press / hum）が今回のリクエストと一致する（`flag` は重複判定に含めない）
- 最終行の記録時刻が現在時刻から**180秒**以内である（重複判定の時間窓）

重複と判定した場合でも `{"ok":true}` を返すのは、ESP8266が「前回レスポンスを受け取れなかった」場合に再送しており、
GAS側で既に前回リクエストが正常処理済みであるケースを含むため。これにより、ESP8266は送信成功として再送ループを終了できる。
ESP8266側はレスポンス JSON の `ok:true` を成功扱いとし、**行が追加されたかどうかは成否判定に使わない**。

### 保存列の仕様

保存列は `日時 | temp | press | hum | flag` の5列に固定する。シート名は `RawData`（フォールバック: `DATA`, `2026`）とし、`日時` は Date値＋表示形式にする。
`flag` は空文字列として追加し、異常値検知で `anomaly` などを設定する。`device_id` 列は複数台化時に追加する（未実装）。

## センサーAPIとLINE Webhookの違い

本仕様はESP8266からのセンサー取り込みAPIを定義する。別エントリポイントとして、LINEプラットフォームからの
Webhook POST（`events` 配列を含むペイロード）も同じGAS Webアプリの `doPost` へ届くが、これはセンサーAPI契約とは
別であり、正本仕様書 [`docs/specs/line-webhook-contracts.md`](specs/line-webhook-contracts.md) の仕様（`X-Line-Signature`署名検証・コマンド解析）に従う。

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

### POST 成功

行が追加された場合、または重複と判定された場合：

```json
{
  "ok": true
}
```

HTTPステータスは`200`を返す。

### POST エラー

エラー時はHTTPステータス`200`で、次のJSONを返す。HTTPステータスではなく本文の`error`で判定する。

```json
{
  "ok": false,
  "error": "エラーコード"
}
```

#### エラーコード一覧

| エラーコード | 原因 |
| --- | --- |
| `invalid_json` | リクエスト本文がJSONとして解析できない、または`NaN`/`Infinity`を含む |
| `invalid_api_version` | `api_version`が欠損、数値型でない、または`1`以外の値 |
| `invalid_token` | `token`が欠損、空文字、文字列型でない、または設定値と一致しない |
| `invalid_payload` | 測定値の必須項目欠損、数値型でない、範囲外、`null` |
| `not_ready` | GAS側の設定（スプレッドシートID等）が未完了、またはシートへアクセス不能 |
| `internal_error` | スプレッドシートへの行追加失敗など、サーバー側の処理エラー |

ESP8266側では、HTTPステータスが200であっても`ok: false`の場合は送信失敗として扱い、ログにエラーコードを出力する。

## 変更しない範囲

移行作業では、APIバージョン`1`の形式、エンドポイントのURL構造、JSONの主要項目名を変更しない。
