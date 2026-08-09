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
| `temp` | number | yes | °C。現実的な温度範囲を検証する |
| `press` | number | yes | hPa。正の値であることを検証する |
| `hum` | number | yes | %。0〜100の範囲を検証する |

ESP8266側では、既存のAmbient送信処理の引数順（温度、湿度、気圧）とAPIの項目名（`temp`、`press`、`hum`）を混同しないようにする。

## 保存形式

GAS側で現在時刻を`Asia/Tokyo`として生成し、次の列順で1行追記する。

```text
日時 | temp | press | hum
```

ESP8266から日時は送信しない。

## 応答

成功時はHTTP 200とJSONを返す。

```json
{
  "ok": true
}
```

入力不備はHTTP 400、不正トークンはHTTP 401、サーバー内部エラーはHTTP 500として扱う方針とする。GAS Webアプリでの実際のステータスコードの扱いは、実装時に検証して必要なら応答仕様を更新する。

エラー本文には秘密情報を含めない。

## 受け入れ条件

- 正常なデータで1行追加される
- 日時が`Asia/Tokyo`で生成される
- 必須項目の欠損が拒否される
- `api_version`の不一致が拒否される
- 不正トークンが拒否される
- 数値でない値、範囲外の値、非有限値が拒否される
