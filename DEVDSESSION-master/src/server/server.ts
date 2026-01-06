import express from "express";
import config from "../config.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "../lib/logger.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { handleSessionCreation } from "../lib/sessions/index.js";
import { SessionStore, SecureDatabase } from "../lib/db/index.js";
import {
    clearDir,
    generateRandomAvailableFolderPath,
} from "../lib/fileHelper.js";
import { encryptSessionWithKey } from "../lib/crypto.js";

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);
const sessionDir = join(__dirname, `../sessions/${process.pid}`);
const Store = new SecureDatabase(SessionStore, config.encryptionKey);

const app = express();

app.use(requestLogger);
app.use(express.static(join(__dirname, "../public")));
app.use(express.json());

app.post("/api/qr", async (req: express.Request, res: express.Response) => {
    const requestSessionPath = await generateRandomAvailableFolderPath(
        sessionDir
    );
    const qrString = await handleSessionCreation(Store, requestSessionPath);
    res.json({ qr: qrString });
});

app.post("/api/pair", async (req: express.Request, res: express.Response) => {
    const requestSessionPath = await generateRandomAvailableFolderPath(
        sessionDir
    );
    const phoneNumber = req.body?.phoneNumber as string;
    if (!phoneNumber) {
        res.status(400).json({ error: "Phone number is required" });
    }

    const pairingCode = await handleSessionCreation(
        Store,
        requestSessionPath,
        phoneNumber
    );
    res.json({ code: pairingCode });
});

app.post(
    "/api/session/:sessionId",
    async (req: express.Request, res: express.Response) => {
        const publicKey = req.body.publicKey;
        if (!publicKey) {
            res.status(400).json({ error: "Public key is required" });
        }
        const sessionId = req.params.sessionId;
        const session = await Store.getSession(sessionId);
        if (typeof session == "string") {
            const encryptedSessionData = encryptSessionWithKey(
                publicKey,
                session
            );

            res.json(encryptedSessionData);
        } else {
            res.status(404).json({ error: "Session not found" });
        }
    }
);

app.post(
    "/api/session/:sessionId/reset",
    async (req: express.Request, res: express.Response) => {
        const sessionId = req.params.sessionId;
        if (await Store.resetSession(sessionId)) {
            res.json({ status: "Success" });
        } else {
            res.status(404).json({ error: "Session not found" });
        }
    }
);

export async function start(port: number): Promise<void> {
    await Store.connect();
    app.listen(port, (err) => {
        if (!err) logger.debug(`Worker: app active on port ${port}`);
    });
}

export async function stop(): Promise<void> {
    logger.debug("Stopping server...");
    await clearDir(sessionDir);
    await Store.disconnect();
}
