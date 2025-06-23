const express = require('express');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { runBenchmark } = require('./benchmark');
const { Worker } = require('worker_threads');
const { serverTypes, loadTypes } = require('./benchmark-config');

const app = express();
const PORT = process.env.WEB_UI_PORT || 3000;
const httpServer = require('http').createServer(app);
const WebSocket = require('ws');

// WebSocket server
const wss = new WebSocket.Server({ server: httpServer });
const wsClients = {};
const runningWorkers = {};

wss.on('connection', (ws, req) => {
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.runId) wsClients[data.runId] = ws;
      // Handle cancel message
      if (data.cancel && data.runId && runningWorkers[data.runId]) {
        console.log(`[INFO] User cancelled benchmark for runId: ${data.runId}`);
        runningWorkers[data.runId].terminate();
        delete runningWorkers[data.runId];
        if (wsClients[data.runId]) wsClients[data.runId].send(JSON.stringify({ phase: 'cancelled', runId: data.runId }));
      }
    } catch {}
  });
  ws.on('close', () => {
    for (const [runId, client] of Object.entries(wsClients)) {
      if (client === ws) delete wsClients[runId];
    }
  });
});

// Ensure the public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

app.use(express.json());
app.use(express.static(publicDir));

// In-memory run state store
const runStates = {};

// API to get available server types
app.get('/api/server-types', (req, res) => {
  res.json(serverTypes.map(({ value, label }) => ({ value, label })));
});

// API to get load types
app.get('/api/load-types', (req, res) => {
  res.json(loadTypes.map(({ value, label }) => ({ value, label })));
});

// New API: run warmup and load-test in one go, streaming updates via WebSocket, using benchmark.js in a worker thread
app.post('/api/run-benchmark-socket', async (req, res) => {
  const runId = req.body.runId || randomUUID();
  res.json({ runId }); // Respond immediately
  const ws = wsClients[runId];
  function sendWS(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  // Start benchmark in a worker thread
  const worker = new Worker(path.join(__dirname, 'benchmark-worker.js'), {
    workerData: req.body
  });
  runningWorkers[runId] = worker;
  worker.on('message', (msg) => {
    sendWS(msg);
  });
  worker.on('error', (err) => {
    sendWS({ phase: 'error', error: err.message });
  });
  worker.on('exit', (code) => {
    delete runningWorkers[runId];
    if (code !== 0) {
      sendWS({ phase: 'error', error: `Worker stopped with exit code ${code}` });
    }
  });
});

// New API: run batch benchmark with WebSocket progress and summary results
app.post('/api/run-batch-benchmark-socket', async (req, res) => {
  const runId = req.body.runId || randomUUID();
  res.json({ runId }); // Respond immediately
  const ws = wsClients[runId];
  function sendWS(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  const { serverType, latencyThreshold, duration, connections, warmupSeconds } = req.body;
  // Use the same loadTypes as the rest of the app
  const batchLoadTypes = loadTypes.map(l => l.value);
  const results = [];

  // Start batch in a worker thread for cancellation support
  const worker = new Worker(path.join(__dirname, 'benchmark-worker.js'), {
    workerData: { batch: true, serverType, latencyThreshold, duration, connections, warmupSeconds, batchLoadTypes }
  });
  runningWorkers[runId] = worker;
  worker.on('message', (msg) => {
    sendWS(msg);
  });
  worker.on('error', (err) => {
    sendWS({ phase: 'error', error: err.message });
  });
  worker.on('exit', (code) => {
    delete runningWorkers[runId];
    if (code !== 0) {
      sendWS({ phase: 'error', error: `Worker stopped with exit code ${code}` });
    }
  });
});

// Cancel endpoint for REST (optional, for non-WS clients)
app.post('/api/cancel-benchmark', (req, res) => {
  const { runId } = req.body;
  if (runId && runningWorkers[runId]) {
    runningWorkers[runId].terminate();
    delete runningWorkers[runId];
    res.json({ cancelled: true });
  } else {
    res.json({ cancelled: false });
  }
});

// Serve the frontend (fix: do not use wildcard route, only serve index.html for root or unknown static files)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 404 for all other API or unknown routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' });
  } else {
    res.status(404).send('Not found');
  }
});

httpServer.listen(PORT, () => {
  console.log(`Web UI running at http://localhost:${PORT}`);
});
