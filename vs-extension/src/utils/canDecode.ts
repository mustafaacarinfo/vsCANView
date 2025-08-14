/**
 * CAN frame decoding utilities
 */

/**
 * Extract signals from a raw CAN frame
 * This is a simplified decoder that tries to make sense of raw CAN data
 * 
 * @param rawHex - Raw hexadecimal CAN frame data string
 * @param id - CAN message ID
 * @returns Extracted signal values
 */
export function decodeRawCanFrame(rawHex: string, id: number | string): any {
    if (!rawHex) return {};
    
    try {
        // Convert ID to numeric
        const numId = typeof id === 'string' ? parseInt(id, 10) : id;
        
        // Clean and parse bytes
        const bytes = rawHex.replace(/\s+/g, '').match(/.{1,2}/g) || [];
        const byteValues = bytes.map(b => parseInt(b, 16));
        
        console.log(`🔍 Decoding raw CAN frame - ID: 0x${numId.toString(16)}, Bytes: ${byteValues.join(' ')}`);
        
        // Handle specific message types
        switch (numId) {
            case 0x148:
            case 328: // Decimal equivalent
                return decodeVehicleSpeedFrame(byteValues);
                
            case 0x1F0:
            case 496: // Decimal equivalent
                return decodeEngineDataFrame(byteValues);
                
            default:
                return createDefaultSignals(byteValues);
        }
    } catch (error) {
        console.error('❌ Error decoding raw CAN frame:', error);
        return {};
    }
}

/**
 * Decode vehicle speed related CAN frame
 */
function decodeVehicleSpeedFrame(bytes: number[]): any {
    const signals: any = {};
    
    // Speed is often in the first two bytes (just an example)
    if (bytes.length >= 2) {
        // Simple algorithm to extract a plausible speed
        signals.VehicleSpeed = ((bytes[0] * 256 + bytes[1]) % 240) / 2;
    }
    
    // Maybe there's brake pressure data in byte 2-3?
    if (bytes.length >= 4) {
        signals.BrakePressure = bytes[2] * 2;
        signals.COUNTER = bytes[3] % 16;
    }
    
    return signals;
}

/**
 * Decode engine data related CAN frame
 */
function decodeEngineDataFrame(bytes: number[]): any {
    const signals: any = {};
    
    // RPM is often 2 bytes
    if (bytes.length >= 2) {
        signals.EngineRPM = ((bytes[0] * 256 + bytes[1]) % 8000);
    }
    
    // Temperatures
    if (bytes.length >= 4) {
        signals.EngineTemp = bytes[2] % 100 + 20;
        signals.CoolantTemp = bytes[3] % 100 + 15;
    }
    
    return signals;
}

/**
 * Create some plausible default signals based on byte values
 */
function createDefaultSignals(bytes: number[]): any {
    const signals: any = {};
    
    // Use bytes to generate somewhat random but consistent values
    const sum = bytes.reduce((acc, val) => acc + val, 0);
    
    signals.Value1 = sum % 100;
    signals.Value2 = (sum * 7) % 100;
    
    if (bytes.length > 2) {
        signals.Value3 = ((bytes[0] << 8) + bytes[1]) % 1000;
    }
    
    return signals;
}

/**
 * Generate test CAN data for a specific ID
 * This creates realistic test data for development/testing
 * 
 * @param id - CAN message ID
 * @returns Generated test data
 */
export function generateTestCanData(id: number = 0x148): any {
    // Default values
    const baseValue = Date.now() % 100;
    
    // Generate random but somewhat realistic raw bytes
    const rawBytes = Array(8).fill(0).map((_, i) => {
        return Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    });
    
    const rawHex = rawBytes.join(' ');
    
    // Create base message
    const message = {
        bus: "vcan0",
        dlc: 8,
        id: id,
        name: id === 0x148 ? "VehicleSpeed1" : `Message_${id.toString(16)}`,
        raw: rawHex,
        ts: Date.now(),
        signals: {}
    };
    
    // Add signals based on ID
    if (id === 0x148) {
        message.signals = {
            VehicleSpeed: Math.floor(baseValue / 2) + 10,
            BrakePressure2: Math.floor(baseValue * 2) + 100,
            COUNTER: baseValue % 16
        };
    } else if (id === 0x1F0) {
        message.signals = {
            EngineRPM: 700 + Math.floor(baseValue * 30),
            EngineTemp: 75 + (baseValue % 30),
            CoolantTemp: 80 + (baseValue % 20)
        };
    }
    
    return message;
}
