#include <ESP8266WiFi.h>

// 送信結果の分類（リトライ制御用）
enum GasSendResult {
    GAS_SEND_OK = 0,
    GAS_SEND_FATAL = 1,       // リトライ不要な恒久エラー（認証失敗、バリデーションエラー、巨大HTML等）
    GAS_SEND_RETRYABLE = 2    // 一時的な通信エラー（タイムアウト、接続切断等）
};

// サブファイル関数のプロトタイプ宣言
bool initBME280_I2C();
bool readBME280_I2C();
float getTemperature();
float getPressure();
float getHumidity();
void initGAS();
GasSendResult sendToGAS(float temp, float press, float hum);

// タイムアウトと再試行回数の定義
#define WIFI_TIMEOUT_MS   30000
#define HTTP_TIMEOUT_MS   15000  // 発熱・待機時間抑制のため15秒に短縮
#define MAX_SEND_RETRIES  3

void setup()
{
    Serial.begin(115200);
    Serial.println("[bme280] initializing");
    if (!initBME280_I2C())
    {
        Serial.println("[sleep] sensor init failed; entering deep sleep (300s)");
        ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
        delay(100);
        return;
    }

    // 省電力化: Wi-Fi接続前にセンサー読み取りを行い、故障時はWi-Fi電力を消費しない
    Serial.println("[sensor] reading");
    if (!readBME280_I2C())
    {
        Serial.println("[bme280] read failed");
        Serial.println("[sleep] sensor read failed; entering deep sleep (300s)");
        ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
        delay(100);
        return;
    }

    // センサー読み取りが成功した場合のみWi-Fiを初期化
    initGAS();
}

void loop()
{
    float temp = getTemperature();
    float press = getPressure();
    float hum = getHumidity();
    Serial.print("[sensor] temp=");
    Serial.print(temp, 2);
    Serial.print(" press=");
    Serial.print(press, 2);
    Serial.print(" hum=");
    Serial.println(hum, 2);

    bool sent = false;
    if (WiFi.status() == WL_CONNECTED)
    {
        for (int attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++)
        {
            Serial.print("[gas] attempt ");
            Serial.print(attempt);
            Serial.print("/");
            Serial.println(MAX_SEND_RETRIES);

            GasSendResult result = sendToGAS(temp, press, hum);
            if (result == GAS_SEND_OK)
            {
                sent = true;
                break;
            }

            if (result == GAS_SEND_FATAL)
            {
                Serial.println("[gas] fatal error; aborting retries");
                break;
            }

            // GAS_SEND_RETRYABLE の場合のみ再試行
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
        Serial.println("[gas] FAILED: send aborted or exhausted");
    }

    Serial.println("[sleep] entering deep sleep (300s)");
    ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
    delay(100);
}
