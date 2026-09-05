# docs ドキュメント目次

本プロジェクトの設計・仕様・運用・テスト文書の案内です。ロードマップの正本は `docs/implementation-roadmap.md` です。

## 位置づけ

本プロジェクトは、基盤移行（Phase 0〜6、`v1.0.0-stable`）、日次集計・環境監視・LINE Bot の拡張（Phase 7〜19、`v1.1.0-stable` + PR #24）、内部品質改善・リファクタリング（Phase 20〜26）、LINE Bot UI 近代化・QuickChart 24h グラフ画像返信（PR #26〜#28）、Jest テスト移行・CI 自動化・生データアーカイブ・ESLint 複雑度管理（PR #31〜#37）、および正本仕様書群配備・ドキュメント整合性統一（PR #41〜#44、Phase 35〜39）を完了しています。

---

## 正本仕様書（Single Source of Truth: SSOT）

システムの主要な振る舞いやインターフェース契約を定義する最も優先度の高い仕様書です。

| 仕様書 | 内容 | 対象 |
| :--- | :--- | :--- |
| **[specs/alert-state-machine.md](specs/alert-state-machine.md)** | アラート判定・状態遷移ステートマシン正本仕様（多層防御・ヒステリシス・クールダウン・1日上限） | 監視・通知 |
| **[specs/line-webhook-contracts.md](specs/line-webhook-contracts.md)** | LINE Webhook 応答および UI 契約正本仕様（署名検証・コマンド正規化・Flex Message JSON・QuickChart） | LINE Bot |
| **[specs/data-lifecycle-and-aggregation.md](specs/data-lifecycle-and-aggregation.md)** | データライフサイクルおよび集計・アーカイブ正本仕様（4層ストレージ・Daily/Monthly集計・退避パージ） | データ管理 |

---

## 現行ドキュメント（Active）

| 文書 | 内容 | 対象 |
| :--- | :--- | :--- |
| [implementation-roadmap.md](implementation-roadmap.md) | 実装ロードマップ（正本）。全 Phase の進捗および方針 | 全体 |
| [api-contract.md](api-contract.md) | センサー受信API契約（POST / 応答 / エラーコード / 重複送信の扱い） | GAS・ファームウェア |
| [architecture.md](architecture.md) | システム構成・データフロー・モジュール分割・スプレッドシート設計概要 | 設計 |
| [line-bot-ui.md](line-bot-ui.md) | LINE Bot UI/UX コンセプト概要およびリッチメニュー推奨配置 | LINE Bot |
| [deployment.md](deployment.md) | セットアップ・GASデプロイ・URL固定・実機書き込み手順・Script Properties 一覧 | 運用 |
| [implementation-tasks.md](implementation-tasks.md) | タスク一覧（決定 / 実装 / 検証 / リファクタリング / 仕様策定） | 実装 |
| [test-plan.md](test-plan.md) | テスト計画・CIゲート基準（API・ファームウェア・実機・運用/通知） | 検証 |
| [test-results/](test-results/) | 直近の検証記録（秘密情報なし） | 記録 |

---

## アーカイブ（Archive）

過去の移行計画書や初期の検証ログは、参照用として以下に保管されています。

| ディレクトリ / 文書 | 内容 |
| :--- | :--- |
| [archive/README.md](archive/README.md) | アーカイブ文書の案内目次 |
| [archive/release-plan.md](archive/release-plan.md) | 旧リリース計画（v1.1.0〜v1.5.0移行期） |
| [archive/test-results/](archive/test-results/) | 初期（Phase 0〜6等）の検証記録 |

---

## ルール

- 仕様の詳細および契約の正本は `docs/specs/` 配下の 3 仕様書とする。
- ロードマップの正本は `implementation-roadmap.md` とする。
- 秘密情報（トークン・URL・スプレッドシートID・LINE秘密情報）は文書へ記載しない。
