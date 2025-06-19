const express = require('express');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.WEB_UI_PORT || 4000;

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
  res.json([
    { value: 'single', label: 'Single Process' },
    { value: 'worker', label: 'Worker Threads' },
    { value: 'cluster', label: 'Cluster' }
  ]);
});

// API to get load types
app.get('/api/load-types', (req, res) => {
  res.json([
    { value: '10-90', label: '10% light / 90% heavy' },
    { value: '20-80', label: '20% light / 80% heavy' },
    { value: '30-70', label: '30% light / 70% heavy' },
    { value: '40-60', label: '40% light / 60% heavy' },
    { value: '50-50', label: '50% light / 50% heavy' },
    { value: '60-40', label: '60% light / 40% heavy' },
    { value: '70-30', label: '70% light / 30% heavy' },
    { value: '80-20', label: '80% light / 20% heavy' },
    { value: '90-10', label: '90% light / 10% heavy' },
    { value: '100-0', label: '100% light / 0% heavy' }
  ]);
});

// API to get run state
app.get('/api/run-state/:runId', (req, res) => {
  const runId = req.params.runId;
  res.json({ state: runStates[runId] || 'unknown' });
});

// API to run benchmark (with runId and state tracking, now supports warmup and load-test phases)
app.post('/api/run-benchmark', (req, res) => {
  const runId = req.body.runId || randomUUID();
  const { serverType, loadType, latencyThreshold, duration, connections, warmupSeconds, phase } = req.body;
  runStates[runId] = phase === 'warmup' ? 'warming-up' : 'running-benchmark';
  fs.writeFileSync(path.join(__dirname, 'user-selection.json'), JSON.stringify({ serverType, loadType, latencyThreshold, duration, connections, warmupSeconds }));
  let cmd = `node src/benchmark.js --web`;
  if (phase === 'warmup') {
    cmd += ` --warmup`;
  }
  if (runId) {
    cmd += ` --run-id ${runId}`;
  }
  const parts = cmd.split(' ');
  const child = spawn(parts[0], parts.slice(1), { cwd: path.join(__dirname, '..') });
  let output = '';
  child.stdout && child.stdout.on('data', (data) => { output += data.toString(); });
  child.stderr && child.stderr.on('data', (data) => { output += data.toString(); });
  child.on('close', (code) => {
    if (phase === 'warmup') {
      runStates[runId] = 'warmup-complete';
      runStates[`${runId}-result`] = 'Warmup complete.';
    } else {
      runStates[runId] = 'processing-results';
      let result = output;
      try {
        const match = output.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          result = parsed.text || JSON.stringify(parsed.summary, null, 2);
        }
      } catch (e) {}
      runStates[runId] = 'done';
      runStates[`${runId}-result`] = result;
    }
  });
  res.json({ runId });
});

// API to get benchmark result by runId
app.get('/api/run-result/:runId', (req, res) => {
  const runId = req.params.runId;
  if (runStates[runId] === 'done') {
    res.json({ output: runStates[`${runId}-result`] });
    delete runStates[runId];
    delete runStates[`${runId}-result`];
  } else {
    res.json({ output: null });
  }
});

// API to run batch benchmark (all load types for a selected server, with runId and state tracking)
app.post('/api/run-batch-benchmark', (req, res) => {
  const runId = req.body.runId || randomUUID();
  runStates[runId] = 'warming-up';
  const { serverType, latencyThreshold, duration, connections, warmupSeconds } = req.body;
  const loadTypes = [
    '10-90', '20-80', '30-70', '40-60', '50-50',
    '60-40', '70-30', '80-20', '90-10', '100-0'
  ];
  // Start async batch benchmark process
  (async () => {
    runStates[runId] = 'warming-up';
    const results = [];
    for (let i = 0; i < loadTypes.length; i++) {
      const loadType = loadTypes[i];
      runStates[runId] = `warming-up (${i+1}/${loadTypes.length})`;
      fs.writeFileSync(
        path.join(__dirname, 'user-selection.json'),
        JSON.stringify({ serverType, loadType, latencyThreshold, duration, connections, warmupSeconds })
      );
      runStates[runId] = `running-benchmark (${i+1}/${loadTypes.length})`;
      try {
        const output = await new Promise((resolve) => {
          exec('node src/benchmark.js --web', { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
            runStates[runId] = `processing-results (${i+1}/${loadTypes.length})`;
            let text = stdout;
            try {
              const match = stdout.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                text = parsed.text || JSON.stringify(parsed.summary, null, 2);
              }
            } catch (e) {}
            resolve({ loadType, text });
          });
        });
        results.push(output);
      } catch (e) {
        results.push({ loadType, error: e.message });
      }
    }
    runStates[runId] = 'done';
    runStates[`${runId}-result`] = results;
  })();
  res.json({ runId });
});

// API to get batch benchmark result by runId
app.get('/api/batch-run-result/:runId', (req, res) => {
  const runId = req.params.runId;
  if (runStates[runId] === 'done') {
    res.json({ results: runStates[`${runId}-result`] });
    delete runStates[runId];
    delete runStates[`${runId}-result`];
  } else {
    res.json({ results: null });
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

app.listen(PORT, () => {
  console.log(`Web UI running at http://localhost:${PORT}`);
});
