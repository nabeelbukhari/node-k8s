const inquirer = require('inquirer');
const { spawn } = require('child_process');
const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

const serverTypes = {
    'single': 'src/servers/single-process.js',
    'worker': 'src/servers/worker-thread.js',
    'cluster': 'src/servers/cluster.js'
};

const loadTypes = [
    { name: '10% light / 90% heavy', light: 0.1, heavy: 0.9 },
    { name: '20% light / 80% heavy', light: 0.2, heavy: 0.8 },
    { name: '30% light / 70% heavy', light: 0.3, heavy: 0.7 },
    { name: '40% light / 60% heavy', light: 0.4, heavy: 0.6 },
    { name: '50% light / 50% heavy', light: 0.5, heavy: 0.5 },
    { name: '60% light / 40% heavy', light: 0.6, heavy: 0.4 },
    { name: '70% light / 30% heavy', light: 0.7, heavy: 0.3 },
    { name: '80% light / 20% heavy', light: 0.8, heavy: 0.2 },
    { name: '90% light / 10% heavy', light: 0.9, heavy: 0.1 },
    { name: '100% light / 0% heavy', light: 1.0, heavy: 0.0 }
];

// Support for warmup-only and run-id based server lifecycle
const args = process.argv.slice(2);
const isWeb = args.includes('--web');
const isWarmup = args.includes('--warmup');
let runId = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-id' && args[i + 1]) {
        runId = args[i + 1];
    }
}

// Track servers by runId for later kill
const serverPidsFile = path.join(__dirname, 'server-pids.json');
function saveServerPid(runId, pid) {
    let map = {};
    if (fs.existsSync(serverPidsFile)) {
        try { map = JSON.parse(fs.readFileSync(serverPidsFile, 'utf8')); } catch {}
    }
    map[runId] = pid;
    fs.writeFileSync(serverPidsFile, JSON.stringify(map));
}
function getServerPid(runId) {
    if (!fs.existsSync(serverPidsFile)) return null;
    try {
        const map = JSON.parse(fs.readFileSync(serverPidsFile, 'utf8'));
        return map[runId];
    } catch { return null; }
}
function removeServerPid(runId) {
    if (!fs.existsSync(serverPidsFile)) return;
    try {
        const map = JSON.parse(fs.readFileSync(serverPidsFile, 'utf8'));
        delete map[runId];
        fs.writeFileSync(serverPidsFile, JSON.stringify(map));
    } catch {}
}

let webSelection = null;
if (isWeb) {
    // Read user selection from temp file
    const selPath = path.join(__dirname, 'user-selection.json');
    if (fs.existsSync(selPath)) {
        webSelection = JSON.parse(fs.readFileSync(selPath, 'utf8'));
    }
}

async function runBenchmark() {
    let serverChoice, loadChoice;
    if (isWeb && webSelection) {
        serverChoice = { server: webSelection.serverType };
        const lt = loadTypes.find(l => l.name.startsWith(webSelection.loadType.replace('-', '% light / ') + '% heavy'))
            || loadTypes[0];
        loadChoice = { load: lt };
    } else {
        serverChoice = await inquirer.prompt([
            {
                type: 'list',
                name: 'server',
                message: 'Select server type to benchmark:',
                choices: [
                    { name: 'Single Process Server', value: 'single' },
                    { name: 'Worker Thread Server', value: 'worker' },
                    { name: 'Cluster Server', value: 'cluster' }
                ]
            }
        ]);

        loadChoice = await inquirer.prompt([
            {
                type: 'list',
                name: 'load',
                message: 'Select load distribution:',
                choices: loadTypes.map(lt => ({
                    name: lt.name,
                    value: lt
                }))
            }
        ]);
    }

    // Start the selected server
    let server;
    let startedServer = false;
    let serverExited = false;
    let serverExitCode = null;
    if (!isWarmup) {
        // If not warmup, check if server already running for this runId
        const existingPid = runId ? getServerPid(runId) : null;
        if (existingPid) {
            // Server already running, do not start again
        } else {
            server = spawn('node', [serverTypes[serverChoice.server]], { stdio: 'inherit' });
            if (runId) saveServerPid(runId, server.pid);
            startedServer = true;
            server.on('exit', (code, signal) => {
                serverExited = true;
                serverExitCode = code;
            });
        }
    } else {
        // Always start server for warmup as detached so it survives parent exit
        server = spawn('node', [serverTypes[serverChoice.server]], { detached: true, stdio: 'ignore' });
        server.unref();
        if (runId) saveServerPid(runId, server.pid);
        startedServer = true;
        // No exit handler for detached process (parent won't receive it)
    }

    // Helper: kill a detached server by PID
    function killDetachedServerByPid(pid) {
        if (!pid) return;
        try {
            process.kill(pid);
        } catch (e) {
            // Ignore if already dead
        }
    }

    // Capture server output for debugging
    let serverOutput = '';
    if (server) {
        if (server.stdout) server.stdout.on('data', d => { serverOutput += d.toString(); });
        if (server.stderr) server.stderr.on('data', d => { serverOutput += d.toString(); });
    }

    // Wait for health endpoint, but also monitor server process for early exit
    async function waitForHealthWithProcessCheck(url, timeoutMs = 10000) {
        const http = require('http');
        const start = Date.now();
        return new Promise((resolve, reject) => {
            (function check() {
                if (serverExited) {
                    console.error('--- Server process exited before health check passed. Output: ---\n' + serverOutput);
                    // Only kill server if not warmup
                    if (!isWarmup && server) try { server.kill(); } catch {}
                    // For detached server, kill by PID
                    if (!isWarmup && runId && getServerPid(runId)) killDetachedServerByPid(getServerPid(runId));
                    return reject(new Error('Server process exited before health check passed. Exit code: ' + serverExitCode));
                }
                http.get(url, res => {
                    if (res.statusCode === 200) return resolve();
                    if (Date.now() - start > timeoutMs) {
                        console.error('--- Health check timed out. Server output: ---\n' + serverOutput);
                        if (!isWarmup && server) try { server.kill(); } catch {}
                        if (!isWarmup && runId && getServerPid(runId)) killDetachedServerByPid(getServerPid(runId));
                        return reject(new Error('Health check timeout'));
                    }
                    setTimeout(check, 200);
                }).on('error', () => {
                    if (serverExited) {
                        console.error('--- Server process exited before health check passed. Output: ---\n' + serverOutput);
                        if (!isWarmup && server) try { server.kill(); } catch {}
                        if (!isWarmup && runId && getServerPid(runId)) killDetachedServerByPid(getServerPid(runId));
                        return reject(new Error('Server process exited before health check passed. Exit code: ' + serverExitCode));
                    }
                    if (Date.now() - start > timeoutMs) {
                        console.error('--- Health check timed out. Server output: ---\n' + serverOutput);
                        if (!isWarmup && server) try { server.kill(); } catch {}
                        if (!isWarmup && runId && getServerPid(runId)) killDetachedServerByPid(getServerPid(runId));
                        return reject(new Error('Health check timeout'));
                    }
                    setTimeout(check, 200);
                });
            })();
        });
    }

    // Helper: check if a process is alive (Windows)
    function isProcessAlive(pid) {
        try {
            const { execSync } = require('child_process');
            const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`).toString();
            return output.includes(pid.toString());
        } catch {
            return false;
        }
    }

    // Pick health endpoint based on server type
    let healthUrl = 'http://localhost:3000/health';
    if (serverChoice.server === 'cluster') healthUrl = 'http://localhost:3001/health';
    if (serverChoice.server === 'worker') healthUrl = 'http://localhost:3001/health';

    // If reusing a server, check if PID is alive and clarify output limitations
    if (!startedServer && runId) {
        const reusedPid = getServerPid(runId);
        if (!reusedPid || !isProcessAlive(reusedPid)) {
            console.error(`ERROR: Attempted to reuse server with runId ${runId}, but process PID ${reusedPid} is not running.\n` +
                'The server may have crashed or exited after warm-up. Please rerun the warm-up phase.');
            process.exit(1);
        } else {
            console.log(`Reusing server process PID ${reusedPid} for runId ${runId}. Cannot capture output or monitor exit.`);
        }
    }
    // Always check health before running warmup or load-test
    await waitForHealthWithProcessCheck(healthUrl);

    // Prompt for duration if not web
    let duration;
    if (isWeb && webSelection && webSelection.duration) {
        duration = parseInt(webSelection.duration, 10) || 30;
    } else if (!isWeb) {
        const durationInput = await inquirer.prompt([
            {
                type: 'input',
                name: 'duration',
                message: 'Set benchmark duration in seconds (default 30):',
                default: 30,
                validate: v => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 || 'Enter a positive number'
            }
        ]);
        duration = parseInt(durationInput.duration, 10) || 30;
    }

    // Prompt for connections if not web
    let connections = 10;
    if (isWeb && webSelection && webSelection.connections) {
        connections = parseInt(webSelection.connections, 10) || 10;
    } else if (!isWeb) {
        const connectionsInput = await inquirer.prompt([
            {
                type: 'input',
                name: 'connections',
                message: 'Set number of simultaneous connections (default 10):',
                default: 10,
                validate: v => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 || 'Enter a positive number'
            }
        ]);
        connections = parseInt(connectionsInput.connections, 10) || 10;
    }

    // Prompt for warmup duration if not web
    let warmupSeconds = 7;
    if (isWeb && webSelection && webSelection.warmupSeconds) {
        warmupSeconds = parseInt(webSelection.warmupSeconds, 10) || 7;
    } else if (!isWeb) {
        const warmupInput = await inquirer.prompt([
            {
                type: 'input',
                name: 'warmupSeconds',
                message: 'How many seconds should the warmup phase run? (default 7):',
                default: 7,
                validate: v => !isNaN(parseInt(v, 10)) && parseInt(v, 10) >= 0 || 'Enter a non-negative number'
            }
        ]);
        warmupSeconds = parseInt(warmupInput.warmupSeconds, 10) || 7;
    }

    // Prompt for latency threshold if not web
    let latencyThreshold = 1000;
    if (isWeb && webSelection && webSelection.latencyThreshold) {
        latencyThreshold = parseInt(webSelection.latencyThreshold, 10) || 1000;
    } else if (!isWeb) {
        const latencyInput = await inquirer.prompt([
            {
                type: 'input',
                name: 'latencyThreshold',
                message: 'Set latency threshold in ms (default 1000):',
                default: 1000,
                validate: v => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 || 'Enter a positive number'
            }
        ]);
        latencyThreshold = parseInt(latencyInput.latencyThreshold, 10) || 1000;
    }

    // Use autocannon in standard mode for the full test
    const requests = [];
    if (loadChoice.load.light > 0) {
        requests.push({ method: 'GET', path: '/light', weight: loadChoice.load.light });
    }
    if (loadChoice.load.heavy > 0) {
        requests.push({ method: 'GET', path: '/heavy', weight: loadChoice.load.heavy });
    }
    autocannon({
        url: 'http://localhost:3000',
        connections,
        duration,
        requests
    }, (err, result) => {
        let output = '';
        if (err) {
            output = `Error: ${err.message}`;
        } else {
            // Count requests over latency threshold
            let overThreshold = 0;
            if (result.latency && result.latency.values) {
                overThreshold = result.latency.values.filter(l => l >= latencyThreshold).length;
            }
            output = autocannon.printResult(result) +
                `\nRequests over latency threshold (${latencyThreshold}ms): ${overThreshold}`;
        }
        if (isWeb) {
            console.log(JSON.stringify({ text: output }));
        } else {
            console.log(output);
        }
        server.kill();
        process.exit(0);
    });

    // Wait for server to start only if we started it in this process
    if (startedServer) {
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Warmup phase: fire requests for warmupSeconds using all connections and both endpoints
    async function warmupPhase() {
        const http = require('http');
        const endpoints = [];
        if (loadChoice.load.light > 0) endpoints.push('/light');
        if (loadChoice.load.heavy > 0) endpoints.push('/heavy');
        const start = Date.now();
        let promises = [];
        for (let c = 0; c < connections; c++) {
            promises.push((async function loop() {
                let i = 0;
                while ((Date.now() - start) < warmupSeconds * 1000) {
                    const path = endpoints[i % endpoints.length];
                    await new Promise((resolve) => {
                        const req = http.get(`http://localhost:3000${path}`, res => {
                            res.on('data', () => {});
                            res.on('end', resolve);
                        });
                        req.on('error', resolve); // ignore errors for warmup
                        req.setTimeout(10000, () => {
                            req.abort();
                            resolve();
                        });
                    });
                    i++;
                }
            })());
        }
        await Promise.all(promises);
    }
    if (warmupSeconds > 0) {
        await warmupPhase();
    }
    if (isWarmup) {
        // Only warmup, do not run load test, do not kill server
        if (isWeb) {
            console.log(JSON.stringify({ text: 'Warmup complete.' }));
        } else {
            console.log('Warmup complete.');
        }
        process.exit(0);
    }

    startTime = Date.now(); // reset start time after all prompts

    function shouldContinue() {
        return (Date.now() - startTime) < duration * 1000;
    }

    // Remove or comment out runManualRequests calls (autocannon is used)
    // await Promise.all([
    //     runManualRequests('/light', loadChoice.load.light),
    //     runManualRequests('/heavy', loadChoice.load.heavy)
    // ]);
    // running = false;

    // Summarize results (descriptive, threshold-aware)
    function formatStats(results, latencyThreshold) {
        if (!results.length) return 'No requests completed.';
        const total = results.length;
        const avg = results.reduce((a, b) => a + b.latency, 0) / total;
        const min = Math.min(...results.map(r => r.latency));
        const max = Math.max(...results.map(r => r.latency));
        const over = results.filter(r => r.latency >= latencyThreshold).length;
        const perPath = {};
        for (const r of results) {
            if (!perPath[r.path]) perPath[r.path] = [];
            perPath[r.path].push(r.latency);
        }
        let perPathStats = Object.entries(perPath).map(([path, arr]) => {
            const avgP = arr.reduce((a, b) => a + b, 0) / arr.length;
            const minP = Math.min(...arr);
            const maxP = Math.max(...arr);
            const overP = arr.filter(l => l >= latencyThreshold).length;
            return `  ${path} - requests: ${arr.length}, avg: ${avgP.toFixed(2)}ms, min: ${minP}ms, max: ${maxP}ms, over threshold: ${overP}`;
        }).join('\n');
        return `Benchmark results (latency threshold: ${latencyThreshold}ms):\n` +
            `Total requests: ${total}\n` +
            `Average latency: ${avg.toFixed(2)}ms\n` +
            `Min latency: ${min}ms\n` +
            `Max latency: ${max}ms\n` +
            `Requests over threshold: ${over} (${((over/total)*100).toFixed(1)}%)\n` +
            `Per endpoint:\n${perPathStats}`;
    }

    const prettyStats = formatStats(results, latencyThreshold);

    if (isWeb) {
        console.log(JSON.stringify({ text: prettyStats }));
    } else {
        console.log(prettyStats);
    }
    // After test, kill server if we started it (not if reused)
    if (!isWarmup && (!runId || !getServerPid(runId) || (server && server.pid === getServerPid(runId)))) {
        if (server) server.kill();
        if (runId && getServerPid(runId)) killDetachedServerByPid(getServerPid(runId));
        if (runId) removeServerPid(runId);
    }
    process.exit(0);
}

runBenchmark().catch(console.error);
