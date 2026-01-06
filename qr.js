import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import { exec } from 'child_process';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Permanent sessions folder
const SESSIONS_ROOT = path.join(__dirname, 'sessions');

const MESSAGE = `
*SESSION GENERATED SUCCESSFULLY* ✅

*Made with love by pgwiz* 🥀
profile: https://pgwiz.cloud
`;

async function removeFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        await fs.remove(filePath);
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    let customId = req.query.sessionId || '';
    // Sanitize: alphanumeric only
    customId = customId.replace(/[^a-zA-Z0-9]/g, '');

    const randomID = Math.random().toString(36).substring(2, 6);
    const sessionId = customId ? `pgwiz-${customId}` : `pgwiz-${randomID}`;

    // Use permanent sessions folder
    const dirs = path.join(SESSIONS_ROOT, sessionId);

    // Ensure sessions root exists
    if (!fs.existsSync(SESSIONS_ROOT)) {
        await fs.mkdir(SESSIONS_ROOT, { recursive: true });
    }

    async function initiateSession() {
        if (!fs.existsSync(dirs)) await fs.mkdir(dirs, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();
            let qrGenerated = false;
            let responseSent = false;

            const socketConfig = {
                version,
                logger: pino({ level: 'silent' }),
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 0,
                connectTimeoutMs: 120000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 500,
                maxRetries: 10,
            };

            let sock = makeWASocket(socketConfig);

            const handleQRCode = async (qr) => {
                if (qrGenerated || responseSent) return;
                qrGenerated = true;

                try {
                    const qrDataURL = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M' });
                    if (!responseSent) {
                        responseSent = true;
                        res.send({
                            qr: qrDataURL,
                            message: 'QR Code Generated! Scan with WhatsApp app.',
                            instructions: [
                                '1. Open WhatsApp on your phone',
                                '2. Go to Settings > Linked Devices',
                                '3. Tap "Link a Device"',
                                '4. Scan the QR code above'
                            ]
                        });
                    }
                } catch (err) {
                    console.error('Error generating QR code:', err);
                    if (!responseSent) res.status(500).send({ code: 'Failed to generate QR code' });
                }
            };

            let reconnectAttempts = 0;
            const maxReconnectAttempts = 3;

            // Simple cleanup: Just remove files, don't force kill connection immediately if possible
            // But since this is a session generator, we usually DO want to close it after sending.
            // The user said "remain active", but that usually means "don't log out".
            // Deleting the folder will kill persistence on THIS server, but the session itself on the phone remains.
            const cleanup = async () => {
                try {
                    sock.end(undefined); // Close connection cleanly to allow file deletion/prevent errors
                } catch { }
                await delay(3000); // 3s wait is enough if socket is closed
                await removeFile(dirs);
            };

            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log(`Connection update: ${connection}, lastDisconnect: ${lastDisconnect?.error}`); // Debug log

                if (qr && !qrGenerated) await handleQRCode(qr);

                if (connection === 'open') {
                    reconnectAttempts = 0; // Reset attempts on successful connection
                    console.log(`Connection open! Checking for creds in: ${dirs}`); // Debug log
                    // ... (rest of open logic matches existing)
                    try {
                        const credsFile = path.join(dirs, 'creds.json');
                        const uniqueCredsFile = path.join(dirs, `${sessionId}.json`);
                        // Wait a short moment to ensure file flush
                        await delay(500);

                        if (fs.existsSync(credsFile)) {
                            console.log(`Creds file found at ${credsFile}`); // Debug log

                            // Rename/Copy for sending with unique name
                            fs.copySync(credsFile, uniqueCredsFile);

                            const userJid = Object.keys(sock.authState.creds.me || {}).length > 0
                                ? jidNormalizedUser(sock.authState.creds.me.id)
                                : null;

                            console.log(`User JID: ${userJid}`); // Debug log

                            if (userJid) {
                                console.log("Sending session ID text...");
                                await sock.sendMessage(userJid, { text: `Session ID: ${sessionId}` });

                                console.log("Sending session file directly...");
                                await sock.sendMessage(userJid, {
                                    document: { url: uniqueCredsFile },
                                    mimetype: 'application/json',
                                    fileName: 'creds.json',
                                    caption: MESSAGE
                                });
                                console.log("Session file sent successfully.");

                                // Try MEGA Upload afterwards (non-blocking for the user, but we await to log)
                                console.log("Attempting MEGA upload...");
                                const megaUrl = await upload(fs.createReadStream(credsFile), `${sessionId}.json`);

                                if (megaUrl) {
                                    console.log('📄 Session uploaded to MEGA:', megaUrl);
                                    // Write meta.json with MEGA URL for later retrieval
                                    const metaFile = path.join(dirs, 'meta.json');
                                    await fs.writeJson(metaFile, { sessionId, megaUrl, createdAt: new Date().toISOString() });
                                    console.log('📝 meta.json written to:', metaFile);
                                    await sock.sendMessage(userJid, { text: `📄 Your session ID: ${megaUrl}` });
                                } else {
                                    console.log('MEGA upload failed or credentials missing (check logs).');
                                }
                            } else {
                                console.error("User JID not found in authState. Cannot send message.");
                            }
                        }

                        // Delay cleanup significantly to ensure file transfer completes
                        // User requested to keep session open ("leave the session on")
                        // setTimeout(cleanup, 30000); 
                        console.log("Session generated and sent. Keeping connection open as requested.");

                    } catch (err) {
                        console.error('Error sending session:', err);
                        cleanup();
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 401) {
                        // Logged out
                        cleanup();
                    } else {
                        // Reconnect on everything else (including undefined)
                        console.log(`Connection closed (Status: ${statusCode}). Reconnecting...`);
                        reconnectAttempts++;
                        // Higher limits for persistent mode, or infinite?
                        // Using a large number to effectively be persistent.
                        if (reconnectAttempts <= 100) {
                            setTimeout(() => {
                                try {
                                    sock = makeWASocket(socketConfig);
                                    sock.ev.on('connection.update', handleConnectionUpdate);
                                    sock.ev.on('creds.update', saveCreds);
                                } catch (err) { console.error('Reconnect failed:', err); }
                            }, 2000);
                        } else {
                            console.error("Max reconnect attempts reached. Stopping.");
                            if (!responseSent) res.status(503).send({ code: 'Connection failed after retries' });
                            cleanup();
                        }
                    }
                }
            };

            sock.ev.on('connection.update', handleConnectionUpdate);

            sock.ev.on('creds.update', saveCreds);

            const timeoutId = setTimeout(() => {
                if (!responseSent) res.status(408).send({ code: 'QR generation timeout' });
                cleanup();
            }, 60000); // Increased interaction timeout to 60s

        } catch (err) {
            console.error('Error initializing session:', err);
            exec('pm2 restart qasim');
            if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
            await removeFile(dirs);
        }
    }

    await initiateSession();
});

process.on('uncaughtException', (err) => {
    const e = String(err);
    const ignore = [
        "conflict", "not-authorized", "Socket connection timeout",
        "rate-overlimit", "Connection Closed", "Timed Out",
        "Value not found", "Stream Errored", "Stream Errored (restart required)",
        "statusCode: 515", "statusCode: 503"
    ];
    if (!ignore.some(x => e.includes(x))) {
        console.log('Caught exception:', err);
        exec('pm2 restart qasim');
    }
});

export default router;
