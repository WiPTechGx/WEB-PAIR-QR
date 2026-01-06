import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import * as baileys from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { upload } from './mega.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Use /tmp on Vercel (read-only filesystem), local ./sessions otherwise
const SESSIONS_ROOT = process.env.VERCEL
    ? path.join(os.tmpdir(), 'sessions')
    : path.join(__dirname, 'sessions');

const MESSAGE = `*SESSION GENERATED SUCCESSFULLY* ✅

*Made with love by pgwiz* 🥀
profile: https://pgwiz.cloud`;

const logger = pino({ level: 'silent' });

/**
 * Generate a unique session key
 */
function generateSessionKey(prefix) {
    const firstPart = Date.now().toString(36).substring(2, 6).toUpperCase();
    const secondPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${firstPart}-${secondPart}`;
}

/**
 * Create a session with Baileys - DEVDSESSION pattern
 * @param {string} sessionPath - Path to store session files
 * @param {string|undefined} phone - Phone number for pairing code (undefined for QR)
 * @param {Function} callback - Called with (error, sock, session)
 * @returns {Promise<string>} - QR string or pairing code
 */
function createSession(sessionPath, phone, callback) {
    return new Promise(async (resolve) => {
        const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionPath);

        const sock = baileys.makeWASocket({
            auth: state,
            logger: logger.child({}, { level: 'silent' }),
            printQRInTerminal: false,
            browser: baileys.Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: false,
        });

        sock.ev.on('creds.update', saveCreds);

        let fetched = false;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

                if (reason === baileys.DisconnectReason.restartRequired) {
                    // Restart required - retry
                    sock.ev.removeAllListeners('connection.update');
                    sock.end(undefined);
                    createSession(sessionPath, phone, callback).then(resolve);
                } else {
                    // Other disconnect - report error
                    await callback(lastDisconnect?.error);
                }
                return;
            }

            if (connection === 'open') {
                console.log('✅ Connection opened successfully');

                // Read session from file and call callback
                const sessionFile = path.join(sessionPath, 'creds.json');
                try {
                    // Wait a moment for creds to be fully written
                    await baileys.delay(1000);
                    const session = await fs.readFile(sessionFile, { encoding: 'utf8' });
                    await callback(undefined, sock, session);
                } catch (err) {
                    await callback(err);
                }

                // DON'T close socket - let the session stay alive
                // WhatsApp needs the connection to remain for a while
                console.log('✅ Session sent. Connection will stay open for WhatsApp to stabilize.');

                // After 30 seconds, gracefully close (WhatsApp should be happy by then)
                setTimeout(() => {
                    console.log('📴 Closing socket after stabilization period');
                    try { sock.end(undefined); } catch { }
                }, 30000);

                return;
            }

            // Handle QR/Pairing code
            if (fetched) return;
            if (qr) {
                if (phone) {
                    // Request pairing code
                    try {
                        const code = await sock.requestPairingCode(phone);
                        resolve(code);
                    } catch (err) {
                        console.error('Pairing code error:', err);
                        resolve('ERROR');
                    }
                } else {
                    // Return QR string
                    resolve(qr);
                }
                fetched = true;
            }
        });
    });
}

/**
 * Handle session creation - send to user and store
 */
async function handleSessionCreation(sessionPath, sessionId, phone) {
    return await createSession(sessionPath, phone, async (error, sock, session) => {
        if (sock && session) {
            try {
                // Send session key to user
                await sock.sendMessage(sock.user.id, {
                    text: `🎉 *Session Created*\n\nSession ID: \`${sessionId}\`\n\n_Keep this ID safe!_`
                });

                await baileys.delay(1000);

                // Send creds file
                const credsFile = path.join(sessionPath, 'creds.json');
                await sock.sendMessage(sock.user.id, {
                    document: { url: credsFile },
                    mimetype: 'application/json',
                    fileName: 'creds.json',
                    caption: MESSAGE
                });

                console.log(`✅ Session ${sessionId} sent to user`);

                // Upload to MEGA in background
                (async () => {
                    try {
                        const megaUrl = await upload(fs.createReadStream(credsFile), `${sessionId}.json`);
                        if (megaUrl) {
                            console.log(`📄 MEGA: ${megaUrl}`);
                            const metaFile = path.join(sessionPath, 'meta.json');
                            await fs.writeJson(metaFile, { sessionId, megaUrl, createdAt: new Date().toISOString() });
                        }
                    } catch (e) {
                        console.error('MEGA upload error:', e.message);
                    }
                })();

            } catch (err) {
                console.error('Error sending session:', err);
            }
        } else if (error) {
            console.error('Session creation error:', error);
        }
    });
}

// QR Route
router.get('/', async (req, res) => {
    let customId = req.query.sessionId || '';
    customId = customId.replace(/[^a-zA-Z0-9]/g, '');
    const sessionId = customId ? `pgwiz-${customId}` : generateSessionKey('pgwiz');
    const sessionPath = path.join(SESSIONS_ROOT, sessionId);

    // Ensure sessions directory exists
    await fs.ensureDir(SESSIONS_ROOT);
    await fs.ensureDir(sessionPath);

    try {
        console.log(`[${sessionId}] Starting QR session...`);
        const qrString = await handleSessionCreation(sessionPath, sessionId, undefined);

        // Convert QR string to data URL
        const qrDataURL = await QRCode.toDataURL(qrString, {
            errorCorrectionLevel: 'H',
            width: 400
        });

        res.json({
            qr: qrDataURL,
            sessionId,
            message: 'Scan the QR code with WhatsApp',
            instructions: [
                '1. Open WhatsApp on your phone',
                '2. Go to Settings > Linked Devices',
                '3. Tap "Link a Device"',
                '4. Scan the QR code above'
            ]
        });

    } catch (err) {
        console.error(`[${sessionId}] Error:`, err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Session creation failed', details: err.message });
        }
    }
});

// Error handling - suppress harmless Baileys errors after socket close
process.on('uncaughtException', (err) => {
    const ignore = [
        'conflict', 'not-authorized', 'Connection Closed', 'Timed Out',
        'Stream Errored', 'Request Time-out', '1006', 'statusCode: 408'
    ];
    if (!ignore.some(x => String(err).includes(x))) {
        console.error('Uncaught exception:', err);
    }
});

export default router;