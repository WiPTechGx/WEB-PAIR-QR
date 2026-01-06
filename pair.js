import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import pn from 'awesome-phonenumber';
import { exec } from 'child_process';
import os from 'os';
import path from 'path';
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

const router = express.Router();
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

// ... (imports remain the same)

router.get('/', async (req, res) => {
    let num = req.query.number;
    const randomID = Math.random().toString(36).substring(2, 6);
    const sessionId = `pgwiz-${randomID}`;
    const dirs = path.join(os.tmpdir(), `auth_info_baileys_${sessionId}`);

    if (!fs.existsSync(path.join(os.tmpdir(), 'auth_info_baileys'))) {
        // Just in case we need a parent dir, though tmpdir creates per-run usually or specific paths
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
                browser: Browsers.windows('Chrome'),
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

                            await delay(10000); // Wait for file to send before cleanup
                            // sock.end(); // Do not force close aggressively
                            await removeFile(dirs);
                        } catch (err) {
                            console.error('Error sending session file:', err);
                            await removeFile(dirs);
                        }
                    }
                }

                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code === 401) {
                        // Session invalid
                        await removeFile(dirs);
                    } else if (code !== 408 && code !== 515) {
                        // Reconnect only for restartable errors
                        // Avoiding infinite loop on generic close
                        // runSession(); 
                        // For pairing code, we might not want to aggressively reconnect if it fails initially to get code
                    } else {
                        // 
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
