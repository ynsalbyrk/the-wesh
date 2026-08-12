"use strict";

const { LoadType } = require("shoukaku");

const CACHE_TTL_MS = 90_000;
// The currently installed YouTube plugin can return a search result whose
// audio stream then fails at playback time. SoundCloud is healthy on this
// Lavalink node, so only return sources that can actually be played.
const PROVIDERS = ["scsearch:"];
const cache = new Map();
const UNWANTED_VARIANTS = [
    /\bcover\b/i, /\bkaraoke\b/i, /\bremix\b/i, /\bmashup\b/i,
    /\blive\b/i, /\bacoustic\b/i, /\bslowed\b/i, /\bsped\s*up\b/i,
    /\bnightcore\b/i, /\bpitch(?:ed)?\b/i, /\binstrumental\b/i
];

function normalise(value) {
    return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function durationScore(expected, actual) {
    if (!expected || !actual) return 0;
    return Math.max(0, 25 - Math.min(25, Math.abs(expected - actual) / 1_000 / 4));
}

function tokenCoverage(haystack, needle) {
    const wanted = normalise(needle).split(" ").filter(word => word.length > 1);
    if (!wanted.length) return 0;
    const actual = new Set(normalise(haystack).split(" "));
    return wanted.filter(word => actual.has(word)).length / wanted.length;
}

function naturalArtistTitleScore(track, query) {
    const queryWords = normalise(query).split(" ").filter(word => word.length > 1);
    if (!queryWords.length) return 0;
    const authorWords = new Set(normalise(track.info.author).split(" ").filter(word => word.length > 1 && !["topic", "official", "music"].includes(word)));
    const artistWords = queryWords.filter(word => authorWords.has(word));
    const titleWords = queryWords.filter(word => !authorWords.has(word));
    // A user can type "Artist Song" naturally.  If part of that text matches
    // the uploader/artist, score the rest against the title instead of
    // requiring a dash between the two fields.
    if (!artistWords.length || !titleWords.length) return tokenCoverage(track.info.title, query) * 45;
    return Math.min(30, artistWords.length * 15) + Math.round(tokenCoverage(track.info.title, titleWords.join(" ")) * 75);
}

function scoreTrack(track, expected) {
    const title = normalise(track.info.title);
    const author = normalise(track.info.author);
    const label = `${track.info.title} ${track.info.author}`;
    const combined = `${title} ${author}`;
    const wantedTitle = normalise(expected.title);
    const wantedArtist = normalise(expected.artist);
    const exactTitle = wantedTitle && (title === wantedTitle || combined.includes(wantedTitle));
    const exactArtist = wantedArtist && (author === wantedArtist || author.includes(wantedArtist) || title.includes(wantedArtist));
    const official = /official\s*(audio|video|music)?|topic|vevo|provided to youtube|auto-generated/i.test(label);
    const sourceQuality = track.info.sourceName === "soundcloud" ? 12 : track.info.sourceName === "youtube" ? 5 : 2;
    let variantPenalty = 0;
    for (const variant of UNWANTED_VARIANTS) {
        if (variant.test(label) && !variant.test(String(expected.query || ""))) variantPenalty += 90;
    }
    // Local AI-style ranker: canonical releases, title/artist agreement and
    // official sources beat covers, remixes and low-quality variants.
    return (exactTitle ? 100 : 0) + (exactArtist ? 60 : 0)
        + Math.round(tokenCoverage(label, expected.title) * 45)
        + Math.round((expected.artist ? tokenCoverage(label, expected.artist) : 1) * 25)
        + (!expected.artist ? naturalArtistTitleScore(track, expected.query) : 0)
        + durationScore(expected.duration, track.info.length) + (official ? 30 : 0)
        + sourceQuality - variantPenalty;
}

function makeTrack(track, query, provider) {
    return { encoded: track.encoded, info: track.info, query, provider, retries: 0 };
}

async function resolve(node, identifier) {
    const result = await node.rest.resolve(identifier);
    if (!result || result.loadType === LoadType.EMPTY || result.loadType === LoadType.ERROR) return [];
    if (result.loadType === LoadType.PLAYLIST) return result.data.tracks;
    if (result.loadType === LoadType.TRACK) return [result.data];
    return result.data;
}

async function searchOne(node, expected, { excludeProviders = [] } = {}) {
    const terms = `${expected.artist || ""} ${expected.title || expected.query}`.trim();
    const results = await Promise.allSettled(PROVIDERS.map(async provider => ({
        provider,
        tracks: await resolve(node, `${provider}${terms}`)
    })));
    const excluded = new Set(excludeProviders);
    const candidates = results.flatMap(result => result.status === "fulfilled"
        ? result.value.tracks.map(track => ({ track, provider: result.value.provider }))
        : []);
    const usable = candidates.filter(candidate => !excluded.has(candidate.provider));
    if (!usable.length) return null;
    usable.sort((left, right) => scoreTrack(right.track, expected) - scoreTrack(left.track, expected));
    return makeTrack(usable[0].track, terms, usable[0].provider);
}

async function searchRelated(node, seed) {
    const artist = String(seed?.info?.author || "").trim();
    if (!artist) return null;
    const candidates = (await resolve(node, `scsearch:${artist}`))
        .filter(track => track.encoded !== seed.encoded && track.info.uri !== seed.info.uri)
        .map(track => ({ track, provider: "scsearch:" }));
    if (!candidates.length) return null;
    const expected = { artist, title: "", query: artist };
    candidates.sort((left, right) => scoreTrack(right.track, expected) - scoreTrack(left.track, expected));
    return makeTrack(candidates[0].track, artist, "scsearch:");
}

function queryExpectation(input) {
    const query = input.trim();
    const separator = query.match(/^(.+?)\s+-\s+(.+)$/);
    return separator
        ? { artist: separator[1].trim(), title: separator[2].trim(), query }
        : { title: query, query, natural: true };
}

async function resolveInput(node, input) {
    if (typeof input !== "string" || !input.trim()) throw new Error("Şarkı adı veya bağlantı gerekli.");
    const key = input.trim().toLocaleLowerCase("tr-TR");
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.tracks.map(track => ({ ...track }));
    let tracks;
    if (/^https?:\/\/(open\.)?spotify\.com\//i.test(input)) {
        throw new Error("Spotify integration is disabled. Use a song title or a supported provider URL.");
    } else if (/^https?:\/\//i.test(input)) {
        if (!/^https?:\/\/(?:www\.)?soundcloud\.com\//i.test(input)) {
            throw new Error("Oynatılabilir liste bağlantısı için SoundCloud çalma listesi bağlantısı kullan.");
        }
        tracks = (await resolve(node, input))
            .filter(track => track.info.sourceName === "soundcloud")
            .map(track => makeTrack(track, input, "soundcloud-playlist"));
    } else {
        const track = await searchOne(node, queryExpectation(input));
        tracks = track ? [track] : [];
    }
    if (!tracks.length) throw new Error("No playable track found from configured providers.");
    cache.set(key, { tracks, expiresAt: Date.now() + CACHE_TTL_MS });
    return tracks.map(track => ({ ...track }));
}

async function search(node, query) {
    const settled = await Promise.allSettled(PROVIDERS.map(async provider =>
        (await resolve(node, `${provider}${query}`)).map(track => makeTrack(track, query, provider))
    ));
    const expected = queryExpectation(query);
    return settled.flatMap(result => result.status === "fulfilled" ? result.value : [])
        .sort((a, b) => scoreTrack(b, expected) - scoreTrack(a, expected)).slice(0, 10);
}

module.exports = { resolveInput, search, searchOne, searchRelated, scoreTrack, queryExpectation, naturalArtistTitleScore };
