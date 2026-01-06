import express from "express";
import { logger } from "../../lib/logger.js";

export function requestLogger(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    logger.info(`Request received: ${req.method} ${req.url}`);
    next();
}
