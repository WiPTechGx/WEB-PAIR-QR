import { logger } from "../logger.js";
import { generateSessionKey } from "./sessionGenerator.js";
import { SessionDatabase } from "../../lib/db/index.js";
import config from "../../config.js";

export async function storeSession(
    Store: SessionDatabase,
    session: string
): Promise<string> {
    logger.debug("Storing session...");
    let sessionKey: string;
    do {
        sessionKey = generateSessionKey(config.prefix);
    } while (await Store.sessionExists(sessionKey));
    await Store.saveSession(sessionKey, session);
    logger.debug("Session stored successfully.");
    return sessionKey;
}
