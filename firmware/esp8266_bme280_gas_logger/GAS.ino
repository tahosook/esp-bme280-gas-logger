#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

WiFiClientSecure client;
HTTPClient http;

void initGAS()
{
    initWifi();

    // 個人用・簡易構成のため、HTTPS証明書検証を省略する。
    // GAS Web Appはscript.google.comからscript.googleusercontent.comへ
    // 302リダイレクトするため、証明書検証を有効にするとGoogleの証明書
    // ローテーションで壊れやすい。送信データは非機密の環境測定値で、
    // トークンは偶発的アクセス防止用であり強固な認証ではない。
    client.setInsecure();
}

void initWifi()
{
    // connect to wifi.
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("connecting");
    while (WiFi.status() != WL_CONNECTED)
    {
        Serial.print(".");
        delay(500);
    }
    Serial.println();
    Serial.print("connected: ");
    Serial.println(WiFi.localIP());
}

void sendToGAS(float temp, float press, float hum)
{
    JsonDocument doc;
    doc["api_version"] = 1;
    doc["token"] = GAS_API_TOKEN;
    doc["temp"] = temp;
    doc["press"] = press;
    doc["hum"] = hum;

    String payload;
    serializeJson(doc, payload);

    http.begin(client, GAS_URL);
    // GASはscript.google.comからscript.googleusercontent.comへ
    // 302リダイレクトするため、別ホストへの追従を許可する。
    http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(payload);
    String response = http.getString();

    Serial.print("HTTP status: ");
    Serial.println(httpCode);
    Serial.print("Response: ");
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

    if (ok)
    {
        Serial.println("GAS send OK");
    }
    else
    {
        Serial.println("GAS send FAILED");
    }

    http.end();
}
