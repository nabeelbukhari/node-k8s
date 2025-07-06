// Script to measure average execution time for light and heavy workloads
const { lightWorkload, heavyWorkload } = require('./workloads');

async function measureAvgTime(fn, runs = 5) {
  let total = 0;
  for (let i = 0; i < runs; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    total += Number(end - start);
  }
  return total / runs / 1e6; // ms
}

(async () => {
  const runs = 10;
  console.log(`Measuring average time over ${runs} runs...`);

  const lightAvg = await measureAvgTime(lightWorkload, runs);
  console.log(`Average time for lightWorkload: ${lightAvg.toFixed(2)} ms`);

  const heavyAvg = await measureAvgTime(heavyWorkload, runs);
  console.log(`Average time for heavyWorkload: ${heavyAvg.toFixed(2)} ms`);
})();
