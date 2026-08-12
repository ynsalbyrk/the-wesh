const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const https = require("https");
const { acquireSingleInstance } = require("../shared/single-instance");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// `npm run music` is the only supported combined launcher.  The individual
// bot entry points have their own locks too, but this prevents a second
// launcher from leaving a second set of child processes behind.
if (!acquireSingleInstance("music-launcher")) {
    console.log("[WESH SYSTEM] Müzik başlatıcısı zaten çalışıyor; ikinci başlatma yapılmadı.");
    process.exit(0);
}

const children = new Map();
let shuttingDown = false;

function startBot(name) {
    const child = spawn(process.execPath, [path.join(__dirname, `../bots/register/${name}/index.js`)], { stdio: "inherit" });
    children.set(name, child);
    child.on("exit", (code, signal) => {
        children.delete(name);
        console.log(`[WESH SYSTEM] ${name} kapandı: ${signal || code}`);
        if (shuttingDown) return;
        setTimeout(() => {
            console.log(`[WESH SYSTEM] ${name} yeniden başlatılıyor...`);
            startBot(name);
        }, 10_000).unref();
    });
}

function lavalinkReady() {
    const protocol = process.env.LAVALINK_SECURE === "true" ? "https:" : "http:";
    const address = String(process.env.LAVALINK_URL || "").trim();
    if (!address) return Promise.resolve(false);
    const url = new URL(`${protocol}//${address}/v4/info`);
    const transport = protocol === "https:" ? https : http;
    return new Promise(resolve => {
        const request = transport.get(url, { headers: { Authorization: process.env.LAVALINK_PASSWORD || "" } }, response => {
            response.resume();
            resolve(response.statusCode === 200);
        });
        request.setTimeout(3_000, () => request.destroy());
        request.on("error", () => resolve(false));
    });
}

async function waitForLavalink() {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
        if (await lavalinkReady()) return true;
        console.log(`[WESH SYSTEM] Lavalink hazır değil (${attempt}/30); bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, 1_000));
    }
    return false;
}

async function start() {
    if (!await waitForLavalink()) {
        console.error("[WESH SYSTEM] Lavalink 30 saniye içinde hazır olmadı; müzik botları başlatılmadı.");
        process.exitCode = 1;
        return;
    }
    ["music-1", "music-2"].forEach(startBot);
}

function stopChildren() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children.values()) {
        if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
    }
}

process.once("SIGINT", stopChildren);
process.once("SIGTERM", stopChildren);

void start();
