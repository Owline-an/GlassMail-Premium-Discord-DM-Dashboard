const { getDB } = require('../../db/database');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot) return;

        if (!message.guild) {
            const db = getDB();
            try {
                await db.run(
                    `INSERT INTO users (discordId, username, avatar, lastUpdated) 
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
                     ON CONFLICT(discordId) DO UPDATE SET username=excluded.username, avatar=excluded.avatar, lastUpdated=CURRENT_TIMESTAMP`,
                    [message.author.id, message.author.username, message.author.displayAvatarURL() || '']
                );

                let ticket = await db.get(
                    `SELECT * FROM tickets WHERE userId = ? AND status = 'OPEN'`,
                    [message.author.id]
                );

                if (!ticket) {
                    let mutualGuildId = null;
                    let mutualCount = 0;
                    
                    const guilds = Array.from(client.guilds.cache.values());
                    await Promise.all(guilds.map(async (guild) => {
                        try {
                            const member = await guild.members.fetch(message.author.id).catch(() => null);
                            if (member) {
                                mutualCount++;
                                mutualGuildId = guild.id;
                            }
                        } catch(err) {}
                    }));

                    const targetGuildId = (mutualCount === 1) ? mutualGuildId : 'GLOBAL';
                    const ticketId = require('crypto').randomUUID();
                    const botId = client.user.id;
                    
                    await db.run(
                        `INSERT INTO tickets (ticketId, userId, guildId, botId, status) VALUES (?, ?, ?, ?, 'OPEN')`,
                        [ticketId, message.author.id, targetGuildId, botId]
                    );
                    ticket = await db.get(`SELECT * FROM tickets WHERE ticketId = ?`, [ticketId]);
                }

                let finalContent = message.content;
                if (message.attachments.size > 0) {
                    const links = message.attachments.map(a => `<media:${a.url}>`).join('\n'); // Unique tag to parse later easily
                    finalContent += (finalContent ? '\n' : '') + links;
                }
                if (!finalContent || finalContent.trim() === '') {
                    finalContent = '[Invalid Content]';
                }

                await db.run(
                    `INSERT INTO messages (ticketId, senderId, content, direction, discordMessageId, isRead) VALUES (?, ?, ?, ?, ?, ?)`,
                    [ticket.ticketId, message.author.id, finalContent, 'IN', message.id, 0]
                );
                
                const newMsg = await db.get(`SELECT * FROM messages WHERE id = last_insert_rowid()`);

                if (global.io) {
                    global.io.emit('message:new', newMsg);
                    global.io.emit('notification:new', { guildId: ticket.guildId, ticketId: ticket.ticketId });
                }
                
                message.react('✅').catch(()=>null);
            } catch (error) {
                console.error('Error handling DM message:', error);
                message.reply('There was an error processing your message.');
            }
        }
    }
};
