# AGENTS.md

## Project goal

Migrate the personal ESP8266 ESPr Developer environmental logger from Ambient to
Google Sheets through a Google Apps Script (GAS) Web API.

The project is a public, free-of-charge hobby project. Keep the implementation
simple and avoid paid services or infrastructure unless explicitly requested.

The original working sketch is maintained at:

https://github.com/tahosook/sketch_ambidata

Use that repository as the source reference for the existing sensor and sleep
behavior. Do not modify the upstream repository as part of migration work unless
explicitly requested.

## Hardware and runtime assumptions

- Board: ESPr Developer / ESP8266
- Sensor: BME280 over I2C
- Current sensor address: `0x76`
- Measurement interval: 5 minutes using `ESP.deepSleep()`
- Serial monitor speed: 115200 baud
- Measurements: temperature in degrees Celsius, pressure in hPa, humidity in %
- Preserve the existing working BME280 measurement algorithm unless a change is
  necessary and documented.
- Preserve the upstream MIT license and attribution when reusing source files.

Do not change wiring, I2C pins, sleep wiring, or sensor address without first
checking the existing hardware assumptions and documenting the reason.

## Data and API contract

- API version starts at `1`.
- Payload fields are `temp`, `press`, and `hum`.
- Units are fixed as `temp: °C`, `press: hPa`, and `hum: %`.
- The GAS server creates the spreadsheet timestamp in `Asia/Tokyo`.
- A simple token is used for accidental-access prevention. It is not treated as
  strong authentication because firmware secrets can be extracted.
- Occasional data loss is acceptable for this personal hobby logger. Do not add
  a persistent offline queue unless explicitly requested.

## Repository and GitHub workflow

- The GitHub repository is public.
- Never commit Wi-Fi passwords, GAS tokens, API tokens, or private deployment
  configuration.
- Keep local secrets in ignored files such as `secrets.h`; commit only example
  templates such as `secrets.example.h`.
- Do not put real secrets in documentation, test logs, screenshots, or issue
  descriptions.
- Keep `main` stable.
- Use task branches with appropriate prefixes (e.g. `feat/*`, `fix/*`, `task/*`,
  or agent-prefixed branches like `jules/*`, `codex/*`).
- Prefer one focused change per branch and pull request.
- Review the diff and run the relevant local checks before merging.
- Use release tags for known-good firmware, for example `v1.0.0-stable`.

## Agent roles and collaboration

Different AI coding assistants collaborate on this repository:

- **Interactive Agents (Antigravity, Claude Code, Cline, etc.)**:
  - Role: Real-time pair programmer in IDE / CLI / chat.
  - Responsibilities: Architecture design, task breakdown, creating Jules prompt specifications, PR conflict resolution, test runner validation, debugging, and GAS clasp deployment assistance upon user confirmation.
  - Working rules:
    - Small fixes & debugging during pair programming: edit files, run local tests, explain the diff and rationale to the user, and commit only after obtaining explicit user approval.
    - Large features: create a dedicated task branch (`feat/*`, `task/*`, `agy/*`), implement & test, and submit a Pull Request.
    - Never push directly to `main` without explaining the diff and obtaining explicit user confirmation.
- **Autonomous / Task Agents (Jules, Codex, etc.)**:
  - Role: Autonomous PR-based implementation agents.
  - Responsibilities: End-to-end implementation of delegated phases/tasks on dedicated feature branches (`jules/*`, `codex/*`), creating Pull Requests, and passing all automated test suites.
  - Working rules:
    - Always work on a separate branch and open a Pull Request.
    - Never attempt direct pushes to `main` or perform deployments.

## Selecting the next task

Treat `docs/implementation-roadmap.md` as a map of goals and dependencies, not
as a queue that must be executed phase by phase. Do not automatically start the
next roadmap phase after a merge.

Before proposing or creating a next-task Issue/PR, review what the previous work
actually established and identify unresolved decisions. Classify the next task
as one of the following:

- **Decision**: finalize a specification, range, response format, or operating rule.
- **Implementation**: change code or configuration that follows an accepted decision.
- **Validation**: deploy or use hardware to observe and record a result.

Only proceed when the task has a focused scope, concrete acceptance criteria,
and a verification method. The presence of documentation alone does not mean a
phase is complete: unresolved values, error behavior, or validation methods
must be settled in a Decision task before dependent implementation begins.

AI agents may propose the next task and explain the evidence for it, but must not
create a GitHub Issue or begin implementation without the user's explicit
approval. Read-only inspection and a proposed task description are allowed
before that approval.

## AI Agent working rules

Before editing:

1. Inspect the repository and identify the files in scope.
2. State assumptions and acceptance criteria in the task or issue.
3. Keep the change limited to the requested scope.

After editing:

1. Review the diff for accidental changes and secrets.
2. Run the strongest available local checks.
3. Report what was tested and what still requires manual hardware testing.

Use the following task format for GitHub Issues, PR descriptions, or Jules task prompts:

```text
作業種別: 決定 / 実装 / 検証
目的:
対象ファイル:
変更しない範囲:
前提・未決事項:
受け入れ条件:
検証方法:
```

## Deployment and hardware actions

- GAS deployment requires human confirmation.
- ESP8266 flashing requires human confirmation.
- AI agents may prepare code, commands, test plans, and review notes, but must not
  assume that external deployment or hardware flashing has happened.

## Validation priorities

Validate in this order:

1. GAS API accepts valid data and rejects invalid data.
2. The firmware compiles with the intended ESP8266 board configuration.
3. The device reads BME280 data and prints it at 115200 baud.
4. HTTPS POST returns the expected status and response.
5. A row appears in the spreadsheet with the correct units and Tokyo timestamp.
6. The device resumes correctly after deep sleep.

Do not describe a deployment or hardware test as complete without evidence from
the user or an actual local test result.

## Development Guidelines & Constraints

This project requires careful handling due to its dual-environment nature and specific runtime constraints.

### 1. Dual-Environment Context

- **Production Environment**: Google Apps Script (GAS V8 engine).
  - No Node.js built-in modules (e.g., `fs`, `path`).
  - Global scope is shared across all `.gs` (`.js`) files in `gas/`.
- **Local/CI Environment**: Node.js 20+ with Jest.
  - Used strictly for unit testing and CI pipelines.

### 2. GAS Compatibility & Export Guards (Good / Bad)

If a GAS source file needs to export functions for Node/Jest tests, guard `module.exports` as follows. Do not bring Node.js `require` into production code.

**Bad:**
```javascript
// Breaks in GAS!
const someLib = require('some-lib');

module.exports = { myFunction };
```

**Good:**
```javascript
function myFunction() { /* ... */ }

// Export guard protects the GAS runtime while allowing Jest to test the functions locally.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { myFunction };
}
```

### 3. Strict Timezone Management

All date and time calculations, formatting, and comparisons (e.g., logging, snooze evaluation) must strictly use the **`Asia/Tokyo` (UTC+9)** timezone.

### 4. Negative Constraints (Do NOT Do This)

- **Do NOT** introduce TypeScript, bundlers, or transpilers. The project must maintain the simplicity and lightweight nature of raw JavaScript for GAS.
- **Do NOT** alter the expected incoming JSON schema from the ESP8266 or the LINE Webhook contract.
- **Do NOT** perform dangerous spreadsheet row operations, such as `sheet.deleteRows(2, 0)` or specifying out-of-bounds rows. Always validate indexes and counts before calling GAS APIs.

### 5. Definition of Done (Quantitative Exit Criteria)

Before a Pull Request can be considered complete:
- The local test suite must pass with `exit code 0` by running `npm test`.
- Test coverage must satisfy the thresholds defined in `jest.config.js` by running `npm run test:coverage`.
- Do not lower the existing coverage thresholds.
