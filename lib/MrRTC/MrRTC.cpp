#include <Arduino.h>
#include "MrRTC.h"

MrRTC::MrRTC() {}

bool MrRTC::begin(int sdaPin, int sclPin) {
    //Connect with I2C
    if (!_rtc.begin()) {
        Serial.println("ERROR: RTC Module not found! Check wiring.");
        return false; // บอกโปรแกรมหลักว่า "พังนะ"
    }

    // Check if RTC lost power
    if (_rtc.lostPower()) {
        Serial.println("WARNING: RTC lost power, time is wrong.");
        // set to compile time
        _rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));    
    }
    return true; // ทุกอย่างปกติดี
}

void MrRTC::setDateTime(uint32_t unixTime) {
    _rtc.adjust(DateTime(unixTime));
}

String MrRTC::getISO() {
    DateTime now = _rtc.now();
    char buf[] = "YYYY-MM-DD hh:mm:ss";
    return String(now.toString(buf));
}

uint32_t MrRTC::getUnix() {
    return _rtc.now().unixtime();
}
