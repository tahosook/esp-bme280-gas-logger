#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

// Phase 5: タイムアウトと再試行回数はメインスケッチで定義済み。
// WIFI_TIMEOUT_MS, HTTP_TIMEOUT_MS, MAX_SEND_RETRIES
WiFiClientSecure client;
HTTPClient http;

void initGAS()
{
    // Wi-Fi接続に失敗しても無限ループせず、ディープスリープへ進む。
    if (!initWifi())
    {
        Serial.println("[wifi] connect failed; skipping GAS send");
        return;
    }

    // 個人用・簡易構成のため、HTTPS証明書検証を省略する。
    // GAS Web Appはscript.google.comからscript.googleusercontent.comへ
    // 302リダイレクトするため、証明書検証を有効にするとGoogleの証明書
    // ローテーションで壊れやすい。送信データは非機密の環境測定値で、
    // トークンは偶発的アクセス防止用であり強固な認証ではない。
    client.setInsecure();
}

bool initWifi()
{
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("[wifi] connecting");
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED)
    {
        if (millis() - start >= WIFI_TIMEOUT_MS)
        {
            Serial.println();
            Serial.println("[wifi] FAILED: timeout (30s)");
            return false;
        }
        Serial.print(".");
        delay(500);
    }
    Serial.println();
    Serial.print("[wifi] connected: ");
    Serial.println(WiFi.localIP());
    return true;
}

GasSendResult sendToGAS(float temp, float press, float hum)
{
    JsonDocument doc;
    doc["api_version"] = 1;
    doc["token"] = GAS_API_TOKEN;
    // Phase 5: BME280の湿度は÷1024で算出され2進浮動小数点のため
    // 小数が多くなる。温度・気圧・湿度すべてを小数点以下2桁に丸めて
    // スプレッドシートの表示を統一する。
    doc["temp"] = roundf(temp * 100) / 100;
    doc["press"] = roundf(press * 100) / 100;
    doc["hum"] = roundf(hum * 100) / 100;

    String payload;
    serializeJson(doc, payload);

    http.begin(client, GAS_URL);
    // GASはscript.google.comからscript.googleusercontent.comへ
    // 302リダイレクトするため、別ホストへの追従を許可する。
    http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    // Phase 6: リダイレクト上限を明示的に設定（GASは1回の302リダイレクト）
    http.setRedirectLimit(3);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);

    // GoogleのエラーHTML等によるヒープ枯渇を防ぐためContent-Typeヘッダーを収集
    const char *headerKeys[] = {"Content-Type"};
    http.collectHeaders(headerKeys, 1);

    int httpCode = http.POST(payload);

    Serial.print("[gas] HTTP status: ");
    Serial.println(httpCode);

    if (httpCode <= 0)
    {
        Serial.print("[gas] connection error: ");
        Serial.println(http.errorToString(httpCode).c_str());
        http.end();
        client.stop();
        return GAS_SEND_RETRYABLE;
    }

    if (httpCode != HTTP_CODE_OK)
    {
        http.end();
        client.stop();
        // 4xxエラー（401, 403, 404等）は再試行しても成功しないためリトライ不要
        if (httpCode >= 400 && httpCode < 500)
        {
            Serial.println("[gas] client error; aborting retries");
            return GAS_SEND_FATAL;
        }
        return GAS_SEND_RETRYABLE;
    }

    // HTTP 200 OK の場合:
    // Content-TypeがJSONでない場合（例: text/html）はエラー画面とみなして本文受信をスキップ
    String contentType = http.header("Content-Type");
    if (contentType.length() > 0 && contentType.indexOf("application/json") == -1)
    {
        Serial.print("[gas] unexpected Content-Type (not JSON): ");
        Serial.println(contentType);
        http.end();
        client.stop();
        return GAS_SEND_FATAL;
    }

    // サイズ検証: GASの正常応答は通常100バイト未満。1024バイト超は巨大HTMLとみなして破棄
    int size = http.getSize();
    if (size > 1024)
    {
        Serial.print("[gas] response too large (size=");
        Serial.print(size);
        Serial.println("); aborting");
        http.end();
        client.stop();
        return GAS_SEND_FATAL;
    }

    String response = http.getString();
    Serial.print("[gas] response: ");
    Serial.println(response);

    GasSendResult result = GAS_SEND_FATAL;
    JsonDocument respDoc;
    DeserializationError err = deserializeJson(respDoc, response);
    if (!err && respDoc["ok"].is<bool>())
    {
        if (respDoc["ok"].as<bool>())
        {
            result = GAS_SEND_OK;
        }
        else
        {
            Serial.println("[gas] rejected by server (ok=false); aborting retries");
            result = GAS_SEND_FATAL;
        }
    }
    else
    {
        Serial.println("[gas] invalid JSON response; aborting retries");
        result = GAS_SEND_FATAL;
    }

    http.end();
    client.stop();
    return result;
}
