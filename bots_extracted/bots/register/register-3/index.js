require("dotenv").config();

const createClient = require("../../../shared/client");
const logger = require("../../../shared/logger");
const startRegistrationBot = require("../../../shared/registration-bot");
const config = require("./config");

const client = createClient();
startRegistrationBot(client, config, logger);

if (!process.env[config.tokenName]) throw new Error(`${config.tokenName} .env dosyasında tanımlı değil.`);
client.login(process.env[config.tokenName]);
