## 目的
<!-- 変更の背景と解決する課題 -->

## 変更内容
<!-- 実施した主要な変更点 -->

## 変更しない範囲
<!-- スコープ外として維持した既存機能・コード -->

## 受け入れ条件
- [ ]

## 実行したテスト・検証結果
- `npm run lint`:
- `npm test`:
- `npm run test:coverage`:
- `git diff --check`:

## 安全性・デプロイ確認
- [ ] シークレット確認: Wi-Fi パスワード、API トークン、GAS URL 等が含まれていないこと
- [ ] GAS デプロイ要否: [ ] 必要 / [ ] 不要
- [ ] 実機確認要否: [ ] 実施 / [ ] 不要（理由: ）

## 未解決事項
- なし

---

## AI Agent / Contributor 自己点検チェックリスト（AGENTS.md 準拠）
PR を作成する前に、以下の項目をすべて確認してチェックを入れてください。

### 1. ランタイム互換性 & 外部仕様 (AGENTS.md Section 2, 3)
- [ ] **GAS エクスポートガード**: `gas/` 配下の `module.exports` はすべて `if (typeof module !== 'undefined' && module.exports)` で保護されているか
- [ ] **Node 固有依存の排除**: `gas/` の本番コード内で `require()` や Node 固有グローバル（`process`, `fs` 等）を使用していないか
- [ ] **JST 基準**: 日時計算・表示・集計・スヌーズ判定はすべて `Asia/Tokyo` (UTC+9) 基準で行われているか（スヌーズ基準アンカー: 翌朝 08:00 JST）
- [ ] **後方互換性**: LINE コマンド仕様（NOW, SNOOZE, TRENDS, CLEAR）やセンサー受信 JSON スキーマ（temp, press, hum）を破壊していないか

### 2. 関数設計 & 複雑度抑止 (AGENTS.md Section 3)
- [ ] **過剰分割の抑止**: 単なるオブジェクト生成や1行の比較式のような自明なマイクロ関数（3〜5行）を乱立させていないか
- [ ] **ガード節優先**: ネストの深い `if` を避け、条件反転による早期 return で平坦化されているか
- [ ] **ドメイン関数の保護**: 判定・計算ロジック（`calculateDiscomfortIndex_`, `detectAnomaly_` 等）の凝集性を損なっていないか
- [ ] **定数の一元化**: マジックナンバーを直書きせず、`gas/Config.gs`（`DEFAULT_CONFIG`）や `PropertiesService` に集約されているか
- [ ] **シート API 安全性**: `sheet.deleteRows(2, 0)` や `getRange(0, 0)` 等の境界外・引数 0 の危険な呼び出しを行っていないか

### 3. 厳格な否定制約 (AGENTS.md Section 4)
- [ ] **トランスパイル禁止**: TypeScript、Babel、Webpack、Rollup 等の重厚なビルドツールを導入していないか
- [ ] **排他制御の保護**: スプレッドシート読み書き時の `LockService` 排他制御をバイパス・削除していないか
- [ ] **main 直 push 禁止**: トピックブランチを経由して PR を作成しているか

### 4. 定量的品質基準 (Definition of Done / AGENTS.md Section 6)
- [ ] `npm run lint` が exit code 0 でパスしているか（ESLint 複雑度 12 超過なし）
- [ ] `npm test` が exit code 0 でパスしているか（全テストスイート 100% 成功）
- [ ] `npm run test:coverage` が exit code 0 でパスし、カバレッジ基準（Branches >= 80%, 他 >= 85%）を満たしているか
- [ ] `git diff --check` で不要な空白・改行不整合がないか
