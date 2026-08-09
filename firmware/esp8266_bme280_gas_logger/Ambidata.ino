#include <ESP8266WiFi.h>
#include "Ambient.h"
#include "secrets.h"

WiFiClient client;
Ambient ambient;

void initAmbidata()
{
    initWifi();
    ambient.begin(AMBIDATA_CHANNELID, AMBIDATA_WRITEKEY, &client);
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

void sendAmbidata(float temp, float humid, float press)
{
    ambient.set(1, temp);
    ambient.set(2, humid);
    ambient.set(3, press);

    ambient.send();
}
