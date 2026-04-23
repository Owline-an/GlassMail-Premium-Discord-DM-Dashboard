const { getDB } = require('../../db/database');

module.exports = {
    name: 'guildCreate',
    async execute(guild, client) {
        console.log(`Joined new guild: ${guild.name}`);
        const db = getDB();
        try {
            await db.run(
                `INSERT INTO servers (guildId, botId, guildName, iconUrl, isActive) 
                 VALUES (?, ?, ?, ?, 1) 
                 ON CONFLICT(guildId, botId) DO UPDATE SET guildName=excluded.guildName, iconUrl=excluded.iconUrl, isActive=1`,
                [guild.id, client.user.id, guild.name, guild.iconURL() || '']
            );
        } catch (error) {
            console.error('Error on guildCreate:', error);
        }
    }
};
