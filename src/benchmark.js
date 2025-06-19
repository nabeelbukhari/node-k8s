// Patch for inquirer v9+ default import
const inquirerLib = require('inquirer');
const inquirer = inquirerLib.prompt ? inquirerLib : inquirerLib.default;

const { spawn } = require('child_process');
const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');
const { serverTypes, loadTypes } = require('./benchmark-config');


// Refactored: runBenchmark now takes an options object and does not handle CLI or web-specific logic.
async function runBenchmark(options) {
    const { serverType, loadType, duration, connections, warmupSeconds, latencyThreshold, isWarmup } = options;
    const serverChoice = serverTypes.find(s => s.value === serverType) || serverTypes[0];
    const lt = loadTypes.find(l => l.value === loadType) || loadTypes[0];
    const loadChoice = { load: lt };

    // Start the selected server
    let server;
    let serverExited = false;
    let serverExitCode = null;
    server = spawn('node', [serverChoice.path], { stdio: 'inherit' });
    server.on('exit', (code, signal) => {
        serverExited = true;
        serverExitCode = code;
    });

    // Wait for health endpoint
    let healthUrl = 'http://localhost:3000/health';
    if (serverChoice.value === 'cluster' || serverChoice.value === 'worker') healthUrl = 'http://localhost:3001/health';
    await waitForHealthWithProcessCheck(server, serverExited, serverExitCode, healthUrl);

    // Run warmup phase
    if (warmupSeconds > 0) {
        await runPhase({
            url: healthUrl.replace('/health', ''),
            connections,
            duration: warmupSeconds,
            load: loadChoice.load,
            phaseName: 'Warmup'
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
        phaseName: 'Load-test'
    });

    if (server) server.kill();
    return result;
}

// Run both warmup and load-test in a single server lifecycle
async function runFullBenchmark(options, progressCb) {
    const { serverType, loadType, duration, connections, warmupSeconds, latencyThreshold } = options;
    const serverChoice = serverTypes.find(s => s.value === serverType) || serverTypes[0];
    const lt = loadTypes.find(l => l.value === loadType) || loadTypes[0];
    const loadChoice = { load: lt };

    // Start the selected server
    console.log('[DEBUG] Spawning server:', serverChoice.path);
    let server;
    let serverExited = false;
    let serverExitCode = null;
    server = spawn('node', [serverChoice.path], { stdio: 'inherit' });
    server.on('exit', (code, signal) => {
        serverExited = true;
        serverExitCode = code;
        console.log(`[DEBUG] Server exited with code ${code}, signal ${signal}`);
    });
    server.on('error', (err) => {
        console.error('[DEBUG] Server process error:', err);
    });

    // Wait for health endpoint
    let healthUrl = 'http://localhost:3000/health';
    if (serverChoice.value === 'cluster' || serverChoice.value === 'worker') healthUrl = 'http://localhost:3001/health';
    console.log('[DEBUG] Waiting for health endpoint:', healthUrl);
    try {
        await waitForHealthWithProcessCheck(server, serverExited, serverExitCode, healthUrl);
        console.log('[DEBUG] Health check passed.');
    } catch (e) {
        console.error('[DEBUG] Health check failed:', e);
        if (server) server.kill();
        throw e;
    }

    // Run warmup phase
    let warmupResult = null;
    let warmupCliTable = null;
    if (progressCb) progressCb({ phase: 'warmup', status: 'starting' });
    if (warmupSeconds > 0) {
        console.log('[DEBUG] Starting warmup phase...');
        try {
            warmupResult = await runPhase({
                url: healthUrl.replace('/health', ''),
                connections,
                duration: warmupSeconds,
                load: loadChoice.load,
                phaseName: 'Warmup'
            });
            warmupCliTable = getCliTable(warmupResult);
            console.log('[DEBUG] Warmup phase complete.');
        } catch (e) {
            console.error('[DEBUG] Warmup phase failed:', e);
            if (server) server.kill();
            throw e;
        }
    }
    if (progressCb) progressCb({ phase: 'warmup', status: 'complete', result: extractSummary(warmupResult), cliTable: warmupCliTable });

    // Run load-test phase
    let loadTestCliTable = null;
    if (progressCb) progressCb({ phase: 'load-test', status: 'starting' });
    console.log('[DEBUG] Starting load-test phase...');
    let result = null;
    try {
        result = await runPhase({
            url: healthUrl.replace('/health', ''),
            connections,
            duration,
            load: loadChoice.load,
            phaseName: 'Load-test'
        });
        loadTestCliTable = getCliTable(result);
        console.log('[DEBUG] Load-test phase complete.');
    } catch (e) {
        console.error('[DEBUG] Load-test phase failed:', e);
        if (server) server.kill();
        throw e;
    }
    if (progressCb) progressCb({ phase: 'load-test', status: 'complete', result: extractSummary(result), cliTable: loadTestCliTable });

    if (server) {
        console.log('[DEBUG] Killing server process...');
        server.kill();
    }
    console.log('[DEBUG] Server killed. Returning results.');
    return {
        warmup: extractSummary(warmupResult),
        result: extractSummary(result),
        warmupCliTable,
        loadTestCliTable
    };
}

// Helper: wait for health endpoint
async function waitForHealthWithProcessCheck(server, serverExited, serverExitCode, url, timeoutMs = 10000) {
    const http = require('http');
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function check() {
            if (serverExited) {
                return reject(new Error('Server process exited before health check passed. Exit code: ' + serverExitCode));
            }
            http.get(url, res => {
                if (res.statusCode === 200) return resolve();
                if (Date.now() - start > timeoutMs) {
                    return reject(new Error('Health check timeout'));
                }
                setTimeout(check, 200);
            }).on('error', () => {
                if (serverExited) {
                    return reject(new Error('Server process exited before health check passed. Exit code: ' + serverExitCode));
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
    console.log(`[DEBUG] Starting autocannon for phase: ${phaseName}, url: ${url}, connections: ${connections}, duration: ${duration}, load:`, load);
    return new Promise((resolve, reject) => {
        autocannon({
            url,
            connections,
            duration,
            requests
        }, (err, result) => {
            if (err) {
                console.error(`[DEBUG] Autocannon error in phase ${phaseName}:`, err);
                return reject(err);
            }
            console.log(`[DEBUG] Autocannon completed for phase: ${phaseName}`);
            resolve(result);
        });
    });
}

// Helper to extract human-readable summary stats from autocannon result
function extractSummary(result) {
    if (!result || typeof result !== 'object') return result;
    return {
        averageLatency: result.latency && result.latency.average,
        p99Latency: result.latency && result.latency.p99,
        minLatency: result.latency && result.latency.min,
        maxLatency: result.latency && result.latency.max,
        averageReqPerSec: result.requests && result.requests.average,
        p99ReqPerSec: result.requests && result.requests.p99,
        minReqPerSec: result.requests && result.requests.min,
        maxReqPerSec: result.requests && result.requests.max,
        averageThroughput: result.throughput && result.throughput.average,
        p99Throughput: result.throughput && result.throughput.p99,
        minThroughput: result.throughput && result.throughput.min,
        maxThroughput: result.throughput && result.throughput.max,
        totalCompletedRequests: result.totalCompletedRequests,
        totalRequests: result.totalRequests,
        totalBytes: result.totalBytes,
        errors: result.errors,
        timeouts: result.timeouts,
        non2xx: result.non2xx,
        statusCodeStats: result.statusCodeStats,
        duration: result.duration,
        start: result.start,
        finish: result.finish
    };
}

// Helper to get CLI-style table output from autocannon result
function getCliTable(result) {
    try {
        // autocannon.printResult returns a string table
        return autocannon.printResult(result, { renderResultsTable: true, renderLatencyTable: true });
    } catch (e) {
        return null;
    }
}

module.exports = { runBenchmark, runFullBenchmark };
