// Vercel Serverless Function: /api/code
// Generates pairing code using Baileys

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const { Storage } = require("megajs");

function generateId(num = 4) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < num; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function generateRandomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function removeFile(filePath) {
    if (fs.existsSync(filePath)) {
        await fs.promises.rm(filePath, { recursive: true, force: true });
    }
}

async function uploadToMega(localPath, remoteName) {
    const MEGA_EMAIL = process.env.MEGA_EMAIL;
    const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

    if (!MEGA_EMAIL || !MEGA_PASSWORD) {
        console.log("MEGA credentials not configured");
        return null;
    }

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

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const num = (req.query.number || '').replace(/[^0-9]/g, '');

    if (!num || num.length < 10 || num.length > 15) {
        return res.status(400).json({
            error: 'Invalid phone number',
            code: 'INVALID_PHONE'
        });
    }

    const id = generateId();
    const sessionDir = path.join('/tmp', 'sessions', id);

    try {
        // Create session directory
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { version } = await fetchLatestBaileysVersion();
        console.log("Baileys version:", version);

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000
        });

        // Request pairing code
        if (!sock.authState.creds.registered) {
            await delay(1500);
            const randomCode = generateRandomCode();
            const code = await sock.requestPairingCode(num, randomCode);

            // Set up connection handler in background
            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection } = update;

                if (connection === 'open') {
                    console.log('✅ Connection opened');
                    await delay(5000);

                    // Read and upload session
                    const credsPath = path.join(sessionDir, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        try {
                            const tempFilename = `pgwiz_session_${id}.json`;
                            const result = await uploadToMega(credsPath, tempFilename);

                            if (result) {
                                const messageText = `
╭━━━━━━━━━━━━━━━━━╮
┃ *PGWIZ SESSION* ┃
╰━━━━━━━━━━━━━━━━━╯

✅ Session successfully uploaded!

📁 *Session ID:*
\`\`\`${result.link}\`\`\`

🔗 *Website:*
https://pgwiz.cloud

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴘɢᴡɪᴢ*
`.trim();

                                await sock.sendMessage(sock.user.id, { text: messageText });
                                await delay(1000);
                                await sock.sendMessage(sock.user.id, { text: result.link });
                                console.log('✅ Session sent to user');
                            }
                        } catch (e) {
                            console.error('Upload error:', e);
                        }
                    }

                    await delay(2000);
                    try { await sock.ws.close(); } catch (e) { }
                    await removeFile(sessionDir);
                }
            });

            return res.status(200).json({ code });
        } else {
            return res.status(400).json({
                error: 'Already registered',
                code: 'ALREADY_REGISTERED'
            });
        }
    } catch (error) {
        console.error('Error:', error);
        await removeFile(sessionDir);
        return res.status(500).json({
            error: 'Service temporarily unavailable',
            code: 'SERVICE_ERROR',
            details: error.message
        });
    }
};
