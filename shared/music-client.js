const { Client, GatewayIntentBits, Collection, ActivityType } = require("discord.js");

function createMusicClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates
        ],
        presence: {
            status: "online",
            activities: [{ name: "45Saniye. ❤️‍🔥 The Wêsh (0053)", type: ActivityType.Listening }]
        }
    });
    client.commands = new Collection();
    return client;
}

module.exports = createMusicClient;
