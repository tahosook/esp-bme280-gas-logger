# LINE Bot UI / UX 概要

本ドキュメントは、`esp-bme280-gas-logger` における LINE Bot の対話インターフェース（UI/UX）のハイレベルなコンセプト概要およびリッチメニュー配置を定めたものです。

> [!IMPORTANT]
> **正本仕様書（Single Source of Truth: SSOT）への委譲**:
> - LINE Messaging API Webhook 応答、コマンド正規化契約、詳細な Flex Message JSON 構造、QuickChart 画像生成、Postback（datetimepicker）イベント処理の厳密な仕様は、正本仕様書 **[`docs/specs/line-webhook-contracts.md`](specs/line-webhook-contracts.md)** を参照してください。
> - アラート判定パイプライン、平滑化、ヒステリシス、クールダウン、1日上限等の状態遷移は、正本仕様書 **[`docs/specs/alert-state-machine.md`](specs/alert-state-machine.md)** を参照してください。

---

## 1. UI/UX コンセプトと設計方針

1. **視覚的かつ直感的な Flex Message**:
   - テキスト主体の通知から、視覚的な「Flex Message」バブルカードへ刷新。
   - 現在の監視状態（Active / SNOOZE中）や快適度（不快指数 DI）をステータスカラーで即座に識別可能。
2. **LINE 無料枠（月200通）の厳格な保護**:
   - アラート通知の極小化と 1 時間クールダウン、1 日最大 5 回ガード。
   - 正常復帰通知は送信せず、ユーザーが気になった時に `NOW` コマンドで確認するオンデマンド運用。
   - ユーザーからの受信メッセージに対する返信（Reply API）は無料枠カウント対象外であることを活用。
3. **ワンタップ操作とスヌーズ機能**:
   - アラート通知や状況確認カードから、ワンタップで翌朝 08:00 JST までのスヌーズ（一時停止）や監視再開（CLEAR）が可能。
   - LINE 標準の `datetimepicker` による特定日時までのカスタムスヌーズにも対応。
4. **24時間温湿度推移グラフのオンデマンド確認**:
   - `TRENDS` コマンドにより、直近 24 時間の測定データを QuickChart API 経由で画像化して返信。
   - LINE Messaging API の 2,000 文字制限をクリアするためのサンプリング・URL 圧縮機構を内蔵。

---

## 2. コマンド体系一覧

大文字・小文字、全角・半角、前後の空白は自動正規化されます。

| コマンド | 代表エイリアス | 返信形式 | アクション概要 |
| :--- | :--- | :--- | :--- |
| **`NOW`** | `now`, `状況`, `状態`, `現在`, `status` | **Flex Message** | 現在の監視状態・最新測定値（室温・湿度・気圧・気圧差分・快適度）カードを返信 |
| **`SNOOZE`** | `snooze`, `スキップ`, `おやすみ`, `skip` | **Flex Message** | 翌朝 08:00 JST までアラート通知を停止し、設定完了カード（日時指定ボタン付き）を返信 |
| **`TRENDS`** | `trends`, `グラフ`, `24h`, `推移` | **Image Message** | 直近 24 時間の温湿度推移グラフ画像（QuickChart）を返信 |
| **`CLEAR`** | `clear`, `クリア`, `解除` | **Text Message** | スヌーズを解除し、監視状態をリセットして通常監視を再開 |

※ 各コマンドの詳細な正規化アルゴリズムや応答契約は [`docs/specs/line-webhook-contracts.md`](specs/line-webhook-contracts.md) を参照。

---

## 3. 主要カードのレイアウト概要

### 3.1 NOW（状況）カード
- **ヘッダー**: 監視稼働状態に応じて動的に色とラベルが切り替わります。
  - 通常監視中: 🔔 **監視中（Active）**（緑色 `#27ae60`）
  - スヌーズ中: 🔕 **SNOOZE中**（オレンジ色 `#e67e22`）＋ 停止期限表示
- **ボディ**: 最新の室温、湿度、気圧、直近3時間の気圧変化量（$\Delta P$）、および不快指数（DI）に基づく快適度ステータスバッジ。
- **フッター**: 状態に応じたワンタップアクションボタン（SNOOZE / CLEAR / TRENDS）。

### 3.2 SNOOZE（設定完了）カード
- **ヘッダー**: 🔕 **SNOOZE設定完了**（`#e67e22`）
- **ボディ**: 停止期限（翌朝 08:00 JST または指定日時）と現在測定値の表示。
- **フッター**: 「🗓️ 日時を指定」（datetimepicker）ボタンおよび「🔔 監視を再開」（CLEAR）ボタン。

### 3.3 アラートプッシュ通知カード
- **ヘッダー**: ⚠️ **室温・湿度 警告**（赤色 `#e74c3c`）
- **ボディ**: 超過した測定値と現在状態をミニマルに表示。
- **フッター**: `[ 🔕 翌朝8時までSNOOZE ]` ボタン（即座に連続通知を停止可能）。

---

## 4. リッチメニューの推奨配置

LINE Official Account Manager 等で以下の 3 枠リッチメニューの配置を推奨します。

```text
┌─────────────────┬─────────────────┬─────────────────┐
│                 │                 │                 │
│   🔕 SNOOZE     │    🌡️ NOW       │   📈 TRENDS     │
│  (翌朝まで停止)  │   (現在の状況)   │  (24時間推移)   │
│                 │                 │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

- **左枠**: `[🔕 SNOOZE]` (アクション: テキスト「SNOOZE」を送信)
- **中央枠**: `[🌡️ NOW]` (アクション: テキスト「NOW」を送信)
- **右枠**: `[📈 TRENDS]` (アクション: テキスト「TRENDS」を送信)

---

## 5. 詳細仕様へのリンク

- **LINE Webhook 契約・Flex Message JSON・QuickChart 仕様**:
  [`docs/specs/line-webhook-contracts.md`](specs/line-webhook-contracts.md)
- **アラート判定・状態遷移ステートマシン仕様**:
  [`docs/specs/alert-state-machine.md`](specs/alert-state-machine.md)
- **セットアップ手順・手動デバッグ（`DebugTest.gs`）**:
  [`docs/deployment.md`](deployment.md)
