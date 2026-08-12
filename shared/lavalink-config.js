"use strict";

function parseNodes(value) {
    const nodes = String(value || "").split(",").map(item => item.trim()).filter(Boolean).map((item, index) => {
        const [name, url, auth, secure] = item.split("|");
        if (!url || !auth) throw new Error("LAVALINK_NODES entries must be name|host:port|password|secure.");
        return { name: name || `node-${index + 1}`, url, auth, secure: secure === "true" };
    });
    if (!nodes.length) throw new Error("LAVALINK_NODES is required before starting a music bot.");
    return nodes;
}

function getLavalinkConfig() {
    const singleNodeUrl = String(process.env.LAVALINK_URL || "").trim();
    const singleNodePassword = String(process.env.LAVALINK_PASSWORD || "").trim();
    return {
        nodes: singleNodeUrl && singleNodePassword
            ? [{ name: "local", url: singleNodeUrl, auth: singleNodePassword, secure: process.env.LAVALINK_SECURE === "true" }]
            : parseNodes(process.env.LAVALINK_NODES),
        resumeTimeout: Math.max(30, Number(process.env.LAVALINK_RESUME_TIMEOUT_SECONDS) || 120) * 1_000,
        idleLeaveMs: Math.max(60, Number(process.env.MUSIC_IDLE_LEAVE_SECONDS) || 180) * 1_000
    };
}

module.exports = { getLavalinkConfig };
