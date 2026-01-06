import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import config from "./config.js";
import { startServer } from "./server/index.js";

async function main() {
    await yargs(hideBin(process.argv))
        .command(
            "serve [port]",
            "start the server",
            (yargs) => {
                return yargs.positional("port", {
                    describe: "port to bind on",
                    default: config.port,
                });
            },
            async (argv) => {
                await startServer(argv.port);
            }
        )
        .parse();
}

main();
