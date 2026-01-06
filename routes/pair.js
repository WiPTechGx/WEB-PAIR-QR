// routes/pair.js
require('dotenv').config();
const {
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const { Storage } = require('megajs');

// Use MEGA credentials from .env
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
                if (error) {
                    return reject(error);
                }

                try {
                    const uploadStream = storage.upload({
                        name: remoteName,
                        allowUploadBuffering: true
                    });

                    fs.createReadStream(localPath).pipe(uploadStream);

                    storage.on('add', (file) => {
                        file.link((err, link) => {
                            if (err) return reject(err);

                            try {
                                let fileInfo = '';
                                if (link.includes('/file/')) {
                                    fileInfo = link.split('/file/')[1];
                                } else if (link.includes('/#!')) {
                                    fileInfo = link.split('/#!')[1].replace('!', '#');
                                } else {
                                    fileInfo = link;
                                }

                                const formattedLink = `PGWIZ~${fileInfo}`;
                                storage.close();

                                resolve({ link: formattedLink, fullLink: link, file });
                            } catch (linkErr) {
                                reject(linkErr);
                            }
                        });
                    });

                    storage.on('error', (err) => reject(err));

                } catch (uploadErr) {
                    reject(uploadErr);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number || '';
    let responseSent = false;
    let sessionCleanedUp = false;
    let sessionSent = false;  // Prevent reconnect after session is sent

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function PGWIZ_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log("Baileys version:", version);

        const userSessionPath = path.join(sessionDir, id);
        if (!fs.existsSync(userSessionPath)) fs.mkdirSync(userSessionPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(userSessionPath);

        try {
            let sock = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
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
                            } catch (readError) {
                                console.error("Read error:", readError);
                                await delay(2000);
                                attempts++;
                            }
                        }

                        if (!sessionData) {
                            console.error("No session data found, cleaning up.");
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
                                megaLink = result.link;
                                uploaded = true;
                            } catch (uploadErr) {
                                console.error(`Mega upload attempt ${uploadAttempts} failed:`, uploadErr);
                                await delay(3000);
                            }
                        }

                        try { fs.unlinkSync(tempPath); } catch (e) { }

                        if (!uploaded || !megaLink) {
                            console.error("Failed to upload to Mega, cleaning up.");
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
\`\`\`${megaLink}\`\`\`

🔗 *Profile:*
https://pgwiz.cloud

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘɢᴡɪᴢ*
`.trim();

                            await sock.sendMessage(sock.user.id, { text: messageText });
                            console.log("✅ First message sent successfully!");

                            await delay(1000);
                            await sock.sendMessage(sock.user.id, { text: megaLink });
                            console.log("✅ Session ID resent successfully!");
                        } catch (sendErr) {
                            console.error("Failed to send message:", sendErr);
                        }

                        await delay(2000);
                        sessionSent = true;  // Mark as done
                        try { await sock.ws.close(); } catch (e) { }
                        await cleanUpSession();
                        return;  // Don't process any more events

                    } else if (connection === "close" && !sessionSent && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode != 401) {
                        console.log("Connection closed unexpectedly, attempting reconnect in 5s...");
                        await delay(5000);
                        PGWIZ_PAIR_CODE();
                    }
                } catch (evtErr) {
                    console.error("connection.update handler error:", evtErr);
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await PGWIZ_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
