const express = require('express');
const Piscina = require('piscina');
const path = require('path');

const app = express();
const PORT = 4000;
const cpuLength = require('os').cpus().length;
let lightRequestCount = 0;
let heavyRequestCount = 0;

// Create a Piscina pool using the worker-task.js file
const piscina = new Piscina({
  filename: path.resolve(__dirname, 'worker-task.js'),
  maxThreads: cpuLength, // Use all available CPUs by default
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
    `Piscina worker thread server with ${cpuLength} threads is running on port ${PORT}`,
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
