const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
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
            mlWs: null,
            userId: null,
            isScanning: false,
            sdkInitializing: false,
            metricsBuffer: {
                heartRates: [],
                respirationRates: [],
                spo2s: [],
                stresses: [],
                rmssds: [],
                sdnns: [],
                blinkCount: 0,
                blinkRates: [],
                stressLabels: [],
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
            session.sdk = null;
            session.sdkInitializing = false;
            session.metricsBuffer = {
                heartRates: [],
                respirationRates: [],
                spo2s: [],
                stresses: [],
                rmssds: [],
                sdnns: [],
                blinkCount: 0,
                blinkRates: [],
                stressLabels: [],
                confidences: []
            };

            // If ML engine is selected, initialize the WebSocket client to the ML microservice
            const engine = process.env.VITALS_ENGINE || 'dsp';
            if (engine === 'ml') {
                const mlServiceUrl = process.env.ML_SERVICE_URL || 'ws://127.0.0.1:8001';
                const streamUrl = `${mlServiceUrl}/vitals/stream`;
                console.log(`[Socket.io] Connecting to ML service at: ${streamUrl}`);
                
                try {
                    const ws = new WebSocket(streamUrl);
                    session.mlWs = ws;
                    
                    ws.on('open', () => {
                        console.log(`[Socket.io] Successfully connected to ML service WebSocket for socket ${socket.id}`);
                    });
                    
                    ws.on('message', (message) => {
                        try {
                            const parsed = JSON.parse(message.toString());
                            
                            const heartRate = parsed.heartRate || 0;
                            const respirationRate = parsed.respirationRate || 16;
                            const spo2 = parsed.spo2 || 98;
                            const stress = parsed.stress || 0;
                            const rmssd = parsed.rmssd || 0;
                            const sdnn = parsed.sdnn || 0;
                            const confidence = parsed.confidence !== undefined ? parsed.confidence : 100;
                            const blinkCount = parsed.blinkCount || 0;
                            const blinkRate = parsed.blinkRate || 0.0;
                            const stress_label = parsed.stress_label || 'CALM / BASELINE';
                            
                            session.metricsBuffer.blinkCount = blinkCount;
                            
                            // Log metrics into session averages buffer
                            if (heartRate > 0) session.metricsBuffer.heartRates.push(heartRate);
                            if (respirationRate > 0) session.metricsBuffer.respirationRates.push(respirationRate);
                            if (spo2 > 0) session.metricsBuffer.spo2s.push(spo2);
                            if (stress > 0) session.metricsBuffer.stresses.push(stress);
                            if (rmssd > 0) session.metricsBuffer.rmssds.push(rmssd);
                            if (sdnn > 0) session.metricsBuffer.sdnns.push(sdnn);
                            session.metricsBuffer.blinkRates.push(blinkRate);
                            session.metricsBuffer.stressLabels.push(stress_label);
                            session.metricsBuffer.confidences.push(confidence);
                            
                            // Re-emit directly to front-end in standard payload format
                            socket.emit('vitals_update', {
                                heartRate,
                                respirationRate,
                                spo2,
                                stress,
                                rmssd,
                                sdnn,
                                blinkCount,
                                blinkRate,
                                stress_score: stress,
                                stress_label,
                                confidence,
                                talking: parsed.talking || 'NO',
                                expression: parsed.expression || 'CALM / BASELINE',
                                signalQuality: Math.round(confidence),
                                isLowConfidence: confidence < 50,
                                filteredWave: parsed.filteredWave || [],
                            });
                        } catch (err) {
                            console.error("[Socket.io] Error parsing message from ML service:", err);
                        }
                    });
                    
                    ws.on('error', (err) => {
                        console.error(`[Socket.io] ML service WebSocket error for socket ${socket.id}:`, err.message);
                        activateFallbackEngine(socket, session);
                    });
                    
                    ws.on('close', () => {
                        console.warn(`[Socket.io] ML service WebSocket closed for socket ${socket.id}`);
                        if (session.isScanning) {
                            activateFallbackEngine(socket, session);
                        }
                    });
                } catch (err) {
                    console.error("[Socket.io] Failed to establish ML service connection. Falling back.", err);
                    activateFallbackEngine(socket, session);
                }
            } else {
                console.log(`[Socket.io] Scan session marked active for socket ${socket.id}. Awaiting first frame...`);
            }
        });

        // Receive video frame data from frontend
        socket.on('stream_frame_data', async (data) => {
            const session = activeSessions.get(socket.id);
            if (!session || !session.isScanning) return;

            session.frameCount++;

            // If ML engine connection is active, forward raw frames as binary over WS
            if (session.mlWs && session.mlWs.readyState === WebSocket.OPEN) {
                try {
                    const { frame } = data || {};
                    let frameBuffer = null;
                    if (frame) {
                        if (Buffer.isBuffer(frame)) {
                            frameBuffer = frame;
                        } else if (frame instanceof ArrayBuffer) {
                            frameBuffer = Buffer.from(frame);
                        } else if (ArrayBuffer.isView(frame)) {
                            frameBuffer = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
                        }
                    }
                    if (frameBuffer) {
                        session.mlWs.send(frameBuffer);
                    }
                } catch (err) {
                    console.error("[Socket.io] Error piping frame to ML service:", err.message);
                }
                return; // Prevent execution of downstream classical DSP code
            }

            // Classical DSP (Presage SDK) fallback processing path
            const apiKey = process.env.PRESAGE_API_KEY;
            const useRealSDK = smartSpectraSDKLib && apiKey && apiKey !== 'mock_api_key_placeholder';

            // Defer-initialize SDK on the very first frame to align timestamps perfectly
            if (useRealSDK && !session.sdk && !session.sdkInitializing && !session.mockInterval) {
                session.sdkInitializing = true;
                try {
                    const { SmartSpectraSDK, FrameTransform, breathingMetrics, cardioMetrics, decodeMetrics, PixelFormat } = smartSpectraSDKLib;

                    console.log(`[Presage SDK] First frame received. Initializing native SDK for socket ${socket.id}`);
                    const sdkInstance = new SmartSpectraSDK({
                        apiKey: apiKey,
                        requestedMetrics: [...breathingMetrics, ...cardioMetrics]
                    });

                    sdkInstance.on('metrics', (buf, ts) => {
                        try {
                            const decoded = decodeMetrics(buf);
                            
                            const heartRate = decoded.pulseRate || decoded.heartRate || 0;
                            const respirationRate = decoded.breathingRate || decoded.respirationRate || 0;
                            const spo2 = decoded.spo2 || 0;
                            const stress = decoded.baevskyStressIndex || decoded.stressIndex || decoded.stress || 0;
                            const rmssd = decoded.rmssd || 0;
                            const sdnn = decoded.sdnn || 0;
                            const confidence = decoded.confidence !== undefined ? decoded.confidence : 100;
                            
                            if (decoded.blinkDetected) {
                                session.metricsBuffer.blinkCount++;
                            }

                            if (heartRate > 0) session.metricsBuffer.heartRates.push(heartRate);
                            if (respirationRate > 0) session.metricsBuffer.respirationRates.push(respirationRate);
                            if (spo2 > 0) session.metricsBuffer.spo2s.push(spo2);
                            if (stress > 0) session.metricsBuffer.stresses.push(stress);
                            if (rmssd > 0) session.metricsBuffer.rmssds.push(rmssd);
                            if (sdnn > 0) session.metricsBuffer.sdnns.push(sdnn);
                            session.metricsBuffer.confidences.push(confidence);

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

                    sdkInstance.on('validationStatus', (code, ts, hint) => {
                        socket.emit('validation_hint', { hint: hint || "Hold still..." });
                    });

                    sdkInstance.on('error', (code, message, retryable) => {
                        console.error(`[Presage SDK ERROR] Code: ${code}, Msg: ${message}`);
                        if (code === 'kAuthenticationFailed') {
                            socket.emit('sdk_error', { message: "Presage API Key authentication failed. Falling back to simulation." });
                            startMockSession(socket, session);
                        } else {
                            socket.emit('sdk_error', { message });
                        }
                    });

                    sdkInstance.useCustomInput(FrameTransform.kNone);
                    sdkInstance.start();
                    session.sdk = sdkInstance;
                    session.sdkInitializing = false;
                    console.log(`[Presage SDK] Native SDK session successfully started on first frame for ${socket.id}`);
                } catch (err) {
                    console.error("[Presage SDK] Native SDK initialization failed on first frame:", err);
                    session.sdkInitializing = false;
                    socket.emit('sdk_error', { message: "Failed to initialize native SDK. Falling back to simulator." });
                    startMockSession(socket, session);
                }
            } else if (!useRealSDK && !session.mockInterval) {
                console.log(`[Socket.io] First frame received. Starting simulator mode for ${socket.id}`);
                startMockSession(socket, session);
            }

            if (session.sdk) {
                try {
                    const { frame, width, height, timestampUs } = data || {};
                    let frameBuffer = null;
                    if (frame) {
                        if (Buffer.isBuffer(frame)) {
                            frameBuffer = frame;
                        } else if (frame instanceof ArrayBuffer) {
                            frameBuffer = Buffer.from(frame);
                        } else if (ArrayBuffer.isView(frame)) {
                            frameBuffer = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
                        }
                    }

                    if (frameBuffer) {
                        const stride = width * 3;
                        const captureTsUs = timestampUs || (process.hrtime.bigint() / 1000n);
                        session.sdk.sendFrame(frameBuffer, width, height, stride, smartSpectraSDKLib.PixelFormat.kRGB, captureTsUs);
                    }
                } catch (err) {
                    console.error("[Presage SDK] Error sending frame to SDK:", err.message);
                }
            }
        });

        // Stop session, compute averages, and write log to MongoDB
        socket.on('end_session', async () => {
            const session = activeSessions.get(socket.id);
            if (!session) return;

            console.log(`[Socket.io] End session requested for socket ${socket.id}`);
            session.isScanning = false;

            // Close ML WebSocket if running
            if (session.mlWs) {
                try {
                    session.mlWs.send(JSON.stringify({ type: "reset" }));
                    session.mlWs.close();
                } catch (e) {}
                session.mlWs = null;
                console.log(`[Socket.io] Closed ML service connection for socket ${socket.id}`);
            }

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
                    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                    
                    const log = new VitalLog({
                        userId: session.userId,
                        heartRate: Math.round(avg(mb.heartRates)),
                        respirationRate: Math.round(avg(mb.respirationRates)),
                        spo2: Math.round(avg(mb.spo2s)),
                        stress: Math.round(avg(mb.stresses)),
                        rmssd: Math.round(avg(mb.rmssds)),
                        sdnn: Math.round(avg(mb.sdnns)),
                        blinkCount: mb.blinkCount,
                        blinkRate: Math.round(avg(mb.blinkRates)),
                        stressLabel: mb.stressLabels.length > 0 
                            ? mb.stressLabels[mb.stressLabels.length - 1] 
                            : 'CALM / BASELINE',
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
                if (session.mlWs) {
                    try { session.mlWs.close(); } catch (e) {}
                    session.mlWs = null;
                }
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

// Graceful auto-failover driver activation
function activateFallbackEngine(socket, session) {
    if (session.mlWs) {
        try { session.mlWs.close(); } catch(e) {}
        session.mlWs = null;
    }
    const apiKey = process.env.PRESAGE_API_KEY;
    const useRealSDK = smartSpectraSDKLib && apiKey && apiKey !== 'mock_api_key_placeholder';
    
    if (useRealSDK && !session.sdk && !session.sdkInitializing && !session.mockInterval) {
        console.warn("[Socket.io] ML Engine connection failed. Activating auto-failover to classical DSP.");
        // Mark starting to let the deferred framework initialize on next frames
    } else if (!useRealSDK && !session.mockInterval) {
        console.warn("[Socket.io] ML Engine connection failed. Activating auto-failover to simulator.");
        startMockSession(socket, session);
    }
}

// High-fidelity Simulator driver (runs if hardware SDK loads dry)
function startMockSession(socket, session) {
    if (session.mockInterval) return;

    let mockTime = 0;
    session.mockInterval = setInterval(() => {
        if (!session.isScanning) {
            clearInterval(session.mockInterval);
            session.mockInterval = null;
            return;
        }

        mockTime++;
        const hrSettled = mockTime > 5; // Simulates lock convergence delay
        const heartRate = hrSettled ? Math.round(72 + Math.sin(mockTime/10)*3) : 0;
        const respirationRate = hrSettled ? Math.round(16 + Math.cos(mockTime/15)*1.5) : 0;
        const spo2 = hrSettled ? Math.round(98 + (mockTime%3===0 ? 1 : 0)) : 98;
        const stress = hrSettled ? Math.round(35 + Math.sin(mockTime/20)*5) : 0;
        const rmssd = hrSettled ? Math.round(44 + Math.cos(mockTime/12)*4) : 0;
        const sdnn = hrSettled ? Math.round(48 + Math.sin(mockTime/8)*3) : 0;
        
        let blinkDetected = false;
        if (hrSettled && mockTime % 14 === 0) {
            blinkDetected = true;
            session.metricsBuffer.blinkCount++;
        }

        const talking = (mockTime % 30 >= 25) ? "YES" : "NO";
        const expression = (mockTime % 40 >= 35) ? "HAPPY / SMILE" : "CALM / BASELINE";

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
        let val = Math.sin(2 * Math.PI * 1.2 * t) * 1.0;
        val += Math.sin(2 * Math.PI * 2.4 * t + Math.PI/3) * 0.35; // Dicrotic notch approximation
        val += (Math.random() - 0.5) * 0.05; // Sensor noise
        points.unshift(val);
    }
    return points;
}
