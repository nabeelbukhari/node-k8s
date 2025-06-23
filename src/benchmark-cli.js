const inquirerLib = require('inquirer');
const inquirer = inquirerLib.prompt ? inquirerLib : inquirerLib.default;
const { runFullBenchmark } = require('./benchmark');
const { serverTypes, loadTypes } = require('./benchmark-config');

async function promptCliOptions() {
  const serverChoice = await inquirer.prompt([
    {
      type: 'list',
      name: 'serverType',
      message: 'Select server type to benchmark:',
      choices: serverTypes.map((s) => ({ name: s.label, value: s.value })),
    },
  ]);
  const loadChoice = await inquirer.prompt([
    {
      type: 'list',
      name: 'loadType',
      message: 'Select load distribution:',
      choices: loadTypes.map((lt) => ({ name: lt.label, value: lt.value })),
    },
  ]);
  const durationInput = await inquirer.prompt([
    {
      type: 'input',
      name: 'duration',
      message: 'Set benchmark duration in seconds (default 30):',
      default: 30,
      validate: (v) =>
        (!isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0) ||
        'Enter a positive number',
    },
  ]);
  const connectionsInput = await inquirer.prompt([
    {
      type: 'input',
      name: 'connections',
      message: 'Set number of simultaneous connections (default 10):',
      default: 10,
      validate: (v) =>
        (!isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0) ||
        'Enter a positive number',
    },
  ]);
  const warmupInput = await inquirer.prompt([
    {
      type: 'input',
      name: 'warmupSeconds',
      message: 'How many seconds should the warmup phase run? (default 7):',
      default: 7,
      validate: (v) =>
        (!isNaN(parseInt(v, 10)) && parseInt(v, 10) >= 0) ||
        'Enter a non-negative number',
    },
  ]);
  const latencyInput = await inquirer.prompt([
    {
      type: 'input',
      name: 'latencyThreshold',
      message: 'Set latency threshold in ms (default 1000):',
      default: 1000,
      validate: (v) =>
        (!isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0) ||
        'Enter a positive number',
    },
  ]);
  return {
    serverType: serverChoice.serverType,
    loadType: loadChoice.loadType,
    duration: parseInt(durationInput.duration, 10),
    connections: parseInt(connectionsInput.connections, 10),
    warmupSeconds: parseInt(warmupInput.warmupSeconds, 10),
    latencyThreshold: parseInt(latencyInput.latencyThreshold, 10),
    isWarmup: false,
  };
}

(async () => {
  try {
    const options = await promptCliOptions();
    console.log('Starting server and waiting for health check...');
    const result = await runFullBenchmark({ ...options, isWarmup: true });
    console.log('Load test complete. Results:');
    console.log(result);
    process.exit(0);
  } catch (err) {
    console.error('Error running benchmark:', err);
    process.exit(1);
  }
})();
