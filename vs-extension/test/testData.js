// Test data generator to help diagnose CAN data issues

// Generate random CAN data mimicking your actual format
function generateTestCanData() {
    return {
        "bus": "vcan0",
        "dlc": 8,
        "id": Math.floor(Math.random() * 2000),
        "name": "TestMessage",
        "raw": "AA BB CC DD EE FF 00 00",
        "signals": {
            "VehicleSpeed": Math.floor(Math.random() * 120),
            "EngineRPM": Math.floor(Math.random() * 8000),
            "EngineTemp": Math.floor(50 + Math.random() * 70),
            "CoolantTemp": Math.floor(40 + Math.random() * 60),
            "COUNTER": Math.floor(Math.random() * 10),
        },
        "ts": Date.now()
    };
}

// Send test data periodically to simulate CAN bus
function startTestDataSimulation(client, topicPrefix = 'can/test') {
    console.log('Starting test data simulation...');
    // Send a retained frame (helps immediate consumption if the UI opens later)
    const retained = generateTestCanData();
    client.publish(`${topicPrefix}/${retained.id}`, JSON.stringify(retained), { retain: true });
    return setInterval(() => {
        
        // Publish to MQTT topic
        client.publish(`${topicPrefix}/${testData.id}`, jsonData);
        console.log(`Published test data: ID=${testData.id}, Speed=${testData.signals.VehicleSpeed}`);
    }, 1000); // Send every second
}

module.exports = {
    generateTestCanData,
    startTestDataSimulation
};
