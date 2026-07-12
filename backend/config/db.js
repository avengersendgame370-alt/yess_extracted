const mongoose = require('mongoose');

const connectDB = async () => {
    global.dbConnected = false;
    global.inMemoryUsers = [
        {
            _id: '654321098765432109876543',
            name: 'Demo Subject',
            email: 'demo@vitalsense.ai',
            password: 'password',
            faceEmbedding: null
        }
    ];
    global.inMemoryLogs = [];

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000 // Timeout fast if DB is down
        });
        global.dbConnected = true;
        console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.warn(`[Database WARNING] MongoDB connection failed: ${error.message}`);
        console.warn(`[Database WARNING] Server will operate in memory-only mode. Historical logging is active.`);
    }
};

module.exports = connectDB;
