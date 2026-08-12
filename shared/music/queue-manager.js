"use strict";

const { searchOne, searchRelated } = require("./track-resolver");

class QueueManager {
    constructor(manager, { logger, idleLeaveMs, onLeave = async () => {}, onTrackStart = async () => {} }) {
        this.manager = manager;
        this.logger = logger;
        this.idleLeaveMs = idleLeaveMs;
        this.onLeave = onLeave;
        this.onTrackStart = onTrackStart;
        this.queues = new Map();
    }

    get(guildId) { return this.queues.get(guildId); }

    async connect(guild, channel, textChannel) {
        let queue = this.queues.get(guild.id);
        // A moderator can disconnect the bot directly in Discord.  In that
        // case the queue still exists in memory, but its Lavalink player no
        // longer has a usable voice websocket.  Compare Discord's live voice
        // state on every play/select request and rebuild the player when it
        // differs from the requested channel.
        const botVoiceChannelId = guild.members.me?.voice?.channelId || null;
        const needsReconnect = Boolean(queue && botVoiceChannelId !== channel.id);
        if (!queue) {
            const shardId = guild.shardId ?? 0;
            const player = await this.manager.joinVoiceChannel({ guildId: guild.id, channelId: channel.id, shardId, deaf: true });
            queue = { guildId: guild.id, shardId, voiceChannelId: channel.id, textChannel, player, tracks: [], current: null, lastTrack: null, loop: "off", volume: 100, autoplay: false, paused: false, advancing: false, idleTimer: null, intentionalStop: false };
            this.queues.set(guild.id, queue);
            this.bind(queue);
        } else if (queue.voiceChannelId !== channel.id || needsReconnect) {
            await this.manager.leaveVoiceChannel(guild.id);
            const player = await this.manager.joinVoiceChannel({ guildId: guild.id, channelId: channel.id, shardId: guild.shardId ?? 0, deaf: true });
            queue.player = player;
            queue.shardId = guild.shardId ?? 0;
            queue.voiceChannelId = channel.id;
            if (needsReconnect) {
                // A forced Discord disconnect is treated like a fresh session.
                // Otherwise `current` prevents the next !play from starting.
                queue.current = null;
                queue.tracks = [];
                queue.paused = false;
                queue.intentionalStop = false;
            }
            this.bind(queue);
        }
        queue.textChannel = textChannel;
        clearTimeout(queue.idleTimer);
        queue.idleTimer = null;
        return queue;
    }

    bind(queue) {
        queue.player.on("end", event => {
            if (event.reason === "finished") void this.advance(queue, false);
        });
        queue.player.on("exception", event => void this.recover(queue, event.exception?.message || "track exception"));
        queue.player.on("stuck", () => void this.recover(queue, "track stuck"));
        queue.player.on("closed", event => this.logger(`music guild=${queue.guildId} voice-websocket-closed code=${event.code}`));
        queue.player.on("resumed", () => this.logger(`music guild=${queue.guildId} player resumed`));
    }

    async enqueue(queue, tracks) {
        queue.tracks.push(...tracks);
        if (!queue.current) await this.advance(queue, true);
    }

    async advance(queue, initial) {
        if (queue.advancing) return;
        queue.advancing = true;
        try {
            if (!initial && queue.current) {
                queue.lastTrack = queue.current;
                if (queue.loop === "track") queue.tracks.unshift({ ...queue.current, retries: 0 });
                if (queue.loop === "queue") queue.tracks.push({ ...queue.current, retries: 0 });
                queue.current = null;
            }
            let track = queue.tracks.shift();
            if (!track && queue.autoplay && queue.lastTrack) {
                track = await searchRelated(queue.player.node, queue.lastTrack);
                if (track) this.logger(`music guild=${queue.guildId} autoplay source=${track.provider} title=${track.info.title}`);
            }
            if (!track) return this.scheduleLeave(queue);
            queue.current = track;
            queue.startedAt = Date.now();
            queue.intentionalStop = false;
            await queue.player.playTrack({ track: { encoded: track.encoded }, volume: queue.volume, paused: false });
            this.logger(`music guild=${queue.guildId} play source=${track.provider} title=${track.info.title}`);
            await this.onTrackStart(queue);
        } catch (error) {
            this.logger(`music guild=${queue.guildId} play-error=${error.message}`);
            await this.recover(queue, error.message);
        } finally { queue.advancing = false; }
    }

    async recover(queue, reason) {
        const current = queue.current;
        if (!current || queue.intentionalStop) return;
        this.logger(`music guild=${queue.guildId} recovery reason=${reason}`);
        if (current.retries < 2) {
            current.retries += 1;
            try {
                const failedProviders = [...new Set([...(current.failedProviders || []), current.provider])];
                // Preserve the member's original request.  YouTube metadata
                // often uses uploader labels such as "and 2 more", which make
                // a SoundCloud fallback search inaccurate.
                const originalQuery = current.query || current.info.title;
                const replacement = await searchOne(queue.player.node, { title: originalQuery, duration: current.info.length, query: originalQuery }, { excludeProviders: failedProviders });
                if (replacement) {
                    replacement.retries = current.retries;
                    replacement.failedProviders = failedProviders;
                    queue.current = replacement;
                    queue.startedAt = Date.now();
                    await queue.player.playTrack({ track: { encoded: replacement.encoded }, volume: queue.volume, paused: queue.paused });
                    await this.onTrackStart(queue);
                    return;
                }
            } catch (error) { this.logger(`music guild=${queue.guildId} recovery-search-error=${error.message}`); }
        }
        queue.current = null;
        await this.advance(queue, true);
    }

    async skip(queue) { queue.intentionalStop = true; queue.current = null; await queue.player.stopTrack(); await this.advance(queue, true); }
    async stop(queue) { queue.intentionalStop = true; queue.tracks = []; queue.current = null; await queue.player.stopTrack(); this.scheduleLeave(queue); }
    async leave(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;
        clearTimeout(queue.idleTimer);
        await this.manager.leaveVoiceChannel(guildId);
        this.queues.delete(guildId);
        await this.onLeave(queue);
    }
    scheduleLeave(queue) { clearTimeout(queue.idleTimer); queue.idleTimer = setTimeout(() => void this.leave(queue.guildId), this.idleLeaveMs).unref(); }
}

module.exports = { QueueManager };
