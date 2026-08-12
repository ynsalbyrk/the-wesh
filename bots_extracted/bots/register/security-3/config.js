module.exports = {
    name: "Security 3",
    tokenName: "SECURITY3_TOKEN",
    guildId: "823250104361680948",
    voiceChannelId: "1532752141238931756",
    prefix: "!",
    mode: "yeni-hesap-koruma",
    logChannelId: "823250983445725184",
    commandChannelId: "823250921022423050",
    moderatorRoleIds: ["823250811562754058"],
    whitelistUserIds: [],
    whitelistRoleIds: ["823250811562754058"],
    features: { antiSpam: false, newAccountGuard: true, antiRaid: false, contentFilter: false, auditProtection: true, manualRaidControls: false, staffModeration: true },
    newAccountGuard: { minimumAccountAgeDays: 7, timeoutMinutes: 60 },
    auditProtection: { maxActions: 3, timeoutMinutes: 1440 },
    dangerousPermissions: ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "BanMembers", "KickMembers", "MentionEveryone"],
    alertRoleId: "",
    staffModeration: {
        warningExpiryDays: 30,
        escalations: [
            { warnings: 3, timeoutMinutes: 60, label: "1 saat timeout" },
            { warnings: 5, timeoutMinutes: 1440, label: "24 saat timeout" },
            { warnings: 7, timeoutMinutes: 10080, label: "7 gün timeout ve ban inceleme önerisi" }
        ]
    }
};
