const fs = require("fs");
const path = require("path");

const dataDirectory = path.join(__dirname, "..", "data");
const historyFile = path.join(dataDirectory, "kayit-gecmisi.jsonl");

function saveRegistration(entry) {
    fs.mkdirSync(dataDirectory, { recursive: true });

    const record = {
        ...entry,
        registeredAt: new Date().toISOString()
    };

    fs.appendFileSync(
        historyFile,
        `${JSON.stringify(record)}\n`,
        "utf8"
    );
}

function getRegistrations() {
    if (!fs.existsSync(historyFile)) return [];

    return fs
        .readFileSync(historyFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .reduce((records, line) => {
            try {
                records.push(JSON.parse(line));
            } catch {
                // Bozuk bir satır varsa diğer kayıtlar okunmaya devam eder.
            }

            return records;
        }, []);
}

module.exports = {
    saveRegistration,
    getRegistrations,
    historyFile
};