const express = require('express');
const Piscina = require('piscina');
const path = require('path');
const { defaultWorkerThreads } = require('./config');

const app = express();

const PORT = 4000;
const threadCount = process.env.WORKER_THREADS
  ? parseInt(process.env.WORKER_THREADS, 10)
  : require('os').cpus().length || defaultWorkerThreads;
let lightRequestCount = 0;
let heavyRequestCount = 0;

// Create a Piscina pool using the worker-task.js file
const piscina = new Piscina({
  filename: path.resolve(__dirname, 'worker-task.js'),
  minThreads: threadCount, // Always use all available CPUs by default
  idleTimeout: 10000, // Close idle threads after 10 seconds
});

app.get('/light', async (req, res) => {
  try {
    const result = await piscina.run('light');
    res.json({ result });
    lightRequestCount++;
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/heavy', async (req, res) => {
  try {
    const result = await piscina.run('heavy');
    res.json({ result });
    heavyRequestCount++;
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  if (piscina.threads.length > 0) {
    res.status(200).send('OK');
  } else {
    res.status(503).send('NOT READY');
  }
});

app.listen(PORT, () => {
  console.log(
    `Piscina worker thread server with ${threadCount} threads is running on port ${PORT}`,
  );
});

// Notify parent process that server is ready
process.send && process.send('ready');

// Listen for SIGINT and SIGTERM to handle graceful shutdown
const shutdown = () => {
  console.log('Received shutdown signal. Shutting down gracefully...');
  console.log(
    `Processed ${lightRequestCount} light requests and ${heavyRequestCount} heavy requests.`,
  );
  ready = false; // Set ready to false to prevent new requests
  piscina.close({ force: true }).then(() => {
    console.log('Server shutdown complete.');
    process.exit(0);
  });
};

process.on('message', (msg) => {
  if (msg === 'shutdown') {
    shutdown();
  }
});
