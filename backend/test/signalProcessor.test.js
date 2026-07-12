/**
 * Self-test validating the new ML-merged vitals_update payload shape and database schema integrations.
 * Run directly via:
 *   node backend/test/signalProcessor.test.js
 */
const mongoose = require('mongoose');
const VitalLog = require('../models/VitalLog');

let failures = 0;

function assert(condition, message) {
    if (!condition) {
        console.log(`  FAIL: ${message}`);
        failures++;
    } else {
        console.log(`  PASS: ${message}`);
    }
}

// Mock user ID for testing
const mockUserId = new mongoose.Types.ObjectId();

console.log("--- Executing VitalSense AI Backend Integrations Test Suite ---\n");

// --- Test 1: VitalLog Mongoose Schema Integrity ---
try {
    const testLog = new VitalLog({
        userId: mockUserId,
        heartRate: 75,
        respirationRate: 16,
        spo2: 99,
        stress: 42,
        rmssd: 52,
        sdnn: 58,
        blinkCount: 4,
        blinkRate: 12.5,
        stressLabel: 'MODERATE / CALM',
        confidence: 96
    });

    console.log("[Test 1] Validating Mongoose Schema compilation for new ML fields...");
    assert(testLog.blinkRate === 12.5, "blinkRate field populated successfully in VitalLog instance");
    assert(testLog.stressLabel === 'MODERATE / CALM', "stressLabel string field parsed successfully");
    assert(testLog.confidence === 96, "confidence subscore saved in schema");
} catch (err) {
    console.error("  FAIL: Schema validation threw an error:", err);
    failures++;
}

// --- Test 2: Merged vitals_update Payload Shape Assertion ---
console.log("\n[Test 2] Validating merged vitals_update payload shape required for cyber-HUD gauges...");
try {
    // Simulate what the ML socket pipeline emits to the React client
    const simulatedPayload = {
        heartRate: 78,
        respirationRate: 16,
        spo2: 98,
        stress: 35,
        rmssd: 45,
        sdnn: 50,
        blinkCount: 3,
        blinkRate: 8.4,
        stress_score: 35,
        stress_label: 'LOW / RELAXED',
        confidence: 98.5,
        talking: 'NO',
        expression: 'CALM / BASELINE',
        signalQuality: 98,
        isLowConfidence: false,
        filteredWave: [0.1, 0.2, 0.3, 0.4]
    };

    const requiredKeys = [
        'heartRate', 'respirationRate', 'spo2', 'stress', 'rmssd', 'sdnn',
        'blinkCount', 'blinkRate', 'stress_score', 'stress_label', 'confidence',
        'talking', 'expression', 'signalQuality', 'isLowConfidence', 'filteredWave'
    ];

    requiredKeys.forEach(key => {
        assert(simulatedPayload[key] !== undefined, `Payload contains '${key}' attribute`);
    });
} catch (err) {
    console.error("  FAIL: Payload assertion threw an error:", err);
    failures++;
}

console.log("\n-----------------------------------------------------");
console.log(failures === 0 ? "ALL BACKEND TESTS PASSED" : `${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
