const https = require("https");

const USER_AGENT = "Wesh-Discord-Metadata/1.0 (contact: server-admin)";
let nextMusicBrainzRequestAt = 0;
let soundCloudToken = null;

function postForm(url, headers, form) {
    return new Promise((resolve, reject) => {
        const body = new URLSearchParams(form).toString();
        const request = https.request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), ...headers } }, response => {
            let responseBody = "";
            response.on("data", chunk => { responseBody += chunk; });
            response.on("end", () => {
                if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(responseBody)); } catch { reject(new Error("JSON okunamadı.")); }
            });
        });
        request.setTimeout(10_000, () => request.destroy(new Error("Zaman aşımı.")));
        request.on("error", reject);
        request.end(body);
    });
}

function getJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { "User-Agent": USER_AGENT, ...headers } }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            let body = "";
            response.on("data", chunk => { body += chunk; if (body.length > 2_000_000) response.destroy(new Error("Yanıt çok büyük.")); });
            response.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("JSON okunamadı.")); } });
        });
        request.setTimeout(10_000, () => request.destroy(new Error("Zaman aşımı.")));
        request.on("error", reject);
    });
}

async function musicBrainzSearch(query) {
    const wait = Math.max(0, nextMusicBrainzRequestAt - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    nextMusicBrainzRequestAt = Date.now() + 1_100;
    const data = await getJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=3`);
    return (data.recordings || []).map(track => ({
        title: track.title,
        artist: track["artist-credit"]?.map(item => item.name).join(", ") || "Bilinmeyen sanatçı",
        album: track.releases?.[0]?.title || null,
        durationMs: track.length || null,
        source: "MusicBrainz"
    }));
}

async function soundCloudSearch(query, { soundCloudClientId, soundCloudClientSecret }) {
    if (!soundCloudClientId || !soundCloudClientSecret) return [];
    if (!soundCloudToken || soundCloudToken.expiresAt <= Date.now() + 60_000) {
        const authorization = Buffer.from(`${soundCloudClientId}:${soundCloudClientSecret}`).toString("base64");
        const token = await postForm("https://secure.soundcloud.com/oauth/token", { Authorization: `Basic ${authorization}`, Accept: "application/json" }, { grant_type: "client_credentials" });
        if (!token.access_token) throw new Error("SoundCloud erişim belirteci alınamadı.");
        soundCloudToken = { value: token.access_token, expiresAt: Date.now() + Math.max(60, Number(token.expires_in) || 3_600) * 1_000 };
    }
    const data = await getJson(`https://api.soundcloud.com/tracks?q=${encodeURIComponent(query)}&access=playable&limit=3`, { Authorization: `OAuth ${soundCloudToken.value}`, Accept: "application/json" });
    const tracks = Array.isArray(data) ? data : data.collection || [];
    return tracks.map(track => ({ title: track.title, artist: track.user?.username || "Bilinmeyen sanatçı", artwork: track.artwork_url || track.user?.avatar_url || null, url: track.permalink_url || null, source: "SoundCloud" }));
}

async function searchCatalog(query, { lastFmApiKey, soundCloudClientId, soundCloudClientSecret } = {}) {
    const apple = getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=TR&media=music&entity=song&limit=3`)
        .then(data => (data.results || []).map(track => ({ title: track.trackName, artist: track.artistName, album: track.collectionName || null, artwork: track.artworkUrl100 || null, url: track.trackViewUrl || null, source: "Apple Music / iTunes" })));
    const deezer = getJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`)
        .then(data => (data.data || []).map(track => ({ title: track.title, artist: track.artist?.name || "Bilinmeyen sanatçı", album: track.album?.title || null, artwork: track.album?.cover_medium || null, url: track.link || null, source: "Deezer" })));
    const musicBrainz = musicBrainzSearch(query);
    const lastFm = lastFmApiKey
        ? getJson(`https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${encodeURIComponent(lastFmApiKey)}&format=json&limit=3`)
            .then(data => (data.results?.trackmatches?.track || []).map(track => ({ title: track.name, artist: track.artist || "Bilinmeyen sanatçı", url: track.url || null, source: "Last.fm" })))
        : Promise.resolve([]);
    const soundCloud = soundCloudSearch(query, { soundCloudClientId, soundCloudClientSecret });
    const settled = await Promise.allSettled([apple, deezer, musicBrainz, lastFm, soundCloud]);
    const labels = ["Apple Music / iTunes", "Deezer", "MusicBrainz", "Last.fm", "SoundCloud"];
    return settled.flatMap((result, index) => result.status === "fulfilled" ? result.value : [{ source: labels[index], error: result.reason?.message || "erişilemedi" }]);
}

module.exports = { searchCatalog };
