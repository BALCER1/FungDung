const Lobby = {
    el: {},
    lobbies: [],
    picked: null,
    busy: false,
    linkId: null,
    ticks: 0,

    init() {
        for (const id of [
            'multiMsg', 'multiHostBtn', 'multiJoinBtn',
            'hostForm', 'hostName', 'hostVisibility', 'hostPassRow', 'hostPassword', 'hostMsg',
            'joinList', 'joinEmpty', 'joinRefreshBtn', 'joinPassForm', 'joinPassLabel', 'joinPassword', 'joinMsg',
            'lobbyTitle', 'lobbyPlayers', 'lobbyLink', 'lobbyCopyBtn', 'lobbyQr', 'lobbyHostNote', 'lobbyMsg',
            'lobbyStartBtn', 'menuNotice'
        ]) {
            this.el[id] = document.getElementById(id);
        }
        const e = this.el;
        const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);

        on('multiHostBtn', () => this.openHost());
        on('multiJoinBtn', () => this.openJoin());
        on('multiBackBtn', () => Game.setState('menu'));
        on('hostBackBtn', () => this.openMulti());
        on('joinBackBtn', () => this.openMulti());
        on('joinRefreshBtn', () => this.refreshList());
        on('joinPassCancel', () => this.pick(null));
        on('lobbyCopyBtn', () => this.copyLink());
        on('lobbyStartBtn', () => this.start());
        on('lobbyLeaveBtn', () => this.leave());
        e.hostVisibility.addEventListener('change', () => this.showHost());
        e.hostForm.addEventListener('submit', ev => {
            ev.preventDefault();
            this.create();
        });
        e.joinPassForm.addEventListener('submit', ev => {
            ev.preventDefault();
            if (this.picked) {
                this.join(this.picked, e.joinPassword.value);
            }
        });

        Net.onRoster = () => {
            this.showLobby();
            Coop.syncRoster();
        };
        Net.onClosed = text => this.kicked(text);
        Net.on('start', msg => {
            Coop.begin();
            Game.startRun(msg.seed);
        });
        DB.watch(() => this.showMulti());

        const wanted = new URLSearchParams(location.search).get('lobby');
        if (wanted) {
            this.linkId = wanted;
            history.replaceState(null, '', location.pathname + location.hash);
        }
        setInterval(() => this.tick(), 500);
    },

    tick() {
        this.ticks++;
        if (this.linkId && Game.state === 'menu' && DB.status !== 'connecting') {
            this.openLink();
        }
        if (Game.state === 'join' && !this.busy && !this.picked && this.ticks % (CONFIG.lobby.refresh * 2) === 0) {
            this.refreshList();
        }
    },

    say(el, text, good = false) {
        el.textContent = text || '';
        el.classList.toggle('ok', !!text && good);
        el.classList.toggle('err', !!text && !good);
    },

    problem() {
        if (!DB.online) {
            return DB.status === 'connecting' ? 'Connecting...' : 'Multiplayer needs a connection. You are offline.';
        }
        return Net.available() ? '' : Net.TEXT.noPeer;
    },

    openMulti() {
        Game.setState('multi');
        this.showMulti();
    },

    showMulti() {
        const e = this.el;
        const problem = this.problem();
        this.say(e.multiMsg, problem);
        e.multiHostBtn.disabled = !!problem;
        e.multiJoinBtn.disabled = !!problem;
    },

    openHost() {
        const e = this.el;
        if (!e.hostName.value) {
            e.hostName.value = ((DB.name || 'My') + "'s lobby").slice(0, 24);
        }
        this.say(e.hostMsg, '');
        this.showHost();
        Game.setState('host');
    },

    showHost() {
        const e = this.el;
        e.hostPassRow.hidden = e.hostVisibility.value !== 'private';
    },

    // Asks for the microphone before joining a host on the same network (see Net.lanAccess). Never
    // blocks joining: if the player says no, the normal connection (or the relay) is used.
    async lanAccess(msgEl) {
        if (await Net.lanWillAsk()) {
            this.say(msgEl, 'Your browser will ask to use the microphone. It only lets devices on your network connect directly, is switched off straight away, and nothing is recorded.', true);
        }
        await Net.lanAccess();
    },

    async create() {
        const e = this.el;
        if (this.busy) {
            return;
        }
        const name = DB.cleanName(e.hostName.value);
        const isPrivate = e.hostVisibility.value === 'private';
        const password = e.hostPassword.value;
        if (name.length < 3) {
            this.say(e.hostMsg, 'Lobby names need at least 3 characters.');
            return;
        }
        if (isPrivate && password.length < 4) {
            this.say(e.hostMsg, 'Lobby passwords need at least 4 characters.');
            return;
        }
        this.busy = true;
        this.say(e.hostMsg, 'Creating lobby...', true);
        const res = await Net.host({ name, private: isPrivate, password });
        this.busy = false;
        if (!res.ok) {
            this.say(e.hostMsg, res.error);
            return;
        }
        this.say(e.hostMsg, '');
        this.openLobby();
    },

    openJoin(message) {
        this.picked = null;
        this.lobbies = [];
        this.say(this.el.joinMsg, message || '');
        Game.setState('join');
        this.showJoin();
        this.refreshList();
    },

    async refreshList() {
        const res = await DB.rpc('list_lobbies', { p_addrs: await Net.publicAddrs() });
        if (Game.state !== 'join') {
            return;
        }
        if (res.error) {
            this.lobbies = [];
            this.say(this.el.joinMsg, res.error);
        } else {
            this.lobbies = res.data || [];
        }
        this.showJoin();
    },

    showJoin() {
        const e = this.el;
        e.joinList.textContent = '';
        for (const l of this.lobbies) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'lobbyRow';
            row.disabled = this.busy;
            const cell = (cls, text) => {
                const span = document.createElement('span');
                span.className = cls;
                span.textContent = text;
                row.appendChild(span);
            };
            if (l.on_lan) {
                cell('lobbyTag', 'LAN');
            }
            cell('lobbyName', (l.is_private ? '\u{1F512} ' : '') + l.name);
            cell('lobbyHost', l.host_name);
            cell('lobbyCount', l.players + '/' + l.max_players);
            row.addEventListener('click', () => this.pick(l));
            e.joinList.appendChild(row);
        }
        e.joinEmpty.hidden = this.lobbies.length > 0 || !!this.picked;
        e.joinList.hidden = !!this.picked;
        e.joinRefreshBtn.hidden = !!this.picked;
        e.joinPassForm.hidden = !this.picked;
        if (this.picked) {
            e.joinPassLabel.textContent = 'Password for "' + this.picked.name + '"';
        }
    },

    pick(lobby) {
        const e = this.el;
        if (this.busy) {
            return;
        }
        if (!lobby) {
            this.picked = null;
            this.say(e.joinMsg, '');
            this.showJoin();
            this.refreshList();
            return;
        }
        if (lobby.players >= lobby.max_players) {
            this.say(e.joinMsg, Net.TEXT.lobby_full);
            return;
        }
        if (lobby.is_private) {
            this.picked = lobby;
            e.joinPassword.value = '';
            this.say(e.joinMsg, '');
            this.showJoin();
            e.joinPassword.focus();
            return;
        }
        this.join(lobby, null);
    },

    async join(lobby, password) {
        const e = this.el;
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.showJoin();
        const connecting = 'Connecting to "' + lobby.name + '"...';
        this.say(e.joinMsg, connecting, true);
        const res = await Net.join(lobby.id, password, {
            beforeLan: async () => {
                await this.lanAccess(e.joinMsg);
                this.say(e.joinMsg, connecting, true);
                return Game.state === 'join';
            }
        });
        this.busy = false;
        if (res.code === 'cancelled') {
            return;
        }
        if (res.ok) {
            this.picked = null;
            this.say(e.joinMsg, '');
            this.openLobby();
            return;
        }
        if (res.code !== 'wrong_password' && res.code !== 'too_many_attempts') {
            this.picked = null;
        }
        if (Game.state === 'join') {
            this.say(e.joinMsg, res.error + (res.detail ? '\n[' + res.detail + ']' : ''));
            this.showJoin();
            if (this.picked) {
                e.joinPassword.select();
            } else {
                this.refreshList();
            }
        }
    },

    async openLink() {
        const id = this.linkId;
        this.linkId = null;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            this.el.menuNotice.textContent = 'That invite link is not valid.';
            return;
        }
        const problem = this.problem();
        if (problem) {
            this.el.menuNotice.textContent = 'Could not open the invite link. ' + problem;
            return;
        }
        this.openJoin('Looking for the lobby...');
        this.say(this.el.joinMsg, 'Looking for the lobby...', true);
        const res = await DB.rpc('get_lobby', { p_lobby: id });
        if (Game.state !== 'join') {
            return;
        }
        const l = res.data;
        const problemText = res.error ? res.error
            : !l || !l.found ? Net.TEXT.lobby_closed
                : l.status !== 'open' ? Net.TEXT.lobby_started
                    : l.players >= l.max_players ? Net.TEXT.lobby_full
                        : '';
        if (problemText) {
            this.say(this.el.joinMsg, problemText);
            return;
        }
        this.say(this.el.joinMsg, '');
        this.pick(l);
    },

    inviteUrl() {
        return DB.returnUrl() + '?lobby=' + Net.lobby.id;
    },

    openLobby() {
        const e = this.el;
        Game.setState('lobby');
        this.say(e.lobbyMsg, '');
        this.showInvite(this.inviteUrl());
        this.showLobby();
        if (this.isLocalHost()) {
            this.fixLocalInvite(Net.lobby.id);
        }
    },

    showInvite(url) {
        const e = this.el;
        e.lobbyLink.value = url;
        e.lobbyQr.textContent = '';
        if (typeof qrcode !== 'undefined') {
            try {
                const qr = qrcode(0, 'M');
                qr.addData(url);
                qr.make();
                e.lobbyQr.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
            } catch (err) {
            }
        }
    },

    // True when the page was opened as localhost (testing with a local server). Other devices
    // cannot use a localhost link, because to them it means themselves.
    isLocalHost() {
        const h = location.hostname;
        return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
    },

    // Swaps localhost in the invite link for this computer's address on the local network.
    async fixLocalInvite(lobbyId) {
        const ip = await Net.lanAddress(true);
        if (Game.state !== 'lobby' || !Net.lobby || Net.lobby.id !== lobbyId) {
            return;
        }
        if (ip) {
            const url = new URL(this.inviteUrl());
            url.hostname = ip;
            this.showInvite(url.href);
            this.say(this.el.lobbyMsg, 'Invite uses this computer\'s network address (' + ip + '). Your local server must allow other devices to connect.', true);
        } else {
            this.say(this.el.lobbyMsg, 'You opened the game as ' + location.host + ', so this invite only works on this computer. On other devices, open this computer\'s network address instead (run ipconfig to find it), with port ' + (location.port || '80') + '.');
        }
    },

    showLobby() {
        const e = this.el;
        if (!Net.active) {
            return;
        }
        e.lobbyTitle.textContent = Net.lobby.name;
        e.lobbyPlayers.textContent = '';
        for (const p of Net.roster) {
            const row = document.createElement('div');
            row.className = 'row';
            const name = document.createElement('span');
            name.textContent = p.name;
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = [p.host ? 'host' : '', p.id === Net.id ? 'you' : ''].filter(Boolean).join(', ');
            row.append(name, tag);
            e.lobbyPlayers.appendChild(row);
        }
        const count = Net.roster.length + '/' + CONFIG.maxPlayers + ' players';
        e.lobbyStartBtn.hidden = !Net.isHost;
        e.lobbyHostNote.textContent = Net.isHost
            ? count + '. You are the host: the game pauses for everyone if you switch tabs or minimise this window.'
            : count + '. Waiting for the host to start...';
    },

    async copyLink() {
        const e = this.el;
        try {
            await navigator.clipboard.writeText(e.lobbyLink.value);
            this.say(e.lobbyMsg, 'Invite link copied.', true);
        } catch (err) {
            e.lobbyLink.select();
            this.say(e.lobbyMsg, 'Press Ctrl+C to copy the link.', true);
        }
    },

    start() {
        if (!Net.isHost) {
            return;
        }
        const seed = Net.start();
        Coop.begin();
        Game.startRun(seed);
    },

    leave() {
        Net.leave();
        this.openMulti();
    },

    kicked(text) {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        Coop.end();
        if (Game.state === 'complete' || Game.state === 'dead') {
            return;
        }
        Game.toMenu();
        this.el.menuNotice.textContent = text;
    }
};
