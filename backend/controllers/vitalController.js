const VitalLog = require('../models/VitalLog');

// Save a vital sign log entry
exports.saveSessionLog = async (req, res) => {
    try {
        const { heartRate, respirationRate, spo2, stress, rmssd, sdnn, blinkCount, blinkRate, stressLabel, confidence } = req.body;
        
        if (
            heartRate === undefined || 
            respirationRate === undefined || 
            spo2 === undefined || 
            stress === undefined || 
            rmssd === undefined || 
            sdnn === undefined || 
            blinkCount === undefined || 
            confidence === undefined
        ) {
            return res.status(400).json({ error: "Missing required vital metrics parameters" });
        }

        if (!global.dbConnected) {
            const mockLog = {
                _id: 'mocklog' + Math.random().toString(16).substring(2, 22),
                userId: req.userId,
                timestamp: new Date(),
                heartRate,
                respirationRate,
                spo2,
                stress,
                rmssd,
                sdnn,
                blinkCount,
                blinkRate: blinkRate || 0,
                stressLabel: stressLabel || 'CALM / BASELINE',
                confidence
            };
            global.inMemoryLogs.unshift(mockLog);
            return res.status(201).json({ message: "Vitals logged successfully (Local Memory Mode)", log: mockLog });
        }

        const log = new VitalLog({
            userId: req.userId,
            heartRate,
            respirationRate,
            spo2,
            stress,
            rmssd,
            sdnn,
            blinkCount,
            blinkRate: blinkRate || 0,
            stressLabel: stressLabel || 'CALM / BASELINE',
            confidence
        });

        await log.save();
        return res.status(201).json({ message: "Vitals logged successfully", log });
    } catch (err) {
        console.error("Vitals log save error:", err);
        return res.status(500).json({ error: "Internal server vital logger error" });
    }
};

// Get last 50 entries for historic trends
exports.getHistoricalTrends = async (req, res) => {
    try {
        if (!global.dbConnected) {
            const trends = global.inMemoryLogs.filter(log => log.userId === req.userId);
            return res.json(trends.slice(0, 50));
        }
        const trends = await VitalLog.find({ userId: req.userId })
            .sort({ timestamp: -1 })
            .limit(50);
        return res.json(trends);
    } catch (err) {
        console.error("Historical trends fetch error:", err);
        return res.status(500).json({ error: "Internal server trends query error" });
    }
};

// Get the latest vital signs log
exports.getLatestVitals = async (req, res) => {
    try {
        if (!global.dbConnected) {
            const trends = global.inMemoryLogs.filter(log => log.userId === req.userId);
            if (trends.length === 0) {
                return res.status(404).json({ error: "No telemetry records found for this user" });
            }
            return res.json(trends[0]);
        }
        const latest = await VitalLog.findOne({ userId: req.userId })
            .sort({ timestamp: -1 });
        if (!latest) {
            return res.status(404).json({ error: "No telemetry records found for this user" });
        }
        return res.json(latest);
    } catch (err) {
        console.error("Latest vitals fetch error:", err);
        return res.status(500).json({ error: "Internal server vital query error" });
    }
};
