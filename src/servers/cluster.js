const express = require('express');
const cluster = require('cluster');
const os = require('os');
const { lightWorkload, heavyWorkload } = require('./workloads');

let ready = false;
let workers = [];
if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    let onlineWorkers = 0;
    console.log(`Master process is running with pid: ${process.pid}`);

    // Fork workers for each CPU
    for (let i = 0; i < numCPUs; i++) {
        workers[i] = cluster.fork();
        workers[i].on('online', () => {
            onlineWorkers++;
            if (onlineWorkers === numCPUs) {
                ready = true;
                // Notify parent process that server is ready
                process.send && process.send('ready');
            }
        });
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // Replace the dead worker
        cluster.fork();
    });

    // Health endpoint for master
    const app = express();
    app.get('/health', async (req, res) => {
        if (ready) {
            res.status(200).send('OK');
        } else {
            res.status(503).send('NOT READY');
        }
    });
    const PORT = 4000;
    const server = app.listen(PORT + 1, () => {
        console.log(`Cluster master health endpoint on port ${PORT + 1}`);
    });

    process.on('message', (msg) => {
        if (msg === 'shutdown') {
            // shutdown all workers
            console.log('Master server received shutdown signal. Shutting down workers...');

            for (let i = 0; i < numCPUs; i++) {
                workers[i].send('shutdown');
            }

            server.close(() => {
                console.log('Master server shutdown complete.');
                process.exit(0);
            });
        }
    });
} else {
    let lightRequestCount = 0;
    let heavyRequestCount = 0;

    const app = express();

    app.get('/light', async (req, res) => {
        const result = await lightWorkload();
        res.json({ result });
        lightRequestCount++;
    });

    app.get('/heavy', async (req, res) => {
        const result = await heavyWorkload();
        res.json({ result });
        heavyRequestCount++;
    });

    app.get('/health', async (req, res) => {
        res.status(200).send('OK');
    });

    const PORT = 4000;
    const server = app.listen(PORT, () => {
        console.log(`Cluster worker ${process.pid} is running on port ${PORT}`);
    });

    const shutdown = () => {
        console.log('Worker received shutdown signal. Shutting down gracefully...');
        console.log(`Processed ${lightRequestCount} light requests and ${heavyRequestCount} heavy requests.`);
        server.close(() => {
            console.log('Worker server shutdown complete.');
            process.exit(0);
        });
    };

    
    process.on('message', (msg) => {
        if (msg === 'shutdown') {
            shutdown();
        }
    });
}
