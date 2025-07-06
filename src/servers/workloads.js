const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Common CPU-bound workloads for benchmarking

// These workloads should be CPU-intensive enough to demonstrate the differences in performance
// between single-threaded and multi-threaded (clustered) Node.js applications.

// Light workload - should complete within 100ms
async function lightWorkload() {
  await sleep(50); // Simulate a light delay

  // Perform a small amount of CPU work
  return new Promise((resolve) => {
    let result = 0;
    const seed = Math.floor(Math.random() * 1000) + (Date.now() % 1000);
    for (let i = 0; i < 1000000; i++) {
      result += Math.sqrt(i + seed) * Math.random();
    }
    resolve(result);
  });
}

// Heavy CPU task - should take more than 250ms
async function heavyWorkload() {
  await sleep(50); // Simulate a heavy delay

  // Perform a significant amount of CPU work
  return new Promise((resolve) => {
    let result = 0;
    const seed = Math.floor(Math.random() * 10000) + (Date.now() % 10000);
    for (let i = 0; i < 10000000; i++) {
      for (let j = 0; j < 2; j++) {
        result += Math.sqrt(i + j + seed) * Math.random();
      }
    }
    resolve(result);
  });
}

module.exports = { lightWorkload, heavyWorkload };
