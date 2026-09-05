# docs ドキュメント目次

本プロジェクトの設計・運用・テスト文書の案内。ロードマップの正本は `docs/implementation-roadmap.md` である。

## 位置づけ

本プロジェクトは、基盤移行（Phase 0〜6、`v1.0.0-stable`）、日次集計・環境監視・LINE Bot の拡張（Phase 7〜19、`v1.1.0-stable` + PR #24）、内部品質改善・リファクタリング（Phase 20〜26）、LINE Bot UI 近代化・QuickChart 24h グラフ画像返信（PR #26〜#28）、および Jest テスト移行・CI 自動化・生データアーカイブ・ESLint 複雑度管理とマイクロヘルパー集約（PR #31〜#37）を完了している。

## 現行ドキュメント（Active）

| 文書 | 内容 | 対象 |
| --- | --- | --- |
| [implementation-roadmap.md](implementation-roadmap.md) | 実装ロードマップ（正本）。Phase 0-19完了、Phase 20-26リファクタリング、UI近代化、テスト・アーカイブ・品質改善 | 全体 |
| [api-contract.md](api-contract.md) | センサー受信API契約（POST / 応答 / エラーコード / 重複送信の扱い） | GAS・ファームウェア |
| [architecture.md](architecture.md) | システム構成・データフロー・モジュール分割・スプレッドシート設計 | 設計 |
| [line-bot-ui.md](line-bot-ui.md) | LINE Bot UI/UX仕様（Flex Message・QuickChart グラフ・コマンド体系） | LINE Bot |
| [deployment.md](deployment.md) | セットアップ・GASデプロイ・URL固定・実機書き込み手順 | 運用 |
| [implementation-tasks.md](implementation-tasks.md) | タスク一覧（Phase 7-19、Phase 20-26、UI近代化、アーカイブ・テスト・品質改善） | 実装 |
| [test-plan.md](test-plan.md) | テスト計画（API・ファームウェア・実機・運用/通知・LINE Bot） | 検証 |
| [test-results/](test-results/) | 直近の検証記録（秘密情報なし） | 記録 |

## アーカイブ（Archive）

過去の移行計画書や初期の検証ログは、参照用として以下に保管されている。

| ディレクトリ / 文書 | 内容 |
| --- | --- |
| [archive/README.md](archive/README.md) | アーカイブ文書の案内目次 |
| [archive/release-plan.md](archive/release-plan.md) | 旧リリース計画（v1.1.0〜v1.5.0移行期） |
| [archive/test-results/](archive/test-results/) | 初期（Phase 0〜6等）の検証記録 |

## ルール

- ロードマップの正本は `implementation-roadmap.md` とする。
- 閾値・平滑化・簡易暑さ指数（不快指数DI）・重複時間窓・Configシート方針・LINE Bot翌朝8:00スキップ仕様は確定済み。新たに生じた未決値は、決定まで仕様として固定しない。
- 秘密情報（トークン・URL・スプレッドシートID・LINE秘密情報）は文書へ記載しない。
