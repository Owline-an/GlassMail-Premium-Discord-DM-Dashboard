const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDB() {
    db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS bots (
            clientId TEXT PRIMARY KEY,
            token TEXT,
            name TEXT,
            ownerId TEXT,
            addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS servers (
            guildId TEXT,
            botId TEXT,
            guildName TEXT,
            iconUrl TEXT,
            isActive INTEGER DEFAULT 1,
            addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guildId, botId)
        );

        CREATE TABLE IF NOT EXISTS tickets (
            ticketId TEXT PRIMARY KEY,
            userId TEXT,
            guildId TEXT,
            botId TEXT,
            status TEXT DEFAULT 'OPEN',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            closedAt DATETIME
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticketId TEXT,
            senderId TEXT,
            content TEXT,
            direction TEXT,
            timestamp DATETIME DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS users (
            discordId TEXT PRIMARY KEY,
            username TEXT,
            avatar TEXT,
            lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    // Add dynamically added columns
    try {
        await db.exec(`ALTER TABLE messages ADD COLUMN discordMessageId TEXT;`);
    } catch(err) {}
    try {
        await db.exec(`ALTER TABLE messages ADD COLUMN isRead INTEGER DEFAULT 1;`);
    } catch(err) {}

    console.log('SQLite database initialized.');
    return db;
}

function getDB() {
    if (!db) throw new Error('Database not initialized!');
    return db;
}

module.exports = { initDB, getDB };
