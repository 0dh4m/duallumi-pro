# ==============================================================================
# Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
# Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
# Author: Adham Cherkaoui Eddeqaqi (0dh4m) <0dh4mm@gmail.com>
# GitHub: https://github.com/0dh4m
# ==============================================================================

"""
DualLumiControl PRO - High-Performance aiohttp Backend Server
Features:
- REST API & Real-time WebSocket controller with Zero Latency
- Device Manager integration with LotusLamp X / ELK Strip & KS04 Bulb protocols
- BLE Device Scanner & 1-click device assignment
- Bluetooth Radio auto-wake & power control via WinRT
- Rotating File Logger with auto-reconnect backoff
- Hardware clock & timer synchronization loop
- API Key Authentication & CORS support
"""

import asyncio
import datetime
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
import sys
import time
from typing import Optional, Dict, Any

# Ensure stdout and stderr never throw in pythonw
if sys.stdout is None:
    class DummyStream:
        def write(self, *args, **kwargs): pass
        def flush(self, *args, **kwargs): pass
    sys.stdout = DummyStream()
    sys.stderr = DummyStream()

from aiohttp import web
from bleak import BleakScanner

sys.path.insert(0, os.path.dirname(__file__))
from device_manager import DeviceManager
from protocol_elk import ElkProtocol
from protocol_keepsmile import KeepsmileProtocol

# Configure Rotating File Logger (max 1MB, 3 backups)
LOG_PATH = os.path.join(os.path.dirname(__file__), "server.log")
handler = RotatingFileHandler(LOG_PATH, maxBytes=1_048_576, backupCount=3, encoding="utf-8")
formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
handler.setFormatter(formatter)

logger = logging.getLogger("DualLumiServer")
logger.setLevel(logging.INFO)
logger.addHandler(handler)

# Also log to stdout if available
if sys.stdout is not None:
    try:
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)
    except Exception:
        pass

manager = DeviceManager()

# Print startup security banner
try:
    print("=" * 60)
    print(" 🌟 DualLumi PRO Backend Server Starting...")
    print(f" 🔑 Security API Key: {manager.api_key}")
    print(f" 🛡️  Require Auth: {manager.require_auth}")
    print("=" * 60)
except Exception:
    pass

connected_websockets = set()


def validate_rgb(r, g, b) -> tuple:
    return (
        max(0, min(255, int(r))),
        max(0, min(255, int(g))),
        max(0, min(255, int(b)))
    )


def validate_brightness(b) -> int:
    return max(1, min(100, int(b)))


def validate_kelvin(k) -> int:
    return max(2000, min(6500, int(k)))


def kelvin_to_rgb(kelvin: int) -> tuple:
    """Accurate Planckian locus Kelvin-to-RGB approximation."""
    temp = kelvin / 100.0
    if temp <= 66:
        red = 255
        green = temp
        green = 99.4708025861 * math.log(green) - 161.1195681661 if green > 0 else 0
        blue = temp - 10
        blue = 138.5177312231 * math.log(blue) - 305.0447927307 if blue >= 19 else 0
    else:
        red = temp - 60
        red = 329.698727446 * (red ** -0.1332047592)
        green = temp - 60
        green = 288.1221695283 * (green ** -0.0755148492)
        blue = 255

    r = max(0, min(255, int(red)))
    g = max(0, min(255, int(green)))
    b = max(0, min(255, int(blue)))
    return (r, g, b)


def check_auth(request: web.Request) -> bool:
    if not manager.require_auth:
        return True

    # Allow localhost without auth for seamless local UI experience
    peer = request.remote or ""
    if peer in ["127.0.0.1", "::1", "localhost"]:
        return True

    key = request.headers.get("X-API-Key", "")
    if not key:
        key = request.query.get("api_key", "")

    return key == manager.api_key


@web.middleware
async def auth_and_cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        response = web.Response(status=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
        return response

    # Check API key for /api/ routes if auth required
    if request.path.startswith("/api/") and manager.require_auth:
        # Exclude status check from hard blocking so the web client knows auth is needed
        if request.path not in ["/api/status"]:
            if not check_auth(request):
                return web.json_response({"error": "Unauthorized: Invalid or missing API Key"}, status=401)

    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
    return response


def get_status_payload() -> Dict[str, Any]:
    return {
        "strip": manager.strip.to_dict(),
        "bulb": manager.bulb.to_dict(),
        "sync_mode": manager.sync_mode,
        "schedules": manager.schedules,
        "require_auth": manager.require_auth,
        "api_key": manager.api_key if not manager.require_auth else "",
        "bluetooth_radio": manager.bluetooth_radio_state
    }


async def broadcast_status():
    status = get_status_payload()
    msg = json.dumps({"type": "status_update", "data": status})
    for ws in list(connected_websockets):
        try:
            await ws.send_str(msg)
        except Exception:
            connected_websockets.discard(ws)


# ═══════════════════════════════════════════════════════════════════════════════
# REST API HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_status(request: web.Request):
    return web.json_response(get_status_payload())


async def handle_scan(request: web.Request):
    try:
        await manager.ensure_bluetooth_radio_on()
        devices = await BleakScanner.discover(timeout=5.0, return_adv=True)
        result = []
        for addr, (d, adv) in devices.items():
            name = d.name or adv.local_name or "Unknown Device"
            rssi = adv.rssi if hasattr(adv, "rssi") else -99

            # Auto-detect device candidate type
            up = name.upper()
            if any(x in up for x in ['ELK', 'BLEDOB', 'BLEDOM', 'LOTUS', 'DUOCO']):
                dev_type = "strip"
            elif any(x in up for x in ['KS0', 'KS1', 'KEEP', 'DAZZL', 'BULB', 'HUAXIN', 'LEDNET']):
                dev_type = "bulb"
            else:
                dev_type = "other"

            result.append({
                "name": name,
                "address": addr,
                "rssi": rssi,
                "type": dev_type
            })

        # Sort closest / highest signal first
        result.sort(key=lambda x: x["rssi"], reverse=True)
        return web.json_response({"success": True, "devices": result})
    except Exception as e:
        logger.error(f"Scan failed: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)


async def handle_set_device(request: web.Request):
    """Assigns an address and name to strip or bulb from scanner or settings."""
    try:
        data = await request.json()
        target = data.get("target", "strip")
        address = data.get("address")
        name = data.get("name")
        color_order = data.get("color_order")

        session = manager.strip if target == "strip" else manager.bulb
        changed = False

        if address and address != session.address:
            await manager.disconnect_device(session)
            session.address = address
            changed = True
        if name:
            session.name = name
            changed = True
        if color_order and color_order in ["RGB", "GRB", "BGR", "BRG"]:
            session.color_order = color_order
            changed = True

        manager.save_config()
        if changed:
            # Attempt immediate connection in background
            asyncio.create_task(manager.connect_device(session))

        await broadcast_status()
        return web.json_response({"success": True, "device": session.to_dict()})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_bluetooth_power(request: web.Request):
    """Turns Windows Bluetooth radio on or off via WinRT."""
    try:
        data = await request.json()
        power = bool(data.get("power", True))
        status = await manager.set_bluetooth_power(power)
        await broadcast_status()
        return web.json_response({"success": True, "bluetooth_on": status})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_connect(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "all")
        address = data.get("address")

        if target == "strip":
            if address:
                manager.strip.address = address
            success = await manager.connect_device(manager.strip)
        elif target == "bulb":
            if address:
                manager.bulb.address = address
            success = await manager.connect_device(manager.bulb)
        else:
            s1 = await manager.connect_device(manager.strip)
            s2 = await manager.connect_device(manager.bulb)
            success = s1 or s2

        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": success})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_disconnect(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "all")
        if target in ["strip", "all"]:
            await manager.disconnect_device(manager.strip)
        if target in ["bulb", "all"]:
            await manager.disconnect_device(manager.bulb)
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_power(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "all")
        power = bool(data.get("power", True))

        if manager.sync_mode or target == "all":
            manager.strip.power = power
            manager.bulb.power = power
            await asyncio.gather(
                manager.push_state_to_device(manager.strip),
                manager.push_state_to_device(manager.bulb)
            )
        else:
            if target == "strip":
                manager.strip.power = power
                await manager.push_state_to_device(manager.strip)
            elif target == "bulb":
                manager.bulb.power = power
                await manager.push_state_to_device(manager.bulb)

        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_color(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "all" if manager.sync_mode else "strip")
        r, g, b = validate_rgb(data.get("r", 255), data.get("g", 255), data.get("b", 255))
        save = bool(data.get("save", True))

        if manager.sync_mode or target == "all":
            for s in [manager.strip, manager.bulb]:
                s.r, s.g, s.b = r, g, b
                s.power = True
            await asyncio.gather(
                manager.push_state_to_device(manager.strip),
                manager.push_state_to_device(manager.bulb)
            )
        else:
            session = manager.strip if target == "strip" else manager.bulb
            session.r, session.g, session.b = r, g, b
            session.power = True
            await manager.push_state_to_device(session)

        if save:
            manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_dual_color(request: web.Request):
    """Sets independent RGB colors for strip and bulb in a single coalesced call."""
    try:
        data = await request.json()
        strip_rgb = data.get("strip", [255, 255, 255])
        bulb_rgb = data.get("bulb", [255, 255, 255])

        sr, sg, sb = validate_rgb(*strip_rgb)
        br, bg, bb = validate_rgb(*bulb_rgb)

        manager.strip.r, manager.strip.g, manager.strip.b = sr, sg, sb
        manager.strip.power = True
        manager.bulb.r, manager.bulb.g, manager.bulb.b = br, bg, bb
        manager.bulb.power = True

        await asyncio.gather(
            manager.push_state_to_device(manager.strip),
            manager.push_state_to_device(manager.bulb)
        )
        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_brightness(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "all" if manager.sync_mode else "strip")
        brightness = validate_brightness(data.get("brightness", 100))

        if manager.sync_mode or target == "all":
            manager.strip.brightness = brightness
            manager.bulb.brightness = brightness
            await asyncio.gather(
                manager.push_state_to_device(manager.strip),
                manager.push_state_to_device(manager.bulb)
            )
        else:
            session = manager.strip if target == "strip" else manager.bulb
            session.brightness = brightness
            await manager.push_state_to_device(session)

        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_color_temp(request: web.Request):
    try:
        data = await request.json()
        kelvin = validate_kelvin(data.get("kelvin", 4000))
        target = data.get("target", "all" if manager.sync_mode else "strip")

        r, g, b = kelvin_to_rgb(kelvin)

        if manager.sync_mode or target == "all":
            manager.strip.r, manager.strip.g, manager.strip.b = r, g, b
            manager.bulb.r, manager.bulb.g, manager.bulb.b = r, g, b
            manager.strip.power = True
            manager.bulb.power = True
            await asyncio.gather(
                manager.push_state_to_device(manager.strip),
                manager.push_state_to_device(manager.bulb)
            )
        else:
            s = manager.strip if target == "strip" else manager.bulb
            s.r, s.g, s.b = r, g, b
            s.power = True
            await manager.push_state_to_device(s)

        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True, "kelvin": kelvin, "r": r, "g": g, "b": b})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_effect(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "all" if manager.sync_mode else "strip")
        effect_id = int(data.get("effect", 0x87))
        speed = int(data.get("speed", 50))

        if manager.sync_mode or target == "all":
            for s in [manager.strip, manager.bulb]:
                s.effect = effect_id
                s.power = True
                if s.device_type == "strip":
                    pkts = [ElkProtocol.get_native_effect_cmd(effect_id, speed)]
                else:
                    pkts = [KeepsmileProtocol.get_native_effect_cmd(effect_id, speed)]
                s.enqueue_packets(pkts)
        else:
            s = manager.strip if target == "strip" else manager.bulb
            s.effect = effect_id
            s.power = True
            if s.device_type == "strip":
                pkts = [ElkProtocol.get_native_effect_cmd(effect_id, speed)]
            else:
                pkts = [KeepsmileProtocol.get_native_effect_cmd(effect_id, speed)]
            s.enqueue_packets(pkts)

        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_sync_mode(request: web.Request):
    try:
        data = await request.json()
        manager.sync_mode = bool(data.get("sync_mode", True))
        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True, "sync_mode": manager.sync_mode})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_calibration(request: web.Request):
    try:
        data = await request.json()
        target = data.get("target", "strip")
        order = data.get("color_order", "RGB").upper()
        if order not in ["RGB", "GRB", "BGR", "BRG"]:
            return web.json_response({"success": False, "error": "Invalid color order"}, status=400)

        if target == "strip" or manager.sync_mode:
            manager.strip.color_order = order
            await manager.push_state_to_device(manager.strip)
        if target == "bulb" or manager.sync_mode:
            manager.bulb.color_order = order
            await manager.push_state_to_device(manager.bulb)

        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_schedules_get(request: web.Request):
    return web.json_response({"success": True, "schedules": manager.get_schedules()})


async def handle_schedules_post(request: web.Request):
    try:
        data = await request.json()
        schedules = data.get("schedules", [])
        manager.save_schedules(schedules)
        await broadcast_status()
        return web.json_response({"success": True, "schedules": manager.get_schedules()})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


async def handle_auth_toggle(request: web.Request):
    try:
        data = await request.json()
        manager.require_auth = bool(data.get("require_auth", False))
        manager.save_config()
        await broadcast_status()
        return web.json_response({"success": True, "require_auth": manager.require_auth, "api_key": manager.api_key})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=400)


# ═══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET REAL-TIME ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_websocket(request: web.Request):
    # WS Auth check
    if manager.require_auth:
        key = request.query.get("api_key", "")
        peer = request.remote or ""
        if peer not in ["127.0.0.1", "::1", "localhost"] and key != manager.api_key:
            ws_reject = web.WebSocketResponse()
            await ws_reject.prepare(request)
            await ws_reject.close(code=4001, message=b"Unauthorized")
            return ws_reject

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_websockets.add(ws)
    logger.info(f"WebSocket client connected from {request.remote}")

    # Send initial status snapshot immediately
    try:
        await ws.send_str(json.dumps({"type": "status_update", "data": get_status_payload()}))
    except Exception:
        pass

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data_json = json.loads(msg.data)
                    action = data_json.get("action")
                    payload = data_json.get("data", {})

                    if action == "ping":
                        await ws.send_str(json.dumps({"type": "pong", "time": time.time()}))

                    elif action == "color":
                        r, g, b = validate_rgb(payload.get("r", 255), payload.get("g", 255), payload.get("b", 255))
                        target = payload.get("target", "all" if manager.sync_mode else "strip")
                        save = bool(payload.get("save", False))

                        if manager.sync_mode or target == "all":
                            for s in [manager.strip, manager.bulb]:
                                s.r, s.g, s.b = r, g, b
                                s.power = True
                            await asyncio.gather(
                                manager.push_state_to_device(manager.strip),
                                manager.push_state_to_device(manager.bulb)
                            )
                        else:
                            s = manager.strip if target == "strip" else manager.bulb
                            s.r, s.g, s.b = r, g, b
                            s.power = True
                            await manager.push_state_to_device(s)

                        if save:
                            manager.save_config()
                        await broadcast_status()

                    elif action == "brightness":
                        brightness = validate_brightness(payload.get("brightness", 100))
                        target = payload.get("target", "all" if manager.sync_mode else "strip")
                        if manager.sync_mode or target == "all":
                            manager.strip.brightness = brightness
                            manager.bulb.brightness = brightness
                            await asyncio.gather(
                                manager.push_state_to_device(manager.strip),
                                manager.push_state_to_device(manager.bulb)
                            )
                        else:
                            s = manager.strip if target == "strip" else manager.bulb
                            s.brightness = brightness
                            await manager.push_state_to_device(s)
                        manager.save_config()
                        await broadcast_status()

                    elif action == "power":
                        power = bool(payload.get("power", True))
                        target = payload.get("target", "all" if manager.sync_mode else "strip")
                        if manager.sync_mode or target == "all":
                            manager.strip.power = power
                            manager.bulb.power = power
                            await asyncio.gather(
                                manager.push_state_to_device(manager.strip),
                                manager.push_state_to_device(manager.bulb)
                            )
                        else:
                            s = manager.strip if target == "strip" else manager.bulb
                            s.power = power
                            await manager.push_state_to_device(s)
                        manager.save_config()
                        await broadcast_status()

                    elif action == "color_temp":
                        kelvin = validate_kelvin(payload.get("kelvin", 4000))
                        target = payload.get("target", "all" if manager.sync_mode else "strip")
                        r, g, b = kelvin_to_rgb(kelvin)

                        if manager.sync_mode or target == "all":
                            manager.strip.r, manager.strip.g, manager.strip.b = r, g, b
                            manager.bulb.r, manager.bulb.g, manager.bulb.b = r, g, b
                            manager.strip.power = True
                            manager.bulb.power = True
                            await asyncio.gather(
                                manager.push_state_to_device(manager.strip),
                                manager.push_state_to_device(manager.bulb)
                            )
                        else:
                            s = manager.strip if target == "strip" else manager.bulb
                            s.r, s.g, s.b = r, g, b
                            s.power = True
                            await manager.push_state_to_device(s)
                        manager.save_config()
                        await broadcast_status()

                except Exception as e:
                    logger.error(f"WebSocket action error: {e}")
            elif msg.type == web.WSMsgType.ERROR:
                logger.error(f"WebSocket error: {ws.exception()}")
    finally:
        connected_websockets.discard(ws)
        logger.info("WebSocket client disconnected.")

    return ws


# ═══════════════════════════════════════════════════════════════════════════════
# BACKGROUND AUTOMATIONS (RECONNECT & SCHEDULER)
# ═══════════════════════════════════════════════════════════════════════════════

async def auto_reconnect_loop():
    """Smart background reconnection loop with exponential backoff and radio verification."""
    while True:
        await asyncio.sleep(10.0)
        now_ts = time.time()
        try:
            for s in [manager.strip, manager.bulb]:
                if s.address and not s.is_connected and not s.is_connecting:
                    if now_ts >= s.next_retry_ts:
                        logger.info(f"Auto-reconnect triggered for {s.device_type} ({s.address})...")
                        await manager.connect_device(s)
                        await broadcast_status()
        except Exception as e:
            logger.error(f"Auto-reconnect loop error: {e}")


async def backend_schedule_loop():
    """Executes alarms, sunrise transitions, and auto-power events based on real-time clock."""
    last_triggered_minute = ""
    while True:
        await asyncio.sleep(5.0)
        try:
            now = datetime.datetime.now()
            now_str = now.strftime("%H:%M")
            day_name = now.strftime("%a").lower()  # mon, tue, wed, thu, fri, sat, sun

            if now_str == last_triggered_minute:
                continue

            for sch in manager.schedules:
                if not sch.get("enabled", True):
                    continue
                if sch.get("time") != now_str:
                    continue

                # Day check if specified
                days = sch.get("days", [])
                if days and day_name not in [d.lower() for d in days]:
                    continue

                action = sch.get("action", "power_on")
                logger.info(f"Executing scheduled action '{action}' at {now_str}")

                if action == "power_on":
                    manager.strip.power = True
                    manager.bulb.power = True
                    await asyncio.gather(
                        manager.push_state_to_device(manager.strip),
                        manager.push_state_to_device(manager.bulb)
                    )
                elif action == "power_off":
                    manager.strip.power = False
                    manager.bulb.power = False
                    await asyncio.gather(
                        manager.push_state_to_device(manager.strip),
                        manager.push_state_to_device(manager.bulb)
                    )
                elif action == "sunrise":
                    # Gentle sunrise transition
                    manager.strip.brightness = 100
                    manager.strip.r, manager.strip.g, manager.strip.b = 255, 140, 50
                    manager.strip.power = True
                    manager.bulb.brightness = 100
                    manager.bulb.r, manager.bulb.g, manager.bulb.b = 255, 140, 50
                    manager.bulb.power = True
                    await asyncio.gather(
                        manager.push_state_to_device(manager.strip),
                        manager.push_state_to_device(manager.bulb)
                    )
                elif action == "sunset":
                    manager.strip.brightness = 40
                    manager.strip.r, manager.strip.g, manager.strip.b = 255, 90, 20
                    manager.strip.power = True
                    manager.bulb.brightness = 40
                    manager.bulb.r, manager.bulb.g, manager.bulb.b = 255, 90, 20
                    manager.bulb.power = True
                    await asyncio.gather(
                        manager.push_state_to_device(manager.strip),
                        manager.push_state_to_device(manager.bulb)
                    )

                manager.save_config()
                await broadcast_status()

            last_triggered_minute = now_str

        except Exception as e:
            logger.error(f"Schedule loop error: {e}")


async def on_startup(app):
    # Ensure Bluetooth radio is active
    await manager.ensure_bluetooth_radio_on()
    app["reconnect_task"] = asyncio.create_task(auto_reconnect_loop())
    app["schedule_task"] = asyncio.create_task(backend_schedule_loop())
    logger.info("Background tasks (Auto-reconnect & Schedules) started.")


async def on_cleanup(app):
    app["reconnect_task"].cancel()
    app["schedule_task"].cancel()
    await manager.disconnect_device(manager.strip)
    await manager.disconnect_device(manager.bulb)
    logger.info("Server cleaned up successfully.")


def create_app() -> web.Application:
    app = web.Application(middlewares=[auth_and_cors_middleware])

    # REST Routes
    app.router.add_get("/api/status", handle_status)
    app.router.add_get("/api/scan", handle_scan)
    app.router.add_post("/api/set_device", handle_set_device)
    app.router.add_post("/api/bluetooth_power", handle_bluetooth_power)
    app.router.add_post("/api/connect", handle_connect)
    app.router.add_post("/api/disconnect", handle_disconnect)
    app.router.add_post("/api/power", handle_power)
    app.router.add_post("/api/color", handle_color)
    app.router.add_post("/api/dual_color", handle_dual_color)
    app.router.add_post("/api/brightness", handle_brightness)
    app.router.add_post("/api/color_temp", handle_color_temp)
    app.router.add_post("/api/effect", handle_effect)
    app.router.add_post("/api/sync_mode", handle_sync_mode)
    app.router.add_post("/api/calibration", handle_calibration)
    app.router.add_get("/api/schedules", handle_schedules_get)
    app.router.add_post("/api/schedules", handle_schedules_post)
    app.router.add_post("/api/auth_toggle", handle_auth_toggle)

    # Real-time WebSocket
    app.router.add_get("/ws", handle_websocket)

    # Static Web App files
    web_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))
    if os.path.exists(web_dir):
        app.router.add_static("/", web_dir, show_index=True)

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


def main():
    app = create_app()
    port = 8080
    logger.info(f"Starting DualLumi PRO aiohttp server on port {port}...")
    web.run_app(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
