"use strict";

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "../../data/music-personal-playlists.json");
const MAX_PLAYLISTS = 5;
const MAX_TRACKS = 100;
let writes = Promise.resolve();

async function readAll() {
    try { return JSON.parse(await fs.promises.readFile(FILE, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

function normaliseUser(data, userId) {
    const saved = data[userId];
    if (Array.isArray(saved)) data[userId] = { lists: [{ id: "favorites", name: "Favoriler", tracks: saved }] };
    if (!data[userId]) data[userId] = { lists: [{ id: "favorites", name: "Favoriler", tracks: [] }] };
    return data[userId];
}

function update(mutator) {
    writes = writes.then(async () => {
        const data = await readAll();
        const result = await mutator(data);
        await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
        await fs.promises.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
        return result;
    });
    return writes;
}

async function listPlaylists(userId) { return normaliseUser(await readAll(), userId).lists; }
async function getPlaylist(userId, listId) { return (await listPlaylists(userId)).find(list => list.id === listId) || null; }

function createPlaylist(userId, name) {
    return update(data => {
        const user = normaliseUser(data, userId);
        if (user.lists.length >= MAX_PLAYLISTS) throw new Error("En fazla 5 kişisel çalma listesi oluşturabilirsin.");
        const cleanName = String(name || "").trim().slice(0, 40);
        if (!cleanName) throw new Error("Çalma listesi adı gerekli.");
        const list = { id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: cleanName, tracks: [], createdAt: Date.now() };
        user.lists.push(list);
        return list;
    });
}

function addTrack(userId, listId, entry) {
    return update(data => {
        const list = normaliseUser(data, userId).lists.find(item => item.id === listId);
        if (!list) throw new Error("Çalma listesi bulunamadı.");
        if (list.tracks.some(item => item.query === entry.query)) return { added: false, count: list.tracks.length };
        list.tracks.push({ query: entry.query, title: entry.title, artist: entry.artist, artworkUrl: entry.artworkUrl || null, savedAt: Date.now() });
        if (list.tracks.length > MAX_TRACKS) list.tracks.splice(0, list.tracks.length - MAX_TRACKS);
        return { added: true, count: list.tracks.length };
    });
}

function removeTrack(userId, listId, index) {
    return update(data => {
        const list = normaliseUser(data, userId).lists.find(item => item.id === listId);
        if (!list || !list.tracks[index]) throw new Error("Şarkı bulunamadı.");
        return list.tracks.splice(index, 1)[0];
    });
}

function deletePlaylist(userId, listId) {
    return update(data => {
        const lists = normaliseUser(data, userId).lists;
        if (lists.length <= 1) throw new Error("En az bir kişisel çalma listesi kalmalı.");
        const index = lists.findIndex(list => list.id === listId);
        if (index < 0) throw new Error("Çalma listesi bulunamadı.");
        return lists.splice(index, 1)[0];
    });
}

module.exports = { MAX_PLAYLISTS, listPlaylists, getPlaylist, createPlaylist, addTrack, removeTrack, deletePlaylist };
