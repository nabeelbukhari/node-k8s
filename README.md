# node-k8s

This repo contains code examples of node behavior in k8s

# Node.js Server Benchmark

This project benchmarks three Node.js server configurations:

1. **Single Process Node Server**
2. **Single Process Node Server with Worker Threads**
3. **Cluster Deployment of Node Server**

Each server exposes two endpoints:

- `/light`: Light CPU-bound task (should return under 50ms)
- `/heavy`: Heavy CPU-bound task (should take more than 300ms)

## Load Types

Following are available load types for benchmarks:

- 10% light / 90% heavy
- 20% light / 80% heavy
- 30% light / 70% heavy
- 40% light / 60% heavy
- 50% light / 50% heavy
- 60% light / 40% heavy
- 70% light / 30% heavy
- 80% light / 20% heavy
- 90% light / 10% heavy
- 100% light / 0% heavy

## Dependencies

- express
- ws
- autocannon
- inquirer

[How To Build & Run](docs/BUILD-RUN.md)

[Kubernetes Deployment](docs/DEPLOYMENT.md)

[Benchmarking](docs/BENCHMARKS.md)

[Result Analysis](docs/ANALYSIS_REPORT.md)

[Expectation based on hypothesis](docs/EXPECTATIONS.md)
