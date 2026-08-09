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

GAS側で現在時刻を`Asia/Tokyo`として生成し、次の列順で1行追記する。

```text
日時 | temp | press | hum
```

ESP8266から日時は送信しない。

## 応答

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
