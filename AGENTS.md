# AGENTS.md

## Repository Overview

Personal ESP8266 (ESPr Developer) + BME280 environmental logger that records temperature, pressure, and humidity to Google Sheets via Google Apps Script (GAS) Web API, with LINE Bot notifications and QuickChart trend visualization.

- Upstream sensor reference: https://github.com/tahosook/sketch_ambidata (preserve working BME280 measurement algorithm & MIT attribution).
- Free-tier hobby project: keep architecture simple and zero-cost; no offline queue (transient packet drops are acceptable).

## Essential Commands

Always run and verify local checks before submitting changes:

```bash
npm test              # Run Jest unit test suite
npm run test:coverage # Enforce coverage thresholds (branches: 80%, others: 85%)
npm run lint          # Check ESLint rules (complexity threshold: 12)
git diff --check      # Check for whitespace and line break issues
```

Do NOT alter production behavior or domain logic just to pass lint; diagnose structural and design root causes first.

## Dual-Environment Runtime & Export Guards

1. **Production**: Google Apps Script (GAS V8 engine).
   - Global scope is shared across all `.gs` files in `gas/`.
   - No Node.js built-in modules (`fs`, `path`, etc.) or bundlers/transpilers.
   - Do NOT use Node.js `require` in production code.
2. **Local / CI**: Node.js 20+ with Jest.
   - Guard all module exports to protect the GAS runtime while allowing Jest tests:
     ```javascript
     if (typeof module !== 'undefined' && module.exports) {
       module.exports = { myFunction };
     }
     ```

## Timezone & Datetime Semantics

- User-facing timestamps, spreadsheet display formats (`yyyy-MM-dd HH:mm:ss`), daily/monthly aggregation boundaries, and domain alert/snooze evaluation must strictly maintain **`Asia/Tokyo` (JST / UTC+9)** semantics.
- When handling external timestamps or Unix epochs, preserve their precise time meaning and perform explicit timezone conversions when mapping to JST.

## Complexity & Refactoring Principles

1. **Complexity Threshold (`eslint.config.js`)**:
   - The complexity threshold is `12` (`["warn", 12]`).
   - Do not mechanically minimize complexity numbers or chase metrics at the expense of clarity and cohesion.
2. **No Trivial Micro-Helpers**:
   - Avoid creating micro-helpers solely to reduce complexity: no trivial single-line wrappers, pass-through functions, simple getters, or one-line predicates.
   - Do not over-decompose UI/JSON builders (Flex Message cards in `gas/LineBot.gs`, QuickChart URL generator in `gas/Metrics.gs`).
3. **Preserve Domain Semantics**:
   - Keep cohesive domain functions intact even if short; do NOT inline or delete them:
     - `calculateDiscomfortIndex_` (`gas/Metrics.gs`)
     - `calculatePressureTrend_` (`gas/Metrics.gs`)
     - `evaluateConditionState_` (`gas/Monitor.gs`)
     - `detectAnomaly_` (`gas/Monitor.gs`)
     - `evaluateAlertDecision_` (`gas/Metrics.gs`)
4. **Refactoring Rules**:
   - Investigate before editing: confirm root causes before proposing changes.
   - Keep changes minimal and focused (prefer one purpose per branch and PR).
   - Preserve existing behavior; do NOT bundle unrelated cleanups or re-formatting.

## External Boundaries & Security

1. **Secrets & Privacy**:
   - Public repository: NEVER commit Wi-Fi passwords, API tokens, GAS deployment URLs, or LINE channel secrets.
   - Local secrets reside in ignored files (`secrets.h`, `gas/.clasp.json`); commit only placeholders in `secrets.example.h`.
2. **External I/O & Spreadsheet Operations**:
   - Preserve existing concurrency protection and `LockService` boundaries around spreadsheet read-modify-write operations; do not bypass or remove existing locks.
   - Safe row operations: validate indexes and counts before calling Spreadsheet APIs; avoid dangerous calls like `sheet.deleteRows(2, 0)`.
   - Default raw data sheet is `RawData` (with fallback to `2026` or `DATA`).
3. **Human-Gated Operations**:
   - GAS deployment (`clasp push` / Web App versioning) and ESP8266 firmware flashing require explicit human confirmation.
   - AI agents must never assume external deployment or hardware flashing has taken place without explicit user confirmation.

## Documentation Map

Refer to canonical documentation for full operational details:
- Overview & hardware setup: [`README.md`](README.md)
- Sensor API contract & error codes: [`docs/api-contract.md`](docs/api-contract.md)
- Architecture, data flows & storage: [`docs/architecture.md`](docs/architecture.md)
- Deployment, triggers & clasp setup: [`docs/deployment.md`](docs/deployment.md)
- LINE Bot commands & Flex UI: [`docs/line-bot-ui.md`](docs/line-bot-ui.md)
- Test plan: [`docs/test-plan.md`](docs/test-plan.md)
