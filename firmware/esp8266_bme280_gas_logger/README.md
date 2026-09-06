# ESP8266 BME280 GAS logger

This sketch reads temperature, pressure, and humidity from a BME280 over I2C
and sends them to a Google Apps Script (GAS) Web API over HTTPS. The BME280
reading algorithm, I2C address (`0x76`), and five-minute deep-sleep cycle are
retained from
[`tahosook/sketch_ambidata`](https://github.com/tahosook/sketch_ambidata).

## Required libraries

- `ArduinoJson` (install via Arduino IDE Library Manager)

`ESP8266WiFi`, `WiFiClientSecure`, `ESP8266HTTPClient`, and `Wire` are bundled with the
ESP8266 board package.

## HTTPS certificate verification

This sketch uses `WiFiClientSecure::setInsecure()` and skips certificate
verification. This is a deliberate choice for this personal hobby project:

- GAS Web Apps redirect from `script.google.com` to
  `script.googleusercontent.com`, which makes certificate pinning fragile
  against Google's certificate rotation.
- The payload is non-sensitive environmental data.
- The token is only for accidental-access prevention, not strong
  authentication.

## Local setup

Before compiling locally, copy `secrets.example.h` to `secrets.h` and replace
the placeholders. The local `secrets.h` is ignored by Git.

From the repository root, compile with:

```sh
./scripts/compile-firmware.sh
```

## Stability features

- **Wi-Fi timeout**: 30 seconds. If the connection fails, the GAS send is
  skipped and the device enters deep sleep.
- **HTTPS timeout**: 15 seconds per POST attempt (reduced to prevent heating during server hangs).
- **Smart retries**: Up to 3 attempts with a 5-second delay for retryable errors
  (timeouts, connection drops). Fatal errors (4xx, rejected token/payload, large HTML error pages)
  abort retries immediately to avoid heating and battery drain.
- **Memory protection**: Validates `Content-Type: application/json` and enforces a 1024-byte
  response size limit to prevent out-of-memory (OOM) crash loops caused by large Google error HTML pages.
- **Power optimization**: Reads the BME280 sensor before turning on Wi-Fi; if the sensor
  is missing or read fails, enters deep sleep immediately without activating the Wi-Fi radio.
- **Reliable deep sleep**: Adds a `delay(100)` guard after every `ESP.deepSleep()` to prevent
  duplicate execution of `loop()` during the hardware shutdown transition.
- **No infinite loops**: The device always reaches deep sleep, even on
  persistent failures. Data loss is acceptable per project policy.
- **Log format**: All serial output uses `[tag] message` for easy parsing.
  Tags: `[bme280]`, `[sensor]`, `[wifi]`, `[gas]`, `[sleep]`.
