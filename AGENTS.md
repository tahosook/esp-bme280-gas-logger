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
- Keep `main` stable. Use task branches with the `codex/` prefix.
- Prefer one focused change per branch and pull request.
- Review the diff and run the relevant checks before merging.
- Use release tags for known-good firmware, for example `v1.0.0-stable`.

## Codex working rules

Before editing:

1. Inspect the repository and identify the files in scope.
2. State assumptions and acceptance criteria in the task or issue.
3. Keep the change limited to the requested scope.

After editing:

1. Review the diff for accidental changes and secrets.
2. Run the strongest available local checks.
3. Report what was tested and what still requires manual hardware testing.

Use the following task format for GitHub Issues or Codex requests:

```text
目的:
対象ファイル:
変更しない範囲:
受け入れ条件:
検証方法:
```

## Deployment and hardware actions

- GAS deployment requires human confirmation.
- ESP8266 flashing requires human confirmation.
- Codex may prepare code, commands, test plans, and review notes, but must not
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
