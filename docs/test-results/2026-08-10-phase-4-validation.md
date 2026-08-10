# Phase 4: 通信・実機検証結果

- 実施日: 2026-08-10
- 対象: PR #10 (Phase 3) + Phase 5 ローカル検証
- ボード: ESPr Developer / ESP8266
- シリアル速度: 115200 baud
- GAS API: `scripts/test-gas-api.js` (Node.jsユニットテスト)

## ローカル検証 (Codex実施)

| 項目 | 結果 | 備考 |
| --- | --- | --- |
| ESP8266スケッチコンパイル | ✅ 成功 | `--fqbn esp8266:esp8266:generic`, RAM 37% |
| GAS APIユニットテスト | ✅ 合格 | `node scripts/test-gas-api.js` |
| 秘密情報Git追跡外確認 | ✅ OK | `secrets.h` は `.gitignore` 対象 |
| `secrets.h` パスワード・トークン記録なし | ✅ OK | 公開リポジトリ汚染なし |

## Phase 4 検証項目 (test-plan.md より)

以下は実機・GASデプロイ後に確認すべき項目。コードレビューに基づく期待動作を記載。

| 項目 | 期待動作 | 検証方法 | 現在のステータス |
| --- | --- | --- | --- |
| Wi-Fi接続 | `WiFi.begin()` 後30秒以内に `WL_CONNECTED` | シリアルモニター | コード確認済: `initWifi()` タイムアウト実装 |
| BME280読み取り | temp/press/hum が取得される | シリアル `[sensor]` ログ | コード確認済: `readBME280_I2C()` 保持 |
| HTTPS POST | GASへJSON送信，HTTP 200受信 | シリアル `[gas]` ログ | コード確認済: `sendToGAS()` 実装 |
| HTTP 200成功判定 | `{"ok":true}` レスポンスで判定 | シリアル `[gas]` ログ | コード確認済: レスポンスJSONの`ok`フィールドで判定 |
| GASリダイレクト | 302追従後HTTP 200を取得 | `setFollowRedirects()` | コード確認済: `HTTPC_FORCE_FOLLOW_REDIRECTS` |
| スプレッドシート追記 | 1行追加される | スプレッドシート確認 | GAS APIテストで検証済 |
| Tokyo時刻記録 | `yyyy-MM-dd HH:mm:ss` JST | スプレッドシート確認 | GAS APIテストで検証済: `Utilities.formatDate(..., 'Asia/Tokyo', ...)` |
| 5分後deep sleep復帰 | 300秒後に再起動 | シリアルログタイムスタンプ | コード確認済: `ESP.deepSleep(5 * 60 * 1000 * 1000)` |
| Wi-Fi切断タイムアウト | 30秒後にタイムアウトしdeep sleepへ | シリアル `[wifi] FAILED` ログ | **Phase 5実装済** |
| GASエラー時ログ出力 | `error` コードがシリアル出力 | シリアル `[gas]` ログ | コード確認済 |

## Phase 5 実装による検証強化

Phase 5 実装により以下が追加された：

| 項目 | 実装内容 |
| --- | --- |
| Wi-Fi接続タイムアウト | 30秒 (WIFI_TIMEOUT_MS = 30000) |
| HTTPS通信タイムアウト | 30秒 (HTTP_TIMEOUT_MS = 30000) |
| 送信再試行 | 最大3回 (MAX_SEND_RETRIES = 3) |
| 無限ループ防止 | Wi-Fi失敗時スキップ，失敗後もdeep sleepへ進む |
| シリアルログ形式 | `[tag] message` 形式で標準化 |
| データ精度統一 | `roundf(val * 100) / 100` で小数点以下2桁に丸め |**Phase 5実装済** |

## 備考

- 実機テストとGAS本番デプロイはユーザーが確認後に実施する。
- 実機テストで得られた温度・湿度・気圧の実測値は、秘密情報ではないため
  `docs/test-results/` へ記録可能だが、IPアドレス・Wi-Fi情報・トークンは記録しない。
- データ欠損は許容するため、永続的なオフラインキューは実装しない。