#!/bin/sh
set -eu

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--write" ]; }; then
    echo "使い方: GAS_URL=... [API_TOKEN=...] $0 [--write]" >&2
    exit 2
fi

if [ -z "${GAS_URL:-}" ]; then
    echo "GAS_URLを設定してください。" >&2
    exit 2
fi

get_response=$(curl -L --silent --show-error --fail "$GAS_URL")
if [ "$get_response" != '{"ok":true,"ready":true}' ]; then
    echo "GET Ready確認に失敗しました: $get_response" >&2
    exit 1
fi
echo "GET Ready: OK"

invalid_response=$(curl -L --silent --show-error --fail \
    -H 'Content-Type: application/json' \
    --data-binary '{"api_version":1,"token":"wrong-token","temp":24.5,"press":1012.3,"hum":55.8}' \
    "$GAS_URL")
if [ "$invalid_response" != '{"ok":false,"error":"invalid_token"}' ]; then
    echo "不正トークン確認に失敗しました: $invalid_response" >&2
    exit 1
fi
echo "POST invalid token: OK"

if [ "${1:-}" = "--write" ]; then
    if [ -z "${API_TOKEN:-}" ]; then
        echo "--writeにはAPI_TOKENが必要です。" >&2
        exit 2
    fi

    valid_response=$(curl -L --silent --show-error --fail \
        -H 'Content-Type: application/json' \
        --data-binary "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":24.5,\"press\":1012.3,\"hum\":55.8}" \
        "$GAS_URL")
    if [ "$valid_response" != '{"ok":true}' ]; then
        echo "正常POSTに失敗しました: $valid_response" >&2
        exit 1
    fi
    echo "POST valid token (one row written): OK"
fi
