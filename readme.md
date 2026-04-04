# 🌧️ LoRa Water Level & Rain Gauge Monitor

โปรเจกต์ระบบตรวจวัดระดับน้ำและปริมาณน้ำฝนแบบประหยัดพลังงาน (Ultra-Low Power) สำหรับติดตั้งในพื้นที่ห่างไกล โดยใช้สถาปัตยกรรมแบบ **Dual-MCU** เพื่อแยกหน้าที่การทำงานและลดปัญหาเรื่อง Deep Sleep 

## 🛠️ System Architecture

ระบบถูกออกแบบโดยแยกหน้าที่การทำงานออกเป็น 2 บอร์ดหลัก:

1. **Master Node (Heltec LoRa):** - ทำหน้าที่เป็นตัวคุมเวลา (Master Timer) ตื่นขึ้นมาทุกๆ 10 นาที
   - อ่านค่าระยะจากเซนเซอร์ Ultrasonic
   - ส่งคำสั่ง Serial ไปปลุก Sensor Node
   - ส่งข้อมูลทั้งหมดผ่านเครือข่าย LoRa (LoRaWAN / P2P)

2. **Smart Sensor Node (ESP32-C3):**
   - ทำหน้าที่เฝ้าระวังและนับจำนวนการกระดกของ Tipping Bucket (Rain Gauge)
   - ใช้ Hardware Debounce (NE555) กรองสัญญาณรบกวนก่อนเข้าบอร์ด
   - เก็บนับค่าใน RTC Memory และจะตื่นมารับคำสั่งจาก Heltec
   - บันทึกข้อมูล (Data Logging) ลง SD Card เป็นไฟล์ `.csv` เมื่อได้รับการร้องขอเท่านั้น เพื่อประหยัดพลังงาน

## 🔌 Hardware Components

* **ESP32-C3 SuperMini** (Sensor Node)
* **Heltec LoRa V2/V3** (Master Node & Communication)
* **Tipping Bucket Rain Gauge** (เซนเซอร์วัดน้ำฝน)
* **Ultrasonic Sensor** (เซนเซอร์วัดระดับน้ำ)
* **IC LMC555 / TLC555 (CMOS)** + R, C (สำหรับวงจร Hardware Debounce 3.3V)
* **DS3231 RTC Module** (โมดูลฐานเวลา)
* **Micro SD Card Module (SPI)**

## 📌 ESP32-C3 Pinout (Recommended)

| Device / Function | ESP32-C3 Pin | Note |
| :--- | :--- | :--- |
| **SD Card (SPI)** | GPIO 4, 5, 6, 7 | SCK, MISO, MOSI, CS |
| **RTC (I2C)** | GPIO 8 (SDA), 9 (SCL) | (มี Pull-up ในตัวโมดูล) |
| **UART to Heltec** | GPIO 21 (TX), 20 (RX) | สื่อสารกับบอร์ด Master |
| **Tipping Bucket** | GPIO 3 | External Interrupt (Wakeup) |

## 📁 Project Structure (PlatformIO)

โปรเจกต์นี้พัฒนาบน PlatformIO โดยมีการสร้าง Custom Library ขึ้นมาเพื่อความสะดวกในการจัดการ:

```text
├── lib/
│   ├── MyRTC/          # Custom wrapper สำหรับ DS3231 (ใช้ RTClib)
│   └── RainGauge/      # Library จัดการการนับน้ำฝนและ Debounce Logic
├── src/
│   └── main.cpp        # โค้ดหลักของ ESP32-C3
├── platformio.ini      # ไฟล์ตั้งค่าบอร์ดและ Dependencies
└── README.md