const { safeParseCanMessage, repairCanJson } = require('../src/utils/canUtils');

// Sample malformed messages to test parsing logic
const sampleMessages = [
    // Good JSON
    '{"bus":"vcan0","dlc":8,"id":328,"name":"VehicleSpeed1","raw":"AA BB 22 33 55 00 01 11","signals":{"BrakePressure2":256.0,"COUNTER":5.0,"VehicleSpeed":2.73},"ts":30958577569}',
    
    // Malformed signals
    '{"bus":"vcan0","dlc":8,"id":328,"name":"VehicleSpeed1","raw":"AA BB 22 33 55 00 01 11","signals":"BrakePressure2":256.0,"COUNTER":5.0,"VehicleSpeed":2.73,"ts":30958577569}',
    
    // Missing closing bracket for signals
    '{"bus":"vcan0","dlc":8,"id":328,"name":"VehicleSpeed1","raw":"AA BB 22 33 55 00 01 11","signals":{"BrakePressure2":256.0,"COUNTER":5.0,"VehicleSpeed":2.73,"ts":30958577569}'
];

// Add truncated / malformed examples
sampleMessages.push(
    // Truncated empty signals (classic case)
    '{"bus":"vcan0","dlc":8,"id":2147483976,"name":"NEW_MSG_7","raw":"11 22 33 44 55 66 77 11","signals": \n"ts":88639436662}',
    // Signals without braces, then ts
    '{"bus":"vcan0","dlc":8,"id":2147483976,"name":"NEW_MSG_7","raw":"11 22 33 44 55 66 77 11","signals":"NEW_SIGNAL_1":21862.0,"ts":88630422651}'
);

console.log('🧪 Testing CAN message parsing logic\n');

sampleMessages.forEach((msg, index) => {
    console.log(`\nTest #${index + 1}:`);
    console.log('Input:', msg);
    
    try {
        const result = safeParseCanMessage(msg);
        console.log('Parsing result:', result ? '✅ Success' : '❌ Failed');
        
        if (result) {
            console.log('Parsed data:');
            console.log('- Vehicle Speed:', 
                result.signals?.VehicleSpeed || 
                'Not found in signals');
                
            console.log('- Top level fields:', Object.keys(result).join(', '));
            
            if (result.signals) {
                console.log('- Signal fields:', 
                    typeof result.signals === 'object' ? 
                    Object.keys(result.signals).join(', ') : 
                    `Signals is not an object: ${typeof result.signals}`);
            } else {
                console.log('- No signals field found');
            }
        }
    } catch (error) {
        console.log('❌ Error during parsing test:', error.message);
    }
    
    console.log('-----------------------------------');
});

console.log('\n🧪 Testing CAN message parsing logic (extended cases)');

sampleMessages.forEach((msg,i)=>{
    console.log(`\nTest #${i+1}`);
    console.log('Raw in:', msg);
    const repaired = repairCanJson(msg);
    if (repaired !== msg) {
        console.log('Repaired:', repaired);
    }
    const parsed = safeParseCanMessage(msg);
    if (parsed){
        console.log('✅ Parsed. signals keys:',
            parsed.signals && typeof parsed.signals === 'object'
                ? Object.keys(parsed.signals) : '(none / not object)');
    } else {
        console.log('❌ Parse failed.');
    }
});

console.log('\n🧪 Parse testing complete');
