import "dotenv/config";

const config = {
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || "604800"), // 7 days
    databaseUrl: process.env.DATABASE_URL || "", // Redis database URL (required)
    encryptionKey: process.env.ENCRYPTION_KEY || "", // Encryption key (must be a 32-byte base64-encoded buffer, generate using crypto)
    port: parseInt(process.env.PORT || "8000"),
    prefix: process.env.PREFIX || "DEVD", // prefix on session id
};

export default Object.freeze(config);
