// Clean J1939 CAN decoder with additional aliases

function getJ1939Pgn(id: number): number {
    // 29-bit ID layout: Priority(3) | R(1) | DP(1) | PF(8) | PS(8) | SA(8)
    // Shift out SA (8 bits) first
    const afterSa = id >> 8;              // remove SA
    const pf = afterSa & 0xFF;            // low byte now PF
    const ps = (afterSa >> 8) & 0xFF;     // next byte PS (because of endianness in shift logic)
    let pgn: number;
    if (pf < 240) {
        // PDU1: PGN lower 8 bits become 00 (destination specific)
        pgn = (pf << 8); // PS zeroed
    } else {
        // PDU2: full 16 bits PF|PS
        pgn = (pf << 8) | ps;
    }
    return pgn; // 16-bit PGN (fits all standard PGNs <= 0xFFFF)
}

export interface DecodedFrame { id: number; data: Buffer; signals: {[k: string]: number}; }

export function parseRawCanFrame(frameStr: string): {id:number,data:Buffer}|null {
    try {
        const parts = frameStr.trim().split('#');
        if(parts.length!==2) return null;
        const idStr = parts[0].trim();
        const dataHex = parts[1].trim();
        let id: number;
        if(/^0x/i.test(idStr)) id = parseInt(idStr.slice(2),16); else if(/^[0-9A-Fa-f]+$/.test(idStr)) id = parseInt(idStr,16); else id = parseInt(idStr,10);
        const bytes: number[] = [];
        for(let i=0;i<dataHex.length;i+=2){ const b = dataHex.slice(i,i+2); if(b.length===2) bytes.push(parseInt(b,16)); }
        return { id, data: Buffer.from(bytes) };
    } catch(e){
        console.error('parseRawCanFrame failed', e);
        return null;
    }
}

export function decodeJ1939Frame(frame: {id:number,data:Buffer}): {[k:string]:number} {
    const signals: {[k:string]:number} = {};
    const pgn = getJ1939Pgn(frame.id);
    const d = frame.data;
    try {
        switch(pgn){
            // 61444 EEC1
            case 61444: {
                if(d.length>=5){
                    const rpm = d.readUInt16LE(3) * 0.125; // SPN190
                    signals.EngineSpeed = rpm; signals.EngineRPM = rpm; signals.EngSpeed = rpm;
                }
                signals.ActualEngineTorque = d.length>2 ? d.readUInt8(2)-125 : 0; // SPN513
                break;
            }
            // 65265 CCVS
            case 65265: {
                if(d.length>=3){ signals.VehicleSpeed = d.readUInt16LE(1)/256; } // SPN84
                break;
            }
            // 65262 ET1 temps
                    case 65262: {
                        // ET1 standard layout expects 8 bytes; if less, only decode existing bytes safely
                            if(d.length>=1 && d[0]!==0xFF){
                                // Standard scaling 1°C/bit offset -40; keep even if out-of-range for downstream correction
                                const v = d[0]-40;
                                signals.EngCoolantTemp = v;
                                signals.EngineCoolantTemp = v;
                            }
                        // Heuristic: if some upstream produced a mis-scaled negative coolant (≈ -269) via 0.03125*raw-273, try to recover byte
                        if(signals.EngCoolantTemp != null && signals.EngCoolantTemp <= -200){
                            // Reverse mis-scale: rawApprox = (val + 273)/0.03125
                            const rawApprox = (signals.EngCoolantTemp + 273)/0.03125;
                            if(rawApprox >=0 && rawApprox <=255){
                                const recovered = Math.round(rawApprox) - 40;
                                if(recovered > -60 && recovered < 200){
                                    signals.EngCoolantTemp = recovered;
                                    signals.EngineCoolantTemp = recovered;
                                }
                            }
                        }
                        if(d.length>=2 && d[1]!==0xFF){ signals.EngFuelTemp1 = d[1]-40; }
                        if(d.length>=3 && d[2]!==0xFF){ signals.EngIntercoolerTemp = d[2]-40; }
                        if(d.length>=4 && d[3]!==0xFF){ signals.EngIntercoolerThermostatOpening = +(d[3]*0.4).toFixed(1); }
                        // Oil temps need 6+ / 8+ bytes — skip if DLC shorter
                    if(d.length>=6){ const rawOil = d.readUInt16LE(4); if(rawOil!==0xFFFF){ let oilT = rawOil*0.03125 - 273; if(oilT>-60 && oilT<400){ signals.EngOilTemp1 = +oilT.toFixed(1); signals.EngOilTemp = signals.EngOilTemp1; } } }
                            else if(d.length>=5){ // heuristic: single extra byte (no full 16-bit) treat as 1°C/bit -40 if plausible
                                const b4 = d[4];
                                if(b4!==0xFF){ let t = b4 - 40; if(t>-60 && t<200){ signals.EngOilTemp1 = t; signals.EngOilTemp = t; } }
                            }
                    if(d.length>=8){ const rawTurbo = d.readUInt16LE(6); if(rawTurbo!==0xFFFF){ let t = rawTurbo*0.03125 - 273; if(t>-60 && t<900){ signals.EngTurboOilTemp = +t.toFixed(1); } } }
                        break;
                    }
            // 65263 LFE1 (using only oil pressure here for demo)
            case 65263: {
                if(d.length>=4){ const op = d.readUInt8(3)*4; signals.EngineOilPressure = op; signals.EngOilPress = op; }
                break; }
            // 65270 (placeholder MAP) - using first byte as kPa
            case 65270: {
                        // IC1 / Intake related; SPN 102 (Engine Intake Manifold 1 Pressure) often 2 kPa/bit.
                        // Some devices place 0xFF in first byte, usable value in second.
                        let rawA: number | null = null;
                        if(d.length>=1 && d[0]!==0xFF) rawA = d[0];
                        else if(d.length>=2 && d[1]!==0xFF) rawA = d[1];
                        if(rawA!=null){
                            const kPa = rawA * 2; // assume 2 kPa/bit scaling
                            signals.IntakeManifoldPress = kPa;
                            signals.EngineIntakeManifold1Press = kPa; // previous naming used
                            signals.EngIntakeManifold1Press = kPa;    // common shorter alias
                            signals.EngAirIntakePress = kPa;          // alternative vendor alias
                        }
                break; }
            // 65271 VD battery voltage
            case 65271: {
                if(d.length>=6){ const rawBatt = d.readUInt16LE(4); if(rawBatt!==0xFFFF){ const v = rawBatt*0.05; signals.BatteryVoltage = v; signals.BattVolt = v; signals.BatteryPotential_PowerInput1 = v; } }
                break; }
            // 65276 Fuel level
            case 65276: {
                if(d.length>=2 && d[1]!==0xFF){ signals.FuelLevel = d[1]*0.4; signals.FuelLevelPercent = signals.FuelLevel; }
                break; }
            // 65248 Total Vehicle Distance
            case 65248: {
                if(d.length>=4){ signals.TotalVehicleDistance = d.readUInt32LE(0)*0.125; }
                break; }
            default: break;
        }
    } catch(err){
        console.error('decodeJ1939Frame error', err);
    }
    return signals;
}

export function decodeCanFrameStr(frameStr: string): {[k:string]:number} {
    const parsed = parseRawCanFrame(frameStr);
    if(!parsed) return {};
    return decodeJ1939Frame(parsed);
}
