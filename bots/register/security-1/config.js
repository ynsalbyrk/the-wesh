module.exports = {
    name: "Security 1",
    tokenName: "SECURITY1_TOKEN",
    guildId: "823250104361680948",
    voiceChannelId: "1532752141238931756",
    prefix: "!",
    mode: "kanal-koruma",
    logChannelId: "823250983445725184",
    commandChannelId: "823250921022423050",
    moderatorRoleIds: ["823250811562754058"],
    whitelistUserIds: [],
    whitelistRoleIds: ["823250811562754058"],
    features: { antiSpam: false, newAccountGuard: false, antiRaid: true, contentFilter: false, auditProtection: false, manualRaidControls: true, staffModeration: false },
    antiRaid: { joinThreshold: 10, windowSeconds: 60, quarantineMinutes: 60 },
    // Kayıt komut kanalı ve üst yönetim talep merkezi raid kilidinde açık kalır.
    raidExcludedChannelIds: ["846291079737376778", "823250923202674728"],
    quarantineRoleId: ""
};
