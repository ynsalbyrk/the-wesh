require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
const { acquireSingleInstance } = require("../../../shared/single-instance");
if (!acquireSingleInstance("music-2")) {
    console.log("[WESH SYSTEM] Wesh Music 2 zaten çalışıyor; ikinci işlem başlatılmadı.");
    process.exit(0);
}
const createClient = require("../../../shared/music-client");
const logger = require("../../../shared/logger");
const startMusicBot = require("../../../shared/legal-music-bot");
const config = require("./config");
if (!process.env[config.tokenName]) throw new Error(`${config.tokenName} .env dosyasında tanımlı değil.`);
const client = createClient();
startMusicBot(client, config, logger);
client.on("shardDisconnect", event => logger(`${config.name} gateway disconnected: ${event.code}`));
client.on("error", error => logger(`${config.name} client error: ${error.message}`));
client.login(process.env[config.tokenName]).catch(error => {
    logger(`${config.name} Discord login failed: ${error.message}`);
    process.exitCode = 1;
});
