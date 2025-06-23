const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const fetch = (...args) =>
  import('node-fetch').then((mod) => mod.default(...args));
const { execSync } = require('child_process');
const { loadTypes, serverTypes } = require('../src/benchmark-config');
const { sleep } = require('../src/benchmark-utils');
const argv = require('minimist')(process.argv.slice(2));

// Resource configurations to test (applied to each server type)
const configs = [
  {
    requests: { cpu: '250m', memory: '256Mi' },
    limits: { cpu: '500m', memory: '512Mi' },
  },
  {
    requests: { cpu: '500m', memory: '512Mi' },
    limits: { cpu: '1000m', memory: '1Gi' },
  },
  {
    requests: { cpu: '1000m', memory: '1Gi' },
    limits: { cpu: '1200m', memory: '1Gi' },
  },
  {
    requests: { cpu: '1200m', memory: '1Gi' },
    limits: { cpu: '1500m', memory: '1Gi' },
  },
];

// Determine which server types to run (from CLI or default to 'single')
function getServerTypesToTest() {
  if (argv.servertype) {
    const types = argv.servertype.split(',').map((s) => s.trim());
    return serverTypes.filter((st) => types.includes(st.value));
  }
  return serverTypes.filter((st) => st.value === 'single');
}

const patchPath = path.join(__dirname, '../deploy/resources-patch.yaml');
const kustomizeDir = path.join(__dirname, '../deploy');
const serverUrl = 'http://localhost:3000'; // Update if service is exposed differently

// Default benchmark parameters
const defaultParams = {
  latencyThreshold: 100,
  duration: 10,
  connections: 10,
  warmupSeconds: 5,
  servertype: 'single',
  'rollout-wait': 2500,
};

function getParam(name) {
  return argv[name] !== undefined ? argv[name] : defaultParams[name];
}

let firstRun = true; // Track if this is the first run
async function runBenchmark() {
  for (const st of getServerTypesToTest()) {
    firstRun = true; // Reset firstRun for each execution
    const serverType = st.value;
    console.log(`\n=== Running for serverType: ${serverType} ===`);
    for (const { requests, limits } of configs) {
      console.log(
        `  -- Resource config: Requests: ${JSON.stringify(
          requests,
        )}, Limits: ${JSON.stringify(limits)}`,
      );
      // 1. Write the patch file
      const patch = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: node-k8s-loadtest\nspec:\n  template:\n    spec:\n      containers:\n        - name: node-k8s-loadtest\n          resources:\n            requests:\n              cpu: \"${requests.cpu}\"\n              memory: \"${requests.memory}\"\n            limits:\n              cpu: \"${limits.cpu}\"\n              memory: \"${limits.memory}\"\n`;
      fs.writeFileSync(patchPath, patch);
      // 2. Apply kustomize
      execSync(`kubectl apply -k ${kustomizeDir}`, { stdio: 'inherit' });
      await sleep(firstRun ? 5000 : getParam('rollout-wait')); // Wait for kustomize to apply
      // 3. Wait for rollout
      execSync('kubectl rollout status deployment/node-k8s-loadtest', {
        stdio: 'inherit',
      });
      await sleep(getParam('rollout-wait')); // Wait for deployment to stabilize
      firstRun = false; // Set firstRun to false after the first execution
      // 4. Run all load types for this config
      for (const load of loadTypes) {
        const runId = `run-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const benchmark = {
          serverType,
          loadType: load.value,
          latencyThreshold: getParam('latencyThreshold'),
          duration: getParam('duration'),
          connections: getParam('connections'),
          warmupSeconds: getParam('warmupSeconds'),
          runId,
        };
        console.log(`    -> Running loadType: ${load.value}`);
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
            process.stdout.write('    -> [msg parse error] ', e.message);
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
          console.error(`    -> Error for loadType ${load.value}:`, error);
        } else {
          // Determine resourceType string for filename
          const resourceType = `cpu${requests.cpu.replace(
            /[^a-zA-Z0-9]/g,
            '',
          )}_mem${requests.memory.replace(/[^a-zA-Z0-9]/g, '')}`;
          const resultsDir = path.join(
            __dirname,
            'benchmark-results',
            serverType,
            load.value,
          );
          if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
          }
          const filePath = path.join(resultsDir, `${resourceType}.json`);
          fs.writeFileSync(filePath, summary, 'utf8');
          console.log(
            `\n    -> Results for loadType ${load.value} saved to: ${filePath}`,
          );
        }
      }
    }
  }
  execSync(`kubectl delete -k ${kustomizeDir}`, { stdio: 'inherit' });
  console.log('\nAll benchmarks complete.');
}

runBenchmark().catch((err) => {
  console.error('Error during benchmarking:', err);
  process.exit(1);
});
