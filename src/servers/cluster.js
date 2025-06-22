const express = require('express');
const cluster = require('cluster');
const os = require('os');
const { lightWorkload, heavyWorkload } = require('./workloads');

let ready = false;

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    let onlineWorkers = 0;
    console.log(`Master process is running with pid: ${process.pid}`);

    // Fork workers for each CPU
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
        worker.on('online', () => {
            onlineWorkers++;
            if (onlineWorkers === numCPUs) {
                ready = true;
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
    const PORT = 3000;
    app.listen(PORT + 1, () => {
        console.log(`Cluster master health endpoint on port ${PORT + 1}`);
    });
} else {
    const app = express();

    app.get('/light', async (req, res) => {
        const result = await lightWorkload();
        res.json({ result });
    });

    app.get('/heavy', async (req, res) => {
        const result = await heavyWorkload();
        res.json({ result });
    });

    app.get('/health', async (req, res) => {
        res.status(200).send('OK');
    });

    const PORT = 4000;
    app.listen(PORT, () => {
        console.log(`Cluster worker ${process.pid} is running on port ${PORT}`);
    });
}
