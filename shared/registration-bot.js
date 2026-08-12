const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice");
const { saveRegistration, getRegistrations } = require("./registration-history");
const fs = require("fs");
const path = require("path");
/**
 * Bir register botunun ortak davranışı.
 * Her bot kendi config.js dosyasındaki kanal ve rol ID'lerini kullanır.
 */
function startRegistrationBot(client, config, logger) {
    let leaveTimer = null;
    const roleClaimDirectory = path.join(__dirname, "..", "data", "registration-role-claims");

    function roleClaimPaths(member) {
        const key = `${member.guild.id}-${member.id}-${member.joinedTimestamp || Date.now()}`;
        return { lock: path.join(roleClaimDirectory, `${key}.lock`), completed: path.join(roleClaimDirectory, `${key}.done`) };
    }

    function durationRoleClaimPaths(member) {
        const date = new Date().toISOString().slice(0, 10);
        const key = `${member.guild.id}-${member.id}-${date}`;
        return { lock: path.join(roleClaimDirectory, `duration-${key}.lock`), completed: path.join(roleClaimDirectory, `duration-${key}.done`) };
    }

    function tryAcquireRoleClaim(paths) {
        fs.mkdirSync(roleClaimDirectory, { recursive: true });
        if (fs.existsSync(paths.completed)) return false;
        try {
            fs.closeSync(fs.openSync(paths.lock, "wx"));
            return true;
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            return false;
        }
    }

    async function assignUnregisteredRole(member) {
        const roleId = config.unregisteredRoleId;
        if (!roleId || member.user.bot || member.roles.cache.has(roleId)) return;
        const paths = roleClaimPaths(member);
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (fs.existsSync(paths.completed) || member.roles.cache.has(roleId)) return;
            if (!tryAcquireRoleClaim(paths)) {
                if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1_500));
                continue;
            }
            try {
                if (!member.roles.cache.has(roleId)) await member.roles.add(roleId, "Automatic unregistered member role");
                await member.setNickname(config.unregisteredNickname || "\u2605 Kay\u0131ts\u0131z \u00dcye", "Automatic unregistered member name").catch(error => logger(`${config.name}: unregistered name could not be set: ${error.message}`));
                fs.writeFileSync(paths.completed, JSON.stringify({ assignedAt: Date.now(), bot: config.name }), "utf8");
                logger(`${config.name}: ${member.user.tag} kullanicisina kayitsiz uye rolu verildi.`);
                return;
            } catch (error) {
                logger(`${config.name}: kayitsiz uye rolu verilemedi: ${error.message}`);
            } finally {
                fs.unlinkSync(paths.lock, { force: true });
            }
        }
    }

    async function syncMembershipDurationRole(member) {
        if (member.user.bot || !member.joinedTimestamp) return;
        // General 1 ayarini ortak kaynak kullanarak tum register botlarinin ayni
        // sure rollerini uygulamasini saglar.
        const durationRoles = config.membershipDurationRoles || require("../bots/register/general-1/config").engagement.membershipDurationRoles || [];
        const definitions = durationRoles.slice().sort((a, b) => a.days - b.days).filter(item => item.roleId && member.guild.roles.cache.has(item.roleId));
        if (!definitions.length) return;
        const paths = durationRoleClaimPaths(member);
        if (!tryAcquireRoleClaim(paths)) return;
        try {
            const serverDays = (Date.now() - member.joinedTimestamp) / 86_400_000;
            const target = definitions.filter(item => serverDays >= item.days).at(-1);
            const durationRoleIds = definitions.map(item => item.roleId);
            if (target && !member.roles.cache.has(target.roleId)) await member.roles.add(target.roleId, "Automatic membership duration role");
            const outdatedRoleIds = durationRoleIds.filter(roleId => roleId !== target?.roleId && member.roles.cache.has(roleId));
            if (outdatedRoleIds.length) await member.roles.remove(outdatedRoleIds, "Replaced by higher membership duration role");
            fs.writeFileSync(paths.completed, JSON.stringify({ updatedAt: Date.now(), bot: config.name }), "utf8");
        } catch (error) {
            logger(`${config.name}: sure rolu guncellenemedi: ${error.message}`);
        } finally {
            fs.unlinkSync(paths.lock, { force: true });
        }
    }

    async function syncGuildMembershipDurationRoles(guild) {
        const members = await guild.members.fetch().catch(error => {
            logger(`${config.name}: uye listesi alinamadi: ${error.message}`);
            return null;
        });
        if (members) for (const member of members.values()) await syncMembershipDurationRole(member);
    }

    function parseBirthDate(value) {
        const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value || "");
        if (!match) return null;
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        const today = new Date();
        let age = today.getFullYear() - year;
        if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
        if (age < 0 || age > 120) return null;
        return { day, month, year, age, value: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`, birthday: `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}` };
    }

    function parseRegistrationDetails(value) {
        const normalized = value.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
        const parts = normalized.split(/\s+/);
        const birthDate = parseBirthDate(parts.at(-1));
        if (!birthDate) return { display: normalized, birthDate: null };
        const name = parts.slice(0, -1).join(" ").trim();
        return name ? { display: `${name} ${birthDate.age}`, birthDate } : { display: normalized, birthDate: null };
    }

    function getRegisterChannel(guild) {
        return guild.channels.cache.get(config.voiceChannelId);
    }

    function hasHumans(channel) {
        return channel?.members.some(member => !member.user.bot);
    }

    function cancelLeave() {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = null;
    }

    function leaveWhenEmpty(guild) {
        cancelLeave();
        leaveTimer = setTimeout(() => {
            const channel = getRegisterChannel(guild);
            if (hasHumans(channel)) return;
        joinIdleChannel(guild);
logger(`${config.name}: kayıt odası boş; bekleme ses kanalına dönüyor.`);
        }, config.leaveDelayMs ?? 30_000);
    }

    async function joinRegisterChannel(guild) {
        const channel = getRegisterChannel(guild);
        if (!channel?.isVoiceBased()) {
            logger(`${config.name}: voiceChannelId geçersiz veya botun kanalı görme izni yok.`);
            return;
        }

        cancelLeave();
        const active = getVoiceConnection(guild.id);
        if (active?.joinConfig.channelId === channel.id && active.state.status === VoiceConnectionStatus.Ready) return;
        active?.destroy();

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });
        connection.on(VoiceConnectionStatus.Ready, () => logger(`${config.name}: kayıt odasına katıldı.`));
        connection.on("error", error => logger(`${config.name}: ses bağlantısı hatası: ${error.message}`));
    }
async function joinIdleChannel(guild) {
    const channel = guild.channels.cache.get(config.idleVoiceChannelId);

    if (!channel?.isVoiceBased()) {
        logger(`${config.name}: idleVoiceChannelId geçersiz veya botun kanalı görme izni yok.`);
        return;
    }

    const active = getVoiceConnection(guild.id);
    if (active?.joinConfig.channelId === channel.id && active.state.status === VoiceConnectionStatus.Ready) return;

    active?.destroy();

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
        logger(`${config.name}: bekleme ses kanalına katıldı.`);
    });

    connection.on("error", error => {
        logger(`${config.name}: bekleme sesi bağlantı hatası: ${error.message}`);
    });
}
    function canRegister(message) {
        if (config.commandChannelId && message.channel.id !== config.commandChannelId) return false;
        if (config.staffRoleId) return message.member.roles.cache.has(config.staffRoleId);
        return message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    }
function hasServerTag(member) {
    const tag = config.serverTag;
    if (!tag) return false;

    return [
        member.user.username,
        member.user.globalName
    ]
        .filter(Boolean)
        .some(value => value.includes(tag));
}
    async function sendLog(guild, embed) {
        if (!config.logChannelId) return;
        const channel = guild.channels.cache.get(config.logChannelId);
        if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
    }

    async function register(message, type, target, nameAndAge) {
        if (target.voice.channelId !== config.voiceChannelId) {
            return message.reply("Bu üye bu botun kayıt ses odasında değil.");
        }
        if (!nameAndAge) return message.reply("Kullanım: `!erkek @üye İsim Yaş` veya `!kadın @üye İsim Yaş`");

const details = parseRegistrationDetails(nameAndAge);
const star = hasServerTag(target) ? "☆" : "★";
const displayName = `${star} ${details.display}`.slice(0, 32);
      const roleIds = [
    config.memberRoleId,
    type === "male" ? config.maleRoleId : config.femaleRoleId,
    config.eventRoleId,
    config.giveawayRoleId,
    hasServerTag(target) ? config.tagRoleId : null
].filter(Boolean);

        try {
            if (config.unregisteredRoleId && target.roles.cache.has(config.unregisteredRoleId)) {
                await target.roles.remove(config.unregisteredRoleId);
            }
            if (roleIds.length) await target.roles.add(roleIds);
            await target.setNickname(displayName);

            const label = type === "male" ? "Erkek" : "Kadın";
          try {
    saveRegistration({
        guildId: message.guild.id,
        memberId: target.id,
        memberTag: target.user.tag,
        displayName,
        registerType: label,
        registeredById: message.author.id,
        registeredByTag: message.author.tag,
        botName: config.name,
        birthDate: details.birthDate?.value || null,
        birthday: details.birthDate?.birthday || null,
        calculatedAge: details.birthDate?.age ?? null
    });
} catch (historyError) {
    logger(`${config.name}: kayıt geçmişi yazılamadı: ${historyError.message}`);
}
            await message.reply(`✅ ${target} kaydı tamamlandı: **${displayName}** (${label}).`);
            await sendLog(message.guild, new EmbedBuilder()
                .setColor(config.color || "Blue")
                .setTitle("Kayıt tamamlandı")
                .addFields(
                    { name: "Üye", value: `${target.user.tag} (${target.id})` },
                    { name: "Kayıt eden", value: `${message.author.tag}` },
                    { name: "Bilgi", value: `${displayName} — ${label}${details.birthDate ? `\nDoğum tarihi: ${details.birthDate.value}` : ""}` },
                    { name: "Register bot", value: config.name }
                )
                .setTimestamp());
        } catch (error) {
            logger(`${config.name}: kayıt hatası: ${error.message}`);
            await message.reply("Kayıt yapılamadı. Botun **Rolleri Yönet** ve **Takma Adları Yönet** izinlerini kontrol et.");
        }
    }

    client.once("ready", async () => {
        logger(`${config.name} aktif oldu — ${client.user.tag}`);
        for (const guild of client.guilds.cache.values()) {
            const channel = getRegisterChannel(guild);
       if (hasHumans(channel)) {
    joinRegisterChannel(guild);
} else {
    joinIdleChannel(guild);
}
            await syncGuildMembershipDurationRoles(guild);
        }
        setInterval(() => {
            for (const guild of client.guilds.cache.values()) syncGuildMembershipDurationRoles(guild).catch(error => logger(`${config.name}: sure rol taramasi hatasi: ${error.message}`));
        }, 6 * 60 * 60_000);
        setInterval(() => {
            for (const guild of client.guilds.cache.values()) {
                const registerChannel = getRegisterChannel(guild);
                const desiredChannel = hasHumans(registerChannel) ? registerChannel : guild.channels.cache.get(config.idleVoiceChannelId);
                const active = getVoiceConnection(guild.id);
                if (desiredChannel?.isVoiceBased() && (active?.joinConfig.channelId !== desiredChannel.id || active.state.status !== VoiceConnectionStatus.Ready)) {
                    logger(`${config.name}: 30 dakika ses denetimi; hedef odaya yeniden bağlanıyor.`);
                    if (desiredChannel.id === config.voiceChannelId) void joinRegisterChannel(guild);
                    else void joinIdleChannel(guild);
                }
            }
        }, 30 * 60_000).unref();
    });

    client.on("guildMemberAdd", member => assignUnregisteredRole(member));

    // Only Register 1 synchronizes later tag changes, avoiding three bots doing the same edit.
    if (config.primaryTagSync) client.on("userUpdate", async (oldUser, newUser) => {
        if (newUser.bot || oldUser.username === newUser.username) return;
        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member || member.roles.cache.has(config.unregisteredRoleId)) continue;
            const tagged = hasServerTag(member);
            if (tagged && config.tagRoleId && !member.roles.cache.has(config.tagRoleId)) await member.roles.add(config.tagRoleId, "Server tag acquired").catch(error => logger(`${config.name}: tag role failed: ${error.message}`));
            const raw = (member.nickname || member.user.globalName || member.user.username).replace(/^(?:\u2605|\u2606)\s*/u, "").trim();
            const nickname = `${tagged ? "\u2606" : "\u2605"} ${raw}`.slice(0, 32);
            if (member.nickname !== nickname) await member.setNickname(nickname, "Server tag synchronization").catch(error => logger(`${config.name}: tag nickname failed: ${error.message}`));
        }
    });

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (newState.member?.user.bot) return;

    const guild = newState.guild;
    const enteredRegisterRoom =
        oldState.channelId !== config.voiceChannelId &&
        newState.channelId === config.voiceChannelId;

    if (enteredRegisterRoom) {
        await joinRegisterChannel(guild);

        const alertChannel = guild.channels.cache.get(config.commandChannelId);

        if (config.staffRoleId && alertChannel?.isTextBased()) {
            await alertChannel
                .send(`<@&${config.staffRoleId}> ${newState.member} kayıt odasına geldi.`)
                .catch(error => logger(`${config.name}: yetkili çağrı hatası: ${error.message}`));
        }
    }

    if (oldState.channelId === config.voiceChannelId && newState.channelId !== config.voiceChannelId) {
        leaveWhenEmpty(guild);
    }
});

    client.on("messageCreate", async message => {
        if (message.author.bot || !message.guild) return;
        const prefix = config.prefix || "!";
        if (!message.content.startsWith(prefix)) return;

        const [command] = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = command?.toLocaleLowerCase("tr-TR");
        if (!["erkek", "kadın", "kadin", "isim"].includes(commandName)) return;
        setTimeout(() => message.delete().catch(() => {}), 1_000);
        if (!canRegister(message)) return message.reply("Bu kayıt komutunu kullanma yetkin yok.");

        const target = message.mentions.members.first();
        if (!target) return message.reply("Lütfen kayıt edilecek üyeyi etiketle.");
       if (target.voice.channelId !== config.voiceChannelId) return;

if (message.member.voice.channelId !== config.voiceChannelId) {
    return message.reply("Kayıt etmek için üyeyle aynı kayıt ses odasında olmalısın.");
} const remainder = message.content
            .slice(prefix.length)
            .trim()
            .replace(/^\S+\s+<@!?\d+>\s*/, "")
            .trim();

        if (commandName === "isim") {
            if (target.voice.channelId !== config.voiceChannelId) return message.reply("Bu üye bu botun kayıt ses odasında değil.");
            if (!remainder) return message.reply("Kullanım: `!isim @üye İsim Yaş`");
            try {
                await target.setNickname(remainder.slice(0, 32));
                return message.reply(`✅ ${target} adı **${remainder.slice(0, 32)}** olarak güncellendi.`);
            } catch {
                return message.reply("İsim güncellenemedi; botun **Takma Adları Yönet** iznini kontrol et.");
            }
        }
        return register(message, commandName === "erkek" ? "male" : "female", target, remainder);
    });
    client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = config.prefix || "!";
    if (!message.content.startsWith(prefix)) return;

    const [command] = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = command?.toLocaleLowerCase("tr-TR");

    if (!["topkayıt", "kayıtlarım", "kayitlarim"].includes(commandName)) return;
    if (config.commandChannelId && message.channel.id !== config.commandChannelId) return;

    setTimeout(() => message.delete().catch(() => {}), 1_000);
    if (!canRegister(message)) {
        return message.reply("Bu komutu kullanma yetkin yok.");
    }

    const records = getRegistrations()
        .filter(record => record.guildId === message.guild.id);

    if (commandName === "topkayıt") {
        const totals = new Map();

        for (const record of records) {
            const current = totals.get(record.registeredById) || {
                tag: record.registeredByTag,
                count: 0
            };

            current.count += 1;
            totals.set(record.registeredById, current);
        }

        const ranking = [...totals.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        if (!ranking.length) {
            return message.reply("Henüz kayıt geçmişi bulunmuyor.");
        }

        const text = ranking
            .map((item, index) => `${index + 1}. **${item.tag}** — ${item.count} kayıt`)
            .join("\n");

        return message.reply(`🏆 **Kayıt Yetkilisi Sıralaması**\n${text}`);
    }

    const myTotal = records.filter(
        record => record.registeredById === message.author.id
    ).length;

    return message.reply(`📋 Toplam kayıt sayın: **${myTotal}**`);
});
    client.on("messageCreate", message => {
    if (!client.user || message.author.id !== client.user.id) return;

    // Kayıt logları kalıcı kalsın.
    if (message.channel.id === config.logChannelId) return;

    setTimeout(() => {
        message.delete().catch(() => {});
    }, 60_000);
});
}

module.exports = startRegistrationBot;
