// routes/pair.js - ES Module with HANS-PAIR-SITE logic
import 'dotenv/config';
import { pgwizId, removeFile, generateRandomCode } from '../gift/index.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import * as baileys from '@whiskeysockets/baileys';
import { Storage } from 'megajs';

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = baileys;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

// Use /tmp for Vercel (read-only filesystem except /tmp)
const sessionDir = '/tmp/sessions';

async function uploadToMega(localPath, remoteName) {
    return new Promise((resolve, reject) => {
        try {
            const storage = new Storage({
                email: MEGA_EMAIL,
                password: MEGA_PASSWORD,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }, (error) => {
                if (error) return reject(error);

                try {
                    const uploadStream = storage.upload({
                        name: remoteName,
                        allowUploadBuffering: true
                    });

                    fs.createReadStream(localPath).pipe(uploadStream);

                    storage.on('add', (file) => {
                        file.link((err, link) => {
                            if (err) return reject(err);

                            let fileInfo = '';
                            if (link.includes('/file/')) {
                                fileInfo = link.split('/file/')[1];
                            } else if (link.includes('/#!')) {
                                fileInfo = link.split('/#!')[1].replace('!', '#');
                            } else {
                                fileInfo = link;
                            }

                            storage.close();
                            resolve({ link: `PGWIZ~${fileInfo}`, fullLink: link });
                        });
                    });

                    storage.on('error', reject);
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

router.get('/', async (req, res) => {
    const id = pgwizId();
    let num = req.query.number || '';
    let responseSent = false;
    let sessionCleanedUp = false;
    let sessionSent = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (e) {
                console.error("Cleanup error:", e);
            }
            sessionCleanedUp = true;
        }
    }

    async function PGWIZ_PAIR_CODE() {
        // Use hardcoded version
        const version = [2, 3000, 1015901307];
        console.log("Using Baileys version:", version);

        const userSessionPath = path.join(sessionDir, id);
        if (!fs.existsSync(userSessionPath)) fs.mkdirSync(userSessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);

        try {
            let sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = (num || '').replace(/[^0-9]/g, '');
                const randomCode = generateRandomCode();
                const code = await sock.requestPairingCode(num, randomCode);

                if (!responseSent && !res.headersSent) {
                    res.json({ code });
                    responseSent = true;
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                try {
                    const { connection, lastDisconnect } = s;

                    if (connection === "open") {
                        await delay(5000);

                        // Retry mechanism for session data
                        let sessionData = null;
                        let attempts = 0;
                        const maxAttempts = 15;

                        while (attempts < maxAttempts && !sessionData) {
                            try {
                                const credsPath = path.join(userSessionPath, "creds.json");
                                if (fs.existsSync(credsPath)) {
                                    const data = fs.readFileSync(credsPath);
                                    if (data && data.length > 100) {
                                        sessionData = data;
                                        break;
                                    }
                                }
                                await delay(3000);
                                attempts++;
                            } catch (e) {
                                console.error("Read error:", e);
                                await delay(2000);
                                attempts++;
                            }
                        }

                        if (!sessionData) {
                            console.error("No session data found");
                            await cleanUpSession();
                            return;
                        }

                        const tempFilename = `pgwiz_session_${id}.json`;
                        const tempPath = path.join('/tmp', tempFilename);
                        fs.writeFileSync(tempPath, sessionData);

                        // Retry upload
                        let uploaded = false;
                        let uploadAttempts = 0;
                        const maxUploadAttempts = 4;
                        let megaLink = null;

                        while (uploadAttempts < maxUploadAttempts && !uploaded) {
                            try {
                                uploadAttempts++;
                                const result = await uploadToMega(tempPath, tempFilename);
                                megaLink = result.link;
                                uploaded = true;
                            } catch (e) {
                                console.error(`Upload attempt ${uploadAttempts} failed:`, e);
                                await delay(3000);
                            }
                        }

                        try { fs.unlinkSync(tempPath); } catch (e) { }

                        if (!uploaded || !megaLink) {
                            console.error("Failed to upload");
                            await cleanUpSession();
                            return;
                        }

                        // Send session to user
                        try {
                            const messageText = `
╭━━━━━━━━━━━━━━━━━╮
┃ *PGWIZ SESSION* ┃
╰━━━━━━━━━━━━━━━━━╯

✅ Session successfully uploaded!

📁 *Session ID:*
\`\`\`${megaLink}\`\`\`

🔗 *Website:*
https://pgwiz.cloud

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘɢᴡɪᴢ*
`.trim();

                            await sock.sendMessage(sock.user.id, { text: messageText });
                            console.log("✅ First message sent!");

                            await delay(1000);
                            await sock.sendMessage(sock.user.id, { text: megaLink });
                            console.log("✅ Session ID sent!");
                        } catch (e) {
                            console.error("Send error:", e);
                        }

                        await delay(2000);
                        sessionSent = true;
                        try { await sock.ws.close(); } catch (e) { }
                        await cleanUpSession();

                    } else if (connection === "close" && !sessionSent && lastDisconnect?.error?.output?.statusCode != 401) {
                        console.log("Connection closed, reconnecting...");
                        await delay(5000);
                        PGWIZ_PAIR_CODE();
                    }
                } catch (e) {
                    console.error("connection.update error:", e);
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await PGWIZ_PAIR_CODE();
    } catch (e) {
        console.error("Final error:", e);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

export default router;