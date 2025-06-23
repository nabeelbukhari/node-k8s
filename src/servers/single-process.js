const process = require('node:process');
const express = require('express');
const app = express();
const { lightWorkload, heavyWorkload } = require('./workloads');

let ready = true; // single process is always ready after startup
let lightRequestCount = 0;
let heavyRequestCount = 0;

// Light CPU task - should complete within 50ms
app.get('/light', async (req, res) => {
    const result = await lightWorkload();
    res.json({ result });
    lightRequestCount++;
});

// Heavy CPU task - should take more than 300ms
app.get('/heavy', async (req, res) => {
    const result = await heavyWorkload();
    res.json({ result });
    heavyRequestCount++;
});

// Health check endpoint
app.get('/health', async (req, res) => {
    if (ready) {
        res.status(200).send('OK');
    } else {
        res.status(503).send('NOT READY');
    }
});

const PORT = 4000;
const server = app.listen(PORT, () => {
    console.log(`Single process server is running on port ${PORT}`);
});

const sendMessage = (msg) => {
    if (process.send) {
        process.send(msg);
    } else {
        console.warn('Process does not support send method');
    }
};

// Listen for SIGINT and SIGTERM to handle graceful shutdown
const shutdown = () => {
    sendMessage('Received shutdown signal. Shutting down gracefully...');
    sendMessage(`Processed ${lightRequestCount} light requests and ${heavyRequestCount} heavy requests.`);
    ready = false; // Set ready to false to prevent new requests
    server.close(() => {
        sendMessage('Server shutdown complete.');
        process.exit(0);
    });
};

process.on('message', (msg) => {
    if (msg === 'shutdown') {
        shutdown();
    }
});

// Notify parent process that server is ready
sendMessage('ready');
