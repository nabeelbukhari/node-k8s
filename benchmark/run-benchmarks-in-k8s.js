const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const fetch = (...args) =>
  import('node-fetch').then((mod) => mod.default(...args));
const { execSync } = require('child_process');
const argv = require('minimist')(process.argv.slice(2));
const { sleep } = require('../src/benchmark-utils');
const { loadTypes, serverTypes } = require('../src/benchmark-config');

const configs = require('./benchmark-configs');

const patchPath = path.join(__dirname, '../deploy/resources-patch.yaml');
const kustomizeDir = path.join(__dirname, '../deploy');
const serverUrl = 'http://localhost:3000'; // Update if service is exposed differently

let saveAsFlat = true; // Save results in flat structure by default

// Default benchmark parameters
const defaultParams = {
  workerThreads: 20,
  duration: 20,
  connections: 30,
  warmupSeconds: 5,
  servertype: 'single',
  'rollout-wait': 2500,
};

function getParam(name) {
  return argv[name] !== undefined ? argv[name] : defaultParams[name];
}

// Determine which server types to run (from CLI or default to 'single')
function getServerTypesToTest() {
  console.log(`\n=== Input for serverType: ${getParam('servertype')} ===`);
  if (argv.servertype) {
    const types = argv.servertype.split(',').map((s) => s.trim());
    return serverTypes.filter((st) => types.includes(st.value));
  }
  return serverTypes.filter((st) => st.value === 'single');
}

// Run a single benchmark for a specific server type and load type
async function runSingleBenchmark({
  serverType,
  loadType,
  requests,
  serverUrl,
  params,
}) {
  const runId = `run-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const benchmark = {
    serverType,
    loadType,
    workerThreads: params.workerThreads,
    duration: params.duration,
    connections: params.connections,
    warmupSeconds: params.warmupSeconds,
    runId,
  };
  console.log(`    -> Running loadType: ${loadType}`);
  // Open WebSocket connection
  const wsUrl = serverUrl.replace('http', 'ws');
  const ws = new WebSocket(wsUrl);
  let done = false;
  let error = null;
  let summary = '';
  ws.on('open', async () => {
    ws.send(JSON.stringify({ runId }));
    // Start the benchmark via HTTP POST
    await fetch(`${serverUrl}/api/run-benchmark-socket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(benchmark),
    });
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.phase === 'error') {
        error = msg.error || 'Unknown error';
        done = true;
        ws.close();
      } else if (msg.phase === 'warmup') {
        process.stdout.write('    -> [warmup] ');
      } else if (msg.phase === 'load-test') {
        process.stdout.write('    -> [load-test] ');
      } else if (msg.phase === 'all' && msg.status === 'complete') {
        summary = JSON.stringify(msg.results, null, 2);
        done = true;
        ws.close();
      } else if (msg.text) {
        process.stdout.write(` ${msg.text} `);
      } else if (msg.progress) {
        process.stdout.write(` ${msg.progress} `);
      }
    } catch (e) {
      process.stdout.write('    -> [msg parse error] ' + e.message);
    }
  });
  ws.on('error', (e) => {
    error = e.message || 'WebSocket error';
    done = true;
  });
  ws.on('close', () => {
    done = true;
  });
  // Wait for completion
  while (!done) {
    await sleep(500);
  }
  if (error) {
    console.error(`    -> Error for loadType ${loadType}:`, error);
    return null;
  } else {
    return saveResults(requests, serverType, params, loadType, summary);
  }
}

// Save results to a file
// If saveAsFlat is true, results are saved in a flat structure
// If false, results are saved in a nested structure based on serverType and loadType
function saveResults(requests, serverType, params, loadType, summary) {
  let resourceType, resultsDir;
  const isSingleProcess = serverType === 'single';
  // Determine results directory based on saveAsFlat flag
  if (saveAsFlat) {
    // Determine resourceType string for filename
    resourceType = `cpu${requests.cpu.replace(/[^a-zA-Z0-9]/g, '')}_mem${requests.memory.replace(/[^a-zA-Z0-9]/g, '')}_workers${isSingleProcess ? 1 : params.workerThreads}_${serverType}`;
    resultsDir = path.join(__dirname, 'results', loadType);
  } else {
    resourceType = `cpu${requests.cpu.replace(/[^a-zA-Z0-9]/g, '')}_mem${requests.memory.replace(/[^a-zA-Z0-9]/g, '')}_workers${isSingleProcess ? 1 : params.workerThreads}`;
    resultsDir = path.join(__dirname, 'results', serverType, loadType);
  }
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const filePath = path.join(resultsDir, `${resourceType}.json`);
  fs.writeFileSync(filePath, summary, 'utf8');
  console.log(
    `\n    -> Results for loadType ${loadType} saved to: ${filePath}`,
  );
  return filePath;
}

// Apply Kubernetes patch and rollout the deployment
async function applyK8sPatchAndRollout(requests, limits, workers) {
  // 1. Write the patch file
  const patch = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: node-k8s-loadtest\nspec:\n  template:\n    spec:\n      containers:\n        - name: node-k8s-loadtest\n          resources:\n            requests:\n              cpu: \"${requests.cpu}\"\n              memory: \"${requests.memory}\"\n            limits:\n              cpu: \"${limits.cpu}\"\n              memory: \"${limits.memory}\"\n          env:\n            - name: WORKER_THREADS\n              value: \"${workers || 2}\"\n`;
  fs.writeFileSync(patchPath, patch);

  // 2. Apply kustomize
  execSync(`kubectl apply -k ${kustomizeDir}`, { stdio: 'inherit' });
  await sleep(firstRun ? 5000 : getParam('rollout-wait')); // Wait for kustomize to apply

  // 3. Wait for rollout
  execSync('kubectl rollout status deployment/node-k8s-loadtest', {
    stdio: 'inherit',
  });

  // Wait for deployment to stabilize
  await sleep(getParam('rollout-wait'));
}

// Main function to run the benchmarks
async function runBenchmark() {
  let benchmarkCompleted = false;
  const serverType = getServerTypesToTest();
  for (const st of serverType) {
    console.log(`\n=== Running for serverType: ${st.label} ===`);
    firstRun = true; // Reset firstRun for each execution
    const serverType = st.value;
    for (const { requests, limits, workers } of configs) {
      console.log(
        `\n\n  -- Resource config: Requests: ${JSON.stringify(
          requests,
        )}, Limits: ${JSON.stringify(limits)}, Workers: ${workers || 2}`,
      );
      await applyK8sPatchAndRollout(requests, limits, workers);
      firstRun = false; // Set firstRun to false after the first execution
      // 4. Run all load types for this config
      for (const load of loadTypes) {
        await runSingleBenchmark({
          serverType,
          loadType: load.value,
          requests,
          serverUrl,
          params: {
            workerThreads: workers || getParam('workerThreads'),
            duration: getParam('duration'),
            connections: getParam('connections'),
            warmupSeconds: getParam('warmupSeconds'),
          },
        });
      }
    }

    // Mark benchmark as completed after all configs
    benchmarkCompleted = true;
  }
  if (benchmarkCompleted) {
    execSync(`kubectl delete -k ${kustomizeDir}`, { stdio: 'inherit' });
    console.log('\nAll benchmarks complete.');
  }
}

runBenchmark().catch((err) => {
  console.error('Error during benchmarking:', err);
  process.exit(1);
});
