# ESP8266 BME280 baseline

This directory preserves the working Ambient-based sketch that is being
migrated to the GAS API. The BME280 reading algorithm, I2C address (`0x76`),
and five-minute deep-sleep cycle are retained from
[`tahosook/sketch_ambidata`](https://github.com/tahosook/sketch_ambidata).

Before compiling locally, copy `secrets.example.h` to `secrets.h` and replace
the placeholders. The local `secrets.h` is ignored by Git.

From the repository root, compile with:

```sh
./scripts/compile-firmware.sh
```

This is a baseline only; GAS API replacement is intentionally out of scope.
