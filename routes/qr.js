// routes/qr.js - CommonJS with PGWIZ branding
require('dotenv').config();
const {
    pgwizId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Storage } = require('megajs');
const { storeSession } = require('../lib/supabase');

const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

const sessionDir = path.join(__dirname, "session");

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
                            resolve({ fullLink: link, fileInfo: fileInfo });
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
        console.log("Baileys version:", version);

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
                keepAliveIntervalMs: 30000,
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                try {
                    const { connection, lastDisconnect, qr } = s;

                    if (qr && !responseSent && !res.headersSent) {
                        const qrImage = await QRCode.toDataURL(qr);
                        res.send(`
                            <!DOCTYPE html>
                            <html><head>
                            <title>PGWIZ | QR CODE</title>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fff;font-family:sans-serif;text-align:center;}
                                .container{max-width:400px;padding:20px;}
                                .qr-box{padding:20px;background:#fff;border-radius:20px;box-shadow:0 10px 40px rgba(0,153,255,.2);}
                                img{width:280px;height:280px;}
                                h2{color:#0099ff;margin-bottom:15px;background:linear-gradient(135deg,#0099ff,#00d4aa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
                                p{color:#666;margin:15px 0;}
                                a{display:inline-block;margin-top:15px;padding:12px 24px;background:linear-gradient(135deg,#0099ff,#00d4aa);color:#fff;text-decoration:none;border-radius:25px;font-weight:bold;}
                            </style>
                            </head><body>
                            <div class="container">
                                <div class="qr-box">
                                    <h2>PGWIZ SESSION</h2>
                                    <img src="${qrImage}" alt="QR Code"/>
                                    <p>Scan with WhatsApp to connect</p>
                                    <a href="/">Back</a>
                                </div>
                            </div>
                            </body></html>
                        `);
                        responseSent = true;
                    }

                    if (connection === "open") {
                        await delay(5000);

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
                        const tempPath = path.join(__dirname, tempFilename);
                        fs.writeFileSync(tempPath, sessionData);

                        let uploaded = false;
                        let uploadAttempts = 0;
                        const maxUploadAttempts = 4;
                        let megaLink = null;

                        while (uploadAttempts < maxUploadAttempts && !uploaded) {
                            try {
                                uploadAttempts++;
                                const result = await uploadToMega(tempPath, tempFilename);
                                megaLink = result.fullLink;
                                uploaded = true;

                                // Store in Supabase with simple session ID
                                await storeSession(id, megaLink, null, 'qr');
                                console.log('Session stored with ID:', id);
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

                        try {
                            const messageText = `
╭━━━━━━━━━━━━━━━━━╮
┃ *PGWIZ SESSION* ┃
╰━━━━━━━━━━━━━━━━━╯

✅ Session successfully uploaded!

📁 *Session ID:*
\`\`\`${id}\`\`\`

🔗 *Download:*
https://session-s.pgwiz.cloud/download?id=${id}

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘɢᴡɪᴢ*
`.trim();

                            await sock.sendMessage(sock.user.id, { text: messageText });
                            console.log("✅ First message sent!");

                            await delay(1000);
                            await sock.sendMessage(sock.user.id, { text: id });
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
                        PGWIZ_QR_CODE();
                    }
                } catch (e) {
                    console.error("connection.update error:", e);
                }
            });
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ error: "Service unavailable" });
            }
            await cleanUpSession();
        }
    }

    try {
        await PGWIZ_QR_CODE();
    } catch (e) {
        console.error("Final error:", e);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ error: "Service Error" });
        }
    }
});

module.exports = router;