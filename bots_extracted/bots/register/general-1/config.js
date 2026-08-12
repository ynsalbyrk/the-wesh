module.exports = {
    name: "Moderatör A",
    tokenName: "GENERAL1_TOKEN",

    guildId: "823250104361680948",
    prefix: "!",

    // İstatistik komutlarının kullanılacağı metin kanalı.
    statsChannelId: "823250934872277046",
    // Üye komutları Commands'te; üst yönetim komutları burada da kullanılabilir.
    staffCommandChannelId: "823250921022423050",

    // Botun 7/24 bağlı kalacağı ortak ses kanalı.
    voiceChannelId: "1532752141238931756",

    // İstatistiğe dahil edilmeyecek kanallar.
    ignoredTextChannelIds: [
        "823250891251253248"
    ],

    ignoredVoiceChannelIds: [
        "823250907357511721",
        "823250941922639872"
    ],

    // Belirtilmeyen ses kanalları 1 katsayısıyla hesaplanır.
    voiceChannelMultipliers: {
        "823250901585231907": 1.5,
        "843726201247498260": 2
    },

    // Kayıt geçmişi üzerinden kayıt yetkilisi sıralaması.
    registrationSystem: {
        enabled: true,
        historyFile: "kayit-gecmisi.jsonl",
        birthdayRoleId: "829690861331677184",
        birthdayRoleName: "Üye Doğum Günü"
    },

    rankSystem: {
        enabled: true,
        logChannelId: "1532852962823634984",
        eligibleRoleId: "833595781301796896",
        staffRoleId: "823250811562754058",
        moderatorRoleIds: ["823250811562754058"],
        commandCooldownSeconds: 3,
        inactiveStaffDays: 7,
        antiFarm: {
            messageCooldownSeconds: 15,
            maxMessagePointsPerDay: 50,
            minimumInviteAccountAgeDays: 7,
            minimumVoiceMembers: 2
        },
        points: {
            message: 1,
            voiceMinute: 2,
            mutedVoiceMinute: 0.5,
            registration: 25,
            invite: 25
        },
        ranks: [
            { name: "Wêsh Infinity", roleId: "833595781301796896", minimumServerDays: 0, minimumRankDays: 0, minimumTotalPoints: 0, minimumThirtyDayPoints: 0 },
            { name: "Titans Of Wêsh", roleId: "823250778562887731", minimumServerDays: 108, minimumRankDays: 36, minimumTotalPoints: 14400, minimumThirtyDayPoints: 3000 },
            { name: "Gaia Of Wêsh", roleId: "823250776377131028", minimumServerDays: 144, minimumRankDays: 54, minimumTotalPoints: 36000, minimumThirtyDayPoints: 4800 },
            { name: "Senior Of Wêsh", roleId: "823250775705780335", minimumServerDays: 216, minimumRankDays: 72, minimumTotalPoints: 72000, minimumThirtyDayPoints: 7200 },
            { name: "Glory Of Wêsh", roleId: "823250773693562931", minimumServerDays: 288, minimumRankDays: 90, minimumTotalPoints: 120000, minimumThirtyDayPoints: 10200 },
            { name: "Monarch Of 0053", roleId: "823250764595724319", minimumServerDays: 438, minimumRankDays: 108, minimumTotalPoints: 192000, minimumThirtyDayPoints: 13200 },
            { name: "Shiva Of 0053", roleId: "833595756723961886", minimumServerDays: 540, minimumRankDays: 144, minimumTotalPoints: 288000, minimumThirtyDayPoints: 17400 },
            { name: "Fortune Of 0053", roleId: "823250759751041044", minimumServerDays: 648, minimumRankDays: 180, minimumTotalPoints: 420000, minimumThirtyDayPoints: 21600 },
            { name: "Hermes Of 0053", roleId: "823250760464072775", minimumServerDays: 876, minimumRankDays: 216, minimumTotalPoints: 600000, minimumThirtyDayPoints: 26400 }
        ],
        // Rol kimlikleri girildiğinde, haftalık/aylık liderlere otomatik verilir.
        rewardRoles: {
            weeklyRoleId: "865837691164950588",
            monthlyRoleId: "931962699863166996",
            weeklyDay: 1,
            monthlyDay: 1
        }
    },

    engagement: {
        timezone: "Europe/Istanbul",
        // General 1 istatistik ve sunucu yonetimi icindir; oyun/coin islemleri General 2'de kalir.
        economyCommandsEnabled: false,
        // Ekonomi sahibinin, yetki/rol durumundan bagimsiz olarak kullanabildigi tekil kimlik.
        founderId: "703936176590946434",
        creditCard: {
            defaultLimit: 2500,
            minimumLimit: 500,
            maximumLimit: 15000,
            onTimePaymentLimitIncrease: 100,
            latePaymentLimitDecrease: 150,
            minimumInstallments: 1,
            maximumInstallments: 8,
            installmentIntervalDays: 7
        },
        workSystem: {
            cooldownMs: 2 * 60 * 60_000,
            panelTimeoutMs: 60_000,
            levels: [
                { label: "Baslangic", minimum: 45, maximum: 100 },
                { label: "Deneyimli", minimum: 100, maximum: 180 },
                { label: "Usta", minimum: 180, maximum: 300 }
            ]
        },
        dashboard: { enabled: true, host: "127.0.0.1", port: 3050 },
        // Magaza sadece kaydi tamamlanmis uyelere aciktir.
        storeRequiresRegisteredMember: true,
        unregisteredRoleId: "823250825924444170",
        requestChannelId: "823250923202674728",
        requestStaffRoleId: "823250811562754058",
        logChannels: {
            general: "823823585872445441",
            guard: "823250983445725184",
            penalty: "823250913698512946",
            invite: "1532736443997491320",
            tag: "823250980992450570",
            rank: "1532852962823634984"
        },
        // Emoji ve kişisel rol asla anında teslim edilmez; üst yönetim butonla karar verir.
        storeRequestsRequireApproval: true,
        taskRewards: { daily: 30, weekly: 120 },
        // Gorevler tamamlanip odul alindiginda rutbe puanina da eklenir.
        taskPointRewards: { daily: 15, weekly: 75 },
        voiceBonusWindows: [
            { label: "Aksam etkinligi", days: [5, 6], startHour: 20, endHour: 23, multiplier: 1.5 },
            { label: "Gece etkinligi", days: [0], startHour: 21, endHour: 23, multiplier: 2 }
        ],
        // Rol adlari Discord'da farkliysa roleName degerini degistir veya roleId gir.
        // Uye ayni anda sadece hak ettigi en yuksek sure rolunu tasir.
        membershipDurationRoles: [
            { label: "3 Aylik Uye", days: 90, roleId: "1533071385667174410", roleName: "3 Aylık Üye" },
            { label: "6 Aylik Uye", days: 180, roleId: "1533071463702073475", roleName: "6 Aylık Üye" },
            { label: "1 Yillik Uye", days: 365, roleId: "1533071517024522280", roleName: "1 Yıllık Üye" },
            { label: "2 Yillik Uye", days: 730, roleId: "1533071584388972594", roleName: "2 Yıllık Üye" },
            { label: "3 Yillik Uye", days: 1095, roleId: "1533071627183460432", roleName: "3 Yıllık Üye" },
            { label: "4 Yillik Uye", days: 1460, roleId: "1533071674495340554", roleName: "4 Yıllık Üye" },
            { label: "5 Yillik Uye", days: 1825, roleId: "1533071716513746976", roleName: "5 Yıllık Üye" },
            { label: "6 Yillik Uye", days: 2190, roleId: "1533076694934753420", roleName: "6 Yıllık Üye" },
            { label: "7 Yillik Uye", days: 2555, roleId: "1533076767764512971", roleName: "7 Yıllık Üye" },
            { label: "8 Yillik Uye", days: 2920, roleId: "1533076793500631251", roleName: "8 Yıllık Üye" },
            { label: "9 Yillik Uye", days: 3285, roleId: "1533076842553020476", roleName: "9 Yıllık Üye" },
            { label: "10 Yillik Aile Uyesi", days: 3650, roleId: "1533076874702491668", roleName: "10 Yıllık Aile Üyesi" }
        ],
        store: [
            { id: "custom_emoji", name: "Sunucuya Ozel Emoji", cost: 1200, type: "emoji", repeatable: true, description: "Ekli gorseli sunucu emojisi olarak ekler." },
            { id: "custom_role", name: "Yetkisiz Kisisel Rol", cost: 2000, type: "personal_role", description: "Sadece sana verilen, hicbir Discord yetkisi olmayan rol olusturur." },
            { id: "ring_common", name: "Common Ring", cost: 250, type: "ring", description: "Evlilik teklifinde kullanilabilen koleksiyon yuzugu." },
            { id: "ring_rare", name: "Rare Ring", cost: 750, type: "ring", description: "Evlilik teklifinde kullanilabilen koleksiyon yuzugu." },
            { id: "ring_epic", name: "Epic Ring", cost: 1500, type: "ring", description: "Evlilik teklifinde kullanilabilen koleksiyon yuzugu." },
            { id: "ring_legendary", name: "Legendary Ring", cost: 3000, type: "ring", description: "Evlilik teklifinde kullanilabilen koleksiyon yuzugu." },
            { id: "summer_2026_badge", name: "Yaz 2026 Rozeti", cost: 600, type: "collectible", limitedUntil: "2026-09-01T00:00:00+03:00", description: "Sezon bitimine kadar alinabilen sinirli koleksiyon esyasi." }
        ],
        // Yeni topluluk panelleri. Kimlikleri bilerek bos birakildi: ilgili kanal/rol
        // olusturulduktan sonra Discord gelistirici modundan ID'leri buraya yazin.
        communityPanels: {
            enabled: true,
            panelChannelId: "823250934872277046", // #topluluk-merkezi
            confessionReviewChannelId: "1536848297937870859", // sadece kurucu + bot: #itiraf-inceleme
            confessionPanelChannelId: "1536848621671022692", // uyelerin itiraf panelini kullandigi kanal
            confessionPublishChannelId: "1536848661479297094", // uye yazamasin: #anonim-itiraflar
            confessionStaffRoleId: "831914120999206952", // sadece kurucudaki itiraf onay rolu
            privateRoom: {
                enabled: true,
                createChannelId: "827279622512967740", // uye "Tikla Olustur" ses kanali
                infoPanelChannelId: "827245424199991377", // #loca-bilgi metin kanali
                categoryId: "827279622013714502", // olusan gecici odalarin kategorisi
                logChannelId: "", // #ozel-oda-log
                defaultUserLimit: 5,
                namePrefix: "Oda"
            },
            // Sabit, yetkisiz rozet rolleri buraya eklenebilir. Ornek:
            // { id: "rozet_joker", name: "Joker Rozeti", cost: 500, roleId: "ROL_ID" }
            badgeShop: []
        },
        economyPlus: {
            dailyStreak: { baseReward: 25, stepReward: 5, maxReward: 100 },
            season: { name: "Wesh Sezon 1", endsAt: "2026-09-01T00:00:00+03:00", tiers: [100, 250, 500, 900, 1400] },
            rings: [
                { id: "ring_common", name: "Common Ring", cost: 250, rarity: "Common" },
                { id: "ring_rare", name: "Rare Ring", cost: 750, rarity: "Rare" },
                { id: "ring_epic", name: "Epic Ring", cost: 1500, rarity: "Epic" },
                { id: "ring_legendary", name: "Legendary Ring", cost: 3000, rarity: "Legendary" }
            ]
        }
    }
};
