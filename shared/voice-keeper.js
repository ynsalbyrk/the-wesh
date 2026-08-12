const {
    joinVoiceChannel,
    entersState,
    getVoiceConnection,
    VoiceConnectionStatus
} = require("@discordjs/voice");

function keepVoiceConnected(client, config) {
    let reconnectTimer;
    let connecting = false;
    let reconnectAttempts = 0;

    const scheduleReconnect = () => {
        clearTimeout(reconnectTimer);
        // A short, capped backoff avoids both a permanently dropped bot and a
        // reconnect storm when Discord or the local network is unavailable.
        const delay = Math.min(60_000, 5_000 * (2 ** Math.min(reconnectAttempts++, 3)));
        reconnectTimer = setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
        if (connecting || !client.isReady()) return;
        connecting = true;
        try {
            const guild = await client.guilds.fetch(config.guildId);
            const channel = await guild.channels.fetch(config.voiceChannelId);

            if (!channel || !channel.isVoiceBased()) {
                throw new Error("Ses kanalı bulunamadı veya geçerli değil.");
            }

            const existing = getVoiceConnection(guild.id);
            if (existing?.joinConfig.channelId === channel.id && existing.state.status === VoiceConnectionStatus.Ready) return;
            // joinVoiceChannel returns the old connection for the guild.  Tear
            // down a failed one first so a later retry actually creates a new
            // Discord voice session instead of reusing a dead websocket.
            existing?.destroy();
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            // UDP/IP discovery errors are emitted by the connection.  Without an
            // error listener Node terminates the entire bot process.
            connection.on("error", error => {
                console.error(`${config.name} ses bağlantı hatası:`, error.message);
                scheduleReconnect();
            });
            connection.on(VoiceConnectionStatus.Disconnected, () => {
                // Discord sometimes restores signalling by itself after a
                // transient network blip.  Give it a brief chance, then make
                // a clean connection if it is still disconnected.
                void entersState(connection, VoiceConnectionStatus.Signalling, 5_000)
                    .catch(() => { connection.destroy(); scheduleReconnect(); });
            });
            connection.on(VoiceConnectionStatus.Destroyed, scheduleReconnect);

            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
            clearTimeout(reconnectTimer);
            reconnectAttempts = 0;

            console.log(`${config.name} ses kanalına bağlandı.`);
        } catch (error) {
            console.error(`${config.name} ses bağlantı hatası:`, error.message);
            scheduleReconnect();
        } finally {
            connecting = false;
        }
    };

    client.once("clientReady", () => {
        void connect();
        // Discord occasionally leaves a connection marked as healthy after a
        // network transition. Re-checking the actual target channel prevents
        // a bot from remaining silently outside its assigned room.
        setInterval(() => void connect(), 30 * 60_000).unref();
    });
}

module.exports = keepVoiceConnected;
