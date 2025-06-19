document.addEventListener('DOMContentLoaded', () => {
  // Populate server type dropdown
  fetch('/api/server-types')
    .then(res => res.json())
    .then(types => {
      const select = document.getElementById('serverType');
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        select.appendChild(opt);
      });
    });

  // Populate batch server type dropdown
  fetch('/api/server-types')
    .then(res => res.json())
    .then(types => {
      const select = document.getElementById('batchServerType');
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        select.appendChild(opt);
      });
    });

  // Populate load type dropdown for single benchmark
  fetch('/api/load-types')
    .then(res => res.json())
    .then(types => {
      const select = document.getElementById('loadType');
      select.innerHTML = '';
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        select.appendChild(opt);
      });
      select.value = '100-0';
    });

  // Utility to generate a random runId
  function generateRunId() {
    return 'run-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
  }

  // Helper to render a summary table from stats object
  function renderSummaryTable(stats) {
    if (!stats || typeof stats !== 'object') return '';
    let rows = '';
    for (const [k, v] of Object.entries(stats)) {
      let displayValue = v;
      if (typeof v === 'object' && v !== null) {
        displayValue = `<pre style='margin:0;'>${JSON.stringify(v, null, 2)}</pre>`;
      }
      rows += `<tr><td>${k}</td><td>${displayValue}</td></tr>`;
    }
    return `<table border='1' style='border-collapse:collapse;'><tbody>${rows}</tbody></table>`;
  }

  // --- SINGLE BENCHMARK FORM (WebSocket-based) ---
  let singleWs = null;
  let singleBenchmarkRunning = false;
  let singleRunId = null;
  const runBtn = document.querySelector('#benchmark-form button[type="submit"]');

  document.getElementById('benchmark-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (singleBenchmarkRunning) {
      // Stop requested
      if (singleWs && singleRunId) {
        singleWs.send(JSON.stringify({ runId: singleRunId, cancel: true }));
        singleWs.close();
      }
      singleBenchmarkRunning = false;
      runBtn.textContent = 'Run Benchmark';
      return;
    }
    const serverType = document.getElementById('serverType').value;
    const loadType = document.getElementById('loadType').value;
    const latencyThreshold = document.getElementById('latencyThreshold').value;
    const duration = document.getElementById('duration').value;
    const connections = document.getElementById('connections').value;
    const warmupSeconds = document.getElementById('warmupSeconds').value;
    const output = document.getElementById('output');
    singleRunId = generateRunId();
    output.value = 'Connecting...';
    runBtn.textContent = 'Stop';
    singleBenchmarkRunning = true;

    // 1. Open WebSocket and register runId
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}`;
    singleWs = new WebSocket(wsUrl);
    let wsOpen = false;
    let wsRegistered = false;
    let wsClosed = false;

    singleWs.onopen = () => {
      wsOpen = true;
      singleWs.send(JSON.stringify({ runId: singleRunId }));
      wsRegistered = true;
      // 2. Start the benchmark via HTTP POST
      fetch('/api/run-benchmark-socket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverType, loadType, latencyThreshold, duration, connections, warmupSeconds, runId: singleRunId })
      });
    };
    singleWs.onmessage = (event) => {
      try {
        console.log('[FRONTEND DEBUG] WS message:', event.data);
        const msg = JSON.parse(event.data);
        if (msg.phase === 'error') {
          output.value = 'Error: ' + (msg.error || 'Unknown error');
        } else if (msg.phase === 'warmup') {
          output.value = 'Warming up...';
        } else if (msg.phase === 'load-test') {
          output.value = 'Running benchmark...';
        } else if (msg.phase === 'results' && msg.results) {
          // Show summary as plain text
          let text = '';
          if (msg.results.warmup) {
            text += 'Warmup (Summary Table)\n' + renderSummaryText(msg.results.warmup) + '\n\n';
          }
          if (msg.results.result) {
            text += 'Load-test (Summary Table)\n' + renderSummaryText(msg.results.result);
          }
          output.value = text.trim();
        } else if (msg.phase === 'all' && msg.status === 'complete') {
          if (!output.value || output.value.trim() === '' || output.value === 'Benchmark complete.') {
            output.value = 'Benchmark complete.';
          }
        } else if (msg.text) {
          output.value = msg.text;
        } else if (msg.progress) {
          output.value = msg.progress;
        }
      } catch (e) {
        output.value = 'Error parsing server message.';
      }
    };
    singleWs.onerror = (e) => {
      output.value = 'WebSocket error.';
    };
    singleWs.onclose = () => {
      wsClosed = true;
      singleBenchmarkRunning = false;
      runBtn.textContent = 'Run Benchmark';
      if (!output.value.includes('complete')) {
        output.value += '\nConnection closed.';
      }
    };
  });

  // --- BATCH BENCHMARK FORM (WebSocket-based) ---
  let batchWs = null;
  let batchBenchmarkRunning = false;
  let batchRunId = null;
  const batchRunBtn = document.querySelector('#batch-benchmark-form button[type="submit"]');

  document.getElementById('batch-benchmark-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (batchBenchmarkRunning) {
      // Stop requested
      if (batchWs && batchRunId) {
        batchWs.send(JSON.stringify({ runId: batchRunId, cancel: true }));
        batchWs.close();
      }
      batchBenchmarkRunning = false;
      batchRunBtn.textContent = 'Run All Load Types';
      return;
    }
    const serverType = document.getElementById('batchServerType').value;
    const latencyThreshold = document.getElementById('batchLatencyThreshold').value;
    const duration = document.getElementById('batchDuration').value;
    const connections = document.getElementById('batchConnections').value;
    const warmupSeconds = document.getElementById('batchWarmupSeconds').value;
    const batchOutput = document.getElementById('batchOutput');
    batchRunId = generateRunId();
    batchOutput.value = 'Connecting...';
    batchRunBtn.textContent = 'Stop';
    batchBenchmarkRunning = true;

    // Open WebSocket and register runId
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}`;
    batchWs = new WebSocket(wsUrl);
    let results = [];
    batchWs.onopen = () => {
      batchWs.send(JSON.stringify({ runId: batchRunId }));
      // Start the batch benchmark via HTTP POST
      fetch('/api/run-batch-benchmark-socket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverType, latencyThreshold, duration, connections, warmupSeconds, runId: batchRunId })
      });
    };
    batchWs.onmessage = (event) => {
      try {
        console.log('[BATCH FRONTEND DEBUG] WS message:', event.data);
        const msg = JSON.parse(event.data);
        if (msg.phase === 'batch-progress') {
          batchOutput.value = msg.status;
        } else if (msg.phase === 'batch-result') {
          // Show each result as it comes in
          if (msg.summary) {
            results.push({ loadType: msg.loadType, summary: msg.summary });
            let text = results.map(r => `Load: ${r.loadType}\n${renderSummaryText(r.summary)}`).join('\n---\n');
            batchOutput.value = text;
          } else if (msg.error) {
            results.push({ loadType: msg.loadType, error: msg.error });
            let text = results.map(r => `Load: ${r.loadType}\n${r.error ? r.error : renderSummaryText(r.summary)}`).join('\n---\n');
            batchOutput.value = text;
          }
        } else if (msg.phase === 'batch-complete') {
          // Show all results at the end
          results = msg.results;
          let text = results.map(r => `Load: ${r.loadType}\n${r.error ? r.error : renderSummaryText(r.summary)}`).join('\n---\n');
          batchOutput.value = text;
        }
      } catch (e) {
        batchOutput.value = 'Error parsing server message.';
        console.error('[BATCH FRONTEND DEBUG] Error parsing WS message:', event.data, e);
      }
    };
    batchWs.onerror = (e) => {
      batchOutput.value = 'WebSocket error.';
    };
    batchWs.onclose = () => {
      batchBenchmarkRunning = false;
      batchRunBtn.textContent = 'Run All Load Types';
      if (!batchOutput.value.includes('complete')) {
        batchOutput.value += '\nConnection closed.';
      }
    };
  });

  // Helper to render summary as plain text for textarea
  function renderSummaryText(stats) {
    if (!stats || typeof stats !== 'object') return '';
    let lines = [];
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === 'object' && v !== null) {
        lines.push(`${k}: ${JSON.stringify(v, null, 2)}`);
      } else {
        lines.push(`${k}: ${v}`);
      }
    }
    return lines.join('\n');
  }
});
