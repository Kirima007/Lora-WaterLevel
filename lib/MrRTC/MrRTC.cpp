#include <Arduino.h>
#include "MrRTC.h"

MrRTC::MrRTC() {}

bool MrRTC::begin(int sdaPin, int sclPin) {
    //Set I2C pins
    Wire.begin(sdaPin, sclPin);
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

String MrRTC::getISO(int hourOffset) {
    DateTime now = _rtc.now();
    long offsetSeconds = hourOffset * 3600L;
    DateTime localTime(now.unixtime() + offsetSeconds);
    char buf[] = "YYYY-MM-DD hh:mm:ss";
    return String(localTime.toString(buf));
    
}

uint32_t MrRTC::getUnix() {
    return _rtc.now().unixtime();
}

void MrRTC::syncFromSerial() {
    if (Serial.available() > 0) {
        // อ่านค่าตัวเลขที่ส่งมาจาก Serial Monitor (เช่น 1712314326)
        uint32_t receivedTime = Serial.parseInt();
        
        // ตรวจสอบเบื้องต้นว่าเลขที่ส่งมาดูเป็นปีปัจจุบันไหม (เลข Unix ปี 2024+ จะขึ้นต้นด้วย 17...)
        if (receivedTime > 1700000000) { 
            _rtc.adjust(DateTime(receivedTime));
            Serial.print("Time Synced: ");
            Serial.println(getISO());
        } else {
            Serial.println("Invalid Unix Timestamp!");
        }
    }
}
