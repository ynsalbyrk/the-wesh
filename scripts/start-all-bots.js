const { fork } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
// A desktop/background launcher can outlive the terminal that started it.
// Ignore a closed output pipe so it never takes the bots down with it.
process.stdout.on("error", error => { if (error.code !== "EPIPE") throw error; });
process.stderr.on("error", error => { if (error.code !== "EPIPE") throw error; });
const launchers = [
    { name: "community", script: "start-register-bots.js" },
    { name: "music", script: "start-music-bots.js" }
];

const children = new Map();
let shuttingDown = false;

function startLauncher(definition) {
    const child = fork(path.join(__dirname, definition.script), [], { cwd: root, silent: true });
    children.set(definition.name, child);
    child.stdout.on("data", data => { if (!process.stdout.destroyed) process.stdout.write(`[${definition.name}] ${data}`); });
    child.stderr.on("data", data => { if (!process.stderr.destroyed) process.stderr.write(`[${definition.name}] ${data}`); });
    child.on("exit", (code, signal) => {
        children.delete(definition.name);
        console.log(`[${definition.name}] kapandı: ${signal || code}`);
        if (shuttingDown) return;
        setTimeout(() => {
            console.log(`[${definition.name}] yeniden başlatılıyor...`);
            startLauncher(definition);
        }, 10_000).unref();
    });
}

for (const launcher of launchers) startLauncher(launcher);

function stopAll() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Tüm Wesh botları kapatılıyor…");
    for (const child of children.values()) if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 1_500).unref();
}

process.once("SIGINT", stopAll);
process.once("SIGTERM", stopAll);
