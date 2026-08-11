# docs ドキュメント目次

本プロジェクトの設計・運用・テスト文書の案内。ロードマップの正本は `docs/implementation-roadmap.md` である。

## 位置づけ

本プロジェクトは、基盤移行（Phase 0〜6、`v1.0.0-stable`）を完了し、以降は日次集計・環境監視・LINE Bot の拡張（Phase 7〜17）を進める。

| 文書 | 内容 | 対象 |
| --- | --- | --- |
| [implementation-roadmap.md](implementation-roadmap.md) | 実装ロードマップ（正本）。Phase 0-6完了＋Phase 7-17 | 全体 |
| [api-contract.md](api-contract.md) | センサー受信API契約（POST / 応答 / エラーコード / 重複送信の扱い） | GAS・ファームウェア |
| [architecture.md](architecture.md) | システム構成・データフロー・モジュール分割・スプレッドシート設計 | 設計 |
| [deployment.md](deployment.md) | セットアップ・GASデプロイ・URL固定・実機書き込み手順 | 運用 |
| [release-plan.md](release-plan.md) | リリース単位・本番デプロイ・ロールバック・旧システム廃止 | 運用 |
| [implementation-tasks.md](implementation-tasks.md) | Phase 7以降のタスク一覧（決定 / 実装 / 検証、1タスク=1コミット） | 実装 |
| [test-plan.md](test-plan.md) | テスト計画（API・ファームウェア・実機・運用/通知） | 検証 |
| [test-results/](test-results/) | 検証記録（秘密情報なし） | 記録 |

## ルール

- ロードマップの正本は `implementation-roadmap.md` とする。
- 未決値（閾値・平滑化・簡易暑さ指数の式・重複判定の時間窓秒数など）は決定Issue（Phase 7 / 10 / 14 / 15）で確定するまで仕様として固定しない。
- 秘密情報（トークン・URL・スプレッドシートID・LINE秘密情報）は文書へ記載しない。
