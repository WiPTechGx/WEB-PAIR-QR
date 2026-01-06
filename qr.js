import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import { exec } from 'child_process';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

const MESSAGE = `
*SESSION GENERATED SUCCESSFULLY* ✅

*Gɪᴠᴇ ᴀ ꜱᴛᴀʀ ᴛᴏ ʀᴇᴘᴏ* 🌟
https://github.com/GlobalTechInfo/MEGA-MD

*SUPPORT GROUP* 💭
https://t.me/GlobalTechInfo
https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07

*YOUTUBE TUTORIALS* 🪄 
https://youtube.com/@GlobalTechInfo

*MEGA-MD--WHATSAPP-BOT* 🥀
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
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;
    if (!fs.existsSync('./qr_sessions')) await fs.mkdir('./qr_sessions', { recursive: true });

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
                browser: Browsers.windows('Chrome'),
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

            const cleanup = async () => {
                try {
                    sock.end(undefined); // Close connection cleanly
                } catch { }
                await delay(2000); // Wait for release
                await removeFile(dirs);
            };

            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !qrGenerated) await handleQRCode(qr);

                if (connection === 'open') {
                    try {
                        const credsFile = dirs + '/creds.json';
                        if (fs.existsSync(credsFile)) {
                            // 1. Try MEGA Upload
                            const megaUrl = await upload(fs.createReadStream(credsFile), `${Date.now()}.json`);

                            const userJid = Object.keys(sock.authState.creds.me || {}).length > 0
                                ? jidNormalizedUser(sock.authState.creds.me.id)
                                : null;

                            if (userJid) {
                                // 2. Send MEGA Link if available
                                if (megaUrl) {
                                    console.log('📄 Session uploaded to MEGA:', megaUrl);
                                    await sock.sendMessage(userJid, { text: `📄 Your session ID: ${megaUrl}` });
                                } else {
                                    console.log('MEGA credentials missing or upload failed.');
                                    await sock.sendMessage(userJid, { text: "⚠️ MEGA Upload Skipped: Check your server logs/env credentials." });
                                }

                                // 3. ALWAYS Send creds.json directly as backup
                                await sock.sendMessage(userJid, {
                                    document: { url: credsFile },
                                    mimetype: 'application/json',
                                    fileName: 'creds.json',
                                    caption: MESSAGE
                                });
                            }
                        }

                        // Delay cleanup to ensure message is sent
                        setTimeout(cleanup, 20000);

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
