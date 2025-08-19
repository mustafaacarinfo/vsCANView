// CAN frame decode ve test fonksiyonları

// Helper to extract PGN from a 29-bit J1939 CAN ID
function getJ1939Pgn(id: number): number {
    // Mask out priority and source address to get the PDU
    const pdu = (id >> 8) & 0x1FFFF;
    const pf = (pdu >> 8) & 0xFF; // PDU Format
    const ps = pdu & 0xFF;       // PDU Specific

    if (pf < 240) {
        // PGN is in the PF field, PS is destination address
        return (id >> 8) & 0x1FF00;
    } else {
        // PGN is the full PDU
        return pdu;
    }
}

// Parse ve decode raw CAN frame
export function parseRawCanFrame(frameStr: string): {id: number, data: Buffer} | null {
    try {
        const parts = frameStr.trim().split('#');
        if (parts.length !== 2) return null;
        let idStr = parts[0].trim();

        // --- FIX: Hex ID otomatik algılama (A-F içeriyorsa veya uzunluk > 3 ise) ---
        let id: number;
        if (/^0x/i.test(idStr)) {
            id = parseInt(idStr.slice(2), 16);
        } else if (/^[0-9A-Fa-f]+$/.test(idStr)) {
            // İçinde A-F varsa veya hepsi hex karakteriyse hex kabul et
            id = parseInt(idStr, 16);
        } else {
            id = parseInt(idStr, 10);
        }
        if (isNaN(id)) return null;

        const hexData = parts[1].replace(/\s+/g, '');
        const dataBytes = Buffer.from(hexData, 'hex');
        return { id, data: dataBytes };
    } catch (err) {
        console.error('Failed to parse CAN frame:', err);
        return null;
    }
}

// Main J1939 decoder function
export function decodeJ1939Frame(frame: {id: number, data: Buffer}): any {
    if (!frame || !frame.data) return {};
    
    const signals: {[key: string]: number} = {};
    const pgn = getJ1939Pgn(frame.id);

    try {
        switch (pgn) {
            // PGN 61444 (0xF004) - EEC1 (Engine Speed, Torque)
            case 61444:
                signals.EngineSpeed = frame.data.length >= 5 ? frame.data.readUInt16LE(3) * 0.125 : 0; // SPN 190
                // --- ALIASES (RPM uyumluluğu) ---
                signals.EngineRPM = signals.EngineSpeed;
                signals.EngSpeed = signals.EngineSpeed;
                // ---------------------------------
                signals.ActualEngineTorque = frame.data.readUInt8(2) - 125; // SPN 513
                break;

            // PGN 65265 (0xFEF1) - CCVS (Vehicle Speed)
            case 65265:
                signals.VehicleSpeed = frame.data.readUInt16LE(1) / 256.0; // SPN 84
                break;

            // PGN 65262 (0xFEEF) - ET1 (Engine Coolant Temp)
            case 65262:
                signals.EngineCoolantTemp = frame.data.readUInt8(0) - 40; // SPN 110
                break;

            // PGN 65263 (0xFEF0) - LFE1 (Engine Oil Pressure)
            case 65263:
                signals.EngineOilPressure = frame.data.readUInt8(3) * 4; // SPN 100 (kPa)
                break;

            // PGN 65276 (0xFEFC) - LFC (Fuel Level)
            case 65276:
                signals.FuelLevel = frame.data.readUInt8(1) * 0.4; // SPN 96
                break;

            // PGN 65271 (0xFEF7) - VD (Battery Voltage)
            case 65271:
                signals.BatteryVoltage = frame.data.readUInt16LE(4) * 0.05; // SPN 168
                break;

            // PGN 65248 (0xFEA0) - VDHR (Total Vehicle Distance)
            case 65248:
                signals.TotalVehicleDistance = frame.data.readUInt32LE(0) * 0.125; // SPN 245
                break;

            // PGN 65270 (0xFEF
        }
    } catch (err) {
        console.error('Failed to decode J1939 frame:', err);
    }

    return signals;
}

// --- FIX: Eksikse dışarıdan kullanılacak yardımcı ---
export function decodeCanFrameStr(frameStr: string): any {
    const parsed = parseRawCanFrame(frameStr);
    if (!parsed) return {};
    return decodeJ1939Frame(parsed);
}
