# ==============================================================================
# Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
# Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
# Author: Adham Cherkaoui Eddeqaqi (0dh4m) <0dh4mm@gmail.com>
# GitHub: https://github.com/0dh4m
# ==============================================================================

from PyQt6.QtCore import Qt, pyqtSignal, QRectF, QPropertyAnimation, pyqtProperty
from PyQt6.QtGui import QPainter, QColor, QPen, QBrush, QFont, QCursor
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QLabel, QSlider, QPushButton,
    QComboBox, QFrame, QSizePolicy
)

# -------------------------------------------------------------
# 1. Windows 11 / iOS Animated Toggle Switch
# -------------------------------------------------------------
class ToggleSwitch(QWidget):
    toggled = pyqtSignal(bool)

    def __init__(self, parent=None, checked=False):
        super().__init__(parent)
        self.setFixedSize(48, 26)
        self.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self._checked = checked
        self._thumb_position = 22 if checked else 4

        self._anim = QPropertyAnimation(self, b"thumb_position", self)
        self._anim.setDuration(180)

    @pyqtProperty(int)
    def thumb_position(self):
        return self._thumb_position

    @thumb_position.setter
    def thumb_position(self, pos):
        self._thumb_position = pos
        self.update()

    def isChecked(self):
        return self._checked

    def setChecked(self, checked: bool):
        if self._checked != checked:
            self._checked = checked
            target = 24 if checked else 4
            self._anim.stop()
            self._anim.setEndValue(target)
            self._anim.start()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.setChecked(not self._checked)
            self.toggled.emit(self._checked)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Track background
        track_color = QColor(99, 102, 241) if self._checked else QColor(40, 48, 64)
        p.setBrush(QBrush(track_color))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(0, 0, self.width(), self.height(), 13, 13)

        # Thumb
        p.setBrush(QBrush(QColor(255, 255, 255)))
        p.drawEllipse(self._thumb_position, 3, 20, 20)
        p.end()


# -------------------------------------------------------------
# 2. Luxury Glassmorphic Device Card Widget
# -------------------------------------------------------------
class DeviceCard(QFrame):
    powerChanged = pyqtSignal(bool)
    brightnessChanged = pyqtSignal(int)
    colorOrderChanged = pyqtSignal(str)
    reconnectRequested = pyqtSignal()

    def __init__(self, device_type="strip", title="ELK-BLEDOB LED Strip", mac="BE:37:F1:00:CF:7E", parent=None):
        super().__init__(parent)
        self.device_type = device_type
        self.setObjectName("DeviceCard")
        self.setStyleSheet("""
            QFrame#DeviceCard {
                background: rgba(22, 28, 42, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                padding: 14px;
            }
            QFrame#DeviceCard:hover {
                border-color: rgba(99, 102, 241, 0.35);
            }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        # Top Header: Icon + Info + Status Pill + Power Switch
        top_row = QHBoxLayout()

        icon_label = QLabel("🌈" if device_type == "strip" else "💡")
        icon_label.setStyleSheet("font-size: 24px;")
        top_row.addWidget(icon_label)

        info_layout = QVBoxLayout()
        self.lbl_title = QLabel(title)
        self.lbl_title.setStyleSheet("font-size: 15px; font-weight: 700; color: #f8fafc;")
        self.lbl_mac = QLabel(mac)
        self.lbl_mac.setStyleSheet("font-size: 11px; color: #64748b; font-family: monospace;")
        info_layout.addWidget(self.lbl_title)
        info_layout.addWidget(self.lbl_mac)
        top_row.addLayout(info_layout)

        top_row.addStretch()

        self.status_pill = QLabel("CONNECTED")
        self.status_pill.setStyleSheet("""
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid #10b981;
            color: #10b981;
            font-size: 10px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 6px;
        """)
        top_row.addWidget(self.status_pill)

        self.switch_power = ToggleSwitch(checked=True)
        self.switch_power.toggled.connect(self.powerChanged.emit)
        top_row.addWidget(self.switch_power)

        layout.addLayout(top_row)

        # Middle Row: Brightness Slider + Value Label
        bri_row = QHBoxLayout()
        lbl_bri_title = QLabel("Brightness")
        lbl_bri_title.setStyleSheet("font-size: 12px; color: #94a3b8; font-weight: 600;")
        self.lbl_bri_val = QLabel("100%")
        self.lbl_bri_val.setStyleSheet("font-size: 12px; color: #6366f1; font-weight: 700;")
        bri_row.addWidget(lbl_bri_title)
        bri_row.addStretch()
        bri_row.addWidget(self.lbl_bri_val)
        layout.addLayout(bri_row)

        self.slider_bri = QSlider(Qt.Orientation.Horizontal)
        self.slider_bri.setRange(1, 100)
        self.slider_bri.setValue(100)
        self.slider_bri.setStyleSheet("""
            QSlider::groove:horizontal {
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
            }
            QSlider::sub-page:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #6366f1, stop:1 #a855f7);
                border-radius: 3px;
            }
            QSlider::handle:horizontal {
                background: #ffffff;
                border: 2px solid #6366f1;
                width: 16px;
                height: 16px;
                margin: -5px 0;
                border-radius: 8px;
            }
        """)
        self.slider_bri.valueChanged.connect(self._on_slider_changed)
        layout.addWidget(self.slider_bri)

        # Bottom Row: Color Swatch + Color Order + Reconnect
        bottom_row = QHBoxLayout()

        self.color_swatch = QLabel()
        self.color_swatch.setFixedSize(36, 24)
        self.color_swatch.setStyleSheet("background: #ff5500; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);")
        bottom_row.addWidget(self.color_swatch)

        bottom_row.addStretch()

        lbl_order = QLabel("Order:")
        lbl_order.setStyleSheet("font-size: 11px; color: #94a3b8;")
        bottom_row.addWidget(lbl_order)

        self.combo_order = QComboBox()
        self.combo_order.addItems(["RGB", "GRB", "BGR"])
        self.combo_order.setStyleSheet("""
            QComboBox {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 6px;
                padding: 3px 8px;
                color: #f8fafc;
                font-size: 11px;
                font-weight: 600;
            }
            QComboBox QAbstractItemView {
                background: #161c2d;
                color: #f8fafc;
                selection-background-color: #6366f1;
            }
        """)
        self.combo_order.currentTextChanged.connect(self.colorOrderChanged.emit)
        bottom_row.addWidget(self.combo_order)

        self.btn_reconnect = QPushButton("Reconnect")
        self.btn_reconnect.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                padding: 4px 10px;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 600;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.15);
                color: #ffffff;
            }
        """)
        self.btn_reconnect.clicked.connect(self.reconnectRequested.emit)
        bottom_row.addWidget(self.btn_reconnect)

        layout.addLayout(bottom_row)

    def _on_slider_changed(self, val):
        self.lbl_bri_val.textContent = f"{val}%"
        self.lbl_bri_val.setText(f"{val}%")
        self.brightnessChanged.emit(val)

    def updateState(self, dev_data):
        if not dev_data:
            return
        is_conn = dev_data.get("connected", False)
        if is_conn:
            self.status_pill.setText("CONNECTED")
            self.status_pill.setStyleSheet("background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px;")
        else:
            self.status_pill.setText("OFFLINE")
            self.status_pill.setStyleSheet("background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px;")

        self.switch_power.setChecked(dev_data.get("power", False))

        bri = dev_data.get("brightness", 100)
        self.slider_bri.blockSignals(True)
        self.slider_bri.setValue(bri)
        self.lbl_bri_val.setText(f"{bri}%")
        self.slider_bri.blockSignals(False)

        r = dev_data.get("r", 255)
        g = dev_data.get("g", 85)
        b = dev_data.get("b", 0)
        self.color_swatch.setStyleSheet(f"background: rgb({r},{g},{b}); border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);")

        order = dev_data.get("color_order", "RGB")
        self.combo_order.blockSignals(True)
        idx = self.combo_order.findText(order)
        if idx >= 0:
            self.combo_order.setCurrentIndex(idx)
        self.combo_order.blockSignals(False)


# -------------------------------------------------------------
# 3. Custom Frameless Titlebar
# -------------------------------------------------------------
class TitleBar(QWidget):
    minimizeClicked = pyqtSignal()
    maximizeClicked = pyqtSignal()
    closeClicked = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(46)
        self.setStyleSheet("""
            QWidget {
                background: #0b0f17;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 0, 10, 0)
        layout.setSpacing(10)

        # Brand Logo + Title + Version Badge
        logo = QLabel("⚡")
        logo.setStyleSheet("font-size: 18px; color: #6366f1;")
        layout.addWidget(logo)

        title = QLabel("DualLumi PRO")
        title.setStyleSheet("font-size: 14px; font-weight: 800; color: #f8fafc; letter-spacing: 0.5px;")
        layout.addWidget(title)

        badge = QLabel("NATIVE v3.5")
        badge.setStyleSheet("""
            background: rgba(99, 102, 241, 0.2);
            border: 1px solid #6366f1;
            color: #6366f1;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
        """)
        layout.addWidget(badge)

        layout.addSpacing(15)

        # Hardware Status Pills
        self.pill_bt = QLabel("Bluetooth: Active")
        self.pill_bt.setStyleSheet("font-size: 11px; color: #10b981; font-weight: 600;")
        layout.addWidget(self.pill_bt)

        layout.addStretch()

        # Window Controls
        btn_style = """
            QPushButton {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #cbd5e1;
                font-size: 12px;
                font-weight: 700;
                width: 28px;
                height: 26px;
                border-radius: 6px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.18);
                color: #ffffff;
            }
        """

        self.btn_min = QPushButton("🗕")
        self.btn_min.setStyleSheet(btn_style)
        self.btn_min.clicked.connect(self.minimizeClicked.emit)
        layout.addWidget(self.btn_min)

        self.btn_max = QPushButton("🗖")
        self.btn_max.setStyleSheet(btn_style)
        self.btn_max.clicked.connect(self.maximizeClicked.emit)
        layout.addWidget(self.btn_max)

        self.btn_close = QPushButton("✕")
        self.btn_close.setStyleSheet(btn_style + """
            QPushButton:hover {
                background: #ef4444;
                border-color: #ef4444;
                color: #ffffff;
            }
        """)
        self.btn_close.clicked.connect(self.closeClicked.emit)
        layout.addWidget(self.btn_close)

