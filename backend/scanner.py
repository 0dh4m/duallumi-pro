"""
DualLumi PRO - Standalone Bluetooth Low Energy (BLE) Device Scanner
Identifies ELK-BLEDOB / LotusLamp strip controllers and KS04 / Dazzling Home bulbs.
"""

import asyncio
import sys
from bleak import BleakScanner

async def main():
    print("=" * 65)
    print(" 📡 DualLumi PRO - Fast Bluetooth Device Scanner")
    print("=" * 65)
    print("\nScanning for BLE peripherals (5 seconds)...")
    print("Tip: Make sure LotusLamp X and Dazzling home apps are CLOSED on your phone.\n")

    try:
        devices = await BleakScanner.discover(timeout=5.0, return_adv=True)
    except Exception as e:
        print(f"[-] Scan error: {e}")
        print("[-] Make sure Windows Bluetooth is toggled ON.")
        return

    print(f"[+] Scan complete. Discovered {len(devices)} Bluetooth devices:\n")

    strips = []
    bulbs = []
    others = []

    for addr, (d, adv) in devices.items():
        name = d.name or adv.local_name or "Unknown Device"
        rssi = adv.rssi if hasattr(adv, "rssi") else -99
        up = name.upper()

        info = f"  * [{name}] Address: {addr} (Signal: {rssi} dBm)"

        if any(x in up for x in ['ELK', 'BLEDOB', 'BLEDOM', 'LOTUS', 'DUOCO']):
            strips.append((info, addr, name))
        elif any(x in up for x in ['KS0', 'KS1', 'KEEP', 'DAZZL', 'BULB', 'HUAXIN', 'LEDNET']):
            bulbs.append((info, addr, name))
        else:
            others.append(info)

    if strips:
        print("[+] POTENTIAL LED STRIPS (ELK-BLEDOB / LotusLamp X):")
        for s, _, _ in strips:
            print(s)
        print()

    if bulbs:
        print("[+] POTENTIAL SMART BULBS (KS04 / Dazzling home / KeepSmile):")
        for b, _, _ in bulbs:
            print(b)
        print()

    if others:
        print("[-] OTHER BLUETOOTH DEVICES:")
        for o in others:
            print(o)
        print()

    print("=" * 65)
    print("Copy the address above and assign it in backend/config.json or the web UI.")
    print("=" * 65)

if __name__ == "__main__":
    asyncio.run(main())
