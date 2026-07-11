const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const authController = require('../controllers/authController');
const vitalController = require('../controllers/vitalController');
const reportController = require('../controllers/reportController');

// DroidCam Stream Proxy (prevents CORS / Canvas Tainting issues)
router.get('/droidcam-proxy', (req, res) => {
    const streamUrl = req.query.url;
    if (!streamUrl) {
        return res.status(400).send("Missing DroidCam URL");
    }

    const proxyRequest = (urlStr) => {
        try {
            const isHttps = urlStr.startsWith('https');
            const client = isHttps ? https : http;
            const parsedUrl = new URL(urlStr);
            
            client.get(parsedUrl.href, { rejectUnauthorized: false }, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            }).on('error', (err) => {
                // If SSL/handshake error occurs on HTTPS, try falling back to HTTP
                if (isHttps && (err.code === 'EPROTO' || err.message.includes('SSL') || err.message.includes('tls') || err.code === 'ECONNRESET')) {
                    const fallbackUrl = urlStr.replace(/^https:/, 'http:');
                    console.log(`[DroidCam Proxy] SSL error on ${urlStr}. Retrying with HTTP fallback: ${fallbackUrl}`);
                    proxyRequest(fallbackUrl);
                } else {
                    console.error("[DroidCam Proxy] Error connecting to DroidCam:", err.message);
                    res.status(500).send(`Failed to connect to DroidCam: ${err.message}`);
                }
            });
        } catch (err) {
            res.status(500).send("Invalid DroidCam URL format");
        }
    };

    proxyRequest(streamUrl);
});

// Authentication endpoints
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/biometric-login', authController.biometricLogin);

// Vitals logging endpoints (Protected)
router.post('/vitals/log', authController.verifyToken, vitalController.saveSessionLog);
router.get('/vitals/history', authController.verifyToken, vitalController.getHistoricalTrends);
router.get('/vitals/latest', authController.verifyToken, vitalController.getLatestVitals);

// Report generation endpoints (Protected)
router.get('/report', authController.verifyToken, reportController.generatePDFReport);

module.exports = router;
