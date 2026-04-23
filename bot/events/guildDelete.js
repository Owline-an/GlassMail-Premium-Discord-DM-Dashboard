const { getDB } = require('../../db/database');

module.exports = {
    name: 'guildDelete',
    async execute(guild, client) {
        console.log(`Left guild: ${guild.name}`);
        const db = getDB();
        try {
            await db.run(
                `UPDATE servers SET isActive = 0 WHERE guildId = ? AND botId = ?`,
                [guild.id, client.user.id]
            );
        } catch (error) {
            console.error('Error on guildDelete:', error);
        }
    }
};
