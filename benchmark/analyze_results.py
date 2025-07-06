#!/usr/bin/env python3
"""
Benchmark Results Analysis Script
Analyzes performance data across different load types and server configurations
"""

import json
import os
import re
from collections import defaultdict
import pandas as pd

def parse_filename(filename):
    """Parse benchmark result filename to extract configuration details"""
    # Remove .json extension
    name = filename.replace('.json', '')
    
    # Parse pattern: cpu500m_mem256Mi_workers4_cluster
    pattern = r'cpu(\d+)m_mem(\d+)([GM]i)_workers(\d+)_(\w+)'
    match = re.match(pattern, name)
    
    if match:
        cpu = int(match.group(1))
        memory_value = int(match.group(2))
        memory_unit = match.group(3)
        workers = int(match.group(4))
        server_type = match.group(5)
        
        # Convert memory to MB for consistency
        if memory_unit == 'Gi':
            memory_mb = memory_value * 1024
        else:  # Mi
            memory_mb = memory_value
            
        return {
            'cpu_millicores': cpu,
            'memory_mb': memory_mb,
            'workers': workers,
            'server_type': server_type
        }
    return None

def analyze_benchmark_results():
    """Analyze all benchmark results and generate comprehensive report"""
    results_dir = '/Users/nbukhari/Documents/node-k8s/benchmark/results'
    
    # Data structure to store all results
    all_results = []
    
    # Iterate through each load type directory
    for load_type in os.listdir(results_dir):
        load_dir = os.path.join(results_dir, load_type)
        if not os.path.isdir(load_dir):
            continue
            
        # Parse load type (xx-yy format)
        if '-' in load_type:
            light_pct, heavy_pct = map(int, load_type.split('-'))
        else:
            continue
            
        # Process each result file in the directory
        for filename in os.listdir(load_dir):
            if not filename.endswith('.json'):
                continue
                
            file_path = os.path.join(load_dir, filename)
            config = parse_filename(filename)
            
            if not config:
                continue
                
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    
                result = data.get('result', {})
                
                # Extract key metrics
                metrics = {
                    'load_type': load_type,
                    'light_requests_pct': light_pct,
                    'heavy_requests_pct': heavy_pct,
                    'cpu_millicores': config['cpu_millicores'],
                    'memory_mb': config['memory_mb'],
                    'workers': config['workers'],
                    'server_type': config['server_type'],
                    'total_completed_requests': result.get('totalCompletedRequests', 0),
                    'total_requests': result.get('totalRequests', 0),
                    'total_bytes': result.get('totalBytes', 0),
                    'errors': result.get('errors', 0),
                    'timeouts': result.get('timeouts', 0),
                    'duration': result.get('duration', 0),
                    'success_rate': 0,
                    'throughput_rps': 0,
                    'throughput_mbps': 0
                }
                
                # Calculate derived metrics
                if metrics['total_requests'] > 0:
                    metrics['success_rate'] = (metrics['total_completed_requests'] / metrics['total_requests']) * 100
                
                if metrics['duration'] > 0:
                    metrics['throughput_rps'] = metrics['total_completed_requests'] / metrics['duration']
                    metrics['throughput_mbps'] = (metrics['total_bytes'] / (1024 * 1024)) / metrics['duration']
                
                all_results.append(metrics)
                
            except Exception as e:
                print(f"Error processing {file_path}: {e}")
    
    # Convert to DataFrame for easier analysis
    df = pd.DataFrame(all_results)
    
    if df.empty:
        print("No valid benchmark results found!")
        return
    
    print("=" * 80)
    print("BENCHMARK RESULTS ANALYSIS")
    print("=" * 80)
    
    # Overview
    print(f"\nTotal benchmark runs analyzed: {len(df)}")
    print(f"Load types: {sorted(df['load_type'].unique())}")
    print(f"Server types: {sorted(df['server_type'].unique())}")
    print(f"Resource configurations: {len(df[['cpu_millicores', 'memory_mb', 'workers']].drop_duplicates())}")
    
    # Performance by Server Type
    print("\n" + "=" * 50)
    print("PERFORMANCE BY SERVER TYPE")
    print("=" * 50)
    
    server_summary = df.groupby('server_type').agg({
        'throughput_rps': ['mean', 'std', 'max'],
        'success_rate': ['mean', 'min'],
        'errors': 'sum',
        'timeouts': 'sum'
    }).round(2)
    
    print(server_summary)
    
    # Performance by Load Type
    print("\n" + "=" * 50)
    print("PERFORMANCE BY LOAD TYPE")
    print("=" * 50)
    
    load_summary = df.groupby(['light_requests_pct', 'heavy_requests_pct']).agg({
        'throughput_rps': ['mean', 'std'],
        'success_rate': ['mean', 'min'],
        'errors': 'sum'
    }).round(2)
    
    print(load_summary)
    
    # Resource Efficiency Analysis
    print("\n" + "=" * 50)
    print("RESOURCE EFFICIENCY ANALYSIS")
    print("=" * 50)
    
    # Calculate efficiency metrics
    df['cpu_efficiency'] = df['throughput_rps'] / df['cpu_millicores']
    df['memory_efficiency'] = df['throughput_rps'] / df['memory_mb']
    
    resource_efficiency = df.groupby(['cpu_millicores', 'memory_mb']).agg({
        'throughput_rps': 'mean',
        'cpu_efficiency': 'mean',
        'memory_efficiency': 'mean',
        'success_rate': 'mean'
    }).round(4)
    
    print(resource_efficiency)
    
    # Best Performing Configurations
    print("\n" + "=" * 50)
    print("TOP 10 BEST PERFORMING CONFIGURATIONS")
    print("=" * 50)
    
    top_configs = df.nlargest(10, 'throughput_rps')[
        ['server_type', 'load_type', 'cpu_millicores', 'memory_mb', 'workers', 
         'throughput_rps', 'success_rate', 'errors']
    ].round(2)
    
    print(top_configs.to_string(index=False))
    
    # Worst Performing Configurations
    print("\n" + "=" * 50)
    print("CONFIGURATIONS WITH ISSUES (Low Success Rate)")
    print("=" * 50)
    
    problem_configs = df[df['success_rate'] < 90].sort_values('success_rate')[
        ['server_type', 'load_type', 'cpu_millicores', 'memory_mb', 'workers', 
         'throughput_rps', 'success_rate', 'errors', 'timeouts']
    ].round(2)
    
    if not problem_configs.empty:
        print(problem_configs.to_string(index=False))
    else:
        print("No configurations with success rate < 90%")
    
    # Load Type Impact Analysis
    print("\n" + "=" * 50)
    print("LOAD TYPE IMPACT ON PERFORMANCE")
    print("=" * 50)
    
    # Compare light vs heavy request performance
    load_impact = df.pivot_table(
        values='throughput_rps', 
        index=['server_type', 'cpu_millicores', 'memory_mb'], 
        columns='light_requests_pct',
        aggfunc='mean'
    ).round(2)
    
    print("Throughput (RPS) by Light Request Percentage:")
    print(load_impact.head(10))
    
    # Scaling Analysis
    print("\n" + "=" * 50)
    print("WORKER SCALING ANALYSIS")
    print("=" * 50)
    
    scaling_analysis = df[df['server_type'] != 'single'].groupby(['server_type', 'workers']).agg({
        'throughput_rps': 'mean',
        'success_rate': 'mean',
        'cpu_efficiency': 'mean'
    }).round(2)
    
    print(scaling_analysis)
    
    # Generate summary insights
    print("\n" + "=" * 50)
    print("KEY INSIGHTS")
    print("=" * 50)
    
    best_server = df.groupby('server_type')['throughput_rps'].mean().idxmax()
    best_load = df.groupby('load_type')['throughput_rps'].mean().idxmax()
    
    print(f"• Best performing server type: {best_server}")
    print(f"• Best performing load type: {best_load}")
    print(f"• Overall success rate: {df['success_rate'].mean():.1f}%")
    print(f"• Total errors across all tests: {df['errors'].sum()}")
    print(f"• Total timeouts across all tests: {df['timeouts'].sum()}")
    
    # Resource recommendations
    efficient_configs = df[df['success_rate'] > 95].nlargest(3, 'cpu_efficiency')
    print(f"\nMost CPU-efficient configurations:")
    for _, config in efficient_configs.iterrows():
        print(f"  - {config['server_type']}: {config['cpu_millicores']}m CPU, {config['memory_mb']}MB RAM, {config['workers']} workers")
    
    return df

if __name__ == "__main__":
    try:
        results_df = analyze_benchmark_results()
        print(f"\nAnalysis complete! Results saved to DataFrame with {len(results_df)} records.")
    except Exception as e:
        print(f"Error during analysis: {e}")
        import traceback
        traceback.print_exc()
