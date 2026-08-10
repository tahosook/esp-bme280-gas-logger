#include <ESP8266WiFi.h>

// Phase 5: タイムアウトと再試行回数の定義
// Arduinoビルドではメインスケッチを先頭に全.inoを連結するため、
// ここに定義してすべてのサブファイルから参照できる。
#define WIFI_TIMEOUT_MS   30000
#define HTTP_TIMEOUT_MS   30000
#define MAX_SEND_RETRIES  3

void setup()
{
    Serial.begin(115200);
    Serial.println("[bme280] initializing");
    if (!initBME280_I2C())
    {
        Serial.println("[sleep] sensor init failed; entering deep sleep (300s)");
        ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
        return;
    }
    initGAS();
}

void loop()
{
    Serial.println("[sensor] reading");
    if (!readBME280_I2C())
    {
        Serial.println("[bme280] read failed");
        Serial.println("[sleep] sensor read failed; entering deep sleep (300s)");
        ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
        return;
    }

    float temp = getTemperature();
    float press = getPressure();
    float hum = getHumidity();
    Serial.print("[sensor] temp=");
    Serial.print(temp, 2);
    Serial.print(" press=");
    Serial.print(press, 2);
    Serial.print(" hum=");
    Serial.println(hum, 2);

    // Phase 5: Wi-Fiが接続されていれば最大3回まで再送信する。
    // 失敗しても無限ループせず、ディープスリープへ進む。
    bool sent = false;
    if (WiFi.status() == WL_CONNECTED)
    {
        for (int attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++)
        {
            Serial.print("[gas] attempt ");
            Serial.print(attempt);
            Serial.print("/");
            Serial.println(MAX_SEND_RETRIES);

            if (sendToGAS(temp, press, hum))
            {
                sent = true;
                break;
            }

            if (attempt < MAX_SEND_RETRIES)
            {
                delay(5000);
            }
        }
    }
    else
    {
        Serial.println("[gas] skip: Wi-Fi not connected");
    }

    if (!sent)
    {
        Serial.println("[gas] FAILED: all retries exhausted");
    }

    Serial.println("[sleep] entering deep sleep (300s)");
    ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
}
