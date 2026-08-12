const { fork } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bots = [
    "register-1",
    "register-2",
    "register-3",
    "security-1",
    "security-2",
    "security-3",
    "general-1",
    "general-2"
];

const children = new Map();
let shuttingDown = false;

function startBot(bot) {
    const child = fork(path.join(root, "bots", "register", bot, "index.js"), [], {
        cwd: root,
        silent: true
    });

    children.set(bot, child);

    child.stdout.on("data", data => process.stdout.write(`[${bot}] ${data}`));
    child.stderr.on("data", data => process.stderr.write(`[${bot}] ${data}`));

    child.on("exit", (code, signal) => {
        children.delete(bot);
        console.log(`[${bot}] kapandı: ${signal || code}`);

        if (shuttingDown) return;

        setTimeout(() => {
            console.log(`[${bot}] yeniden başlatılıyor...`);
            startBot(bot);
        }, 10_000);
    });
}

for (const bot of bots) {
    startBot(bot);
}

function stopAll() {
    if (shuttingDown) return;

    shuttingDown = true;
    console.log("Register botları kapatılıyor…");

    for (const child of children.values()) {
        child.kill("SIGTERM");
    }

    setTimeout(() => process.exit(0), 1_000).unref();
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);