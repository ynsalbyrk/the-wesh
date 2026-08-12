module.exports = {
    name: "Wesh Arcade",
    tokenName: "GENERAL2_TOKEN",
    guildId: "823250104361680948",
    voiceChannelId: "1532752141238931756",
    prefix: ".",
    // Bot 2'nin tum oyun/coin islemleri yalnizca bu Wesh Coin kanalinda calisir.
    weshCoinChannelId: "1536855838294020096",
    gameChannelId: "1536855838294020096",
    game: {
        startingBalance: 1000,
        minimumBet: 50,
        maximumBet: 5000,
        sessionMinutes: 5,
        // General 1 verisi salt okunur bonus olarak kullanilir; oyun botu bu veriyi degistirmez.
        // General 1 ekonomisi ve General 2 oyun puanlari birbirinden ayridir.
        generalOneBonus: { enabled: false, coinDivisor: 10, pointDivisor: 100, maximumBonus: 5000 },
        voiceRewards: {
            // Bu kanallar mevcut oyun/aktiflik odalari olarak tanimlanmistir.
            eligibleVoiceChannelIds: ["823250901585231907", "843726201247498260"],
            intervalMinutes: 30,
            chancePercent: 35,
            minimumReward: 50,
            maximumReward: 150
        },
        mines: { cells: 20, mineCount: 3, baseMultiplier: 1, stepMultiplier: 0.14 },
        blackjack: { blackjackMultiplier: 2.5, winMultiplier: 2, pushMultiplier: 1 },
        slots: { jackpotMultiplier: 8, tripleMultiplier: 3, pairMultiplier: 1.5 }
        ,bank: { openingCash: 500, accountLimit: 1, cardPrefix: "WESH" }
        ,business: {
            creationFee: 5000,
            maxCreditCards: 1,
            types: {
                cafe: { label: "Kafe", cost: 5000, hourlyIncome: 110 },
                club: { label: "Gece Kulübü", cost: 12000, hourlyIncome: 300 },
                refinery: { label: "Petrol Rafinerisi", cost: 30000, hourlyIncome: 850 },
                tech: { label: "Teknoloji Şirketi", cost: 55000, hourlyIncome: 1600 }
            },
            loans: [
                { id: "starter", label: "Başlangıç Kredisi", amount: 5000, fee: 550, minimumBusinessLevel: 1 },
                { id: "growth", label: "Büyüme Kredisi", amount: 20000, fee: 2600, minimumBusinessLevel: 2 },
                { id: "expansion", label: "Genişleme Kredisi", amount: 60000, fee: 9000, minimumBusinessLevel: 3 }
            ]
        }
    }
    ,economy: {
        creditCard: { defaultLimit: 2500, minimumLimit: 500, maximumLimit: 15000, onTimePaymentLimitIncrease: 100, latePaymentLimitDecrease: 150, minimumInstallments: 1, maximumInstallments: 8, installmentIntervalDays: 7 },
        workSystem: { cooldownMs: 2 * 60 * 60_000, panelTimeoutMs: 60_000, levels: [{ label: "Baslangic", minimum: 45, maximum: 100 }, { label: "Deneyimli", minimum: 100, maximum: 180 }, { label: "Usta", minimum: 180, maximum: 300 }] },
        store: [
            { id: "ring_common", name: "Common Ring", cost: 250 },
            { id: "ring_rare", name: "Rare Ring", cost: 750 },
            { id: "ring_epic", name: "Epic Ring", cost: 1500 },
            { id: "ring_legendary", name: "Legendary Ring", cost: 3000 },
            { id: "summer_2026_badge", name: "Yaz 2026 Rozeti", cost: 600 }
        ]
    }
};
