const {
    Client,
    GatewayIntentBits,
    Collection,
    ActivityType
} = require("discord.js");


function createClient(){

    const client = new Client({

        intents:[

            GatewayIntentBits.Guilds,

            GatewayIntentBits.GuildMembers,

            GatewayIntentBits.GuildMessages,

            GatewayIntentBits.MessageContent,

            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildModeration

        ],
        presence: {
            status: "online",
            activities: [{ name: "45Saniye. ❤️‍🔥 The Wêsh (0053)", type: ActivityType.Listening }]
        }

    });


    client.commands = new Collection();


    return client;

}


module.exports = createClient;
