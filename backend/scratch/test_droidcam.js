const http = require('http');
const https = require('https');

const testUrl = (urlStr) => {
    return new Promise((resolve) => {
        console.log(`Testing: ${urlStr}`);
        const client = urlStr.startsWith('https') ? https : http;
        
        const req = client.get(urlStr, { rejectUnauthorized: false }, (res) => {
            console.log(`  => SUCCESS! Status: ${res.statusCode}`);
            resolve(true);
        });

        req.on('error', (err) => {
            console.log(`  => FAILED: ${err.message}`);
            resolve(false);
        });

        req.setTimeout(3000, () => {
            console.log(`  => TIMEOUT`);
            req.destroy();
            resolve(false);
        });
    });
};

async function run() {
    await testUrl("http://10.77.191.142:4747/");
    await testUrl("https://10.77.191.142:4747/");
    await testUrl("http://10.77.191.142:4747/video");
    await testUrl("https://10.77.191.142:4747/video");
}

run();
