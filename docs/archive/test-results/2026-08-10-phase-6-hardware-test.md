# Phase 6: ハードウェアテスト結果

- 実施日: 2026-08-10
- 対象: v1.0.0-stable (main @ 81ba17a + Phase 6 レビュー)
- ボード: ESPr Developer / ESP8266
- シリアル速度: 115200 baud
- GAS API: `scripts/test-gas-api.js` (Node.jsユニットテスト)

## Phase 6 レビュー結果

ロードマップ（`docs/implementation-roadmap.md`）の Phase 6 レビュー項目を確認した。

| レビュー項目 | 結果 | 備考 |
| --- | --- | --- |
| 公開リポジトリに秘密情報がない | ✅ | `secrets.h`/`.clasp.json` は `.gitignore` 対象，未追跡 |
| APIの項目名と単位が一致している | ✅ | ファームウェア: `api_version`, `token`, `temp`, `press`, `hum` → API仕様と一致 |
| Wi-FiやHTTPS処理が無限待機しない | ✅ | Phase 5: Wi-Fi 30sタイムアウト，HTTPS 30sタイムアウト |
| リダイレクト回数に上限がある | ✅ | `http.setRedirectLimit(3)` を明示追加 (GASは1回の302リダイレクト) |
| 既存のセンサー処理を壊していない | ✅ | `BME280_I2C.ino` は変更なし |
| 実機テスト結果が記録されている | ✅ | 本ファイル参照 |

## 実機統合テスト

以下はユーザーが実機で確認した結果。秘密情報は含めない。

| 項目 | 結果 | 備考 |
| --- | --- | --- |
| ESP8266への書き込み | ✅ 成功 | Arduino IDE |
| Wi-Fi接続 | ✅ 成功 | 30秒以内に接続 |
| BME280測定 | ✅ 成功 | temp/press/hum 取得 |
| GASへのHTTPS POST | ✅ 成功 | HTTP 200, `{"ok":true}` |
| スプレッドシート追記 | ✅ 成功 | 1行追加確認 |
| Tokyo時刻記録 | ✅ 成功 | `yyyy-MM-dd HH:mm:ss` JST |
| 5分後deep sleep復帰 | ✅ 成功 | 300秒後再起動 |
| Wi-Fi切断タイムアウト | ✅ 成功 | 30秒後deep sleepへ |
| GASエラー時ログ | ✅ 動作 | `[gas]` タグでエラー出力 |
| 送信再試行 (3回) | ✅ 動作 | 失敗時5秒間隔で再試行 |
| ログ形式 `[tag]` | ✅ 確認 | `[sensor]`, `[wifi]`, `[gas]`, `[sleep]` |

## ローカル検証 (Codex実施)

| 項目 | 結果 |
| --- | --- |
| ファームウェアコンパイル | ✅ 成功 |
| GAS APIユニットテスト | ✅ 合格 |
| `git diff --check` | ✅ クリーン |
| 秘密情報Git混入 | ✅ なし |

## 安定版タグ

```text
v1.0.0-stable
```

Phase 0〜6 すべて完了。実機テスト済みのファームウェアをタグ付けする。