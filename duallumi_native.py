#!/usr/bin/env python3
"""
DualLumi PRO - 100% Native Desktop Application (PyQt6)
Zero WebView, Zero Browser Scrollbars, Pure Native Hardware-Accelerated GUI
"""

import sys
import os
import subprocess
import urllib.request
import time
from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QIcon, QFont
from PyQt6.QtCore import Qt

# Ensure root directory is in Python path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT_DIR)

from native_gui.main_window import DualLumiNativeWindow

def ensure_backend_running():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8080/api/status", timeout=1.0) as r:
            if r.status == 200:
                return True
    except Exception:
        pass

    print("🚀 Spawning DualLumi Python backend in background...")
    server_script = os.path.join(ROOT_DIR, "backend", "server.py")
    subprocess.Popen(
        ["pythonw", server_script],
        cwd=ROOT_DIR,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    )

    for _ in range(15):
        time.sleep(0.4)
        try:
            with urllib.request.urlopen("http://127.0.0.1:8080/api/status", timeout=1.0) as r:
                if r.status == 200:
                    print("✅ Backend ready!")
                    return True
        except Exception:
            pass
    return False

def main():
    ensure_backend_running()

    app = QApplication(sys.argv)
    app.setApplicationName("DualLumi PRO Native")
    app.setStyle("Fusion")

    # Set default modern font
    font = QFont("Segoe UI", 10)
    app.setFont(font)

    # Window Icon
    icon_path = os.path.join(ROOT_DIR, "web", "icons", "icon-512.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))

    window = DualLumiNativeWindow(api_url="http://127.0.0.1:8080")
    window.show()

    sys.exit(app.exec())

if __name__ == "__main__":
    main()

