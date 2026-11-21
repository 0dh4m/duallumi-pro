# ==============================================================================
# Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
# Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
# Author: Adham Cherkaoui Eddeqaqi (0dh4m) <0dh4mm@gmail.com>
# GitHub: https://github.com/0dh4m
# ==============================================================================

import sys
import json
import math
import urllib.request
import threading
from PyQt6.QtCore import Qt, QTimer, QPoint, QSize
from PyQt6.QtGui import QColor, QIcon, QFont, QPixmap, QPainter, QBrush, QPen
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QSlider, QScrollArea, QFrame, QGridLayout,
    QLineEdit, QSystemTrayIcon, QMenu, QApplication
)

from native_gui.color_wheel import ColorWheelWidget
from native_gui.ui_components import ToggleSwitch, DeviceCard, TitleBar

class DualLumiNativeWindow(QMainWindow):
    def __init__(self, api_url="http://127.0.0.1:8080"):
        super().__init__()
        self.api_url = api_url
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.resize(1140, 800)
        self.setMinimumSize(960, 680)

        self.drag_position = QPoint()
        self.sync_mode = True
        self.last_status = None

        self.initUI()
        self.initTray()
        self.initPolling()

    def initUI(self):
        self.setStyleSheet("""
            QMainWindow {
                background: #0d121d;
                color: #f8fafc;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            }
            QWidget {
                color: #f8fafc;
            }
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                border: none;
                background: rgba(15, 23, 42, 0.4);
                width: 8px;
                border-radius: 4px;
                margin: 0px;
            }
            QScrollBar::handle:vertical {
                background: rgba(99, 102, 241, 0.4);
                min-height: 25px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(99, 102, 241, 0.8);
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0px;
            }
        """)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 1. Custom Frameless Titlebar
        self.titlebar = TitleBar(self)
        self.titlebar.minimizeClicked.connect(self.showMinimized)
        self.titlebar.maximizeClicked.connect(self.toggleMaximize)
        self.titlebar.closeClicked.connect(self.hide) # Hide to tray
        main_layout.addWidget(self.titlebar)

        # 2. Scrollable Body
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(28, 20, 28, 24)
        content_layout.setSpacing(20)

        # ---------------------------------------------------------
        # SECTION A: Mode Selector & Master Power Bar
        # ---------------------------------------------------------
        mode_card = QFrame()
        mode_card.setStyleSheet("""
            QFrame {
                background: rgba(22, 28, 42, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                padding: 6px 14px;
            }
        """)
        mode_layout = QHBoxLayout(mode_card)

        # Mode Buttons Group
        self.btn_sync_mode = QPushButton("⚡ Unified Sync Mode (Both)")
        self.btn_sync_mode.setStyleSheet("""
            QPushButton {
                background: #6366f1;
                border: 1px solid #818cf8;
                color: #ffffff;
                font-weight: 700;
                font-size: 13px;
                padding: 9px 18px;
                border-radius: 8px;
            }
        """)
        self.btn_sync_mode.clicked.connect(lambda: self.setSyncMode(True))

        self.btn_indep_mode = QPushButton("🎛️ Independent Mode")
        self.btn_indep_mode.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #94a3b8;
                font-weight: 600;
                font-size: 13px;
                padding: 9px 18px;
                border-radius: 8px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.12);
                color: #ffffff;
            }
        """)
        self.btn_indep_mode.clicked.connect(lambda: self.setSyncMode(False))

        mode_layout.addWidget(self.btn_sync_mode)
        mode_layout.addWidget(self.btn_indep_mode)
        mode_layout.addStretch()

        lbl_master = QLabel("Master Power:")
        lbl_master.setStyleSheet("font-size: 13px; font-weight: 700; color: #f8fafc;")
        mode_layout.addWidget(lbl_master)

        self.switch_master_power = ToggleSwitch(checked=True)
        self.switch_master_power.toggled.connect(self.onMasterPowerToggled)
        mode_layout.addWidget(self.switch_master_power)

        content_layout.addWidget(mode_card)

        # ---------------------------------------------------------
        # SECTION B: Dual Device Status Cards
        # ---------------------------------------------------------
        cards_layout = QHBoxLayout()
        cards_layout.setSpacing(16)

        self.card_strip = DeviceCard("strip", "ELK-BLEDOB LED Strip", "BE:37:F1:00:CF:7E")
        self.card_strip.powerChanged.connect(lambda state: self.sendApiPost("power", {"target": "strip", "state": state}))
        self.card_strip.brightnessChanged.connect(lambda bri: self.sendApiPost("brightness", {"target": "strip", "brightness": bri}))
        self.card_strip.colorOrderChanged.connect(lambda ordr: self.sendApiPost("calibration", {"device": "strip", "color_order": ordr}))
        self.card_strip.reconnectRequested.connect(lambda: self.sendApiPost("connect", {"device": "strip"}))
        cards_layout.addWidget(self.card_strip)

        self.card_bulb = DeviceCard("bulb", "KS04-651420 Smart Bulb", "41:24:86:92:02:22")
        self.card_bulb.powerChanged.connect(lambda state: self.sendApiPost("power", {"target": "bulb", "state": state}))
        self.card_bulb.brightnessChanged.connect(lambda bri: self.sendApiPost("brightness", {"target": "bulb", "brightness": bri}))
        self.card_bulb.colorOrderChanged.connect(lambda ordr: self.sendApiPost("calibration", {"device": "bulb", "color_order": ordr}))
        self.card_bulb.reconnectRequested.connect(lambda: self.sendApiPost("connect", {"device": "bulb"}))
        cards_layout.addWidget(self.card_bulb)

        content_layout.addLayout(cards_layout)

        # ---------------------------------------------------------
        # SECTION C: Master Intensity & Quick Presets
        # ---------------------------------------------------------
        intensity_card = QFrame()
        intensity_card.setStyleSheet("""
            QFrame {
                background: rgba(22, 28, 42, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                padding: 14px 18px;
            }
        """)
        intensity_layout = QVBoxLayout(intensity_card)

        i_header = QHBoxLayout()
        i_title = QLabel("☀️ Master Brightness Intensity")
        i_title.setStyleSheet("font-size: 13px; font-weight: 700; color: #f8fafc;")
        self.lbl_master_bri_val = QLabel("100%")
        self.lbl_master_bri_val.setStyleSheet("font-size: 13px; font-weight: 800; color: #6366f1;")
        i_header.addWidget(i_title)
        i_header.addStretch()
        i_header.addWidget(self.lbl_master_bri_val)
        intensity_layout.addLayout(i_header)

        self.slider_master_bri = QSlider(Qt.Orientation.Horizontal)
        self.slider_master_bri.setRange(1, 100)
        self.slider_master_bri.setValue(100)
        self.slider_master_bri.setStyleSheet("""
            QSlider::groove:horizontal {
                height: 8px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
            }
            QSlider::sub-page:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #6366f1, stop:1 #38bdf8);
                border-radius: 4px;
            }
            QSlider::handle:horizontal {
                background: #ffffff;
                border: 2px solid #38bdf8;
                width: 20px;
                height: 20px;
                margin: -6px 0;
                border-radius: 10px;
            }
        """)
        self.slider_master_bri.valueChanged.connect(self.onMasterBrightnessChanged)
        intensity_layout.addWidget(self.slider_master_bri)

        # Quick Brightness Pills
        pills_layout = QHBoxLayout()
        for pct in [10, 25, 50, 75, 100]:
            btn = QPushButton(f"{pct}%")
            btn.setStyleSheet("""
                QPushButton {
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #cbd5e1;
                    padding: 5px 12px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 700;
                }
                QPushButton:hover {
                    background: rgba(99, 102, 241, 0.3);
                    border-color: #6366f1;
                    color: #ffffff;
                }
            """)
            btn.clicked.connect(lambda checked, p=pct: self.slider_master_bri.setValue(p))
            pills_layout.addWidget(btn)
        pills_layout.addStretch()
        intensity_layout.addLayout(pills_layout)

        content_layout.addWidget(intensity_card)

        # ---------------------------------------------------------
        # SECTION D: Interactive Color Studio & Kelvin White Spectrum
        # ---------------------------------------------------------
        studio_card = QFrame()
        studio_card.setStyleSheet("""
            QFrame {
                background: rgba(22, 28, 42, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                padding: 18px;
            }
        """)
        studio_layout = QHBoxLayout(studio_card)
        studio_layout.setSpacing(24)

        # Left Column: Color Wheel & Live Hex Box
        wheel_col = QVBoxLayout()
        wheel_col.setAlignment(Qt.AlignmentFlag.AlignCenter)

        w_title = QLabel("🎨 Circular HSV Gamut Wheel")
        w_title.setStyleSheet("font-size: 13px; font-weight: 700; color: #f8fafc; margin-bottom: 8px;")
        wheel_col.addWidget(w_title)

        self.color_wheel = ColorWheelWidget()
        self.color_wheel.colorChanged.connect(self.onColorWheelChanged)
        wheel_col.addWidget(self.color_wheel)

        hex_row = QHBoxLayout()
        lbl_hex = QLabel("HEX:")
        lbl_hex.setStyleSheet("font-size: 11px; font-weight: 700; color: #94a3b8;")
        self.input_hex = QLineEdit("#FF5500")
        self.input_hex.setFixedWidth(90)
        self.input_hex.setStyleSheet("""
            QLineEdit {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #f8fafc;
                font-family: monospace;
                font-size: 12px;
                font-weight: 700;
                padding: 4px 8px;
                border-radius: 6px;
            }
        """)
        self.input_hex.returnPressed.connect(self.onHexEntered)
        hex_row.addWidget(lbl_hex)
        hex_row.addWidget(self.input_hex)
        wheel_col.addLayout(hex_row)

        studio_layout.addLayout(wheel_col)

        # Right Column: Kelvin Slider + Designer Palettes
        right_col = QVBoxLayout()
        right_col.setSpacing(14)

        # Kelvin White Spectrum
        k_header = QHBoxLayout()
        k_title = QLabel("🌡️ Kelvin White Spectrum Studio")
        k_title.setStyleSheet("font-size: 13px; font-weight: 700; color: #f8fafc;")
        self.lbl_kelvin_val = QLabel("4000K (Daylight)")
        self.lbl_kelvin_val.setStyleSheet("font-size: 12px; font-weight: 700; color: #f59e0b;")
        k_header.addWidget(k_title)
        k_header.addStretch()
        k_header.addWidget(self.lbl_kelvin_val)
        right_col.addLayout(k_header)

        self.slider_kelvin = QSlider(Qt.Orientation.Horizontal)
        self.slider_kelvin.setRange(2000, 6500)
        self.slider_kelvin.setValue(4000)
        self.slider_kelvin.setStyleSheet("""
            QSlider::groove:horizontal {
                height: 10px;
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #ff8a12, stop:0.35 #ffa845, stop:0.7 #fff4e8, stop:1 #cae3ff);
                border-radius: 5px;
            }
            QSlider::handle:horizontal {
                background: #ffffff;
                border: 2px solid #334155;
                width: 20px;
                height: 20px;
                margin: -5px 0;
                border-radius: 10px;
            }
        """)
        self.slider_kelvin.valueChanged.connect(self.onKelvinChanged)
        right_col.addWidget(self.slider_kelvin)

        # Designer Preset Scenes Grid
        p_title = QLabel("🎭 Curated Designer Scenes")
        p_title.setStyleSheet("font-size: 13px; font-weight: 700; color: #f8fafc; margin-top: 8px;")
        right_col.addWidget(p_title)

        scenes_grid = QGridLayout()
        scenes_grid.setSpacing(8)

        presets = [
            ("🌆 Sunset Glow", 255, 90, 20, 80),
            ("⚡ Cyberpunk", 0, 240, 255, 95),
            ("🌊 Deep Ocean", 0, 140, 255, 80),
            ("🕯️ Candlelight", 255, 147, 41, 45),
            ("🌲 Emerald Forest", 16, 185, 129, 70),
            ("🌌 Nordic Aurora", 168, 85, 247, 85),
            ("☀️ Focus White", 255, 255, 255, 100),
            ("🩸 Dark Stealth Red", 255, 10, 10, 40)
        ]

        row, col = 0, 0
        for name, r, g, b, bri in presets:
            btn = QPushButton(name)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: rgba({r}, {g}, {b}, 0.15);
                    border: 1px solid rgba({r}, {g}, {b}, 0.4);
                    color: #ffffff;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 700;
                    text-align: left;
                }}
                QPushButton:hover {{
                    background: rgba({r}, {g}, {b}, 0.35);
                    border-color: rgba({r}, {g}, {b}, 0.8);
                }}
            """)
            btn.clicked.connect(lambda checked, pr=r, pg=g, pb=b, pbri=bri: self.applyPreset(pr, pg, pb, pbri))
            scenes_grid.addWidget(btn, row, col)
            col += 1
            if col > 1:
                col = 0
                row += 1

        right_col.addLayout(scenes_grid)
        studio_layout.addLayout(right_col)

        content_layout.addWidget(studio_card)

        # ---------------------------------------------------------
        # SECTION E: Dynamic Effects Studio
        # ---------------------------------------------------------
        fx_card = QFrame()
        fx_card.setStyleSheet("""
            QFrame {
                background: rgba(22, 28, 42, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                padding: 14px 18px;
            }
        """)
        fx_layout = QVBoxLayout(fx_card)

        fx_title = QLabel("✨ Dynamic Hardware Lighting Effects")
        fx_title.setStyleSheet("font-size: 13px; font-weight: 700; color: #f8fafc;")
        fx_layout.addWidget(fx_title)

        fx_grid = QHBoxLayout()
        fx_grid.setSpacing(10)

        effects = [
            ("🌈 Rainbow Flow", 1),
            ("🕯️ Candle Flicker", 4),
            ("⚡ Cyber Pulse", 2),
            ("🌊 Ocean Swell", 7),
            ("🎉 Disco Strobe", 6),
            ("🔴 Police Flasher", 9)
        ]

        for fx_name, fx_id in effects:
            btn = QPushButton(fx_name)
            btn.setStyleSheet("""
                QPushButton {
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    color: #cbd5e1;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 600;
                }
                QPushButton:hover {
                    background: rgba(99, 102, 241, 0.25);
                    border-color: #6366f1;
                    color: #ffffff;
                }
            """)
            btn.clicked.connect(lambda checked, fid=fx_id: self.sendApiPost("effect", {"effect": fid, "target": "both"}))
            fx_grid.addWidget(btn)

        fx_layout.addLayout(fx_grid)
        content_layout.addWidget(fx_card)

        scroll.setWidget(content_widget)
        main_layout.addWidget(scroll)

    # ---------------------------------------------------------
    # Window Dragging & Controls
    # ---------------------------------------------------------
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and event.position().y() <= 46:
            self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton and not self.drag_position.isNull():
            self.move(event.globalPosition().toPoint() - self.drag_position)
            event.accept()

    def mouseReleaseEvent(self, event):
        self.drag_position = QPoint()

    def toggleMaximize(self):
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()

    # ---------------------------------------------------------
    # System Tray Integration
    # ---------------------------------------------------------
    def initTray(self):
        self.tray = QSystemTrayIcon(self)
        # Create cyan dot icon
        pix = QPixmap(18, 18)
        pix.fill(Qt.GlobalColor.transparent)
        p = QPainter(pix)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setBrush(QBrush(QColor(99, 102, 241)))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(2, 2, 14, 14)
        p.end()

        self.tray.setIcon(QIcon(pix))
        self.tray.setToolTip("DualLumi PRO Native")

        menu = QMenu()
        menu.setStyleSheet("""
            QMenu {
                background: #161c2d;
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #f8fafc;
                border-radius: 8px;
                padding: 6px;
            }
            QMenu::item {
                padding: 6px 18px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background: #6366f1;
            }
        """)

        act_show = menu.addAction("🗖 Show DualLumi PRO")
        act_show.triggered.connect(self.showNormal)

        menu.addSeparator()

        act_toggle = menu.addAction("💡 Toggle Master Power")
        act_toggle.triggered.connect(lambda: self.switch_master_power.setChecked(not self.switch_master_power.isChecked()))

        act_sunset = menu.addAction("🌆 Sunset Glow")
        act_sunset.triggered.connect(lambda: self.applyPreset(255, 90, 20, 80))

        act_cyber = menu.addAction("⚡ Cyberpunk Neon")
        act_cyber.triggered.connect(lambda: self.applyPreset(0, 240, 255, 95))

        menu.addSeparator()

        act_quit = menu.addAction("❌ Quit Completely")
        act_quit.triggered.connect(QApplication.instance().quit)

        self.tray.setContextMenu(menu)
        self.tray.activated.connect(self.onTrayActivated)
        self.tray.show()

    def onTrayActivated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            if self.isVisible():
                self.hide()
            else:
                self.showNormal()
                self.activateWindow()

    # ---------------------------------------------------------
    # Asynchronous REST Dispatcher
    # ---------------------------------------------------------
    def sendApiPost(self, endpoint, data):
        def _worker():
            try:
                url = f"{self.api_url}/api/{endpoint}"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(data).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=2.0) as res:
                    res.read()
            except Exception as e:
                pass
        threading.Thread(target=_worker, daemon=True).start()

    def initPolling(self):
        self.timer = QTimer(self)
        self.timer.setInterval(2500)
        self.timer.timeout.connect(self.fetchStatusAsync)
        self.timer.start()
        self.fetchStatusAsync()

    def fetchStatusAsync(self):
        def _worker():
            try:
                url = f"{self.api_url}/api/status"
                with urllib.request.urlopen(url, timeout=1.8) as res:
                    data = json.loads(res.read().decode("utf-8"))
                    QTimer.singleShot(0, lambda: self.onStatusReceived(data))
            except Exception:
                pass
        threading.Thread(target=_worker, daemon=True).start()

    def onStatusReceived(self, status):
        self.last_status = status
        strip = status.get("strip", {})
        bulb = status.get("bulb", {})

        self.card_strip.updateState(strip)
        self.card_bulb.updateState(bulb)

        # Sync master power switch
        is_any_on = strip.get("power", False) or bulb.get("power", False)
        self.switch_master_power.blockSignals(True)
        self.switch_master_power.setChecked(is_any_on)
        self.switch_master_power.blockSignals(False)

        # Update Radio status
        bt = status.get("bluetooth_radio", "on")
        self.titlebar.pill_bt.setText(f"Bluetooth: {bt.upper()}")
        self.titlebar.pill_bt.setStyleSheet(f"font-size: 11px; color: {'#10b981' if bt == 'on' else '#ef4444'}; font-weight: 600;")

    # ---------------------------------------------------------
    # UI Actions & Color Conversion
    # ---------------------------------------------------------
    def setSyncMode(self, enabled: bool):
        self.sync_mode = enabled
        if enabled:
            self.btn_sync_mode.setStyleSheet("background: #6366f1; border: 1px solid #818cf8; color: #ffffff; font-weight: 700; font-size: 13px; padding: 9px 18px; border-radius: 8px;")
            self.btn_indep_mode.setStyleSheet("background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-weight: 600; font-size: 13px; padding: 9px 18px; border-radius: 8px;")
        else:
            self.btn_indep_mode.setStyleSheet("background: #6366f1; border: 1px solid #818cf8; color: #ffffff; font-weight: 700; font-size: 13px; padding: 9px 18px; border-radius: 8px;")
            self.btn_sync_mode.setStyleSheet("background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-weight: 600; font-size: 13px; padding: 9px 18px; border-radius: 8px;")
        self.sendApiPost("sync_mode", {"enabled": enabled})

    def onMasterPowerToggled(self, state: bool):
        self.sendApiPost("power", {"target": "both", "state": state})

    def onMasterBrightnessChanged(self, val: int):
        self.lbl_master_bri_val.setText(f"{val}%")
        self.sendApiPost("brightness", {"target": "both", "brightness": val})

    def onColorWheelChanged(self, r: int, g: int, b: int):
        hex_code = f"#{r:02X}{g:02X}{b:02X}"
        self.input_hex.setText(hex_code)
        target = "both" if self.sync_mode else "strip"
        self.sendApiPost("color", {"target": target, "r": r, "g": g, "b": b})

    def onHexEntered(self):
        text = self.input_hex.text().strip()
        if text.startswith("#") and len(text) == 7:
            try:
                r = int(text[1:3], 16)
                g = int(text[3:5], 16)
                b = int(text[5:7], 16)
                self.color_wheel.setColor(r, g, b)
                self.sendApiPost("color", {"target": "both" if self.sync_mode else "strip", "r": r, "g": g, "b": b})
            except ValueError:
                pass

    def onKelvinChanged(self, k: int):
        self.lbl_kelvin_val.setText(f"{k}K")
        self.sendApiPost("color_temp", {"target": "both" if self.sync_mode else "bulb", "kelvin": k})

    def applyPreset(self, r, g, b, bri):
        self.color_wheel.setColor(r, g, b)
        self.slider_master_bri.setValue(bri)
        self.sendApiPost("color", {"target": "both", "r": r, "g": g, "b": b})
        self.sendApiPost("brightness", {"target": "both", "brightness": bri})
