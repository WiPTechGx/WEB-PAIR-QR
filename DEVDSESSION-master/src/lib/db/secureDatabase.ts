import { SessionDatabase } from "./database.js";
import { encryptIv, decryptIv, generateIv } from "../crypto.js";

export class SecureDatabase implements SessionDatabase {
    private encryptionKey: Buffer;
    constructor(private base: SessionDatabase, encryptionKey: string) {
        this.encryptionKey = Buffer.from(encryptionKey, "base64");
    }
    connect(): Promise<SessionDatabase> {
        return this.base.connect();
    }
    sessionExists(sessionKey: string): Promise<boolean> {
        return this.base.sessionExists(sessionKey);
    }
    saveSession(sessionKey: string, session: string): Promise<boolean> {
        const iv = generateIv();
        const encryptedSession = encryptIv(this.encryptionKey, iv, session);
        const sessionData = `${iv.toString("hex")}:${encryptedSession}`;
        return this.base.saveSession(sessionKey, sessionData);
    }
    async getSession(sessionKey: string): Promise<string | null> {
        const sessionData: string | null = await this.base.getSession(
            sessionKey
        );
        if (!sessionData) return null;
        const [iv, encryptedSession] = sessionData.split(":");
        return decryptIv(
            this.encryptionKey,
            Buffer.from(iv, "hex"),
            encryptedSession
        );
    }
    resetSession(sessionKey: string): Promise<boolean> {
        return this.base.resetSession(sessionKey);
    }
    disconnect(): Promise<void> {
        return this.base.disconnect();
    }
}
