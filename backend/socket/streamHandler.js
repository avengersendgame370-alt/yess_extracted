const jwt = require('jsonwebtoken');
const User = require('../models/User');
const VitalLog = require('../models/VitalLog');

// Attempt to load the Presage SmartSpectra SDK
let smartSpectraSDKLib = null;
try {
    smartSpectraSDKLib = require('@smartspectra/node-sdk');
    console.log("[Presage SDK] Successfully loaded SmartSpectra SDK Node bindings.");
} catch (err) {
    console.warn("[Presage SDK] Warning: Failed to load '@smartspectra/node-sdk'. The app will run in high-fidelity mock mode.");
}

// Active session tracking
const activeSessions = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[Socket.io] Client connected: ${socket.id}`);

        // Track socket-specific variables
        activeSessions.set(socket.id, {
            sdk: null,
            userId: null,
            isScanning: false,
            metricsBuffer: {
                heartRates: [],
                respirationRates: [],
                spo2s: [],
                stresses: [],
                rmssds: [],
                sdnns: [],
                blinkCount: 0,
                confidences: []
            },
            mockInterval: null,
            frameCount: 0
        });

        // Start scanning session
        socket.on('start_session', async (data) => {
            const session = activeSessions.get(socket.id);
            if (!session) return;

            const { token } = data || {};
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    session.userId = decoded.userId;
                    console.log(`[Socket.io] Session authenticated for User ID: ${session.userId}`);
                } catch (err) {
                    console.warn("[Socket.io] Invalid JWT token in start_session");
                    socket.emit('sdk_error', { message: "Authentication failed. Invalid token." });
                    return;
                }
            }

            session.isScanning = true;
            session.frameCount = 0;
            session.metricsBuffer = {
                heartRates: [],
                respirationRates: [],
                spo2s: [],
                stresses: [],
                rmssds: [],
                sdnns: [],
                blinkCount: 0,
                confidences: []
            };

            // Initialize Presage SDK if library is loaded and API key is present
            const apiKey = process.env.PRESAGE_API_KEY;
            if (smartSpectraSDKLib && apiKey && apiKey !== 'mock_api_key_placeholder') {
                try {
                    const { SmartSpectraSDK, FrameTransform, breathingMetrics, cardioMetrics, decodeMetrics, PixelFormat } = smartSpectraSDKLib;

                    console.log(`[Presage SDK] Initializing SDK session for socket ${socket.id}`);
                    const sdkInstance = new SmartSpectraSDK({
                        apiKey: apiKey,
                        requestedMetrics: [...breathingMetrics, ...cardioMetrics]
                    });

                    // Metrics event: fired when SDK has calculated vitals
                    sdkInstance.on('metrics', (buf, ts) => {
                        try {
                            const decoded = decodeMetrics(buf);
                            
                            // Map values from SDK object (handles typical naming variations defensively)
                            const heartRate = decoded.pulseRate || decoded.heartRate || 0;
                            const respirationRate = decoded.breathingRate || decoded.respirationRate || 0;
                            const spo2 = decoded.spo2 || 0;
                            const stress = decoded.baevskyStressIndex || decoded.stressIndex || decoded.stress || 0;
                            const rmssd = decoded.rmssd || 0;
                            const sdnn = decoded.sdnn || 0;
                            const confidence = decoded.confidence !== undefined ? decoded.confidence : 100;
                            
                            // Track running blinks
                            if (decoded.blinkDetected) {
                                session.metricsBuffer.blinkCount++;
                            }

                            // Buffer metrics for database storage on end_session
                            if (heartRate > 0) session.metricsBuffer.heartRates.push(heartRate);
                            if (respirationRate > 0) session.metricsBuffer.respirationRates.push(respirationRate);
                            if (spo2 > 0) session.metricsBuffer.spo2s.push(spo2);
                            if (stress > 0) session.metricsBuffer.stresses.push(stress);
                            if (rmssd > 0) session.metricsBuffer.rmssds.push(rmssd);
                            if (sdnn > 0) session.metricsBuffer.sdnns.push(sdnn);
                            session.metricsBuffer.confidences.push(confidence);

                            // Build payload to send back to client
                            socket.emit('vitals_update', {
                                heartRate,
                                respirationRate,
                                spo2,
                                stress,
                                rmssd,
                                sdnn,
                                blinkCount: session.metricsBuffer.blinkCount,
                                talking: decoded.talking ? 'YES' : 'NO',
                                expression: decoded.expression || 'CALM / BASELINE',
                                signalQuality: decoded.signalQuality || (confidence > 50 ? 95 : 20),
                                isLowConfidence: confidence < 50,
                                filteredWave: decoded.waveform || decoded.arterialPressureWaveform || generateArtWaveSlice(),
                            });
                        } catch (err) {
                            console.error("[Presage SDK] Metrics decode failed:", err);
                        }
                    });

                    // Validation hints: "Hold still", "Move into better light", etc.
                    sdkInstance.on('validationStatus', (code, ts, hint) => {
                        socket.emit('validation_hint', { hint: hint || "Hold still..." });
                    });

                    // Error reporting
                    sdkInstance.on('error', (code, message, retryable) => {
                        console.error(`[Presage SDK ERROR] Code: ${code}, Msg: ${message}`);
                        if (code === 'kAuthenticationFailed') {
                            socket.emit('sdk_error', { message: "Presage API Key authentication failed. Falling back to simulation." });
                            // Fallback to mock loop for this session
                            startMockSession(socket, session);
                        } else {
                            socket.emit('sdk_error', { message });
                        }
                    });

                    sdkInstance.useCustomInput(FrameTransform.kNone);
                    sdkInstance.start();
                    session.sdk = sdkInstance;

                    console.log(`[Presage SDK] SDK session successfully started for ${socket.id}`);
                } catch (err) {
                    console.error("[Presage SDK] SDK failed to start. Falling back to simulation.", err);
                    socket.emit('sdk_error', { message: "Failed to initialize native SDK. Falling back to simulator." });
                    startMockSession(socket, session);
                }
            } else {
                console.log(`[Socket.io] Running session in simulator mode for ${socket.id}`);
                startMockSession(socket, session);
            }
        });

        // Receive video frame data from frontend
        socket.on('stream_frame_data', (data) => {
            const session = activeSessions.get(socket.id);
            if (!session || !session.isScanning) return;

            session.frameCount++;

            // If we have an active SDK instance, pipe the frame to it
            if (session.sdk) {
                try {
                    const { frame, width, height } = data || {};
                    if (frame && Buffer.isBuffer(frame)) {
                        // Stride is width * 3 for RGB format
                        const stride = width * 3;
                        // Use monotonic timestamp in microseconds
                        const captureTsUs = process.hrtime.bigint() / 1000n;
                        
                        session.sdk.sendFrame(frame, width, height, stride, smartSpectraSDKLib.PixelFormat.kRGB, captureTsUs);
                    }
                } catch (err) {
                    console.error("[Presage SDK] Error processing streamed frame:", err);
                }
            }
        });

        // Stop session, compute averages, and write log to MongoDB
        socket.on('end_session', async () => {
            const session = activeSessions.get(socket.id);
            if (!session) return;

            console.log(`[Socket.io] End session requested for socket ${socket.id}`);
            session.isScanning = false;

            // Stop SDK if running
            if (session.sdk) {
                try {
                    await session.sdk.destroy();
                    session.sdk = null;
                    console.log(`[Presage SDK] SDK instance destroyed for socket ${socket.id}`);
                } catch (err) {
                    console.error("[Presage SDK] Error destroying SDK instance:", err);
                }
            }

            // Stop Mock interval if running
            if (session.mockInterval) {
                clearInterval(session.mockInterval);
                session.mockInterval = null;
            }

            // Calculate averages and save to Database if authenticated user
            const mb = session.metricsBuffer;
            if (session.userId && mb.heartRates.length > 0) {
                try {
                    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
                    
                    const log = new VitalLog({
                        userId: session.userId,
                        heartRate: Math.round(avg(mb.heartRates)),
                        respirationRate: Math.round(avg(mb.respirationRates)),
                        spo2: Math.round(avg(mb.spo2s)),
                        stress: Math.round(avg(mb.stresses)),
                        rmssd: Math.round(avg(mb.rmssds)),
                        sdnn: Math.round(avg(mb.sdnns)),
                        blinkCount: mb.blinkCount,
                        confidence: Math.round(avg(mb.confidences))
                    });

                    await log.save();
                    console.log(`[Database] VitalLog saved for user: ${session.userId}`);
                    socket.emit('session_saved', log);
                } catch (err) {
                    console.error("[Database] Failed to save session logs:", err);
                    socket.emit('sdk_error', { message: "Failed to persist health metrics to database" });
                }
            } else {
                console.log("[Socket.io] Session ended, no database log saved (unauthenticated or empty metrics)");
            }
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            const session = activeSessions.get(socket.id);
            if (session) {
                if (session.sdk) {
                    try {
                        await session.sdk.destroy();
                        console.log(`[Presage SDK] SDK destroyed on disconnect for socket ${socket.id}`);
                    } catch (err) {
                        console.error("[Presage SDK] Error destroying SDK on disconnect:", err);
                    }
                }
                if (session.mockInterval) {
                    clearInterval(session.mockInterval);
                }
                activeSessions.delete(socket.id);
            }
            console.log(`[Socket.io] Client disconnected: ${socket.id}`);
        });
    });
};

// Helper: Start the simulation loop
function startMockSession(socket, session) {
    if (session.mockInterval) clearInterval(session.mockInterval);

    let mockTime = 0;
    session.mockInterval = setInterval(() => {
        if (!session.isScanning) return;

        mockTime += 1;

        // Simulate rolling average settling window:
        // heart rate stabilizes after 12s, breathing after 30s, HRV after 60s
        const hrSettled = mockTime >= 12;
        const rrSettled = mockTime >= 30;
        const hrvSettled = mockTime >= 60;

        const heartRate = hrSettled ? Math.round(72 + Math.sin(mockTime / 10) * 3 + (Math.random() - 0.5) * 2) : 0;
        const respirationRate = rrSettled ? Math.round(15 + Math.cos(mockTime / 25) * 1 + (Math.random() - 0.5) * 0.5) : 0;
        const spo2 = hrSettled ? Math.round(98 + (Math.random() - 0.5) * 0.5) : 0;
        
        // HRV parameters
        const sdnn = hrvSettled ? Math.round(52 + Math.sin(mockTime / 50) * 5) : 0;
        const rmssd = hrvSettled ? Math.round(45 + Math.cos(mockTime / 40) * 4) : 0;
        const stress = hrvSettled ? Math.round(48 + Math.sin(mockTime / 30) * 6) : 0;

        // Simple blink model: blink every 6-12 seconds
        let blinkDetected = false;
        if (mockTime % 8 === 0 && Math.random() > 0.3) {
            session.metricsBuffer.blinkCount++;
            blinkDetected = true;
        }

        // Talking and expression
        const talking = mockTime % 45 < 5 ? 'YES' : 'NO';
        const expression = talking === 'YES' ? 'TALKING' : (mockTime % 30 < 5 ? 'HAPPY / SMILE' : 'CALM / BASELINE');

        // Accumulate statistics for final session logging
        if (heartRate > 0) session.metricsBuffer.heartRates.push(heartRate);
        if (respirationRate > 0) session.metricsBuffer.respirationRates.push(respirationRate);
        if (spo2 > 0) session.metricsBuffer.spo2s.push(spo2);
        if (stress > 0) session.metricsBuffer.stresses.push(stress);
        if (rmssd > 0) session.metricsBuffer.rmssds.push(rmssd);
        if (sdnn > 0) session.metricsBuffer.sdnns.push(sdnn);
        session.metricsBuffer.confidences.push(98);

        // Generate synthetic waveform
        const waveform = generateArtWaveSlice();

        socket.emit('vitals_update', {
            heartRate,
            respirationRate,
            spo2,
            stress,
            rmssd,
            sdnn,
            blinkCount: session.metricsBuffer.blinkCount,
            talking,
            expression,
            signalQuality: hrSettled ? 96 : 35,
            isLowConfidence: !hrSettled,
            filteredWave: waveform
        });

        // Trigger random validation status message periodically to show functionality
        if (mockTime % 22 === 0) {
            const hints = ["Move into better light", "Hold still", "Analyzing forehead region"];
            socket.emit('validation_hint', { hint: hints[Math.floor(Math.random() * hints.length)] });
        }
    }, 1000);
}

// Generate arterial pressure waveform data points (60 points)
function generateArtWaveSlice() {
    const points = [];
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
        const t = (now - i * 33.3) / 1000.0; // 30 FPS representation
        // Heart rate component (1.2 Hz) + dicrotic notch representation
        let val = Math.sin(2 * Math.PI * 1.2 * t) * 1.0;
        val += Math.sin(2 * Math.PI * 2.4 * t + Math.PI/3) * 0.35; // Dicrotic notch approximation
        val += (Math.random() - 0.5) * 0.05; // Sensor noise
        points.unshift(val);
    }
    return points;
}
