# ESP8266 BME280 GAS logger

This sketch reads temperature, pressure, and humidity from a BME280 over I2C
and sends them to a Google Apps Script (GAS) Web API over HTTPS. The BME280
reading algorithm, I2C address (`0x76`), and five-minute deep-sleep cycle are
retained from
[`tahosook/sketch_ambidata`](https://github.com/tahosook/sketch_ambidata).

## Required libraries

- `ArduinoJson` (install via Arduino IDE Library Manager)

`ESP8266WiFi`, `WiFiClientSecure`, and `ESP8266HTTPClient` are bundled with the
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
