"""
Ultra-Low-Latency Coalesced Device Manager for DualLumiControl PRO
Features:
- Guaranteed power control (hardware standby + zero RGB blackout)
- State-coalesced latest-only packet dispatcher (0 latency, zero MCU buffer overflow)
- Color order calibration (RGB, GRB, BGR, BRG)
- Software gamma & brightness scaling
- Auto-reconnect with exponential backoff & WinRT Bluetooth radio auto-wake
- Dual 5B & 7E KeepSmile power frame execution
- LotusLamp X / ELK-BLEDOM hardware clock sync
"""

import asyncio
import datetime
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import sys
import time
from typing import Dict, Any, Optional, List, Tuple
from bleak import BleakScanner, BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

sys.path.insert(0, os.path.dirname(__file__))

from protocol_elk import ElkProtocol, ELK_WRITE_CHARACTERISTICS, ELK_PRIMARY_SERVICE
from protocol_keepsmile import KeepsmileProtocol, KEEPSMILE_WRITE_CHARACTERISTICS, KEEPSMILE_SERVICES

# Configure Rotating File Logger (max 1MB, 3 backups)
LOG_PATH = os.path.join(os.path.dirname(__file__), "server.log")
_handler = RotatingFileHandler(LOG_PATH, maxBytes=1_048_576, backupCount=3, encoding="utf-8")
_formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
_handler.setFormatter(_formatter)

logger = logging.getLogger("DualLumiManager")
logger.setLevel(logging.INFO)
logger.addHandler(_handler)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


class DeviceSession:
    def __init__(self, device_type: str, name: str = "", address: str = ""):
        self.device_type = device_type  # "strip" or "bulb"
        self.name = name
        self.address = address
        self.client: Optional[BleakClient] = None
        self.write_char: Optional[BleakGATTCharacteristic] = None
        self.is_connected = False
        self.is_connecting = False
        self.rssi: Optional[int] = None

        # Backoff tracking
        self.fail_count = 0
        self.next_retry_ts = 0.0

        # State tracking
        self.power = True
        self.r = 255
        self.g = 80
        self.b = 0
        self.brightness = 100
        self.effect = 0

        # Color calibration
        self.color_order = "RGB"  # "RGB", "GRB", "BGR", "BRG"

        # Coalesced worker fields
        self._pending_packets: Optional[List[bytes]] = None
        self._event = asyncio.Event()
        self._worker_task: Optional[asyncio.Task] = None

    def start_worker(self):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = loop.create_task(self._tx_worker())

    async def _tx_worker(self):
        """
        Processes packets with 15ms pacing. Overwrites old packets with newest state.
        Guarantees zero BLE buffer overflow while keeping real-time responsiveness.
        """
        while True:
            await self._event.wait()
            self._event.clear()

            pkts = self._pending_packets
            self._pending_packets = None

            if pkts and self.is_connected and self.client and self.write_char:
                try:
                    for p in pkts:
                        await self.client.write_gatt_char(self.write_char, p, response=False)
                        if len(p) > 2 and p[2] in [0x82, 0x83]:
                            await asyncio.sleep(0.080)
                        else:
                            await asyncio.sleep(0.015)
                except Exception as e:
                    logger.error(f"TX error on {self.device_type} ({self.address}): {e}")
                    self.is_connected = False

    def enqueue_packets(self, pkts: List[bytes]):
        self._pending_packets = pkts
        self.start_worker()
        self._event.set()

    def get_scaled_rgb(self) -> Tuple[int, int, int]:
        if not self.power:
            return (0, 0, 0)
        scale = max(0.01, min(self.brightness / 100.0, 1.0))
        r = int(self.r * scale)
        g = int(self.g * scale)
        b = int(self.b * scale)

        # Channel swapping based on hardware calibration
        if self.color_order == "GRB":
            return (g, r, b)
        elif self.color_order == "BGR":
            return (b, g, r)
        elif self.color_order == "BRG":
            return (b, r, g)
        return (r, g, b)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.device_type,
            "name": self.name,
            "address": self.address,
            "connected": self.is_connected,
            "connecting": self.is_connecting,
            "power": self.power,
            "r": self.r,
            "g": self.g,
            "b": self.b,
            "brightness": self.brightness,
            "effect": self.effect,
            "color_order": self.color_order,
            "rssi": self.rssi
        }


class DeviceManager:
    def __init__(self):
        self.strip = DeviceSession("strip", "ELK-BLEDOB Strip", "BE:37:F1:00:CF:7E")
        self.bulb = DeviceSession("bulb", "KS04-651420", "41:24:86:92:02:22")
        self.sync_mode = True
        self.schedules: List[Dict[str, Any]] = []
        self.api_key = ""
        self.require_auth = False
        self.bluetooth_radio_state = "unknown"  # "on", "off", "unavailable"
        self.load_config()

    async def ensure_bluetooth_radio_on(self) -> bool:
        """Checks Windows Bluetooth radio via WinRT and powers it on automatically if disabled."""
        try:
            from winrt.windows.devices.radios import Radio, RadioKind, RadioState
            radios = await Radio.get_radios_async()
            for r in radios:
                if r.kind == RadioKind.BLUETOOTH:
                    if r.state == RadioState.ON:
                        self.bluetooth_radio_state = "on"
                        return True
                    else:
                        logger.warning("Bluetooth radio is currently OFF. Powering on radio...")
                        res = await r.set_state_async(RadioState.ON)
                        # RadioAccessStatus: 1 is Allowed
                        self.bluetooth_radio_state = "on"
                        logger.info(f"Bluetooth radio powered ON (result: {res})")
                        await asyncio.sleep(1.0)
                        return True
            self.bluetooth_radio_state = "unavailable"
            return False
        except Exception as e:
            # WinRT not available or permissions issue
            logger.debug(f"WinRT radio check skipped or failed: {e}")
            self.bluetooth_radio_state = "on"  # assume on if cannot check
            return True

    async def set_bluetooth_power(self, power_on: bool) -> bool:
        """Sets Windows Bluetooth radio state via WinRT."""
        try:
            from winrt.windows.devices.radios import Radio, RadioKind, RadioState
            radios = await Radio.get_radios_async()
            target_state = RadioState.ON if power_on else RadioState.OFF
            for r in radios:
                if r.kind == RadioKind.BLUETOOTH:
                    await r.set_state_async(target_state)
                    self.bluetooth_radio_state = "on" if power_on else "off"
                    logger.info(f"Bluetooth radio set to {self.bluetooth_radio_state}")
                    return power_on
            return False
        except Exception as e:
            logger.error(f"Failed to change Bluetooth power: {e}")
            return False

    def load_config(self):
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "strip" in data:
                        self.strip.address = data["strip"].get("address", self.strip.address)
                        self.strip.name = data["strip"].get("name", self.strip.name)
                        self.strip.color_order = data["strip"].get("color_order", "RGB")
                        self.strip.power = data["strip"].get("power", True)
                        self.strip.r = data["strip"].get("r", 255)
                        self.strip.g = data["strip"].get("g", 255)
                        self.strip.b = data["strip"].get("b", 255)
                        self.strip.brightness = data["strip"].get("brightness", 100)
                    if "bulb" in data:
                        self.bulb.address = data["bulb"].get("address", self.bulb.address)
                        self.bulb.name = data["bulb"].get("name", self.bulb.name)
                        self.bulb.color_order = data["bulb"].get("color_order", "RGB")
                        self.bulb.power = data["bulb"].get("power", True)
                        self.bulb.r = data["bulb"].get("r", 255)
                        self.bulb.g = data["bulb"].get("g", 255)
                        self.bulb.b = data["bulb"].get("b", 255)
                        self.bulb.brightness = data["bulb"].get("brightness", 100)
                    self.sync_mode = data.get("sync_mode", True)
                    self.schedules = data.get("schedules", [])
                    self.api_key = data.get("api_key", "")
                    self.require_auth = data.get("require_auth", False)
                    logger.info("Loaded config successfully.")
            except Exception as e:
                logger.error(f"Error reading config: {e}")

        # Generate API key if missing
        if not self.api_key:
            import secrets
            self.api_key = secrets.token_hex(16)
            self.save_config()

    def save_config(self):
        data = {
            "strip": {
                "address": self.strip.address,
                "name": self.strip.name,
                "color_order": self.strip.color_order,
                "power": self.strip.power,
                "r": self.strip.r,
                "g": self.strip.g,
                "b": self.strip.b,
                "brightness": self.strip.brightness
            },
            "bulb": {
                "address": self.bulb.address,
                "name": self.bulb.name,
                "color_order": self.bulb.color_order,
                "power": self.bulb.power,
                "r": self.bulb.r,
                "g": self.bulb.g,
                "b": self.bulb.b,
                "brightness": self.bulb.brightness
            },
            "sync_mode": self.sync_mode,
            "schedules": self.schedules,
            "api_key": self.api_key,
            "require_auth": self.require_auth
        }
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save config: {e}")

    def get_schedules(self) -> List[Dict[str, Any]]:
        return self.schedules

    def save_schedules(self, schedules: List[Dict[str, Any]]):
        self.schedules = schedules
        self.save_config()
        self.sync_hardware_timers()

    def sync_hardware_timers(self):
        """Syncs clock time and active schedule directly to on-chip microcontroller of the ELK strip."""
        if not self.strip.is_connected:
            return
        try:
            now = datetime.datetime.now()
            time_frame = ElkProtocol.get_time_sync_cmd(now)
            pkts = [time_frame]

            for sch in self.schedules:
                if not sch.get("enabled", True):
                    continue
                parts = sch.get("time", "00:00").split(":")
                if len(parts) == 2:
                    h = int(parts[0])
                    m = int(parts[1])
                    act = sch.get("action", "power_on")
                    is_on = (act in ["power_on", "sunrise"])
                    pkts.append(ElkProtocol.get_hardware_timer_cmd(h, m, is_on=is_on))

            self.strip.enqueue_packets(pkts)
            logger.info("Synchronized hardware RTC timer to ELK Strip.")
        except Exception as e:
            logger.warning(f"Hardware timer sync failed: {e}")

    async def connect_device(self, session: DeviceSession) -> bool:
        if not session.address:
            return False
        if session.is_connecting or session.is_connected:
            return session.is_connected

        # Ensure Bluetooth radio is active before attempting connection
        await self.ensure_bluetooth_radio_on()

        session.is_connecting = True
        try:
            logger.info(f"Connecting to {session.device_type} ({session.name}) at {session.address}...")
            client = BleakClient(session.address, disconnected_callback=lambda c: self.on_disconnect(session))
            await client.connect(timeout=12.0)

            # Discover write characteristic with wait loop for Windows WinRT service resolution
            write_char = None
            target_chars = ELK_WRITE_CHARACTERISTICS if session.device_type == "strip" else KEEPSMILE_WRITE_CHARACTERISTICS

            for _ in range(15):
                services = list(client.services)
                if services:
                    # Direct check by known characteristic UUID
                    for uuid in target_chars:
                        try:
                            char_match = client.services.get_characteristic(uuid)
                            if char_match:
                                write_char = char_match
                                break
                        except Exception:
                            pass
                    if write_char:
                        break

                    # Search through all discovered characteristics
                    for service in services:
                        for char in service.characteristics:
                            props = char.properties or []
                            if "write" in props or "write-without-response" in props:
                                uuid_str = str(char.uuid).lower()
                                if any(t in uuid_str for t in ["fff3", "afd1", "ae01", "ffe1", "ffd5"]) or uuid_str in target_chars:
                                    write_char = char
                                    break
                        if write_char:
                            break

                    # Fallback to any writable char
                    if not write_char:
                        for service in services:
                            for char in service.characteristics:
                                props = char.properties or []
                                if "write" in props or "write-without-response" in props:
                                    write_char = char
                                    break
                            if write_char:
                                break

                    if write_char:
                        break

                await asyncio.sleep(0.25)

            if not write_char:
                raise Exception("No writable GATT characteristic found on device")

            session.client = client
            session.write_char = write_char
            session.is_connected = True
            session.is_connecting = False
            session.fail_count = 0
            logger.info(f"Successfully connected to {session.device_type} ({session.address})!")

            # Push current hardware state immediately
            await self.push_state_to_device(session)

            # If strip, sync RTC hardware clock
            if session.device_type == "strip":
                self.sync_hardware_timers()

            return True

        except Exception as e:
            session.fail_count += 1
            # Exponential backoff: 10s, 20s, 40s, max 60s
            backoff = min(60.0, 10.0 * (1.5 ** min(session.fail_count, 4)))
            session.next_retry_ts = time.time() + backoff
            logger.warning(f"Failed to connect to {session.device_type} ({session.address}): {e} (retry in {int(backoff)}s)")
            session.is_connected = False
            session.is_connecting = False
            if session.client:
                try:
                    await session.client.disconnect()
                except Exception:
                    pass
                session.client = None
            session.write_char = None
            return False

    def on_disconnect(self, session: DeviceSession):
        logger.warning(f"Device disconnected: {session.device_type} ({session.address})")
        session.is_connected = False
        session.client = None
        session.write_char = None

    async def disconnect_device(self, session: DeviceSession):
        if session.client and session.is_connected:
            try:
                await session.client.disconnect()
            except Exception:
                pass
        session.is_connected = False
        session.client = None
        session.write_char = None
        logger.info(f"Disconnected {session.device_type}.")

    async def push_state_to_device(self, session: DeviceSession):
        if not session.is_connected:
            return
        if session.device_type == "strip":
            if not session.power:
                pkts = [ElkProtocol.get_power_cmd(False), ElkProtocol.get_color_cmd(0, 0, 0)]
            else:
                r, g, b = session.get_scaled_rgb()
                pkts = [
                    ElkProtocol.get_power_cmd(True),
                    ElkProtocol.get_brightness_cmd(session.brightness),
                    ElkProtocol.get_color_cmd(r, g, b)
                ]
            session.enqueue_packets(pkts)
        else:
            if not session.power:
                pkts = KeepsmileProtocol.get_power_cmds(False) + [KeepsmileProtocol.get_color_cmd(0, 0, 0)]
            else:
                r, g, b = session.get_scaled_rgb()
                pkts = KeepsmileProtocol.get_power_cmds(True) + [
                    KeepsmileProtocol.get_brightness_cmd(session.brightness),
                    KeepsmileProtocol.get_color_cmd(r, g, b)
                ]
            session.enqueue_packets(pkts)
