import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import { exec } from 'child_process';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

import os from 'os';
import path from 'path';

const router = express.Router();

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
    const randomID = Math.random().toString(36).substring(2, 6);
    const sessionId = `pgwiz-${randomID}`;
    const dirs = path.join(os.tmpdir(), `qr_sessions`, `session_${sessionId}`);

    if (!fs.existsSync(path.join(os.tmpdir(), 'qr_sessions'))) {
        await fs.mkdir(path.join(os.tmpdir(), 'qr_sessions'), { recursive: true });
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
                // sock.end(undefined); // Removed to avoid killing session aggressively
                await delay(10000); // Wait a bit longer
                await removeFile(dirs);
            };

            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !qrGenerated) await handleQRCode(qr);

                if (connection === 'open') {
                    try {
                        const credsFile = path.join(dirs, 'creds.json');
                        const uniqueCredsFile = path.join(dirs, `${sessionId}.json`);

                        if (fs.existsSync(credsFile)) {
                            // Rename/Copy for sending with unique name
                            fs.copySync(credsFile, uniqueCredsFile);

                            const userJid = Object.keys(sock.authState.creds.me || {}).length > 0
                                ? jidNormalizedUser(sock.authState.creds.me.id)
                                : null;

                            if (userJid) {
                                await sock.sendMessage(userJid, { text: `Session ID: ${sessionId}` });

                                // Send the file as 'creds.json' as requested, but from the Unique ID file source
                                await sock.sendMessage(userJid, {
                                    document: { url: uniqueCredsFile },
                                    mimetype: 'application/json',
                                    fileName: 'creds.json',
                                    caption: MESSAGE
                                });
                            }
                        }

                        // Delay cleanup significantly to ensure file transfer completes
                        setTimeout(cleanup, 30000);

                    } catch (err) {
                        console.error('Error sending session:', err);
                        cleanup();
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 401) cleanup();
                    else if ([503, 515].includes(statusCode)) {
                        reconnectAttempts++;
                        if (reconnectAttempts <= maxReconnectAttempts) {
                            setTimeout(() => {
                                try {
                                    sock = makeWASocket(socketConfig);
                                    sock.ev.on('connection.update', handleConnectionUpdate);
                                    sock.ev.on('creds.update', saveCreds);
                                } catch (err) { console.error('Reconnect failed:', err); }
                            }, 2000);
                        } else {
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
