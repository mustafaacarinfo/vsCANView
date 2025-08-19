/**
 * Utilities for CAN data processing and validation
 */

/**
 * Validates and repairs CAN message JSON if possible
 * 
 * @param {string} message - The raw CAN message string
 * @returns {object} The parsed JSON object or null if invalid
 */
function safeParseCanMessage(message) {
    try {
        return JSON.parse(message);
    } catch {
        try {
            const repaired = repairCanJson(message);
            return JSON.parse(repaired);
        } catch (e2){
            console.error('❌ Failed to repair CAN message JSON:', e2);
            return null;
        }
    }
}

/**
 * Extracts key vehicle metrics from CAN data with flexible property paths
 * 
 * @param {object} data - The parsed CAN data object
 * @returns {object} Standardized vehicle data 
 */
function extractVehicleData(data) {
    if (!data) return {};
    
    // Helper to safely get nested values
    const getValue = (obj, paths) => {
        if (!obj) return undefined;
        
        for (const path of paths) {
            const value = getNestedProperty(obj, path);
            if (value !== undefined) {
                const num = Number(value);
                return !isNaN(num) ? num : value;
            }
        }
        return undefined;
    };
    
    // Structured extraction with path alternatives
    return {
        speed: getValue(data, [
            'signals.VehicleSpeed',
            'signals.vehicle_speed', 
            'signals.SPEED',
            'speed'
        ]),
        rpm: getValue(data, [
            'signals.EngineRPM',
            'signals.RPM',
            'signals.engine_rpm',
            'rpm'
        ]),
        engineTemp: getValue(data, [
            'signals.EngineTemp',
            'signals.engine_temp',
            'engineTemp'
        ]),
        coolantTemp: getValue(data, [
            'signals.CoolantTemp',
            'signals.coolant_temp',
            'coolantTemp'
        ])
    };
}

/**
 * Gets a nested property using dot notation
 * 
 * @param {object} obj - The object to search
 * @param {string} path - Dot notation path (e.g., 'signals.VehicleSpeed')
 * @returns {any} The value if found, otherwise undefined
 */
function getNestedProperty(obj, path) {
    if (!obj || !path) return undefined;
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }
    
    return current;
}

/**
 * Repairs malformed "signals" sections:
 * 1. "signals":  (nothing until next top-level key)  -> inserts empty object
 * 2. "
