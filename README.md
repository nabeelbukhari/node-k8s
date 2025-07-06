# Node.js Kubernetes Performance Benchmarking Suite

This repository provides a comprehensive benchmarking framework for analyzing Node.js application performance patterns in Kubernetes environments. The project compares different Node.js server architectures under various load conditions and resource constraints to provide data-driven insights for production deployment decisions.

## Project Purpose

This benchmarking suite is designed to:

- **Compare Node.js server architectures** in realistic Kubernetes deployment scenarios
- **Analyze performance characteristics** across different CPU/memory resource allocations
- **Evaluate scaling patterns** under mixed workload conditions
- **Provide production deployment recommendations** based on empirical data
- **Demonstrate Kubernetes resource management** impact on Node.js applications

## Server Configurations Tested

The project benchmarks three distinct Node.js server architectures:

1. **Single Process Server** - Traditional single-threaded Node.js application
2. **Worker Thread Server** - Node.js application utilizing worker threads for CPU-intensive tasks
3. **Cluster Server** - Multi-process Node.js application using the cluster module

## Workload Characteristics

Each server configuration exposes two endpoints representing different computational loads:

- **`/light`** - Light CPU-bound task (target: <50ms response time)
- **`/heavy`** - Heavy CPU-bound task (target: >300ms response time)

## Benchmark Load Types

The suite tests performance across 10 different load distribution patterns to simulate real-world traffic scenarios:

- **10% light / 90% heavy** - Heavy computation dominant workload
- **20% light / 80% heavy** - High computation workload
- **30% light / 70% heavy** - Computation-heavy workload
- **40% light / 60% heavy** - Moderate computation workload
- **50% light / 50% heavy** - Balanced workload
- **60% light / 40% heavy** - Light computation workload
- **70% light / 30% heavy** - Response-time optimized workload
- **80% light / 20% heavy** - Fast response workload
- **90% light / 10% heavy** - Low latency workload
- **100% light / 0% heavy** - Pure light request workload

## Resource Configurations

The benchmarks test multiple Kubernetes resource allocation scenarios:

- **CPU**: 500m, 1000m, 1500m, 2500m millicores
- **Memory**: 256Mi, 512Mi, 1Gi
- **Workers**: 1 (single), 4-10 (cluster/worker configurations)

## Key Findings Summary

Based on 120 comprehensive benchmark runs:

- **Cluster configuration** provides best overall performance and reliability (78.38% success rate)
- **100% light request** workloads achieve 3x better performance than mixed loads
- **Linear scaling** observed in cluster configurations with increased resources
- **Worker thread configurations** show reliability issues requiring investigation
- **Resource efficiency** varies significantly between server architectures

## Documentation

### Getting Started
- **[Build & Run Guide](docs/BUILD-RUN.md)** - Setup and local development instructions
- **[Kubernetes Deployment](docs/DEPLOYMENTS.md)** - Container deployment and K8s configuration

### Benchmarking
- **[Benchmarking Guide](docs/BENCHMARKS.md)** - How to run automated performance tests
- **[Analysis Report](docs/ANALYSIS_REPORT.md)** - Comprehensive performance analysis and findings
- **[Performance Expectations](docs/EXPECTATIONS.md)** - Hypothesis and expected behavior patterns

### Results and Insights
The benchmarking suite has analyzed 120 test configurations and provides:
- Performance comparison across server architectures
- Resource efficiency analysis
- Production deployment recommendations
- Visual performance graphs and scaling patterns

## Dependencies

### Core Dependencies
- **express** - Web application framework
- **ws** - WebSocket implementation for real-time benchmark reporting
- **autocannon** - HTTP/1.1 benchmarking tool
- **inquirer** - Interactive command line interface

### Analysis Dependencies
- **pandas** - Data analysis and manipulation (Python)
- **matplotlib** - Plotting and visualization (Python)

## Quick Links

[How To Build & Run](docs/BUILD-RUN.md)

[Kubernetes Deployment](docs/DEPLOYMENTS.md)

[Benchmarking](docs/BENCHMARKS.md)

[Result Analysis](docs/ANALYSIS_REPORT.md)

[Expectation based on hypothesis](docs/EXPECTATIONS.md)
