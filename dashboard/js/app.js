const app = {
    socket: null,
    currentBotId: null,
    currentServerId: null,
    currentTicketId: null,
    currentFile: null,
    currentTab: 'tickets',
    soundEnabled: true,
    volume: 0.5,

    toggleSettings() {
        const modal = document.getElementById('settings-modal');
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    },

    updateSettingsUI() {
        const btn = document.getElementById('modal-sound-btn');
        if (btn) {
            if (this.soundEnabled) {
                btn.innerHTML = '<i class="fa-solid fa-bell"></i> On';
                btn.style.color = '#f1c40f';
                btn.style.borderColor = '#f1c40f';
            } else {
                btn.innerHTML = '<i class="fa-solid fa-bell-slash"></i> Off';
                btn.style.color = 'var(--text-secondary)';
                btn.style.borderColor = 'var(--border-color)';
            }
        }
        const slider = document.getElementById('modal-volume-slider');
        if (slider) slider.value = this.volume;
    },

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        localStorage.setItem('soundEnabled', this.soundEnabled);
        this.updateSettingsUI();
    },

    setVolume(val) {
        this.volume = parseFloat(val);
        localStorage.setItem('alertVolume', this.volume);
    },

    testSound() {
        const audio = document.getElementById('notification-sound');
        if (audio) {
            audio.volume = this.volume;
            audio.currentTime = 0;
            audio.play().catch(() => { });
        }
    },

    init() {
        console.log("App initialized");
        const token = localStorage.getItem('token');

        this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
        this.volume = localStorage.getItem('alertVolume') !== null ? parseFloat(localStorage.getItem('alertVolume')) : 0.5;
        this.updateSettingsUI();

        // Mock token check
        if (token) {
            this.showView('bots-view');
            this.loadBots();
            this.initSocket();
        } else {
            this.showView('login-view');
        }

        // Setup Enter key for sending messages
        const input = document.getElementById('chat-input-box');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    },

    initSocket() {
        if (!this.socket) {
            this.socket = io();

            this.socket.on('connect', () => {
                console.log('Socket connected');
                if (this.currentBotId) {
                    if (document.getElementById('servers-view').style.display !== 'none') {
                        this.loadServers();
                    } else if (document.getElementById('server-details').style.display !== 'none' && this.currentServerId) {
                        this.loadTickets();
                        if (this.currentTicketId) this.loadMessages();
                    }
                }
            });

            this.socket.on('message:new', (msg) => {
                if (msg.direction === 'IN' && this.soundEnabled) {
                    const audio = document.getElementById('notification-sound');
                    if (audio) {
                        audio.volume = this.volume;
                        audio.currentTime = 0;
                        audio.play().catch(() => { });
                    }
                }

                if (msg.ticketId === this.currentTicketId) {
                    this.renderMessage(msg);
                    this.scrollToBottom();
                } else if (msg.direction === 'IN') {
                    // Update and sort tickets list if not viewing the active ticket
                    this.loadTickets();
                }
            });

            this.socket.on('notification:new', (data) => {
                // Background refresh on servers list if new unread triggers appear globally
                if (this.currentServerId !== data.guildId) {
                    if (document.getElementById('servers-view').style.display !== 'none') {
                        this.loadServers();
                    }
                }
            });
        }
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    },

    setTab(tab) {
        const tabTickets = document.getElementById('tab-tickets');
        const tabMembers = document.getElementById('tab-members');
        const listTickets = document.getElementById('ticket-list');
        const listMembers = document.getElementById('member-list');

        if (tab === 'tickets') {
            tabTickets.style.borderBottom = '2px solid var(--brand-primary)';
            tabTickets.style.color = 'var(--text-primary)';
            tabMembers.style.borderBottom = '2px solid transparent';
            tabMembers.style.color = 'var(--text-secondary)';
            listTickets.style.display = 'block';
            listMembers.style.display = 'none';
        } else {
            tabMembers.style.borderBottom = '2px solid var(--brand-primary)';
            tabMembers.style.color = 'var(--text-primary)';
            tabTickets.style.borderBottom = '2px solid transparent';
            tabTickets.style.color = 'var(--text-secondary)';
            listMembers.style.display = 'block';
            listTickets.style.display = 'none';
        }
        this.currentTab = tab;
        if (document.getElementById('sidebar-search').value) {
            this.handleSearch();
        }
    },

    handleSearch() {
        const srch = document.getElementById('sidebar-search');
        if (!srch) return;
        const query = srch.value.toLowerCase();
        const listId = this.currentTab === 'tickets' ? 'ticket-list' : 'member-list';
        const items = document.querySelectorAll(`#${listId} .ticket-item`);

        items.forEach(item => {
            const searchData = item.getAttribute('data-search') || item.innerText.toLowerCase();
            if (searchData.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    },

    async login() {
        // Mock login
        // Real implementation would redirect to Discord OAuth
        const res = await fetch('/api/login', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('token', data.token);
            this.initSocket();
            this.loadBots();
            this.showView('bots-view');
        }
    },

    logout() {
        localStorage.removeItem('token');
        if (this.socket) this.socket.disconnect();
        this.socket = null;
        this.showView('login-view');
    },

    async loadBots() {
        const grid = document.getElementById('bots-grid');
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const res = await fetch('/api/bots');
            const bots = await res.json();

            if (bots.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">No bots found. Start the bot first!</div>';
                return;
            }

            grid.innerHTML = bots.map((bot, i) => `
                <div class="glass-pane card animate-slide" style="animation-delay: ${i * 0.1}s" onclick="app.selectBot('${bot.clientId}', '${bot.name}')">
                    <div class="card-header">
                        <div class="card-icon"><i class="fa-solid fa-robot"></i></div>
                        <div>
                            <div class="card-title">${bot.name}</div>
                            <div class="card-subtitle">ID: ${bot.clientId}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            grid.innerHTML = `<div>Error loading bots</div>`;
        }
    },

    async selectBot(botId, botName) {
        this.currentBotId = botId;
        document.getElementById('current-bot-name').innerText = botName;
        this.showView('servers-view');
        this.loadServers();
    },

    async loadServers() {
        const grid = document.getElementById('servers-grid');
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const res = await fetch(`/api/bots/${this.currentBotId}/servers`);
            let servers = await res.json();

            servers.unshift({ guildId: 'GLOBAL', guildName: 'Direct Messages (Global)', iconUrl: '' });

            if (servers.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">Bot is not in any servers.</div>';
                return;
            }

            grid.innerHTML = servers.map((server, i) => `
                <div class="glass-pane card animate-slide" id="server-${server.guildId}" style="animation-delay: ${i * 0.1}s; position: relative;">
                    ${server.unreadCount > 0 ? `<div style="position: absolute; top: 10px; left: 10px; display: flex; gap: 5px; z-index: 5;">
                        <span class="server-notification-badge" style="background:var(--danger); color:#fff; font-size:0.9rem; padding: 3px 10px; border-radius:12px; font-weight:bold; box-shadow: 0 0 10px var(--danger);">${server.unreadCount}</span>
                    </div>` : ''}
                    <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px; z-index: 5;">
                        ${server.guildId !== 'GLOBAL' ? `
                        <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem; border-color: var(--brand-primary); color: var(--brand-primary);" onclick="event.stopPropagation(); app.inviteBot('${server.guildId}')" title="Invite another bot to this server"><i class="fa-solid fa-user-plus"></i></button>
                        <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem; border-color: var(--danger); color: var(--danger);" onclick="event.stopPropagation(); app.leaveServerFromGrid('${server.guildId}', '${server.guildName.replace(/'/g, "\\'")}')" title="Remove bot from server"><i class="fa-solid fa-right-from-bracket"></i></button>
                        ` : ''}
                    </div>
                    <div class="card-header" onclick="app.selectServer('${server.guildId}', '${server.guildName.replace(/'/g, "\\'")}')" style="margin-top: 15px;">
                        <div class="card-icon">
                            ${server.iconUrl ? `<img src="${server.iconUrl}" style="width:100%; border-radius:50%">` : `<i class="fa-solid fa-server"></i>`}
                        </div>
                        <div>
                            <div class="card-title">${server.guildName}</div>
                            <div class="card-subtitle">Server</div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            grid.innerHTML = `<div>Error loading servers</div>`;
        }
    },

    async selectServer(serverId, serverName) {
        this.currentServerId = serverId;
        document.getElementById('current-server-name').innerText = serverName;
        this.showView('chat-view');

        document.getElementById('chat-empty').style.display = 'flex';
        document.getElementById('chat-active').style.display = 'none';

        this.loadTickets();
        this.loadMembers();
        this.setTab('tickets');
    },

    async loadTickets() {
        const list = document.getElementById('ticket-list');
        list.innerHTML = '<div style="padding: 20px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';

        try {
            const res = await fetch(`/api/servers/${this.currentServerId}/tickets`);
            const tickets = await res.json();

            if (tickets.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No open tickets</div>';
                return;
            }

            list.innerHTML = tickets.map(ticket => `
                <div class="ticket-item" id="ticket-${ticket.ticketId}" data-search="user ${ticket.userId} ${(ticket.username || '').toLowerCase()} ${ticket.status.toLowerCase()}" onclick="app.selectTicket('${ticket.ticketId}', '${ticket.userId}')">
                    <img src="${ticket.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:32px; height:32px; border-radius:50%; margin-right: 15px; flex-shrink: 0;">
                    <div style="flex:1; display:flex; justify-content:space-between; align-items:center;">
                        <div class="ticket-info" style="margin:0;">
                            <div class="ticket-name">
                                ${ticket.username || 'User ' + ticket.userId}
                                ${ticket.unreadCount > 0 ? `<span class="notification-badge" style="background:var(--danger); color:#fff; font-size:0.75rem; padding: 2px 6px; border-radius:10px; margin-left:10px; font-weight:bold;">${ticket.unreadCount}</span>` : ''}
                            </div>
                            <div class="ticket-preview">Status: ${ticket.status}</div>
                        </div>
                        <div class="status-dot ${ticket.status === 'CLOSED' ? 'closed' : ''}" style="position:relative; margin:0;"></div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = `<div>Error loading tickets</div>`;
        }
    },

    async loadMembers() {
        const list = document.getElementById('member-list');
        list.innerHTML = '<div style="padding: 20px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';

        try {
            const res = await fetch(`/api/servers/${this.currentServerId}/members`);
            const members = await res.json();

            if (members.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No members found or bot lacks permissions.</div>';
                return;
            }

            members.sort((a, b) => {
                if (a.isOwner) return -1;
                if (b.isOwner) return 1;
                if (a.isAdmin && !b.isAdmin) return -1;
                if (!a.isAdmin && b.isAdmin) return 1;
                return a.username.localeCompare(b.username);
            });

            list.innerHTML = members.map(m => `
                <div class="ticket-item" data-search="${m.username.toLowerCase()} ${m.id}" onclick="app.startDirectChat('${m.id}', '${m.username.replace(/'/g, "\\'")}', '${m.avatar || ''}')">
                    <img src="${m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:32px; height:32px; border-radius:50%; margin-right: 15px; flex-shrink: 0;">
                    <div class="ticket-info">
                        <div class="ticket-name">${m.username} ${m.isOwner ? '👑' : (m.isAdmin ? '🛡️' : '')}</div>
                        <div class="ticket-preview">${m.isOwner ? 'Owner' : (m.isAdmin ? 'Admin' : 'Member')} <span style="font-size:0.7rem; color:var(--text-secondary);">(${m.id})</span></div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = `<div>Error loading members</div>`;
        }
    },

    async startDirectChat(userId, username, avatar) {
        document.getElementById('chat-empty').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><h3>Opening chat...</h3>';
        document.getElementById('chat-empty').style.display = 'flex';
        document.getElementById('chat-active').style.display = 'none';

        const res = await fetch(`/api/tickets/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, guildId: this.currentServerId, botId: this.currentBotId, username, avatar })
        });
        const data = await res.json();

        if (data.ticketId) {
            this.setTab('tickets');
            await this.loadTickets();
            this.selectTicket(data.ticketId, userId);
        }
    },

    async selectTicket(ticketId, userId) {
        // UI update
        document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('active-ticket'));
        document.getElementById(`ticket-${ticketId}`).classList.add('active-ticket');

        this.currentTicketId = ticketId;

        // Show chat interface
        document.getElementById('chat-empty').style.display = 'none';
        const activeChat = document.getElementById('chat-active');
        activeChat.style.display = 'flex';

        document.getElementById('chat-username').innerText = document.querySelector(`#ticket-${ticketId} .ticket-name`)?.innerText.replace(/\s*\d+$/, '') || `User ${userId}`;
        document.getElementById('chat-discord-id').innerText = `ID: ${userId}`;

        // Join socket room
        if (this.socket) {
            this.socket.emit('join:ticket', ticketId);
        }

        // Mark Messages as Read
        fetch(`/api/tickets/${ticketId}/read`, { method: 'POST' }).then(() => {
            const badge = document.querySelector(`#ticket-${ticketId} .notification-badge`);
            if (badge) badge.remove();
        }).catch(() => { });

        await this.loadMessages();

        // Auto-sync offline messages
        try {
            const res = await fetch(`/api/tickets/${ticketId}/sync-recent`, { method: 'POST' });
            const data = await res.json();
            if (data.success && data.imported > 0) {
                console.log(`Auto-synced ${data.imported} offline messages.`);
                await this.loadMessages();
            }
        } catch (e) { }
    },

    async loadMessages() {
        if (!this.currentTicketId) return;
        const container = document.getElementById('messages-container');
        container.innerHTML = '<div style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading messages...</div>';

        try {
            const res = await fetch(`/api/tickets/${this.currentTicketId}/messages`);
            const messages = await res.json();

            container.innerHTML = '';
            messages.forEach(msg => this.renderMessage(msg));
            this.scrollToBottom();
        } catch (e) {
            container.innerHTML = '<div>Error loading messages</div>';
        }
    },

    renderMessage(msg) {
        const container = document.getElementById('messages-container');
        const directionClass = msg.direction === 'IN' ? 'in' : 'out';

        const date = new Date(msg.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let displayContent = msg.content ? msg.content.replace(/\n/g, '<br>').replace(/\\n/g, '<br>') : '';
        displayContent = displayContent.replace(/<media:(https?:\/\/[^\s>]+)>/g, (match, url) => {
            // Images
            if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) {
                return `<br><img src="${url}" style="max-width: 100%; border-radius: 8px; margin-top: 8px; max-height: 300px; cursor:pointer;" onclick="window.open('${url}','_blank')">`;
            }
            // Videos
            if (url.match(/\.(mp4|webm|mov)(\?.*)?$/i)) {
                return `<br><video controls style="max-width: 100%; border-radius: 8px; margin-top: 8px; max-height: 300px; background:#000;">
                    <source src="${url}">
                    <a href="${url}" target="_blank" style="color: var(--brand-primary);">Open Video</a>
                </video>`;
            }
            // Audio
            if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
                return `<br><audio controls style="width: 100%; margin-top: 8px;">
                    <source src="${url}">
                    <a href="${url}" target="_blank" style="color: var(--brand-primary);">Open Audio</a>
                </audio>`;
            }
            // Other files
            const fileName = url.split('/').pop().split('?')[0];
            return `<br><a href="${url}" target="_blank" style="color: var(--brand-primary); display:inline-flex; align-items:center; gap:6px; padding:8px 12px; background:var(--bg-secondary); border-radius:8px; margin-top:8px; text-decoration:none;"><i class="fa-solid fa-file-arrow-down"></i> ${fileName}</a>`;
        });

        const div = document.createElement('div');
        div.className = `message ${directionClass} animate-slide`;
        div.id = `msg-${msg.id}`;

        let actionsHtml = '';
        if (msg.direction === 'OUT' && msg.discordMessageId) {
            const safeContent = (msg.content || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            actionsHtml = `
            <div class="msg-actions" style="position: absolute; right: 10px; top: -10px; background: var(--bg-card); padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border-color); display: none; gap: 15px; font-size: 0.85rem; z-index: 10;">
                <i class="fa-solid fa-pen" style="cursor: pointer; color: var(--text-secondary); transition: 0.2s;" onmouseover="this.style.color='var(--brand-primary)'" onmouseout="this.style.color='var(--text-secondary)'" onclick="app.editMessage(${msg.id}, \`${safeContent}\`)"></i>
                <i class="fa-solid fa-trash" style="cursor: pointer; color: var(--text-secondary); transition: 0.2s;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'" onclick="app.deleteMessage(${msg.id})"></i>
            </div>
            `;
        }

        div.innerHTML = `
            ${actionsHtml}
            <div class="message-content" id="msg-content-${msg.id}">${displayContent}</div>
            <div class="message-meta">${timeStr}</div>
        `;

        if (actionsHtml) {
            div.style.position = 'relative';
            div.onmouseover = () => { const a = div.querySelector('.msg-actions'); if (a) a.style.display = 'flex'; };
            div.onmouseout = () => { const a = div.querySelector('.msg-actions'); if (a) a.style.display = 'none'; };
        }

        container.appendChild(div);
    },

    scrollToBottom() {
        const container = document.getElementById('messages-container');
        container.scrollTop = container.scrollHeight;
    },

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 8 * 1024 * 1024) { return alert("File too big (Max 8MB allowed)"); }
            const reader = new FileReader();
            reader.onload = (e) => {
                this.currentFile = {
                    name: file.name,
                    data: e.target.result
                };
                document.getElementById('file-preview-name').innerText = file.name;
                document.getElementById('file-preview-area').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    },

    clearFile() {
        this.currentFile = null;
        document.getElementById('chat-file-input').value = "";
        document.getElementById('file-preview-area').style.display = 'none';
    },

    async moveTicket() {
        const newServerId = prompt("Enter Server ID (Guild ID) to move this ticket to:");
        if (newServerId && newServerId.trim() !== "") {
            const res = await fetch(`/api/tickets/${this.currentTicketId}/move`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetGuildId: newServerId })
            });
            const data = await res.json();
            if (data.success) {
                alert("Ticket moved successfully!");
                this.showView('servers-view');
            }
        }
    },

    async fetchHistory() {
        if (!this.currentTicketId) return;

        const limitStr = prompt("How many messages to load from Discord? (Max 100 per request)", "50");
        if (!limitStr) return;
        const limit = Math.min(parseInt(limitStr) || 50, 100);

        const mediaOnly = confirm("Load ONLY messages with media/attachments?\n\nOK = Media only  |  Cancel = All messages");

        // Show loading indicator
        const btn = document.querySelector('[onclick="app.fetchHistory()"]');
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const res = await fetch(`/api/tickets/${this.currentTicketId}/fetch-history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit, mediaOnly })
            });
            const data = await res.json();

            if (data.success) {
                if (data.imported === 0) {
                    alert(`✅ No new messages to import.\nChecked: ${data.total} | Already synced: ${data.skipped}`);
                } else {
                    alert(`✅ Synced ${data.imported} new messages!\nChecked: ${data.total} | Skipped (duplicates): ${data.skipped}`);
                    await this.loadMessages();
                }
            } else {
                alert(`❌ Failed: ${data.error}`);
            }
        } catch (e) {
            alert('Failed to sync history. Make sure the bot is online and has access to this user\'s DMs.');
        } finally {
            if (btn) btn.innerHTML = originalHtml || '<i class="fa-solid fa-clock-rotate-left"></i>';
        }
    },

    async editMessage(id, oldContent) {
        const newContent = prompt("Edit your message:", oldContent);
        if (newContent !== null && newContent !== oldContent && newContent.trim() !== '') {
            try {
                const res = await fetch(`/api/messages/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent })
                });
                if (res.ok) {
                    await this.loadMessages();
                } else {
                    alert('Failed to edit message. It might be too old or not cached.');
                }
            } catch (e) { }
        }
    },

    async deleteMessage(id) {
        if (confirm("Are you sure you want to delete this message in Discord?")) {
            try {
                const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    const el = document.getElementById(`msg-${id}`);
                    if (el) el.remove();
                } else {
                    alert('Failed to delete message.');
                }
            } catch (e) { }
        }
    },

    async leaveServer() {
        if (this.currentServerId === 'GLOBAL') {
            return alert("This is a Global DM container. There is no server to leave.");
        }
        if (confirm(`Are you absolutely sure you want the bot to LEAVE this server?`)) {
            try {
                const res = await fetch(`/api/servers/${this.currentServerId}`, { method: 'DELETE' });
                if (res.ok) {
                    alert('Bot has left the server.');
                    this.showView('servers-view');
                    this.loadServers();
                } else {
                    alert('Failed to leave server.');
                }
            } catch (e) { }
        }
    },

    async leaveServerFromGrid(guildId, guildName) {
        if (confirm(`Are you absolutely sure you want the bot to LEAVE server: ${guildName}?`)) {
            try {
                const res = await fetch(`/api/servers/${guildId}`, { method: 'DELETE' });
                if (res.ok) {
                    this.loadServers();
                } else {
                    alert('Failed to leave server.');
                }
            } catch (e) { }
        }
    },

    inviteBot(guildId) {
        const otherBotId = prompt("To invite another bot, please enter its Client / Application ID:");
        if (otherBotId && otherBotId.trim() !== "") {
            let inviteUrl = `https://discord.com/oauth2/authorize?client_id=${otherBotId.trim()}&permissions=8&scope=bot`;
            if (guildId && typeof guildId === 'string' && guildId !== 'GLOBAL') {
                inviteUrl += `&guild_id=${guildId}&disable_guild_select=true`;
            }
            window.open(inviteUrl, '_blank');
        }
    },

    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,

    async toggleVoiceRecord() {
        if (this.isRecording) {
            this.mediaRecorder.stop();
            document.getElementById('btn-record-voice').innerHTML = '<i class="fa-solid fa-microphone"></i>';
            document.getElementById('btn-record-voice').style.color = 'var(--text-secondary)';
            document.getElementById('chat-input-box').placeholder = "Type your message here...";
            this.isRecording = false;
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                this.audioChunks = [];

                this.mediaRecorder.addEventListener("dataavailable", event => {
                    this.audioChunks.push(event.data);
                });

                this.mediaRecorder.addEventListener("stop", () => {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    stream.getTracks().forEach(track => track.stop());
                    this.sendVoiceMessage(audioBlob);
                });

                this.mediaRecorder.start();
                this.isRecording = true;

                document.getElementById('btn-record-voice').innerHTML = '<i class="fa-solid fa-circle-stop fa-beat"></i>';
                document.getElementById('btn-record-voice').style.color = 'var(--danger)';
                document.getElementById('chat-input-box').placeholder = "Recording voice message... Click stop to send.";
            } catch (err) {
                alert("Microphone permission denied or not available.");
            }
        }
    },

    sendVoiceMessage(blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result;
            if (this.socket && this.currentTicketId) {
                this.socket.emit('reply:sent', {
                    ticketId: this.currentTicketId,
                    content: '',
                    senderId: 'ADMIN',
                    attachment: {
                        name: 'voice_message.ogg',
                        data: base64data
                    }
                });
            }
        };
        reader.readAsDataURL(blob);
    },

    sendMessage() {
        if (!this.currentTicketId) return;

        const input = document.getElementById('chat-input-box');
        const content = input.value.trim();

        if (content || this.currentFile) {
            if (this.socket) {
                this.socket.emit('reply:sent', {
                    ticketId: this.currentTicketId,
                    content: content,
                    senderId: 'owner',
                    attachment: this.currentFile
                });
            }
            input.value = '';
            this.clearFile();
        }
    }
};

window.onload = () => app.init();
