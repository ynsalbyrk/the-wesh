const fs = require("fs");
const path = require("path");

const LOCK_DIR = path.resolve(__dirname, "..", "data", "runtime-locks");

function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireSingleInstance(name) {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    const file = path.join(LOCK_DIR, `${name}.json`);
    const claim = JSON.stringify({ pid: process.pid, startedAt: Date.now(), name });
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            fs.writeFileSync(file, claim, { encoding: "utf8", flag: "wx" });
            const release = () => {
                try {
                    const current = JSON.parse(fs.readFileSync(file, "utf8"));
                    if (current.pid === process.pid) fs.unlinkSync(file);
                } catch { /* The lock was already removed. */ }
            };
            process.once("exit", release);
            process.once("SIGINT", () => { release(); process.exit(0); });
            process.once("SIGTERM", () => { release(); process.exit(0); });
            return true;
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            try {
                const existing = JSON.parse(fs.readFileSync(file, "utf8"));
                if (processIsAlive(existing.pid)) return false;
            } catch { /* Treat an unreadable lock as stale and replace it. */ }
            try { fs.unlinkSync(file); } catch (unlinkError) { if (unlinkError.code !== "ENOENT") throw unlinkError; }
        }
    }
    return false;
}

module.exports = { acquireSingleInstance };
