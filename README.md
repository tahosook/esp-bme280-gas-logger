# ESP8266 BME280 Gas Logger

ESP8266（ESPr Developer）とBME280で測定した温度・気圧・湿度を、AmbientからGoogleスプレッドシートへ移行する個人用ロガーです。

## プロジェクトの方針

- 無料で維持できる構成を優先する
- GitHubリポジトリはPublicで運用する
- `main`へ直接変更せず、タスクブランチ（`feat/*`, `fix/*`, `task/*` など）とPull Requestを使う
- Wi-Fiパスワード、APIトークン、GAS URLなどの秘密情報をコミットしない
- 通信失敗によるデータ欠損は許容し、永続的なオフラインキューは作らない
- GASデプロイとESP8266への書き込みは、人間が確認してから実施する

## ハードウェア

- ボード: ESPr Developer / ESP8266
- センサー: BME280（I2C）
- センサーアドレス: `0x76`
- 測定間隔: 5分（`ESP.deepSleep()`）
- シリアルモニター: 115200 baud

既存のBME280読み取り処理とスリープ動作は、次のリポジトリを原典として扱います。

<https://github.com/tahosook/sketch_ambidata>

Ambient送信処理を含む移行前のベースラインは
[`firmware/esp8266_bme280_gas_logger`](firmware/esp8266_bme280_gas_logger/)に
登録しています。GAS API への置き換えは完了しています。

## データ仕様

| 項目 | 単位 | 説明 |
| --- | --- | --- |
| `temp` | °C | 温度 |
| `press` | hPa | 気圧 |
| `hum` | % | 湿度 |

APIバージョンは`1`から開始し、スプレッドシートの日時はGAS側で`Asia/Tokyo`として生成します。

詳細は[API仕様](docs/api-contract.md)と[構成](docs/architecture.md)を参照してください。

## 開発の進め方

1. 作業ごとにタスクブランチ（`feat/*`, `fix/*`, `task/*` など）を作成する
2. 1つの目的に絞って変更する
3. ローカル検証（`npm test`, `npm run test:coverage`, `npm run lint`）と差分レビューを行う
4. Pull Requestを作成する
5. 確認後に`main`へマージする

テスト実行環境として Node.js 20+ と Jest を使用しています。

```sh
npm test              # 単体テスト実行
npm run test:coverage # カバレッジ測定
npm run lint          # ESLint検査
```

Phaseごとの作業内容は[実装ロードマップ](docs/implementation-roadmap.md)に記載しています。

## ドキュメント

設計・運用・テストの詳細は[docs/README.md](docs/README.md)の目次を起点として参照してください。

## セットアップとデプロイ

開発環境、GASの設定、ファームウェア書き込み手順は[デプロイ手順](docs/deployment.md)を参照してください。

実機書き込みやGASデプロイが完了したとは、実際の確認結果が記録されるまで扱いません。

## ライセンス

既存スケッチからコードを移行する際は、原典のMITライセンスと著作権表示を引き継ぎます。
