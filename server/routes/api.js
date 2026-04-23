const express = require('express');
const router = express.Router();
const { getDB } = require('../../db/database');
const client = require('../../bot/index');
router.post('/login', (req, res) => {
    res.json({ success: true, token: 'mock_token_123' });
});

router.get('/bots', async (req, res) => {
    try {
        const bots = await getDB().all('SELECT * FROM bots');
        res.json(bots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/bots/:botId/servers', async (req, res) => {
    try {
        const servers = await getDB().all(`
            SELECT s.*, 
                   (SELECT COUNT(*) FROM messages m JOIN tickets t ON m.ticketId = t.ticketId WHERE t.guildId = s.guildId AND m.isRead = 0) as unreadCount
            FROM servers s
            WHERE s.botId = ? AND s.isActive = 1
        `, [req.params.botId]);
        res.json(servers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/servers/:serverId/members', async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.params.serverId);
        if (!guild) return res.status(404).json({ error: 'Server not found' });
        
        await guild.members.fetch();
        const membersList = [];
        for (const [id, member] of guild.members.cache) {
            if (member.user.bot) continue;
            membersList.push({
                id: member.id,
                username: member.user.username,
                avatar: member.user.displayAvatarURL(),
                isOwner: guild.ownerId === member.id,
                isAdmin: member.permissions.has('Administrator') || member.permissions.has('ManageGuild')
            });
        }
        res.json(membersList);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/servers/:serverId/tickets', async (req, res) => {
    try {
        const tickets = await getDB().all(`
            SELECT t.*, u.username, u.avatar,
                   (SELECT COUNT(*) FROM messages m WHERE m.ticketId = t.ticketId AND m.isRead = 0) as unreadCount,
                   (SELECT MAX(timestamp) FROM messages m WHERE m.ticketId = t.ticketId) as lastMessageTime
            FROM tickets t 
            LEFT JOIN users u ON t.userId = u.discordId 
            WHERE t.guildId = ?
            ORDER BY lastMessageTime DESC NULLS LAST
        `, [req.params.serverId]);
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:ticketId/read', async (req, res) => {
    try {
        await getDB().run('UPDATE messages SET isRead = 1 WHERE ticketId = ?', [req.params.ticketId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/tickets/:ticketId/messages', async (req, res) => {
    try {
        const messages = await getDB().all('SELECT * FROM messages WHERE ticketId = ? ORDER BY timestamp ASC', [req.params.ticketId]);
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/create', async (req, res) => {
    try {
        const { userId, guildId, botId, username, avatar } = req.body;
        const db = getDB();
        
        await db.run(
            `INSERT INTO users (discordId, username, avatar, lastUpdated) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
             ON CONFLICT(discordId) DO UPDATE SET username=excluded.username, avatar=excluded.avatar, lastUpdated=CURRENT_TIMESTAMP`,
            [userId, username || 'Unknown', avatar || '']
        );
        
        let ticket = await db.get(`SELECT * FROM tickets WHERE userId = ? AND status = 'OPEN'`, [userId]);
        
        if (!ticket) {
            const ticketId = require('crypto').randomUUID();
            await db.run(
                `INSERT INTO tickets (ticketId, userId, guildId, botId, status) VALUES (?, ?, ?, ?, 'OPEN')`,
                [ticketId, userId, guildId, botId]
            );
            ticket = await db.get(`SELECT * FROM tickets WHERE ticketId = ?`, [ticketId]);
        }
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/tickets/:ticketId/move', async (req, res) => {
    try {
        const { targetGuildId } = req.body;
        await getDB().run(`UPDATE tickets SET guildId = ? WHERE ticketId = ?`, [targetGuildId, req.params.ticketId]);
        res.json({ success: true, targetGuildId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/messages/:id', async (req, res) => {
    try {
        const { content } = req.body;
        const msg = await getDB().get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
        if (!msg || !msg.discordMessageId) return res.status(400).json({ error: 'Cannot edit this message' });
        
        const ticket = await getDB().get('SELECT * FROM tickets WHERE ticketId = ?', [msg.ticketId]);
        const user = await client.users.fetch(ticket.userId);
        
        // Find user DM channel to fetch raw message
        const dm = await user.createDM();
        const dmMesg = await dm.messages.fetch(msg.discordMessageId);
        
        await dmMesg.edit({ content });
        await getDB().run('UPDATE messages SET content = ? WHERE id = ?', [content, req.params.id]);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/messages/:id', async (req, res) => {
    try {
        const msg = await getDB().get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
        if (!msg || !msg.discordMessageId) return res.status(400).json({ error: 'Cannot delete this message' });
        
        const ticket = await getDB().get('SELECT * FROM tickets WHERE ticketId = ?', [msg.ticketId]);
        const user = await client.users.fetch(ticket.userId);
        
        const dm = await user.createDM();
        const dmMesg = await dm.messages.fetch(msg.discordMessageId);
        
        await dmMesg.delete();
        await getDB().run('DELETE FROM messages WHERE id = ?', [req.params.id]);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/servers/:serverId', async (req, res) => {
    try {
        const guild = client.guilds.cache.get(req.params.serverId);
        if (guild) {
            await guild.leave();
        }
        await getDB().run('DELETE FROM servers WHERE guildId = ?', [req.params.serverId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:ticketId/fetch-history', async (req, res) => {
    try {
        const { limit = 50, mediaOnly = false } = req.body;
        const db = getDB();

        const ticket = await db.get('SELECT * FROM tickets WHERE ticketId = ?', [req.params.ticketId]);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        console.log(`[History Sync] Fetching history for ticket: ${ticket.ticketId}, user: ${ticket.userId}`);

        const user = await client.users.fetch(ticket.userId);
        const dmChannel = await user.createDM();

        // Get existing discord message IDs to avoid duplicates
        const existingRows = await db.all(
            'SELECT discordMessageId FROM messages WHERE ticketId = ? AND discordMessageId IS NOT NULL',
            [ticket.ticketId]
        );
        const existingIds = new Set(existingRows.map(r => r.discordMessageId));
        console.log(`[History Sync] Already have ${existingIds.size} messages in DB`);

        const oldestMsg = await db.get(
            'SELECT discordMessageId FROM messages WHERE ticketId = ? AND discordMessageId IS NOT NULL ORDER BY timestamp ASC LIMIT 1',
            [ticket.ticketId]
        );

        let fetchOptions = { limit: fetchLimit };
        if (oldestMsg && oldestMsg.discordMessageId) {
            fetchOptions.before = oldestMsg.discordMessageId;
        }

        const fetched = await dmChannel.messages.fetch(fetchOptions);
        console.log(`[History Sync] Fetched ${fetched.size} older messages from Discord`);

        const botId = client.user?.id;
        let imported = 0;
        let skipped = 0;

        // Sort oldest first so they insert in correct order
        const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const msg of sorted) {
            // Skip already-imported messages
            if (existingIds.has(msg.id)) {
                skipped++;
                continue;
            }

            // Build content string
            let content = msg.content || '';

            // Handle attachments (images, videos, files)
            if (msg.attachments.size > 0) {
                const links = [...msg.attachments.values()].map(a => `<media:${a.url}>`).join('\n');
                content = content ? `${content}\n${links}` : links;
            }

            // Handle stickers: treat as descriptive text
            if (msg.stickers?.size > 0 && !content) {
                content = `[Sticker: ${[...msg.stickers.values()].map(s => s.name).join(', ')}]`;
            }

            // Skip if truly empty (e.g. pure embed with no text)
            if (!content.trim()) {
                skipped++;
                continue;
            }

            // Apply media-only filter AFTER building content
            if (mediaOnly && msg.attachments.size === 0) {
                skipped++;
                continue;
            }

            const direction = botId && msg.author.id === botId ? 'OUT' : 'IN';
            const senderId = msg.author.id;
            const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').replace(/\..+/, '');

            await db.run(
                `INSERT INTO messages (ticketId, senderId, content, direction, discordMessageId, timestamp, isRead)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [ticket.ticketId, senderId, content, direction, msg.id, ts]
            );
            imported++;
        }

        console.log(`[History Sync] Done. Imported: ${imported}, Skipped: ${skipped}`);
        res.json({ success: true, imported, skipped, total: fetched.size });

    } catch (err) {
        console.error('[History Sync] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:ticketId/sync-recent', async (req, res) => {
    try {
        const db = getDB();
        const ticket = await db.get('SELECT * FROM tickets WHERE ticketId = ?', [req.params.ticketId]);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const user = await client.users.fetch(ticket.userId);
        const dmChannel = await user.createDM();

        const fetched = await dmChannel.messages.fetch({ limit: 15 });

        const existingRows = await db.all(
            'SELECT discordMessageId FROM messages WHERE ticketId = ? AND discordMessageId IS NOT NULL',
            [ticket.ticketId]
        );
        const existingIds = new Set(existingRows.map(r => r.discordMessageId));

        let imported = 0;
        const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const botId = client.user?.id;

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

            const direction = botId && msg.author.id === botId ? 'OUT' : 'IN';
            const senderId = msg.author.id;
            const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').replace(/\..+/, '');

            await db.run(
                `INSERT INTO messages (ticketId, senderId, content, direction, discordMessageId, timestamp, isRead)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [ticket.ticketId, senderId, content, direction, msg.id, ts, direction === 'IN' ? 0 : 1]
            );
            imported++;
        }

        res.json({ success: true, imported });
    } catch (err) {
        console.error('[Recent Sync] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
