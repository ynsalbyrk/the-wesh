require("dotenv").config();

const createClient = require("../../../shared/client");
const keepVoiceConnected = require("../../../shared/voice-keeper");
const startSecurityBot = require("../../../shared/security-bot");
const config = require("./config");

if (!process.env[config.tokenName]) {
    throw new Error(`${config.tokenName} .env dosyasında tanımlı değil.`);
}

const client = createClient();

startSecurityBot(client, config, message => console.log(message));

keepVoiceConnected(client, config);

client.login(process.env[config.tokenName]);
