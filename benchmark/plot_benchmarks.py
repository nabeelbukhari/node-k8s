import os
import json
import matplotlib.pyplot as plt
import re
from collections import defaultdict

# Base output directory
BASE_DIR = os.path.join(os.path.dirname(__file__), 'results')
SERVER_TYPES = ['single', 'cluster', 'worker']

# Helper to extract CPU from filename (e.g., cpu1000m_mem512Mi_workers6.json)


def extract_cpu(filename):
    try:
        cpu_part = filename.split('_')[0]  # e.g., cpu1000m
        cpu = int(''.join(filter(str.isdigit, cpu_part)))
        return cpu
    except Exception:
        return None


def extract_workers(filename):
    match = re.search(r'workers(\d+)', filename)
    return int(match.group(1)) if match else None


def plot_for_server_type(server_type):
    server_path = os.path.join(BASE_DIR, server_type)
    print(f"Processing data for {server_type} server type from {server_path}")
    if not os.path.isdir(server_path):
        print(f"No data for {server_type}")
        return
    plt.figure(figsize=(10, 6))
    for workload in sorted(os.listdir(server_path)):
        workload_path = os.path.join(server_path, workload)
        if not os.path.isdir(workload_path):
            continue
        # Group by worker count
        data_by_workers = defaultdict(lambda: {'xs': [], 'ys': []})
        for fname in sorted(os.listdir(workload_path)):
            if not fname.endswith('.json'):
                continue
            cpu = extract_cpu(fname)
            workers = extract_workers(fname)
            if cpu is None or workers is None:
                continue
            fpath = os.path.join(workload_path, fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
                total_completed = data.get('result', {}).get(
                    'totalCompletedRequests')
                if total_completed is not None:
                    data_by_workers[workers]['xs'].append(cpu)
                    data_by_workers[workers]['ys'].append(total_completed)
            except Exception as e:
                print(f"Error reading {fpath}: {e}")
        # Plot each worker count as a separate line
        for workers, vals in sorted(data_by_workers.items()):
            label = f'{workload}, w={workers}'
            plt.plot(vals['xs'], vals['ys'], marker='o', label=label)
    plt.title(
        f"Benchmark: {server_type.capitalize()} (Request Completed vs CPU)")
    plt.xlabel('CPU (m)')
    plt.ylabel('Total Requests Completed')
    plt.legend(title='Workload, Workers', fontsize=8)
    plt.grid(True)
    # plt.yscale('log')  # Use logarithmic scale for better visibility
    plt.tight_layout()
    images_dir = os.path.join(os.path.dirname(__file__), 'images')
    os.makedirs(images_dir, exist_ok=True)
    fig_path = os.path.join(images_dir, f'benchmark_{server_type}.png')
    plt.savefig(fig_path)
    plt.show()


if __name__ == '__main__':
    for server_type in SERVER_TYPES:
        plot_for_server_type(server_type)
    print("Graphs saved as benchmark_<server_type>.png and displayed.")
