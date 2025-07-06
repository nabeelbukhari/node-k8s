import os
import json
import matplotlib.pyplot as plt
from collections import defaultdict

# Base output directory
BASE_DIR = os.path.join(os.path.dirname(__file__), 'output')

# Helper to extract info from filename (e.g., cpu500m_mem256Mi_workers4_cluster.json)


def parse_filename(filename):
    # Remove extension
    name = filename[:-5] if filename.endswith('.json') else filename
    parts = name.split('_')
    if len(parts) != 4:
        return None
    cpu = int(''.join(filter(str.isdigit, parts[0])))  # e.g., cpu500m -> 500
    mem = parts[1]  # e.g., mem256Mi
    workers = int(parts[2].replace('workers', ''))  # e.g., workers4 -> 4
    server_type = parts[3]  # e.g., cluster
    return cpu, mem, workers, server_type


def plot_for_server_type(server_type):
    # Group by workload (subfolder) and worker count
    data_by_workload_and_workers = defaultdict(
        lambda: defaultdict(lambda: {'xs': [], 'ys': []}))
    for root, dirs, files in os.walk(BASE_DIR):
        workload = os.path.basename(root)
        for fname in files:
            if not fname.endswith('.json'):
                continue
            parsed = parse_filename(fname)
            if not parsed:
                continue
            cpu, mem, workers, f_server_type = parsed
            if f_server_type != server_type:
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
                total_completed = data.get('result', {}).get(
                    'totalCompletedRequests')
                if total_completed is not None:
                    data_by_workload_and_workers[workload][workers]['xs'].append(
                        cpu)
                    data_by_workload_and_workers[workload][workers]['ys'].append(
                        total_completed)
            except Exception as e:
                print(f"Error reading {fpath}: {e}")
    plt.figure(figsize=(14, 8))  # Wider figure for legend
    for workload, workers_dict in sorted(data_by_workload_and_workers.items()):
        for workers, vals in sorted(workers_dict.items()):
            label = f'{workload}, w={workers}'
            plt.plot(vals['xs'], vals['ys'], marker='o', label=label)
    plt.title(
        f"Benchmark: {server_type.capitalize()} (Request Completed vs CPU)")
    plt.xlabel('CPU (m)')
    plt.ylabel('Total Requests Completed')
    plt.grid(True)
    # plt.yscale('log')
    plt.tight_layout(rect=[0, 0, 0.75, 1])  # Leave space for legend
    images_dir = os.path.join(os.path.dirname(__file__), 'images')
    os.makedirs(images_dir, exist_ok=True)
    fig_path = os.path.join(images_dir, f'benchmark_{server_type}.png')
    # Place legend outside plot, on the right
    plt.legend(title='Workload, Workers', fontsize=8, loc='center left',
               bbox_to_anchor=(1.02, 0.5), borderaxespad=0.)
    plt.savefig(fig_path, dpi=200, bbox_inches='tight')
    plt.show()


if __name__ == '__main__':
    for server_type in ['single', 'cluster', 'worker']:
        plot_for_server_type(server_type)
    print("Graphs saved as benchmark_<server_type>.png and displayed.")
