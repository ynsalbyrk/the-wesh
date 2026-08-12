const fs = require("fs");
const path = require("path");

// Discord delivers the same message to every process that has logged in with
// a bot token. This small cross-process claim prevents duplicate replies if a
// music bot is accidentally launched twice.
const CLAIM_DIR = path.resolve(__dirname, "..", "data", "music-command-claims");
const CLAIM_TTL_MS = 2 * 60_000;

async function claimMusicCommand(messageId) {
    if (!messageId) return true; // Slash commands are already single interactions.
    await fs.promises.mkdir(CLAIM_DIR, { recursive: true });
    const file = path.join(CLAIM_DIR, `${messageId}.claim`);
    try {
        await fs.promises.writeFile(file, String(Date.now()), { encoding: "utf8", flag: "wx" });
        const cleanup = setTimeout(() => fs.promises.unlink(file).catch(() => {}), CLAIM_TTL_MS);
        cleanup.unref();
        return true;
    } catch (error) {
        if (error.code === "EEXIST") return false;
        throw error;
    }
}

module.exports = { claimMusicCommand };
