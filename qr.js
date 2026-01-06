import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import { exec } from 'child_process';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import { upload } from './mega.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

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

// Global map to keep sockets alive
const activeSessions = new Map();

router.get('/', async (req, res) => {
    let customId = req.query.sessionId || '';
    customId = customId.replace(/[^a-zA-Z0-9]/g, '');
    const randomID = Math.random().toString(36).substring(2, 6);
    const sessionId = customId ? `pgwiz-${customId}` : `pgwiz-${randomID}`;

    const dirs = path.join(SESSIONS_ROOT, sessionId);

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
            let credsSent = false;

            const socketConfig = {
                version,
                logger: pino({ level: 'silent' }),
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
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

            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log(`[${sessionId}] Connection: ${connection}, Error: ${lastDisconnect?.error?.message || 'none'}`);

                if (qr && !qrGenerated) await handleQRCode(qr);

                if (connection === 'open') {
                    reconnectAttempts = 0;
                    console.log(`[${sessionId}] Connection open!`);

                    if (!credsSent) {
                        credsSent = true;
                        try {
                            const credsFile = path.join(dirs, 'creds.json');
                            const uniqueCredsFile = path.join(dirs, `${sessionId}.json`);

                            await delay(500);

                            if (fs.existsSync(credsFile)) {
                                console.log(`[${sessionId}] Creds file found`);
                                fs.copySync(credsFile, uniqueCredsFile);

                                const userJid = Object.keys(sock.authState.creds.me || {}).length > 0
                                    ? jidNormalizedUser(sock.authState.creds.me.id)
                                    : null;

                                if (userJid) {
                                    // Send session ID (not MEGA link)
                                    console.log(`[${sessionId}] Sending session ID...`);
                                    await sock.sendMessage(userJid, { text: `Session ID: ${sessionId}` });

                                    // Wait to prevent conflict
                                    await delay(2000);

                                    // Send creds file
                                    console.log(`[${sessionId}] Sending creds file...`);
                                    await sock.sendMessage(userJid, {
                                        document: { url: uniqueCredsFile },
                                        mimetype: 'application/json',
                                        fileName: 'creds.json',
                                        caption: MESSAGE
                                    });
                                    console.log(`[${sessionId}] ✅ Session file sent!`);

                                    // ✅ PURE GENERATOR: End socket to avoid conflicts
                                    console.log(`[${sessionId}] ✅ Session generated. Ending socket to avoid conflicts...`);
                                    await delay(1000);
                                    try { sock.end(undefined); } catch { }

                                    // MEGA upload in background (don't wait, don't send link)
                                    (async () => {
                                        try {
                                            await delay(3000); // Wait for session to stabilize
                                            console.log(`[${sessionId}] Uploading to MEGA...`);
                                            const megaUrl = await upload(fs.createReadStream(credsFile), `${sessionId}.json`);
                                            if (megaUrl) {
                                                console.log(`[${sessionId}] 📄 MEGA: ${megaUrl}`);
                                                const metaFile = path.join(dirs, 'meta.json');
                                                await fs.writeJson(metaFile, { sessionId, megaUrl, createdAt: new Date().toISOString() });
                                            }
                                        } catch (e) {
                                            console.error(`[${sessionId}] MEGA upload error:`, e.message);
                                        }
                                    })();

                                } else {
                                    console.error(`[${sessionId}] User JID not found`);
                                }
                            }
                        } catch (err) {
                            console.error(`[${sessionId}] Error sending session:`, err.message);
                        }
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const isLoggedOut = statusCode === 401;

                    console.log(`[${sessionId}] Closed. Status: ${statusCode}, LoggedOut: ${isLoggedOut}, CredsSent: ${credsSent}`);

                    // 401 = session is dead, don't reconnect (but files are preserved)
                    if (isLoggedOut) {
                        console.log(`[${sessionId}] 401 from WhatsApp. Session invalid. Use /load to reconnect later.`);
                        return;
                    }

                    // If creds already sent, we're done - don't reconnect (pure generator mode)
                    if (credsSent) {
                        console.log(`[${sessionId}] Creds sent. Generator done. Use /load to reconnect.`);
                        return;
                    }

                    // Still generating (creds not sent yet) - reconnect
                    reconnectAttempts++;
                    console.log(`[${sessionId}] Still generating. Reconnect attempt ${reconnectAttempts}...`);

                    if (reconnectAttempts <= 5) {
                        setTimeout(async () => {
                            try {
                                const { state: freshState, saveCreds: freshSaveCreds } = await useMultiFileAuthState(dirs);
                                const { version: freshVersion } = await fetchLatestBaileysVersion();
                                sock = makeWASocket({
                                    version: freshVersion,
                                    logger: pino({ level: 'silent' }),
                                    browser: ['Ubuntu', 'Chrome', '20.0.04'],
                                    auth: {
                                        creds: freshState.creds,
                                        keys: makeCacheableSignalKeyStore(freshState.keys, pino({ level: 'fatal' })),
                                    },
                                    markOnlineOnConnect: false,
                                    connectTimeoutMs: 120000,
                                    keepAliveIntervalMs: 30000,
                                });
                                sock.ev.on('connection.update', handleConnectionUpdate);
                                sock.ev.on('creds.update', freshSaveCreds);
                            } catch (err) {
                                console.error(`[${sessionId}] Reconnect failed:`, err.message);
                            }
                        }, 3000);
                    }
                }
            };

            sock.ev.on('connection.update', handleConnectionUpdate);
            sock.ev.on('creds.update', saveCreds);

            setTimeout(() => {
                if (!responseSent) res.status(408).send({ code: 'QR generation timeout' });
            }, 60000);

        } catch (err) {
            console.error('Error initializing session:', err);
            exec('pm2 restart qasim');
            if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
        }
    }

    await initiateSession();
});

// Disconnect endpoint
router.post('/disconnect/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (session) {
        try {
            await session.sock.end(undefined);
            activeSessions.delete(sessionId);
            res.json({ message: 'Session disconnected' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to disconnect' });
        }
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Get active sessions
router.get('/active', (req, res) => {
    const sessions = [];
    for (const [sessionId, data] of activeSessions) {
        sessions.push({ sessionId, createdAt: data.createdAt });
    }
    res.json({ activeSessions: sessions });
});

process.on('uncaughtException', (err) => {
    const e = String(err);
    const ignore = ["conflict", "not-authorized", "Socket connection timeout", "rate-overlimit",
        "Connection Closed", "Timed Out", "Value not found", "Stream Errored", "statusCode: 515", "statusCode: 503"];
    if (!ignore.some(x => e.includes(x))) {
        console.log('Caught exception:', err);
        exec('pm2 restart qasim');
    }
});

export default router;
