const fs = require("fs");
const path = require("path");

const LOCK_DIR = path.resolve(__dirname, "..", "data", "music-channel-locks");

function lockPath(guildId, channelId) {
    return path.join(LOCK_DIR, `${guildId}-${channelId}.json`);
}

function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
}

async function readLock(file) {
    try { return JSON.parse(await fs.promises.readFile(file, "utf8")); } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

async function acquireMusicChannel(guildId, channelId, botName) {
    await fs.promises.mkdir(LOCK_DIR, { recursive: true });
    const file = lockPath(guildId, channelId);
    const mine = { guildId, channelId, botName, pid: process.pid, updatedAt: Date.now() };
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const existing = await readLock(file);
        if (existing) {
            const mineAlready = existing.botName === botName && existing.pid === process.pid;
            if (!mineAlready && processIsAlive(existing.pid)) return { acquired: false, owner: existing };
            // A stale lock must be removed before claiming it.  Using an
            // exclusive create below means another music bot can never
            // silently overwrite a newly acquired lock.
            await fs.promises.unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
            continue;
        }
        try {
            await fs.promises.writeFile(file, JSON.stringify(mine), { encoding: "utf8", flag: "wx" });
            return { acquired: true };
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
        }
    }
    return { acquired: false, owner: await readLock(file) };
}

async function releaseMusicChannel(guildId, channelId, botName) {
    const file = lockPath(guildId, channelId);
    const existing = await readLock(file);
    if (!existing || (existing.botName === botName && existing.pid === process.pid)) {
        await fs.promises.unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
}

module.exports = { acquireMusicChannel, releaseMusicChannel };
