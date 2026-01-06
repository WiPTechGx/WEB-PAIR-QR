// routes/qr.js - ES Module
import 'dotenv/config';
import { pgwizId, removeFile } from '../gift/index.js';
import QRCode from 'qrcode';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pino from 'pino';
import pkg from '@whiskeysockets/baileys';
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = pkg;
import { Storage } from 'megajs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

const sessionDir = path.join(__dirname, "session");

async function uploadToMega(localPath, remoteName) {
    return new Promise((resolve, reject) => {
        try {
            const storage = new Storage({
                email: MEGA_EMAIL,
                password: MEGA_PASSWORD,
                userAgent: 'Mozilla/5.0'
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
                            resolve({ link: `PGWIZ~${fileInfo}`, fullLink: link, file });
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

    async function PGWIZ_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        const userSessionPath = path.join(sessionDir, id);
        if (!fs.existsSync(userSessionPath)) fs.mkdirSync(userSessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);

        try {
            let sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                syncFullHistory: false
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !responseSent && !res.headersSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    res.send(`
                        <!DOCTYPE html>
                        <html><head><title>PGWIZ QR</title>
                        <style>
                            body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fff;font-family:sans-serif;}
                            .qr{padding:20px;background:#fff;border-radius:20px;box-shadow:0 10px 40px rgba(0,153,255,.2);text-align:center;}
                            img{width:280px;height:280px;}
                            h2{color:#0099ff;margin-bottom:15px;}
                            a{display:inline-block;margin-top:15px;padding:12px 24px;background:linear-gradient(135deg,#0099ff,#00d4aa);color:#fff;text-decoration:none;border-radius:25px;}
                        </style>
                        </head><body>
                        <div class="qr">
                            <h2>PGWIZ SESSION</h2>
                            <img src="${qrImage}" alt="QR"/>
                            <p>Scan with WhatsApp</p>
                            <a href="/">Back</a>
                        </div>
                        </body></html>
                    `);
                    responseSent = true;
                }

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
                    PGWIZ_QR_CODE();
                }
            });
        } catch (err) {
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ error: "Service unavailable" });
            }
            await cleanUpSession();
        }
    }

    await PGWIZ_QR_CODE();
});

export default router;