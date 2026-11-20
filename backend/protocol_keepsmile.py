"""
Dazzling Home / KeepSmile Protocol Implementation
Optimized for KS04-651420 smart bulbs with verified 5B power frames.
"""

KEEPSMILE_SERVICES = [
    "0000fff0-0000-1000-8000-00805f9b34fb",
    "0000afd0-0000-1000-8000-00805f9b34fb",
    "0000ae00-0000-1000-8000-00805f9b34fb",
]

KEEPSMILE_WRITE_CHARACTERISTICS = [
    "0000fff3-0000-1000-8000-00805f9b34fb",
    "0000afd1-0000-1000-8000-00805f9b34fb",
    "0000ae01-0000-1000-8000-00805f9b34fb",
]

class KeepsmileProtocol:
    @staticmethod
    def clamp(val: int, min_v: int = 0, max_v: int = 255) -> int:
        return max(min_v, min(int(val), max_v))

    @classmethod
    def get_power_cmd(cls, is_on: bool) -> bytes:
        """
        Verified native Dazzling Home / KeepSmile hardware power switch (7E frame):
        ON:  7e 04 04 f0 00 01 ff 00 ef
        OFF: 7e 04 04 00 00 00 ff 00 ef
        """
        if is_on:
            return bytes([0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef])
        else:
            return bytes([0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef])

    @classmethod
    def get_power_cmd_5b(cls, is_on: bool) -> bytes:
        """
        Alternative 5B-frame power command used by some KeepSmile/Dazzling Home firmware:
        ON:  5b f0 01 b5
        OFF: 5b 0f 01 b5
        """
        if is_on:
            return bytes([0x5b, 0xf0, 0x01, 0xb5])
        else:
            return bytes([0x5b, 0x0f, 0x01, 0xb5])

    @classmethod
    def get_power_cmds(cls, is_on: bool) -> list:
        """Returns both 7E and 5B power frames for maximum firmware compatibility."""
        return [cls.get_power_cmd(is_on), cls.get_power_cmd_5b(is_on)]

    @classmethod
    def get_brightness_cmd(cls, brightness: int) -> bytes:
        """
        Dazzling Home native brightness command:
        7e 04 01 <00..64> 01 ff 00 ef
        """
        b = cls.clamp(brightness, 0, 100)
        return bytes([0x7e, 0x04, 0x01, b, 0x01, 0xff, 0x00, 0xef])

    @classmethod
    def get_color_cmd(cls, r: int, g: int, b: int) -> bytes:
        r_c = cls.clamp(r)
        g_c = cls.clamp(g)
        b_c = cls.clamp(b)
        return bytes([0x7e, 0x07, 0x05, 0x03, r_c, g_c, b_c, 0x00, 0xef])

    @classmethod
    def get_native_effect_cmd(cls, effect_id: int, speed: int = 50) -> bytes:
        eff = cls.clamp(effect_id, 0x82, 0x8A)
        spd = cls.clamp(speed, 0, 100)
        return bytes([0x7e, 0x05, 0x03, eff, spd, 0x00, 0xef])
