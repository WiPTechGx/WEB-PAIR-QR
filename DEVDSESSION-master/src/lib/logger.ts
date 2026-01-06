import * as Pino from "pino";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv))
    .option("verbose", {
        alias: "v",
        type: "boolean",
        description: "Run with verbose logging",
    })
    .parseSync();

const logLevel = argv.verbose ? "debug" : "info";

export const logger = Pino.pino({
    level: logLevel,
    ...(process.env.NODE_ENV !== "production" && {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
            },
        },
    }),
});
