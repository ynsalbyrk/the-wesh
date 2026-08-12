const fs = require("fs");
const path = require("path");
const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require("discord.js");

module.exports = function attachCommunityTools({ client, dataDirectory, prefix, staffRoleId, isStaff, audit, logger }) {
    const file = path.join(dataDirectory, "community-tools.json");
    let state;
    try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch { state = { tickets: {}, announcements: [] }; }
    state.tickets ||= {}; state.announcements ||= [];
    const save = () => {
        fs.mkdirSync(dataDirectory, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), "utf8");
        fs.renameSync(`${file}.tmp`, file);
    };
    const staff = member => Boolean(member && (isStaff(member) || member.permissions.has(PermissionsBitField.Flags.ManageGuild)));
    const temporary = (message, text) => message.channel.send(text).then(sent => setTimeout(() => sent.delete().catch(() => {}), 15_000)).catch(() => {});
    const panel = (title, text, customId, label, style) => ({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(text)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style))]
    });
    async function category(guild) {
        return guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === "destek-talepleri") || guild.channels.create({ name: "destek-talepleri", type: ChannelType.GuildCategory, reason: "Destek sistemi" });
    }
    async function dueAnnouncements() {
        const due = state.announcements.filter(item => item.status === "pending" && item.at <= Date.now());
        for (const item of due) {
            const channel = await client.channels.fetch(item.channelId).catch(() => null);
            if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle("Planlı duyuru").setDescription(item.text).setTimestamp()] }).catch(() => {});
            item.status = "sent"; item.sentAt = Date.now();
            audit(item.guildId, "scheduled_announcement_sent", client.user?.id || null, null, { announcementId: item.id, channelId: item.channelId });
        }
        if (due.length) save();
    }
    client.once("ready", () => {
        dueAnnouncements().catch(error => logger(`Duyuru görevi: ${error.message}`));
        setInterval(() => dueAnnouncements().catch(error => logger(`Duyuru görevi: ${error.message}`)), 30_000);
    });
    client.on("interactionCreate", async interaction => {
        if (!interaction.isButton() || !interaction.customId.startsWith("community:")) return;
        try {
            const [, kind, action, value] = interaction.customId.split(":");
            if (kind === "ticket" && action === "create") {
                const existing = Object.values(state.tickets).find(ticket => ticket.guildId === interaction.guild.id && ticket.ownerId === interaction.user.id && ticket.status === "open");
                if (existing) return interaction.reply({ content: `Zaten açık bir talebin var: <#${existing.channelId}>`, ephemeral: true });
                if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: "Bot için **Kanalları Yönet** izni gerekli.", ephemeral: true });
                const channel = await interaction.guild.channels.create({
                    name: `talep-${interaction.user.id.slice(-6)}`,
                    type: ChannelType.GuildText,
                    parent: (await category(interaction.guild)).id,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                        ...(staffRoleId ? [{ id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : [])
                    ]
                });
                state.tickets[channel.id] = { guildId: interaction.guild.id, channelId: channel.id, ownerId: interaction.user.id, status: "open", createdAt: Date.now() }; save();
                audit(interaction.guild.id, "ticket_opened", interaction.user.id, interaction.user.id, { channelId: channel.id });
                await channel.send(panel("Destek talebin açıldı", `${interaction.user}, talebini ayrıntılı biçimde yaz. Kapatıldığında geçmiş korunur.`, `community:ticket:close:${channel.id}`, "Talebi kapat", ButtonStyle.Danger));
                return interaction.reply({ content: `Destek kanalın hazır: ${channel}`, ephemeral: true });
            }
            if (kind === "ticket" && action === "close") {
                const ticket = state.tickets[value];
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Bu talep zaten kapalı.", ephemeral: true });
                if (ticket.ownerId !== interaction.user.id && !staff(member)) return interaction.reply({ content: "Bu talebi yalnızca sahibi veya yetkili kapatabilir.", ephemeral: true });
                ticket.status = "closed"; ticket.closedAt = Date.now(); ticket.closedBy = interaction.user.id; save();
                await interaction.channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: false }).catch(() => {});
                await interaction.channel.setName(`kapali-${interaction.channel.name}`.slice(0, 100)).catch(() => {});
                audit(interaction.guild.id, "ticket_closed", interaction.user.id, ticket.ownerId, { channelId: interaction.channel.id });
                return interaction.update({ content: `🔒 Talep ${interaction.user} tarafından kapatıldı.`, embeds: [], components: [] });
            }
            if (kind === "role") {
                const role = interaction.guild.roles.cache.get(value);
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (!role) return interaction.reply({ content: "Rol artık bulunamadı.", ephemeral: true });
                if (action === "toggle" && member.roles.cache.has(role.id)) await member.roles.remove(role, "Rol paneli"); else await member.roles.add(role, "Rol/doğrulama paneli");
                audit(interaction.guild.id, action === "verify" ? "member_verified" : "self_role_updated", interaction.user.id, interaction.user.id, { roleId: role.id });
                return interaction.reply({ content: `✅ **${role.name}** rolün güncellendi.`, ephemeral: true });
            }
        } catch (error) {
            logger(`Topluluk aracı: ${error.message}`);
            if (!interaction.replied) interaction.reply({ content: "İşlem tamamlanamadı; bot izinlerini kontrol et.", ephemeral: true }).catch(() => {});
        }
    });
    client.on("messageCreate", async message => {
        if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;
        const [command, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
        const name = command?.toLocaleLowerCase("tr-TR");
        if (!["destekpanel", "doğrulamapanel", "dogrulamapanel", "rolpanel", "duyuruplanla", "denetimpanel"].includes(name)) return;
        if (!staff(message.member)) return temporary(message, "Bu komut yalnızca yetkililer içindir.");
        if (name === "destekpanel") return message.channel.send(panel("Destek Merkezi", "Destek talebi açmak için butona bas. Sana özel bir kanal oluşturulur.", "community:ticket:create", "Destek talebi aç", ButtonStyle.Primary));
        if (["doğrulamapanel", "dogrulamapanel", "rolpanel"].includes(name)) {
            const role = message.mentions.roles.first();
            if (!role) return temporary(message, `Kullanım: \`${prefix}${name} @rol [buton_yazısı]\``);
            const verify = name !== "rolpanel"; const label = args.slice(1).join(" ").trim() || (verify ? "Doğrulan" : role.name);
            return message.channel.send(panel(verify ? "Üyelik Doğrulaması" : "Rol Seçimi", verify ? `Katılımı tamamlamak için **${role.name}** rolünü al.` : `**${role.name}** rolünü almak veya kaldırmak için butona bas.`, `community:role:${verify ? "verify" : "toggle"}:${role.id}`, label.slice(0, 80), verify ? ButtonStyle.Success : ButtonStyle.Secondary));
        }
        if (name === "duyuruplanla") {
            const match = message.content.slice(prefix.length).trim().match(/^\S+\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+([\s\S]+)$/);
            if (!match) return temporary(message, `Kullanım: \`${prefix}duyuruplanla 2026-08-02 21:00 Duyuru metni\` (Türkiye saati)`);
            const at = new Date(`${match[1]}T${match[2]}:00+03:00`).getTime();
            if (!Number.isFinite(at) || at <= Date.now()) return temporary(message, "Tarih gelecekte ve `YYYY-AA-GG SS:DD` biçiminde olmalı.");
            const item = { id: `D-${Date.now().toString(36).toUpperCase()}`, guildId: message.guild.id, channelId: message.channel.id, text: match[3], at, status: "pending", createdBy: message.author.id }; state.announcements.push(item); save();
            audit(message.guild.id, "scheduled_announcement_created", message.author.id, null, { announcementId: item.id, channelId: item.channelId, at });
            return temporary(message, `Duyuru **${item.id}** planlandı: <t:${Math.floor(at / 1000)}:F>.`);
        }
        const open = Object.values(state.tickets).filter(ticket => ticket.guildId === message.guild.id && ticket.status === "open").length;
        const pending = state.announcements.filter(item => item.guildId === message.guild.id && item.status === "pending").length;
        return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle("Yetkili Denetim Paneli").addFields({ name: "Açık destek talebi", value: String(open), inline: true }, { name: "Bekleyen duyuru", value: String(pending), inline: true }, { name: "Kayıt", value: "Ticket, rol ve duyuru işlemleri denetim günlüğüne yazılır." })] });
    });
};
