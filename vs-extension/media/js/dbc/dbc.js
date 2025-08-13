
export function parseDBC(text){
  const msgs = {}; let cur = null;
  const lines = text.split(/\r?\n/);
  for (const ln of lines){
    if (ln.startsWith('BO_ ')){
      const m = ln.match(/^BO_\s+(\d+)\s+(\S+)\s*:\s*(\d+)/);
      if (m){ const id=+m[1]; cur = { id, name:m[2], dlc:+m[3], signals:[] }; msgs[id]=cur; }
    } else if (ln.startsWith('SG_ ') && cur){
      const m = ln.match(/^SG_\s+(\S+)\s*:\s*(\d+)\|(\d+)@([01])([+-])\s+\(([-+.\deE]+),\s*([-+.\deE]+)\)\s*\[\s*([-+.\deE]+)\|([-+.\deE]+)\s*\]\s*"([^"]*)"/);
      if (m){
        cur.signals.push({ name:m[1], start:+m[2], len:+m[3], intel: m[4]==='1', signed: m[5]==='-',
          factor:+m[6], offset:+m[7], min:+m[8], max:+m[9], unit:m[10] });
      }
    }
  }
  return msgs;
}

function getBitLE(bytes, bitIndex){ const byte = Math.floor(bitIndex/8), bit = bitIndex%8; return (bytes[byte] >> bit) & 1; }
function getBitBE(bytes, bitIndex){ const byte = Math.floor(bitIndex/8), bit = 7 - (bitIndex%8); return (bytes[byte] >> bit) & 1; }

export function extractSignal(bytes, start, len, intel, signed){
  let v = 0;
  if (intel){ for(let i=0;i<len;i++){ v |= (getBitLE(bytes, start+i) << i); } }
  else { for(let i=0;i<len;i++){ v = (v<<1) | getBitBE(bytes, start+i); } }
  if (signed){ const signBit = 1 << (len-1); if (v & signBit){ v = v - (1<<len); } }
  return v;
}

export function decodePayload(msgsById, payload){
  const id = payload.id ?? payload.can_id ?? payload.arbitration_id;
  if (id == null) return null;
  const msg = msgsById[id];
  if (!msg) return null;
  let bytes = null;
  if (payload.data && Array.isArray(payload.data)) bytes = Uint8Array.from(payload.data);
  if (!bytes && typeof payload.raw === 'string'){
    const arr = payload.raw.trim().split(/\s+/).map(x=>parseInt(x,16));
    if (arr.every(x=>!Number.isNaN(x))) bytes = Uint8Array.from(arr);
  }
  if (!bytes) return null;
  const out = {};
  for (const s of msg.signals){
    const raw = extractSignal(bytes, s.start, s.len, s.intel, s.signed);
    const phys = raw * s.factor + s.offset;
    out[s.name] = phys;
  }
  return { id, name: msg.name, values: out };
}
