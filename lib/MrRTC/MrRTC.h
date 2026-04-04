#ifndef MY_RTC_H
#define MY_RTC_H

#include <Arduino.h>
#include <RTClib.h>

class MrRTC {
  public:
    MrRTC(); // do not use this constructor directly, use begin() instead to initialize the RTC module
    bool begin(int sdaPin = 8, int sclPin = 9);
    
    // ฟังก์ชันสำคัญสำหรับโปรเจกต์นี้
    void setDateTime(uint32_t unixTime); // เอาไว้รับค่าจาก Heltec มาตั้งเวลา
    String getISO();             // คืนค่า "2026-04-04 22:30:00" (สำหรับ CSV)            // คืนค่า "260404.csv" (สำหรับสร้างไฟล์รายวัน)
    uint32_t getUnix();               // คืนค่าเลขวินาที (สำหรับคำนวณเวลาสัมพัทธ์)

  private:
    RTC_DS3231 _rtc; // หรือ RTC_DS1307 ตามรุ่นที่ใช้
};

#endif