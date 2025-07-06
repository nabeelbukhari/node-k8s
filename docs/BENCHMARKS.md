# Benchmarks

This document explains how to use the `run-benchmarks-in-k8s.js` script to automate benchmarking of the Node.js application in a Kubernetes environment.

## Overview

The script `benchmark/run-benchmarks-in-k8s.js` automates the process of:
- Applying Kubernetes resource configurations
- Rolling out deployments
- Running load benchmarks against different server types and resource settings
- Collecting and saving results for later analysis

## Prerequisites
- Node.js and npm installed
- Kubernetes cluster accessible via `kubectl`
- All dependencies installed (`npm install`)
- The application and its Kubernetes manifests are set up as per the repository

## Usage

Run the script from the project root:

```sh
node benchmark/run-benchmarks-in-k8s.js [options]
```

### Options
- `--servertype=<types>`: Comma-separated list of server types to benchmark (e.g., `single,cluster,worker`). Defaults to `single`.
- `--workerThreads=<n>`: Number of worker threads (default: 20)
- `--duration=<seconds>`: Duration of each benchmark run (default: 20)
- `--connections=<n>`: Number of concurrent connections (default: 30)
- `--warmupSeconds=<seconds>`: Warmup period before measurement (default: 5)
- `--rollout-wait=<ms>`: Wait time (ms) after rollout before running benchmarks (default: 2500)

Example:
```sh
node benchmark/run-benchmarks-in-k8s.js --servertype=single,cluster --workerThreads=10 --duration=30
```

## How It Works
1. **Resource Patch & Rollout:**
   - For each resource configuration, the script writes a patch to `deploy/resources-patch.yaml` and applies it using `kubectl apply -k`.
   - Waits for the deployment to roll out and stabilize.
2. **Benchmark Execution:**
   - For each server type and load type, the script opens a WebSocket to the server and triggers a benchmark run via HTTP POST.
   - Progress and results are streamed and saved.
3. **Results Storage:**
   - Results are saved as JSON files under `benchmark/results/<loadType>/` (flat structure by default).
   - Filenames encode CPU, memory, worker count, and server type.
4. **Cleanup:**
   - After all benchmarks, the deployment is deleted from the cluster.

## Output
- Benchmark results are saved as JSON files in `benchmark/results/<loadType>/`.
- Each file is named according to the resource configuration and server type.

## Analyzing Results

### Comprehensive Analysis Script
For detailed performance analysis across all configurations, use the `analyze_results.py` script:

```sh
python3 benchmark/analyze_results.py
```

This script provides:
- Performance comparison by server type and load type
- Resource efficiency analysis
- Top and worst performing configurations
- Worker scaling analysis
- Key insights and recommendations

### Plotting Results
To visualize the benchmark results, use the `plot_flat_benchmarks.py` script located in the `benchmark/` directory. This Python program reads the flat JSON result files and generates graphs to help analyze performance across different configurations.

Run the script as follows:

```sh
python3 benchmark/plot_flat_benchmarks.py
```

You may need to install Python packages such as `matplotlib` and `pandas` if they are not already installed:

```sh
pip install matplotlib pandas
```

The generated plots will help you compare throughput, latency, and other metrics across server types and resource settings.

### Analysis Report
A comprehensive analysis report is available at `benchmark/ANALYSIS_REPORT.md` which includes:
- Executive summary of 120 benchmark runs
- Performance breakdown by server type and load type
- Resource efficiency recommendations
- Problem areas requiring attention
- Production deployment recommendations

## Customization
- Edit `benchmark/benchmark-configs.js` to change resource configurations.
- Edit `src/benchmark-config.js` to modify server types and load types.

## Troubleshooting
- Ensure the Kubernetes cluster is running and accessible.
- Make sure the Node.js server is reachable at the configured `serverUrl` (default: `http://localhost:3000`).
- Check for errors in the terminal output for deployment or benchmark issues.

## License
See [LICENSE](../LICENSE) for license information.
