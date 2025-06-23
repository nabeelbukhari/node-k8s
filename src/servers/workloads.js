// Common CPU-bound workloads for benchmarking

async function lightWorkload() {
  let result = 0;
  // Add randomness to prevent V8 optimization
  const seed = Math.floor(Math.random() * 1000) + (Date.now() % 1000);
  for (let i = 0; i < 100000; i++) {
    result += Math.sqrt(i + seed) * Math.random();
  }
  return result;
}

async function heavyWorkload() {
  let result = 0;
  // Add randomness to prevent V8 optimization
  const seed = Math.floor(Math.random() * 10000) + (Date.now() % 10000);
  for (let i = 0; i < 10000000; i++) {
    for (let j = 0; j < 5; j++) {
      result += Math.sqrt(i + j + seed) * Math.random();
    }
  }
  return result;
}

module.exports = { lightWorkload, heavyWorkload };
