const { parentPort, workerData } = require('worker_threads');
const { runFullBenchmark, runBenchmark } = require('./benchmark');

(async () => {
  try {
    if (workerData.batch) {
      // Batch mode: run all load types in sequence
      const { batchLoadTypes, ...opts } = workerData;
      const results = [];
      for (let i = 0; i < batchLoadTypes.length; i++) {
        const loadType = batchLoadTypes[i];
        parentPort.postMessage({ phase: 'batch-progress', status: `Running ${loadType} (${i+1}/${batchLoadTypes.length})` });
        try {
          const summary = await runBenchmark({ ...opts, loadType, warmupSeconds: 0 });
          parentPort.postMessage({ phase: 'batch-result', loadType, summary });
          results.push({ loadType, summary });
        } catch (e) {
          parentPort.postMessage({ phase: 'batch-result', loadType, error: e.message });
          results.push({ loadType, error: e.message });
        }
      }
      parentPort.postMessage({ phase: 'batch-complete', results });
    } else {
      // Single benchmark mode
      const results = await runFullBenchmark(workerData, (msg) => {
        parentPort.postMessage(msg);
      });
      parentPort.postMessage({ phase: 'results', results });
      parentPort.postMessage({ phase: 'all', status: 'complete' });
    }
  } catch (e) {
    parentPort.postMessage({ phase: 'error', error: e.message });
  }
})();
