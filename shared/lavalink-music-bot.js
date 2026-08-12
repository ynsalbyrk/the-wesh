"use strict";

const { EmbedBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { Shoukaku, Connectors } = require("shoukaku");
const { getLavalinkConfig } = require("./lavalink-config");
const { QueueManager } = require("./music/queue-manager");
const { resolveInput, search } = require("./music/track-resolver");
const { claimMusicCommand } = require("./music-command-dedupe");
const { acquireMusicChannel, releaseMusicChannel } = require("./music-channel-lock");
const personalPlaylists = require("./music/personal-playlists");

const SEARCH_TTL_MS = 120_000;
const PANEL_UPDATE_MS = 5_000;
const MAX_VOLUME = 125;
const VOLUME_STEP = 5;
const SEEK_STEP_MS = 10_000;

function duration(milliseconds) {
    const seconds = Math.floor((milliseconds || 0) / 1_000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function command(name, description) { return new SlashCommandBuilder().setName(name).setDescription(description); }

function commands() {
    const direct = [
        command("play", "Şarkı, bağlantı veya Spotify albümü/çalma listesi oynat").addStringOption(option => option.setName("query").setDescription("Şarkı adı veya bağlantı").setRequired(true)),
        command("search", "Oynatılabilir sonuçları ara").addStringOption(option => option.setName("query").setDescription("Şarkı, sanatçı veya albüm").setRequired(true)),
        command("queue", "Müzik kuyruğunu göster"), command("skip", "Şarkıyı geç"), command("pause", "Müziği duraklat"), command("resume", "Müziği sürdür"), command("stop", "Kuyruğu durdur ve temizle"),
        command("loop", "Döngü modunu değiştir").addStringOption(option => option.setName("mode").setDescription("off, track veya queue").addChoices({ name: "Kapalı", value: "off" }, { name: "Şarkı", value: "track" }, { name: "Kuyruk", value: "queue" }).setRequired(true)),
        command("shuffle", "Sıradaki şarkıları karıştır"), command("volume", "Ses seviyesini ayarla").addIntegerOption(option => option.setName("value").setDescription("0-125").setMinValue(0).setMaxValue(MAX_VOLUME).setRequired(true)),
        command("seek", "Şarkıda konuma git").addIntegerOption(option => option.setName("seconds").setDescription("Saniye").setMinValue(0).setRequired(true)), command("nowplaying", "Şu an çalan şarkıyı göster")
    ].map(item => item.toJSON());
    const legacy = new SlashCommandBuilder().setName("music").setDescription("Wesh müzik kontrolleri");
    for (const name of ["play", "search"]) legacy.addSubcommand(sub => sub.setName(name).setDescription(name === "play" ? "Şarkı oynat" : "Şarkı ara").addStringOption(option => option.setName("query").setDescription("Şarkı, sanatçı, albüm veya bağlantı").setRequired(true)));
    legacy.addSubcommand(sub => sub.setName("select").setDescription("Son aramadaki sonucu kuyruğa ekle").addIntegerOption(option => option.setName("number").setDescription("Sonuç numarası").setMinValue(1).setMaxValue(10).setRequired(true)));
    for (const name of ["queue", "skip", "pause", "resume", "stop", "shuffle", "nowplaying", "leave"]) legacy.addSubcommand(sub => sub.setName(name).setDescription(`${name} komutu`));
    legacy.addSubcommand(sub => sub.setName("loop").setDescription("Döngü modunu değiştir").addStringOption(option => option.setName("mode").setDescription("off, track veya queue").addChoices({ name: "Kapalı", value: "off" }, { name: "Şarkı", value: "track" }, { name: "Kuyruk", value: "queue" }).setRequired(true)));
    legacy.addSubcommand(sub => sub.setName("volume").setDescription("Ses seviyesini ayarla").addIntegerOption(option => option.setName("value").setDescription("0-125").setMinValue(0).setMaxValue(MAX_VOLUME).setRequired(true)));
    legacy.addSubcommand(sub => sub.setName("seek").setDescription("Şarkıda konuma git").addIntegerOption(option => option.setName("seconds").setDescription("Saniye").setMinValue(0).setRequired(true)));
    return [...direct, legacy.toJSON()];
}

function queueEmbed(queue, title = "Müzik Kuyruğu") {
    const current = queue?.current;
    const upcoming = queue?.tracks.slice(0, 10) || [];
    const description = current
        ? `Şimdi çalıyor: **${current.info.author} — ${current.info.title}** \`${duration(current.info.length)}\`\nDöngü: **${queue.loop}** | Ses: **${queue.volume}%**${upcoming.length ? `\n\nSırada:\n${upcoming.map((track, index) => `${index + 1}. ${track.info.author} — ${track.info.title}`).join("\n")}` : ""}`
        : "Kuyruk boş.";
    return new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description.slice(0, 4_000));
}

function progressBar(position, length) {
    const size = 16;
    const ratio = length > 0 ? Math.max(0, Math.min(1, position / length)) : 0;
    const marker = Math.min(size - 1, Math.floor(ratio * size));
    return Array.from({ length: size }, (_, index) => index === marker ? "🔘" : index < marker ? "━" : "─").join("");
}

function playbackPosition(queue) {
    const reported = Number(queue.player.position || 0);
    if (queue.paused) return queue.pausedPosition ?? reported;
    return Math.max(reported, Date.now() - (queue.startedAt || Date.now()));
}

function nowPlayingPanel(queue) {
    const track = queue.current;
    const length = track.info.length || 0;
    const elapsed = Math.min(length || Number.MAX_SAFE_INTEGER, playbackPosition(queue));
    const description = [
        `**${track.info.author || "Bilinmeyen sanatçı"}**`,
        `\`${progressBar(elapsed, length)}\``,
        `${duration(elapsed)} / ${duration(length)}  •  ${Math.round(length ? elapsed / length * 100 : 0)}%`,
        "",
        `🔊 **${queue.volume}%**    🔁 **${queue.loop}**    📜 **${queue.tracks.length} sırada**    ✨ Otomatik devam: **${queue.autoplay ? "Açık" : "Kapalı"}**`,
        "",
        "🔐 Kontroller yalnızca müziği başlatan üyeye açıktır."
    ].join("\n");
    const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setAuthor({ name: "Wêsh Music • Şimdi Çalıyor", iconURL: "https://cdn.discordapp.com/embed/avatars/0.png" })
        .setTitle(track.info.title || "Bilinmeyen şarkı")
        .setDescription(description)
        .setFooter({ text: `Kaynak: ${track.provider || track.info.sourceName || "Müzik"} • Panel 5 saniyede bir güncellenir` })
        .setTimestamp();
    if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);
    if (/^https?:\/\//i.test(track.info.uri || "")) embed.setURL(track.info.uri);
    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("wesh_music_toggle").setLabel(queue.paused ? "Devam" : "Duraklat").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("wesh_music_back_10").setLabel("10 sn geri").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("wesh_music_skip").setLabel("Geç").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("wesh_music_forward_10").setLabel("10 sn ileri").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("wesh_music_stop").setLabel("Durdur").setStyle(ButtonStyle.Danger)
    );
    const library = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("wesh_music_add").setLabel("Şarkı ekle").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("wesh_music_save").setLabel("Listeme kaydet").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("wesh_music_playlist").setLabel("Kişisel listem").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("wesh_music_transfer").setLabel("Kontrolü devret").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("wesh_music_autoplay").setLabel(`Otomatik devam: ${queue.autoplay ? "Açık" : "Kapalı"}`).setStyle(queue.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    const volume = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("wesh_music_volume_down").setLabel("Ses −5").setStyle(ButtonStyle.Secondary).setDisabled(queue.volume <= 0),
        new ButtonBuilder().setCustomId("wesh_music_volume_value").setLabel(`🔊 Ses: ${queue.volume}%`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("wesh_music_volume_up").setLabel("Ses +5").setStyle(ButtonStyle.Secondary).setDisabled(queue.volume >= MAX_VOLUME)
    );
    return { embeds: [embed], components: [controls, volume, library] };
}

module.exports = function startLavalinkMusicBot(client, config, logger) {
    const { nodes, resumeTimeout, idleLeaveMs } = getLavalinkConfig();
    const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, { resume: true, resumeTimeout, resumeByLibrary: true, reconnectTries: 12, reconnectInterval: 5_000, restTimeout: 15_000, moveOnDisconnect: true, userAgent: "Wesh-Discord-System/3.0" });
    const queues = new QueueManager(shoukaku, {
        logger: message => logger(`${config.name} ${message}`),
        idleLeaveMs,
        onLeave: async queue => {
            clearInterval(queue.panelTimer);
            await releaseMusicChannel(queue.guildId, queue.voiceChannelId, config.name);
        },
        onTrackStart: queue => refreshNowPlayingPanel(queue)
    });
    const searches = new Map();
    const playlistSessions = new Map();
    const registeredCommands = commands();
    const prefix = config.prefix || "!";

    const reply = async (target, payload) => target.reply ? target.reply(payload) : target.editReply(payload);
    const voiceChannel = target => target.member?.voice?.channel || target.guild?.voiceStates.cache.get(target.user?.id)?.channel;
    const requireVoice = async target => {
        const channel = voiceChannel(target);
        if (!channel) { await reply(target, "Önce bir ses kanalına gir."); return null; }
        return channel;
    };
    const canControl = (target, queue) => !queue || queue.voiceChannelId === voiceChannel(target)?.id;

    async function refreshNowPlayingPanel(queue) {
        if (!queue.current || !queue.panelMessage || queue.panelRefreshInFlight) return;
        queue.panelRefreshInFlight = true;
        try { await queue.panelMessage.edit(nowPlayingPanel(queue)); }
        catch { clearInterval(queue.panelTimer); queue.panelTimer = null; queue.panelMessage = null; }
        finally { queue.panelRefreshInFlight = false; }
    }

    function startPanelUpdates(queue) {
        clearInterval(queue.panelTimer);
        queue.panelTimer = setInterval(() => void refreshNowPlayingPanel(queue), PANEL_UPDATE_MS);
        queue.panelTimer.unref();
    }

    async function requirePanelControl(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue) { await interaction.reply({ content: "Aktif müzik kuyruğu yok.", ephemeral: true }); return null; }
        if (voiceChannel(interaction)?.id !== queue.voiceChannelId) {
            await interaction.reply({ content: "Kontrol için botla aynı ses kanalında olmalısın.", ephemeral: true });
            return null;
        }
        if (queue.controllerId && interaction.user.id !== queue.controllerId) {
            await interaction.reply({ content: "Bu müzik panelini yalnızca şarkıyı başlatan üye kullanabilir.", ephemeral: true });
            return null;
        }
        return queue;
    }

    async function addQueryToQueue(interaction, query) {
        const channel = voiceChannel(interaction);
        if (!channel) throw new Error("Önce botun bulunduğu ses kanalına gir.");
        const node = shoukaku.getIdealNode();
        if (!node) throw new Error("Lavalink bağlantısı henüz hazır değil.");
        const active = await connectToVoice(interaction.guild, channel, interaction.channel);
        const tracks = await resolveInput(node, query);
        await queues.enqueue(active, tracks);
        await refreshNowPlayingPanel(active);
        return tracks.length;
    }

    function playlistSessionKey(interaction) { return `${interaction.guildId}:${interaction.user.id}`; }

    async function personalPlaylistPanel(interaction) {
        const key = playlistSessionKey(interaction);
        const lists = await personalPlaylists.listPlaylists(interaction.user.id);
        const state = playlistSessions.get(key) || { listId: lists[0].id, trackIndex: 0 };
        if (!lists.some(list => list.id === state.listId)) state.listId = lists[0].id;
        const list = lists.find(item => item.id === state.listId);
        if (state.trackIndex >= list.tracks.length) state.trackIndex = 0;
        playlistSessions.set(key, state);
        const description = list.tracks.length
            ? list.tracks.slice(0, 25).map((track, index) => `**${index + 1}.** ${track.artist || "Bilinmeyen"} — ${track.title || track.query}`).join("\n")
            : "Bu listede henüz şarkı yok. Paneldeki **Listeme kaydet** düğmesiyle çalan şarkıyı seçili listeye ekleyebilirsin.";
        const rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("wesh_music_playlist_select").setPlaceholder("Çalma listesi seç").addOptions(lists.map(item => ({ label: item.name, value: item.id, description: `${item.tracks.length} şarkı`, default: item.id === list.id }))))];
        if (list.tracks.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("wesh_music_track_select").setPlaceholder("Şarkı seç").addOptions(list.tracks.slice(0, 25).map((track, index) => ({ label: `${track.artist || "Bilinmeyen"} — ${track.title || track.query}`.slice(0, 100), value: String(index), default: index === state.trackIndex })))));
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("wesh_music_track_queue").setLabel("Sıraya ekle").setStyle(ButtonStyle.Success).setDisabled(!list.tracks.length),
            new ButtonBuilder().setCustomId("wesh_music_track_play").setLabel("Şimdi başlat").setStyle(ButtonStyle.Primary).setDisabled(!list.tracks.length),
            new ButtonBuilder().setCustomId("wesh_music_track_remove").setLabel("Şarkıyı kaldır").setStyle(ButtonStyle.Danger).setDisabled(!list.tracks.length)
        ));
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("wesh_music_playlist_save_current").setLabel("Çalanı bu listeye ekle").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("wesh_music_playlist_create").setLabel("Yeni liste").setStyle(ButtonStyle.Success).setDisabled(lists.length >= personalPlaylists.MAX_PLAYLISTS),
            new ButtonBuilder().setCustomId("wesh_music_playlist_delete").setLabel("Listeyi sil").setStyle(ButtonStyle.Danger).setDisabled(lists.length <= 1)
        ));
        return { embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle(`Kişisel liste: ${list.name}`).setDescription(description).setFooter({ text: `${lists.length}/5 liste • Seçilen şarkı: ${list.tracks.length ? state.trackIndex + 1 : "yok"}` })], components: rows };
    }

    async function handleButton(interaction) {
        const id = interaction.customId;
        if (id === "wesh_music_add") {
            const modal = new ModalBuilder().setCustomId("wesh_music_add_modal").setTitle("Şarkı sıraya ekle");
            const query = new TextInputBuilder().setCustomId("query").setLabel("Şarkı veya sanatçı adı").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
            modal.addComponents(new ActionRowBuilder().addComponents(query));
            return interaction.showModal(modal);
        }
        if (id === "wesh_music_playlist") return interaction.reply({ ...(await personalPlaylistPanel(interaction)), ephemeral: true });
        if (id === "wesh_music_playlist_create") {
            const modal = new ModalBuilder().setCustomId("wesh_music_playlist_create_modal").setTitle("Yeni kişisel çalma listesi");
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Liste adı").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)));
            return interaction.showModal(modal);
        }
        if (id === "wesh_music_playlist_delete") {
            const state = playlistSessions.get(playlistSessionKey(interaction));
            await personalPlaylists.deletePlaylist(interaction.user.id, state.listId);
            playlistSessions.delete(playlistSessionKey(interaction));
            return interaction.update(await personalPlaylistPanel(interaction));
        }
        if (id === "wesh_music_track_remove") {
            const state = playlistSessions.get(playlistSessionKey(interaction));
            if (!state) return interaction.reply({ content: "Önce kişisel listeni aç.", ephemeral: true });
            await personalPlaylists.removeTrack(interaction.user.id, state.listId, state.trackIndex);
            return interaction.update(await personalPlaylistPanel(interaction));
        }
        const queue = await requirePanelControl(interaction);
        if (!queue) return;
        if (id === "wesh_music_toggle") {
            const paused = !queue.paused;
            await queue.player.setPaused(paused);
            queue.paused = paused;
            queue.pausedPosition = Number(queue.player.position || 0);
            if (!paused) queue.startedAt = Date.now() - queue.pausedPosition;
            return interaction.update(nowPlayingPanel(queue));
        }
        if (["wesh_music_back_10", "wesh_music_forward_10"].includes(id)) {
            if (!queue.current) return interaction.reply({ content: "Geçerli bir şarkı çalmıyor.", ephemeral: true });
            if (queue.seekInFlight) return interaction.reply({ content: "Sarma işlemi devam ediyor; lütfen bir an bekle.", ephemeral: true });
            queue.seekInFlight = true;
            await interaction.deferUpdate();
            try {
                const offset = id === "wesh_music_back_10" ? -SEEK_STEP_MS : SEEK_STEP_MS;
                const targetPosition = Math.max(0, Math.min(queue.current.info.length || Number.MAX_SAFE_INTEGER, playbackPosition(queue) + offset));
                await queue.player.seekTo(targetPosition);
                queue.pausedPosition = targetPosition;
                if (!queue.paused) queue.startedAt = Date.now() - targetPosition;
                await refreshNowPlayingPanel(queue);
            } finally { queue.seekInFlight = false; }
            return;
        }
        if (["wesh_music_volume_down", "wesh_music_volume_up"].includes(id)) {
            if (queue.volumeInFlight) return interaction.reply({ content: "Ses ayarlanıyor; lütfen bir an bekle.", ephemeral: true });
            queue.volumeInFlight = true;
            await interaction.deferUpdate();
            try {
                const delta = id === "wesh_music_volume_down" ? -VOLUME_STEP : VOLUME_STEP;
                queue.volume = Math.max(0, Math.min(MAX_VOLUME, queue.volume + delta));
                await queue.player.setGlobalVolume(queue.volume);
                await refreshNowPlayingPanel(queue);
            } finally { queue.volumeInFlight = false; }
            return;
        }
        if (id === "wesh_music_transfer") {
            const modal = new ModalBuilder().setCustomId("wesh_music_transfer_modal").setTitle("Müzik kontrolünü devret");
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("member").setLabel("Üye etiketini veya kullanıcı kimliğini gir").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)));
            return interaction.showModal(modal);
        }
        if (id === "wesh_music_autoplay") {
            queue.autoplay = !queue.autoplay;
            return interaction.update(nowPlayingPanel(queue));
        }
        if (id === "wesh_music_skip") {
            await queues.skip(queue);
            return interaction.update(queue.current ? nowPlayingPanel(queue) : { content: "Kuyruk tamamlandı.", embeds: [], components: [] });
        }
        if (id === "wesh_music_stop") {
            await queues.stop(queue);
            return interaction.update({ content: "Müzik durduruldu ve kuyruk temizlendi.", embeds: [], components: [] });
        }
        if (id === "wesh_music_save") {
            const track = queue.current;
            const lists = await personalPlaylists.listPlaylists(interaction.user.id);
            const result = await personalPlaylists.addTrack(interaction.user.id, lists[0].id, { query: track.query || `${track.info.author} ${track.info.title}`, title: track.info.title, artist: track.info.author, artworkUrl: track.info.artworkUrl });
            return interaction.reply({ content: result.added ? `Şarkı **${lists[0].name}** listene kaydedildi.` : "Bu şarkı zaten listende.", ephemeral: true });
        }
        const state = playlistSessions.get(playlistSessionKey(interaction));
        if (!["wesh_music_track_queue", "wesh_music_track_play", "wesh_music_track_remove", "wesh_music_playlist_save_current"].includes(id) || !state) return;
        const list = await personalPlaylists.getPlaylist(interaction.user.id, state.listId);
        if (id === "wesh_music_playlist_save_current") {
            const track = queue.current;
            const result = await personalPlaylists.addTrack(interaction.user.id, list.id, { query: track.query || `${track.info.author} ${track.info.title}`, title: track.info.title, artist: track.info.author, artworkUrl: track.info.artworkUrl });
            return interaction.update(await personalPlaylistPanel(interaction));
        }
        const entry = list.tracks[state.trackIndex];
        const node = shoukaku.getIdealNode();
        if (!node) return interaction.reply({ content: "Lavalink bağlantısı hazır değil.", ephemeral: true });
        const tracks = await resolveInput(node, entry.query);
        if (id === "wesh_music_track_play") {
            queue.tracks.unshift(...tracks);
            await queues.skip(queue);
        } else await queues.enqueue(queue, tracks);
        await refreshNowPlayingPanel(queue);
        return interaction.reply({ content: id === "wesh_music_track_play" ? "Seçilen şarkı şimdi başlatıldı." : "Seçilen şarkı sıraya eklendi.", ephemeral: true });
    }

    async function handleSelectMenu(interaction) {
        const key = playlistSessionKey(interaction);
        const state = playlistSessions.get(key) || { trackIndex: 0 };
        if (interaction.customId === "wesh_music_playlist_select") {
            state.listId = interaction.values[0];
            state.trackIndex = 0;
        } else if (interaction.customId === "wesh_music_track_select") state.trackIndex = Number(interaction.values[0]);
        else return;
        playlistSessions.set(key, state);
        await interaction.update(await personalPlaylistPanel(interaction));
    }

    async function handleModal(interaction) {
        if (interaction.customId === "wesh_music_transfer_modal") {
            await interaction.deferReply({ ephemeral: true });
            const queue = queues.get(interaction.guildId);
            if (!queue || queue.controllerId !== interaction.user.id) throw new Error("Kontrol devri yalnızca mevcut kontrol sahibi tarafından yapılabilir.");
            const memberId = interaction.fields.getTextInputValue("member").match(/\d{17,20}/)?.[0];
            const member = memberId ? await interaction.guild.members.fetch(memberId).catch(() => null) : null;
            if (!member || member.user.bot || member.voice.channelId !== queue.voiceChannelId) throw new Error("Devredilecek üye botla aynı ses kanalında olmalı.");
            queue.controllerId = member.id;
            await refreshNowPlayingPanel(queue);
            return interaction.editReply(`Müzik kontrolü ${member} üyesine devredildi.`);
        }
        if (interaction.customId === "wesh_music_playlist_create_modal") {
            await interaction.deferReply({ ephemeral: true });
            const list = await personalPlaylists.createPlaylist(interaction.user.id, interaction.fields.getTextInputValue("name"));
            playlistSessions.set(playlistSessionKey(interaction), { listId: list.id, trackIndex: 0 });
            return interaction.editReply({ content: `**${list.name}** oluşturuldu. Paneli yeniden açarak şarkı ekleyebilirsin.` });
        }
        if (interaction.customId !== "wesh_music_add_modal") return;
        await interaction.deferReply({ ephemeral: true });
        const added = await addQueryToQueue(interaction, interaction.fields.getTextInputValue("query"));
        await interaction.editReply(`${added} şarkı kuyruğa eklendi.`);
    }

    async function connectToVoice(guild, channel, textChannel) {
        const existing = queues.get(guild.id);
        if (existing?.voiceChannelId === channel.id) return queues.connect(guild, channel, textChannel);
        const lock = await acquireMusicChannel(guild.id, channel.id, config.name);
        if (!lock.acquired) throw new Error(`Bu ses kanalı şu anda ${lock.owner?.botName || "başka bir müzik botu"} tarafından kullanılıyor.`);
        try {
            const queue = await queues.connect(guild, channel, textChannel);
            if (existing && existing.voiceChannelId !== channel.id) await releaseMusicChannel(guild.id, existing.voiceChannelId, config.name);
            return queue;
        } catch (error) {
            await releaseMusicChannel(guild.id, channel.id, config.name);
            throw error;
        }
    }

    async function handle(target, name, options = {}) {
        const guild = target.guild;
        if (!guild) return reply(target, "Bu komut yalnızca bir sunucuda kullanılabilir.");
        const queue = queues.get(guild.id);
        if (["queue", "nowplaying"].includes(name)) return reply(target, { embeds: [queueEmbed(queue, name === "nowplaying" ? "Şimdi Çalıyor" : undefined)] });
        if (name === "search") {
            const node = shoukaku.getIdealNode();
            if (!node) return reply(target, "Lavalink bağlantısı hazır değil. Bot otomatik olarak yeniden bağlanmayı deniyor.");
            const found = await search(node, options.query);
            if (!found.length) return reply(target, "Oynatılabilir sonuç bulunamadı.");
            searches.set(`${guild.id}:${target.user?.id || target.author.id}`, found);
            setTimeout(() => searches.delete(`${guild.id}:${target.user?.id || target.author.id}`), SEARCH_TTL_MS).unref();
            return reply(target, { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Arama: ${options.query}`).setDescription(found.map((track, index) => `**${index + 1}.** ${track.info.author} — ${track.info.title} \`${duration(track.info.length)}\``).join("\n"))] });
        }
        if (name === "play") {
            const channel = await requireVoice(target); if (!channel) return;
            const node = shoukaku.getIdealNode();
            if (!node) return reply(target, "Lavalink bağlantısı hazır değil. Bot otomatik olarak yeniden bağlanmayı deniyor.");
            const active = await connectToVoice(guild, channel, target.channel);
            if (!active.current && !active.tracks.length) active.controllerId = target.user?.id || target.author?.id;
            const tracks = await resolveInput(node, options.query);
            await queues.enqueue(active, tracks);
            const selected = tracks[0];
            const panel = nowPlayingPanel(active);
            const panelMessage = await reply(target, tracks.length > 1
                ? { content: `Çalma listesi algılandı: **${tracks.length} şarkı** kuyruğa eklendi.`, ...panel }
                : panel);
            active.panelMessage = panelMessage;
            startPanelUpdates(active);
            return;
        }
        if (name === "select") {
            const channel = await requireVoice(target); if (!channel) return;
            const key = `${guild.id}:${target.user?.id || target.author.id}`;
            const track = searches.get(key)?.[options.number - 1];
            if (!track) return reply(target, "Önce /search ile ara; sonuçlar iki dakika saklanır.");
            const active = await connectToVoice(guild, channel, target.channel);
            if (!active.current && !active.tracks.length) active.controllerId = target.user?.id || target.author?.id;
            await queues.enqueue(active, [track]);
            const panelMessage = await reply(target, nowPlayingPanel(active));
            active.panelMessage = panelMessage;
            startPanelUpdates(active);
            return;
        }
        if (!queue) return reply(target, "Aktif müzik kuyruğu yok.");
        if (!canControl(target, queue)) return reply(target, "Kontrol için botla aynı ses kanalında olmalısın.");
        if (queue.controllerId && (target.user?.id || target.author?.id) !== queue.controllerId) return reply(target, "Bu müzik oturumunu yalnızca şarkıyı başlatan üye kontrol edebilir.");
        if (name === "leave") { await queues.leave(guild.id); return reply(target, "Ses kanalından ayrıldım."); }
        if (name === "skip") { await queues.skip(queue); return reply(target, "Şarkı geçildi."); }
        if (name === "stop") { await queues.stop(queue); return reply(target, "Kuyruk temizlendi."); }
        if (name === "pause") { await queue.player.setPaused(true); queue.paused = true; queue.pausedPosition = Number(queue.player.position || 0); await refreshNowPlayingPanel(queue); return reply(target, "Duraklatıldı."); }
        if (name === "resume") { await queue.player.setPaused(false); queue.paused = false; queue.startedAt = Date.now() - (queue.pausedPosition || 0); await refreshNowPlayingPanel(queue); return reply(target, "Devam ediyor."); }
        if (name === "volume") { queue.volume = Math.max(0, Math.min(MAX_VOLUME, options.value)); await queue.player.setGlobalVolume(queue.volume); return reply(target, `Ses seviyesi: ${queue.volume}%`); }
        if (name === "seek") {
            if (!queue.current || options.seconds * 1_000 > queue.current.info.length) return reply(target, "Geçerli bir şarkı konumu gir.");
            const targetPosition = options.seconds * 1_000; await queue.player.seekTo(targetPosition); queue.pausedPosition = targetPosition; if (!queue.paused) queue.startedAt = Date.now() - targetPosition; return reply(target, `Konum: ${duration(targetPosition)}`);
        }
        if (name === "loop") { queue.loop = options.mode; return reply(target, `Döngü: **${options.mode}**`); }
        if (name === "shuffle") {
            for (let index = queue.tracks.length - 1; index > 0; index -= 1) { const replacement = Math.floor(Math.random() * (index + 1)); [queue.tracks[index], queue.tracks[replacement]] = [queue.tracks[replacement], queue.tracks[index]]; }
            return reply(target, "Kuyruk karıştırıldı.");
        }
    }

    shoukaku.on("ready", (name, serverResume, libraryResume) => logger(`${config.name} lavalink-ready node=${name} serverResume=${serverResume} libraryResume=${libraryResume}`));
    shoukaku.on("reconnecting", (name, left) => logger(`${config.name} lavalink-reconnecting node=${name} attemptsLeft=${left}`));
    shoukaku.on("disconnect", (name, count) => logger(`${config.name} lavalink-disconnected node=${name} count=${count}`));
    shoukaku.on("error", (name, error) => logger(`${config.name} lavalink-error node=${name} ${error.message}`));

    client.once("clientReady", async () => {
        logger(`${config.name} active as ${client.user.tag}`);
        try { await Promise.all(client.guilds.cache.map(guild => client.application.commands.set(registeredCommands, guild.id))); logger(`${config.name} slash commands registered.`); }
        catch (error) { logger(`${config.name} slash-command-registration-error ${error.message}`); }
    });
    client.on("interactionCreate", interaction => {
        if (interaction.isButton()) {
            void handleButton(interaction).catch(error => {
                logger(`${config.name} panel-button-error ${interaction.customId} ${error.message}`);
                const response = { content: "İşlem tamamlanamadı; lütfen tekrar dene.", ephemeral: true };
                return interaction.deferred || interaction.replied ? interaction.editReply(response) : interaction.reply(response);
            });
            return;
        }
        if (interaction.isStringSelectMenu()) {
            void handleSelectMenu(interaction).catch(error => {
                logger(`${config.name} playlist-select-error ${error.message}`);
                return interaction.reply({ content: "Liste seçimi güncellenemedi; lütfen tekrar dene.", ephemeral: true }).catch(() => {});
            });
            return;
        }
        if (interaction.isModalSubmit()) {
            void handleModal(interaction).catch(error => {
                logger(`${config.name} panel-modal-error ${error.message}`);
                return interaction.editReply("Şarkı eklenemedi; lütfen tekrar dene.").catch(() => {});
            });
            return;
        }
        if (!interaction.isChatInputCommand() || !registeredCommands.some(item => item.name === interaction.commandName)) return;
        const isLegacy = interaction.commandName === "music";
        const commandName = isLegacy ? interaction.options.getSubcommand() : interaction.commandName;
        void interaction.deferReply().then(() => handle(interaction, commandName, {
            query: interaction.options.getString("query"), number: interaction.options.getInteger("number"), value: interaction.options.getInteger("value"), seconds: interaction.options.getInteger("seconds"), mode: interaction.options.getString("mode")
        })).catch(error => { logger(`${config.name} command-error ${interaction.commandName} ${error.message}`); return interaction.editReply("Komut işlenemedi; ayrıntı günlükte kayıtlı.").catch(() => {}); });
    });
    client.on("messageCreate", message => {
        if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;
        const [name, ...parts] = message.content.slice(prefix.length).trim().split(/\s+/);
        const aliases = { now: "nowplaying" };
        const supported = new Set(["play", "search", "select", "queue", "skip", "pause", "resume", "stop", "leave", "loop", "shuffle", "volume", "seek", "nowplaying", "now"]);
        if (!supported.has(name?.toLowerCase())) return;
        const commandName = aliases[name.toLowerCase()] || name.toLowerCase();
        const query = parts.join(" ");
        void (async () => {
            if (!await claimMusicCommand(message.id)) return;
            await handle(message, commandName, { query, number: Number(parts[0]), value: Number(parts[0]), seconds: Number(parts[0]), mode: parts[0] });
        })().catch(error => { logger(`${config.name} prefix-command-error ${commandName} ${error.message}`); void message.reply("Komut işlenemedi; ayrıntı günlükte kayıtlı.").catch(() => {}); });
    });
};
