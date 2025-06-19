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

  document.getElementById('benchmark-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const serverType = document.getElementById('serverType').value;
    const loadType = document.getElementById('loadType').value;
    const latencyThreshold = document.getElementById('latencyThreshold').value;
    const duration = document.getElementById('duration').value;
    const connections = document.getElementById('connections').value;
    const warmupSeconds = document.getElementById('warmupSeconds').value;
    const output = document.getElementById('output');
    const runId = generateRunId();
    output.textContent = 'Warming up...';
    // 1. Warmup phase
    let warmupRes = await fetch('/api/run-benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverType, loadType, latencyThreshold, duration, connections, warmupSeconds, runId, phase: 'warmup' })
    });
    let warmupData = await warmupRes.json();
    // Poll for warmup completion
    let warmupDone = false;
    let warmupPoll = setInterval(async () => {
      const stateRes = await fetch(`/api/run-state/${runId}`);
      const stateData = await stateRes.json();
      if (stateData.state === 'warmup-complete') {
        clearInterval(warmupPoll);
        warmupDone = true;
        output.textContent = 'Warmup complete. Running benchmark...';
        // 2. Load-test phase
        let testRes = await fetch('/api/run-benchmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverType, loadType, latencyThreshold, duration, connections, warmupSeconds, runId, phase: 'load-test' })
        });
        let testData = await testRes.json();
        // Poll for test completion
        let testPoll = setInterval(async () => {
          const stateRes2 = await fetch(`/api/run-state/${runId}`);
          const stateData2 = await stateRes2.json();
          if (stateData2.state === 'processing-results') {
            output.textContent = 'Processing results...';
          }
          if (stateData2.state === 'done') {
            clearInterval(testPoll);
            // Fetch result
            const resultRes = await fetch(`/api/run-result/${runId}`);
            const resultData = await resultRes.json();
            output.textContent = resultData.output || 'No result.';
          }
        }, 1000);
      }
    }, 1000);
  });

  // Handle batch benchmark form submission with runId and polling
  document.getElementById('batch-benchmark-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const serverType = document.getElementById('batchServerType').value;
    const latencyThreshold = document.getElementById('batchLatencyThreshold').value;
    const duration = document.getElementById('batchDuration').value;
    const connections = document.getElementById('batchConnections').value;
    const warmupSeconds = document.getElementById('batchWarmupSeconds').value;
    const batchOutput = document.getElementById('batchOutput');
    const runId = generateRunId();
    batchOutput.textContent = 'Starting batch benchmark...';
    // Start the batch benchmark and get runId
    const res = await fetch('/api/run-batch-benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverType, latencyThreshold, duration, connections, warmupSeconds, runId })
    });
    const data = await res.json();
    // Poll for state and result
    let lastState = '';
    let pollInterval = setInterval(async () => {
      const stateRes = await fetch(`/api/run-state/${runId}`);
      const stateData = await stateRes.json();
      if (stateData.state && stateData.state !== lastState) {
        lastState = stateData.state;
        batchOutput.textContent = lastState.replace(/\((\d+\/\d+)\)/, (m, p1) => ` [${p1}]`) + '...';
      }
      if (lastState === 'done') {
        clearInterval(pollInterval);
        // Fetch result
        const resultRes = await fetch(`/api/batch-run-result/${runId}`);
        const resultData = await resultRes.json();
        if (resultData.results) {
          batchOutput.textContent = resultData.results.map(r => `Load: ${r.loadType}\n${r.text || r.error}\n`).join('\n---\n');
        } else {
          batchOutput.textContent = 'No result.';
        }
      }
    }, 1000);
  });

  // No toggle button logic needed for <details> collapsible sections
});
