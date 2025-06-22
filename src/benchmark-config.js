// Centralized config for server types and load types

const serverTypes = [
  { value: 'single', label: 'Single Process', path: 'servers/single-process.js', port: 4000 },
  { value: 'worker', label: 'Worker Threads', path: 'servers/worker-thread.js', port: 4000 },
  { value: 'cluster', label: 'Cluster', path: 'servers/cluster.js', port: 3001 }
];

const loadTypes = [
  { value: '10-90', label: '10% light / 90% heavy', light: 0.1, heavy: 0.9 },
  { value: '20-80', label: '20% light / 80% heavy', light: 0.2, heavy: 0.8 },
  { value: '30-70', label: '30% light / 70% heavy', light: 0.3, heavy: 0.7 },
  { value: '40-60', label: '40% light / 60% heavy', light: 0.4, heavy: 0.6 },
  { value: '50-50', label: '50% light / 50% heavy', light: 0.5, heavy: 0.5 },
  { value: '60-40', label: '60% light / 40% heavy', light: 0.6, heavy: 0.4 },
  { value: '70-30', label: '70% light / 30% heavy', light: 0.7, heavy: 0.3 },
  { value: '80-20', label: '80% light / 20% heavy', light: 0.8, heavy: 0.2 },
  { value: '90-10', label: '90% light / 10% heavy', light: 0.9, heavy: 0.1 },
  { value: '100-0', label: '100% light / 0% heavy', light: 1.0, heavy: 0.0 }
];

module.exports = { serverTypes, loadTypes };
