import fs from "fs-extra";
import { logger } from "./logger.js";
import path from "path";
import crypto from "crypto";

export const generateRandomAvailableFolderPath = async (
    baseDir: string
): Promise<string> => {
    let folderPath: string;

    do {
        folderPath = path.join(baseDir, crypto.randomBytes(8).toString("hex"));
    } while (await fs.pathExists(folderPath));

    return folderPath;
};

export const clearDir = async (path: string): Promise<void> => {
    try {
        await fs.remove(path);
        logger.debug(`Sucessfully cleared: ${path}`);
    } catch (error) {
        logger.error(`Error clearing directory: ${error}`);
    }
};
