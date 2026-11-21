/**
 * Copyright (C) 2026 Adham Cherkaoui Eddeqaqi (0dh4m). All rights reserved.
 * Proprietary and confidential. Unauthorized copying or distribution is strictly prohibited.
 * Author: Adham Cherkaoui Eddeqaqi (0dh4m) <0dh4mm@gmail.com>
 * GitHub: https://github.com/0dh4m
 */

/**
 * DualLumi Direct Web Bluetooth Driver
 * Specifically tuned for ELK-BLEDOB and KS04-651420 (Dazzling home).
 */

window.WebBLE = {
    stripDevice: null,
    stripChar: null,
    
    bulbDevice: null,
    bulbChar: null,

    // Services
    ELK_SERVICE: '0000fff0-0000-1000-8000-00805f9b34fb',
    ELK_WRITE_UUID: '0000fff3-0000-1000-8000-00805f9b34fb',

    KS_SERVICES: [
        '0000fff0-0000-1000-8000-00805f9b34fb',
        '0000afd0-0000-1000-8000-00805f9b34fb',
        '0000ae00-0000-1000-8000-00805f9b34fb'
    ],
    KS_WRITE_UUIDS: [
        '0000fff3-0000-1000-8000-00805f9b34fb',
        '0000afd1-0000-1000-8000-00805f9b34fb',
        '0000ae01-0000-1000-8000-00805f9b34fb'
    ],

    async connectStrip() {
        if (!navigator.bluetooth) {
            alert("المتصفح ما كيدعمش Web Bluetooth. استعمل Google Chrome أو Edge، أو خدم start_controller.bat");
            return false;
        }

        try {
            console.log("Requesting ELK-BLEDOB device...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'ELK' },
                    { namePrefix: 'ELK-BLEDOB' },
                    { namePrefix: 'Lotus' },
                    { services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }
                ],
                optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb']
            });

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
            this.stripChar = await service.getCharacteristic('0000fff3-0000-1000-8000-00805f9b34fb');
            this.stripDevice = device;
            console.log("Connected to Strip via Web Bluetooth!");
            return true;
        } catch (err) {
            console.error("Strip Web Bluetooth Error:", err);
            return false;
        }
    },

    async connectBulb() {
        if (!navigator.bluetooth) {
            alert("المتصفح ما كيدعمش Web Bluetooth. استعمل Google Chrome أو Edge.");
            return false;
        }

        try {
            console.log("Requesting KS04-651420 Bulb device...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: 'KS04-651420' },
                    { namePrefix: 'KS04' },
                    { namePrefix: 'KS' },
                    { namePrefix: 'Keep' },
                    { namePrefix: 'Dazz' },
                    { services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }
                ],
                optionalServices: this.KS_SERVICES
            });

            const server = await device.gatt.connect();
            
            let foundChar = null;
            for (const sUuid of this.KS_SERVICES) {
                try {
                    const service = await server.getPrimaryService(sUuid);
                    for (const cUuid of this.KS_WRITE_UUIDS) {
                        try {
                            foundChar = await service.getCharacteristic(cUuid);
                            if (foundChar) break;
                        } catch (e) {}
                    }
                    if (foundChar) break;
                } catch (e) {}
            }

            if (!foundChar) {
                throw new Error("Could not find writable characteristic for KS04 Bulb.");
            }

            this.bulbChar = foundChar;
            this.bulbDevice = device;
            console.log("Connected to KS04 Bulb via Web Bluetooth!");
            return true;
        } catch (err) {
            console.error("Bulb Web Bluetooth Error:", err);
            return false;
        }
    },

    async sendStripRaw(bytes) {
        if (!this.stripChar) return;
        try {
            await this.stripChar.writeValueWithoutResponse(new Uint8Array(bytes));
        } catch (e) {
            console.error("Error writing to Strip:", e);
        }
    },

    async sendBulbRaw(bytes) {
        if (!this.bulbChar) return;
        try {
            await this.bulbChar.writeValueWithoutResponse(new Uint8Array(bytes));
        } catch (e) {
            console.error("Error writing to KS04 Bulb:", e);
        }
    },

    async setPower(target, isOn) {
        if (target === 'strip' || target === 'all') {
            const b = isOn ? [0x7e, 0x07, 0x04, 0xff, 0x00, 0x01, 0x02, 0x01, 0xef]
                           : [0x7e, 0x07, 0x04, 0x00, 0x00, 0x00, 0x02, 0x01, 0xef];
            await this.sendStripRaw(b);
        }
        if (target === 'bulb' || target === 'all') {
            // Dual transmission for KS04: 5B and 7E
            if (isOn) {
                await this.sendBulbRaw([0x5b, 0xf0, 0x01, 0xb5]);
                await this.sendBulbRaw([0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]);
            } else {
                await this.sendBulbRaw([0x5b, 0x0f, 0x01, 0xb5]);
                await this.sendBulbRaw([0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]);
            }
        }
    },

    async setColor(target, r, g, b, brightness = 100) {
        if (target === 'strip' || target === 'all') {
            const stripBytes = [0x7e, 0x07, 0x05, 0x03, r, g, b, 0x0a, 0xef];
            await this.sendStripRaw(stripBytes);
        }
        if (target === 'bulb' || target === 'all') {
            // KS04 standard RGB frame
            const bulbStandard = [0x7e, 0x07, 0x05, 0x03, r, g, b, 0x00, 0xef];
            await this.sendBulbRaw(bulbStandard);
            // Extended frame with brightness
            const bulbExtended = [0x5a, 0x00, 0x01, r, g, b, 0x00, brightness, 0x00, 0xa5];
            await this.sendBulbRaw(bulbExtended);
        }
    },

    async setBrightness(target, brightness) {
        if (target === 'strip' || target === 'all') {
            const b = [0x7e, 0x04, 0x01, brightness, 0x01, 0xff, 0x02, 0x01, 0xef];
            await this.sendStripRaw(b);
        }
        if (target === 'bulb' || target === 'all') {
            const b = [0x7e, 0x04, 0x01, brightness, 0x01, 0xff, 0xff, 0x00, 0xef];
            await this.sendBulbRaw(b);
        }
    }
};
