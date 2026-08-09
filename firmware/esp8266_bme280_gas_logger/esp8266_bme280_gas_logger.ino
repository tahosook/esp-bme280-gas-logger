void setup()
{
    Serial.begin(115200);
    initBME280_I2C();
    initAmbidata();
}

void loop()
{
    readBME280_I2C();
    float temp = getTemperature();
    float press = getPressure();
    float hum = getHumidity();
    Serial.print("TEMP : ");
    Serial.print(temp);
    Serial.print(" DegC  PRESS : ");
    Serial.print(press);
    Serial.print(" hPa  HUM : ");
    Serial.print(hum);
    Serial.println(" %");

    sendAmbidata(temp, hum, press);

    ESP.deepSleep(5 * 60 * 1000 * 1000, WAKE_RF_DEFAULT);
}
