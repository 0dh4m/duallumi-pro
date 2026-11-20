import math
from PyQt6.QtCore import Qt, pyqtSignal, QPointF
from PyQt6.QtGui import QPainter, QColor, QPen, QBrush, QImage, QConicalGradient, QRadialGradient
from PyQt6.QtWidgets import QWidget

class ColorWheelWidget(QWidget):
    colorChanged = pyqtSignal(int, int, int) # r, g, b

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(220, 220)
        self.setMaximumSize(300, 300)
        self.hue = 25.0       # 0 - 360
        self.sat = 0.95       # 0.0 - 1.0
        self.val = 1.0        # 0.0 - 1.0
        self.is_dragging = False
        self._wheel_image = None
        self._last_size = None

    def setColor(self, r: int, g: int, b: int):
        qc = QColor(r, g, b)
        h, s, v, _ = qc.getHsvF()
        if h >= 0:
            self.hue = h * 360.0
            self.sat = s
            self.val = max(0.2, v)
            self.update()

    def _renderWheelImage(self, size):
        img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
        img.fill(Qt.GlobalColor.transparent)

        radius = size / 2.0
        cx, cy = radius, radius

        painter = QPainter(img)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # 1. Conical Hue Gradient
        conical = QConicalGradient(cx, cy, 0)
        for deg in range(0, 361, 30):
            conical.setColorAt(deg / 360.0, QColor.fromHsvF(deg / 360.0, 1.0, 1.0))

        painter.setBrush(QBrush(conical))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(QPointF(cx, cy), radius - 6, radius - 6)

        # 2. Radial Saturation Gradient (White in center, transparent at edge)
        radial = QRadialGradient(cx, cy, radius - 6)
        radial.setColorAt(0.0, QColor(255, 255, 255, 255))
        radial.setColorAt(0.9, QColor(255, 255, 255, 0))
        radial.setColorAt(1.0, QColor(0, 0, 0, 40)) # subtle edge shadow

        painter.setBrush(QBrush(radial))
        painter.drawEllipse(QPointF(cx, cy), radius - 6, radius - 6)

        # 3. Outer Ring border
        painter.setPen(QPen(QColor(255, 255, 255, 40), 2))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawEllipse(QPointF(cx, cy), radius - 6, radius - 6)

        painter.end()
        return img

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        w = self.width()
        h = self.height()
        dim = min(w, h)
        cx = w / 2.0
        cy = h / 2.0
        radius = (dim / 2.0) - 10

        if self._wheel_image is None or self._last_size != dim:
            self._wheel_image = self._renderWheelImage(int(dim))
            self._last_size = dim

        # Draw cached wheel
        painter.drawImage(int(cx - dim / 2), int(cy - dim / 2), self._wheel_image)

        # Calculate Thumb Marker Position
        rad_angle = math.radians(self.hue)
        dist = self.sat * radius
        tx = cx + dist * math.cos(rad_angle)
        ty = cy - dist * math.sin(rad_angle)

        curr_color = QColor.fromHsvF(self.hue / 360.0, self.sat, self.val)

        # Draw Glow around marker
        painter.setPen(QPen(QColor(0, 240, 255, 120), 4))
        painter.setBrush(QBrush(curr_color))
        painter.drawEllipse(QPointF(tx, ty), 11, 11)

        # Draw White Rim
        painter.setPen(QPen(QColor(255, 255, 255), 2.5))
        painter.drawEllipse(QPointF(tx, ty), 9, 9)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.is_dragging = True
            self._updateFromPos(event.position())

    def mouseMoveEvent(self, event):
        if self.is_dragging:
            self._updateFromPos(event.position())

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.is_dragging = False

    def _updateFromPos(self, pos):
        w = self.width()
        h = self.height()
        dim = min(w, h)
        cx = w / 2.0
        cy = h / 2.0
        max_r = (dim / 2.0) - 10

        dx = pos.x() - cx
        dy = -(pos.y() - cy) # inverted Y for cartesian
        r = math.hypot(dx, dy)

        # Angle in degrees [0, 360)
        angle = math.degrees(math.atan2(dy, dx))
        if angle < 0:
            angle += 360.0

        self.hue = angle
        self.sat = min(1.0, max(0.0, r / max_r))
        self.update()

        qc = QColor.fromHsvF(self.hue / 360.0, self.sat, self.val)
        self.colorChanged.emit(qc.red(), qc.green(), qc.blue())

