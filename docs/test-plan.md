# テスト計画

## 方針

検証をGAS API単体、ESP8266ファームウェア、実機統合の順に分ける。実機テストとGASデプロイは人間の確認後に行う。

## Phase 0：リポジトリ

- `git diff --check`が成功する
- Publicリポジトリへ秘密情報が含まれていない
- `main`へ直接変更せず、作業ブランチとPull Requestを使う
- README、構成、API、デプロイ、テスト方針が文書化されている

## GAS API単体

| ケース | 期待結果 |
| --- | --- |
| 正常なJSON | HTTP 200、`{"ok":true}`、シートに1行追加 |
| JSON不正 | HTTP 200、`{"ok":false,"error":"invalid_json"}`、行を追加しない |
| 測定値の必須項目欠損 | HTTP 200、`{"ok":false,"error":"invalid_payload"}`、行を追加しない |
| `api_version`または`token`の必須項目欠損 | それぞれ`invalid_api_version`または`invalid_token`、行を追加しない |
| APIバージョン不一致 | HTTP 200、`{"ok":false,"error":"invalid_api_version"}`、行を追加しない |
| 不正トークン | HTTP 200、`{"ok":false,"error":"invalid_token"}`、行を追加しない |
| 範囲外・非有限の数値 | HTTP 200、`{"ok":false,"error":"invalid_payload"}`、行を追加しない |
| 各測定値の境界値 | 受理され、シートに1行追加される |
| `null`、文字列、配列 | `invalid_payload`、行を追加しない |
| 未知の追加フィールド | 追加フィールドを無視して受理される |
| シート追記などのサーバー内部エラー | HTTP 200、`{"ok":false,"error":"internal_error"}`を返せること |
| HTTP非200またはJSON不正の応答 | ESP8266側で失敗扱いにし、成功扱いにしない |

## ファームウェア

- ESP8266向け設定でコンパイルできる
- シリアル速度115200で起動ログが読める
- BME280から温度・気圧・湿度を取得できる
- JSONの項目名と単位がAPI仕様に一致する
- HTTPS POSTのステータスと応答本文を出力する
- 送信後にdeep sleepへ移行する

## 実機統合

人間が以下を確認し、結果を`docs/test-results/`へ秘密情報なしで記録する。

- Wi-Fi接続
- BME280測定
- GASへのHTTPS POST
- スプレッドシートへの行追加
- Tokyo時刻の記録
- 5分後のdeep sleep復帰
- Wi-Fi切断時のタイムアウト
- GASエラー時のログ

通信失敗によるデータ欠損は許容する。永続的なオフラインキューは実装しない。
