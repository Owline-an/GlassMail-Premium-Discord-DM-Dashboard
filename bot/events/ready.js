const { getDB } = require('../../db/database');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`Bot logged in as ${client.user.tag}`);
        const db = getDB();

        try {
            await db.run(
                `INSERT INTO bots (clientId, name) VALUES (?, ?) 
                 ON CONFLICT(clientId) DO UPDATE SET name=excluded.name`,
                [client.user.id, client.user.username]
            );

            // Sync servers
            const guilds = client.guilds.cache;
            for (const [guildId, guild] of guilds) {
                await db.run(
                    `INSERT INTO servers (guildId, botId, guildName, iconUrl, isActive) 
                     VALUES (?, ?, ?, ?, 1) 
                     ON CONFLICT(guildId, botId) DO UPDATE SET guildName=excluded.guildName, iconUrl=excluded.iconUrl, isActive=1`,
                    [guildId, client.user.id, guild.name, guild.iconURL() || '']
                );
            }
            
            const guildIds = Array.from(guilds.keys());
            if (guildIds.length > 0) {
                const placeholders = guildIds.map(() => '?').join(',');
                await db.run(
                    `UPDATE servers SET isActive = 0 WHERE botId = ? AND guildId NOT IN (${placeholders})`,
                    [client.user.id, ...guildIds]
                );
            } else {
                await db.run(`UPDATE servers SET isActive = 0 WHERE botId = ?`, [client.user.id]);
            }

            console.log('Bot guilds synced successfully with SQLite.');

            // Background Offline Scan
            setTimeout(async () => {
                try {
                    const openTickets = await db.all(`SELECT * FROM tickets WHERE status = 'OPEN'`);
                    if (openTickets.length > 0) {
                        console.log(`[Offline Sync] Checking ${openTickets.length} open tickets for missed messages while offline...`);
                        
                        for (const ticket of openTickets) {
                            try {
                                const user = await client.users.fetch(ticket.userId).catch(()=>null);
                                if (!user) continue;
                                
                                const dmChannel = await user.createDM();
                                const fetched = await dmChannel.messages.fetch({ limit: 15 });
                                
                                const existingRows = await db.all(
                                    'SELECT discordMessageId FROM messages WHERE ticketId = ? AND discordMessageId IS NOT NULL',
                                    [ticket.ticketId]
                                );
                                const existingIds = new Set(existingRows.map(r => r.discordMessageId));
                                
                                const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                                const botId = client.user.id;
                                
                                for (const msg of sorted) {
                                    if (existingIds.has(msg.id)) continue;
                                    
                                    let content = msg.content || '';
                                    if (msg.attachments.size > 0) {
                                        const links = [...msg.attachments.values()].map(a => `<media:${a.url}>`).join('\n');
                                        content = content ? `${content}\n${links}` : links;
                                    }
                                    if (msg.stickers?.size > 0 && !content) {
                                        content = `[Sticker: ${[...msg.stickers.values()].map(s => s.name).join(', ')}]`;
                                    }
                                    if (!content.trim()) continue;

                                    const direction = msg.author.id === botId ? 'OUT' : 'IN';
                                    const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').replace(/\..+/, '');

                                    await db.run(
                                        `INSERT INTO messages (ticketId, senderId, content, direction, discordMessageId, timestamp, isRead)
                                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                        [ticket.ticketId, msg.author.id, content, direction, msg.id, ts, direction === 'IN' ? 0 : 1]
                                    );
                                    
                                    // Alert dashboard of missed message!
                                    const newMsg = await db.get(`SELECT * FROM messages WHERE id = last_insert_rowid()`);
                                    if (global.io) {
                                        global.io.emit('message:new', newMsg);
                                        // Emit notification badge specifically for the related guild
                                        global.io.emit('notification:new', { guildId: ticket.guildId, ticketId: ticket.ticketId });
                                    }
                                }
                            } catch(e) {
                                // Ignore simple fetch errors
                            }
                            
                            // Anti-abuse delay ~ 1.5 seconds between ticket DM fetches
                            await new Promise(r => setTimeout(r, 1500));
                        }
                        console.log(`[Offline Sync] Finished scanning tickets.`);
                    }
                } catch(e) {
                    console.error('[Offline Sync] Failed to complete sync:', e);
                }
            }, 5000); // Wait 5 seconds after ready to start syncing safely

        } catch (error) {
            console.error('Error syncing bot guilds:', error);
        }
    },
};
