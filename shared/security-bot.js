const { PermissionsBitField, AuditLogEvent, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

function startSecurityBot(client, config, logger) {
    const spamWindows = new Map();
    const raidWindows = new Map();
    const strikeWindows = new Map();
    const raidActive = new Set();
    const moderationFile = path.join(__dirname, "..", "data", "security-cases.json");
    let moderation = { cases: {}, notes: {} };
    if (config.features?.staffModeration) {
        try { const stored = JSON.parse(fs.readFileSync(moderationFile, "utf8")); moderation = { cases: stored.cases || {}, notes: stored.notes || {} }; } catch { /* first run */ }
    }

    function saveModeration() {
        if (!config.features?.staffModeration) return;
        fs.mkdirSync(path.dirname(moderationFile), { recursive: true });
        const temporary = `${moderationFile}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(moderation, null, 2), "utf8");
        fs.renameSync(temporary, moderationFile);
    }

    function isWhitelisted(member) {
        if (!member || member.user?.bot || member.id === member.guild?.ownerId) return true;
        if ((config.whitelistUserIds || []).includes(member.id)) return true;
        return (config.whitelistRoleIds || []).some(roleId => member.roles.cache.has(roleId));
    }

    function hasModeratorAccess(member) {
        if (!member) return false;
        if (member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return true;
        return (config.moderatorRoleIds || []).some(roleId => member.roles.cache.has(roleId));
    }

    async function sendLog(guild, content) {
        const channel = guild.channels.cache.get(config.logChannelId);
        if (channel?.isTextBased()) await channel.send(content).catch(error => logger(`${config.name} log error: ${error.message}`));
    }

    function activeWarnings(guildId, memberId) {
        const expiryMs = (config.staffModeration?.warningExpiryDays || 30) * 86_400_000;
        return Object.values(moderation.cases).filter(item => item.guildId === guildId && item.memberId === memberId && item.type === "warning" && item.status === "active" && Date.now() - item.createdAt <= expiryMs);
    }

    function createCase(guild, member, moderator, type, reason, channelId) {
        const id = `G-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const entry = { id, guildId: guild.id, memberId: member.id, moderatorId: moderator.id, type, reason, channelId, status: "active", createdAt: Date.now() };
        moderation.cases[id] = entry; saveModeration(); return entry;
    }

    async function sendCaseLog(guild, title, caseEntry, member, moderator, extra = []) {
        const channel = guild.channels.cache.get(config.logChannelId);
        if (!channel?.isTextBased()) return;
        const fields = [
            { name: "Vaka", value: caseEntry.id, inline: true },
            { name: "Üye", value: `${member.user.tag} (${member.id})`, inline: false },
            { name: "Yetkili", value: `${moderator.user.tag} (${moderator.id})`, inline: false },
            { name: "Kanal", value: `<#${caseEntry.channelId}>`, inline: true },
            { name: "Sebep", value: caseEntry.reason || "Belirtilmedi", inline: false },
            ...extra
        ];
        await channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(title).addFields(fields).setTimestamp()] }).catch(error => logger(`${config.name} case log error: ${error.message}`));
    }

    async function handleStaffModeration(message, args) {
        if (!hasModeratorAccess(message.member)) return message.reply("Bu güvenlik komutu sadece yetkililer içindir.");
        const action = args.shift()?.toLocaleLowerCase("tr-TR");
        if (!action) return message.reply("Güvenlik vaka sistemi aktif. `!guvenlik uyar @uye sebep`, `!guvenlik sicil @uye`, `!guvenlik not @uye not`, `!guvenlik geri G-...`");
        if (["uyar", "warn"].includes(action)) {
            const member = message.mentions.members.first(); const reason = args.slice(1).join(" ").trim();
            if (!member || !reason) return message.reply("Kullanım: `!guvenlik uyar @üye sebep`");
            if (isWhitelisted(member)) return message.reply("Koruma listesinde olan üyeye güvenlik vakası açılamaz.");
            const entry = createCase(message.guild, member, message.member, "warning", reason, message.channel.id);
            const warnings = activeWarnings(message.guild.id, member.id); const escalation = [...(config.staffModeration?.escalations || [])].filter(item => warnings.length >= item.warnings).at(-1);
            if (escalation?.timeoutMinutes) await member.timeout(escalation.timeoutMinutes * 60_000, `Security case ${entry.id}: ${reason}`).catch(error => logger(`${config.name} escalation failed: ${error.message}`));
            await sendCaseLog(message.guild, escalation ? "Güvenlik uyarısı ve otomatik ceza" : "Güvenlik uyarısı", entry, member, message.member, [
                { name: "Aktif uyarı", value: String(warnings.length), inline: true },
                { name: "Sonuç", value: escalation?.label || "Kayıt altına alındı", inline: true }
            ]);
            return message.reply(`Vaka **${entry.id}** oluşturuldu. Aktif uyarı: **${warnings.length}**${escalation ? ` • ${escalation.label}` : ""}`);
        }
        if (["sicil", "cases"].includes(action)) {
            const member = message.mentions.members.first(); if (!member) return message.reply("Kullanım: `!guvenlik sicil @üye`");
            const entries = Object.values(moderation.cases).filter(item => item.guildId === message.guild.id && item.memberId === member.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
            const notes = (moderation.notes[`${message.guild.id}:${member.id}`] || []).slice(-3).reverse();
            const accountDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
            const serverDays = member.joinedTimestamp ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000) : 0;
            return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`${member.user.tag} | Güvenlik sicili`).setDescription(entries.length ? entries.map(item => `• **${item.id}** — ${item.type} — ${item.status}\n${item.reason}`).join("\n") : "Vaka kaydı yok.").addFields(
                { name: "Hesap açılışı", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>\n${accountDays} gün önce`, inline: true },
                { name: "Sunucuya katılım", value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n${serverDays} gündür sunucuda` : "Bilinmiyor", inline: true },
                { name: "Son yetkili notları", value: notes.length ? notes.map(item => `• ${item.text}`).join("\n") : "Not yok." }
            ).setTimestamp()] });
        }
        if (["not", "note"].includes(action)) {
            const member = message.mentions.members.first(); const text = args.slice(1).join(" ").trim();
            if (!member || !text) return message.reply("Kullanım: `!guvenlik not @üye yetkili notu`");
            const key = `${message.guild.id}:${member.id}`; (moderation.notes[key] ||= []).push({ at: Date.now(), moderatorId: message.author.id, text }); saveModeration();
            return sendLog(message.guild, `Yetkili notu: ${member} | ${message.author} | ${text}`).then(() => message.reply("Not kalıcı güvenlik siciline eklendi."));
        }
        if (["geri", "kaldir", "revoke"].includes(action)) {
            const id = args[0]; const entry = moderation.cases[id];
            if (!entry || entry.guildId !== message.guild.id || entry.status !== "active") return message.reply("Açık vaka bulunamadı. Kullanım: `!guvenlik geri G-...`");
            entry.status = "revoked"; entry.revokedAt = Date.now(); entry.revokedBy = message.author.id; saveModeration();
            const member = await message.guild.members.fetch(entry.memberId).catch(() => null);
            if (member && entry.type === "warning") await member.timeout(null, `Security case revoked: ${id}`).catch(() => {});
            if (member) await sendCaseLog(message.guild, "Güvenlik vakası geri alındı", entry, member, message.member);
            return message.reply(`Vaka **${id}** geri alındı.`);
        }
        return message.reply("Bilinmeyen güvenlik alt komutu.");
    }

    function parseDuration(value) {
        const match = /^(\d+)(s|m|h)$/i.exec(value || "");
        if (!match) return null;
        const amount = Number(match[1]);
        const multiplier = match[2].toLowerCase() === "s" ? 1_000 : match[2].toLowerCase() === "m" ? 60_000 : 3_600_000;
        const duration = amount * multiplier;
        return duration > 0 && duration <= 6 * 60 * 60_000 ? duration : null;
    }

    async function lockChannel(message, locked) {
        if (!hasModeratorAccess(message.member)) return message.reply("Bu komut sadece yetkililer icindir.");
        if (!message.channel?.permissionOverwrites?.edit) return message.reply("Bu kanal kilitlenemez.");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: locked ? false : null }, `${config.name}: channel ${locked ? "locked" : "unlocked"}`);
            await sendLog(message.guild, `${locked ? "Kanal kilitlendi" : "Kanal acildi"}: ${message.channel} | Yetkili: ${message.author}`);
            return message.reply(locked ? "Kanal kilitlendi." : "Kanal acildi.");
        } catch (error) {
            logger(`${config.name} channel lock error: ${error.message}`);
            return message.reply("Islem uygulanamadi. Botun Kanallari Yonet iznini kontrol et.");
        }
    }

    async function cleanChannel(message, amount) {
        if (!hasModeratorAccess(message.member)) return message.reply("Bu komut sadece yetkililer icindir.");
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) return message.reply("Kullanim: `!guvenliktemizle 1-100`");
        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            await sendLog(message.guild, `Guvenlik temizligi: ${deleted.size} mesaj | Kanal: ${message.channel} | Yetkili: ${message.author}`);
            return message.channel.send(`${deleted.size} mesaj silindi.`).then(reply => setTimeout(() => reply.delete().catch(() => {}), 5_000));
        } catch {
            return message.reply("Mesajlar silinemedi. Botun Mesajlari Yonet iznini kontrol et.");
        }
    }

    async function lockdownGuild(guild, locked, reason) {
        const excluded = new Set(config.raidExcludedChannelIds || []);
        const channels = guild.channels.cache.filter(channel => channel.isTextBased?.() && channel.permissionOverwrites?.edit && !excluded.has(channel.id));
        let changed = 0;
        for (const channel of channels.values()) {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: locked ? false : null, CreateInstantInvite: locked ? false : null }, reason).then(() => { changed += 1; }).catch(error => logger(`${config.name} lockdown error: ${error.message}`));
        }
        if (locked) raidActive.add(guild.id); else raidActive.delete(guild.id);
        await sendLog(guild, `${locked ? "RAID KILIDI" : "Raid kilidi acildi"}: ${changed} kanal | ${reason}`);
        return changed;
    }

    async function applyStrike(message, reason) {
        if (isWhitelisted(message.member)) return;
        const key = `${message.guild.id}:${message.author.id}`;
        const strikes = (strikeWindows.get(key) || []).filter(at => Date.now() - at < 15 * 60_000);
        strikes.push(Date.now()); strikeWindows.set(key, strikes);
        await message.delete().catch(() => {});
        if (strikes.length < (config.contentFilter?.strikesBeforeTimeout || 2)) return sendLog(message.guild, `Filtre: ${message.author} | ${reason} | Uyari ${strikes.length}`);
        try {
            const minutes = config.contentFilter?.timeoutMinutes || 30;
            await message.member.timeout(minutes * 60_000, `Security filter: ${reason}`);
            await sendLog(message.guild, `Filtre timeout: ${message.author} | ${reason} | ${minutes} dk`);
        } catch (error) { logger(`${config.name} filter action failed: ${error.message}`); }
    }

    function hasBlockedContent(content) {
        const lowered = content.toLocaleLowerCase("tr-TR");
        if (config.contentFilter?.blockDiscordInvites && /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(content)) return "izinsiz Discord daveti";
        if ((config.contentFilter?.blockedDomains || []).some(domain => lowered.includes(domain.toLocaleLowerCase("tr-TR")))) return "engelli baglanti";
        if ((config.contentFilter?.blockedWords || []).some(word => lowered.includes(word.toLocaleLowerCase("tr-TR")))) return "yasakli kelime";
        const letters = content.replace(/[^a-zA-ZÇĞİÖŞÜçğıöşü]/g, "");
        if (letters.length >= 12 && letters === letters.toUpperCase()) return "caps spam";
        if (/(.)\1{9,}/u.test(content)) return "tekrar spam";
        return null;
    }

    function riskScore(message) {
        const content = message.content || ""; let score = 0; const reasons = [];
        if (/https?:\/\/(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd)\//i.test(content)) { score += 3; reasons.push("kısa bağlantı"); }
        if (/(?:discord[-_.]?(?:gift|nitro)|discordapp[-_.]?(?:gift|nitro)|dlscord|disc0rd)/i.test(content)) { score += 5; reasons.push("Discord/Nitro taklidi"); }
        if ((content.match(/<@&?\d+>|@everyone|@here/g) || []).length >= 4) { score += 4; reasons.push("toplu mention"); }
        return { score, reason: reasons.join(", ") };
    }

    async function checkSpam(message) {
        if (!config.features?.antiSpam || isWhitelisted(message.member)) return;
        const now = Date.now();
        const limit = config.antiSpam?.maxMessages || 6;
        const windowMs = (config.antiSpam?.windowSeconds || 10) * 1_000;
        const key = `${message.guild.id}:${message.author.id}`;
        const history = (spamWindows.get(key) || []).filter(at => now - at <= windowMs);
        history.push(now); spamWindows.set(key, history);
        if (history.length < limit) return;
        spamWindows.set(key, []);
        await message.delete().catch(() => {});
        const timeoutMs = (config.antiSpam?.timeoutMinutes || 10) * 60_000;
        try {
            await message.member.timeout(timeoutMs, "Automatic spam protection");
            await sendLog(message.guild, `Spam korumasi: ${message.author} ${history.length} mesaj nedeniyle ${Math.round(timeoutMs / 60_000)} dk timeout aldi.`);
        } catch (error) {
            logger(`${config.name} spam action failed: ${error.message}`);
        }
    }

    client.once("ready", () => logger(`${config.name} active: ${client.user.tag}`));

    client.on("guildMemberAdd", async member => {
        if (config.features?.antiRaid) {
            const now = Date.now(); const history = (raidWindows.get(member.guild.id) || []).filter(at => now - at < (config.antiRaid?.windowSeconds || 60) * 1_000);
            history.push(now); raidWindows.set(member.guild.id, history);
            if (history.length >= (config.antiRaid?.joinThreshold || 10)) await lockdownGuild(member.guild, true, `Raid algilandi: ${history.length} uye`);
        }
        if (raidActive.has(member.guild.id) && !member.user.bot && !isWhitelisted(member)) {
            const quarantineRoleId = config.quarantineRoleId;
            if (quarantineRoleId) await member.roles.add(quarantineRoleId, "Raid karantinası").catch(() => {});
            await member.timeout((config.antiRaid?.quarantineMinutes || 60) * 60_000, "Raid mode quarantine").catch(() => {});
            await sendLog(member.guild, `Raid karantinası: ${member} | ${config.antiRaid?.quarantineMinutes || 60} dk`);
        }
        if (!config.features?.newAccountGuard || member.user.bot) return;
        if (isWhitelisted(member)) return;
        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
        if (accountAgeDays >= (config.newAccountGuard?.minimumAccountAgeDays || 7)) return;
        const duration = (config.newAccountGuard?.timeoutMinutes || 60) * 60_000;
        try {
            await member.timeout(duration, "New account safety check");
            await sendLog(member.guild, `Yeni hesap kontrolu: ${member} hesabi ${Math.floor(accountAgeDays)} gunluk oldugu icin ${Math.round(duration / 60_000)} dk timeout aldi.`);
        } catch (error) {
            logger(`${config.name} new account action failed: ${error.message}`);
        }
    });

    client.on("guildBanAdd", ban => sendLog(ban.guild, `Guvenlik kaydi: ${ban.user.tag} yasaklandi.`));

    client.on("guildAuditLogEntryCreate", async (entry, guild) => {
        if (!config.features?.auditProtection || !entry.executorId) return;
        const protectedActions = [AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelDelete, AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate, AuditLogEvent.MemberRoleUpdate];
        if (!protectedActions.includes(entry.action)) return;
        const executor = await guild.members.fetch(entry.executorId).catch(() => null);
        if (!executor || isWhitelisted(executor)) return;
        const key = `${guild.id}:${executor.id}:${entry.action}`; const now = Date.now();
        const actions = (strikeWindows.get(key) || []).filter(at => now - at < 30_000); actions.push(now); strikeWindows.set(key, actions);
        if (actions.length < (config.auditProtection?.maxActions || 3)) return;
        try {
            await executor.timeout((config.auditProtection?.timeoutMinutes || 1_440) * 60_000, `Audit protection: ${entry.action}`);
            await lockdownGuild(guild, true, `Yetki saldirisi: ${executor.user.tag}`);
            await sendLog(guild, `Yetki saldirisi durduruldu: ${executor} | ${entry.action}`);
        } catch (error) { logger(`${config.name} audit action failed: ${error.message}`); }
    });

    // Instant alarms for a single dangerous change; the escalation handler above
    // still protects against repeated destructive audit activity.
    client.on("roleUpdate", async (oldRole, newRole) => {
        if (!config.features?.auditProtection) return;
        const dangerous = (config.dangerousPermissions || []).filter(name => !oldRole.permissions.has(name) && newRole.permissions.has(name));
        if (dangerous.length) await sendLog(newRole.guild, `⚠️ Rol yetkisi alarmı: **${newRole.name}** rolüne tehlikeli izin verildi: ${dangerous.join(", ")}`);
        const me = newRole.guild.members.me;
        if (me && newRole.id === me.roles.highest.id && newRole.position < oldRole.position) await sendLog(newRole.guild, `🚨 Bot rolü aşağı taşındı: **${newRole.name}**`);
    });

    client.on("channelUpdate", async (oldChannel, newChannel) => {
        if (!config.features?.auditProtection || !newChannel.isTextBased?.()) return;
        const oldEveryone = oldChannel.permissionOverwrites?.cache.get(newChannel.guild.roles.everyone.id);
        const newEveryone = newChannel.permissionOverwrites?.cache.get(newChannel.guild.roles.everyone.id);
        const wasClosed = oldEveryone?.allow?.has(PermissionsBitField.Flags.SendMessages) === false;
        const isOpen = newEveryone?.allow?.has(PermissionsBitField.Flags.SendMessages) === true;
        if (wasClosed && isOpen) await sendLog(newChannel.guild, `⚠️ Kanal izin alarmı: ${newChannel} herkese yazmaya açıldı.`);
    });

    client.on("messageCreate", async message => {
        if (message.author.bot || !message.guild) return;
        const filtered = config.features?.contentFilter ? hasBlockedContent(message.content) : null;
        if (filtered) { await applyStrike(message, filtered); return; }
        if (config.features?.contentFilter && !isWhitelisted(message.member)) {
            const risk = riskScore(message);
            if (risk.score >= 5) { await message.delete().catch(() => {}); await message.member.timeout((config.contentFilter?.riskTimeoutMinutes || 60) * 60_000, `Risk filter: ${risk.reason}`).catch(() => {}); await sendLog(message.guild, `Yüksek risk engellendi: ${message.author} | ${risk.reason}`); return; }
        }
        await checkSpam(message);
        const prefix = config.prefix || "!";
        if (!message.content.startsWith(prefix)) return;
        if (config.commandChannelId && message.channel.id !== config.commandChannelId) return;
        setTimeout(() => message.delete().catch(() => {}), 5_000);
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const command = args.shift()?.toLocaleLowerCase("tr-TR");
        if (command === "guvenlik" && config.features?.staffModeration) return handleStaffModeration(message, args);
        if (command === "raidac" && config.features?.manualRaidControls) { if (!hasModeratorAccess(message.member)) return message.reply("Bu komut sadece yetkililer icindir."); const changed = await lockdownGuild(message.guild, false, `Yetkili: ${message.author.tag}`); return message.reply(`Raid kilidi kaldirildi: ${changed} kanal.`); }
        if (command === "raidkilit" && config.features?.manualRaidControls) { if (!hasModeratorAccess(message.member)) return message.reply("Bu komut sadece yetkililer icindir."); const changed = await lockdownGuild(message.guild, true, `Yetkili: ${message.author.tag}`); return message.reply(`Raid kilidi uygulandi: ${changed} kanal.`); }
        if (command === "kilit" && config.features?.staffModeration) return lockChannel(message, true);
        if (command === "ac" && config.features?.staffModeration) return lockChannel(message, false);
        if (command === "yavas" && config.features?.staffModeration) {
            if (!hasModeratorAccess(message.member)) return message.reply("Bu komut sadece yetkililer icindir.");
            const seconds = Number(args[0]);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21_600) return message.reply("Kullanim: `!yavas 0-21600`");
            try {
                await message.channel.setRateLimitPerUser(seconds, `${config.name}: slowmode`);
                await sendLog(message.guild, `Yavas mod: ${message.channel} ${seconds} sn | Yetkili: ${message.author}`);
                return message.reply(seconds ? `Yavas mod ${seconds} saniye yapildi.` : "Yavas mod kapatildi.");
            } catch { return message.reply("Yavas mod ayarlanamadi. Kanallari Yonet iznini kontrol et."); }
        }
        if (command === "guvenliktemizle" && config.features?.staffModeration) return cleanChannel(message, Number(args[0]));
        if (command === "guvenliktimeout" && config.features?.staffModeration) {
            if (!hasModeratorAccess(message.member)) return message.reply("Bu komut sadece yetkililer icindir.");
            const target = message.mentions.members.first();
            const duration = parseDuration(args[1]);
            if (!target || !duration) return message.reply("Kullanim: `!guvenliktimeout @uye 10m`");
            try {
                await target.timeout(duration, `Security command: ${message.author.tag}`);
                await sendLog(message.guild, `Guvenlik timeout: ${target} ${args[1]} | Yetkili: ${message.author}`);
                return message.reply(`${target} kullanicisi timeout aldi.`);
            } catch { return message.reply("Timeout uygulanamadi. Bot rolunu ve iznini kontrol et."); }
        }
    });
}

module.exports = startSecurityBot;
