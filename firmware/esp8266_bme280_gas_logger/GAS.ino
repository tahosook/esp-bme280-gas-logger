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

bool sendToGAS(float temp, float press, float hum)
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
    // Phase 5: HTTPS通信タイムアウトを30秒に設定
    http.setTimeout(HTTP_TIMEOUT_MS);

    int httpCode = http.POST(payload);
    String response = http.getString();

    Serial.print("[gas] HTTP status: ");
    Serial.println(httpCode);
    Serial.print("[gas] response: ");
    Serial.println(response);

    // 成否はHTTPステータスではなく、レスポンスJSONのokで判定する。
    bool ok = false;
    if (httpCode == HTTP_CODE_OK)
    {
        JsonDocument respDoc;
        DeserializationError err = deserializeJson(respDoc, response);
        if (!err && respDoc["ok"].is<bool>())
        {
            ok = respDoc["ok"].as<bool>();
        }
    }

    http.end();
    return ok;
}
