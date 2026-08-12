require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const createClient = require("../../../shared/client");
const logger = require("../../../shared/logger");
const keepVoiceConnected = require("../../../shared/voice-keeper");
const config = require("./config");
const createEngagementSystem = require("./engagement");
const attachCommunityTools = require("../../../shared/community-tools");

const client = createClient();
client.on("error", error => logger(`Discord client error: ${error.message}`));
process.on("unhandledRejection", error => logger(`Unhandled rejection: ${error?.message || error}`));
const dataDirectory = path.join(__dirname, "../../../data");
const statisticsFile = path.join(dataDirectory, "statistics.json");
const pointEventsFile = path.join(dataDirectory, "rank-point-events.jsonl");
const invitesFile = path.join(dataDirectory, "invite-history.jsonl");
const registrationsFile = path.join(dataDirectory, "kayit-gecmisi.jsonl");
const moderationFile = path.join(dataDirectory, "moderation.json");
const auditFile = path.join(dataDirectory, "general-1-audit.jsonl");
const storeRequestsFile = path.join(dataDirectory, "store-requests.json");
const securityCasesFile = path.join(dataDirectory, "security-cases.json");
const securityAppealsFile = path.join(dataDirectory, "security-appeals.json");
const communityPanelsFile = path.join(dataDirectory, "community-panels.json");
const backupsDirectory = path.join(dataDirectory, "backups");
const DAY_MS = 86_400_000;
const inviteSnapshots = new Map();
const engagement = createEngagementSystem({ dataDirectory, settings: config.engagement });

function loadCommunityPanels() {
    try { const saved = JSON.parse(fs.readFileSync(communityPanelsFile, "utf8")); return { confessions: saved.confessions || {}, rooms: saved.rooms || {}, marriages: saved.marriages || {}, proposals: saved.proposals || {} }; } catch { return { confessions: {}, rooms: {}, marriages: {}, proposals: {} }; }
}
let communityPanels = loadCommunityPanels();
function saveCommunityPanels() {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temporary = `${communityPanelsFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(communityPanels, null, 2), "utf8");
    fs.renameSync(temporary, communityPanelsFile);
}

function loadData() {
    try {
        const saved = fs.existsSync(statisticsFile)
            ? JSON.parse(fs.readFileSync(statisticsFile, "utf8")) : {};
        return { users: saved.users || {}, activeVoice: saved.activeVoice || {}, meta: saved.meta || {} };
    } catch {
        return { users: {}, activeVoice: {}, meta: {} };
    }
}

let data = loadData();

function saveData() {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temporary = `${statisticsFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temporary, statisticsFile);
}

function appendJsonl(file, record) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

function loadModeration() {
    try {
        const value = JSON.parse(fs.readFileSync(moderationFile, "utf8"));
        return { warnings: value.warnings || {}, cases: value.cases || {} };
    } catch { return { warnings: {}, cases: {} }; }
}

let moderation = loadModeration();

function loadStoreRequests() {
    try { const value = JSON.parse(fs.readFileSync(storeRequestsFile, "utf8")); return value.requests || {}; } catch { return {}; }
}
let storeRequests = loadStoreRequests();
function saveStoreRequests() {
    const temporary = `${storeRequestsFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ requests: storeRequests }, null, 2), "utf8");
    fs.renameSync(temporary, storeRequestsFile);
}

function loadSecurityAppeals() {
    try { const value = JSON.parse(fs.readFileSync(securityAppealsFile, "utf8")); return value.appeals || {}; } catch { return {}; }
}
let securityAppeals = loadSecurityAppeals();
function saveSecurityAppeals() {
    const temporary = `${securityAppealsFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ appeals: securityAppeals }, null, 2), "utf8");
    fs.renameSync(temporary, securityAppealsFile);
}
function loadSecurityCases() {
    try { return JSON.parse(fs.readFileSync(securityCasesFile, "utf8")); } catch { return { cases: {}, notes: {} }; }
}
function saveSecurityCases(value) {
    const temporary = `${securityCasesFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporary, securityCasesFile);
}

function saveModeration() {
    const temporary = `${moderationFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(moderation, null, 2), "utf8");
    fs.renameSync(temporary, moderationFile);
}

function openCase(guildId, type, actorId, targetId, details = {}) {
    const id = `V-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    moderation.cases[id] = { id, guildId, type, actorId, targetId, details, status: "open", createdAt: Date.now() };
    saveModeration(); audit(guildId, type, actorId, targetId, { caseId: id, ...details });
    return moderation.cases[id];
}

function audit(guildId, action, actorId, targetId, details = {}) {
    appendJsonl(auditFile, { at: Date.now(), guildId, action, actorId, targetId, ...details });
}

function readJsonl(file) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function getUser(user) {
    if (!data.users[user.id]) {
        data.users[user.id] = {
            id: user.id, tag: user.tag, messages: 0, dailyMessages: {},
            voice: { actualMs: 0, weightedMs: 0, mutedMs: 0, channels: {} },
            rank: { totalPoints: 0, rankGrantedAt: null, currentRoleId: null, lastActivityAt: null }
        };
    }
    const entry = data.users[user.id];
    entry.tag = user.tag;
    entry.dailyMessages ||= {};
    entry.voice ||= { actualMs: 0, weightedMs: 0, mutedMs: 0, channels: {} };
    entry.voice.channels ||= {};
    entry.rank ||= { totalPoints: 0, rankGrantedAt: null, currentRoleId: null, lastActivityAt: null };
    entry.rank.totalPoints ||= 0;
    return entry;
}

function formatDuration(ms) {
    const minutes = Math.floor(ms / 60_000);
    return minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

function formatNumber(value) {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.max(0, value || 0));
}

function progressBar(current, target, length = 12) {
    const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 1;
    const filled = Math.round(ratio * length);
    return `\`${"█".repeat(filled)}${"░".repeat(length - filled)}\` ${Math.round(ratio * 100)}%`;
}

function getPeriodActivity(userId, guildId, days) {
    const since = Date.now() - days * DAY_MS;
    const events = getPointEventsSince(guildId, since).filter(event => event.userId === userId);
    const messages = events.filter(event => event.type === "message").length;
    const voiceMs = events.filter(event => event.type === "voice").reduce((sum, event) => sum + (event.milliseconds || 0), 0);
    const mutedMs = events.filter(event => event.type === "muted_voice").reduce((sum, event) => sum + (event.milliseconds || 0), 0);
    return { messages, voiceMs, mutedMs };
}

function getPointRank(userId, guildId, days = 30) {
    const totals = new Map();
    for (const event of getPointEventsSince(guildId, Date.now() - days * DAY_MS)) {
        totals.set(event.userId, (totals.get(event.userId) || 0) + event.points);
    }
    const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const position = ordered.findIndex(([id]) => id === userId);
    return position === -1 ? null : position + 1;
}

function createProfileEmbed(member) {
    const user = getUser(member.user);
    const current = getRank(member);
    const currentIndex = config.rankSystem.ranks.findIndex(rank => rank.roleId === current.roleId);
    const next = config.rankSystem.ranks[currentIndex + 1];
    const status = rankEligibility(member, next || current);
    const oneDay = getPeriodActivity(member.id, member.guild.id, 1);
    const sevenDays = getPeriodActivity(member.id, member.guild.id, 7);
    const fourteenDays = getPeriodActivity(member.id, member.guild.id, 14);
    const monthRank = getPointRank(member.id, member.guild.id);
    const nextProgress = next ? progressBar(user.rank.totalPoints, next.minimumTotalPoints) : "`████████████` 100%";
    const footer = next
        ? `Sonraki rutbe: ${next.name} | ${formatNumber(Math.max(0, next.minimumTotalPoints - user.rank.totalPoints))} puan kaldi`
        : "Maksimum rutbedesin";

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: "Wesh Activity Center", iconURL: member.guild.iconURL({ size: 128 }) || undefined })
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTitle(`${member.displayName} | Profil Kartı`)
        .setDescription(`**${current.name}**\n${nextProgress}`)
        .addFields(
            { name: "RUTBE VE PUAN", value: `Toplam: **${formatNumber(user.rank.totalPoints)}**\n30 gun: **${formatNumber(status.thirtyDays)}**\n30 gun sirasi: **${monthRank ? `#${monthRank}` : "-"}**`, inline: true },
            { name: "MESAJ AKTIVITESI", value: `1 gun  **${oneDay.messages}**\n7 gun  **${sevenDays.messages}**\n14 gun **${fourteenDays.messages}**`, inline: true },
            { name: "SES AKTIVITESI", value: `1 gun  **${formatDuration(oneDay.voiceMs)}**\n7 gun  **${formatDuration(sevenDays.voiceMs)}**\n14 gun **${formatDuration(fourteenDays.voiceMs)}**`, inline: true },
            { name: "OZET", value: `Toplam mesaj: **${formatNumber(user.messages)}**\nGercek ses: **${formatDuration(getLiveVoiceTime(member.id, "actualMs"))}**\nSusturulmus ses: **${formatDuration(getLiveVoiceTime(member.id, "mutedMs"))}**`, inline: false }
        )
        .setFooter({ text: footer })
        .setTimestamp();
}

function roundedCard(context, x, y, width, height, radius = 22) {
    context.beginPath(); context.moveTo(x + radius, y); context.arcTo(x + width, y, x + width, y + height, radius); context.arcTo(x + width, y + height, x, y + height, radius); context.arcTo(x, y + height, x, y, radius); context.arcTo(x, y, x + width, y, radius); context.closePath();
}

async function createVisualProfilePayload(member) {
    const user = getUser(member.user); const oneDay = getPeriodActivity(member.id, member.guild.id, 1); const week = getPeriodActivity(member.id, member.guild.id, 7);
    const rank = getRank(member); const monthRank = getPointRank(member.id, member.guild.id) || "-"; const voice = getLiveVoiceTime(member.id, "actualMs");
    const canvas = createCanvas(1200, 700); const context = canvas.getContext("2d");
    const background = context.createLinearGradient(0, 0, 1200, 700); background.addColorStop(0, "#07152f"); background.addColorStop(0.5, "#111a3d"); background.addColorStop(1, "#160c2c"); context.fillStyle = background; context.fillRect(0, 0, 1200, 700);
    context.globalAlpha = 0.18; context.fillStyle = "#22d3ee"; context.beginPath(); context.arc(1020, 70, 250, 0, Math.PI * 2); context.fill(); context.fillStyle = "#a855f7"; context.beginPath(); context.arc(100, 710, 300, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
    const panel = (x, y, w, h) => { roundedCard(context, x, y, w, h); context.fillStyle = "rgba(9,18,50,0.82)"; context.fill(); context.strokeStyle = "rgba(99,102,241,0.55)"; context.lineWidth = 2; context.stroke(); };
    panel(35, 30, 1130, 190); panel(35, 245, 550, 190); panel(615, 245, 550, 190); panel(35, 465, 355, 195); panel(422, 465, 355, 195); panel(810, 465, 355, 195);
    try { const avatar = await loadImage(member.user.displayAvatarURL({ extension: "png", size: 256 })); context.save(); context.beginPath(); context.arc(125, 125, 68, 0, Math.PI * 2); context.clip(); context.drawImage(avatar, 57, 57, 136, 136); context.restore(); } catch { }
    context.fillStyle = "#f8fafc"; context.font = "bold 38px Arial"; context.fillText(member.displayName.slice(0, 28), 225, 100); context.font = "22px Arial"; context.fillStyle = "#a5b4fc"; context.fillText(`${rank.name} • ${Math.floor((Date.now() - (member.joinedTimestamp || Date.now())) / DAY_MS)} gundur sunucuda`, 225, 140);
    context.font = "bold 20px Arial"; context.fillStyle = "#67e8f9"; context.fillText(`TOPLAM PUAN  ${formatNumber(user.rank.totalPoints)}`, 225, 185);
    const metric = (x, y, title, value, accent) => { context.fillStyle = accent; context.fillRect(x, y, 5, 34); context.fillStyle = "#cbd5e1"; context.font = "20px Arial"; context.fillText(title, x + 18, y + 25); context.fillStyle = "#f8fafc"; context.font = "bold 34px Arial"; context.fillText(value, x + 18, y + 78); };
    metric(70, 280, "MESAJ AKTIVITESI", formatNumber(user.messages), "#22d3ee"); metric(650, 280, "SES AKTIVITESI", formatDuration(voice), "#c084fc");
    context.font = "18px Arial"; context.fillStyle = "#94a3b8"; context.fillText(`Bugun: ${oneDay.messages} • Bu hafta: ${week.messages}`, 88, 390); context.fillText(`Bugun: ${formatDuration(oneDay.voiceMs)} • Bu hafta: ${formatDuration(week.voiceMs)}`, 668, 390);
    const small = (x, y, title, value, accent) => { context.fillStyle = accent; context.font = "bold 18px Arial"; context.fillText(title, x, y); context.fillStyle = "#f8fafc"; context.font = "bold 26px Arial"; context.fillText(value, x, y + 42); };
    small(65, 510, "30 GUN SIRASI", `#${monthRank}`, "#fbbf24"); small(65, 585, "SUSTURULMUS SES", formatDuration(getLiveVoiceTime(member.id, "mutedMs")), "#94a3b8");
    const channels = Object.entries(user.voice.channels || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => member.guild.channels.cache.get(id)?.name || "Silinmis kanal"); small(452, 510, "EN AKTIF SES", channels[0] || "Veri yok", "#34d399"); small(452, 585, "IKINCI KANAL", channels[1] || "Veri yok", "#34d399");
    small(840, 510, "MESAJ", formatNumber(user.messages), "#60a5fa"); small(840, 585, "GERCEK SES", formatDuration(voice), "#c084fc");
    const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), { name: `wesh-profile-${member.id}.png` });
    return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle("Wesh | Canli Profil Merkezi").setDescription("Profil kartin guncel istatistiklerden olusturuldu. Asagidaki dugmelerle farkli gorunumlere gec.").setImage(`attachment://${attachment.name}`)], files: [attachment] };
}

function createLeaderboardEmbed(guild, days) {
    const totals = new Map();
    for (const event of getPointEventsSince(guild.id, Date.now() - days * DAY_MS)) {
        totals.set(event.userId, { tag: event.tag, points: (totals.get(event.userId)?.points || 0) + event.points });
    }
    const ranking = [...totals.values()].sort((a, b) => b.points - a.points).slice(0, 10);
    const label = days === 7 ? "Haftalık" : "Aylık";
    return new EmbedBuilder()
        .setColor(days === 7 ? 0xF1C40F : 0x9B59B6)
        .setTitle(`${label} Liderlik Tablosu`)
        .setDescription(ranking.length
            ? ranking.map((item, index) => `${index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `**${index + 1}.**`} ${item.tag} — **${formatNumber(item.points)} puan**`).join("\n")
            : "Bu dönem için henüz puan kaydı yok.")
        .setFooter({ text: `${guild.name} • Son ${days} gün` })
        .setTimestamp();
}

function createChannelsEmbed(guild) {
    const totals = new Map();
    for (const event of getPointEventsSince(guild.id, Date.now() - 30 * DAY_MS)) {
        if (!event.channelId) continue;
        totals.set(event.channelId, (totals.get(event.channelId) || 0) + event.points);
    }
    const ranking = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    return new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("En Aktif Kanallar")
        .setDescription(ranking.length
            ? ranking.map(([channelId, points], index) => {
                const channel = guild.channels.cache.get(channelId);
                return `**${index + 1}.** ${channel ? channel.toString() : "Silinmiş kanal"} — **${formatNumber(points)} puan**`;
            }).join("\n")
            : "Son 30 gün için kanala bağlı etkinlik kaydı yok.")
        .setFooter({ text: `${guild.name} • Son 30 gün` })
        .setTimestamp();
}

function createTasksEmbed(member, type) {
    const entry = engagement.user(member.id, member.user.tag);
    const status = engagement.taskStatus(entry, type);
    const reward = config.engagement.taskRewards[type];
    return new EmbedBuilder()
        .setColor(type === "daily" ? 0xF1C40F : 0x9B59B6)
        .setTitle(type === "daily" ? "Gunluk Gorevler" : "Haftalik Gorevler")
        .setDescription(status.tasks.map(task => `${task.value >= task.goal ? "✅" : "⬜"} **${task.label}** — ${task.value}/${task.goal}`).join("\n"))
        .addFields({ name: "Odul", value: `Tamamlandiginda **${reward} coin**`, inline: true }, { name: "Durum", value: status.bucket.claimed ? "Odul alindi" : "Toplamaya hazir oldugunda butonu kullan", inline: true })
        .setFooter({ text: "Gorevler Istanbul saatine gore yenilenir." });
}

function createPersonalTasksEmbed(member) {
    const summary = engagement.personalSummary(member.id, member.user.tag);
    const render = status => status.tasks.map(task => `${task.value >= task.goal ? "[x]" : "[ ]"} ${task.label}: **${Math.floor(task.value)}/${task.goal}**`).join("\n");
    const dailyReward = `${config.engagement.taskRewards.daily} coin + ${config.engagement.taskPointRewards.daily} rutbe puani`;
    const weeklyReward = `${config.engagement.taskRewards.weekly} coin + ${config.engagement.taskPointRewards.weekly} rutbe puani`;
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`${member.displayName} | Kisisel Gorev Merkezi`)
        .setDescription("Gorevler otomatik takip edilir. Tum gorevler tamamlaninca odul butonunu kullan.")
        .addFields(
            { name: `Gunluk Gorevler | ${dailyReward}`, value: `${render(summary.daily)}\nDurum: ${summary.daily.bucket.claimed ? "Odul alindi" : "Devam ediyor"}`, inline: false },
            { name: `Haftalik Gorevler | ${weeklyReward}`, value: `${render(summary.weekly)}\nDurum: ${summary.weekly.bucket.claimed ? "Odul alindi" : "Devam ediyor"}`, inline: false },
            { name: "Kisisel Bakiye", value: `${summary.entry.coins} coin | ${summary.entry.badges.length} rozet | ${summary.entry.inventory.length} esya`, inline: false }
        )
        .setFooter({ text: "Gunluk gorevler Istanbul saatinde, haftalik gorevler Pazartesi yenilenir." });
}

function createBonusEmbed() {
    const active = engagement.getBonus();
    const windows = config.engagement.voiceBonusWindows.map(window => `${window.label}: **${window.days.map(day => ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"][day]).join(", ")} ${window.startHour}:00-${window.endHour}:00** • x${window.multiplier}`).join("\n");
    return new EmbedBuilder().setColor(active ? 0x57F287 : 0x5865F2).setTitle("Bonus Odul Saatleri").setDescription(active ? `Su an aktif: **${active.label}** • Ses puani x${active.multiplier}\n\n${windows}` : `Su an bonus yok.\n\n${windows}`).setFooter({ text: "Saatler: Europe/Istanbul" });
}

function createStoreEmbed(member) {
    const entry = engagement.user(member.id, member.user.tag);
    const items = config.engagement.store.map(item => `🛍️ **${item.name}** — ${item.cost} coin${item.limitedUntil ? `\n⏳ Sinirli sure: <t:${Math.floor(new Date(item.limitedUntil).getTime() / 1000)}:R>` : ""}\n${item.description || ""}\nKod: \`${item.id}\``).join("\n\n");
    return new EmbedBuilder().setColor(0xEB459E).setTitle("Wesh Coin Magazasi").setDescription(`Bakiye: **${entry.coins} coin**\n\n${items || "Magaza bos."}`).setFooter({ text: "Emoji ve kişisel rol talepleri üst yönetim onayıyla teslim edilir." });
}

function createGoalsEmbed(member) {
    const current = getRank(member); const index = config.rankSystem.ranks.findIndex(rank => rank.roleId === current.roleId); const next = config.rankSystem.ranks[index + 1];
    if (!next) return new EmbedBuilder().setColor(0x57F287).setTitle("Hedefin").setDescription("Maksimum rutbedesin.");
    const status = rankEligibility(member, next);
    return new EmbedBuilder().setColor(0x5865F2).setTitle("Sonraki Rutbe Hedefi").setDescription(`Hedef: **${next.name}**`).addFields(
        { name: "Toplam puan", value: `${formatNumber(status.totalPoints)}/${formatNumber(next.minimumTotalPoints)}`, inline: true },
        { name: "30 gun puani", value: `${formatNumber(status.thirtyDays)}/${formatNumber(next.minimumThirtyDayPoints)}`, inline: true },
        { name: "Sunucu suresi", value: `${Math.floor(status.serverDays)}/${next.minimumServerDays} gun`, inline: true },
        { name: "Rutbe suresi", value: `${Math.floor(status.rankDays)}/${next.minimumRankDays} gun`, inline: true }
    );
}

function createStaffEmbed(guild) {
    const staffId = config.rankSystem.staffRoleId;
    const rows = Object.values(data.users).map(user => {
        const events = getPointEventsSince(guild.id, Date.now() - 7 * DAY_MS).filter(event => event.userId === user.id);
        return { user, registrations: events.filter(event => event.type === "registration").length, points: events.reduce((sum, event) => sum + event.points, 0) };
    }).filter(row => !staffId || guild.members.cache.get(row.user.id)?.roles.cache.has(staffId)).sort((a, b) => b.points - a.points).slice(0, 10);
    return new EmbedBuilder().setColor(0x3498DB).setTitle("Yetkili Performansi | Son 7 Gun").setDescription(rows.length ? rows.map((row, index) => `**${index + 1}. ${row.user.tag}** — ${formatNumber(row.points)} puan • ${row.registrations} kayit`).join("\n") : "Yetkili verisi yok.");
}

async function sendRewardsPanel(message, member) {
    const components = viewer => [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("rewards:daily").setLabel("Gunluk").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rewards:weekly").setLabel("Haftalik").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("rewards:bonus").setLabel("Bonus Saatleri").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("rewards:store").setLabel("Magaza").setStyle(ButtonStyle.Secondary).setDisabled(!hasStoreAccess(viewer))
    ), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("rewards:claim-daily").setLabel("Gunluk odulu al").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("rewards:claim-weekly").setLabel("Haftalik odulu al").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("rewards:personal").setLabel("Kisisel gorevlerim").setStyle(ButtonStyle.Primary)
    )];
    const reply = await temporaryReply(message, { embeds: [createBonusEmbed()], components: components(message.member) });
    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
    collector.on("collect", async interaction => {
        const action = interaction.customId.split(":")[1];
        if (action === "store" && !hasStoreAccess(interaction.member)) return interaction.reply({ content: "Magaza su an sadece ust yonetime aciktir.", ephemeral: true });
        if (action.startsWith("claim-")) {
            const reward = engagement.claim(interaction.user.id, interaction.user.tag, action.slice(6));
            if (!reward) return interaction.reply({ content: "Gorevler tamamlanmadi veya odul zaten alindi.", ephemeral: true });
            const user = getUser(interaction.user);
            addPoints(user, reward.points, "task_reward", interaction.guild.id, { period: reward.period });
            saveData();
            audit(interaction.guild.id, "task_reward", interaction.user.id, interaction.user.id, reward);
            return interaction.reply({ content: `Odul alindi: **${reward.coins} coin** ve **${reward.points} rutbe puani**.`, ephemeral: true });
        }
        const target = await interaction.guild.members.fetch(member.id).catch(() => member);
        const embed = action === "daily" ? createTasksEmbed(target, "daily") : action === "weekly" ? createTasksEmbed(target, "weekly") : action === "store" ? createStoreEmbed(target) : action === "personal" ? createPersonalTasksEmbed(await interaction.guild.members.fetch(interaction.user.id)) : createBonusEmbed();
        await interaction.update({ embeds: [embed], components: components(interaction.member) });
    });
    collector.on("end", () => reply.edit({ components: [] }).catch(() => {}));
}

function profileComponents(active) {
    const buttons = [
        ["profile", "Yenile", ButtonStyle.Primary],
        ["weekly", "Haftalık", ButtonStyle.Secondary],
        ["monthly", "Aylık", ButtonStyle.Secondary],
        ["channels", "Kanallar", ButtonStyle.Success]
    ].map(([id, label, style]) => new ButtonBuilder().setCustomId(`activity:${id}`).setLabel(label).setStyle(style).setDisabled(id === active));
    return [new ActionRowBuilder().addComponents(buttons)];
}

async function sendProfilePanel(message, member) {
    const initial = await createVisualProfilePayload(member);
    const reply = await temporaryReply(message, { ...initial, components: profileComponents("profile") });
    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
    collector.on("collect", async interaction => {
        const view = interaction.customId.split(":")[1];
        if (view === "profile") { const payload = await createVisualProfilePayload(member); return interaction.update({ ...payload, components: profileComponents(view) }); }
        const embed = view === "weekly" ? createLeaderboardEmbed(member.guild, 7) : view === "monthly" ? createLeaderboardEmbed(member.guild, 30) : createChannelsEmbed(member.guild);
        await interaction.update({ embeds: [embed], files: [], components: profileComponents(view) });
    });
    collector.on("end", () => reply.edit({ components: [] }).catch(() => {}));
}

function getMultiplier(channelId) {
    const value = Number(config.voiceChannelMultipliers?.[channelId] ?? 1);
    return Number.isFinite(value) && value >= 0 ? value : 1;
}

function isTrackedVoiceChannel(channelId) {
    return Boolean(channelId && !config.ignoredVoiceChannelIds.includes(channelId));
}

function isMuted(state) {
    return Boolean(state.serverMute || state.selfMute || state.serverDeaf || state.selfDeaf);
}

function addPoints(user, points, type, guildId, details = {}) {
    if (!config.rankSystem.enabled || !Number.isFinite(points) || points === 0) return;
    const rounded = Math.round(points * 100) / 100;
    user.rank.totalPoints += rounded;
    user.rank.lastActivityAt = Date.now();
    appendJsonl(pointEventsFile, { at: Date.now(), guildId, userId: user.id, tag: user.tag, points: rounded, type, ...details });
    engagement.recordActivity({
        id: user.id, tag: user.tag, type,
        amount: type === "voice" || type === "muted_voice" ? (details.milliseconds || 0) / 60_000 : 1,
        stats: { messages: user.messages, voiceMs: user.voice?.actualMs || 0 }
    });
}

function addRegistrationPoints() {
    if (!config.registrationSystem?.enabled) return;
    const processed = new Set(data.meta.processedRegistrations || []);
    for (const record of readJsonl(registrationsFile)) {
        const key = `${record.guildId}:${record.registeredById}:${record.at || record.timestamp || record.registeredAt}:${record.memberId || record.userId || ""}`;
        if (processed.has(key) || !record.guildId || !record.registeredById) continue;
        const user = data.users[record.registeredById] || getUser({ id: record.registeredById, tag: record.registeredByTag || record.registeredById });
        addPoints(user, config.rankSystem.points.registration, "registration", record.guildId, { registrationId: key });
        processed.add(key);
    }
    data.meta.processedRegistrations = [...processed].slice(-20_000);
    saveData();
}

function syncRegistrationBirthdays() {
    if (!config.registrationSystem?.enabled) return;
    const processed = new Set(data.meta.processedBirthdayRegistrations || []);
    for (const record of readJsonl(registrationsFile)) {
        const key = `${record.guildId}:${record.memberId}:${record.birthDate || ""}:${record.at || ""}`;
        if (processed.has(key) || !record.memberId || !record.birthDate) continue;
        if (engagement.setBirthday(record.memberId, record.memberTag || record.memberId, record.birthDate)) processed.add(key);
    }
    data.meta.processedBirthdayRegistrations = [...processed].slice(-20_000);
    saveData();
}

async function syncBirthdayRole(guild, today) {
    const roleName = config.registrationSystem?.birthdayRoleName;
    if (!roleName) return;
    const role = config.registrationSystem?.birthdayRoleId
        ? guild.roles.cache.get(config.registrationSystem.birthdayRoleId)
        : guild.roles.cache.find(candidate => candidate.name === roleName);
    if (!role) return;
    const birthdayMembers = Object.values(engagement.state.users)
        .filter(entry => entry.birthday === today)
        .map(entry => entry.id);
    const birthdaySet = new Set(birthdayMembers);
    const members = await guild.members.fetch().catch(() => null);
    if (!members) return;
    data.meta.birthdayNicknames ||= {};
    for (const member of members.values()) {
        if (member.user.bot) continue;
        const shouldHave = birthdaySet.has(member.id);
        const hasRole = member.roles.cache.has(role.id);
        if (shouldHave && !hasRole) await member.roles.add(role, "Birthday role").catch(error => logger(`Birthday role add failed: ${error.message}`));
        if (!shouldHave && hasRole) await member.roles.remove(role, "Birthday ended").catch(error => logger(`Birthday role remove failed: ${error.message}`));
        const nickname = member.nickname || member.user.globalName || member.user.username;
        if (shouldHave && !nickname.endsWith(" 🎂")) {
            data.meta.birthdayNicknames[member.id] = nickname;
            await member.setNickname(`${nickname.slice(0, 29)} 🎂`, "Birthday nickname").catch(error => logger(`Birthday nickname add failed: ${error.message}`));
        }
        if (!shouldHave && nickname.endsWith(" 🎂")) {
            const original = data.meta.birthdayNicknames[member.id];
            await member.setNickname(original || nickname.slice(0, -3), "Birthday ended").catch(error => logger(`Birthday nickname remove failed: ${error.message}`));
            delete data.meta.birthdayNicknames[member.id];
        }
    }
    saveData();
}

function getPointEventsSince(guildId, since) {
    return readJsonl(pointEventsFile).filter(event => event.guildId === guildId && event.at >= since);
}

function getPointsFor(userId, guildId, since) {
    return getPointEventsSince(guildId, since)
        .filter(event => event.userId === userId)
        .reduce((total, event) => total + event.points, 0);
}

function closeVoiceSession(memberId) {
    const session = data.activeVoice[memberId];
    if (!session) return;
    const elapsed = Math.max(0, Date.now() - session.startedAt);
    const user = data.users[memberId];
    if (user) {
        user.voice.actualMs += elapsed;
        if (session.muted) {
            user.voice.mutedMs += elapsed;
            addPoints(user, (elapsed / 60_000) * config.rankSystem.points.mutedVoiceMinute, "muted_voice", session.guildId, { channelId: session.channelId, milliseconds: elapsed });
        } else if (session.humanCount >= (config.rankSystem.antiFarm?.minimumVoiceMembers || 2)) {
            const weighted = elapsed * getMultiplier(session.channelId);
            user.voice.weightedMs += weighted;
            addPoints(user, (elapsed / 60_000) * config.rankSystem.points.voiceMinute * getMultiplier(session.channelId), "voice", session.guildId, { channelId: session.channelId, milliseconds: elapsed });
            const bonus = engagement.getBonus();
            if (bonus) addPoints(user, (elapsed / 60_000) * config.rankSystem.points.voiceMinute * getMultiplier(session.channelId) * (bonus.multiplier - 1), "voice_event_bonus", session.guildId, { channelId: session.channelId, milliseconds: elapsed, bonus: bonus.label });
        }
        user.voice.channels[session.channelId] ||= { actualMs: 0, weightedMs: 0 };
        user.voice.channels[session.channelId].actualMs += elapsed;
        if (!session.muted) user.voice.channels[session.channelId].weightedMs += elapsed * getMultiplier(session.channelId);
    }
    delete data.activeVoice[memberId];
    saveData();
}

function openVoiceSession(member) {
    if (!isTrackedVoiceChannel(member.voice.channelId)) return;
    getUser(member.user);
    const humanCount = member.voice.channel?.members.filter(other => !other.user.bot).size || 1;
    data.activeVoice[member.id] = { guildId: member.guild.id, channelId: member.voice.channelId, startedAt: Date.now(), muted: isMuted(member.voice), humanCount };
    saveData();
}

function refreshVoiceChannel(channel) {
    if (!channel || !isTrackedVoiceChannel(channel.id)) return;
    const trackedMembers = Object.entries(data.activeVoice)
        .filter(([, session]) => session.channelId === channel.id)
        .map(([memberId]) => memberId);
    for (const memberId of trackedMembers) closeVoiceSession(memberId);
    for (const member of channel.members.values()) {
        if (!member.user.bot) openVoiceSession(member);
    }
}

function getLiveVoiceTime(userId, type) {
    const user = data.users[userId];
    const stored = user?.voice?.[type] || 0;
    const session = data.activeVoice[userId];
    if (!session) return stored;
    const elapsed = Math.max(0, Date.now() - session.startedAt);
    if (type === "mutedMs") return stored + (session.muted ? elapsed : 0);
    if (type === "weightedMs") return stored + (!session.muted ? elapsed * getMultiplier(session.channelId) : 0);
    return stored + elapsed;
}

function temporaryReply(message, payload) {
    return message.channel.send(payload).then(reply => {
        setTimeout(() => reply.delete().catch(() => {}), 60_000);
        return reply;
    });
}

const commandCooldowns = new Map();

function hasModeratorAccess(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return true;
    return (config.rankSystem.moderatorRoleIds || []).some(roleId => member.roles.cache.has(roleId));
}

function hasStoreAccess(member) {
    if (!member || member.user.bot) return false;
    const unregisteredRoleId = config.engagement.unregisteredRoleId;
    return !config.engagement.storeRequiresRegisteredMember || !unregisteredRoleId || !member.roles.cache.has(unregisteredRoleId);
}

function isFounder(userId) { return userId === config.engagement.founderId; }

function communitySettings() { return config.engagement.communityPanels || {}; }
function configured(id) { return typeof id === "string" && /^\d{16,20}$/.test(id); }
function canManageConfessions(member) {
    const staffRoleId = communitySettings().confessionStaffRoleId;
    return hasModeratorAccess(member) || (configured(staffRoleId) && member.roles.cache.has(staffRoleId));
}

const workJobs = [
    { id: "courier", title: "Kurye", place: "Sehir ici teslimat", question: "Teslimat adresinde ilk yapman gereken nedir?", options: ["Kimlik/adres dogrulamak", "Paketi kapida birakmak", "Uzaklasmak", "Bahsis istemek"], answer: 0 },
    { id: "cargo", title: "Kargo Personeli", place: "Dagitim merkezi", question: "Hasarli gorunen pakette dogru islem nedir?", options: ["Teslim formuna not dusmek", "Gizlemek", "Hemen dagitmak", "Paketi acmak"], answer: 0 },
    { id: "cashier", title: "Kasa Personeli", place: "Market kasasi", question: "Odeme ekrani tutmazsa ne yaparsin?", options: ["Fis ve tutari tekrar kontrol ederim", "Rastgele tutar girerim", "Kasayi kapatirim", "Musteriyi bekletmeden gonderirim"], answer: 0 },
    { id: "gas_station", title: "Benzinci", place: "Akaryakit istasyonu", question: "Araca yakit vermeden once neyi teyit edersin?", options: ["Yakit turunu", "Plaka rengini", "Muzik tercihini", "Yolculuk planini"], answer: 0 },
    { id: "waiter", title: "Garson", place: "Restoran salonu", question: "Siparis alirken en guvenli adim nedir?", options: ["Siparisi tekrar ederek onaylamak", "Tahmin etmek", "Masayi degistirmek", "Hesabi hemen getirmek"], answer: 0 },
    { id: "greengrocer", title: "Manav", place: "Semt manavi", question: "Urun tartiminda neyi kontrol etmelisin?", options: ["Terazinin sifirda olmasini", "Musterinin telefonunu", "Kasadaki parayi", "Magaza tabelasini"], answer: 0 },
    { id: "barista", title: "Barista", place: "Kahve dukkanı", question: "Alerjen uyarisi veren musteri icin ne yaparsin?", options: ["Icerigi teyit ederim", "Rastgele icecek veririm", "Uyariyi yok sayarim", "Siparisi iptal etmeden beklerim"], answer: 0 },
    { id: "bookstore", title: "Kitapci", place: "Kitap magazasi", question: "Aranan kitap stokta yoksa nasil yardim edersin?", options: ["Stok ve siparis secenegini kontrol ederim", "Rafa baska kitap koyarim", "Musteriyi yonlendirmeden beklerim", "Fiyati degistiririm"], answer: 0 },
    { id: "tech_support", title: "Teknik Destek", place: "Teknoloji masasi", question: "Ariza kaydinda ilk bilgi hangisidir?", options: ["Sorunun ne zaman basladigi", "Musterinin sevdigi renk", "Hava durumu", "Son tatili"], answer: 0 },
    { id: "reception", title: "Otel Resepsiyonu", place: "Otel girisi", question: "Misafir girisinde neyi kontrol edersin?", options: ["Rezervasyon ve kimligi", "Oda dekorunu", "Restoran menusu", "Asansor muziklerini"], answer: 0 }
];

function formatDuration(milliseconds) {
    const minutes = Math.ceil(Math.max(0, milliseconds) / 60_000); const hours = Math.floor(minutes / 60);
    return hours ? `${hours} saat ${minutes % 60} dakika` : `${minutes} dakika`;
}

function createWorkSession(member) {
    const status = engagement.beginWork(member.id, member.user.tag);
    if (!status.ok) return status;
    const job = workJobs[Math.floor(Math.random() * workJobs.length)];
    const levels = config.engagement.workSystem.levels;
    const level = levels[Math.floor(Math.random() * levels.length)];
    const reward = Math.floor(Math.random() * (level.maximum - level.minimum + 1)) + level.minimum;
    return { ...status, job, level, reward };
}

function workComponents(memberId, job) {
    return [new ActionRowBuilder().addComponents(...job.options.map((option, index) => new ButtonBuilder()
        .setCustomId(`work:answer:${memberId}:${index}`).setLabel(option.slice(0, 80)).setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)))];
}

function workEmbed(member, session) {
    return new EmbedBuilder().setColor(0x5865F2).setTitle(`Vardiya Basladi | ${session.job.title}`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setDescription(`**${session.job.place}** icin vardiyaya geldin. Durumu dogru yoneterek kazancini al.`)
        .addFields(
            { name: "Gorev", value: session.job.question, inline: false },
            { name: "Kazanc seviyesi", value: `${session.level.label} • **${session.level.minimum}-${session.level.maximum} coin**`, inline: true },
            { name: "Sure", value: "60 saniye", inline: true }
        ).setFooter({ text: "Cevabini butonlardan ver. Is basarili veya basarisiz olduktan sonra 2 saat bekleme baslar." });
}

function workStatsEmbed(member) {
    const work = engagement.workStatus(member.id, member.user.tag).work;
    const rate = work.completed ? Math.round((work.successes || 0) / work.completed * 100) : 0;
    return new EmbedBuilder().setColor(0x2ECC71).setTitle(`${member.displayName} | Kariyer Kartı`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setDescription(`Son vardiya: **${work.lastJobId ? workJobs.find(job => job.id === work.lastJobId)?.title || work.lastJobId : "Henuz yok"}**`)
        .addFields(
            { name: "Toplam vardiya", value: String(work.completed || 0), inline: true },
            { name: "Basari orani", value: `%${rate}`, inline: true },
            { name: "Kazanilan coin", value: `${(work.earnings || 0).toLocaleString("tr-TR")}`, inline: true },
            { name: "Aktif seri", value: `${work.streak || 0} basari`, inline: true },
            { name: "En iyi seri", value: `${work.bestStreak || 0} basari`, inline: true }
        ).setFooter({ text: "Vardiya baslatmak icin !is yaz." });
}

function attachWorkCollector(panel, member, session) {
    let answered = false;
    const collector = panel.createMessageComponentCollector({ componentType: ComponentType.Button, time: config.engagement.workSystem.panelTimeoutMs });
    collector.on("collect", async interaction => {
        if (interaction.user.id !== member.id) return interaction.reply({ content: "Bu vardiya paneli sadece isi baslatan uye icindir.", ephemeral: true });
        const selected = Number(interaction.customId.split(":")[3]); const success = selected === session.job.answer;
        const result = engagement.completeWork(member.id, member.user.tag, { success, reward: session.reward, jobId: session.job.id, level: session.level.label });
        if (!result.ok) return interaction.reply({ content: "Bu vardiya zamani dolmus. Tekrar !is yazabilirsin.", ephemeral: true });
        answered = true;
        audit(interaction.guildId, success ? "work_completed" : "work_failed", member.id, member.id, { jobId: session.job.id, level: session.level.label, reward: result.reward });
        const resultEmbed = EmbedBuilder.from(workEmbed(member, session)).setColor(success ? 0x57F287 : 0xED4245)
            .setTitle(success ? `Vardiya Tamamlandi | +${result.reward} coin` : "Vardiya Basarisiz")
            .setDescription(success ? `Dogru karar verdin ve **${session.level.label}** seviyesinde kazanc elde ettin.` : "Bu kez musteri ve is akisi senden memnun kalmadi; kazanc elde edemedin.")
            .setFooter({ text: "Sonraki vardiya hakkin 2 saat sonra acilir." });
        await interaction.update({ embeds: [resultEmbed], components: [] }); collector.stop("answered");
    });
    collector.on("end", () => {
        if (!answered) engagement.cancelWork(member.id, member.user.tag);
        panel.edit({ components: [] }).catch(() => {});
    });
}

async function openWorkPanel(message) {
    const session = createWorkSession(message.member);
    if (!session.ok) return temporaryReply(message, `Su an vardiyaya cikamazsin. Kalan sure: **${formatDuration(session.remainingMs || session.work.pendingUntil - Date.now())}**.`);
    const panel = await message.channel.send({ embeds: [workEmbed(message.member, session)], components: workComponents(message.member.id, session.job) });
    attachWorkCollector(panel, message.member, session);
}

async function openWorkPanelFromInteraction(interaction) {
    const session = createWorkSession(interaction.member);
    if (!session.ok) return interaction.reply({ content: `Su an vardiyaya cikamazsin. Kalan sure: **${formatDuration(session.remainingMs || session.work.pendingUntil - Date.now())}**.`, ephemeral: true });
    const panel = await interaction.reply({ embeds: [workEmbed(interaction.member, session)], components: workComponents(interaction.member.id, session.job), fetchReply: true });
    attachWorkCollector(panel, interaction.member, session);
}

const helpCategories = [
    {
        label: "Baslangic", emoji: "🏠", description: "Panel, profil ve gunluk takip", color: 0x5865F2,
        commands: [["!merkez", "Topluluk merkezini ve hizli erisim dugmelerini acar."], ["!coin", "Coin, kart limiti ve borc ozetini gosterir."], ["!istatistik [@uye]", "Profil ve aktivite bilgilerini gosterir."], ["!yardim", "Bu kategori secmeli yardim panelini acar."]]
    },
    {
        label: "Ekonomi", emoji: "💳", description: "Coin, is, magaza ve kredi karti", color: 0xF1C40F,
        commands: [[".is", "Rastgele bir vardiya baslatir; dogru cevap kazanc getirir. 2 saat bekleme vardir."], [".kart", "Kart limiti, borc ve haftalik taksit planini gosterir."], [".karttanpara miktar", "Kullanilabilir kart limitinden Wesh Coin cuzdanina coin aktarir."], [".borctaksitlendir 1-8", "Kart borcunu 1-8 haftalik taksite boler."], [".kartode miktar", "Wesh Coin cuzdanindaki coinle kart borcunu oder."], [".magaza / .satinal kod", "Coin magazasini acar veya urun satin alir."]]
    },
    {
        label: "Topluluk", emoji: "✨", description: "Gorevler, sezon, evlilik ve odalar", color: 0xEB459E,
        commands: [["!gorevlerim", "Kisisel gunluk ve haftalik gorevlerini gosterir."], ["!oduller", "Odul, bonus saatleri ve magaza panelini acar."], ["!evlen @uye yuzuk_kodu", "Envanterindeki yuzukle evlilik teklifi yollar."], ["!evliligim", "Mevcut evlilik bilgini gosterir."], ["!itiraf", "Anonim itiraf panelini acar."], ["!envanter", "Coin magazasi envanterini gosterir."]]
    },
    {
        label: "Yetkili", emoji: "🛡️", description: "Moderasyon ve sunucu yonetimi", color: 0xE67E22,
        commands: [["!durum", "General 1 durumunu ve takip ozetini gosterir."], ["!uyar @uye neden", "Uyari kaydi acar."], ["!uyarilar [@uye]", "Uyari kayitlarini gosterir."], ["!timeout @uye sure neden", "Gecici zaman asimi uygular."], ["!untimeout @uye", "Zaman asimini kaldirir."], ["!sil 1-100", "Son mesajlari siler."]]
    },
    {
        label: "Kurucu", emoji: "👑", description: "Kurucuya ozel ekonomi yetkileri", color: 0x9B59B6,
        commands: [["!parayukle @uye miktar", "Belirlenen uyeye coin yukler. Sadece kurucu kullanabilir."], ["!coinver @uye miktar", "!parayukle ile ayni kurucu yetkisidir."], ["Kart limit davranisi", "Zamaninda kapanan gunluk taksitler limiti artirir; gecikenler limiti azaltir."]]
    }
];

function createHelpEmbed(index) {
    const category = helpCategories[index];
    const commandRows = category.commands.map(([command, description]) => `> **${command}**\n> ${description}`).join("\n\n");
    return new EmbedBuilder().setColor(category.color).setTitle(`${category.emoji} Wesh Yardim Merkezi`)
        .setDescription(`### ${category.label}\n${category.description}\n\n${commandRows}`)
        .addFields({ name: "Kullanim notu", value: category.label === "Ekonomi" ? "Bu komutlar sadece **General 2 / Wesh Coin** kanalinda ve `.` prefixiyle kullanilir." : "Komutlar `#commands` kanalinda kullanilir. Yetkili komutlari ek olarak `#yetkili-chat` kanalinda calisir.", inline: false })
        .setFooter({ text: `Kategori ${index + 1}/${helpCategories.length} • Sayfayi dugmelerden veya listeden degistir.` });
}

function helpComponents(index) {
    const select = new StringSelectMenuBuilder().setCustomId("help:category").setPlaceholder("Komut kategorisi sec").addOptions(helpCategories.map((category, categoryIndex) => ({ label: category.label, description: category.description.slice(0, 100), value: String(categoryIndex), emoji: category.emoji, default: categoryIndex === index })));
    return [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("help:previous").setLabel("Onceki").setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
        new ButtonBuilder().setCustomId("help:report").setLabel("Komut Raporla").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("help:close").setLabel("Paneli Kapat").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("help:next").setLabel("Sonraki").setStyle(ButtonStyle.Primary).setDisabled(index === helpCategories.length - 1)
    )];
}

async function sendHelpPanel(message) {
    let page = 0;
    const panel = await message.channel.send({ embeds: [createHelpEmbed(page)], components: helpComponents(page) });
    const collector = panel.createMessageComponentCollector({ time: 120_000 });
    collector.on("collect", async interaction => {
        if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Bu yardim panelini sadece acan uye yonetebilir. Kendi panelin icin !yardim yaz.", ephemeral: true });
        if (interaction.customId === "help:close") { await interaction.update({ components: [] }); return collector.stop("closed"); }
        if (interaction.customId === "help:report") return interaction.reply({ content: "Eksik veya hatali komut gordugunde yetkiliye komut adini ve aldigin hatayi iletmen yeterli.", ephemeral: true });
        if (interaction.customId === "help:category") page = Number(interaction.values[0]);
        if (interaction.customId === "help:previous") page = Math.max(0, page - 1);
        if (interaction.customId === "help:next") page = Math.min(helpCategories.length - 1, page + 1);
        await interaction.update({ embeds: [createHelpEmbed(page)], components: helpComponents(page) });
    });
    collector.on("end", (_, reason) => { if (reason !== "closed") panel.edit({ components: [] }).catch(() => {}); });
}

function createCoinCard(member) {
    const summary = engagement.personalSummary(member.id, member.user.tag);
    const card = engagement.creditCardSummary(member.id, member.user.tag);
    const daily = summary.daily;
    const complete = daily.tasks.every(task => task.value >= task.goal);
    return new EmbedBuilder().setColor(0x2B2D31).setTitle(`${member.displayName} | Wesh Coin Card`)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setDescription(`**Bakiye**\n# ${summary.entry.coins.toLocaleString("tr-TR")} coin`)
        .addFields(
            { name: "Gunluk odul", value: daily.bucket.claimed ? "Alindi" : complete ? "Hazir" : "Gorevler devam ediyor", inline: true },
            { name: "Rozet / esya", value: `${summary.entry.badges.length} / ${summary.entry.inventory.length}`, inline: true },
            { name: "Kredi karti", value: `Limit: **${card.card.limit.toLocaleString("tr-TR")}**\nKullanilabilir: **${card.availableLimit.toLocaleString("tr-TR")}**\nBorc: **${card.card.debt.toLocaleString("tr-TR")} coin**`, inline: true },
            { name: "Bugunku ilerleme", value: daily.tasks.map(task => `${task.value >= task.goal ? "✅" : "▫️"} ${task.value}/${task.goal} ${task.label}`).join("\n"), inline: false }
        ).setFooter({ text: "Coin sadece sistem odulleriyle kazanilir; tum satin alimlar kayit altindadir." });
}

function communityHomeEmbed(member) {
    const summary = engagement.personalSummary(member.id, member.user.tag);
    return new EmbedBuilder().setColor(0x5865F2).setTitle("Wesh Topluluk Merkezi")
        .setDescription("Ekonomi, istatistik, oda ve guvenli topluluk araclari tek modern panelde.")
        .addFields(
            { name: "Cuzdan", value: `**${summary.entry.coins.toLocaleString("tr-TR")} coin**`, inline: true },
            { name: "Aktif rozet", value: `**${summary.entry.badges.length}**`, inline: true },
            { name: "Nasil kullanilir?", value: "Butonlardan bolum secin. Kisisel islemler sadece butona basan uye icin calisir.", inline: false }
        ).setFooter({ text: "Wesh General 1 • Islemler gecici panelde guvenle yapilir." });
}

function communityHomeComponents() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("community:rewards").setLabel("Gorevler").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("community:stats").setLabel("Istatistik").setStyle(ButtonStyle.Secondary)
    ), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("community:confess").setLabel("Anonim itiraf").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("community:rooms").setLabel("Ozel oda").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("community:daily").setLabel("Gunluk seri").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("community:season").setLabel("Sezon karti").setStyle(ButtonStyle.Primary)
    )];
}

function confessionButtons(id, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confession:approve:${id}`).setLabel("Yayinla").setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`confession:reject:${id}`).setLabel("Reddet").setStyle(ButtonStyle.Danger).setDisabled(disabled)
    )];
}

function confessionPanelEmbed(guild) {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: "Wesh Management", iconURL: guild.iconURL({ size: 128 }) || undefined })
        .setTitle("Itiraf Sistemi")
        .setDescription([
            "━━━━━━━━━━━━━━━━━━━━",
            "ℹ️ **Sen de bir itiraf paylasmak ister misin?**",
            "",
            "🔒 **Gizlilik notu:** Itirafin once sadece sunucu kurucusu tarafindan incelenir. Onaylanirsa adin, avatarin ve kimligin gorunmeden yayinlanir.",
            "━━━━━━━━━━━━━━━━━━━━",
            "**Inceleme akisi**",
            "```Yeni itiraf  →  Kurucu incelemesi  →  Anonim yayin```",
            "🛡️ Kisisel bilgi, tehdit, nefret soylemi veya hedef gosteren icerikler yayinlanmaz."
        ].join("\n"))
        .setFooter({ text: "Wesh Itiraf Sistemi • Guvenli ve tamamen anonim" })
        .setTimestamp();
}

function modernConfessionPanelEmbed(guild) {
    return new EmbedBuilder().setColor(0xE84393).setAuthor({ name: "Wesh Management", iconURL: guild.iconURL({ size: 128 }) || undefined })
        .setTitle("💌 Wesh Itiraf Merkezi")
        .setDescription("### Duygularini ozgurce paylas\nItirafin once yonetim tarafindan incelenir; onaylanirsa adin, avatarin ve kimligin gorunmeden yayinlanir.\n\n**Nasil calisir?**\n`Itiraf yaz` → `Yonetim incelemesi` → `Tamamen anonim yayin`\n\n**Guvenli paylasim kurallari**\n• Kisisel bilgi, tehdit, nefret soylemi ve hedef gosteren icerik yasaktir.\n• Spam ve tekrarlayan itiraflar yayinlanmaz.\n• Yayinlanan itiraflara destek dugmeleriyle tepki verebilirsin.")
        .setImage("https://media.tenor.com/hed8BskJNeAAAAAe/yuki-itose-rin-fujishiro.gif")
        .setFooter({ text: "Wesh Itiraf Merkezi • Guvenli, anonim ve yonetim onayli" }).setTimestamp();
}

function confessionPanelComponents() {
    return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("community:confess").setLabel("Itiraf Paylas").setEmoji("😈").setStyle(ButtonStyle.Primary))];
}

function confessionReactionComponents(id, reactions = {}) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confession:react:${id}:support`).setLabel(`Destek ${reactions.support || 0}`).setEmoji("🤍").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`confession:react:${id}:heart`).setLabel(`Kalp ${reactions.heart || 0}`).setEmoji("💗").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`confession:react:${id}:think`).setLabel(`Dusundum ${reactions.think || 0}`).setEmoji("💭").setStyle(ButtonStyle.Primary)
    )];
}

async function showCommunityPanel(message) {
    const reply = await temporaryReply(message, { embeds: [communityHomeEmbed(message.member)], components: communityHomeComponents() });
    setTimeout(() => reply.edit({ components: [] }).catch(() => {}), 60_000);
}

async function openConfessionModal(interaction) {
    const settings = communitySettings();
    if (!configured(settings.confessionReviewChannelId) || !configured(settings.confessionPublishChannelId)) return interaction.reply({ content: "Itiraf sistemi henuz kanal kimlikleri girilmedigi icin kapali.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("confession:submit").setTitle("Anonim itiraf");
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("content").setLabel("Itirafin").setStyle(TextInputStyle.Paragraph).setMinLength(3).setMaxLength(1000).setPlaceholder("Kisisel bilgi, tehdit veya nefret soylemi yazma.").setRequired(true)));
    return interaction.showModal(modal);
}

async function createPrivateRoom(member) {
    const room = communitySettings().privateRoom || {};
    if (!room.enabled || !configured(room.createChannelId) || !configured(room.categoryId)) return null;
    const existingId = communityPanels.rooms[member.id]?.channelId;
    const existing = existingId ? member.guild.channels.cache.get(existingId) : null;
    if (existing) return existing;
    const channel = await member.guild.channels.create({ name: `${room.namePrefix || "Oda"}-${member.displayName}`.slice(0, 90), type: ChannelType.GuildVoice, parent: room.categoryId, userLimit: Math.max(0, Math.min(99, Number(room.defaultUserLimit) || 5)), permissionOverwrites: [
        { id: member.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
        { id: member.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.ManageChannels] }
    ], reason: `Ozel oda: ${member.user.tag}` });
    communityPanels.rooms[member.id] = { ownerId: member.id, channelId: channel.id, guildId: member.guild.id, createdAt: Date.now(), members: [], managers: [], locked: false };
    saveCommunityPanels();
    return channel;
}

function managedRoom(userId, guildId) {
    for (const [ownerId, record] of Object.entries(communityPanels.rooms)) {
        if (record.guildId !== guildId) continue;
        if (ownerId === userId || record.ownerId === userId || (record.managers || []).includes(userId)) return { ownerId, record, isOwner: ownerId === userId || record.ownerId === userId };
    }
    return null;
}
function roomControlComponents(locked = false, isOwner = true) {
    const primary = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("room:rename").setLabel("İsim Değiştir").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("room:add").setLabel("Üye Ekle").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("room:remove").setLabel("Üye Çıkar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`room:${locked ? "unlock" : "lock"}`).setLabel(locked ? "Kilidi Aç" : "Kilitle").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("room:info").setLabel("Loca Bilgisi").setStyle(ButtonStyle.Secondary)
    );
    const management = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("room:manager-add").setLabel("Yönetici Ekle").setStyle(ButtonStyle.Success).setDisabled(!isOwner),
        new ButtonBuilder().setCustomId("room:manager-remove").setLabel("Yönetici Çıkar").setStyle(ButtonStyle.Danger).setDisabled(!isOwner)
    );
    return [primary, management];
}

function roomPanelEmbed(channel, locked = false, record = null) {
    const managers = (record?.managers || []).length;
    return new EmbedBuilder().setColor(0x5865F2).setTitle("🏠 Özel Loca Yönetim Paneli")
        .setDescription("Özel locanızı bu panel üzerinden yönetebilirsiniz.")
        .addFields(
            { name: "Neler Yapabilirsiniz?", value: "• **İsim Değiştir** – Loca adını günceller.\n• **Üye Ekle / Çıkar** – Davetli erişimini yönetir.\n• **Kilitle / Aç** – Loca erişimini kontrol eder.\n• **Yönetici Ekle / Çıkar** – Loca yöneticilerini belirler.", inline: false },
            { name: "Loca Durumu", value: `**${locked ? "Kilitli" : "Açık"}** • Üye limiti: **${channel.userLimit || "Sınırsız"}** • Yönetici: **${managers}**`, inline: false }
        )
        .setThumbnail("https://media.tenor.com/hed8BskJNeAAAAAe/yuki-itose-rin-fujishiro.gif")
        .setFooter({ text: "Wesh Özel Loca • Sahip ve atanan yöneticiler işlem yapabilir." }).setTimestamp();
}

function privateRoomInfoEmbed() {
    return new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: "Wesh Voice Lounge", iconURL: "https://cdn.discordapp.com/embed/avatars/0.png" }).setTitle("Ozel Oda Yonetim Paneli")
        .setDescription("Asagidaki butonlari kullanarak ozel ses odanizi olusturabilir ve yonetebilirsiniz.")
        .addFields(
            { name: "Oda Olustur", value: "**Tikla Olustur** ses kanalina gir. Bot sana otomatik, gizli bir oda acar.", inline: false },
            { name: "Oda Ayarlari", value: "Oda yonetiminden **uye ekle/cikar**, **isim degistir** ve odani **kilitle/ac**.", inline: false },
            { name: "Kurallar", value: "Oda sahibi sorumludur. Oda bosalinca otomatik silinir.", inline: false }
        ).setThumbnail("https://media.tenor.com/hed8BskJNeAAAAAe/yuki-itose-rin-fujishiro.gif")
        .setFooter({ text: "Wesh Special Room System • Bot ve yetkililer gerekli durumlarda erisebilir." }).setTimestamp();
}

function privateRoomInfoComponents() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("private-room-info:open").setLabel("Oda yonetimimi ac").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("private-room-info:rules").setLabel("Kurallari goruntule").setStyle(ButtonStyle.Secondary)
    )];
}

function privateRoomInfoEmbed() {
    return new EmbedBuilder().setColor(0x2B2D31).setTitle("Özel Loca Yönetim Paneli")
        .setDescription("### Özel locanızı bu panel üzerinden yönetebilirsiniz.")
        .addFields({ name: "Neler Yapabilirsiniz?", value: "• **İsim Değiştirme** – Loca adını günceller.\n• **Üye Ekle / Çıkar** – Davetli üyeleri yönetir.\n• **Kilitleme / Açma** – Loca erişimini kontrol eder.\n• **Yönetici Ekle / Çıkar** – Loca yöneticilerini belirler.\n• **Bilgiler** – Loca ayrıntılarını gösterir.", inline: false })
        .setFooter({ text: "Not: Bu paneli kullanabilmek için aktif bir locan olmalı. Loca açmak için Tıkla Oluştur ses kanalına gir." }).setTimestamp();
}
function privateRoomInfoComponents() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("private-room-info:open").setLabel("Loca Yönetimimi Aç").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("private-room-info:rules").setLabel("Kuralları Görüntüle").setStyle(ButtonStyle.Secondary)
    )];
}
async function validatePrivateRoomConfiguration(guild) {
    const room = communitySettings().privateRoom || {};
    if (!room.enabled) return true;
    const createChannel = await guild.channels.fetch(room.createChannelId).catch(() => null);
    const category = await guild.channels.fetch(room.categoryId).catch(() => null);
    if (!createChannel?.isVoiceBased() || category?.type !== ChannelType.GuildCategory) {
        logger(`Private room configuration invalid: create=${room.createChannelId}, category=${room.categoryId}`);
        return false;
    }
    const me = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
    const permissions = me?.permissions;
    const required = [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.ViewChannel];
    const missing = required.filter(permission => !permissions?.has(permission));
    if (missing.length) logger(`Private room permissions missing: ${missing.join(", ")}`);
    else logger(`Private room ready: trigger=${createChannel.id}, category=${category.id}`);
    return !missing.length;
}

async function ensurePrivateRoomInfoPanel(guild) {
    const channelId = communitySettings().privateRoom?.infoPanelChannelId;
    if (!configured(channelId)) return logger("Private room panel channel ID is not configured.");
    const channel = await guild.channels.fetch(channelId).catch(error => {
        logger(`Private room panel channel fetch failed (${channelId}): ${error.message}`);
        return null;
    });
    if (!channel?.isTextBased()) return logger(`Private room panel channel is unavailable or not text-based: ${channelId}`);
    const recent = await channel.messages.fetch({ limit: 100 }).catch(error => {
        logger(`Private room panel message fetch failed: ${error.message}`);
        return null;
    });
    const existing = recent?.find(item => item.author.id === client.user.id && item.components.some(row => row.components.some(component => component.customId === "private-room-info:open")));
    const payload = { embeds: [privateRoomInfoEmbed()], components: privateRoomInfoComponents() };
    if (existing) await existing.edit(payload).then(() => logger(`Private room panel updated: ${channel.id}`)).catch(error => logger(`Private room panel update failed: ${error.message}`));
    else await channel.send(payload).then(() => logger(`Private room panel posted: ${channel.id}`)).catch(error => logger(`Private room panel post failed: ${error.message}`));
}

function parseDuration(input) {
    const match = /^(\d+)(m|h|d)$/i.exec(input || "");
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : DAY_MS;
    const result = amount * multiplier;
    return result > 0 && result <= 28 * DAY_MS ? result : null;
}

function commandOnCooldown(message, name) {
    const key = `${message.author.id}:${name}`;
    const now = Date.now();
    const cooldown = (config.rankSystem.commandCooldownSeconds || 3) * 1000;
    if (commandCooldowns.get(key) > now) return true;
    commandCooldowns.set(key, now + cooldown);
    return false;
}

function healthSummary() {
    const activeSessions = Object.keys(data.activeVoice).length;
    const lastEvent = readJsonl(pointEventsFile).at(-1);
    return { activeSessions, userCount: Object.keys(data.users).length, lastEventAt: lastEvent?.at || null };
}

function getRank(member) {
    return [...config.rankSystem.ranks].reverse().find(rank => member.roles.cache.has(rank.roleId)) || config.rankSystem.ranks[0];
}

function rankEligibility(member, rank) {
    const user = getUser(member.user);
    const now = Date.now();
    const joinedAt = member.joinedTimestamp || now;
    const serverDays = (now - joinedAt) / DAY_MS;
    const rankDays = user.rank.rankGrantedAt ? (now - user.rank.rankGrantedAt) / DAY_MS : serverDays;
    const thirtyDays = getPointsFor(member.id, member.guild.id, now - 30 * DAY_MS);
    return {
        eligible: serverDays >= rank.minimumServerDays && rankDays >= rank.minimumRankDays && user.rank.totalPoints >= rank.minimumTotalPoints && thirtyDays >= rank.minimumThirtyDayPoints,
        serverDays, rankDays, thirtyDays, totalPoints: user.rank.totalPoints
    };
}

async function sendLog(guild, content, category = "general") {
    const text = String(content).toLocaleLowerCase("tr-TR");
    if (category === "general" && /(uyari|timeout|ban |geri alma|case_reverted)/.test(text)) category = "penalty";
    if (category === "general" && /(terfi|ödülü|odulu|rank)/.test(text)) category = "rank";
    const channelId = config.engagement.logChannels?.[category] || config.rankSystem.logChannelId;
    const channel = guild.channels.cache.get(channelId);
    if (channel?.isTextBased()) await channel.send(content).catch(() => {});
}

function inviteSummary(guildId, inviterId) {
    const states = new Map();
    for (const record of readJsonl(invitesFile)) {
        if (record.guildId !== guildId || record.inviterId !== inviterId || !record.joinedMemberId) continue;
        states.set(record.joinedMemberId, record.leftAt ? "left" : "active");
    }
    const values = [...states.values()];
    return { total: values.length, active: values.filter(value => value === "active").length, left: values.filter(value => value === "left").length };
}

function inviteLogEmbed(member, inviter, summary, event, inviteCode) {
    return new EmbedBuilder().setColor(event === "join" ? 0x57F287 : 0xED4245)
        .setTitle(event === "join" ? "Davet kaydı | Yeni katılım" : "Davet kaydı | Üye ayrıldı")
        .addFields(
            { name: "Davet eden", value: `${inviter.user.tag} (${inviter.id})`, inline: false },
            { name: event === "join" ? "Katılan üye" : "Ayrılan üye", value: `${member.user.tag} (${member.id})`, inline: false },
            { name: "Davet kodu", value: inviteCode || "Bilinmiyor", inline: true },
            { name: "Toplam davet", value: String(summary.total), inline: true },
            { name: "Sunucuda kalan", value: String(summary.active), inline: true },
            { name: "Sunucudan ayrılan", value: String(summary.left), inline: true }
        ).setTimestamp();
}

function guardLogEmbed(title, message, target, reason, extra = []) {
    return new EmbedBuilder().setColor(0xED4245).setTitle(title).addFields(
        { name: "Yetkili", value: `${message.author.tag} (${message.author.id})`, inline: false },
        { name: "Üye", value: target ? `${target.user?.tag || target} (${target.id || target})` : "Belirtilmedi", inline: false },
        { name: "Kanal", value: `${message.channel} (${message.channel.id})`, inline: false },
        { name: "Sebep", value: reason || "Belirtilmedi", inline: false },
        ...extra
    ).setTimestamp();
}

function requestButtons(requestId, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`store-request:approve:${requestId}`).setLabel("Onayla ve teslim et").setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`store-request:reject:${requestId}`).setLabel("Reddet ve coin iade et").setStyle(ButtonStyle.Danger).setDisabled(disabled)
    )];
}

function appealButtons(appealId, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`security-appeal:accept:${appealId}`).setLabel("İtirazı kabul et").setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`security-appeal:reject:${appealId}`).setLabel("İtirazı reddet").setStyle(ButtonStyle.Danger).setDisabled(disabled)
    )];
}

async function sendSecurityAppeal(message, caseEntry, reason) {
    const channel = message.guild.channels.cache.get(config.engagement.requestChannelId);
    if (!channel?.isTextBased()) return null;
    const id = `I-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const appeal = { id, guildId: message.guild.id, caseId: caseEntry.id, memberId: message.author.id, reason, status: "pending", createdAt: Date.now() };
    securityAppeals[id] = appeal; saveSecurityAppeals();
    const panel = await channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`Güvenlik itirazı ${id}`).addFields(
        { name: "Üye", value: `${message.author.tag} (${message.author.id})`, inline: false },
        { name: "İtiraz edilen vaka", value: `${caseEntry.id} • ${caseEntry.type}`, inline: true },
        { name: "İlk sebep", value: caseEntry.reason || "Belirtilmedi", inline: false },
        { name: "Üye itirazı", value: reason, inline: false }
    ).setTimestamp()], components: appealButtons(id) });
    appeal.panelMessageId = panel.id; appeal.panelChannelId = channel.id; saveSecurityAppeals();
    return appeal;
}

async function sendStoreRequest(message, item, details) {
    const requestId = `S-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const charged = engagement.completePurchase(message.author.id, message.author.tag, item.id);
    if (!charged.ok) return null;
    const request = { id: requestId, guildId: message.guild.id, memberId: message.author.id, memberTag: message.author.tag, itemId: item.id, itemName: item.name, cost: item.cost, details, status: "pending", createdAt: Date.now() };
    storeRequests[requestId] = request; saveStoreRequests();
    audit(message.guild.id, "store_request_opened", message.author.id, message.author.id, { requestId, itemId: item.id, cost: item.cost, details });
    const channel = message.guild.channels.cache.get(config.engagement.requestChannelId);
    if (!channel?.isTextBased()) {
        engagement.refundPurchase(message.author.id, message.author.tag, item.id);
        delete storeRequests[requestId]; saveStoreRequests();
        return null;
    }
    const fields = [{ name: "Uye", value: `${message.author.tag} (${message.author.id})`, inline: true }, { name: "Bedel", value: `${item.cost} coin (emanette)`, inline: true }, { name: "Talep", value: item.type === "emoji" ? `Emoji: **${details.name}**\nGorsel: ${details.url}` : `Rol: **${details.name}**` }];
    const panel = await channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`Magaza talebi ${requestId}`).setDescription(`${item.name} onay bekliyor.`).addFields(fields).setTimestamp()], components: requestButtons(requestId) });
    request.panelMessageId = panel.id; request.panelChannelId = channel.id; saveStoreRequests();
    return request;
}

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("store-request:")) return;
    if (!hasModeratorAccess(interaction.member) && !(config.engagement.requestStaffRoleId && interaction.member?.roles.cache.has(config.engagement.requestStaffRoleId))) return interaction.reply({ content: "Bu buton sadece üst yönetim içindir.", ephemeral: true });
    const [, decision, requestId] = interaction.customId.split(":"); const request = storeRequests[requestId];
    if (!request || request.guildId !== interaction.guildId || request.status !== "pending") return interaction.reply({ content: "Bu talep zaten sonuçlanmış veya bulunamadı.", ephemeral: true });
    const member = await interaction.guild.members.fetch(request.memberId).catch(() => null);
    if (decision === "reject") {
        engagement.refundPurchase(request.memberId, request.memberTag, request.itemId);
        request.status = "rejected"; request.reviewedAt = Date.now(); request.reviewerId = interaction.user.id; saveStoreRequests();
        audit(interaction.guildId, "store_request_rejected_refunded", interaction.user.id, request.memberId, { requestId, cost: request.cost });
        await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setFooter({ text: `Reddedildi • ${interaction.user.tag} • ${request.cost} coin iade edildi` })], components: requestButtons(requestId, true) });
        return sendLog(interaction.guild, `Mağaza talebi reddedildi ve iade edildi: ${requestId} | Üye: <@${request.memberId}> | Yetkili: ${interaction.user}`);
    }
    if (!member) return interaction.reply({ content: "Üye sunucuda bulunamadı; talep açık bırakıldı.", ephemeral: true });
    try {
        let delivered;
        if (request.itemId === "custom_emoji") delivered = await interaction.guild.emojis.create({ attachment: request.details.url, name: request.details.name, reason: `Onaylı mağaza talebi ${requestId}` });
        else if (request.itemId === "custom_role") { delivered = await interaction.guild.roles.create({ name: request.details.name, permissions: [], reason: `Onaylı mağaza talebi ${requestId}` }); await member.roles.add(delivered, `Onaylı mağaza talebi ${requestId}`); }
        else throw new Error("Desteklenmeyen mağaza ürünü");
        request.status = "approved"; request.reviewedAt = Date.now(); request.reviewerId = interaction.user.id; request.deliveredId = delivered.id; saveStoreRequests();
        audit(interaction.guildId, "store_request_approved", interaction.user.id, request.memberId, { requestId, itemId: request.itemId, deliveredId: delivered.id, cost: request.cost });
        await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setFooter({ text: `Onaylandı ve teslim edildi • ${interaction.user.tag}` })], components: requestButtons(requestId, true) });
        return sendLog(interaction.guild, `Mağaza talebi teslim edildi: ${requestId} | Üye: <@${request.memberId}> | Yetkili: ${interaction.user}`);
    } catch (error) { logger(`Store request delivery failed: ${error.message}`); return interaction.reply({ content: "Teslim edilemedi; talep açık kaldı ve coin iade edilmedi. Bot izinlerini/limitini kontrol edip tekrar deneyin.", ephemeral: true }); }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("security-appeal:")) return;
    if (!hasModeratorAccess(interaction.member) && !(config.engagement.requestStaffRoleId && interaction.member?.roles.cache.has(config.engagement.requestStaffRoleId))) return interaction.reply({ content: "Bu karar sadece üst yönetim içindir.", ephemeral: true });
    const [, decision, appealId] = interaction.customId.split(":"); const appeal = securityAppeals[appealId];
    if (!appeal || appeal.guildId !== interaction.guildId || appeal.status !== "pending") return interaction.reply({ content: "Bu itiraz zaten sonuçlanmış veya bulunamadı.", ephemeral: true });
    const cases = loadSecurityCases(); const caseEntry = cases.cases?.[appeal.caseId];
    if (!caseEntry) return interaction.reply({ content: "İtiraz edilen vaka kaydı bulunamadı.", ephemeral: true });
    appeal.status = decision === "accept" ? "accepted" : "rejected"; appeal.reviewedAt = Date.now(); appeal.reviewerId = interaction.user.id;
    caseEntry.appealStatus = appeal.status; caseEntry.appealId = appeal.id;
    if (decision === "accept") { caseEntry.status = "revoked"; caseEntry.revokedAt = Date.now(); caseEntry.revokedBy = interaction.user.id; }
    saveSecurityCases(cases); saveSecurityAppeals();
    const member = await interaction.guild.members.fetch(appeal.memberId).catch(() => null);
    if (decision === "accept" && member && caseEntry.type === "warning") await member.timeout(null, `Güvenlik itirazı kabul edildi: ${appeal.id}`).catch(() => {});
    const footer = decision === "accept" ? `İtiraz kabul edildi • ${interaction.user.tag}` : `İtiraz reddedildi • ${interaction.user.tag}`;
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(decision === "accept" ? 0x57F287 : 0xED4245).setFooter({ text: footer })], components: appealButtons(appealId, true) });
    await sendLog(interaction.guild, `Güvenlik itirazı ${appeal.status}: ${appeal.id} | Vaka: ${appeal.caseId} | Üye: <@${appeal.memberId}> | Yetkili: ${interaction.user}`, "guard");
});

async function evaluatePromotion(member, reason = "activity") {
    if (!config.rankSystem.enabled || member.user.bot) return;
    const user = getUser(member.user);
    const ranks = config.rankSystem.ranks;
    const currentIndex = Math.max(0, ranks.findIndex(rank => member.roles.cache.has(rank.roleId)));
    let targetIndex = currentIndex;
    for (let index = currentIndex + 1; index < ranks.length; index += 1) {
        if (rankEligibility(member, ranks[index]).eligible) targetIndex = index;
    }
    if (targetIndex === currentIndex) return;
    const target = ranks[targetIndex];
    const old = ranks[currentIndex];
    try {
        await member.roles.add(target.roleId, "Automatic rank promotion");
        const removable = ranks.slice(0, targetIndex).map(rank => rank.roleId).filter(id => member.roles.cache.has(id));
        if (removable.length) await member.roles.remove(removable, "Replaced by higher automatic rank");
        user.rank.currentRoleId = target.roleId;
        user.rank.rankGrantedAt = Date.now();
        saveData();
        await sendLog(member.guild, `📈 ${member} **${old.name}** rütbesinden **${target.name}** rütbesine terfi etti. (${reason})`);
    } catch (error) {
        logger(`Rank promotion failed for ${member.user.tag}: ${error.message}`);
    }
}

async function snapshotInvites(guild) {
    try {
        const invites = await guild.invites.fetch();
        inviteSnapshots.set(guild.id, new Map(invites.map(invite => [invite.code, { uses: invite.uses || 0, inviterId: invite.inviter?.id, inviterTag: invite.inviter?.tag }])));
    } catch (error) {
        logger(`Invite snapshot unavailable: ${error.message}`);
    }
}

async function assignReward(guild, period, roleId, since) {
    if (!roleId) return;
    const events = getPointEventsSince(guild.id, since).filter(event => event.points > 0);
    const totals = new Map();
    for (const event of events) totals.set(event.userId, (totals.get(event.userId) || 0) + event.points);
    const winnerId = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!winnerId) return;
    const role = guild.roles.cache.get(roleId);
    const winner = await guild.members.fetch(winnerId).catch(() => null);
    if (!role || !winner) return;
    await Promise.all(role.members.filter(member => member.id !== winnerId).map(member => member.roles.remove(role).catch(() => {})));
    await winner.roles.add(role, `${period} reward`);
    await sendLog(guild, `🏆 ${period} ödülü ${winner} üyesine verildi.`);
}

function dailyBackup() {
    const date = new Date().toISOString().slice(0, 10);
    if (data.meta.lastBackupDate === date) return;
    fs.mkdirSync(backupsDirectory, { recursive: true });
    for (const file of [statisticsFile, pointEventsFile, invitesFile, registrationsFile, moderationFile, auditFile, path.join(dataDirectory, "engagement.json")]) {
        if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupsDirectory, `${path.basename(file, path.extname(file))}-${date}${path.extname(file)}`));
    }
    data.meta.lastBackupDate = date;
    saveData();
}

function resolveDurationRole(guild, definition) {
    if (definition.roleId) return guild.roles.cache.get(definition.roleId) || null;
    if (!definition.roleName) return null;
    return guild.roles.cache.find(role => role.name.localeCompare(definition.roleName, "tr", { sensitivity: "accent" }) === 0) || null;
}

async function syncMembershipDurationRoles(member) {
    if (member.user.bot || !member.joinedTimestamp) return;
    const definitions = (config.engagement.membershipDurationRoles || []).slice().sort((a, b) => a.days - b.days);
    if (!definitions.length) return;
    const resolved = definitions.map(definition => ({ definition, role: resolveDurationRole(member.guild, definition) })).filter(item => item.role);
    if (!resolved.length) return;
    const serverDays = (Date.now() - member.joinedTimestamp) / DAY_MS;
    const target = resolved.filter(item => serverDays >= item.definition.days).at(-1);
    const managedRoleIds = resolved.map(item => item.role.id);
    const outdatedRoleIds = managedRoleIds.filter(roleId => roleId !== target?.role.id && member.roles.cache.has(roleId));
    try {
        if (target && !member.roles.cache.has(target.role.id)) await member.roles.add(target.role, "Automatic membership duration role");
        if (outdatedRoleIds.length) await member.roles.remove(outdatedRoleIds, "Replaced by higher membership duration role");
    } catch (error) {
        logger(`Membership duration role update failed for ${member.user.tag}: ${error.message}`);
    }
}

async function scheduledMaintenance() {
    dailyBackup();
    engagement.reviewCreditCardDueDates();
    const dueReminders = engagement.takeCreditCardDueReminders();
    for (const reminder of dueReminders) {
        const member = await client.users.fetch(reminder.memberId).catch(() => null);
        await member?.send(`Kredi karti taksidinin son odeme gunu. **${reminder.number}. taksit:** **${reminder.amount.toLocaleString("tr-TR")} coin**. Odeme icin sunucuda \`!kartode miktar\` kullanabilirsin.`).catch(() => {});
        audit(config.guildId, "credit_card_due_reminder", client.user?.id || "system", reminder.memberId, reminder);
    }
    addRegistrationPoints();
    syncRegistrationBirthdays();
    const now = new Date();
    for (const guild of client.guilds.cache.values()) {
        const members = await guild.members.fetch().catch(() => null);
        if (!members) continue;
        for (const member of members.values()) {
            await evaluatePromotion(member, "scheduled check");
            await syncMembershipDurationRoles(member);
        }
        const staffRoleId = config.rankSystem.staffRoleId;
        const inactiveDays = config.rankSystem.inactiveStaffDays || 7;
        const inactive = staffRoleId ? members.filter(member => !member.user.bot && member.roles.cache.has(staffRoleId) && (!data.users[member.id]?.rank?.lastActivityAt || Date.now() - data.users[member.id].rank.lastActivityAt > inactiveDays * DAY_MS)) : [];
        const inactiveKey = `inactiveAlert:${now.toISOString().slice(0, 10)}`;
        if (inactive.size && data.meta[inactiveKey] !== guild.id) {
            await sendLog(guild, `⚠️ ${inactive.size} yetkili ${inactiveDays}+ gündür puan getiren bir etkinlik yapmadı: ${inactive.map(member => member.toString()).join(", ")}`);
            data.meta[inactiveKey] = guild.id;
            saveData();
        }
        const rewards = config.rankSystem.rewardRoles || {};
        const weeklyKey = `weeklyReward:${now.toISOString().slice(0, 10)}:${guild.id}`;
        const monthlyKey = `monthlyReward:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}:${guild.id}`;
        if (now.getDay() === (rewards.weeklyDay ?? 1) && !data.meta[weeklyKey]) { await assignReward(guild, "Haftalık", rewards.weeklyRoleId, Date.now() - 7 * DAY_MS); data.meta[weeklyKey] = true; saveData(); }
        if (now.getDate() === (rewards.monthlyDay ?? 1) && !data.meta[monthlyKey]) { await assignReward(guild, "Aylık", rewards.monthlyRoleId, Date.now() - 30 * DAY_MS); data.meta[monthlyKey] = true; saveData(); }
        const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone: config.engagement.timezone, day: "2-digit", month: "2-digit" }).formatToParts(now);
        const today = `${dateParts.find(part => part.type === "day")?.value}-${dateParts.find(part => part.type === "month")?.value}`;
        await syncBirthdayRole(guild, today);
        const birthdayKey = `birthday:${today}:${guild.id}`;
        if (!data.meta[birthdayKey]) {
            const birthdays = Object.values(engagement.state.users).filter(entry => entry.birthday === today).map(entry => `<@${entry.id}>`);
            if (birthdays.length) await sendLog(guild, `🎂 Bugunun dogum gunu: ${birthdays.join(", ")}! Iyi ki dogdunuz.`);
            data.meta[birthdayKey] = true; saveData();
        }
        const anniversaryKey = `anniversary:${today}:${guild.id}`;
        if (!data.meta[anniversaryKey]) {
            const anniversaries = members.filter(member => !member.user.bot && member.joinedAt && `${String(member.joinedAt.getDate()).padStart(2, "0")}-${String(member.joinedAt.getMonth() + 1).padStart(2, "0")}` === today).map(member => member.toString());
            if (anniversaries.length) await sendLog(guild, `🎉 Sunucu yil donumu: ${anniversaries.join(", ")}`);
            data.meta[anniversaryKey] = true; saveData();
        }
    }
}

client.once("clientReady", async () => {
    logger(`${config.name} active - ${client.user.tag}`);
    data.activeVoice = {};
    for (const guild of client.guilds.cache.values()) {
        const reviewChannelId = communitySettings().confessionReviewChannelId;
        const reviewChannel = configured(reviewChannelId) ? guild.channels.cache.get(reviewChannelId) : null;
        if (reviewChannel && reviewChannel.type === ChannelType.GuildText) {
            await reviewChannel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false, SendMessages: false }, { reason: "Itiraf inceleme gizliligi" }).catch(error => logger(`Confession review privacy failed: ${error.message}`));
            await reviewChannel.permissionOverwrites.edit(guild.ownerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }, { reason: "Sunucu kurucusu itiraf inceleme erisimi" }).catch(error => logger(`Owner review access failed: ${error.message}`));
            await reviewChannel.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true, ReadMessageHistory: true }, { reason: "Itiraf bot erisimi" }).catch(error => logger(`Bot review access failed: ${error.message}`));
        }
        const confessionPanelId = communitySettings().confessionPanelChannelId;
        const confessionPanel = configured(confessionPanelId) ? guild.channels.cache.get(confessionPanelId) : null;
        if (confessionPanel?.isTextBased()) {
            const recent = await confessionPanel.messages.fetch({ limit: 20 }).catch(() => null);
            const exists = recent?.find(item => item.author.id === client.user.id && item.components.some(row => row.components.some(component => component.customId === "community:confess")));
            if (exists) await exists.edit({ embeds: [modernConfessionPanelEmbed(guild)], components: confessionPanelComponents() }).catch(error => logger(`Confession panel update failed: ${error.message}`));
            else await confessionPanel.send({ embeds: [modernConfessionPanelEmbed(guild)], components: confessionPanelComponents() }).catch(error => logger(`Confession panel post failed: ${error.message}`));
        }
        await validatePrivateRoomConfiguration(guild);
        await ensurePrivateRoomInfoPanel(guild);
        await snapshotInvites(guild);
        await sendLog(guild, `Genel 1 aktif: ${client.user.tag}`, "general");
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isVoiceBased() || !isTrackedVoiceChannel(channel.id)) continue;
            for (const member of channel.members.values()) if (!member.user.bot) openVoiceSession(member);
        }
    }
    saveData();
    engagement.dashboard(() => {
        const guild = client.guilds.cache.get(config.guildId);
        const leaders = Object.values(data.users).map(user => ({ tag: user.tag, points: getPointsFor(user.id, config.guildId, Date.now() - 30 * DAY_MS) })).sort((a, b) => b.points - a.points).slice(0, 10);
        return { memberCount: guild?.memberCount || 0, userCount: Object.keys(data.users).length, bonus: engagement.getBonus()?.label, leaders };
    });
    await scheduledMaintenance();
    setInterval(() => scheduledMaintenance().catch(error => logger(error.message)), 60 * 60_000);
});

client.on("interactionCreate", async interaction => {
    if (!interaction.guild) return;
    if (interaction.isButton() && interaction.customId.startsWith("private-room-info:")) {
        const action = interaction.customId.split(":")[1];
        if (action === "rules") return interaction.reply({ embeds: [privateRoomInfoEmbed()], ephemeral: true });
        const managed = managedRoom(interaction.user.id, interaction.guild.id);
        const channel = managed && interaction.guild.channels.cache.get(managed.record.channelId);
        if (channel) return interaction.reply({ embeds: [roomPanelEmbed(channel, Boolean(managed.record.locked), managed.record)], components: roomControlComponents(Boolean(managed.record.locked), managed.isOwner), ephemeral: true });
        return interaction.reply({ content: communitySettings().privateRoom?.enabled ? "Önce **Tıkla Oluştur** ses kanalına gir; locan otomatik açıldıktan sonra buradan yönetebilirsin." : "Loca sistemi henüz etkin değil.", ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith("room:")) {
        const action = interaction.customId.split(":")[1]; const managed = managedRoom(interaction.user.id, interaction.guild.id);
        const record = managed?.record; const channel = record && interaction.guild.channels.cache.get(record.channelId);
        if (!record || !channel) return interaction.reply({ content: "Yönetebileceğin aktif bir locaya sahip değilsin.", ephemeral: true });
        if (action === "info") return interaction.reply({ embeds: [roomPanelEmbed(channel, Boolean(record.locked), record)], ephemeral: true });
        if (["manager-add", "manager-remove"].includes(action) && !managed.isOwner) return interaction.reply({ content: "Loca yöneticilerini yalnızca loca sahibi değiştirebilir.", ephemeral: true });
        if (["add", "remove", "rename", "manager-add", "manager-remove"].includes(action)) {
            const config = {
                add: ["Eklenecek üye", "Üye etiketi veya ID"], remove: ["Çıkarılacak üye", "Üye etiketi veya ID"], rename: ["Yeni loca adı", "Örnek: Oyun Locası"],
                "manager-add": ["Yönetici eklenecek üye", "Üye etiketi veya ID"], "manager-remove": ["Yönetici çıkarılacak üye", "Üye etiketi veya ID"]
            }[action];
            const modal = new ModalBuilder().setCustomId(`room-submit:${action}:${managed.ownerId}`).setTitle(config[0]);
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel(config[0]).setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(action === "rename" ? 90 : 22).setPlaceholder(config[1]).setRequired(true)));
            return interaction.showModal(modal);
        }
        if (action === "lock" || action === "unlock") {
            record.locked = action === "lock";
            for (const memberId of record.members || []) await channel.permissionOverwrites.edit(memberId, { Connect: !record.locked, ViewChannel: true }, { reason: `Loca ${record.locked ? "kilitlendi" : "açıldı"}` });
            saveCommunityPanels();
            return interaction.update({ embeds: [roomPanelEmbed(channel, record.locked, record)], components: roomControlComponents(record.locked, managed.isOwner) });
        }
        return interaction.reply({ content: "Bu loca işlemi bulunamadı.", ephemeral: true });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("room-submit:")) {
        const [, action, ownerId] = interaction.customId.split(":"); const record = communityPanels.rooms[ownerId];
        const channel = record && interaction.guild.channels.cache.get(record.channelId); const isOwner = ownerId === interaction.user.id || record?.ownerId === interaction.user.id;
        const isManager = (record?.managers || []).includes(interaction.user.id);
        if (!record || !channel || (!isOwner && !isManager)) return interaction.reply({ content: "Bu loca artık aktif değil veya işlem yetkin yok.", ephemeral: true });
        if (["manager-add", "manager-remove"].includes(action) && !isOwner) return interaction.reply({ content: "Yönetici değişikliklerini yalnızca loca sahibi yapabilir.", ephemeral: true });
        const value = interaction.fields.getTextInputValue("value").trim();
        if (action === "rename") {
            if (value.length < 2) return interaction.reply({ content: "Loca adı en az 2 karakter olmalı.", ephemeral: true });
            await channel.setName(value.slice(0, 90), "Loca adı güncellendi");
        } else {
            const memberId = value.replace(/[<@!>]/g, ""); const target = await interaction.guild.members.fetch(memberId).catch(() => null);
            if (!target || target.user.bot || target.id === ownerId) return interaction.reply({ content: "Geçerli bir üye seç.", ephemeral: true });
            record.members ||= []; record.managers ||= [];
            if (action === "add") {
                if (!record.members.includes(target.id)) record.members.push(target.id);
                await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: !record.locked }, { reason: "Loca üyesi eklendi" });
            } else if (action === "remove") {
                record.members = record.members.filter(id => id !== target.id);
                if (!record.managers.includes(target.id)) await channel.permissionOverwrites.delete(target.id, "Loca üyesi çıkarıldı");
            } else if (action === "manager-add") {
                if (!record.managers.includes(target.id)) record.managers.push(target.id);
                await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true }, { reason: "Loca yöneticisi eklendi" });
            } else if (action === "manager-remove") {
                record.managers = record.managers.filter(id => id !== target.id);
                if (record.members.includes(target.id)) await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: !record.locked, ManageChannels: null, MoveMembers: null }, { reason: "Loca yöneticisi çıkarıldı" });
                else await channel.permissionOverwrites.delete(target.id, "Loca yöneticisi çıkarıldı");
            }
        }
        saveCommunityPanels();
        return interaction.reply({ content: "Loca ayarı güncellendi.", ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith("private-room-info:")) {
        const action = interaction.customId.split(":")[1];
        if (action === "rules") return interaction.reply({ embeds: [privateRoomInfoEmbed()], ephemeral: true });
        const room = communitySettings().privateRoom || {}; const owned = communityPanels.rooms[interaction.user.id];
        const channel = owned && interaction.guild.channels.cache.get(owned.channelId);
        if (channel) return interaction.reply({ embeds: [roomPanelEmbed(channel, Boolean(owned.locked))], components: roomControlComponents(Boolean(owned.locked)), ephemeral: true });
        return interaction.reply({ content: room.enabled ? "Once **Tikla Olustur** ses kanalina gir; odan otomatik acildiktan sonra buradan yonetebilirsin." : "Loca sistemi henuz etkin degil.", ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith("community:")) {
        const action = interaction.customId.split(":")[1];
        if (!config.engagement.economyCommandsEnabled && ["coin", "work", "store", "daily", "season"].includes(action)) return interaction.reply({ content: "Bu ekonomi islemi General 2'nin Wesh Coin kanalina tasindi.", ephemeral: true });
        if (action === "confess") return openConfessionModal(interaction);
        if (action === "coin") return interaction.reply({ embeds: [createCoinCard(interaction.member)], ephemeral: true });
        if (action === "work") return openWorkPanelFromInteraction(interaction);
        if (action === "daily") {
            const reward = engagement.claimDailyStreak(interaction.user.id, interaction.user.tag);
            return interaction.reply({ content: reward ? `🔥 ${reward.streak}. gunluk seri! **${reward.reward} coin** ve **10 sezon XP** kazandin.` : "Bugunku gunluk seri odulunu zaten aldin; yarin tekrar gel.", ephemeral: true });
        }
        if (action === "season") {
            const entry = engagement.user(interaction.user.id, interaction.user.tag); const season = config.engagement.economyPlus?.season;
            const tier = (season?.tiers || []).filter(goal => (entry.seasonXp || 0) >= goal).length;
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle(season?.name || "Aktif Sezon").setDescription(`Sezon XP: **${entry.seasonXp || 0}**\nAcik kademe: **${tier}/${season?.tiers?.length || 0}**\nBitis: <t:${Math.floor(new Date(season?.endsAt || Date.now()).getTime() / 1000)}:R>`).setFooter({ text: "XP; gunluk seri ve topluluk aktiviteleriyle kazanilir." })], ephemeral: true });
        }
        if (action === "rewards") return interaction.reply({ embeds: [createPersonalTasksEmbed(interaction.member)], ephemeral: true });
        if (action === "store") {
            if (!hasStoreAccess(interaction.member)) return interaction.reply({ content: "Magaza sadece kaydi tamamlanmis uyelere aciktir.", ephemeral: true });
            return interaction.reply({ embeds: [createStoreEmbed(interaction.member)], ephemeral: true });
        }
        if (action === "stats") return interaction.reply({ embeds: [createProfileEmbed(interaction.member)], ephemeral: true });
        if (action === "rooms") {
            const room = communitySettings().privateRoom || {};
            if (!room.enabled) return interaction.reply({ content: "Ozel oda sistemi kurulum bekliyor. Yetkili kanal ve kategori kimliklerini ekledikten sonra aktif olur.", ephemeral: true });
            const owned = communityPanels.rooms[interaction.user.id];
            const channel = owned && interaction.guild.channels.cache.get(owned.channelId);
            if (channel) return interaction.reply({ embeds: [roomPanelEmbed(channel, Boolean(owned.locked))], components: roomControlComponents(Boolean(owned.locked)), ephemeral: true });
            return interaction.reply({ content: "Oda olusturmak icin ayarlanmis **Tikla Olustur** ses kanalina girin. Oda bosalinca otomatik silinir.", ephemeral: true });
        }
    }
    if (interaction.isButton() && interaction.customId.startsWith("room:")) {
        const action = interaction.customId.split(":")[1];
        const record = communityPanels.rooms[interaction.user.id];
        const channel = record && interaction.guild.channels.cache.get(record.channelId);
        if (!record || !channel) return interaction.reply({ content: "Yonetebilecegin aktif bir odaya sahip degilsin.", ephemeral: true });
        if (["add", "remove", "limit", "rename"].includes(action)) {
            const labels = { add: "Eklenecek kullanici", remove: "Cikarilacak kullanici", limit: "Yeni limit (0-99)", rename: "Yeni oda adi" };
            const placeholders = { add: "Kullanici ID", remove: "Kullanici ID", limit: "Ornek: 5", rename: "Ornek: Oyun Odasi" };
            const titles = { add: "Eklenecek kullaniciyi belirtin.", remove: "Cikarilacak kullaniciyi belirtin.", limit: "Yeni uye limitini belirtin.", rename: "Yeni oda ismini belirtin." };
            const modal = new ModalBuilder().setCustomId(`room-submit:${action}`).setTitle(titles[action]);
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("value").setLabel(labels[action]).setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(action === "rename" ? 90 : 20).setPlaceholder(placeholders[action]).setRequired(true)));
            return interaction.showModal(modal);
        }
        if (action === "lock" || action === "unlock") {
            record.locked = action === "lock";
            for (const memberId of record.members || []) await channel.permissionOverwrites.edit(memberId, { Connect: !record.locked, ViewChannel: true }, { reason: `Oda ${record.locked ? "kilitlendi" : "acildi"}` });
            saveCommunityPanels();
            return interaction.update({ embeds: [roomPanelEmbed(channel, record.locked)], components: roomControlComponents(record.locked) });
        }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("room-submit:")) {
        const action = interaction.customId.split(":")[1];
        const record = communityPanels.rooms[interaction.user.id];
        const channel = record && interaction.guild.channels.cache.get(record.channelId);
        if (!record || !channel) return interaction.reply({ content: "Odan artik aktif degil.", ephemeral: true });
        const value = interaction.fields.getTextInputValue("value").trim();
        if (action === "rename") {
            if (value.length < 2) return interaction.reply({ content: "Oda adi en az 2 karakter olmali.", ephemeral: true });
            await channel.setName(value.slice(0, 90), "Oda sahibi isim degistirdi");
        } else if (action === "limit") {
            const limit = Number(value);
            if (!Number.isInteger(limit) || limit < 0 || limit > 99) return interaction.reply({ content: "Limit 0 ile 99 arasynda olmali.", ephemeral: true });
            await channel.setUserLimit(limit, "Oda sahibi limit degistirdi");
        } else {
            const memberId = value.replace(/[<@!>]/g, "");
            const member = await interaction.guild.members.fetch(memberId).catch(() => null);
            if (!member || member.user.bot) return interaction.reply({ content: "Gecerli bir uye ID gir.", ephemeral: true });
            record.members ||= [];
            if (action === "add") {
                if (!record.members.includes(member.id)) record.members.push(member.id);
                await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: !record.locked }, { reason: "Oda sahibinin uye daveti" });
            } else {
                record.members = record.members.filter(id => id !== member.id);
                await channel.permissionOverwrites.delete(member.id, "Oda sahibinin uye cikarmasi");
            }
        }
        saveCommunityPanels();
        return interaction.reply({ content: "Oda ayarin guncellendi.", ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith("marriage:")) {
        const [, action, id] = interaction.customId.split(":"); const proposal = communityPanels.proposals[id];
        if (!proposal || proposal.status !== "pending" || proposal.guildId !== interaction.guild.id) return interaction.reply({ content: "Bu teklif artik gecerli degil.", ephemeral: true });
        if (interaction.user.id !== proposal.targetId) return interaction.reply({ content: "Bu teklif sana ait degil.", ephemeral: true });
        if (action === "reject") { proposal.status = "rejected"; proposal.decidedAt = Date.now(); saveCommunityPanels(); return interaction.update({ content: "Teklif reddedildi.", components: [] }); }
        if (communityPanels.marriages[proposal.authorId] || communityPanels.marriages[proposal.targetId]) return interaction.reply({ content: "Taraflardan biri zaten evli.", ephemeral: true });
        const proposer = engagement.user(proposal.authorId, proposal.authorTag);
        if (!proposer.inventory.includes(proposal.ringId)) return interaction.reply({ content: "Yuzuk artik envanterde bulunamiyor.", ephemeral: true });
        proposer.inventory = proposer.inventory.filter(item => item !== proposal.ringId); engagement.save();
        const marriage = { partnerId: proposal.targetId, ringId: proposal.ringId, since: Date.now() };
        communityPanels.marriages[proposal.authorId] = marriage;
        communityPanels.marriages[proposal.targetId] = { partnerId: proposal.authorId, ringId: proposal.ringId, since: marriage.since };
        proposal.status = "accepted"; proposal.decidedAt = Date.now(); saveCommunityPanels();
        return interaction.update({ content: `💞 Tebrikler ${proposal.authorMention} ve <@${proposal.targetId}>! **${proposal.ringName}** ile evlendiniz.`, components: [] });
    }
    if (interaction.isModalSubmit() && interaction.customId === "confession:submit") {
        const settings = communitySettings();
        const reviewChannel = interaction.guild.channels.cache.get(settings.confessionReviewChannelId);
        if (!reviewChannel?.isTextBased()) return interaction.reply({ content: "Itiraf inceleme kanali bulunamadi; mesajin kaydedilmedi.", ephemeral: true });
        const content = interaction.fields.getTextInputValue("content").trim();
        const id = `I-${Date.now().toString(36).toUpperCase()}`;
        communityPanels.confessions[id] = { id, guildId: interaction.guild.id, authorId: interaction.user.id, content, createdAt: Date.now(), status: "pending", reactions: {}, reactedBy: {} };
        saveCommunityPanels();
        await reviewChannel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`Anonim itiraf | ${id}`).setDescription(content).addFields({ name: "Gonderen", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }).setFooter({ text: "Yayinlanirsa gonderen bilgisi uye kanalinda yer almaz." }).setTimestamp()], components: confessionButtons(id) });
        return interaction.reply({ content: `Itirafin ${id} numarasiyla incelemeye gonderildi. Onaylanirsa tamamen anonim yayinlanir.`, ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith("confession:")) {
        const [, action, id] = interaction.customId.split(":");
        if (action === "react") {
            const [, , reactionId, type] = interaction.customId.split(":"); const record = communityPanels.confessions[reactionId];
            if (!record || record.status !== "published") return interaction.reply({ content: "Bu itiraf artik tepkiye acik degil.", ephemeral: true });
            record.reactions ||= {}; record.reactedBy ||= {}; const previous = record.reactedBy[interaction.user.id];
            if (previous === type) return interaction.reply({ content: "Bu tepkiyi zaten verdin.", ephemeral: true });
            if (previous) record.reactions[previous] = Math.max(0, (record.reactions[previous] || 1) - 1);
            record.reactedBy[interaction.user.id] = type; record.reactions[type] = (record.reactions[type] || 0) + 1; saveCommunityPanels();
            return interaction.update({ components: confessionReactionComponents(reactionId, record.reactions) });
        }
        if (!canManageConfessions(interaction.member)) return interaction.reply({ content: "Bu karar sadece itiraf yonetimi icindir.", ephemeral: true });
        const record = communityPanels.confessions[id];
        if (!record || record.guildId !== interaction.guild.id || record.status !== "pending") return interaction.reply({ content: "Bu itiraf zaten sonuclanmis veya bulunamadi.", ephemeral: true });
        if (action === "reject") {
            record.status = "rejected"; record.decidedAt = Date.now(); record.decidedBy = interaction.user.id; saveCommunityPanels();
            return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setFooter({ text: `Reddedildi • ${interaction.user.tag}` })], components: confessionButtons(id, true) });
        }
        if (action === "approve") {
            const publishChannel = interaction.guild.channels.cache.get(communitySettings().confessionPublishChannelId);
            if (!publishChannel?.isTextBased()) return interaction.reply({ content: "Yayin kanali bulunamadi; itiraf beklemede kaldi.", ephemeral: true });
            record.reactions ||= {}; record.reactedBy ||= {};
            await publishChannel.send({ embeds: [new EmbedBuilder().setColor(0xE84393).setTitle("💌 Yeni Itiraf Geldi").setDescription(`> ${record.content.replace(/\n/g, "\n> ")}`).setFooter({ text: `Itiraf ${id} • Yonetim onayli ve anonim` }).setTimestamp()], components: confessionReactionComponents(id, record.reactions) });
            record.status = "published"; record.decidedAt = Date.now(); record.decidedBy = interaction.user.id; saveCommunityPanels();
            return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setFooter({ text: `Yayinlandi • ${interaction.user.tag}` })], components: confessionButtons(id, true) });
        }
    }
});

client.on("messageCreate", message => {
    if (message.author.bot || !message.guild || config.ignoredTextChannelIds.includes(message.channel.id)) return;
    const user = getUser(message.author);
    const date = new Date().toLocaleDateString("tr-TR");
    user.messages += 1;
    user.dailyMessages[date] = (user.dailyMessages[date] || 0) + 1;
    const antiFarm = config.rankSystem.antiFarm || {};
    const lastMessageAt = user.rank.lastMessageAt || 0;
    const todayMessagePoints = getPointEventsSince(message.guild.id, Date.now() - DAY_MS).filter(event => event.userId === user.id && event.type === "message").reduce((sum, event) => sum + event.points, 0);
    if (Date.now() - lastMessageAt >= (antiFarm.messageCooldownSeconds || 15) * 1000 && todayMessagePoints < (antiFarm.maxMessagePointsPerDay || 50)) {
        addPoints(user, config.rankSystem.points.message, "message", message.guild.id, { channelId: message.channel.id });
        user.rank.lastMessageAt = Date.now();
    }
    saveData();
    evaluatePromotion(message.member, "message").catch(() => {});
});

client.on("voiceStateUpdate", (oldState, newState) => {
    if (newState.member?.user.bot) return;
    const roomSettings = communitySettings().privateRoom || {};
    if (roomSettings.enabled && configured(roomSettings.createChannelId) && newState.channelId === roomSettings.createChannelId) {
        createPrivateRoom(newState.member).then(async room => {
            if (!room || newState.member.voice.channelId !== roomSettings.createChannelId) return;
            await newState.member.voice.setChannel(room, "Özel loca oluşturuldu");
            logger(`Private room created: owner=${newState.member.id}, channel=${room.id}`);
        }).catch(async error => {
            logger(`Private room creation or move failed: ${error.message}`);
            await newState.member.send("Özel loca oluşturulamadı. Botun **Kanalları Yönet** ve **Üyeleri Taşı** izinlerini kontrol edin.").catch(() => {});
        });
    }
    if (oldState.channelId) {
        const owner = Object.entries(communityPanels.rooms).find(([, value]) => value.channelId === oldState.channelId);
        const channel = oldState.guild.channels.cache.get(oldState.channelId);
        if (owner && channel?.members.size === 0) {
            delete communityPanels.rooms[owner[0]]; saveCommunityPanels();
            channel.delete("Bos gecici ozel oda").catch(error => logger(`Private room deletion failed: ${error.message}`));
        }
    }
    const member = newState.member;
    if (oldState.channelId === newState.channelId && isMuted(oldState) === isMuted(newState)) return;
    if (oldState.channelId === newState.channelId) {
        refreshVoiceChannel(newState.channel);
    } else {
        if (oldState.channelId) {
            closeVoiceSession(member.id);
            refreshVoiceChannel(oldState.channel);
        }
        if (newState.channelId) refreshVoiceChannel(newState.channel);
    }
    evaluatePromotion(member, "voice").catch(() => {});
});

client.on("guildMemberAdd", async member => {
    const before = inviteSnapshots.get(member.guild.id);
    await snapshotInvites(member.guild);
    const after = inviteSnapshots.get(member.guild.id);
    const used = [...(after || new Map()).entries()].find(([code, invite]) => (invite.uses || 0) > (before?.get(code)?.uses || 0));
    if (!used || !used[1].inviterId || used[1].inviterId === member.id) return;
    const inviter = await member.guild.members.fetch(used[1].inviterId).catch(() => null);
    if (!inviter || inviter.user.bot || Date.now() - member.user.createdTimestamp < (config.rankSystem.antiFarm?.minimumInviteAccountAgeDays || 7) * DAY_MS) return;
    const user = getUser(inviter.user);
    addPoints(user, config.rankSystem.points.invite, "invite", member.guild.id, { joinedMemberId: member.id, inviteCode: used[0] });
    appendJsonl(invitesFile, { at: Date.now(), guildId: member.guild.id, inviterId: inviter.id, joinedMemberId: member.id, inviteCode: used[0] });
    saveData();
    await sendLog(member.guild, { embeds: [inviteLogEmbed(member, inviter, inviteSummary(member.guild.id, inviter.id), "join", used[0])] }, "invite");
    await evaluatePromotion(inviter, "invite");
});

client.on("guildMemberRemove", async member => {
    const records = readJsonl(invitesFile).filter(record => record.guildId === member.guild.id && record.joinedMemberId === member.id && !record.leftAt);
    const record = records.at(-1);
    if (!record) return;
    const inviter = await member.guild.members.fetch(record.inviterId).catch(() => null);
    if (!inviter) return;
    const user = getUser(inviter.user);
    addPoints(user, -config.rankSystem.points.invite, "invite_leave", member.guild.id, { leftMemberId: member.id, inviteCode: record.inviteCode });
    appendJsonl(invitesFile, { ...record, leftAt: Date.now() });
    saveData();
    await sendLog(member.guild, { embeds: [inviteLogEmbed(member, inviter, inviteSummary(member.guild.id, inviter.id), "leave", record.inviteCode)] }, "invite");
});

client.on("guildMemberUpdate", (oldMember, newMember) => {
    if (oldMember.user.bot || oldMember.nickname === newMember.nickname) return;
    const before = oldMember.nickname || oldMember.user.username;
    const after = newMember.nickname || newMember.user.username;
    sendLog(newMember.guild, `Tag/isim güncellemesi: ${newMember} • **${before}** → **${after}**`, "tag").catch(() => {});
});

client.on("userUpdate", (oldUser, newUser) => {
    if (oldUser.bot || oldUser.username === newUser.username) return;
    for (const guild of client.guilds.cache.values()) {
        if (guild.members.cache.has(newUser.id)) sendLog(guild, `Kullanıcı adı güncellemesi: <@${newUser.id}> • **${oldUser.username}** → **${newUser.username}**`, "tag").catch(() => {});
    }
});

client.on("messageCreate", async message => {
    // Profil ve istatistik komutları sunucudaki her metin kanalında kullanılabilir.
    // Puan sayımı için olan kanal istisnaları yukarıdaki ayrı dinleyicide korunur.
    if (message.author.bot || !message.guild) return;
    const prefix = config.prefix || "!";
    if (!message.content.startsWith(prefix)) return;
    const [command] = message.content.slice(prefix.length).trim().split(/\s+/);
    const name = command?.toLocaleLowerCase("tr-TR");
    const inCommands = message.channel.id === config.statsChannelId || message.channel.id === communitySettings().panelChannelId || message.channel.id === communitySettings().confessionPanelChannelId;
    const inStaffChat = message.channel.id === config.staffCommandChannelId;
    if (!inCommands && !inStaffChat) return;
    if (inStaffChat && !hasModeratorAccess(message.member)) return;
    await message.delete().catch(() => {});
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const target = message.mentions.members.first() || message.member;
    const user = getUser(target.user);
    const now = Date.now();
    if (commandOnCooldown(message, name)) return;
    if (name === "itiraz" || name === "ticket" || name === "destek") {
        const requestedCaseId = args[1];
        if (name === "itiraz" && /^G-[A-Z0-9-]+$/i.test(requestedCaseId || "")) {
            const reason = args.slice(2).join(" ").trim();
            if (!reason) return temporaryReply(message, "Kullanım: `!itiraz G-vaka_no itiraz_sebebiniz`");
            const cases = loadSecurityCases(); const caseEntry = cases.cases?.[requestedCaseId];
            if (!caseEntry || caseEntry.guildId !== message.guild.id || caseEntry.memberId !== message.author.id || caseEntry.status !== "active") return temporaryReply(message, "Bu vaka için açık bir itiraz hakkı bulunamadı.");
            if (Object.values(securityAppeals).some(appeal => appeal.caseId === requestedCaseId && appeal.memberId === message.author.id && appeal.status === "pending")) return temporaryReply(message, "Bu vaka için zaten sonuçlanmayı bekleyen bir itirazın var.");
            const appeal = await sendSecurityAppeal(message, caseEntry, reason);
            if (!appeal) return temporaryReply(message, "İtiraz kanalı şu an bulunamadı; lütfen yönetime bildir.");
            audit(message.guild.id, "security_appeal_opened", message.author.id, message.author.id, { appealId: appeal.id, caseId: requestedCaseId, reason });
            return temporaryReply(message, `İtirazın **${appeal.id}** numarasıyla üst yönetime gönderildi.`);
        }
        const text = args.slice(1).join(" ").trim();
        if (!text) return temporaryReply(message, "Kullanim: `!itiraz mesajiniz` veya `!ticket mesajiniz`");
        const channel = message.guild.channels.cache.get(config.engagement.requestChannelId);
        const caseId = `T-${Date.now().toString(36).toUpperCase()}`;
        audit(message.guild.id, "member_request", message.author.id, null, { caseId, text, source: name });
        if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`Talep ${caseId}`).setDescription(text).addFields({ name: "Uye", value: `${message.author.tag} (${message.author.id})` }, { name: "Tur", value: name }).setTimestamp()] }).catch(() => {});
        return temporaryReply(message, `Talebin alindi. Takip numaran: **${caseId}**`);
    }
    if (name === "durum" || name === "health") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const health = healthSummary();
        return temporaryReply(message, `Bot durumu: **aktif**\nTakip edilen uye: **${health.userCount}**\nAcik ses oturumu: **${health.activeSessions}**\nSon puan kaydi: **${health.lastEventAt ? `<t:${Math.floor(health.lastEventAt / 1000)}:R>` : "yok"}**`);
    }
    if (name === "uyar") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const warned = message.mentions.members.first();
        const reason = args.slice(2).join(" ").trim();
        if (!warned || !reason) return temporaryReply(message, "Kullanim: `!uyar @uye sebep`");
        const warnings = moderation.warnings[warned.id] ||= [];
        warnings.push({ at: now, moderatorId: message.author.id, reason });
        const caseRecord = openCase(message.guild.id, "warn", message.author.id, warned.id, { reason, warningCount: warnings.length });
        if (warnings.length >= 3) await warned.timeout(60 * 60_000, "3 aktif uyarı: otomatik ceza önerisi uygulandı").catch(() => {});
        await sendLog(message.guild, `Uyari: ${warned} | Vaka: ${caseRecord.id} | Yetkili: ${message.author} | Sebep: ${reason}`);
        await sendLog(message.guild, { embeds: [guardLogEmbed("Yetkili uyarısı", message, warned, reason, [{ name: "Vaka", value: caseRecord.id, inline: true }, { name: "Toplam uyarı", value: String(warnings.length), inline: true }])] }, "guard");
        return temporaryReply(message, `${warned} uyarildi. Vaka: **${caseRecord.id}** | Toplam uyari: **${warnings.length}**${warnings.length >= 3 ? " | 1 saat otomatik timeout uygulandı." : ""}`);
    }
    if (name === "uyarilar" || name === "uyarilarim") {
        const warned = message.mentions.members.first() || message.member;
        if (warned.id !== message.author.id && !hasModeratorAccess(message.member)) return temporaryReply(message, "Baska bir uyenin uyarilarini sadece yetkililer gorebilir.");
        const warnings = moderation.warnings[warned.id] || [];
        const list = warnings.slice(-10).reverse().map((warning, index) => `${index + 1}. <t:${Math.floor(warning.at / 1000)}:d> - ${warning.reason}`).join("\n");
        return temporaryReply(message, `${warned} uyari gecmisi (${warnings.length}):\n${list || "Kayit yok."}`);
    }
    if (name === "vaka" || name === "vakalar") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const member = message.mentions.members.first() || message.member;
        const events = readJsonl(auditFile).filter(event => event.guildId === message.guild.id && (event.targetId === member.id || event.actorId === member.id)).slice(-15).reverse();
        return temporaryReply(message, `📁 **${member.user.tag} vaka kaydi**\n${events.length ? events.map(event => `• <t:${Math.floor(event.at / 1000)}:d> — ${event.action}`).join("\n") : "Kayit yok."}`);
    }
    if (name === "gerial" || name === "undo") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const caseId = args[1]; const record = moderation.cases[caseId];
        if (!record || record.guildId !== message.guild.id || record.status !== "open") return temporaryReply(message, "Açık vaka bulunamadı. Kullanım: `!gerial V-...`");
        const member = await message.guild.members.fetch(record.targetId).catch(() => null);
        if (record.type === "warn") {
            const list = moderation.warnings[record.targetId] || []; const index = list.findIndex(item => item.at === record.createdAt && item.moderatorId === record.actorId);
            if (index >= 0) list.splice(index, 1);
        }
        if (record.type === "timeout" && member) await member.timeout(null, `Vaka geri alma: ${caseId}`).catch(() => {});
        record.status = "reverted"; record.revertedAt = Date.now(); record.revertedBy = message.author.id; saveModeration();
        audit(message.guild.id, "case_reverted", message.author.id, record.targetId, { caseId, originalType: record.type });
        await sendLog(message.guild, `Geri alma: ${caseId} | Yetkili: ${message.author}`);
        return temporaryReply(message, `Vaka **${caseId}** geri alındı.`);
    }
    if (name === "yetkilikalite" || name === "kalite") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const since = Date.now() - 7 * DAY_MS; const events = readJsonl(auditFile).filter(event => event.guildId === message.guild.id && event.at >= since);
        const rows = [...new Set(events.map(event => event.actorId).filter(Boolean))].map(id => {
            const own = events.filter(event => event.actorId === id); const registrations = getPointEventsSince(message.guild.id, since).filter(event => event.userId === id && event.type === "registration").length;
            return { id, registrations, cases: own.filter(event => ["warn", "timeout", "ban"].includes(event.action)).length, reversals: own.filter(event => event.action === "case_reverted").length, requests: own.filter(event => event.action === "store_request_approved").length };
        }).sort((a, b) => (b.registrations + b.cases + b.requests) - (a.registrations + a.cases + a.requests)).slice(0, 10);
        return temporaryReply(message, { embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle("Yetkili Kalite Paneli | Son 7 Gün").setDescription(rows.length ? rows.map(row => `<@${row.id}> — kayıt **${row.registrations}** | müdahale **${row.cases}** | talep **${row.requests}** | geri alma **${row.reversals}**`).join("\n") : "Bu hafta yetkili verisi yok.").setFooter({ text: "Geri alma sayısı hatalı işlem düzeltmelerini görünür kılar." })] });
    }
    if (name === "timeout" || name === "sustur") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const muted = message.mentions.members.first();
        const duration = parseDuration(args[2]);
        const reason = args.slice(3).join(" ").trim() || "Sebep belirtilmedi";
        if (!muted || !duration) return temporaryReply(message, "Kullanim: `!timeout @uye 10m sebep` (m, h veya d; en fazla 28d)");
        try {
            await muted.timeout(duration, reason);
            const caseRecord = openCase(message.guild.id, "timeout", message.author.id, muted.id, { duration, reason });
            await sendLog(message.guild, `Timeout: ${muted} | ${Math.round(duration / 60_000)} dk | Yetkili: ${message.author} | Sebep: ${reason}`);
            await sendLog(message.guild, { embeds: [guardLogEmbed("Yetkili timeout işlemi", message, muted, reason, [{ name: "Süre", value: `${Math.round(duration / 60_000)} dakika`, inline: true }, { name: "Vaka", value: caseRecord.id, inline: true }])] }, "guard");
            return temporaryReply(message, `${muted} kullanicisi timeout aldi. Vaka: **${caseRecord.id}**`);
        } catch { return temporaryReply(message, "Timeout uygulanamadi. Bot rolunun sirasi ve Yetkilileri Zaman Asimina Alma iznini kontrol et."); }
    }
    if (name === "untimeout" || name === "susturmaac") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const muted = message.mentions.members.first();
        if (!muted) return temporaryReply(message, "Kullanim: `!untimeout @uye`");
        try {
            await muted.timeout(null, `Timeout kaldirildi: ${message.author.tag}`);
            audit(message.guild.id, "untimeout", message.author.id, muted.id);
            await sendLog(message.guild, `Timeout kaldirildi: ${muted} | Yetkili: ${message.author}`);
            await sendLog(message.guild, { embeds: [guardLogEmbed("Yetkili timeout kaldırdı", message, muted, "Timeout kaldırıldı")] }, "guard");
            return temporaryReply(message, `${muted} kullanicisinin timeout'u kaldirildi.`);
        } catch { return temporaryReply(message, "Timeout kaldirilamadi. Bot yetkisini kontrol et."); }
    }
    if (name === "ban") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const banned = message.mentions.members.first();
        const reason = args.slice(2).join(" ").trim() || "Sebep belirtilmedi";
        if (!banned) return temporaryReply(message, "Kullanim: `!ban @uye sebep`");
        try {
            await banned.ban({ reason }); openCase(message.guild.id, "ban", message.author.id, banned.id, { reason });
            await sendLog(message.guild, `Ban: ${banned.user.tag} | Yetkili: ${message.author} | Sebep: ${reason}`);
            await sendLog(message.guild, { embeds: [guardLogEmbed("Yetkili ban işlemi", message, banned, reason)] }, "guard");
            return temporaryReply(message, `${banned.user.tag} yasaklandi.`);
        } catch { return temporaryReply(message, "Yasaklama uygulanamadi. Bot rolunun sirasi ve Uyeleri Yasakla iznini kontrol et."); }
    }
    if (name === "unban") {
        if (!hasModeratorAccess(message.member)) return temporaryReply(message, "Bu komut sadece yetkililer icindir.");
        const userId = args[1];
        if (!/^\d{16,20}$/.test(userId || "")) return temporaryReply(message, "Kullanim: `!unban kullanici_id`");
        try {
            await message.guild.members.unban(userId, `Yasak kaldirildi: ${message.author.tag}`); audit(message.guild.id, "unban", message.author.id, userId);
            await sendLog(message.guild, `Ban kaldirildi: <@${userId}> | Yetkili: ${message.author}`);
            await sendLog(message.guild, { embeds: [guardLogEmbed("Yetkili ban kaldırdı", message, userId, "Ban kaldırıldı")] }, "guard");
            return temporaryReply(message, `<@${userId}> kullanicisinin yasagi kaldirildi.`);
        } catch { return temporaryReply(message, "Yasak kaldirilamadi; kullanici ID'sini kontrol et."); }
    }
    if (name === "sil" || name === "temizle") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return temporaryReply(message, "Bu komut için **Mesajları Yönet** yetkisi gerekir.");
        const amount = Number(args[1]);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) return temporaryReply(message, "Kullanım: `!sil 1-100`");
        try {
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(amount, true);
            const confirmation = await message.channel.send(`🧹 **${deleted.size} mesaj silindi.**`);
            setTimeout(() => confirmation.delete().catch(() => {}), 7_000);
        } catch (error) {
            await message.channel.send("Mesajlar silinemedi. Botun **Mesajları Yönet** yetkisini kontrol et.").then(reply => setTimeout(() => reply.delete().catch(() => {}), 10_000));
        }
        return;
    }
    if (["yardım", "yardim"].includes(name)) return sendHelpPanel(message);
    if (name === "merkez" || name === "panel" || name === "topluluk") return showCommunityPanel(message);
    const economyCommands = ["coin", "cuzdan", "cüzdan", "is", "iş", "work", "calis", "çalış", "isistatistik", "işistatistik", "kariyer", "kart", "kredikarti", "kredikartı", "karttanpara", "borctaksitlendir", "kartode", "parayukle", "coinver", "magaza", "mağaza", "envanter", "satinal", "satınal", "evlen", "evlilik", "evliligim", "evliliğim"];
    if (!config.engagement.economyCommandsEnabled && economyCommands.includes(name)) return temporaryReply(message, "Coin, kart, vardiya ve oyun islemleri yalnizca **Wesh Coin / General 2** kanalinda `.` prefixiyle kullanilir.");
    if (name === "coin" || name === "cuzdan" || name === "cüzdan") return temporaryReply(message, { embeds: [createCoinCard(message.member)] });
    if (name === "is" || name === "iş" || name === "work" || name === "calis" || name === "çalış") return openWorkPanel(message);
    if (name === "isistatistik" || name === "işistatistik" || name === "kariyer") return temporaryReply(message, { embeds: [workStatsEmbed(target)] });
    if (name === "kart" || name === "kredikarti" || name === "kredikartı") {
        const card = engagement.creditCardSummary(message.author.id, message.author.tag);
        const plan = card.card.installmentPlan;
        const planText = plan?.installments?.length
            ? plan.installments.map(item => `${item.number}. taksit: **${item.remaining.toLocaleString("tr-TR")} coin** • <t:${Math.floor(item.dueAt / 1000)}:d>`).join("\n")
            : "Aktif taksit plani yok.";
        return temporaryReply(message, { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`${message.member.displayName} | Kredi Karti`)
            .setDescription(`Limit: **${card.card.limit.toLocaleString("tr-TR")} coin**\nKullanilabilir limit: **${card.availableLimit.toLocaleString("tr-TR")} coin**\nGuncel borc: **${card.card.debt.toLocaleString("tr-TR")} coin**`)
            .addFields({ name: "Taksitler", value: planText })
            .setFooter({ text: "Kullan: !karttanpara miktar • !borctaksitlendir 2-12 • !kartode miktar" })] });
    }
    if (name === "karttanpara") {
        const amount = Number(args[1]); const charge = engagement.chargeCreditCard(message.author.id, message.author.tag, amount);
        if (!charge.ok) return temporaryReply(message, `Islem yapilamadi. Miktar pozitif tam sayi olmali ve kullanilabilir limitini (**${charge.availableLimit.toLocaleString("tr-TR")} coin**) asmamali.`);
        engagement.addCoins(message.author.id, message.author.tag, charge.charge);
        audit(message.guild.id, "credit_card_cash_advance", message.author.id, message.author.id, { amount: charge.charge, debt: charge.card.debt });
        return temporaryReply(message, `Kredi kartindan **${charge.charge.toLocaleString("tr-TR")} coin** cuzdanina yuklendi. Guncel borcun: **${charge.card.debt.toLocaleString("tr-TR")} coin**.`);
    }
    if (name === "borctaksitlendir") {
        const plan = engagement.installmentCreditCardDebt(message.author.id, message.author.tag, args[1]);
        const min = config.engagement.creditCard.minimumInstallments; const max = config.engagement.creditCard.maximumInstallments;
        if (!plan.ok) return temporaryReply(message, `Taksitlendirme yapilamadi. Acik borcun olmali ve adet **${min}-${max}** arasinda olmali.`);
        audit(message.guild.id, "credit_card_installment_plan", message.author.id, message.author.id, { count: plan.card.installmentPlan.count, debt: plan.card.debt });
        return temporaryReply(message, `**${plan.card.debt.toLocaleString("tr-TR")} coin** borcun ${plan.card.installmentPlan.count} taksite bolundu. Ayrintilar icin !kart yaz.`);
    }
    if (name === "kartode") {
        const payment = engagement.repayCreditCard(message.author.id, message.author.tag, args[1]);
        if (!payment.ok) return temporaryReply(message, `Odeme yapilamadi. Cuzdaninda yeterli coin ve odenecek borc oldugundan emin ol. Mevcut borc: **${payment.card.debt.toLocaleString("tr-TR")} coin**.`);
        audit(message.guild.id, "credit_card_payment", message.author.id, message.author.id, { amount: payment.payment, debt: payment.card.debt });
        return temporaryReply(message, `**${payment.payment.toLocaleString("tr-TR")} coin** kart borcu odendi. Kalan borc: **${payment.card.debt.toLocaleString("tr-TR")} coin**.`);
    }
    if (name === "parayukle" || name === "coinver") {
        if (!isFounder(message.author.id)) return temporaryReply(message, "Bu komut sadece sunucu kurucusuna ozeldir.");
        const recipient = message.mentions.members.first(); const amount = Number(args[2]);
        if (!recipient || recipient.user.bot || !Number.isInteger(amount) || amount <= 0) return temporaryReply(message, "Kullanim: `!parayukle @uye miktar`");
        const loaded = engagement.addCoins(recipient.id, recipient.user.tag, amount);
        audit(message.guild.id, "founder_coin_load", message.author.id, recipient.id, { amount: loaded.amount });
        return temporaryReply(message, `${recipient} hesabina **${loaded.amount.toLocaleString("tr-TR")} coin** yuklendi.`);
    }
    if (name === "evlen" || name === "evlilik") {
        const partner = message.mentions.members.first(); const ringId = args[2];
        if (!partner || partner.user.bot || partner.id === message.author.id || !ringId) return temporaryReply(message, "Kullanim: `!evlen @uye ring_common` (yuzuk marketten alinmis olmali).");
        if (communityPanels.marriages[message.author.id] || communityPanels.marriages[partner.id]) return temporaryReply(message, "Taraflardan biri zaten evli.");
        const entry = engagement.user(message.author.id, message.author.tag);
        const ring = config.engagement.store.find(item => item.id === ringId && item.type === "ring");
        if (!ring || !entry.inventory.includes(ringId)) return temporaryReply(message, "Bu yuzuk envanterinde yok. Once `!magaza` ile bir yuzuk al.");
        const id = `E-${Date.now().toString(36).toUpperCase()}`;
        communityPanels.proposals[id] = { id, guildId: message.guild.id, authorId: message.author.id, authorTag: message.author.tag, authorMention: message.author.toString(), targetId: partner.id, ringId, ringName: ring.name, status: "pending", createdAt: Date.now() };
        saveCommunityPanels();
        return temporaryReply(message, { content: `💍 ${partner}, ${message.author} sana **${ring.name}** ile evlilik teklif ediyor.`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`marriage:accept:${id}`).setLabel("Kabul et").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`marriage:reject:${id}`).setLabel("Reddet").setStyle(ButtonStyle.Danger))] });
    }
    if (name === "evliligim" || name === "evliliğim") {
        const marriage = communityPanels.marriages[message.author.id];
        return temporaryReply(message, marriage ? `💞 Esin: <@${marriage.partnerId}>\n💍 Yuzuk: **${config.engagement.store.find(item => item.id === marriage.ringId)?.name || marriage.ringId}**\n📅 Baslangic: <t:${Math.floor(marriage.since / 1000)}:D>` : "Su anda evli degilsin.");
    }
    if (name === "itiraf") {
        if (!configured(communitySettings().confessionReviewChannelId) || !configured(communitySettings().confessionPublishChannelId)) return temporaryReply(message, "Itiraf sistemi henuz kurulmamis. Yetkili gerekli kanal kimliklerini eklemeli.");
        const reply = await temporaryReply(message, { embeds: [modernConfessionPanelEmbed(message.guild)], components: confessionPanelComponents() });
        setTimeout(() => reply.edit({ components: [] }).catch(() => {}), 60_000);
        return;
    }
    if (name === "gorevlerim" || name === "kisiselgorevler") return temporaryReply(message, { embeds: [createPersonalTasksEmbed(message.member)] });
    if (name === "oduller" || name === "ödüller" || name === "gorevler" || name === "görevler") return sendRewardsPanel(message, target);
    if (name === "hedef") return temporaryReply(message, { embeds: [createGoalsEmbed(target)] });
    if (name === "rozetler" || name === "rozet") {
        const entry = engagement.user(target.id, target.user.tag);
        return temporaryReply(message, { embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`${target.displayName} Rozetleri`).setDescription(entry.badges.length ? entry.badges.map(badge => `🏅 ${badge}`).join("\n") : "Henuz rozet yok.") ] });
    }
    if (name === "yetkili" || name === "yetkililer") return temporaryReply(message, { embeds: [createStaffEmbed(message.guild)] });
    if (name === "magaza" || name === "mağaza") {
        if (!hasStoreAccess(message.member)) return temporaryReply(message, "Puan magazasi su an sadece ust yonetime aciktir. Puanini ve ilerlemeni `!istatistik` veya `!rank` ile takip edebilirsin.");
        return temporaryReply(message, { embeds: [createStoreEmbed(message.member)] });
    }
    if (name === "envanter") {
        const entry = engagement.user(target.id, target.user.tag);
        const items = entry.inventory.map(id => config.engagement.store.find(item => item.id === id)?.name || id);
        return temporaryReply(message, `🎒 **${target.displayName} envanteri**\nBakiye: **${entry.coins} coin**\n${items.length ? items.map(item => `• ${item}`).join("\n") : "Envanter bos."}`);
    }
    if (name === "satinal" || name === "satınal") {
        const itemId = message.content.slice(prefix.length).trim().split(/\s+/)[1];
        if (!hasStoreAccess(message.member)) return temporaryReply(message, "Puan magazasi su an sadece ust yonetime aciktir.");
        const result = engagement.canPurchase(message.author.id, message.author.tag, itemId);
        if (!result.ok) return temporaryReply(message, "Satin alma yapilamadi: kod gecersiz, bakiye yetersiz veya bu urunu daha once aldin.");

        // Custom assets are intentionally never delivered from a member command.
        // Their coin is held in escrow until the management-panel decision.
        if (result.item.type === "emoji") {
            const emojiName = args[2]; const attachment = message.attachments.first();
            const isImage = attachment && (attachment.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || attachment.url));
            if (!/^[A-Za-z0-9_]{2,32}$/.test(emojiName || "") || !isImage) return temporaryReply(message, "Kullanim: `!satinal custom_emoji EmojiAdi` ve mesaja PNG/JPG/GIF/WEBP gorsel ekle.");
            if (attachment.size && attachment.size > 256 * 1024) return temporaryReply(message, "Emoji gorseli en fazla 256 KB olmali.");
            const request = await sendStoreRequest(message, result.item, { name: emojiName, url: attachment.url, attachmentName: attachment.name });
            return temporaryReply(message, request ? `Talebin **${request.id}** ile üst yönetime gönderildi. **${result.item.cost} coin** karar verilene kadar emanette tutulur.` : "Talep kanalı bulunamadı; coin düşülmedi.");
        }
        if (result.item.type === "personal_role") {
            const roleName = args.slice(2).join(" ").trim();
            if (roleName.length < 2 || roleName.length > 32 || /@everyone/i.test(roleName)) return temporaryReply(message, "Kullanim: `!satinal custom_role Rol Adi` (2-32 karakter; @everyone kullanilamaz).");
            const request = await sendStoreRequest(message, result.item, { name: roleName });
            return temporaryReply(message, request ? `Talebin **${request.id}** ile üst yönetime gönderildi. **${result.item.cost} coin** karar verilene kadar emanette tutulur.` : "Talep kanalı bulunamadı; coin düşülmedi.");
        }

        if (result.item.type === "emoji") {
            const emojiName = args[2];
            const attachment = message.attachments.first();
            const isImage = attachment && (attachment.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || attachment.url));
            if (!/^[A-Za-z0-9_]{2,32}$/.test(emojiName || "") || !isImage) return temporaryReply(message, "Kullanim: `!satinal custom_emoji EmojiAdi` ve mesaja PNG/JPG/GIF/WEBP gorsel ekle. Emoji adi 2-32 karakter, sadece harf/rakam/_ olabilir.");
            if (attachment.size && attachment.size > 256 * 1024) return temporaryReply(message, "Emoji gorseli en fazla 256 KB olmali.");
            try {
                const emoji = await message.guild.emojis.create({ attachment: attachment.url, name: emojiName, reason: `Coin magazasi: ${message.author.tag}` });
                engagement.completePurchase(message.author.id, message.author.tag, itemId);
                audit(message.guild.id, "store_custom_emoji", message.author.id, null, { emojiId: emoji.id, emojiName, cost: result.item.cost });
                return temporaryReply(message, `✅ **${emoji.name}** emojisi eklendi. **${result.item.cost} coin** dusuldu.`);
            } catch {
                return temporaryReply(message, "Emoji eklenemedi. Botun **Emojileri ve Ifadeleri Yonet** iznini, emoji limitini ve gorseli kontrol et; coin dusulmedi.");
            }
        }

        if (result.item.type === "personal_role") {
            const roleName = args.slice(2).join(" ").trim();
            if (roleName.length < 2 || roleName.length > 32 || /@everyone/i.test(roleName)) return temporaryReply(message, "Kullanim: `!satinal custom_role Rol Adi` (2-32 karakter; @everyone kullanilamaz).");
            let role;
            try {
                role = await message.guild.roles.create({ name: roleName, permissions: [], reason: `Coin magazasi: ${message.author.tag}` });
                await message.member.roles.add(role, "Coin magazasi kisisel rol");
                engagement.completePurchase(message.author.id, message.author.tag, itemId);
                audit(message.guild.id, "store_personal_role", message.author.id, message.author.id, { roleId: role.id, roleName, cost: result.item.cost });
                return temporaryReply(message, `✅ **${role.name}** adli yetkisiz kisisel rol olusturuldu ve sana verildi. **${result.item.cost} coin** dusuldu.`);
            } catch {
                if (role) await role.delete("Kisisel rol teslim edilemedi").catch(() => {});
                return temporaryReply(message, "Kisisel rol olusturulamadi. Botun **Rolleri Yonet** iznini ve rol siralamasini kontrol et; coin dusulmedi.");
            }
        }

        if (result.item.type === "ring") {
            engagement.completePurchase(message.author.id, message.author.tag, itemId);
            audit(message.guild.id, "store_ring", message.author.id, message.author.id, { itemId, cost: result.item.cost });
            return temporaryReply(message, `💍 **${result.item.name}** envanterine eklendi. Evlilik teklifi icin \`!evlen @uye ${itemId}\` kullanabilirsin.`);
        }
        if (result.item.type === "collectible") {
            engagement.completePurchase(message.author.id, message.author.tag, itemId);
            audit(message.guild.id, "store_collectible", message.author.id, message.author.id, { itemId, cost: result.item.cost });
            return temporaryReply(message, `🏅 Sinirli **${result.item.name}** koleksiyonuna eklendi.`);
        }

        return temporaryReply(message, "Bu magaza urunu henuz desteklenmiyor.");
    }
    if (name === "dogumgunum" || name === "doğumgünüm") {
        const value = message.content.slice(prefix.length).trim().split(/\s+/)[1];
        return temporaryReply(message, engagement.setBirthday(message.author.id, message.author.tag, value) ? "Dogum gunun kaydedildi." : "Biçim: `!dogumgunum GG-AA` (ornek: `!dogumgunum 14-05`)" );
    }
    if (name === "sezon") {
        const leaders = Object.values(data.users).map(user => ({ tag: user.tag, points: getPointsFor(user.id, message.guild.id, Date.now() - 30 * DAY_MS) })).sort((a, b) => b.points - a.points).slice(0, 5);
        return temporaryReply(message, { embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle("Aktif Sezon").setDescription(`Bu ayin sezonu devam ediyor.\n\n${leaders.map((entry, index) => `**${index + 1}. ${entry.tag}** — ${formatNumber(entry.points)} puan`).join("\n") || "Liderlik verisi yok."}`).setFooter({ text: "Sezon siralamasi aylik olarak yenilenir." })] });
    }
    if (name === "rank") {
        const rank = getRank(target); const status = rankEligibility(target, rank);
        return temporaryReply(message, [`📈 **${target.user.tag} Rank Bilgisi**`, `Rütbe: **${rank.name}**`, `Toplam puan: **${user.rank.totalPoints.toFixed(2)}**`, `Son 30 gün: **${status.thirtyDays.toFixed(2)}**`, `Sunucu: **${Math.floor(status.serverDays)} gün**`, `Rütbe süresi: **${Math.floor(status.rankDays)} gün**`].join("\n"));
    }
    if (name === "sunucu") {
        const points = getPointEventsSince(message.guild.id, now - 30 * DAY_MS).reduce((sum, event) => sum + event.points, 0);
        return temporaryReply(message, `🏠 **${message.guild.name}**\nÜye: **${message.guild.memberCount}**\nSon 30 gün puanı: **${points.toFixed(2)}**\nTakip edilen kullanıcı: **${Object.keys(data.users).length}**`);
    }
    const period = name === "haftalık" ? 7 * DAY_MS : name === "aylık" ? 30 * DAY_MS : name === "enler" ? 30 * DAY_MS : null;
    if (period) {
        const totals = new Map();
        for (const event of getPointEventsSince(message.guild.id, now - period)) totals.set(event.userId, { tag: event.tag, points: (totals.get(event.userId)?.points || 0) + event.points });
        const ranking = [...totals.values()].sort((a, b) => b.points - a.points).slice(0, 10);
        if (!ranking.length) return temporaryReply(message, "Bu dönem için puan kaydı yok.");
        const title = name === "haftalık" ? "Haftalık" : name === "aylık" ? "Aylık" : "Son 30 Gün Enleri";
        return temporaryReply(message, `🏆 **${title}**\n${ranking.map((item, index) => `${index + 1}. **${item.tag}** — ${item.points.toFixed(2)} puan`).join("\n")}`);
    }
    if (name === "istatistik" || name === "profil" || name === "profile") return sendProfilePanel(message, target);
    if (name === "topmesaj" || name === "topses") {
        const ranking = Object.values(data.users).map(entry => ({ ...entry, value: name === "topmesaj" ? entry.messages : getLiveVoiceTime(entry.id, "weightedMs") })).sort((a, b) => b.value - a.value).slice(0, 10);
        return temporaryReply(message, ranking.length ? `🏆 **${name === "topmesaj" ? "Mesaj" : "Ses"} Sıralaması**\n${ranking.map((entry, index) => `${index + 1}. **${entry.tag}** — ${name === "topmesaj" ? `${entry.value} mesaj` : formatDuration(entry.value)}`).join("\n")}` : "Henüz istatistik yok.");
    }
    if (name === "topkayıt" || name === "topkayit") {
        const totals = new Map();
        for (const record of readJsonl(registrationsFile).filter(record => record.guildId === message.guild.id)) {
            const item = totals.get(record.registeredById) || { tag: record.registeredByTag || record.registeredById, count: 0 };
            item.count += 1;
            totals.set(record.registeredById, item);
        }
        const ranking = [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 10);
        return temporaryReply(message, ranking.length ? `🏆 **Kayıt Yetkilileri**\n${ranking.map((item, index) => `${index + 1}. **${item.tag}** — ${item.count} kayıt`).join("\n")}` : "Henüz kayıt geçmişi yok.");
    }
});

attachCommunityTools({
    client,
    dataDirectory,
    prefix: config.prefix || "!",
    staffRoleId: config.rankSystem.staffRoleId,
    isStaff: member => hasModeratorAccess(member),
    audit: (guildId, action, actorId, targetId, details) => audit(guildId, action, actorId, targetId, details),
    logger
});

if (!config.tokenName || !process.env[config.tokenName]) throw new Error(`${config.name} token is missing from .env.`);
keepVoiceConnected(client, config);
client.login(process.env[config.tokenName]);
