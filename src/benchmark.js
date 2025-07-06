const { spawn } = require('child_process');
const autocannon = require('autocannon');
const path = require('path');
const { defaultWorkerThreads } = require('./servers/config');
const { serverTypes, loadTypes } = require('./benchmark-config');
const { sleep } = require('./benchmark-utils');

// Refactored: runBenchmark now takes an options object and does not handle CLI or web-specific logic.
async function runBenchmark(options) {
  const {
    serverType,
    loadType,
    duration,
    connections,
    warmupSeconds,
    isWarmup,
  } = options;
  const serverChoice =
    serverTypes.find((s) => s.value === serverType) || serverTypes[0];
  const lt = loadTypes.find((l) => l.value === loadType) || loadTypes[0];
  const loadChoice = { load: lt };

  // Start the selected server
  let server;
  let serverExited = false;
  let serverExitCode = null;
  console.log('[DEBUG] Spawning server from:', path.dirname(__filename));
  const serverPath = path.resolve(path.dirname(__filename), serverChoice.path);
  server = spawn('node', [serverPath], { stdio: 'inherit' });
  server.on('exit', (code) => {
    serverExited = true;
    serverExitCode = code;
  });

  // Wait for health endpoint
  let healthUrl = `http://localhost:${serverChoice.port}/health`;
  await waitForHealthWithProcessCheck(
    server,
    serverExited,
    serverExitCode,
    healthUrl,
  );

  // Run warmup phase
  if (isWarmup && warmupSeconds > 0) {
    await runPhase({
      url: healthUrl.replace('/health', ''),
      connections,
      duration: warmupSeconds,
      load: loadChoice.load,
      phaseName: 'Warmup',
    });
  }
  if (isWarmup) {
    return { result: 'Warmup complete.' };
  }

  // Run load-test phase
  const result = await runPhase({
    url: healthUrl.replace('/health', ''),
    connections,
    duration,
    load: loadChoice.load,
    phaseName: 'Load-test',
  });

  if (server) server.kill();
  return result;
}

// Run both warmup and load-test in a single server lifecycle
async function runFullBenchmark(options, progressCb) {
  const {
    serverType,
    loadType,
    workerThreads,
    duration,
    connections,
    warmupSeconds,
    isCli,
  } = options;
  const serverChoice =
    serverTypes.find((s) => s.value === serverType) || serverTypes[0];
  const lt = loadTypes.find((l) => l.value === loadType) || loadTypes[0];
  const loadChoice = { load: lt };

  // Start the selected server
  let server;
  let serverExited = false;
  let serverExitCode = null;
  const serverPath = path.resolve(path.dirname(__filename), serverChoice.path);
  const workers =
    workerThreads || process.env.WORKER_THREADS || defaultWorkerThreads;
  console.log(
    `[DEBUG] Server path resolved to:${serverPath}, running with workers: ${workers}`,
  );
  server = spawn('node', [serverPath], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, WORKER_THREADS: String(workers) },
  });
  server.on('message', function (data) {
    console.log(`[DEBUG] Child process sent: ${data}`);
  });
  // Capture output
  server.on('exit', (code, signal) => {
    serverExited = true;
    serverExitCode = code;
    console.log(`[DEBUG] Server exited with code ${code}, signal ${signal}`);
  });
  server.on('error', (err) => {
    console.error('[DEBUG] Server process error:', err);
  });

  // Give server time to start
  await sleep(1000);

  // Wait for health endpoint
  let healthUrl = `http://localhost:${serverChoice.healthPort}/health`;
  console.log('[DEBUG] Waiting for health endpoint:', healthUrl);
  try {
    await waitForHealthWithProcessCheck(
      server,
      serverExited,
      serverExitCode,
      healthUrl,
    );
    console.log('[DEBUG] Health check passed.');
  } catch (e) {
    console.error('[DEBUG] Health check failed:', e);
    if (server) server.kill();
    throw e;
  }

  // Give server time to stabilize after health check
  await sleep(1000);

  let serverUrl = `http://localhost:${serverChoice.port}/`;
  // Run warmup phase
  let warmupResult = null;
  let warmupCliTable = null;
  if (progressCb) progressCb({ phase: 'warmup', status: 'starting' });
  if (warmupSeconds > 0) {
    console.log('[DEBUG] Starting warmup phase...');
    try {
      warmupResult = await runPhase({
        url: serverUrl,
        connections,
        duration: warmupSeconds,
        load: loadChoice.load,
        phaseName: 'Warmup',
      });
      warmupCliTable = isCli ? getCliTable(warmupResult) : {};
      console.log('[DEBUG] Warmup phase complete.');
    } catch (e) {
      console.error('[DEBUG] Warmup phase failed:', e);
      if (server) server.kill();
      throw e;
    }
  }

  if (progressCb) {
    progressCb({
      phase: 'warmup',
      status: 'complete',
      result: warmupResult,
      cliTable: warmupCliTable,
    });
  }

  // Run load-test phase
  let loadTestCliTable = null;
  if (progressCb) progressCb({ phase: 'load-test', status: 'starting' });
  console.log('[DEBUG] Starting load-test phase...');
  let result = null;
  try {
    result = await runPhase({
      url: serverUrl,
      connections,
      duration,
      load: loadChoice.load,
      phaseName: 'Load-test',
    });
    loadTestCliTable = isCli ? getCliTable(result) : {};
    console.log('[DEBUG] Load-test phase complete.');
  } catch (e) {
    console.error('[DEBUG] Load-test phase failed:', e);
    if (server) server.kill();
    throw e;
  }
  if (server) {
    console.log('[DEBUG] Killing server process...');
    server.send('shutdown'); // Notify server to shutdown gracefully

    // Wait for server to exit
    await sleep(2000);

    // If server has not exited, force kill it
    if (serverExited) {
      console.log(
        '[DEBUG] Server exited successfully with code:',
        serverExitCode,
      );
    } else if (server.kill('SIGKILL')) {
      console.log('[DEBUG] Server killed. Returning results.');
    }
  }

  if (progressCb)
    progressCb({
      phase: 'load-test',
      status: 'complete',
      result,
      cliTable: loadTestCliTable,
    });

  return {
    result,
    warmup: warmupResult,
    warmupCliTable,
    loadTestCliTable,
  };
}

// Helper: wait for health endpoint
async function waitForHealthWithProcessCheck(
  server,
  serverExited,
  serverExitCode,
  url,
  timeoutMs = 10000,
) {
  const http = require('http');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function check() {
      if (serverExited) {
        return reject(
          new Error(
            'Server process exited before health check passed. Exit code: ' +
              serverExitCode,
          ),
        );
      }
      http
        .get(url, (res) => {
          if (res.statusCode === 200) return resolve();
          if (Date.now() - start > timeoutMs) {
            return reject(new Error('Health check timeout'));
          }
          setTimeout(check, 200);
        })
        .on('error', () => {
          if (serverExited) {
            return reject(
              new Error(
                'Server process exited before health check passed. Exit code: ' +
                  serverExitCode,
              ),
            );
          }
          if (Date.now() - start > timeoutMs) {
            return reject(new Error('Health check timeout'));
          }
          setTimeout(check, 200);
        });
    })();
  });
}

// Utility to run a phase (warmup or load-test) with given settings
async function runPhase({ url, connections, duration, load, phaseName }) {
  const requests = [];
  if (load.light > 0) {
    requests.push({ method: 'GET', path: '/light', weight: load.light });
  }
  if (load.heavy > 0) {
    requests.push({ method: 'GET', path: '/heavy', weight: load.heavy });
  }
  console.log(
    `[DEBUG] Starting autocannon for phase: ${phaseName}, url: ${url}, connections: ${connections}, duration: ${duration}, load:`,
    load,
  );
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url,
        connections,
        duration,
        requests,
      },
      (err, result) => {
        if (err) {
          console.error(`[DEBUG] Autocannon error in phase ${phaseName}:`, err);
          return reject(err);
        }
        console.log(`[DEBUG] Autocannon completed for phase: ${phaseName}`);
        resolve(result);
      },
    );
  });
}

// Helper to get CLI-style table output from autocannon result
function getCliTable(result) {
  try {
    // autocannon.printResult returns a string table
    return autocannon.printResult(result, {
      renderResultsTable: true,
      renderLatencyTable: true,
    });
  } catch (e) {
    console.error('[DEBUG] Error generating CLI table:', e);
    return null;
  }
}

module.exports = { runBenchmark, runFullBenchmark };
