const fs = require("fs");
const path = require("path");
const http = require("http");

const DAY_MS = 86_400_000;

function dayKey(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(date);
}

function weekKey(date = new Date()) {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7));
    return copy.toISOString().slice(0, 10);
}

function createEngagementSystem({ dataDirectory, settings }) {
    const file = path.join(dataDirectory, "engagement.json");
    let state;
    try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch { state = { users: {}, claimed: {}, meta: {} }; }
    state.users ||= {}; state.claimed ||= {}; state.meta ||= {};
    let dashboardStarted = false;

    function save() {
        fs.mkdirSync(dataDirectory, { recursive: true });
        const temporary = `${file}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
        fs.renameSync(temporary, file);
    }

    function user(id, tag = id) {
        if (!state.users[id]) state.users[id] = { id, tag, coins: 0, badges: [], inventory: [], birthday: null, daily: {}, weekly: {}, lifetime: { messages: 0, voiceMinutes: 0, registrations: 0, invites: 0 } };
        state.users[id].tag = tag;
        state.users[id].lifetime ||= { messages: 0, voiceMinutes: 0, registrations: 0, invites: 0 };
        return state.users[id];
    }

    function creditCard(entry) {
        const rules = settings.creditCard || {};
        entry.creditCard ||= { limit: rules.defaultLimit || 0, debt: 0, installmentPlan: null };
        entry.creditCard.limit = Math.max(rules.minimumLimit || 0, Math.floor(Number(entry.creditCard.limit) || 0));
        entry.creditCard.debt = Math.max(0, Math.floor(Number(entry.creditCard.debt) || 0));
        return entry.creditCard;
    }

    function creditCardSummary(id, tag) {
        const entry = user(id, tag); const card = creditCard(entry);
        return { entry, card, availableLimit: Math.max(0, card.limit - card.debt) };
    }

    function chargeCreditCard(id, tag, amount) {
        const summary = creditCardSummary(id, tag); const charge = Math.floor(Number(amount));
        if (!Number.isInteger(charge) || charge <= 0 || charge > summary.availableLimit) return { ok: false, ...summary };
        summary.card.debt += charge;
        save();
        return { ok: true, ...creditCardSummary(id, tag), charge };
    }

    function repayCreditCard(id, tag, amount) {
        const summary = creditCardSummary(id, tag); const payment = Math.floor(Number(amount));
        if (!Number.isInteger(payment) || payment <= 0 || payment > summary.entry.coins || payment > summary.card.debt) return { ok: false, ...summary };
        summary.entry.coins -= payment; summary.card.debt -= payment;
        if (summary.card.installmentPlan) {
            let remaining = payment;
            for (const installment of summary.card.installmentPlan.installments) {
                if (remaining <= 0) break;
                const applied = Math.min(installment.remaining, remaining);
                installment.remaining -= applied; remaining -= applied;
                if (installment.remaining === 0 && !installment.completedAt) {
                    installment.completedAt = Date.now();
                    if (installment.completedAt <= installment.dueAt) {
                        const rules = settings.creditCard || {};
                        summary.card.limit = Math.min(rules.maximumLimit || Number.MAX_SAFE_INTEGER, summary.card.limit + (rules.onTimePaymentLimitIncrease || 0));
                    }
                }
            }
            summary.card.installmentPlan.installments = summary.card.installmentPlan.installments.filter(installment => installment.remaining > 0);
            if (!summary.card.installmentPlan.installments.length) summary.card.installmentPlan = null;
        }
        save();
        return { ok: true, ...creditCardSummary(id, tag), payment };
    }

    function installmentCreditCardDebt(id, tag, count) {
        const summary = creditCardSummary(id, tag); const installmentCount = Math.floor(Number(count));
        const rules = settings.creditCard || {};
        if (!Number.isInteger(installmentCount) || installmentCount < (rules.minimumInstallments || 2) || installmentCount > (rules.maximumInstallments || 12) || summary.card.debt <= 0) return { ok: false, ...summary };
        const base = Math.floor(summary.card.debt / installmentCount); const remainder = summary.card.debt % installmentCount;
        summary.card.installmentPlan = {
            createdAt: Date.now(), count: installmentCount,
            installments: Array.from({ length: installmentCount }, (_, index) => ({ number: index + 1, remaining: base + (index < remainder ? 1 : 0), dueAt: Date.now() + (index + 1) * (rules.installmentIntervalDays || 7) * DAY_MS }))
        };
        save();
        return { ok: true, ...creditCardSummary(id, tag) };
    }

    function addCoins(id, tag, amount) {
        const entry = user(id, tag); const value = Math.floor(Number(amount));
        if (!Number.isInteger(value) || value <= 0) return null;
        entry.coins += value; save(); return { entry, amount: value };
    }

    function workStatus(id, tag) {
        const entry = user(id, tag);
        entry.work ||= { nextAt: 0, pendingUntil: 0, completed: 0, successes: 0, earnings: 0 };
        return { entry, work: entry.work, remainingMs: Math.max(0, entry.work.nextAt - Date.now()) };
    }

    function beginWork(id, tag) {
        const summary = workStatus(id, tag); const now = Date.now();
        if (summary.work.pendingUntil > now || summary.work.nextAt > now) return { ok: false, ...summary };
        summary.work.pendingUntil = now + (settings.workSystem?.panelTimeoutMs || 60_000);
        save(); return { ok: true, ...workStatus(id, tag) };
    }

    function cancelWork(id, tag) {
        const summary = workStatus(id, tag);
        if (summary.work.pendingUntil > Date.now()) { summary.work.pendingUntil = 0; save(); }
    }

    function completeWork(id, tag, { success, reward = 0, jobId, level }) {
        const summary = workStatus(id, tag); const now = Date.now();
        if (summary.work.pendingUntil <= now) return { ok: false, ...summary };
        summary.work.pendingUntil = 0;
        summary.work.nextAt = now + (settings.workSystem?.cooldownMs || 2 * 60 * 60_000);
        summary.work.completed += 1; summary.work.lastJobId = jobId; summary.work.lastLevel = level; summary.work.lastAt = now;
        if (success) { summary.entry.coins += reward; summary.work.successes += 1; summary.work.earnings += reward; summary.work.streak = (summary.work.streak || 0) + 1; summary.work.bestStreak = Math.max(summary.work.bestStreak || 0, summary.work.streak); }
        else summary.work.streak = 0;
        save(); return { ok: true, ...workStatus(id, tag), reward: success ? reward : 0 };
    }

    function reviewCreditCardDueDates(now = Date.now()) {
        const rules = settings.creditCard || {}; let changed = 0;
        for (const entry of Object.values(state.users)) {
            const card = creditCard(entry); const plan = card.installmentPlan;
            if (!plan) continue;
            for (const installment of plan.installments || []) {
                if (installment.remaining > 0 && installment.dueAt < now && !installment.lateLimitApplied) {
                    card.limit = Math.max(rules.minimumLimit || 0, card.limit - (rules.latePaymentLimitDecrease || 0));
                    installment.lateLimitApplied = true; changed += 1;
                }
            }
        }
        if (changed) save(); return changed;
    }

    function takeCreditCardDueReminders(now = Date.now()) {
        const reminders = [];
        for (const entry of Object.values(state.users)) {
            const plan = creditCard(entry).installmentPlan;
            for (const installment of plan?.installments || []) {
                const onDueDate = now >= installment.dueAt && now < installment.dueAt + DAY_MS;
                if (installment.remaining > 0 && onDueDate && !installment.remindedAt) {
                    installment.remindedAt = now;
                    reminders.push({ memberId: entry.id, amount: installment.remaining, number: installment.number, dueAt: installment.dueAt });
                }
            }
        }
        if (reminders.length) save(); return reminders;
    }

    const taskDefinitions = {
        daily: [
            { id: "message", label: "60 mesaj yaz", goal: 60 },
            { id: "voiceMinutes", label: "90 dakika seste kal", goal: 90 },
            { id: "invite", label: "3 davet yap", goal: 3 },
            { id: "registration", label: "3 kayit tamamla", goal: 3 }
        ],
        weekly: [
            { id: "message", label: "360 mesaj yaz", goal: 360 },
            { id: "voiceMinutes", label: "540 dakika seste kal", goal: 540 },
            { id: "registration", label: "6 kayit yap", goal: 6 },
            { id: "invite", label: "9 davet yap", goal: 9 }
        ]
    };

    function taskStatus(entry, type) {
        const key = type === "daily" ? dayKey() : weekKey();
        const bucket = entry[type][key] || { progress: {}, claimed: false, createdAt: Date.now() };
        entry[type][key] = bucket;
        return { key, bucket, tasks: taskDefinitions[type].map(task => ({ ...task, value: Math.min(task.goal, bucket.progress[task.id] || 0) })) };
    }

    function recordActivity({ id, tag, type, amount = 1, stats }) {
        const entry = user(id, tag);
        const key = type === "voice" || type === "muted_voice" ? "voiceMinutes" : type;
        for (const period of ["daily", "weekly"]) {
            const status = taskStatus(entry, period);
            if (status.tasks.some(task => task.id === key)) status.bucket.progress[key] = (status.bucket.progress[key] || 0) + amount;
        }
        const lifetimeKey = key === "message" ? "messages" : key === "registration" ? "registrations" : key === "invite" ? "invites" : key;
        if (Object.hasOwn(entry.lifetime, lifetimeKey)) entry.lifetime[lifetimeKey] += amount;
        const badges = [];
        const candidates = [
            ["Sohbetci", stats?.messages >= 1_000],
            ["Ses Ustasi", (stats?.voiceMs || 0) >= 100 * 60 * 60_000],
            ["Kayit Uzmani", entry.lifetime.registrations >= 25],
            ["Davetci", entry.lifetime.invites >= 10]
        ];
        for (const [badge, eligible] of candidates) if (eligible && !entry.badges.includes(badge)) { entry.badges.push(badge); badges.push(badge); }
        const seasonGain = type === "message" ? 1 : type === "voice" ? Math.floor(amount / 5) : type === "registration" ? 10 : type === "invite" ? 5 : 0;
        if (seasonGain > 0) entry.seasonXp = (entry.seasonXp || 0) + seasonGain;
        save();
        return badges;
    }

    function claim(id, tag, type) {
        const entry = user(id, tag); const status = taskStatus(entry, type);
        if (status.bucket.claimed || !status.tasks.every(task => task.value >= task.goal)) return null;
        const reward = settings.taskRewards?.[type] || 0;
        const points = settings.taskPointRewards?.[type] || 0;
        status.bucket.claimed = true; entry.coins += reward; save();
        return { coins: reward, points, period: type };
    }

    function claimDailyStreak(id, tag) {
        const entry = user(id, tag); const today = dayKey(); const yesterday = dayKey(new Date(Date.now() - DAY_MS));
        entry.streak ||= { lastDay: null, count: 0 };
        if (entry.streak.lastDay === today) return null;
        entry.streak.count = entry.streak.lastDay === yesterday ? entry.streak.count + 1 : 1;
        entry.streak.lastDay = today;
        const rules = settings.economyPlus?.dailyStreak || {};
        const reward = Math.min(rules.maxReward || 100, (rules.baseReward || 25) + Math.max(0, entry.streak.count - 1) * (rules.stepReward || 5));
        entry.coins += reward;
        entry.seasonXp = (entry.seasonXp || 0) + 10;
        save(); return { reward, streak: entry.streak.count, seasonXp: entry.seasonXp };
    }

    function personalSummary(id, tag) {
        const entry = user(id, tag);
        const daily = taskStatus(entry, "daily");
        const weekly = taskStatus(entry, "weekly");
        return { entry, daily, weekly };
    }

    function setBirthday(id, tag, value) {
        const match = /^(\d{2})[-/](\d{2})(?:[-/](\d{4}))?$/.exec(value || "");
        if (!match) return false;
        const [, dayText, monthText, yearText] = match;
        const [day, month] = [Number(dayText), Number(monthText)];
        if (day < 1 || day > 31 || month < 1 || month > 12) return false;
        const entry = user(id, tag);
        entry.birthday = `${dayText}-${monthText}`;
        if (yearText) entry.birthDate = `${dayText}/${monthText}/${yearText}`;
        save(); return true;
    }

    function canPurchase(id, tag, itemId) {
        const entry = user(id, tag); const item = settings.store?.find(candidate => candidate.id === itemId);
        if (!item || (item.limitedUntil && Date.now() >= new Date(item.limitedUntil).getTime()) || entry.coins < item.cost || (!item.repeatable && entry.inventory.includes(itemId))) return { ok: false, item, entry };
        return { ok: true, item, entry };
    }

    function completePurchase(id, tag, itemId) {
        const result = canPurchase(id, tag, itemId);
        if (!result.ok) return result;
        result.entry.coins -= result.item.cost;
        if (!result.item.repeatable) result.entry.inventory.push(itemId);
        save();
        return result;
    }

    // A request is charged when it is opened so the balance cannot be spent twice.
    // If staff rejects it (or delivery fails), this is the single safe refund path.
    function refundPurchase(id, tag, itemId) {
        const entry = user(id, tag); const item = settings.store?.find(candidate => candidate.id === itemId);
        if (!item) return null;
        entry.coins += item.cost;
        if (!item.repeatable) entry.inventory = entry.inventory.filter(value => value !== itemId);
        save();
        return { entry, item };
    }

    function getBonus() {
        const date = new Date();
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone || "Europe/Istanbul", weekday: "short", hour: "numeric", hour12: false }).formatToParts(date);
        const hour = Number(parts.find(part => part.type === "hour")?.value);
        const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find(part => part.type === "weekday")?.value);
        return (settings.voiceBonusWindows || []).find(window => window.days.includes(day) && hour >= window.startHour && hour < window.endHour) || null;
    }

    function dashboard(snapshot) {
        if (!settings.dashboard?.enabled || dashboardStarted) return;
        const server = http.createServer((request, response) => {
            if (request.url !== "/" && request.url !== "/index.html") { response.writeHead(404); return response.end("Not found"); }
            const info = snapshot();
            const leaders = info.leaders.map((leader, index) => `<li><b>#${index + 1} ${leader.tag}</b><span>${leader.points.toFixed(0)} puan</span></li>`).join("") || "<li>Henüz veri yok</li>";
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(`<!doctype html><meta charset="utf-8"><title>Wesh Activity Center</title><style>body{margin:0;background:#0b1020;color:#f4f7ff;font:16px Inter,Arial;padding:32px}main{max-width:900px;margin:auto}.card{background:#171e33;border:1px solid #2b3657;border-radius:18px;padding:22px;margin:16px 0}h1{color:#8ea1ff}ul{list-style:none;padding:0}li{display:flex;justify-content:space-between;padding:12px;background:#10162a;margin:7px 0;border-radius:10px}small{color:#9ca9cb}</style><main><h1>Wesh Activity Center</h1><small>Yerel yönetim paneli • otomatik yenileme için sayfayı yenileyin</small><section class="card"><h2>Sunucu Özeti</h2><p>Üye: <b>${info.memberCount}</b> • Takip edilen: <b>${info.userCount}</b> • Aktif bonus: <b>${info.bonus || "Yok"}</b></p></section><section class="card"><h2>30 Gün Liderleri</h2><ul>${leaders}</ul></section></main>`);
        });
        server.on("error", error => console.error("Dashboard error:", error.message));
        server.listen(settings.dashboard.port, settings.dashboard.host);
        dashboardStarted = true;
    }

    return { user, taskStatus, recordActivity, claim, claimDailyStreak, personalSummary, setBirthday, creditCardSummary, chargeCreditCard, repayCreditCard, installmentCreditCardDebt, reviewCreditCardDueDates, takeCreditCardDueReminders, addCoins, workStatus, beginWork, cancelWork, completeWork, canPurchase, completePurchase, refundPurchase, getBonus, dashboard, state, save, taskDefinitions };
}

module.exports = createEngagementSystem;
