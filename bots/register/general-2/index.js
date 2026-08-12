require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder } = require("discord.js");
const { createCanvas } = require("@napi-rs/canvas");
const { acquireSingleInstance } = require("../../../shared/single-instance");
const createClient = require("../../../shared/client");
const createEngagementSystem = require("../general-1/engagement");
const config = require("./config");

if (!process.env[config.tokenName]) throw new Error(`${config.tokenName} .env dosyasinda tanimli degil.`);
if (!acquireSingleInstance("general-2")) {
    console.log("[WESH SYSTEM] General 2 zaten çalışıyor; ikinci işlem başlatılmadı.");
    process.exit(0);
}

const client = createClient();
client.on("error", error => console.error("General 2 Discord error:", error.message));
process.on("unhandledRejection", error => console.error("General 2 unhandled rejection:", error?.stack || error));
const dataDirectory = path.join(__dirname, "../../../data");
const gameFile = path.join(dataDirectory, "general-2-games.json");
const economyDataDirectory = path.join(dataDirectory, "general-2-economy");
const SESSION_MS = (config.game.sessionMinutes || 5) * 60_000;
const processedMessageIds = new Map();

function alreadyProcessed(messageId) {
    const now = Date.now();
    for (const [id, expiresAt] of processedMessageIds) if (expiresAt <= now) processedMessageIds.delete(id);
    if (processedMessageIds.has(messageId)) return true;
    processedMessageIds.set(messageId, now + 60_000);
    return false;
}

function load() { try { const value = JSON.parse(fs.readFileSync(gameFile, "utf8")); return { users: value.users || {}, sessions: value.sessions || {}, banks: value.banks || {}, businesses: value.businesses || {}, loans: value.loans || {}, marriages: value.marriages || {}, proposals: value.proposals || {}, transfers: Array.isArray(value.transfers) ? value.transfers : [] }; } catch { return { users: {}, sessions: {}, banks: {}, businesses: {}, loans: {}, marriages: {}, proposals: {}, transfers: [] }; } }
let state = load();
const economy = createEngagementSystem({ dataDirectory: economyDataDirectory, settings: config.economy });
function migrateLegacyEconomyOnce() {
    if (state.economyMigrationCompletedAt) return;
    const legacyFile = path.join(dataDirectory, "engagement.json"); const legacy = readJson(legacyFile).users || {};
    for (const [id, entry] of Object.entries(legacy)) {
        if (economy.state.users[id]) continue;
        economy.state.users[id] = { id, tag: entry.tag || id, coins: Number(entry.coins || 0), badges: entry.badges || [], inventory: entry.inventory || [], creditCard: entry.creditCard || null, work: entry.work || null, daily: {}, weekly: {}, lifetime: entry.lifetime || { messages: 0, voiceMinutes: 0, registrations: 0, invites: 0 } };
    }
    economy.save(); state.economyMigrationCompletedAt = Date.now(); save();
}
migrateLegacyEconomyOnce();
function save() { fs.mkdirSync(dataDirectory, { recursive: true }); const temp = `${gameFile}.tmp`; fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8"); fs.renameSync(temp, gameFile); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } }
function randomId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
function format(value) { return new Intl.NumberFormat("tr-TR").format(Math.max(0, Math.floor(value || 0))); }
const economyJobs = [
    { id: "kurye", name: "Kurye", question: "Teslimattan once neyi dogrularsin?", options: ["Adres ve aliciyi", "Bahsisi", "Aracin rengini", "Muzigi"], answer: 0 },
    { id: "kargo", name: "Kargo Personeli", question: "Hasarli pakette ne yaparsin?", options: ["Teslim notu duserim", "Gizlerim", "Acarim", "Bekletirim"], answer: 0 },
    { id: "kasa", name: "Kasa Personeli", question: "Tutar uyusmazsa ne yaparsin?", options: ["Fis ve tutari kontrol ederim", "Rastgele girerim", "Kasayi kapatirim", "Musteriyi yollarim"], answer: 0 },
    { id: "benzinci", name: "Benzinci", question: "Yakittan once neyi sorarsin?", options: ["Yakit turunu", "Telefonunu", "Yolunu", "Muzigi"], answer: 0 },
    { id: "garson", name: "Garson", question: "Sipariste en guvenli adim nedir?", options: ["Tekrar onaylamak", "Tahmin etmek", "Hesap getirmek", "Masayi degistirmek"], answer: 0 },
    { id: "manav", name: "Manav", question: "Tartimdan once neyi kontrol edersin?", options: ["Terazinin sifirini", "Kasayi", "Tabelayi", "Telefoni"], answer: 0 },
    { id: "barista", name: "Barista", question: "Alerjen uyarisi varsa ne yaparsin?", options: ["Icerigi teyit ederim", "Rastgele veririm", "Yok sayarim", "Bekletirim"], answer: 0 },
    { id: "kitapci", name: "Kitapci", question: "Stokta olmayan kitap icin ne yaparsin?", options: ["Siparis secenegine bakarim", "Rafa baska koyarim", "Fiyati degistiririm", "Beklerim"], answer: 0 },
    { id: "destek", name: "Teknik Destek", question: "Ariza kaydinda ilk bilgi nedir?", options: ["Baslama zamani", "Sevdigi renk", "Hava", "Tatili"], answer: 0 },
    { id: "resepsiyon", name: "Resepsiyon", question: "Giris yaparken neyi kontrol edersin?", options: ["Rezervasyon ve kimlik", "Asansor", "Menu", "Dekor"], answer: 0 }
];
function economyCard(member) { const info = economy.creditCardSummary(member.id, member.user.tag); return gameEmbed("Wesh Coin | Kredi Karti", `Limit: **${format(info.card.limit)} coin**\nKullanilabilir: **${format(info.availableLimit)} coin**\nBorc: **${format(info.card.debt)} coin**\n\nOdeme: \`.kartode miktar\`\nTaksit: \`.borctaksitlendir 1-8\``, 0xF1C40F); }
function economyStore(member) { const entry = economy.user(member.id, member.user.tag); return gameEmbed("Wesh Coin | Magaza", `Bakiye: **${format(entry.coins)} coin**\n\n${config.economy.store.map(item => `**${item.name}** - ${format(item.cost)} coin\nKod: \`${item.id}\``).join("\n\n")}\n\nSatin alma: \`.satinal kod\``, 0xEB459E); }
async function startEconomyWork(message) {
    const started = economy.beginWork(message.member.id, message.author.tag); if (!started.ok) return message.channel.send(`Vardiya hakkin henuz acilmadi. Kalan sure: **${Math.ceil((started.remainingMs || 0) / 60_000)} dakika**.`);
    const job = economyJobs[Math.floor(Math.random() * economyJobs.length)]; const level = config.economy.workSystem.levels[Math.floor(Math.random() * config.economy.workSystem.levels.length)]; const reward = Math.floor(Math.random() * (level.maximum - level.minimum + 1)) + level.minimum;
    const panel = await message.channel.send({ embeds: [gameEmbed(`Vardiya | ${job.name}`, `**Gorev:** ${job.question}\n**Seviye:** ${level.label}\n**Olası kazanc:** ${reward} coin`, 0x5865F2)], components: [new ActionRowBuilder().addComponents(...job.options.map((option, index) => new ButtonBuilder().setCustomId(`e-work:${message.author.id}:${index}`).setLabel(option).setStyle(ButtonStyle.Secondary)))] });
    const collector = panel.createMessageComponentCollector({ time: 60_000 }); let answered = false;
    collector.on("collect", async interaction => { if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Bu vardiya sana ait degil.", ephemeral: true }); const success = Number(interaction.customId.split(":")[2]) === job.answer; const result = economy.completeWork(message.author.id, message.author.tag, { success, reward, jobId: job.id, level: level.label }); answered = true; await interaction.update({ embeds: [gameEmbed(success ? "Vardiya Tamamlandi" : "Vardiya Basarisiz", success ? `Dogru cevap! **${result.reward} coin** kazandin.` : "Bu vardiyada kazanc elde edemedin.", success ? 0x57F287 : 0xED4245)], components: [] }); collector.stop(); });
    collector.on("end", () => { if (!answered) economy.cancelWork(message.author.id, message.author.tag); panel.edit({ components: [] }).catch(() => {}); });
}
async function startTower(message, rawBet) {
    const entry = user(message.member); const bet = validBet(entry, rawBet || 100); if (!bet) return message.channel.send("Tower bahsi bakiyene uygun olmali.");
    entry.balance -= bet; save(); let floor = 1; let multiplier = 1; let active = true;
    const render = (text, color = 0x5865F2) => gameEmbed("TOWER | Risk Oyunu", `Oyuncu: ${message.author}\nKat: **${floor}/8**\nKatsayi: **x${multiplier.toFixed(2)}**\nBahis: **${format(bet)} kredi**\n\n${text}`, color);
    const components = () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("tower:left").setLabel("Sol Kapi").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("tower:middle").setLabel("Orta Kapi").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("tower:right").setLabel("Sag Kapi").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("tower:cash").setLabel("Kazanci Al").setStyle(ButtonStyle.Success))];
    const panel = await message.channel.send({ embeds: [render("Guvenli bir kapi sec veya istedigin anda kazancini al.")], components: components() }); const collector = panel.createMessageComponentCollector({ time: 90_000 });
    collector.on("collect", async interaction => { if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Bu Tower turu sana ait degil.", ephemeral: true }); if (!active) return; if (interaction.customId === "tower:cash") { const payout = Math.floor(bet * multiplier); entry.balance += payout; entry.games += 1; entry.wins += 1; save(); active = false; await interaction.update({ embeds: [render(`Kazancini aldın: **${format(payout)} kredi**`, 0x57F287)], components: [] }); return collector.stop(); } if (Math.random() < 0.32) { entry.games += 1; entry.losses += 1; save(); active = false; await interaction.update({ embeds: [render(`DUSTUN! ${floor}. katta yanlis kapiyi sectin.`, 0xED4245)], components: [] }); return collector.stop(); } multiplier += 0.42 + floor * 0.08; floor += 1; if (floor > 8) { const payout = Math.floor(bet * multiplier); entry.balance += payout; entry.games += 1; entry.wins += 1; save(); active = false; await interaction.update({ embeds: [render(`Kulenin zirvesine ciktin! **${format(payout)} kredi**`, 0x57F287)], components: [] }); return collector.stop(); } await interaction.update({ embeds: [render("Guvenli kapi! Devam et veya kazancini al.")], components: components() }); });
    collector.on("end", async () => { if (!active) return; active = false; entry.balance += bet; save(); await panel.edit({ embeds: [render(`Süre doldu; **${format(bet)} coin** bahsin iade edildi.`, 0xFEE75C)], components: [] }).catch(() => {}); });
}
async function startAviatorLegacy(message, rawBet) {
    const entry = user(message.member); const bet = validBet(entry, rawBet || 100); if (!bet) return message.channel.send("Aviator bahsi bakiyene uygun olmali.");
    entry.balance -= bet; save(); const crash = 1.25 + Math.random() * 7.75; let multiplier = 1; let active = true;
    const panel = await message.channel.send({ embeds: [gameEmbed("AVIATOR | Ucus Basladi", `✈️ Ucak yukseliyor...\nBahis: **${format(bet)} kredi**\nKatsayi: **x1.00**\n\nDusmeden once **Kazanci Al** dugmesine bas.`, 0x3498DB)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("aviator:cash").setLabel("Kazanci Al").setStyle(ButtonStyle.Success))] });
    const collector = panel.createMessageComponentCollector({ time: 30_000 }); const timer = setInterval(async () => { if (!active) return; multiplier += 0.16 + multiplier * 0.035; if (multiplier >= crash) { active = false; clearInterval(timer); entry.games += 1; entry.losses += 1; save(); await panel.edit({ embeds: [gameEmbed("AVIATOR | DUSTU", `✈️ Ucak **x${crash.toFixed(2)}** katsayisinda dustu.\nBahis kaybedildi: **${format(bet)} kredi**`, 0xED4245)], components: [] }).catch(() => {}); collector.stop(); return; } await panel.edit({ embeds: [gameEmbed("AVIATOR | Ucus Devam Ediyor", `✈️ Ucak yukseliyor...\nBahis: **${format(bet)} kredi**\nAnlik katsayi: **x${multiplier.toFixed(2)}**\nOlası kazanc: **${format(bet * multiplier)} kredi**`, 0x3498DB)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("aviator:cash").setLabel("Kazanci Al").setStyle(ButtonStyle.Success))] }).catch(() => {}); }, 1000);
    collector.on("collect", async interaction => { if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Bu Aviator turu sana ait degil.", ephemeral: true }); if (!active) return; active = false; clearInterval(timer); const payout = Math.floor(bet * multiplier); entry.balance += payout; entry.games += 1; entry.wins += 1; save(); await interaction.update({ embeds: [gameEmbed("AVIATOR | KAZANC ALINDI", `✈️ **x${multiplier.toFixed(2)}** katsayisinda ciktin.\nKazanc: **${format(payout)} kredi**`, 0x57F287)], components: [] }); collector.stop(); });
    collector.on("end", async () => { clearInterval(timer); if (!active) return; active = false; entry.balance += bet; save(); await panel.edit({ embeds: [gameEmbed("AVIATOR | SÜRE DOLDU", `Bahsin iade edildi: **${format(bet)} coin**`, 0xFEE75C)], components: [] }).catch(() => {}); });
}
function aviatorPayload(bet, multiplier, status, color, crashed = false) {
    const canvas = createCanvas(900, 300); const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 900, 300); gradient.addColorStop(0, crashed ? "#260707" : "#07162f"); gradient.addColorStop(0.58, crashed ? "#551008" : "#123b67"); gradient.addColorStop(1, crashed ? "#170507" : "#32104f"); context.fillStyle = gradient; context.fillRect(0, 0, 900, 300);
    context.globalAlpha = 0.7; context.fillStyle = "#dbeafe"; for (let i = 0; i < 55; i++) context.fillRect((i * 83) % 900, (i * 47) % 210, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2); context.globalAlpha = 1;
    context.strokeStyle = crashed ? "rgba(251,146,60,0.34)" : "rgba(56,189,248,0.28)"; context.lineWidth = 1; for (let x = 0; x < 900; x += 75) { context.beginPath(); context.moveTo(x, 225); context.lineTo(x + 110, 300); context.stroke(); }
    const progress = Math.min(0.9, Math.max(0.08, (multiplier - 1) / 8)); const x = 60 + progress * 760; const y = 245 - progress * 170;
    context.strokeStyle = crashed ? "#f97316" : "#38bdf8"; context.lineWidth = 5; context.beginPath(); context.moveTo(45, 255); context.quadraticCurveTo(x * 0.55, 255, x, y + 12); context.stroke();
    if (crashed) {
        const blast = context.createRadialGradient(x, y, 8, x, y, 82); blast.addColorStop(0, "#fff7c2"); blast.addColorStop(0.23, "#facc15"); blast.addColorStop(0.55, "#f97316"); blast.addColorStop(1, "rgba(220,38,38,0)"); context.fillStyle = blast; context.beginPath(); context.arc(x, y, 88, 0, Math.PI * 2); context.fill();
        context.strokeStyle = "#fde68a"; context.lineWidth = 5; for (let i = 0; i < 12; i++) { const angle = (Math.PI * 2 * i) / 12; context.beginPath(); context.moveTo(x + Math.cos(angle) * 27, y + Math.sin(angle) * 27); context.lineTo(x + Math.cos(angle) * 72, y + Math.sin(angle) * 72); context.stroke(); }
        context.fillStyle = "rgba(20,20,25,0.7)"; context.beginPath(); context.arc(x - 28, y - 38, 28, 0, Math.PI * 2); context.arc(x + 22, y - 47, 34, 0, Math.PI * 2); context.arc(x + 45, y - 18, 23, 0, Math.PI * 2); context.fill();
        context.fillStyle = "#fee2e2"; context.font = "bold 31px Arial"; context.fillText("UCAK DUSTU", 55, 58); context.font = "bold 19px Arial"; context.fillStyle = "#fdba74"; context.fillText(status, 55, 92);
    } else {
        context.save(); context.translate(x, y); context.rotate(-0.35); context.fillStyle = "#f8fafc"; context.beginPath(); context.moveTo(44, 0); context.lineTo(-31, -19); context.lineTo(-11, 0); context.lineTo(-31, 19); context.closePath(); context.fill(); context.fillStyle = "#ef4444"; context.fillRect(-14, -5, 34, 10); context.fillStyle = "#93c5fd"; context.fillRect(9, -4, 14, 8); context.restore();
        context.fillStyle = "#f8fafc"; context.font = "bold 34px Arial"; context.fillText(`x${multiplier.toFixed(2)}`, 55, 58); context.font = "20px Arial"; context.fillStyle = "#a5b4fc"; context.fillText(status, 55, 92);
    }
    const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "aviator-live.png" }); const title = crashed ? "AVIATOR | UCAK DUSTU" : "AVIATOR | Canli Ucus"; const description = crashed ? `Ucak **x${multiplier.toFixed(2)}** katsayisinda dustu.\nBahis kaybedildi: **${format(bet)} kredi**` : `Bahis: **${format(bet)} kredi**\nAnlik katsayi: **x${multiplier.toFixed(2)}**\nOlası kazanc: **${format(bet * multiplier)} kredi**`; return { embeds: [gameEmbed(title, description, color).setImage(`attachment://${attachment.name}`)], files: [attachment] };
}
async function startAviator(message, rawBet) {
    const entry = user(message.member); const bet = validBet(entry, rawBet || 100); if (!bet) return message.channel.send("Aviator bahsi bakiyene uygun olmali."); entry.balance -= bet; save(); const crash = 1.25 + Math.random() * 7.75; let multiplier = 1; let active = true;
    const first = aviatorPayload(bet, multiplier, "Ucak kalkisa hazirlaniyor", 0x3498DB); const row = () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("aviator:cash").setLabel("Kazanci Al").setStyle(ButtonStyle.Success))]; const panel = await message.channel.send({ ...first, components: row() }); const collector = panel.createMessageComponentCollector({ time: 30_000 });
    const timer = setInterval(async () => { if (!active) return; multiplier += 0.16 + multiplier * 0.035; if (multiplier >= crash) { active = false; clearInterval(timer); entry.games += 1; entry.losses += 1; save(); await panel.edit({ ...aviatorPayload(bet, crash, `Ucak x${crash.toFixed(2)} seviyesinde dustu`, 0xED4245, true), components: [] }).catch(() => {}); return collector.stop(); } await panel.edit({ ...aviatorPayload(bet, multiplier, "Ucak yukseliyor - dusmeden cik", 0x3498DB), components: row() }).catch(() => {}); }, 1000);
    collector.on("collect", async interaction => { if (interaction.user.id !== message.author.id) return interaction.reply({ content: "Bu Aviator turu sana ait degil.", ephemeral: true }); if (!active) return; active = false; clearInterval(timer); const payout = Math.floor(bet * multiplier); entry.balance += payout; entry.games += 1; entry.wins += 1; save(); await interaction.update({ ...aviatorPayload(bet, multiplier, `Kazanc alindi: ${format(payout)} coin`, 0x57F287), components: [] }); collector.stop(); }); collector.on("end", async () => { clearInterval(timer); if (!active) return; active = false; entry.balance += bet; save(); await panel.edit({ ...aviatorPayload(bet, multiplier, `Süre doldu; ${format(bet)} coin iade edildi`, 0xFEE75C), components: [] }).catch(() => {}); });
}
function gather(message, type) { const entry = user(message.member); const now = Date.now(); const key = type === "fish" ? "lastFishAt" : "lastMineAt"; const cooldown = type === "fish" ? 45_000 : 60_000; if (now - (entry[key] || 0) < cooldown) return message.channel.send(`${type === "fish" ? "Balik" : "Maden"} icin ${Math.ceil((cooldown - (now - entry[key])) / 1000)} saniye bekle.`); entry[key] = now; const reward = type === "fish" ? 25 + Math.floor(Math.random() * 126) : 40 + Math.floor(Math.random() * 181); entry.balance += reward; entry.gamePoints = (entry.gamePoints || 0) + reward; save(); return message.channel.send({ embeds: [gameEmbed(type === "fish" ? "BALIK TUTMA" : "MADENCILIK", `${type === "fish" ? "🎣 Agi cektin" : "⛏️ Damari kazdin"}!\nKazanc: **+${format(reward)} oyun kredisi**\nOyun puani: **+${format(reward)}**`, 0x57F287)] }); }
function card() { const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]; const suits = ["♠", "♥", "♦", "♣"]; return `${ranks[Math.floor(Math.random() * ranks.length)]}${suits[Math.floor(Math.random() * suits.length)]}`; }
function handValue(hand) { let total = 0; let aces = 0; for (const item of hand) { const rank = item.slice(0, -1); if (rank === "A") { total += 11; aces += 1; } else total += ["J", "Q", "K"].includes(rank) ? 10 : Number(rank); } while (total > 21 && aces--) total -= 10; return total; }

function gameUser(id) {
    if (!state.users[id]) {
        state.users[id] = { balance: config.game.startingBalance, createdAt: Date.now(), gamePoints: 0, voiceMinutes: 0, voiceRewards: 0, wins: 0, losses: 0, games: 0 };
        save();
    }
    return state.users[id];
}
function user(member) { return gameUser(member.id); }
function transferCoins(sender, recipient, amount) {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, reason: "amount" };
    const from = gameUser(sender.id); const to = gameUser(recipient.id);
    if (from.balance < value) return { ok: false, reason: "balance", balance: from.balance };
    from.balance -= value; to.balance += value;
    state.transfers.push({ id: randomId("transfer"), fromId: sender.id, toId: recipient.id, amount: value, at: Date.now() });
    if (state.transfers.length > 200) state.transfers.splice(0, state.transfers.length - 200);
    save(); return { ok: true, amount: value, balance: from.balance };
}
function syncGeneralOneBonus(member) {
    user(member);
    return { status: "disabled", target: 0, gained: 0 };
}
function processVoiceRewards() {
    const rules = config.game.voiceRewards || {}; const eligible = new Set(rules.eligibleVoiceChannelIds || []);
    const intervalMs = Math.max(1, Number(rules.intervalMinutes) || 30) * 60_000;
    if (!eligible.size) return;
    let changed = false;
    for (const guild of client.guilds.cache.values()) for (const channelId of eligible) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isVoiceBased()) continue;
        for (const member of channel.members.values()) {
            if (member.user.bot || member.voice.selfMute || member.voice.serverMute) continue;
            const entry = user(member); entry.lastVoiceRewardAt ||= Date.now();
            const periods = Math.floor((Date.now() - entry.lastVoiceRewardAt) / intervalMs);
            if (!periods) continue;
            entry.lastVoiceRewardAt += periods * intervalMs; entry.voiceMinutes = (entry.voiceMinutes || 0) + periods * (rules.intervalMinutes || 30);
            for (let index = 0; index < periods; index++) if (Math.random() * 100 < (rules.chancePercent || 0)) {
                const reward = Math.floor(Math.random() * ((rules.maximumReward || 0) - (rules.minimumReward || 0) + 1)) + (rules.minimumReward || 0);
                entry.balance += reward; entry.gamePoints = (entry.gamePoints || 0) + reward; entry.voiceRewards = (entry.voiceRewards || 0) + reward;
            }
            changed = true;
        }
    }
    if (changed) save();
}
function validBet(entry, raw) { const bet = Number(raw); return Number.isInteger(bet) && bet >= config.game.minimumBet && bet <= config.game.maximumBet && bet <= entry.balance ? bet : null; }
function session(id) { const value = state.sessions[id]; return value && value.expiresAt > Date.now() ? value : null; }
function settle(entry, bet, payout) { entry.balance += payout; entry.games += 1; if (payout > 0) entry.wins += 1; else entry.losses += 1; save(); }
function gameEmbed(title, description, color = 0x2B2D31) { return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: "Wesh Coin • Sanal ekonomi; gerçek para veya ödeme içermez." }).setTimestamp(); }

function cardNumber() { return Array.from({ length: 4 }, () => String(Math.floor(1000 + Math.random() * 9000))).join(" "); }
function bank(member) { return state.banks[member.id] || null; }
function createBank(member) {
    if (bank(member)) return null;
    const account = { ownerId: member.id, cardNumber: cardNumber(), openedAt: Date.now(), bankBalance: 0, corporateCard: null };
    state.banks[member.id] = account; save(); return account;
}
function cardEmbed(member, account = bank(member)) {
    const wallet = user(member);
    return gameEmbed(`${member.displayName} | Wesh Bank Kartı`, [
        "```",
        "╔══════════════════════════════════════╗",
        "║              W E S H  B A N K         ║",
        "║                                      ║",
        `║  ${account.cardNumber.padEnd(34, " ")}║`,
        "║                                      ║",
        `║  KART SAHİBİ  ${member.displayName.toUpperCase().slice(0, 18).padEnd(18, " ")}  ║`,
        "╚══════════════════════════════════════╝",
        "```",
        `💰 **Wesh Coin bakiyesi:** ${format(wallet.balance)} coin\n🏦 **Şirket hesabı:** ${format(account.bankBalance)} coin${account.corporateCard ? `\n🏢 **Şirket kartı:** ${account.corporateCard}` : ""}`
    ].join("\n"), 0x111318);
}
function roundedRectangle(context, x, y, width, height, radius) {
    context.beginPath(); context.moveTo(x + radius, y); context.arcTo(x + width, y, x + width, y + height, radius); context.arcTo(x + width, y + height, x, y + height, radius); context.arcTo(x, y + height, x, y, radius); context.arcTo(x, y, x + width, y, radius); context.closePath();
}
async function bankCardPayload(member, account = bank(member), title = "Wesh Coin Kartın") {
    const wallet = user(member); const openedAt = account?.openedAt || wallet.createdAt || Date.now(); const joinedAt = member.joinedAt || new Date(openedAt);
    const canvas = createCanvas(1200, 680); const context = canvas.getContext("2d");
    const background = context.createLinearGradient(0, 0, 1200, 680); background.addColorStop(0, "#171717"); background.addColorStop(0.55, "#080808"); background.addColorStop(1, "#151515"); context.fillStyle = background; context.fillRect(0, 0, 1200, 680);
    context.globalAlpha = 0.14; context.fillStyle = "#3f3f46"; context.beginPath(); context.arc(1050, 580, 175, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
    roundedRectangle(context, 22, 22, 1156, 636, 48); context.strokeStyle = "rgba(255,255,255,0.05)"; context.lineWidth = 2; context.stroke();
    roundedRectangle(context, 62, 82, 102, 68, 10); const chip = context.createLinearGradient(62, 82, 164, 150); chip.addColorStop(0, "#d4d4d8"); chip.addColorStop(1, "#71717a"); context.fillStyle = chip; context.fill(); context.strokeStyle = "#e4e4e7"; context.lineWidth = 3; context.stroke();
    const cardNo = account?.cardNumber || cardNumber(); context.fillStyle = "#d4d4d8"; context.font = "bold 49px monospace"; context.fillText(cardNo, 62, 270);
    context.font = "bold 18px Arial"; context.fillStyle = "#a1a1aa"; context.fillText("KART SAHİBİ", 62, 366); context.font = "bold 31px Arial"; context.fillStyle = "#f4f4f5"; context.fillText(member.displayName.toUpperCase().slice(0, 24), 62, 410);
    context.font = "bold 18px Arial"; context.fillStyle = "#a1a1aa"; context.fillText("KATILIM TARİHİ", 62, 510); context.font = "bold 27px Arial"; context.fillStyle = "#f4f4f5"; context.fillText(new Intl.DateTimeFormat("tr-TR", { month: "2-digit", year: "2-digit" }).format(joinedAt), 62, 550);
    context.textAlign = "right"; context.font = "bold 18px Arial"; context.fillStyle = "#a1a1aa"; context.fillText("BAKİYE", 1110, 500); context.font = "bold 58px Arial"; context.fillStyle = "#ffffff"; context.fillText(format(wallet.balance), 1110, 560); context.font = "bold 24px Arial"; context.fillStyle = "#d4d4d8"; context.fillText("WESH COIN", 1110, 602); context.textAlign = "left";
    context.font = "bold 28px Arial"; context.fillStyle = "#71717a"; context.fillText("W E S H   C O I N", 62, 610);
    const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), { name: `wesh-card-${member.id}.png` });
    return { embeds: [new EmbedBuilder().setColor(0x111111).setTitle(title).setDescription("Karttaki bakiye oyunlar, ödüller ve üye transferleriyle anlık güncellenir. Yalnızca Wesh Coin olarak geçerlidir.").setImage(`attachment://${attachment.name}`)], files: [attachment] };
}
function company(member) { return state.businesses[member.id] || null; }
function availableIncome(record) { return Math.floor(Math.min(24, Math.max(0, Date.now() - record.lastCollectedAt) / 3_600_000) * record.hourlyIncome); }
function companyEmbed(member, record = company(member)) {
    if (!record) return gameEmbed("🏢 İşletme Yönetimi", "Henüz bir şirketin bulunmuyor. Şirket kurmak için aşağıdan bir işletme türü seç.", 0x1F2A44);
    const income = availableIncome(record);
    return gameEmbed("🏢 İşletme Yönetimi", [`**${record.name}**`, `Şubeler: **${(record.branches || [record.typeLabel]).join(" • ")}**`, `Seviye: **${record.level}**`, `Saatlik kazanç: **${format(record.hourlyIncome)} kredi**`, `Toplanabilir kazanç: **${format(income)} kredi**`, `Aktif kredi borcu: **${format(state.loans[member.id]?.remaining || 0)} kredi**`].join("\n"), 0x1F2A44);
}
function companyButtons(record) { return record ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bank:business:collect").setLabel("Kazancı Topla").setEmoji("💰").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("bank:business:expand").setLabel("Yeni Şube Aç").setEmoji("🏬").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bank:business:loan").setLabel("Kredi Seçenekleri").setEmoji("🏦").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("bank:business:info").setLabel("Bilgi").setStyle(ButtonStyle.Secondary))] : [new ActionRowBuilder().addComponents(...Object.entries(config.game.business.types).map(([id, item]) => new ButtonBuilder().setCustomId(`bank:business:create:${id}`).setLabel(item.label).setStyle(ButtonStyle.Primary)))]; }

function arcadeHome(member) {
    const entry = user(member); const general = { coins: 0, points: 0 };
    return gameEmbed("Wesh Arcade | Oyun Merkezi", [
        "Blackjack, Mayın Tarlası ve Slot oyunlarını güvenli, ayrı oyun cüzdanınla oyna.",
        "",
        `🎮 **Oyun bakiyesi:** ${format(entry.balance)} kredi`,
        `🏅 **General 1 bonusu:** ${format(entry.generalOneBonus)} kredi`,
        `📈 General 1: ${format(general.coins)} coin • ${format(general.points)} puan`,
        "",
        "Bahis seçmek için bir oyun düğmesine bas. Varsayılan bahis: **250 kredi**."
    ].join("\n"), 0x5865F2);
}
function arcadeButtons() { return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("arcade:start:blackjack").setLabel("Blackjack").setEmoji("💵").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("arcade:start:mines").setLabel("Mayın Tarlası").setEmoji("💣").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("arcade:start:slots").setLabel("Slot Makinesi").setEmoji("🎰").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("arcade:profile").setLabel("Cüzdanım").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("arcade:sync").setLabel("General 1 Ödülü").setStyle(ButtonStyle.Success)
)]; }
const arcadeHelpPages = [
    { label: "Klasik Oyunlar", emoji: "🎮", color: 0x5865F2, description: "**Blackjack**\n`.blackjack 250` ile bahisli kart oyunu.\n\n**Mayin Tarlasi**\n`.mines 250` ile kare ac, mayindan kac ve kazancini cek.\n\n**Slot Makinesi**\n`.slot 250` ile sembolleri cevir." },
    { label: "Canli ve Toplama", emoji: "✈️", color: 0xE67E22, description: "**Tower**\n`.tower 100` ile 8 katli risk oyununa gir; kapilardan birini sec veya kazancini al.\n\n**Aviator**\n`.aviator 100` ile hareketli ucus kartinda katsayi yukselirken dusmeden cik.\n\n**Balik Tutma**\n`.balik` ile 45 saniyelik beklemeyle rastgele kazanc al.\n\n**Madencilik**\n`.maden` ile 60 saniyelik beklemeyle oyun kredisi ve puani kazan." },
    { label: "Banka ve Isletme", emoji: "🏦", color: 0x1F2A44, description: "`.hesapolustur` ile banka hesabi ac.\n`.kartim` ile sanal kartini gor.\n`.sirket` ile isletme kur, sube ac ve gelir topla.\n\nBanka, sirket ve oyun bakiyesi sadece General 2'ye aittir." },
    { label: "Oyun Ses Odulleri", emoji: "🎧", color: 0x57F287, description: "Ayarli oyun ses odalarinda aktif ve mikrofonsuz susturulmadan kal.\n\nHer **30 dakikada** bir oyun kredisi ve oyun puani kazanma sansin vardir.\n\nKazanclar General 1 puanlarindan tamamen ayridir." },
    { label: "Guvenli Kullanim", emoji: "🛡️", color: 0xED4245, description: "Bu sistem tamamen sanaldir; gercek para, odeme veya transfer yoktur.\n\nKomutlar yalnizca bu Wesh Coin kanalinda ve `.` prefixiyle calisir.\n\nOrnek: `.oyun`, `.bakiye`, `.blackjack 250`" }
];
function arcadeHome(member) {
    const entry = user(member);
    return gameEmbed("Wesh Arcade | Oyun Merkezi", [
        "Blackjack, Mayın Tarlası, Slot ve Zar oyunlarını Wesh Coin bakiyenle oyna.",
        "",
        `💰 **Wesh Coin bakiyesi:** ${format(entry.balance)} coin`,
        `🏅 **Oyun puanı:** ${format(entry.gamePoints)} puan`,
        "",
        "Bir oyun düğmesine bas; bahis seçimi yalnızca senin panelinde açılır. Varsayılan bahis: **250 coin**."
    ].join("\n"), 0x5865F2);
}
function arcadeButtons(ownerId = null) {
    const suffix = ownerId ? `:${ownerId}` : "";
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arcade:start:blackjack${suffix}`).setLabel("Blackjack").setEmoji("💵").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`arcade:start:mines${suffix}`).setLabel("Mayın Tarlası").setEmoji("💣").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`arcade:start:slots${suffix}`).setLabel("Slot Makinesi").setEmoji("🎰").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`arcade:start:dice${suffix}`).setLabel("Zar Oyunu").setEmoji("🎲").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`arcade:profile${suffix}`).setLabel("Cüzdanım").setStyle(ButtonStyle.Secondary)
    )];
}
arcadeHelpPages.splice(0, arcadeHelpPages.length,
    { label: "Klasik Oyunlar", emoji: "🎮", color: 0x5865F2, description: "**Blackjack**\n`.blackjack 250` ile bahisli kart oyunu.\n\n**Mayın Tarlası**\n`.mines 250` ile kare aç, mayından kaç ve kazancını çek.\n\n**Slot Makinesi**\n`.slot 250` ile sembolleri çevir.\n\n**Zar Oyunu**\n`.zar 250` ile krupiyeden yüksek zar atmaya çalış." },
    { label: "Canlı ve Toplama", emoji: "✈️", color: 0xE67E22, description: "**Tower**\n`.tower 100` ile 8 katlı risk oyununa gir; kapılardan birini seç veya kazancını al.\n\n**Aviator**\n`.aviator 100` ile hareketli uçuş kartında katsayı yükselirken düşmeden çık.\n\n**Balık Tutma**\n`.balik` ile 45 saniyelik beklemeyle rastgele Wesh Coin kazan.\n\n**Madencilik**\n`.maden` ile 60 saniyelik beklemeyle Wesh Coin ve oyun puanı kazan." },
    { label: "Banka ve İşletme", emoji: "🏦", color: 0x1F2A44, description: "`.hesapolustur` ile kartını oluştur.\n`.kartim` ile güncel Wesh Coin kartını gör.\n`.gonder @uye 250` ile başka üyeye coin gönder.\n`.sirket` ile işletme kur, şube aç ve gelir topla.\n\nBanka, şirket ve oyun bakiyesi yalnızca **Wesh Coin** olarak geçerlidir." },
    { label: "Oyun Ses Ödülleri", emoji: "🎧", color: 0x57F287, description: "Ayarlı oyun ses odalarında aktif ve mikrofonsuz susturulmadan kal.\n\nHer **30 dakikada** bir Wesh Coin ve oyun puanı kazanma şansın vardır.\n\nKazanılanlar yalnızca **Wesh Coin** olarak geçerlidir." },
    { label: "Güvenli Kullanım", emoji: "🛡️", color: 0xED4245, description: "Bu sistem tamamen sanaldır; gerçek para, ödeme veya transfer yoktur.\n\nKomutlar yalnızca bu Wesh Coin kanalında ve `.` prefixiyle çalışır.\n\nÖrnek: `.oyun`, `.kartim`, `.gonder @uye 250`" }
);
function arcadeHelpEmbed(index = 0) {
    const page = arcadeHelpPages[index];
    return new EmbedBuilder().setColor(page.color).setTitle(`${page.emoji} Wesh Arcade | Bilgi Merkezi`)
        .setDescription(`### ${page.label}\n${page.description}`)
        .setFooter({ text: `Bilgi ${index + 1}/${arcadeHelpPages.length} • Kategori secmek icin alttaki listeyi kullan.` }).setTimestamp();
}
function arcadeHelpComponents(index = 0) {
    return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("arcade-help:category").setPlaceholder("Bilgi kategorisi sec").addOptions(arcadeHelpPages.map((page, pageIndex) => ({ label: page.label, value: String(pageIndex), emoji: page.emoji, default: pageIndex === index }))))];
}
function betButtons(type) { return [new ActionRowBuilder().addComponents(...[100, 250, 500, 1000].map(amount => new ButtonBuilder().setCustomId(`arcade:bet:${type}:${amount}`).setLabel(`${amount} kredi`).setStyle(ButtonStyle.Secondary)))]; }
function blackjackEmbed(s, status) { return gameEmbed("💵 Blackjack", [`• Oyuncu: <@${s.userId}>`, `• Bahis: **${format(s.bet)} kredi**`, "", `**Sen (${handValue(s.player)})**\n${s.player.join("  ")}`, "", `**Krupi̇ye (${status === "playing" ? "?" : handValue(s.dealer)})**\n${status === "playing" ? `${s.dealer[0]}  🂠` : s.dealer.join("  ")}`, "", status === "playing" ? "Kart çek veya bekle." : status].join("\n"), status === "playing" ? 0x5865F2 : 0x57F287); }
function blackjackButtons(id) { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bj:hit:${id}`).setLabel("Kart çek").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`bj:stand:${id}`).setLabel("Bekle").setStyle(ButtonStyle.Secondary))]; }
function minesButtons(s, ended = false) { const rows = []; for (let row = 0; row < 4; row++) rows.push(new ActionRowBuilder().addComponents(...Array.from({ length: 5 }, (_, col) => { const index = row * 5 + col; const open = s.opened.includes(index); const mine = s.mines.includes(index); return new ButtonBuilder().setCustomId(`mines:pick:${s.id}:${index}`).setLabel(open ? (mine ? "💣" : "✨") : "?").setStyle(open && mine ? ButtonStyle.Danger : open ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(ended || open); }))); rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mines:cash:${s.id}`).setLabel("Çekil").setStyle(ButtonStyle.Primary).setDisabled(ended))); return rows; }
function minesEmbed(s, text = "Bir kare seç veya kazancını çek.", color = 0x2B2D31) { const multiplier = config.game.mines.baseMultiplier + s.opened.length * config.game.mines.stepMultiplier; return gameEmbed("💣 Mayın Tarlası", [`• Oyuncu: <@${s.userId}>`, `• Bahis: **${format(s.bet)} kredi**`, `• Mayın: **${s.mines.length}**`, `• Açılan kare: **${s.opened.length}**`, `• Şu anki kazanç: **${format(s.bet * multiplier)} kredi**`, "", text].join("\n"), color); }
function slotSymbols() { const set = ["🍒", "🍋", "💎", "🔔", "7️⃣"]; return [set[Math.floor(Math.random() * set.length)], set[Math.floor(Math.random() * set.length)], set[Math.floor(Math.random() * set.length)]]; }
function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
function slotEmbed(userMention, bet, symbols, caption, color = 0x2B2D31) { return gameEmbed("🎰 Slot Makinesi", [`• Oyuncu: ${userMention}`, `• Bahis: **${format(bet)} kredi**`, "", `┌─────────────┐\n│ ${symbols.join("  |  ")} │\n└─────────────┘`, "", caption].join("\n"), color); }

function betButtons(type, ownerId) {
    return [new ActionRowBuilder().addComponents(...[100, 250, 500, 1000].map(amount => new ButtonBuilder().setCustomId(`arcade:bet:${type}:${amount}:${ownerId}`).setLabel(`${amount} coin`).setStyle(ButtonStyle.Secondary)))];
}
function diceEmbed(player, dealer, bet, payout, balance) {
    const won = payout > 0; const draw = player === dealer;
    const result = draw ? "Berabere: bahsin iade edildi." : won ? "Kazandın!" : "Krupiye kazandı.";
    return gameEmbed("🎲 Zar Oyunu", `Senin zarın: **${player}**\nKrupiyenin zarı: **${dealer}**\nBahis: **${format(bet)} coin**\n\n${result}\nKazanç: **${format(payout)} coin**\nYeni bakiye: **${format(balance)} coin**`, draw ? 0xFEE75C : won ? 0x57F287 : 0xED4245);
}
async function startGame(interaction, type, bet) {
    const entry = user(interaction.member); const amount = validBet(entry, bet);
    if (!amount) return interaction.reply({ content: `Bahis ${config.game.minimumBet}-${config.game.maximumBet} arasında ve bakiyenden düşük olmalı.`, ephemeral: true });
    entry.balance -= amount; save();
    if (type === "dice") {
        const player = 1 + Math.floor(Math.random() * 6); const dealer = 1 + Math.floor(Math.random() * 6);
        const payout = player === dealer ? amount : player > dealer ? amount * 2 : 0;
        settle(entry, amount, payout);
        return interaction.update({ embeds: [diceEmbed(player, dealer, amount, payout, entry.balance)], components: arcadeButtons(interaction.user.id) });
    }
    if (type === "slots") {
        await interaction.update({ embeds: [slotEmbed(interaction.user, amount, ["🎰", "🎰", "🎰"], "Çarklar dönüyor... 1/3")], components: [] });
        await wait(450); await interaction.editReply({ embeds: [slotEmbed(interaction.user, amount, slotSymbols(), "Çarklar dönüyor... 2/3")], components: [] });
        await wait(450); const symbols = slotSymbols(); const same = symbols[0] === symbols[1] && symbols[1] === symbols[2]; const pair = !same && (symbols[0] === symbols[1] || symbols[1] === symbols[2] || symbols[0] === symbols[2]); const payout = same ? amount * (symbols[0] === "7️⃣" ? config.game.slots.jackpotMultiplier : config.game.slots.tripleMultiplier) : pair ? amount * config.game.slots.pairMultiplier : 0; settle(entry, amount, payout); return interaction.editReply({ embeds: [slotEmbed(interaction.user, amount, symbols, payout ? `✅ Kazanç: **${format(payout)} coin**\nYeni bakiye: **${format(entry.balance)} coin**` : `❌ Bu tur kazanamadın.\nYeni bakiye: **${format(entry.balance)} coin**`, payout ? 0x57F287 : 0xED4245)], components: arcadeButtons(interaction.user.id) });
    }
    const id = randomId(type === "blackjack" ? "bj" : "mines");
    const s = type === "blackjack" ? { id, type, userId: interaction.user.id, bet: amount, player: [card(), card()], dealer: [card(), card()], expiresAt: Date.now() + SESSION_MS } : { id, type, userId: interaction.user.id, bet: amount, mines: [], opened: [], expiresAt: Date.now() + SESSION_MS };
    if (type === "mines") { while (s.mines.length < config.game.mines.mineCount) { const index = Math.floor(Math.random() * config.game.mines.cells); if (!s.mines.includes(index)) s.mines.push(index); } }
    state.sessions[id] = s; save();
    const blackjack = type === "blackjack"; return interaction.update({ embeds: [blackjack ? blackjackEmbed(s, "playing") : minesEmbed(s)], components: blackjack ? blackjackButtons(id) : minesButtons(s) });
}

client.once("ready", async () => {
    console.log(`${config.name} aktif: ${client.user.tag}`);
    const channel = client.channels.cache.get(config.weshCoinChannelId);
    if (!channel?.isTextBased()) return;
    const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const panel = recent?.find(message => message.author.id === client.user.id && message.components.some(row => row.components.some(component => component.customId === "arcade:start:blackjack")));
    const payload = { embeds: [gameEmbed("Wesh Arcade | Oyun Merkezi", "🎮 **Sanal oyun merkezi**\n\nBlackjack, Mayın Tarlası ve Slot oyunlarını butonlardan başlat. Oyun kredisi ve oyun puanlari yalnizca General 2'de tutulur.\n\n⚠️ Gerçek para, ödeme veya transfer yoktur." , 0x5865F2)], components: arcadeButtons() };
    payload.embeds = [gameEmbed("Wesh Arcade | Oyun Merkezi", "🎮 **Sanal oyun merkezi**\n\nBlackjack, Mayın Tarlası, Slot ve Zar oyunlarını Wesh Coin ile başlat. Oyun panelleri yalnızca oyunu açan üye tarafından kullanılabilir.\n\n⚠️ Gerçek para, ödeme veya transfer içermez.", 0x5865F2)];
    if (panel) await panel.edit(payload).catch(() => {}); else await channel.send(payload).catch(() => {});
    const helpPanel = recent?.find(message => message.author.id === client.user.id && message.components.some(row => row.components.some(component => component.customId === "arcade-help:category")));
    const helpPayload = { embeds: [arcadeHelpEmbed()], components: arcadeHelpComponents() };
    if (helpPanel) await helpPanel.edit(helpPayload).catch(() => {}); else await channel.send(helpPayload).catch(() => {});
    processVoiceRewards();
    setInterval(processVoiceRewards, 5 * 60_000);
});
client.on("interactionCreate", async interaction => {
    if (!interaction.guild || interaction.channelId !== config.weshCoinChannelId) return;
    if (interaction.isButton() && interaction.customId.startsWith("e-marriage:")) {
        const [, action, proposalId] = interaction.customId.split(":"); const proposal = state.proposals[proposalId];
        if (!proposal || proposal.targetId !== interaction.user.id || proposal.status !== "pending") return interaction.reply({ content: "Bu teklif artik gecersiz.", ephemeral: true });
        proposal.status = action === "accept" ? "accepted" : "rejected";
        if (action === "accept") { state.marriages[proposal.authorId] = { partnerId: proposal.targetId, ringId: proposal.ringId, since: Date.now() }; state.marriages[proposal.targetId] = { partnerId: proposal.authorId, ringId: proposal.ringId, since: Date.now() }; }
        save(); return interaction.update({ content: action === "accept" ? `💞 Tebrikler <@${proposal.authorId}> ve <@${proposal.targetId}>!` : "Evlilik teklifi reddedildi.", embeds: [], components: [] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === "arcade-help:category") {
        const page = Number(interaction.values[0]);
        return interaction.update({ embeds: [arcadeHelpEmbed(page)], components: arcadeHelpComponents(page) });
    }
    if (interaction.isButton() && interaction.customId === "bank:open") {
        const account = createBank(interaction.member);
        if (account) return interaction.reply({ ...(await bankCardPayload(interaction.member, account, "🎉 Banka Hesabın Açıldı")), ephemeral: true });
        return interaction.reply({ ...(await bankCardPayload(interaction.member, bank(interaction.member))), ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId === "bank:card") { const account = bank(interaction.member); return account ? interaction.reply({ ...(await bankCardPayload(interaction.member, account)), ephemeral: true }) : interaction.reply({ embeds: [gameEmbed("Banka hesabı gerekli", "Önce kişisel banka kartını oluşturmalısın.")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bank:open").setLabel("Hesap oluştur").setStyle(ButtonStyle.Success))], ephemeral: true }); }
    if (interaction.isButton() && interaction.customId === "bank:business:collect") {
        const record = company(interaction.member); const account = bank(interaction.member); if (!record || !account) return interaction.reply({ content: "Önce banka hesabı ve şirket oluşturmalısın.", ephemeral: true });
        const earned = availableIncome(record); if (!earned) return interaction.reply({ content: "Henüz toplanacak kazanç yok.", ephemeral: true }); account.bankBalance += earned; record.lastCollectedAt = Date.now(); save(); return interaction.update({ embeds: [companyEmbed(interaction.member, record)], components: companyButtons(record) });
    }
    if (interaction.isButton() && interaction.customId === "bank:business:expand") {
        const record = company(interaction.member); if (!record) return interaction.reply({ content: "Önce şirket kurmalısın.", ephemeral: true });
        const choices = Object.entries(config.game.business.types).map(([id, item]) => new ButtonBuilder().setCustomId(`bank:business:add:${id}`).setLabel(`${item.label} • ${format(item.cost)}`).setStyle(ButtonStyle.Primary));
        return interaction.reply({ embeds: [gameEmbed("🏬 Yeni Şube Aç", "İşletme türünü seç. Yeni şube maliyeti oyun cüzdanından düşer ve saatlik geliri artırır.")], components: [new ActionRowBuilder().addComponents(...choices)], ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId === "bank:business:info") { const record = company(interaction.member); return interaction.reply({ embeds: [companyEmbed(interaction.member, record)], ephemeral: true }); }
    if (interaction.isButton() && interaction.customId === "bank:business:loan") {
        const record = company(interaction.member); if (!record) return interaction.reply({ content: "Kredi için önce şirket kurmalısın.", ephemeral: true });
        const choices = config.game.business.loans.filter(item => item.minimumBusinessLevel <= record.level);
        const buttons = choices.map(item => new ButtonBuilder().setCustomId(`bank:loan:${item.id}`).setLabel(`${item.label} • ${format(item.amount)}`).setStyle(ButtonStyle.Primary));
        return interaction.reply({ embeds: [gameEmbed("🏦 Şirket Kredileri", "Bir kredi seçtiğinde tutar banka hesabına yatırılır. Vade sonunda tutar + işlem bedeli tek seferde geri ödenir.")], components: [new ActionRowBuilder().addComponents(...buttons)], ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith("bank:loan:")) {
        const id = interaction.customId.split(":")[2]; const record = company(interaction.member); const account = bank(interaction.member); const option = config.game.business.loans.find(item => item.id === id);
        if (!record || !account || !option || state.loans[interaction.user.id]) return interaction.reply({ content: "Bu kredi şu anda kullanılamaz veya aktif borcun var.", ephemeral: true });
        account.bankBalance += option.amount; state.loans[interaction.user.id] = { id, remaining: option.amount + option.fee, borrowedAt: Date.now() }; save(); return interaction.update({ embeds: [gameEmbed("✅ Kredi Onaylandı", `**${option.label}** hesabına yatırıldı.\nYatırılan: **${format(option.amount)} kredi**\nToplam geri ödeme: **${format(option.amount + option.fee)} kredi**`)], components: [] });
    }
    if (interaction.isButton() && interaction.customId.startsWith("bank:business:create:")) {
        const typeId = interaction.customId.split(":")[3]; const type = config.game.business.types[typeId]; const account = bank(interaction.member); const entry = user(interaction.member);
        if (!account) return interaction.reply({ content: "Şirket kurmadan önce banka hesabı açmalısın.", ephemeral: true });
        if (!type) return interaction.reply({ content: "İşletme türü bulunamadı.", ephemeral: true });
        const fee = company(interaction.member) ? type.cost : config.game.business.creationFee + type.cost;
        if (entry.balance < fee) return interaction.reply({ content: `Bu işletme için ${format(fee)} oyun kredisi gerekli.`, ephemeral: true });
        entry.balance -= fee; const record = { name: `${interaction.member.displayName} Holding`, type: typeId, typeLabel: type.label, branches: [type.label], level: 1, hourlyIncome: type.hourlyIncome, createdAt: Date.now(), lastCollectedAt: Date.now() }; state.businesses[interaction.user.id] = record; account.corporateCard ||= cardNumber(); save(); return interaction.update({ embeds: [gameEmbed("🏢 Şirket Kuruldu", [`**${record.name}** artık faaliyette.`, `İşletme: **${type.label}**`, `Saatlik gelir: **${format(type.hourlyIncome)} kredi**`, `Şirket kartın: \`${account.corporateCard}\``].join("\n"), 0x57F287)], components: companyButtons(record) });
    }
    if (interaction.isButton() && interaction.customId.startsWith("bank:business:add:")) {
        const typeId = interaction.customId.split(":")[3]; const type = config.game.business.types[typeId]; const record = company(interaction.member); const entry = user(interaction.member);
        if (!record || !type || entry.balance < type.cost) return interaction.reply({ content: "Bu şube için yeterli oyun kredin yok.", ephemeral: true });
        entry.balance -= type.cost; record.branches ||= [record.typeLabel]; record.branches.push(type.label); record.level += 1; record.hourlyIncome += type.hourlyIncome; save(); return interaction.update({ embeds: [companyEmbed(interaction.member, record)], components: companyButtons(record) });
    }
    if (interaction.isButton() && interaction.customId.startsWith("arcade:")) {
        const parts = interaction.customId.split(":"); const ownerId = parts[parts.length - 1].match(/^\d{16,20}$/) ? parts[parts.length - 1] : null;
        if (ownerId && ownerId !== interaction.user.id) return interaction.reply({ content: "Bu oyun paneli yalnızca oyunu başlatan üyeye ait.", ephemeral: true });
        if (parts[1] === "profile") return interaction.reply({ embeds: [arcadeHome(interaction.member)], ephemeral: true });
        if (parts[1] === "start") {
            const type = parts[2];
            if (!['blackjack', 'mines', 'slots', 'dice'].includes(type)) return interaction.reply({ content: "Oyun türü bulunamadı.", ephemeral: true });
            const titles = { blackjack: "💵 Blackjack", mines: "💣 Mayın Tarlası", slots: "🎰 Slot Makinesi", dice: "🎲 Zar Oyunu" };
            return interaction.reply({ embeds: [gameEmbed(titles[type], "Bahisini seç. Bu panelde yalnızca sen işlem yapabilirsin; Wesh Coin bakiyen kullanılır.")], components: betButtons(type, interaction.user.id), ephemeral: true });
        }
        if (parts[1] === "bet") {
            const [, , type, bet, boundUserId] = parts;
            if (boundUserId !== interaction.user.id) return interaction.reply({ content: "Bu bahis paneli sana ait değil.", ephemeral: true });
            return startGame(interaction, type, bet);
        }
        return interaction.reply({ content: "Bu oyun paneli artık kullanılamıyor.", ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId === "arcade:profile") return interaction.reply({ embeds: [arcadeHome(interaction.member)], ephemeral: true });
    if (interaction.isButton() && interaction.customId === "arcade:sync") return interaction.reply({ content: "General 1 ve General 2 puanlari ayridir. Ayarli oyun ses odalarinda aktif kaldiginda her 30 dakikada bir oyun kredisi ve puani kazanma sansin olur.", ephemeral: true });
    if (interaction.isButton() && interaction.customId === "arcade:sync") { const result = syncGeneralOneBonus(interaction.member); return interaction.reply({ content: result.status === "cooldown" ? "General 1 bonusunu bugün zaten senkronladın." : result.gained ? `🏅 **${format(result.gained)} oyun kredisi** hesabına eklendi.` : "Yeni General 1 bonusu bulunmuyor.", ephemeral: true }); }
    if (interaction.isButton() && interaction.customId.startsWith("arcade:start:")) { const type = interaction.customId.split(":")[2]; return interaction.update({ embeds: [gameEmbed(type === "mines" ? "💣 Mayın Tarlası" : type === "blackjack" ? "💵 Blackjack" : "🎰 Slot Makinesi", "Bahisini seç. Oyun kredisi General 1 coinlerinden ayrıdır.")], components: betButtons(type) }); }
    if (interaction.isButton() && interaction.customId.startsWith("arcade:bet:")) { const [, , type, bet] = interaction.customId.split(":"); return startGame(interaction, type, bet); }
    if (!interaction.isButton()) return;
    const [, action, id, extra] = interaction.customId.split(":"); const s = session(id);
    if (!s) return interaction.reply({ content: "Bu oyun oturumu sona erdi. Yeni oyun başlatabilirsin.", ephemeral: true });
    if (interaction.user.id !== s.userId) return interaction.reply({ content: "Bu oyun başka bir üyeye ait.", ephemeral: true });
    const entry = user(interaction.member);
    if (s.type === "blackjack") {
        if (action === "hit") { await interaction.update({ embeds: [blackjackEmbed(s, "🎴 Kart dağıtılıyor...")], components: [] }); await wait(350); s.player.push(card()); if (handValue(s.player) > 21) { delete state.sessions[id]; settle(entry, s.bet, 0); return interaction.editReply({ embeds: [blackjackEmbed(s, `❌ ${handValue(s.player)} ile battın. Yeni bakiye: ${format(entry.balance)} kredi.`)], components: [] }); } save(); return interaction.editReply({ embeds: [blackjackEmbed(s, "playing")], components: blackjackButtons(id) }); }
        if (action === "stand") { while (handValue(s.dealer) < 17) s.dealer.push(card()); const player = handValue(s.player); const dealer = handValue(s.dealer); const payout = player === 21 && s.player.length === 2 ? s.bet * config.game.blackjack.blackjackMultiplier : dealer > 21 || player > dealer ? s.bet * config.game.blackjack.winMultiplier : player === dealer ? s.bet * config.game.blackjack.pushMultiplier : 0; delete state.sessions[id]; settle(entry, s.bet, payout); const result = payout ? (player === dealer ? "➖ Berabere" : "✅ Kazandın") : "❌ Krupiye kazandı"; return interaction.update({ embeds: [blackjackEmbed(s, `${result}! Kazanç: ${format(payout)} kredi\nYeni bakiye: ${format(entry.balance)} kredi.`)], components: [] }); }
    }
    if (s.type === "mines") {
        if (action === "pick") { const cell = Number(extra); if (!Number.isInteger(cell) || s.opened.includes(cell)) return interaction.deferUpdate(); s.opened.push(cell); if (s.mines.includes(cell)) { delete state.sessions[id]; settle(entry, s.bet, 0); return interaction.update({ embeds: [minesEmbed(s, `❌ Mayına bastın. Yeni bakiye: ${format(entry.balance)} kredi.`, 0xED4245)], components: minesButtons(s, true) }); } save(); return interaction.update({ embeds: [minesEmbed(s)], components: minesButtons(s) }); }
        if (action === "cash") { const multiplier = config.game.mines.baseMultiplier + s.opened.length * config.game.mines.stepMultiplier; const payout = Math.floor(s.bet * multiplier); delete state.sessions[id]; settle(entry, s.bet, payout); return interaction.update({ embeds: [minesEmbed(s, `✅ Çekildin! Kazanç: ${format(payout)} kredi\nYeni bakiye: ${format(entry.balance)} kredi.`, 0x57F287)], components: minesButtons(s, true) }); }
    }
});
client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild || message.channelId !== config.weshCoinChannelId) return;
    if (alreadyProcessed(message.id)) return;
    const prefix = config.prefix || "."; if (!message.content.startsWith(prefix)) return;
    const [command, rawBet] = message.content.slice(prefix.length).trim().toLowerCase().split(/\s+/); const member = message.member;
    const words = message.content.slice(prefix.length).trim().split(/\s+/);
    if (["coin", "cuzdan", "cüzdan", "bakiye", "bal", "kart", "kartim", "kartım"].includes(command)) {
        const account = createBank(member) || bank(member);
        return message.channel.send(await bankCardPayload(member, account));
    }
    if (["gonder", "gönder", "transfer", "pay"].includes(command)) {
        const recipient = message.mentions.members.first(); const amount = words[2];
        if (!recipient || recipient.user.bot || recipient.id === member.id) return message.channel.send("Kullanım: `.gonder @uye 250`");
        const result = transferCoins(member, recipient, amount);
        if (!result.ok) return message.channel.send(result.reason === "balance" ? `Yeterli Wesh Coin yok. Güncel bakiyen: **${format(result.balance)} coin**.` : "Gönderilecek miktar pozitif tam sayı olmalı.");
        return message.channel.send(`✅ ${recipient} kullanıcısına **${format(result.amount)} Wesh Coin** gönderildi. Güncel bakiyen: **${format(result.balance)} coin**.`);
    }
    if (["yardim", "yardım", "bilgi", "komutlar"].includes(command)) return message.channel.send({ embeds: [arcadeHelpEmbed()], components: arcadeHelpComponents() });
    if (["coin", "cuzdan", "cüzdan"].includes(command)) { const entry = economy.user(member.id, message.author.tag); return message.channel.send({ embeds: [gameEmbed("Wesh Coin | Cuzdan", `Bakiye: **${format(entry.coins)} coin**\nEnvanter: **${entry.inventory.length} esya**\n\nKart ve borc icin \`.kart\` yaz.`, 0x2B2D31)] }); }
    if (["kart", "kredikarti", "kredikartı"].includes(command)) return message.channel.send({ embeds: [economyCard(member)] });
    if (command === "karttanpara") { const result = economy.chargeCreditCard(member.id, message.author.tag, rawBet); if (!result.ok) return message.channel.send(`Miktar kullanilabilir kart limitini (**${format(result.availableLimit)}**) asmamali.`); economy.addCoins(member.id, message.author.tag, result.charge); return message.channel.send(`Karttan **${format(result.charge)} coin** yuklendi. Borc: **${format(result.card.debt)} coin**.`); }
    if (command === "kartode") { const result = economy.repayCreditCard(member.id, message.author.tag, rawBet); return message.channel.send(result.ok ? `**${format(result.payment)} coin** odendi. Kalan borc: **${format(result.card.debt)} coin**.` : "Odeme icin yeterli coin veya borc yok."); }
    if (command === "borctaksitlendir") { const result = economy.installmentCreditCardDebt(member.id, message.author.tag, rawBet); return message.channel.send(result.ok ? `Borcun **${result.card.installmentPlan.count} haftalik taksite** bolundu.` : "Acik borcun olmali; taksit sayisi 1-8 arasinda olmali."); }
    if (["is", "iş", "work", "calis", "çalış"].includes(command)) return startEconomyWork(message);
    if (["magaza", "mağaza"].includes(command)) return message.channel.send({ embeds: [economyStore(member)] });
    if (["envanter", "inventory"].includes(command)) { const entry = economy.user(member.id, message.author.tag); return message.channel.send(`Envanter: ${entry.inventory.length ? entry.inventory.map(id => config.economy.store.find(item => item.id === id)?.name || id).join(", ") : "bos"}`); }
    if (["satinal", "satınal"].includes(command)) { const result = economy.completePurchase(member.id, message.author.tag, rawBet); return message.channel.send(result.ok ? `✅ **${result.item.name}** envanterine eklendi.` : "Satin alma yapilamadi: bakiye yetersiz, kod gecersiz veya urun zaten sende."); }
    if (["evlen", "evlilik"].includes(command)) { const partner = message.mentions.members.first(); const ringId = message.content.slice(prefix.length).trim().split(/\s+/)[2]; const entry = economy.user(member.id, message.author.tag); if (!partner || partner.user.bot || partner.id === member.id || !entry.inventory.includes(ringId) || state.marriages[member.id] || state.marriages[partner.id]) return message.channel.send("Kullanim: `.evlen @uye ring_common` (yuzuk envanterinde olmali, taraflar bekar olmali)."); const id = randomId("marriage"); state.proposals[id] = { authorId: member.id, targetId: partner.id, ringId, status: "pending" }; save(); return message.channel.send({ content: `${partner}, ${member} sana evlilik teklifi ediyor!`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`e-marriage:accept:${id}`).setLabel("Kabul et").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`e-marriage:reject:${id}`).setLabel("Reddet").setStyle(ButtonStyle.Danger))] }); }
    if (["evliligim", "evliliğim"].includes(command)) { const marriage = state.marriages[member.id]; return message.channel.send(marriage ? `Esin: <@${marriage.partnerId}> • Baslangic: <t:${Math.floor(marriage.since / 1000)}:D>` : "Su anda evli degilsin."); }
    // Oyuncunun komutu kendi mesajında kalır; oyun paneli ayrı bot mesajı olarak gönderilir.
    if (["hesapolustur", "hesap", "bank", "banka"].includes(command)) { const account = createBank(member) || bank(member); return message.channel.send(await bankCardPayload(member, account, "🎉 Banka Hesabın Açıldı")); }
    if (["kart", "kartim", "kartım"].includes(command)) { const account = bank(member); return account ? message.channel.send(await bankCardPayload(member, account)) : message.channel.send({ embeds: [gameEmbed("Banka hesabı gerekli", "Kişisel kartın için önce `.hesapolustur` yaz.")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bank:open").setLabel("Hesap oluştur").setStyle(ButtonStyle.Success))] }); }
    if (["sirket", "şirket", "isletme", "işletme"].includes(command)) { const record = company(member); return message.channel.send({ embeds: [companyEmbed(member, record)], components: companyButtons(record) }); }
    if (["oyun", "arcade", "panel"].includes(command)) return message.channel.send({ embeds: [arcadeHome(member)], components: arcadeButtons() });
    if (["bakiye", "bal", "cuzdan", "cüzdan"].includes(command)) { const account = bank(member); return account ? message.channel.send(await bankCardPayload(member, account)) : message.channel.send({ embeds: [gameEmbed("Banka kartın yok", "Bakiye kartını kullanmak için önce `.hesapolustur` ile hesap açmalısın.")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("bank:open").setLabel("Hesap oluştur").setStyle(ButtonStyle.Success))] }); }
    if (["senkron", "sync", "odul"].includes(command)) { const result = syncGeneralOneBonus(member); return message.channel.send(result.status === "cooldown" ? "General 1 bonus senkronunu bugün zaten kullandın; yarın tekrar deneyebilirsin." : result.gained ? `🏅 General 1 ilerlemenden **${format(result.gained)} oyun kredisi** kazandın. Güncel bonus seviyen: **${format(result.target)}**.` : "General 1 ilerlemenden yeni oyun bonusu oluşmamış; yeni coin veya rank puanı kazandığında tekrar dene."); }
    if (["tower", "kule"].includes(command)) return startTower(message, rawBet);
    if (["aviator", "ucak", "uçak"].includes(command)) return startAviator(message, rawBet);
    if (["balik", "balık", "fish"].includes(command)) return gather(message, "fish");
    if (["maden", "kaz"].includes(command)) return gather(message, "mine");
    const types = { blackjack: "blackjack", bj: "blackjack", mines: "mines", mayin: "mines", "mayın": "mines", slot: "slots", slots: "slots" };
    types.zar = "dice"; types.dice = "dice";
    if (types[command]) { const entry = user(member); const bet = validBet(entry, rawBet || 250); if (!bet) return message.channel.send(`Bahis ${config.game.minimumBet}-${config.game.maximumBet} arasında ve bakiyenden düşük olmalı.`); const prompt = await message.channel.send({ embeds: [gameEmbed("Wesh Arcade", `**${types[command]}** için bahis: **${format(bet)} coin**\nBaşlatmak için düğmeye bas.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`arcade:bet:${types[command]}:${bet}:${message.author.id}`).setLabel("Oyunu başlat").setStyle(ButtonStyle.Success))] }); setTimeout(() => prompt.edit({ components: [] }).catch(() => {}), 60_000); }
});

client.login(process.env[config.tokenName]);
