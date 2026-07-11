const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Register a new user
exports.register = async (req, res) => {
    if (!global.dbConnected) {
        return res.status(503).json({ error: "Database offline. Falling back to local offline demo mode." });
    }
    try {
        const { name, email, password, faceEmbedding } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "Missing required registration parameters" });
        }

        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ error: "User already exists with this email address" });
        }

        user = new User({ name, email, password, faceEmbedding });
        await user.save();

        // Sign token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({ token, user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error("Registration error:", err);
        return res.status(500).json({ error: "Internal server registry error" });
    }
};

// Biometric login using face mesh embedding distance
exports.biometricLogin = async (req, res) => {
    if (!global.dbConnected) {
        return res.status(503).json({ error: "Database offline. Falling back to local offline demo mode." });
    }
    try {
        const { faceEmbedding } = req.body;
        if (!faceEmbedding || !Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
            return res.status(400).json({ error: "Missing or invalid face embedding" });
        }

        // Fetch all users that have a face embedding registered
        const users = await User.find({ faceEmbedding: { $exists: true, $ne: null } });
        if (users.length === 0) {
            return res.status(401).json({ error: "No registered facial biometrics found" });
        }

        // Euclidean distance helper
        const getDistance = (v1, v2) => {
            if (v1.length !== v2.length) return Infinity;
            let sum = 0;
            for (let i = 0; i < v1.length; i++) {
                sum += Math.pow(v1[i] - v2[i], 2);
            }
            return Math.sqrt(sum);
        };

        let bestMatchUser = null;
        let minDistance = Infinity;
        const MATCH_THRESHOLD = 0.08; // Maximum Euclidean distance for a match

        for (const user of users) {
            if (!user.faceEmbedding || user.faceEmbedding.length === 0) continue;
            const distance = getDistance(faceEmbedding, user.faceEmbedding);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatchUser = user;
            }
        }

        if (bestMatchUser && minDistance < MATCH_THRESHOLD) {
            // Sign token
            const token = jwt.sign({ userId: bestMatchUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
            return res.json({ 
                token, 
                user: { name: bestMatchUser.name, email: bestMatchUser.email },
                biometricDistance: minDistance
            });
        }

        return res.status(401).json({ error: "Face biometric match failed. Try again or login with email." });
    } catch (err) {
        console.error("Biometric login error:", err);
        return res.status(500).json({ error: "Internal server biometric login error" });
    }
};

// Login user
exports.login = async (req, res) => {
    if (!global.dbConnected) {
        return res.status(503).json({ error: "Database offline. Falling back to local offline demo mode." });
    }
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Missing email or password" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Sign token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal login verification error" });
    }
};

// JWT Verification Middleware
exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    
    // Fallback to query parameter token (crucial for window.open PDF downloads)
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: "Authentication token is missing" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(403).json({ error: "Authentication token is invalid or expired" });
    }
};
