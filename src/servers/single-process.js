const express = require('express');
const app = express();
const { lightWorkload, heavyWorkload } = require('./workloads');

let ready = true; // single process is always ready after startup

// Light CPU task - should complete within 50ms
app.get('/light', async (req, res) => {
    const result = await lightWorkload();
    res.json({ result });
});

// Heavy CPU task - should take more than 300ms
app.get('/heavy', async (req, res) => {
    const result = await heavyWorkload();
    res.json({ result });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    if (ready) {
        res.status(200).send('OK');
    } else {
        res.status(503).send('NOT READY');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Single process server is running on port ${PORT}`);
});
