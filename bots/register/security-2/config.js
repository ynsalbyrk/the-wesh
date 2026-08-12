module.exports = {
    name: "Security 2",
    tokenName: "SECURITY2_TOKEN",
    guildId: "823250104361680948",
    voiceChannelId: "1532752141238931756",
    prefix: "!",
    mode: "spam-koruma",
    logChannelId: "823250983445725184",
    commandChannelId: "823250921022423050",
    moderatorRoleIds: ["823250811562754058"],
    whitelistUserIds: [],
    whitelistRoleIds: ["823250811562754058"],
    features: { antiSpam: true, newAccountGuard: false, antiRaid: false, contentFilter: true, auditProtection: false, manualRaidControls: false, staffModeration: false },
    antiSpam: { maxMessages: 6, windowSeconds: 10, timeoutMinutes: 10 },
    contentFilter: { blockDiscordInvites: true, blockedDomains: [], blockedWords: [], strikesBeforeTimeout: 2, timeoutMinutes: 30, riskTimeoutMinutes: 60 }
};
