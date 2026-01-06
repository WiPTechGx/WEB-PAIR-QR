import * as baileys from "baileys";
import { Boom } from "@hapi/boom";
import { join } from "path";
import fs from "fs-extra";
import { logger } from "../logger.js";

interface WaSocket {
    sendMessage: (
        jid: string,
        content: baileys.AnyMessageContent,
        options?: baileys.MiscMessageGenerationOptions
    ) => Promise<baileys.WAProto.WebMessageInfo | undefined>;
    requestPairingCode: (phoneNumber: string) => Promise<string>;
    ev: baileys.BaileysEventEmitter;
    [key: string]: any;
}

export function createSession(
    path: string,
    phone: string | undefined,
    callback: (
        error: Error | undefined,
        sock?: WaSocket,
        session?: string
    ) => Promise<void>
): Promise<string> {
    return new Promise(async (resolve) => {
        const { state, saveCreds } = await baileys.useMultiFileAuthState(path);
        const sock = baileys.makeWASocket({
            auth: state,
            logger: logger.child(
                {},
                { level: logger.level == "verbose" ? "info" : "silent" }
            ),
        });
        sock.ev.on("creds.update", saveCreds);

        let fetched = false;
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === "close") {
                const reason: number | undefined = new Boom(
                    lastDisconnect?.error
                )?.output.statusCode;
                if (reason === baileys.DisconnectReason.restartRequired) {
                    sock.ev.removeAllListeners("connection.update");
                    sock.end(undefined);
                    createSession(path, phone, callback);
                } else {
                    await callback(lastDisconnect?.error);
                }
                return;
            }

            if (connection === "open") {
                logger.debug("Connection opened successfully");
                sock.ev.removeAllListeners("connection.update");
                const sessionFile = join(path, "creds.json");
                const session = await fs.readFile(sessionFile, {
                    encoding: "utf8",
                });
                await callback(undefined, sock, session);
                // await baileys.delay(1000); // delay to make sure message sends
                logger.debug("Closing socket after getting session");
                sock.end(undefined); // close the socket after getting the session
                return;
            }

            if (fetched) return;
            if (qr) {
                if (phone) {
                    const code = await sock.requestPairingCode(phone);
                    resolve(code);
                } else {
                    resolve(qr);
                }
                fetched = true;
            }
        });
    });
}

export function generateSessionKey(prefix: string): string {
    const firstPart = Date.now().toString(36).substring(2, 6).toUpperCase();
    const secondPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${firstPart}-${secondPart}`;
}
