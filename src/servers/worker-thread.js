const { lightWorkload, heavyWorkload } = require('./workloads');
const express = require('express');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

let ready = false;
let workerReady = false;

if (isMainThread) {
    const app = express();
    const worker = new Worker(__filename, {
        workerData: { type: 'worker' }
    });
    worker.on('online', () => {
        workerReady = true;
        ready = true;
    });
    app.get('/light', async (req, res) => {
        worker.postMessage({ type: 'light' });
        worker.once('message', result => {
            res.json({ result });
        });
    });
    app.get('/heavy', async (req, res) => {
        worker.postMessage({ type: 'heavy' });
        worker.once('message', result => {
            res.json({ result });
        });
    });
    app.get('/health', async (req, res) => {
        if (ready) {
            res.status(200).send('OK');
        } else {
            res.status(503).send('NOT READY');
        }
    });
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Worker thread server is running on port ${PORT}`);
    });
} else {
    parentPort.on('message', async (message) => {
        let result = 0;
        if (message.type === 'light') {
            result = await lightWorkload();
        } else if (message.type === 'heavy') {
            result = await heavyWorkload();
        }
        parentPort.postMessage(result);
    });
    // Health endpoint for worker
    const app = express();
    app.get('/health', async (req, res) => {
        res.status(200).send('OK');
    });
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        // No log needed for worker health
    });
}
