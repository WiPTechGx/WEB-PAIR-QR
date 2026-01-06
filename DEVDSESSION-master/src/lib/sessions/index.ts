import { logger } from "../logger.js";
import { createSession } from "./sessionGenerator.js";
import { storeSession } from "./sessionManager.js";
import { clearDir } from "../fileHelper.js";
import { SessionDatabase } from "../../lib/db/index.js";

export async function handleSessionCreation(
    Store: SessionDatabase,
    requestSessionPath: string,
    phoneNumber?: string
): Promise<string> {
    return await createSession(
        requestSessionPath,
        phoneNumber,
        async (error, sock, session) => {
            if (sock && session) {
                const sessionKey = await storeSession(Store, session);
                await sock.sendMessage(sock.user!.id, {
                    text: `\`\`\`Session created\`\`\`: \`${sessionKey}\`\n\n_Use this key to restore the session._`,
                });
                // logger.info(`Session created: ${sessionKey}`);
            } else if (error) {
                logger.error(`Error creating session: ${error}`);
            }
            await clearDir(requestSessionPath);
        }
    );
}
