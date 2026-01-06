// This module is responsible for connecting to the Redis database and providing methods to interact with it.
import { createClient, RedisClientType } from "redis";
import { logger } from "../logger.js";
import config from "../../config.js";

export interface SessionDatabase {
    connect: () => Promise<SessionDatabase>;
    sessionExists: (sessionKey: string) => Promise<boolean>;
    saveSession: (sessionKey: string, session: string) => Promise<boolean>;
    getSession: (sessionKey: string) => Promise<string | null>;
    resetSession: (sessiomKey: string) => Promise<boolean>;
    disconnect: () => Promise<void>;
}

type DataBaseOptions = {
    url: string;
};

class DataBase implements SessionDatabase {
    client: RedisClientType;
    constructor(public config: DataBaseOptions, public timeout: number) {
        this.client = createClient(config);
        this.client.on("error", (err) => {
            logger.error(`Redis client error: ${err}`);
            // throw new Error(err);
        });
        this.client.on("ready", () => {
            logger.debug("Redis client ready");
        });
    }
    async connect(): Promise<DataBase> {
        logger.debug("Connecting to Redis database...");
        await this.client.connect();
        await this.client.ping();
        return this;
    }
    async sessionExists(sessionKey: string): Promise<boolean> {
        return (await this.client.exists(sessionKey)) > 0;
    }
    async saveSession(sessionKey: string, session: string): Promise<boolean> {
        const result = await this.client.set(sessionKey, session, {
            EX: this.timeout,
        });
        return result ? true : false;
    }
    async getSession(sessionKey: string): Promise<string | null> {
        const session: string | null = await this.client.get(sessionKey);
        if (session) await this.resetSession(sessionKey);
        return session;
    }
    async resetSession(sessionKey: string): Promise<boolean> {
        const result = await this.client.expire(sessionKey, this.timeout);
        return result ? true : false;
    }
    async disconnect(): Promise<void> {
        logger.debug("Disconnecting from Redis database...");
        if (this.client.isOpen) {
            await this.client.close();
        } else {
            logger.debug("Redis client is already disconnected.");
        }
        logger.debug("Disconnected from Redis database.");
    }
}

export const SessionStore = new DataBase(
    { url: config.databaseUrl },
    config.sessionTimeout
);
