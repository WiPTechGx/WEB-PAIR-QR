import os from "os";
import cluster from "cluster";
import { logger } from "../lib/logger.js";

const WORKER_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function startServer(port: number): Promise<void> {
    if (cluster.isPrimary) {
        const workers = new Map();
        const numWorkers = os.availableParallelism();
        logger.info(`[Master] Master PID: ${process.pid}`);
        function forkWorker(): void {
            const worker = cluster.fork();
            const timeout = setTimeout(() => {
                logger.info(
                    `[Master] Restarting worker ${worker.process.pid} after timeout`
                );
                worker.kill();
            }, WORKER_LIFETIME_MS);
            workers.set(worker.id, { worker, timeout });
        }

        for (let i = 0; i < numWorkers; i++) {
            forkWorker();
        }

        cluster.on("exit", (worker, code, signal) => {
            const info = workers.get(worker.id);
            if (info) {
                clearTimeout(info.timeout);
                workers.delete(worker.id);
            }

            logger.debug(
                `[Master] Worker ${worker.process.pid} exited with code ${code} and signal ${signal}`
            );

            if (!isShuttingDown) {
                forkWorker();
            }
        });

        let isShuttingDown = false;

        function shutdownMaster(): void {
            if (isShuttingDown) return;
            isShuttingDown = true;
            logger.info(`[Master] Gracefully shutting down...`);

            for (const { worker } of workers.values()) {
                worker.send({ type: "shutdown" });
            }

            // Allow some time for workers to clean up
            setTimeout(() => {
                for (const { worker } of workers.values()) {
                    try {
                        worker.kill();
                    } catch (e) {}
                }
                process.exit(0);
            }, 5000);
        }

        process.on("SIGINT", shutdownMaster);
        process.on("SIGTERM", shutdownMaster);
    } else {
        const { start, stop } = await import("./server.js");

        logger.info(`[Worker] Worker PID: ${process.pid}`);

        let isShuttingDown = false;

        await start(port);

        function shutdownWorker(): void {
            if (isShuttingDown) return;
            isShuttingDown = true;
            logger.info(`[Worker ${process.pid}] cleaning up...`);
            stop().finally(() => process.exit(0));
        }

        process.on("message", (msg: { type: string }) => {
            if (msg.type === "shutdown") {
                shutdownWorker();
            }
        });

        process.on("SIGINT", shutdownWorker);
        process.on("SIGTERM", shutdownWorker);

        process.on("uncaughtException", (err) => {
            logger.error(`[Worker ${process.pid}] Uncaught Exception:`, err);
            shutdownWorker();
        });

        process.on("unhandledRejection", (reason) => {
            logger.error(
                `[Worker ${process.pid}] Unhandled Rejection:`,
                reason
            );
            shutdownWorker();
        });
    }
}
