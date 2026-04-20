#include <Arduino.h>
#include "MrRTC.h"
// The bucket tested with this code is summarized here:
// http://texaselectronics.com/media/mconnect_uploadfiles/t/r/tr-525i_rainfall_user_s_manual.pdf

// Testing shows this bucket has a normally open reed switch.

#define RAIN_PIN 15          // interrupt pin
#define CALC_INTERVAL 10000  // increment of measurements
#define DEBOUNCE_TIME 50    // time * 1000 in microseconds required to get through bounce noise

// http://texaselectronics.com/media/mconnect_uploadfiles/t/r/tr-525i_rainfall_user_s_manual.pdf
// Per manufatures spec on bucket being tested:

// "Average Switch closure time is 135 ms"
// "Bounce Settling Time: 0.75 ms" 

unsigned long nextCalc;
unsigned long timer;
MrRTC rtc;
volatile unsigned int rainTrigger = 0;
volatile unsigned long last_micros_rg;
void countingRain();

void setup() {
  Serial.begin(115200); 
  rtc.begin(32,33);
  // attachInterrupt(digitalPinToInterrupt(RAIN_PIN), countingRain, FALLING); 
  
  pinMode(RAIN_PIN, INPUT_PULLUP);
  nextCalc = millis() + CALC_INTERVAL;
  rtc.setDateTime(1776703185);
}

void loop() {
  // timer = millis();
  // if(timer > nextCalc) {
  //   nextCalc = timer + CALC_INTERVAL;
  //   Serial.print("Total Tips: ");
  //   Serial.println((float) rainTrigger);     
  // }
  String date = rtc.getISO();
  Serial.print(date);
  Serial.print("    UNIX : ");
  Serial.println(rtc.getUnix());
  delay(500);
}

void countingRain() {
  // ATTEMPTED: Check to see if time since last interrupt call is greater than 
  // debounce time. If so, then the last interrupt call is through the 
  // noisy period of the reed switch bouncing, so we can increment by one.   
  if((long)(micros() - last_micros_rg) >= DEBOUNCE_TIME * 1000) { 
   rainTrigger += 1;
   last_micros_rg = micros();
  }  
}
