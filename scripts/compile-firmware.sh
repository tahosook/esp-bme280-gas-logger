#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sketch_dir="$repo_root/firmware/esp8266_bme280_gas_logger"
bundled_cli="/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli"

if command -v arduino-cli >/dev/null 2>&1; then
    cli=$(command -v arduino-cli)
elif [ -x "$bundled_cli" ]; then
    cli=$bundled_cli
else
    echo "arduino-cli が見つかりません。Arduino IDE または arduino-cli を導入してください。" >&2
    exit 1
fi

if [ ! -f "$sketch_dir/secrets.h" ]; then
    echo "secrets.h がありません。secrets.example.h をコピーしてローカル設定を作成してください。" >&2
    exit 1
fi

build_dir=$(mktemp -d /tmp/esp-bme280-build.XXXXXX)
"$cli" compile \
    --fqbn esp8266:esp8266:generic \
    --build-path "$build_dir" \
    "$sketch_dir"
