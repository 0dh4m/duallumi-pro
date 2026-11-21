# ==============================================================================
# Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
# Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
# Author: Adham Cherkaoui Eddeqaqi (0dh4m) <0dh4mm@gmail.com>
# GitHub: https://github.com/0dh4m
# ==============================================================================

"""
ELK-BLEDOB / LotusLamp X Protocol Implementation
Single-packet, ultra-low-latency byte framing with verified power commands.
"""

ELK_PRIMARY_SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb"
ELK_WRITE_CHARACTERISTICS = [
    "0000fff3-0000-1000-8000-00805f9b34fb",
    "0000ffe1-0000-1000-8000-00805f9b34fb",
    "0000ffd5-0000-1000-8000-00805f9b34fb",
    "0000fff1-0000-1000-8000-00805f9b34fb",
]

class ElkProtocol:
    @staticmethod
    def clamp(val: int, min_v: int = 0, max_v: int = 255) -> int:
        return max(min_v, min(int(val), max_v))

    @classmethod
    def get_power_cmd(cls, is_on: bool) -> bytes:
        if is_on:
            return bytes([0x7e, 0x07, 0x04, 0xff, 0x00, 0x01, 0x02, 0x01, 0xef])
        else:
            return bytes([0x7e, 0x07, 0x04, 0x00, 0x00, 0x00, 0x02, 0x01, 0xef])

    @classmethod
    def get_brightness_cmd(cls, brightness: int) -> bytes:
        """
        ELK-BLEDOB native hardware brightness frame:
        7e 00 01 <01..64> 00 00 00 00 ef
        """
        b = cls.clamp(brightness, 1, 100)
        return bytes([0x7e, 0x00, 0x01, b, 0x00, 0x00, 0x00, 0x00, 0xef])

    @classmethod
    def get_color_cmd(cls, r: int, g: int, b: int) -> bytes:
        r_c = cls.clamp(r)
        g_c = cls.clamp(g)
        b_c = cls.clamp(b)
        return bytes([0x7e, 0x07, 0x05, 0x03, r_c, g_c, b_c, 0x0a, 0xef])

    @classmethod
    def get_color_temp_cmd(cls, kelvin: int) -> bytes:
        k = cls.clamp(kelvin, 2000, 6500)
        ratio = (k - 2000) / (6500 - 2000)
        cold = int(ratio * 255)
        warm = 255 - cold
        return bytes([0x7e, 0x07, 0x05, 0x02, warm, cold, 0x00, 0x00, 0xef])

    @classmethod
    def get_effect_cmd(cls, effect_id: int) -> bytes:
        eff = cls.clamp(effect_id, 0x80, 0x9B)
        return bytes([0x7e, 0x07, 0x03, eff, 0x03, 0xff, 0xff, 0x00, 0xef])

    @classmethod
    def get_native_effect_cmd(cls, effect_id: int, speed: int = 50) -> bytes:
        """
        Native ELK-BLEDOB effect frame with speed:
        7e 05 03 <effect 0x80..0x9B> <speed 0x01..0x64> 00 ef
        """
        eff = cls.clamp(effect_id, 0x80, 0x9B)
        spd = cls.clamp(speed, 1, 100)
        return bytes([0x7e, 0x05, 0x03, eff, spd, 0x00, 0xef])

    @classmethod
    def get_speed_cmd(cls, speed: int) -> bytes:
        """Speed adjustment frame for current active effect."""
        spd = cls.clamp(speed, 1, 100)
        return bytes([0x7e, 0x04, 0x02, spd, 0xff, 0x00, 0xef])

    @classmethod
    def get_time_sync_cmd(cls, dt = None) -> bytes:
        """
        LotusLantern / ELK-BLEDOM on-board RTC time synchronization frame:
        7e 00 83 <hour> <min> <sec> <day_of_week 1-7> 00 ef
        """
        import datetime
        if dt is None:
            dt = datetime.datetime.now()
        day_of_week = dt.weekday() + 1 # 1 = Monday, 7 = Sunday
        return bytes([0x7E, 0x00, 0x83, min(dt.hour, 23), min(dt.minute, 59), min(dt.second, 59), max(1, min(day_of_week, 7)), 0x00, 0xEF])

    @classmethod
    def get_hardware_timer_cmd(cls, hour: int, minute: int, is_on: bool = True, days_mask: int = 0xFE) -> bytes:
        """
        LotusLantern / ELK-BLEDOM on-board microcontroller hardware schedule frame:
        7e 00 82 <hour> <min> 00 <action: 00=ON, 01=OFF> <days_mask | 0x80> ef
        Allows the strip itself to turn on/off autonomously without phone or PC.
        days_mask: 0xFE = all days (Mon-Sun: bits 1..7).
        """
        action_byte = 0x00 if is_on else 0x01
        days_val = (days_mask & 0xFF) | 0x80
        return bytes([0x7E, 0x00, 0x82, cls.clamp(hour, 0, 23), cls.clamp(minute, 0, 59), 0x00, action_byte, days_val, 0xEF])

