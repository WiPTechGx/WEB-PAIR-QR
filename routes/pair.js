// routes/pair.js - ES Module
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
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = baileys;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

const sessionDir = path.join(__dirname, "session");

async function uploadToMega(localPath, remoteName) {
    return new Promise((resolve, reject) => {
        const storage = new Storage({
            email: MEGA_EMAIL,
            password: MEGA_PASSWORD,
            userAgent: 'Mozilla/5.0'
        }, (error) => {
            if (error) return reject(error);

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
        });
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
            } catch (e) { }
            sessionCleanedUp = true;
        }
    }

    async function PGWIZ_PAIR_CODE() {
        // Use hardcoded version if fetchLatestBaileysVersion fails
        let version;
        try {
            if (typeof fetchLatestBaileysVersion === 'function') {
                const result = await fetchLatestBaileysVersion();
                version = result.version;
            } else {
                version = [2, 3000, 1015901307];
            }
        } catch (e) {
            version = [2, 3000, 1015901307];
        }

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
                connectTimeoutMs: 60000
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
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(5000);
                    const credsPath = path.join(userSessionPath, "creds.json");

                    if (fs.existsSync(credsPath)) {
                        const data = fs.readFileSync(credsPath);
                        if (data.length > 100) {
                            const tempPath = path.join(__dirname, `pgwiz_${id}.json`);
                            fs.writeFileSync(tempPath, data);

                            try {
                                const result = await uploadToMega(tempPath, `pgwiz_${id}.json`);
                                fs.unlinkSync(tempPath);

                                const msg = `╭━━━━━━━━━━━━━━━╮\n┃ *PGWIZ SESSION* ┃\n╰━━━━━━━━━━━━━━━╯\n\n✅ Session uploaded!\n\n📁 *Session ID:*\n\`\`\`${result.link}\`\`\`\n\n🔗 https://pgwiz.cloud\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘɢᴡɪᴢ*`;
                                await sock.sendMessage(sock.user.id, { text: msg });
                                await delay(1000);
                                await sock.sendMessage(sock.user.id, { text: result.link });
                            } catch (e) {
                                console.error("Upload error:", e);
                            }
                        }
                    }

                    await delay(2000);
                    sessionSent = true;
                    try { await sock.ws.close(); } catch (e) { }
                    await cleanUpSession();
                } else if (connection === "close" && !sessionSent && lastDisconnect?.error?.output?.statusCode != 401) {
                    await delay(5000);
                    PGWIZ_PAIR_CODE();
                }
            });

        } catch (err) {
            console.error("Socket error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service Unavailable" });
            }
            await cleanUpSession();
        }
    }

    await PGWIZ_PAIR_CODE();
});

export default router;