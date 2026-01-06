import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    Browsers
} from '@whiskeysockets/baileys';
import { upload } from './mega.js';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const SESSIONS_ROOT = process.env.VERCEL
    ? path.join(os.tmpdir(), 'sessions')
    : path.join(__dirname, 'sessions');

const MESSAGE = `*SESSION GENERATED SUCCESSFULLY* ✅

*Made with love by pgwiz* 🥀
profile: https://pgwiz.cloud`;

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

        // CRITICAL: Use useMultiFileAuthState correctly
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();
            console.log(`[${sessionId}] Baileys version: ${version.join('.')}`);

            let qrGenerated = false;
            let responseSent = false;
            let credsSent = false;

            // PROPER Baileys configuration
            const sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'), // Use Baileys' built-in browser
                auth: state, // IMPORTANT: Pass state directly, not nested
                syncFullHistory: false,
                markOnlineOnConnect: false,
                // Remove these - they can cause issues:
                // defaultQueryTimeoutMs, connectTimeoutMs, retryRequestDelayMs
            });

            // CRITICAL: Save creds on EVERY update
            sock.ev.on('creds.update', saveCreds);

            // Handle QR code
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr, isNewLogin } = update;

                console.log(`[${sessionId}] Connection: ${connection}`);

                // Generate QR if provided
                if (qr && !qrGenerated) {
                    qrGenerated = true;
                    try {
                        const qrDataURL = await QRCode.toDataURL(qr, {
                            errorCorrectionLevel: 'H',
                            width: 400
                        });

                        if (!responseSent) {
                            responseSent = true;
                            res.json({
                                qr: qrDataURL,
                                message: 'QR Code Generated! Scan with WhatsApp',
                                sessionId,
                                instructions: [
                                    '1. Open WhatsApp on your phone',
                                    '2. Go to Settings > Linked Devices',
                                    '3. Tap "Link a Device"',
                                    '4. Scan the QR code above'
                                ]
                            });
                        }
                    } catch (err) {
                        console.error(`[${sessionId}] QR generation error:`, err);
                        if (!responseSent) {
                            res.status(500).json({ error: 'QR generation failed' });
                        }
                    }
                }

                // Connection opened successfully
                if (connection === 'open') {
                    console.log(`[${sessionId}] ✅ Connected to WhatsApp!`);

                    if (!credsSent) {
                        credsSent = true;

                        try {
                            // Wait for creds to be fully written
                            await delay(2000);

                            const credsFile = path.join(dirs, 'creds.json');

                            if (!fs.existsSync(credsFile)) {
                                console.error(`[${sessionId}] ❌ Creds file not found after connection!`);
                                return;
                            }

                            // Verify creds file has content
                            const credsContent = await fs.readJson(credsFile);
                            if (!credsContent.me || !credsContent.me.id) {
                                console.error(`[${sessionId}] ❌ Invalid creds file - missing user ID`);
                                await delay(3000); // Wait longer
                                return;
                            }

                            console.log(`[${sessionId}] Creds validated. User: ${credsContent.me.id}`);

                            // Create session file copy
                            const uniqueCredsFile = path.join(dirs, `${sessionId}.json`);
                            fs.copySync(credsFile, uniqueCredsFile);

                            // Get user JID properly
                            const userJid = credsContent.me.id;

                            // Send session ID first
                            console.log(`[${sessionId}] Sending session ID to user...`);
                            await sock.sendMessage(userJid, {
                                text: `🎉 *SESSION CREATED*\n\nSession ID: \`${sessionId}\`\n\nKeep this ID safe!`
                            });

                            await delay(2000);

                            // Send creds file
                            console.log(`[${sessionId}] Sending creds file...`);
                            await sock.sendMessage(userJid, {
                                document: { url: uniqueCredsFile },
                                mimetype: 'application/json',
                                fileName: 'creds.json',
                                caption: MESSAGE
                            });

                            console.log(`[${sessionId}] ✅ Session file sent successfully!`);

                            // Wait before closing
                            await delay(3000);

                            // Close socket gracefully
                            sock.end(undefined);
                            console.log(`[${sessionId}] Socket closed. Use /load to reconnect.`);

                            // Background MEGA upload
                            (async () => {
                                try {
                                    await delay(2000);
                                    console.log(`[${sessionId}] Uploading to MEGA...`);
                                    const megaUrl = await upload(
                                        fs.createReadStream(credsFile),
                                        `${sessionId}.json`
                                    );
                                    if (megaUrl) {
                                        console.log(`[${sessionId}] 📄 MEGA: ${megaUrl}`);
                                        const metaFile = path.join(dirs, 'meta.json');
                                        await fs.writeJson(metaFile, {
                                            sessionId,
                                            megaUrl,
                                            createdAt: new Date().toISOString()
                                        });
                                    }
                                } catch (e) {
                                    console.error(`[${sessionId}] MEGA error:`, e.message);
                                }
                            })();

                        } catch (err) {
                            console.error(`[${sessionId}] Error sending session:`, err);
                        }
                    }
                }

                // Handle disconnection
                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.error;

                    console.log(`[${sessionId}] Disconnected. Code: ${statusCode}, Reason: ${reason}`);

                    // Check disconnect reasons
                    if (statusCode === DisconnectReason.badSession) {
                        console.log(`[${sessionId}] ❌ Bad session. Delete session folder and try again.`);
                        await fs.remove(dirs);
                        if (!responseSent) {
                            res.status(400).json({
                                error: 'Bad session',
                                message: 'Session corrupted. Please try again with a new session ID.'
                            });
                        }
                        return;
                    }

                    if (statusCode === DisconnectReason.connectionClosed) {
                        console.log(`[${sessionId}] Connection closed by server`);
                        // Don't retry if creds already sent
                        if (credsSent) return;
                    }

                    if (statusCode === DisconnectReason.connectionLost) {
                        console.log(`[${sessionId}] Connection lost, reconnecting...`);
                        if (!credsSent) {
                            setTimeout(() => initiateSession(), 3000);
                        }
                        return;
                    }

                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log(`[${sessionId}] ❌ Logged out. Session invalid.`);
                        await fs.remove(dirs);
                        return;
                    }

                    if (statusCode === DisconnectReason.restartRequired) {
                        console.log(`[${sessionId}] Restart required...`);
                        if (!credsSent) {
                            setTimeout(() => initiateSession(), 2000);
                        }
                        return;
                    }

                    if (statusCode === DisconnectReason.timedOut) {
                        console.log(`[${sessionId}] ⏱️  Connection timed out`);
                        if (!credsSent && !qrGenerated) {
                            if (!responseSent) {
                                res.status(408).json({ error: 'Connection timeout' });
                            }
                        }
                        return;
                    }

                    // Unknown error - retry if still generating
                    if (!credsSent) {
                        console.log(`[${sessionId}] Retrying connection...`);
                        setTimeout(() => initiateSession(), 3000);
                    }
                }
            });

            // Timeout if no QR in 60 seconds
            setTimeout(() => {
                if (!responseSent) {
                    console.log(`[${sessionId}] ⏱️  Timeout - no QR generated`);
                    res.status(408).json({ error: 'QR generation timeout' });
                    sock.end(undefined);
                }
            }, 60000);

        } catch (err) {
            console.error(`[${sessionId}] Fatal error:`, err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Session initialization failed' });
            }
        }
    }

    await initiateSession();
});

// Error handling
process.on('uncaughtException', (err) => {
    const ignore = [
        "conflict", "not-authorized", "Connection Closed",
        "Timed Out", "Stream Errored", "code 1006"
    ];

    if (!ignore.some(x => String(err).includes(x))) {
        console.error('Uncaught exception:', err);
    }
});

export default router;