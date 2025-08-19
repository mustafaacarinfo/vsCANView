// Test data generator to help diagnose CAN data issues

// Generate random CAN data mimicking your actual format
function generateTestCanData() {
    // Base time values for simulation
    const baseTime = Date.now();
    const simDistance = Math.floor(Math.random() * 1000) + 100; // 100-1100 km
    const simOperation = Math.floor(Math.random() * 200) + 10;  // 10-210 hours
    
    return {
        "bus": "vcan0",
        "dlc": 8,
        "id": Math.random() > 0.5 ? 328 : Math.floor(Math.random() * 2000),
        "name": Math.random() > 0.5 ? "VehicleSpeed1" : "TestMessage",
        "raw": "AA BB CC DD EE FF 00 00",
        "signals": {
            "VehicleSpeed": Math.floor(Math.random() * 120),
            "EngineRPM": Math.floor(Math.random() * 8000),
            "EngineTemp": Math.floor(50 + Math.random() * 70),
            "CoolantTemp": Math.floor(40 + Math.random() * 60),
            "Distance": simDistance,
            "OperationTime": simOperation, 
            "FuelRate": Math.floor(Math.random() * 50) + 5, // 5-55 l/h
            "FuelEconomy": Math.floor(Math.random() * 20) + 1, // 1-21 km/l
            "COUNTER": Math.floor(Math.random() * 10),
        },
        "ts": baseTime
    };
}

// Yeni fonksiyon: Raw J1939 test verisi üret
function generateRawJ1939Frame() {
    const pgnMap = {
        61444: { id: 0x0CF00400, data: Buffer.alloc(8) }, // EEC1
        65265: { id: 0x0CFEF100, data: Buffer.alloc(8) }, // CCVS
        65262: { id: 0x0CFEEF00, data: Buffer.alloc(8) }, // ET1
    };

    // EEC1 (RPM) verisi oluştur
    const rpm = 800 + Math.random() * 2000;
    const rpmValue = rpm / 0.125;
    pgnMap[61444].data.writeUInt16LE(rpmValue, 3);

    // CCVS (Speed) verisi oluştur
    const speed = Math.random() * 100;
    const speedValue = speed * 256;
    pgnMap[65265].data.writeUInt16LE(speedValue, 1);
    
    // ET1 (Coolant Temp) verisi oluştur
    const temp = 70 + Math.random() * 25;
    const tempValue = temp + 40;
    pgnMap[65262].data.writeUInt8(tempValue, 0);

    // Rastgele bir PGN seç
    const pgnKeys = Object.keys(pgnMap);
    const randomPgnKey = pgnKeys[Math.floor(Math.random() * pgnKeys.length)];
    const frame = pgnMap[randomPgnKey];

    return `${frame.id.toString(16).toUpperCase()}#${frame.data.toString('hex').toUpperCase()}`;
}

// Send test data periodically to simulate CAN bus
function startTestDataSimulation(client, topicPrefix = 'can/vcan0') {
    console.log('Starting test data simulation...');
    
    return setInterval(() => {
        // %50 ihtimalle JSON, %50 ihtimalle raw frame gönder
        if (Math.random() > 0.5) {
            const testData = generateTestCanData();
            const jsonData = JSON.stringify(testData);
            client.publish(`${topicPrefix}/${testData.id}`, jsonData);
            console.log(`Published JSON test data: ID=${testData.id}`);
        } else {
            const rawFrame = generateRawJ1939Frame();
            const [id, data] = rawFrame.split('#');
            client.publish(`${topicPrefix}/${parseInt(id, 16)}`, rawFrame);
            console.log(`Published RAW J1939 test data: ${rawFrame}`);
        }
    }, 1500); // Send every 1.5 seconds
}

module.exports = {
    generateTestCanData,
    startTestDataSimulation,
    generateRawJ1939Frame
};
