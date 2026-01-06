import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import pn from 'awesome-phonenumber';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { upload as megaUpload } from './mega.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Use /tmp on Vercel (read-only filesystem), local ./sessions otherwise
const SESSIONS_ROOT = process.env.VERCEL
    ? path.join(os.tmpdir(), 'sessions')
    : path.join(__dirname, 'sessions');

const MESSAGE = `
*SESSION GENERATED SUCCESSFULLY* ✅

*Made with love by pgwiz* 🥀
profile: https://pgwiz.cloud
`;

async function removeFile(pathStr) {
    if (fs.existsSync(pathStr)) await fs.remove(pathStr);
}

function randomMegaId(len = 6, numLen = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    const number = Math.floor(Math.random() * Math.pow(10, numLen));
    return `${out}${number}`;
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let customId = req.query.sessionId || '';
    // Sanitize: alphanumeric only
    customId = customId.replace(/[^a-zA-Z0-9]/g, '');

    const randomID = Math.random().toString(36).substring(2, 6);
    const sessionId = customId ? `pgwiz-${customId}` : `pgwiz-${randomID}`;

    // Use permanent sessions folder
    const dirs = path.join(SESSIONS_ROOT, sessionId);

    // Ensure sessions root exists
    if (!fs.existsSync(SESSIONS_ROOT)) {
        await fs.mkdir(SESSIONS_ROOT, { recursive: true });
    }


    num = num.replace(/[^0-9]/g, '');
    const phone = pn('+' + num);

    if (!phone.isValid()) {
        return res.status(400).send({ code: 'Invalid phone number. Use full international format without + or spaces.' });
    }

    num = phone.getNumber('e164').replace('+', '');

    async function runSession() {
        try {
            if (!fs.existsSync(dirs)) await fs.mkdir(dirs, { recursive: true });
            const { state, saveCreds } = await useMultiFileAuthState(dirs);
            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                version,
                auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                markOnlineOnConnect: false
            });

            sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
                if (connection === 'open') {
                    const credsFile = path.join(dirs, 'creds.json');
                    const uniqueCredsFile = path.join(dirs, `${sessionId}.json`);

                    if (fs.existsSync(credsFile)) {
                        try {
                            // Rename/Copy for sending with unique name
                            fs.copySync(credsFile, uniqueCredsFile);

                            const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                            await sock.sendMessage(userJid, { text: `Session ID: ${sessionId}` });

                            await sock.sendMessage(userJid, {
                                document: { url: uniqueCredsFile },
                                mimetype: 'application/json',
                                fileName: 'creds.json',
                                caption: MESSAGE
                            });

                            // Try MEGA Upload afterwards
                            try {
                                const id = randomMegaId();
                                const megaLink = await megaUpload(fs.createReadStream(credsFile), `${id}.json`);
                                if (megaLink) {
                                    const sessionId = megaLink.replace('https://mega.nz/file/', '');
                                    const m1 = await sock.sendMessage(userJid, { text: sessionId });
                                    await sock.sendMessage(userJid, { text: MESSAGE, quoted: m1 });
                                }
                            } catch (e) {
                                console.error("MEGA upload failed:", e);
                            }

                            // ✅ SESSION COMPLETE - keep socket alive for persistent connection
                            console.log("✅ Session generation complete! Keeping connection alive.");
                            console.log("📁 Session saved at:", dirs);
                            console.log("🔗 Session ID:", sessionId);
                            // DON'T close socket - keep session alive!
                            // await delay(3000);
                            // try { sock.end(undefined); } catch { }
                            // Don't call runSession() again - we're done!
                        } catch (err) {
                            console.error('Error sending session file:', err);
                            // Don't delete session - might still be valid
                        }
                    }
                }

                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    const isLoggedOut = code === 401;
                    const hasValidCreds = sock.authState?.creds?.registered === true;

                    console.log(`Connection closed. Status: ${code}, Logged out: ${isLoggedOut}`);

                    if (isLoggedOut) {
                        console.log('Session was logged out. Files preserved.');
                        // Don't reconnect - session is done
                    } else if (!sock.authState?.creds?.registered) {
                        // Only reconnect if creds not yet registered (still pairing)
                        console.log('Still pairing. Reconnecting...');
                        await delay(3000);
                        runSession();
                    } else {
                        // Session was registered but closed - this is fine, session complete
                        console.log('Session complete. Not reconnecting. Files preserved.');
                    }
                }
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                try {
                    let code = await sock.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) res.send({ code });
                } catch (err) {
                    if (!res.headersSent) res.status(503).send({ code: 'Failed to get pairing code' });
                    await removeFile(dirs);
                }
            }

            sock.ev.on('creds.update', saveCreds);

            // Set a timeout to clean up if pairing never happens
            setTimeout(async () => {
                if (!res.headersSent) {
                    // If we haven't sent a response yet (unlikely given requestPairingCode is fast), send timeout
                    // But usually response is sent immediately after requestPairingCode
                }
                // Check if directory still exists after a few minutes, clean it up
                // BUT, we need the session to stay alive until the user pairs... 
                // Baileys keeps connection open? 

            }, 60 * 1000 * 5); // 5 minutes timeout for session cleanup if not connected

        } catch (err) {
            console.error('Fatal error:', err);
            await removeFile(dirs);
            if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
        }
    }

    await runSession();
});


process.on('uncaughtException', err => {
    const e = String(err);
    const ignore = [
        "conflict", "not-authorized", "Socket connection timeout",
        "rate-overlimit", "Connection Closed", "Timed Out",
        "Value not found", "Stream Errored",
        "statusCode: 515", "statusCode: 503"
    ];
    if (!ignore.some(x => e.includes(x))) {
        console.log('Caught exception:', err);
        exec('pm2 restart qasim');
    }
});

export default router;
