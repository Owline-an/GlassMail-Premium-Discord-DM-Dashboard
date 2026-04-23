const { getDB } = require('../../db/database');

module.exports = (io, client) => {
    io.on('connection', (socket) => {
        console.log('Dashboard connected:', socket.id);

        socket.on('join:ticket', (ticketId) => {
            socket.join(`ticket_${ticketId}`);
            console.log(`Socket joined ticket room: ticket_${ticketId}`);
        });

        socket.on('reply:sent', async (data) => {
            let { ticketId, content, senderId, attachment } = data;
            const db = getDB();
            
            try {
                const sendPayload = { content: content || '' };
                if (attachment && attachment.data) {
                    const buffer = Buffer.from(attachment.data.split(',')[1], 'base64');
                    sendPayload.files = [{ attachment: buffer, name: attachment.name }];
                }

                let discord_message_id = null;
                let final_content = sendPayload.content;

                const ticket = await db.get(`SELECT * FROM tickets WHERE ticketId = ?`, [ticketId]);
                if (ticket) {
                    const user = await client.users.fetch(ticket.userId);
                    if (user) {
                        const sentMsg = await user.send(sendPayload);
                        discord_message_id = sentMsg.id;
                        
                        // Extract live image URL if available
                        if (sentMsg.attachments.size > 0) {
                            const newUrls = sentMsg.attachments.map(a => `<media:${a.url}>`).join('\n');
                            final_content = (final_content ? final_content + '\n' : '') + newUrls;
                        } else if (attachment) {
                            final_content = (final_content ? final_content + '\n' : '') + `[Sent File: ${attachment.name}]`;
                        }
                    }
                }

                await db.run(
                    `INSERT INTO messages (ticketId, senderId, content, direction, discordMessageId) VALUES (?, ?, ?, ?, ?)`,
                    [ticketId, senderId, final_content || '[File]', 'OUT', discord_message_id]
                );
                
                const newMsg = await db.get(`SELECT * FROM messages WHERE id = last_insert_rowid()`);

                io.emit('message:new', newMsg);
                
            } catch (error) {
                console.error('Error sending reply via bot:', error);
                socket.emit('error', 'Failed to send message via Discord.');
            }
        });

        socket.on('disconnect', () => {
            console.log('Dashboard disconnected:', socket.id);
        });
    });
};
