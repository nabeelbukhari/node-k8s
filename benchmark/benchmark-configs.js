module.exports = [
  {
    requests: { cpu: '500m', memory: '256Mi' },
    limits: { cpu: '1000m', memory: '512Mi' },
    workers: 4,
  },
  {
    requests: { cpu: '1000m', memory: '512Mi' },
    limits: { cpu: '1500m', memory: '1Gi' },
    workers: 6,
  },
  {
    requests: { cpu: '1500m', memory: '1Gi' },
    limits: { cpu: '2500m', memory: '1Gi' },
    workers: 8,
  },
  {
    requests: { cpu: '2500m', memory: '1Gi' },
    limits: { cpu: '3500m', memory: '1Gi' },
    workers: 10,
  },
];
