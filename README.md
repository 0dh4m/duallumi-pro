# 🌟 DualLumi PRO v3.5 - Master Desktop Smart Lighting Controller

<div align="center">

[![Author](https://img.shields.io/badge/Author-0dh4m-00E5FF?style=for-the-badge&logo=github&logoColor=white)](https://github.com/0dh4m)
[![Platform](https://img.shields.io/badge/Platform-Windows%20WinRT%20Desktop-7928CA?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/0dh4m/duallumi-pro)
[![Protocol](https://img.shields.io/badge/BLE-GATT%20ELK--BLEDOM%20%7C%20KS04-FF0080?style=for-the-badge&logo=bluetooth&logoColor=white)](https://github.com/0dh4m/duallumi-pro)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](https://github.com/0dh4m)

</div>



**Unified Ultra-Low Latency BLE Controller for ELK-BLEDOB LED Strip & KS04-651420 Smart Bulb**

A futuristic, glassmorphism native Windows desktop application and BLE lighting ecosystem with real-time WebSocket communication, system tray companion, global in-game hotkeys, floating mini HUD, zero-latency packet coalescing, and dual independent/sync control.

---

## ⚡ What's New in v3.5 (Native Desktop Upgrade)
- 🪟 **Dedicated Native Desktop App**: Runs as an ultra-fast, frameless glassmorphic Windows desktop application with custom window controls and draggable header.
- 🔔 **Interactive System Tray Companion**: Lives in your Windows Taskbar (near the clock) with real-time quick actions (Master On/Off, Quick Scenes, Brightness, Sync mode, and Ambilight). Left-click toggles the window instantly.
- ⌨️ **Global In-Game Hotkeys**: Control your room lights from inside ANY fullscreen game or application:
  - `Ctrl + Shift + L`: Master Power (Turn All On / Off)
  - `Ctrl + Shift + Up` / `Down`: Adjust Brightness (+/- 10%)
  - `Ctrl + Shift + S`: Toggle Sync Mode
  - `Ctrl + Shift + 1` to `5`: Quick Scene Switching (Sunset, Cyberpunk, Ocean, Candlelight, Daylight)
- 🗗 **Floating Mini HUD Overlay**: A compact, sleek, draggable HUD widget (`Ctrl+Shift+W` or click "Mini") that floats unobtrusively on your desktop for quick light controls while gaming or working.
- 🛡️ **Auto-Lifecycle Backend Daemon**: Desktop app automatically checks, launches, and monitors the Python `server.py` in the background with zero visible black CMD windows.
- 📌 **One-Click Desktop Shortcut**: `DualLumi PRO.lnk` right on your Windows Desktop!

---

## ✨ What's New in v3.0 (Major Upgrade)

### 🚀 Hardware & Reliability Overhaul
- 🛠️ **Fixed Critical Backend Crashes**: Fixed `BleakScanner` NameError, `KEEPSMILE_SERVICES` NameError, and `ElkProtocol` effect attribute errors.
- 📶 **WinRT Bluetooth Radio Auto-Wake**: Automatically checks and powers on the Windows Bluetooth radio via WinRT if disabled or in sleep mode.
- ⚡ **Asynchronous GATT Resolution**: Eliminates WinRT characteristic race condition with an active discovery retry loop.
- 🛡️ **Zero-Overflow Packet Coalescing**: 15ms paced state dispatcher ensures microcontrollers never suffer buffer drops or stutter.
- 🔄 **Exponential Auto-Reconnect**: Intelligent backoff prevents log spamming while ensuring instant reconnection when lights turn on.
- ⏰ **Hardware RTC Clock Sync**: LotusLamp X / ELK-BLEDOM hardware microcontroller clock and timer frames synced automatically on connect.

### 🎨 Next-Generation UI & Interactive Features
- 🎛️ **Dual Device Status Cards**: Live cards for both ELK Strip and KS04 Bulb with signal strength, connection badges, MAC addresses, individual brightness, power, and color order (RGB, GRB, BGR).
- ⚡ **Unified Sync Mode & Independent Mode**: Control both lights together or tune strip and bulb colors and brightness completely independently.
- 🌡️ **Kelvin White Spectrum Studio**: Smooth 2000K (Warm Candle) to 6500K (Cool Daylight) slider with Planckian locus color conversion.
- 🌈 **Interactive HSV Circular Gamut Wheel**: High-DPI canvas color wheel with touch and mouse dragging, hex code direct entry, and native desktop **EyeDropper** tool.
- 🎭 **8 Curated Designer Palettes**: Sunset Glow, Ocean Deep, Cyberpunk Neon, Emerald Forest, Cozy Fireplace, Nordic Aurora, Pastel Dreams, and Tokyo Midnight.
- 📸 **Photo Color Extraction Studio**: Drag & drop any photo or poster; canvas analysis extracts top 6 vivid dominant tones to apply instantly.
- ✨ **Dynamic Effects Studio**: 12 dynamic effects (Rainbow Flow, Aurora Borealis, Candle Flicker, Cyberpunk Pulse, Fireplace Embers, Disco Strobe, Sunset Drift, Ocean Swell, Police Flasher, Breathing Pulse, 7-Color Jump, 7-Color Fade) with live speed slider.
- 🎵 **Music Reactive Beat-Sync with 16-Band Equalizer**: Live audio canvas visualizer bouncing to music in real-time with 4 ambiance modes (Harmonic, Beat Pulse, Spectrum, Strobe) and sensitivity control.
- 🖥️ **Ambilight Screen Sync**: Real-time display mirroring with edge-sampling or full-screen average for cinema and gaming immersion.
- 🕒 **Circadian Rhythm Natural Daylight Mode**: 24-hour astronomical cycle aligns color temperature throughout the day (Warm Wakeup → Cool Daylight → Relaxing Amber → Melatonin Candle).
- 🎙️ **Multi-Language Voice Control**: Native Moroccan Darija (شعل الضو، طفي، دير لحمر، زيد فالضو...), Arabic, and English voice commands with animated listening wave.
- ⏰ **Smart Automation & Schedules**: Sunrise alarms, sleep timers, and power schedules that run 24/7 in background even when browser is closed.
- 📡 **BLE Device Scanner Modal**: One-click in-app scanning with instant "Set as Strip" and "Set as Bulb" pairing.
- 🌌 **5 High-Performance Themes**: Dark Glass, OLED Black, Cyberpunk Neon, Sunset Warm, and Aurora Borealis.

---

## 🚀 Quick Launch Guide

### 1. Start in Background (Recommended)
Double-click:
```text
Start_Silent_Background.bat
```
* Launches the server in the background (no black console window).
* Automatically opens `http://localhost:8080` in your browser.
* Keeps running silently so alarms, schedules, and auto-reconnect work 24/7.

### 2. Interactive Menu
Double-click:
```text
scripts/start.bat
```
Offers:
1. Run in Background
2. Run with Live Console Logs
3. Stop Background Service
4. Scan BLE Devices

### 3. Stop Server
Double-click:
```text
scripts/stop.bat
```

### 4. Auto-Start on Windows Boot
Run as administrator:
```text
scripts/install_autostart.bat
```
To uninstall startup:
```text
Uninstall_AutoStart.bat
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| `Space` | Toggle Master Power (Both Lights) |
| `↑` / `↓` | Increase / Decrease Brightness by 5% |
| `1` - `6` | Trigger Preset Scenes 1 through 6 |
| `M` | Toggle Music Reactive Mode |
| `S` | Toggle Sync Mode / Independent Mode |

---

## 🛠️ Architecture Overview

```text
DualLumiControl/
├── backend/
│   ├── config.json              # Device addresses, states, and settings
│   ├── device_manager.py        # Coalesced dispatcher, WinRT radio auto-wake
│   ├── protocol_elk.py          # LotusLamp X / ELK-BLEDOB single-packet frames
│   ├── protocol_keepsmile.py    # KS04 / KeepSmile dual 5B & 7E frames
│   ├── scanner.py               # Standalone BLE device scanner
│   ├── server.py                # aiohttp async REST & WebSocket server
│   └── server.log               # 1MB rotating log (3 backups)
├── web/
│   ├── index.html               # Semantic, accessible glassmorphism UI
│   ├── style.css                # CSS variables, 5 themes, responsive layout
│   ├── app.js                   # WebSocket engine, visualizer, effects, voice
│   ├── web_bluetooth.js         # Direct Web Bluetooth fallback driver
│   ├── manifest.json            # PWA manifest
│   └── icons/                   # App icons (192, 512, SVG)
├── scripts/install_autostart.bat
├── Open_Web_Bluetooth_App.bat
├── Scan_Devices.bat
├── scripts/start.bat
├── scripts/start_silent.vbs
├── Start_Silent_Background.bat
├── scripts/stop.bat
└── Uninstall_AutoStart.bat
```

---

## 🛡️ Device Compatibility

- **LED Strip**: ELK-BLEDOB, ELK-BLEDOM, LotusLamp X, DuoCo Strip
- **Smart Bulb**: KS04-651420, KS03, Dazzling home, KeepSmile, HuaXin LED
