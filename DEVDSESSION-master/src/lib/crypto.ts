import {
    randomBytes,
    createCipheriv,
    createDecipheriv,
    publicEncrypt,
} from "node:crypto";

export function generateIv(): Buffer {
    return randomBytes(16);
}

export function encryptIv(key: Buffer, iv: Buffer, data: string): string {
    const cipher = createCipheriv("aes256", key, iv);
    const encryptedMessage =
        cipher.update(data, "utf8", "hex") + cipher.final("hex");
    return encryptedMessage;
}

export function decryptIv(key: Buffer, iv: Buffer, data: string): string {
    const decipher = createDecipheriv("aes256", key, iv);
    const decryptedMessage =
        decipher.update(data, "hex", "utf8") + decipher.final("utf8");
    return decryptedMessage;
}

export function encryptSessionWithKey(publicKey: string, session: string) {
    const key = randomBytes(32);
    const iv = generateIv();
    const encryptedSession = encryptIv(key, iv, session);
    const encryptedKey = publicEncrypt(publicKey, key);

    return {
        session: encryptedSession,
        key: encryptedKey.toString("base64"),
        iv: iv.toString("base64"),
    };
}
