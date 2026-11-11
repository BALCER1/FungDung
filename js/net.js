const Net = {
    peer: null,
    role: null,
    lobby: null,
    id: '',
    roster: [],
    guests: new Map(),
    link: null,
    started: false,
    heard: 0,
    pending: null,
    timers: [],
    handlers: {},
    onRoster: null,
    onClosed: null,
    onLeft: null,
    lanTry: null,
    addrs: null,
    addrsAt: 0,
    relayList: null,
    relayAt: 0,
    relayFailAt: -Infinity,

    TEXT: {
        noPeer: 'Multiplayer could not load. Check your connection and reload the page.',
        server: 'Could not reach the matchmaking server. Check your connection and try again.',
        failed: 'Could not connect to the host. Some networks (school, work, mobile data) block direct connections between players.',
        lanFailed: 'Could not connect to the host on your network. Allow the microphone when asked, so the devices can connect directly. College and guest Wi-Fi often stop devices talking to each other.',
        lobby_closed: 'That lobby has closed.',
        lobby_started: 'That lobby has already started its run.',
        lobby_full: 'That lobby is full.',
        wrong_password: 'Wrong password.',
        too_many_attempts: 'Too many wrong passwords. Wait a few minutes and try again.',
        version: 'The host is running a different version of the game. Both of you should reload the page.',
        host_left: 'The host left, so the lobby closed.',
        lost: 'Lost connection to the host.'
    },
    REJECT: { version: 'version', started: 'lobby_started', full: 'lobby_full', password: 'wrong_password' },

    get active() {
        return !!this.role;
    },
    get isHost() {
        return this.role === 'host';
    },
    get isGuest() {
        return this.role === 'guest';
    },

    init() {
        addEventListener('pagehide', () => {
            if (this.isHost) {
                DB.beacon('close_lobby');
            }
            this.leave();
        });
    },

    available() {
        return typeof Peer !== 'undefined';
    },

    on(type, fn) {
        this.handlers[type] = fn;
    },

    newId() {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    },

    every(seconds, fn) {
        this.timers.push(setInterval(fn, seconds * 1000));
    },

    // Browsers hide a device's local IP address from WebRTC (it shows up as a random .local name)
    // unless the page has microphone permission. On many home networks that name cannot be
    // resolved, so two devices on the same Wi-Fi cannot reach each other directly. LAN lobbies ask
    // for the microphone once, stop it straight away and record nothing. Only one of the two
    // devices needs to allow it. Resolves true if permission was granted.
    lanAccess() {
        if (!this.lanTry) {
            this.lanTry = this.askMic();
        }
        return this.lanTry;
    },

    async askMic() {
        const md = navigator.mediaDevices;
        if (!window.isSecureContext || !md || !md.getUserMedia) {
            return false;
        }
        try {
            const stream = await md.getUserMedia({ audio: true });
            for (const track of stream.getTracks()) {
                track.stop();
            }
            return true;
        } catch (err) {
            return false;
        }
    },

    // True if lanAccess() is likely to show a browser prompt.
    async lanWillAsk() {
        if (this.lanTry || !window.isSecureContext || !navigator.mediaDevices) {
            return false;
        }
        try {
            const res = await navigator.permissions.query({ name: 'microphone' });
            return res.state === 'prompt';
        } catch (err) {
            return true;
        }
    },

    // This computer's private IPv4 address on the local network, or '' if the browser hides it
    // (it only shows it after microphone permission, see lanAccess). Used for invite links when
    // the game was opened as localhost.
    async lanAddress(ask) {
        if (typeof RTCPeerConnection === 'undefined') {
            return '';
        }
        if (ask) {
            await this.lanAccess();
        }
        const pc = new RTCPeerConnection({ iceServers: [] });
        const found = [];
        try {
            await new Promise(resolve => {
                const timer = setTimeout(resolve, 3000);
                pc.onicecandidate = ev => {
                    const c = ev.candidate;
                    if (!c) {
                        clearTimeout(timer);
                        resolve();
                        return;
                    }
                    const ip = c.address || c.candidate.split(' ')[4] || '';
                    if (this.lanRank(ip) > 0 && !found.includes(ip)) {
                        found.push(ip);
                    }
                };
                pc.createDataChannel('ip');
                pc.createOffer().then(o => pc.setLocalDescription(o)).catch(resolve);
            });
        } finally {
            pc.close();
        }
        found.sort((a, b) => this.lanRank(b) - this.lanRank(a));
        return found[0] || '';
    },

    // This device's public addresses as a STUN server sees them (the same server PeerJS uses).
    // The lobby server hashes them to decide which LAN lobbies are on the same network, because
    // two devices on one Wi-Fi can reach the lobby server by different routes (IPv4 and IPv6,
    // iCloud Private Relay). Kept for a minute. Resolves [] if STUN is blocked.
    async publicAddrs() {
        const now = performance.now();
        if (this.addrs && now - this.addrsAt < 60000) {
            return this.addrs;
        }
        const found = [];
        if (typeof RTCPeerConnection !== 'undefined') {
            let pc = null;
            try {
                pc = new RTCPeerConnection({ iceServers: [{ urls: CONFIG.lobby.stun }] });
                await new Promise(resolve => {
                    const timer = setTimeout(resolve, CONFIG.lobby.stunTimeout * 1000);
                    pc.onicecandidate = ev => {
                        const c = ev.candidate;
                        if (!c) {
                            clearTimeout(timer);
                            resolve();
                            return;
                        }
                        const parts = c.candidate.split(' ');
                        const type = c.type || parts[parts.indexOf('typ') + 1];
                        const ip = c.address || parts[4] || '';
                        if (type === 'srflx' && ip && !found.includes(ip)) {
                            found.push(ip);
                        }
                    };
                    pc.createDataChannel('addr');
                    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(resolve);
                });
            } catch (err) {
            }
            if (pc) {
                pc.close();
            }
        }
        this.addrs = found.slice(0, 4);
        this.addrsAt = now;
        return this.addrs;
    },

    // How likely an address is to be the real home network rather than a virtual adapter
    // (VirtualBox uses 192.168.56.x, WSL, Hyper-V and Docker usually 172.16-31.x). 0 = not private.
    lanRank(ip) {
        return /^192\.168\.56\./.test(ip) ? 1
            : /^192\.168\./.test(ip) ? 4
                : /^10\./.test(ip) ? 3
                    : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2
                        : 0;
    },

    // Short-lived TURN relay credentials from the "turn" Supabase Edge Function (Cloudflare).
    // A relay lets two devices connect when their network stops them reaching each other
    // directly, as college Wi-Fi often does. WebRTC still prefers a direct route and only uses the
    // relay when nothing else works. Resolves null if the function is missing or fails, and then
    // PeerJS uses its default servers as before.
    async relay() {
        const now = performance.now();
        const cfg = CONFIG.relay;
        if (this.relayList && now - this.relayAt < cfg.refresh * 1000) {
            return this.relayList;
        }
        if (!DB.online || !DB.client || !DB.client.functions || now - this.relayFailAt < cfg.retry * 1000) {
            return this.relayList;
        }
        try {
            const res = await Promise.race([
                DB.client.functions.invoke(cfg.fn, { body: {} }),
                new Promise(resolve => setTimeout(() => resolve({ error: 'timeout' }), cfg.timeout * 1000))
            ]);
            const list = res && !res.error && res.data && res.data.iceServers;
            if (Array.isArray(list) && list.length) {
                this.relayList = list;
                this.relayAt = now;
            } else {
                this.relayFailAt = now;
            }
        } catch (err) {
            this.relayFailAt = now;
        }
        return this.relayList;
    },

    openPeer(relay) {
        return new Promise(resolve => {
            let done = false;
            let timer = 0;
            const finish = result => {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    resolve(result);
                }
            };
            let peer;
            try {
                peer = relay
                    ? new Peer(this.newId(), { config: { iceServers: [{ urls: CONFIG.lobby.stun }].concat(relay) } })
                    : new Peer(this.newId());
            } catch (err) {
                finish({ ok: false, error: this.TEXT.server });
                return;
            }
            this.peer = peer;
            timer = setTimeout(() => finish({ ok: false, error: this.TEXT.server }), CONFIG.lobby.connectTimeout * 1000);
            peer.on('open', id => {
                this.id = id;
                finish({ ok: true });
            });
            peer.on('error', err => {
                const type = (err && err.type) || '';
                if (!done) {
                    finish({ ok: false, error: this.TEXT.server });
                } else if (this.pending) {
                    this.pending({
                        ok: false,
                        code: type === 'peer-unavailable' ? 'lobby_closed' : 'failed',
                        error: type === 'peer-unavailable' ? this.TEXT.lobby_closed : this.TEXT.failed
                    });
                } else {
                    console.warn('Net:', type || err);
                }
            });
            peer.on('disconnected', () => {
                if (this.peer === peer && !peer.destroyed) {
                    try {
                        peer.reconnect();
                    } catch (err) {
                    }
                }
            });
        });
    },

    async host(opts) {
        this.shutdown();
        if (!this.available()) {
            return { ok: false, error: this.TEXT.noPeer };
        }
        const opened = await this.openPeer(await this.relay());
        if (!opened.ok) {
            this.shutdown();
            return opened;
        }
        this.peer.on('connection', conn => this.accept(conn));
        const lobby = {
            id: null,
            name: DB.cleanName(opts.name),
            private: !!opts.private,
            password: opts.private ? String(opts.password || '') : ''
        };
        const res = await this.register(lobby);
        if (res.error) {
            this.shutdown();
            return { ok: false, error: res.error };
        }
        lobby.id = res.data;
        this.role = 'host';
        this.lobby = lobby;
        this.started = false;
        this.roster = [{ id: this.id, name: DB.name || 'Host', host: true }];
        this.every(CONFIG.lobby.heartbeat, () => this.beat());
        this.every(CONFIG.lobby.pingEvery, () => this.ping());
        this.rosterChanged();
        return { ok: true };
    },

    async register(lobby) {
        return DB.rpc('create_lobby', {
            p_name: lobby.name,
            p_private: lobby.private,
            p_password: lobby.private ? lobby.password : null,
            p_peer: this.id,
            p_id: lobby.id,
            p_addrs: await this.publicAddrs()
        });
    },

    async beat() {
        if (!this.isHost) {
            return;
        }
        const state = { p_players: this.roster.length, p_status: this.started ? 'in_run' : 'open' };
        const res = await DB.rpc('heartbeat_lobby', state);
        if (this.isHost && res.data === false) {
            await this.register(this.lobby);
            await DB.rpc('heartbeat_lobby', state);
        }
    },

    accept(conn) {
        const g = { conn, id: conn.peer, name: '', ok: false, heard: performance.now() };
        setTimeout(() => {
            if (!g.ok) {
                this.hangUp(conn);
            }
        }, 10000);
        conn.on('data', msg => this.fromGuest(g, msg));
        conn.on('close', () => this.lost(g));
        conn.on('error', () => this.lost(g));
    },

    fromGuest(g, msg) {
        if (!this.isHost || !msg || typeof msg.t !== 'string') {
            return;
        }
        g.heard = performance.now();
        if (!g.ok) {
            if (msg.t !== 'hello') {
                return;
            }
            const why = msg.v !== CONFIG.netVersion ? 'version'
                : this.started ? 'started'
                    : this.roster.length >= CONFIG.maxPlayers ? 'full'
                        : this.lobby.private && msg.password !== this.lobby.password ? 'password'
                            : '';
            if (why) {
                this.post(g.conn, { t: 'reject', why });
                setTimeout(() => this.hangUp(g.conn), 400);
                return;
            }
            g.ok = true;
            g.name = DB.cleanName(msg.name).slice(0, 16) || 'Player';
            this.guests.set(g.id, g);
            this.roster.push({ id: g.id, name: g.name, host: false });
            this.post(g.conn, { t: 'welcome', id: g.id, lobby: { id: this.lobby.id, name: this.lobby.name }, roster: this.roster });
            this.rosterChanged();
            return;
        }
        if (msg.t === 'bye') {
            this.lost(g);
            return;
        }
        if (msg.t === 'pong') {
            return;
        }
        const handler = this.handlers[msg.t];
        if (handler) {
            handler(msg, g.id);
        }
    },

    lost(g) {
        if (!this.guests.has(g.id) || this.guests.get(g.id) !== g) {
            return;
        }
        this.guests.delete(g.id);
        this.roster = this.roster.filter(p => p.id !== g.id);
        this.hangUp(g.conn);
        if (this.onLeft) {
            this.onLeft(g.id);
        }
        this.rosterChanged();
    },

    rosterChanged() {
        if (this.isHost) {
            this.broadcast({ t: 'roster', roster: this.roster });
            this.beat();
        }
        if (this.onRoster) {
            this.onRoster();
        }
    },

    ping() {
        const now = performance.now();
        const limit = CONFIG.lobby.pingTimeout * 1000;
        if (this.isHost) {
            this.broadcast({ t: 'ping' });
            for (const g of [...this.guests.values()]) {
                if (now - g.heard > limit) {
                    this.lost(g);
                }
            }
        } else if (this.isGuest && now - this.heard > limit) {
            this.closed('lost');
        }
    },

    // opts.beforeLan runs when the host is on the same network as this device, before connecting
    // (Lobby asks for the microphone there, see lanAccess). Returning false cancels the join.
    async join(lobbyId, password, opts = {}) {
        this.shutdown();
        if (!this.available()) {
            return { ok: false, error: this.TEXT.noPeer };
        }
        const res = await DB.rpc('join_lobby', { p_lobby: lobbyId, p_password: password || null, p_addrs: await this.publicAddrs() });
        if (res.error) {
            return { ok: false, error: res.error };
        }
        if (!res.data || !res.data.ok) {
            const code = (res.data && res.data.error) || 'failed';
            return { ok: false, code, error: this.TEXT[code] || this.TEXT.failed };
        }
        const lan = !!res.data.on_lan;
        if (lan && opts.beforeLan && (await opts.beforeLan()) === false) {
            return { ok: false, code: 'cancelled', error: '' };
        }
        const opened = await this.openPeer(await this.relay());
        if (!opened.ok) {
            this.shutdown();
            return opened;
        }
        const out = await this.dial(res.data.peer_id, password, lan);
        if (!out.ok) {
            this.shutdown();
        }
        return out;
    },

    dial(hostPeer, password, lan) {
        const failed = { ok: false, code: 'failed', error: lan ? this.TEXT.lanFailed : this.TEXT.failed };
        return new Promise(resolve => {
            let done = false;
            let timer = 0;
            const finish = result => {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    this.pending = null;
                    resolve(result);
                }
            };
            const conn = this.peer.connect(hostPeer, { reliable: true, serialization: 'json' });
            this.link = conn;
            let failing = false;
            const fail = result => {
                if (done || failing) {
                    return;
                }
                failing = true;
                this.report(conn).then(detail => finish(Object.assign({}, result, { detail })));
            };
            this.pending = result => (result.ok ? finish(result) : fail(result));
            timer = setTimeout(() => fail(failed), CONFIG.lobby.connectTimeout * 1000);
            conn.on('open', () => {
                this.post(conn, { t: 'hello', v: CONFIG.netVersion, name: DB.name || 'Guest', password: password || '' });
            });
            conn.on('data', msg => {
                if (!msg || typeof msg.t !== 'string' || this.link !== conn) {
                    return;
                }
                if (done) {
                    this.fromHost(msg);
                } else if (msg.t === 'welcome') {
                    this.role = 'guest';
                    this.lobby = { id: msg.lobby.id, name: msg.lobby.name, private: false, password: '' };
                    this.roster = msg.roster || [];
                    this.started = false;
                    this.heard = performance.now();
                    this.every(CONFIG.lobby.pingEvery, () => this.ping());
                    finish({ ok: true });
                    this.rosterChanged();
                } else if (msg.t === 'reject') {
                    const code = this.REJECT[msg.why] || 'failed';
                    finish({ ok: false, code, error: this.TEXT[code] });
                }
            });
            const dropped = () => {
                if (this.link !== conn) {
                    return;
                }
                if (done) {
                    this.closed('lost');
                } else {
                    fail(failed);
                }
            };
            conn.on('close', dropped);
            conn.on('error', dropped);
        });
    },

    // One line describing why a connection failed, shown under the error so players can report it.
    // "you" are this device's network addresses, "host" the ones the host sent: host = local
    // address, srflx = public address, relay = TURN server. "hidden" means the browser replaced
    // the local IP with a .local name. pairs counts address pairs tried and how many worked.
    async report(conn) {
        const parts = [
            'secure ' + (window.isSecureContext ? 'yes' : 'no'),
            'mic ' + (this.lanTry ? ((await this.lanTry) ? 'yes' : 'no') : 'not asked'),
            'relay ' + (this.relayList ? 'yes' : 'no')
        ];
        const pc = conn && conn.peerConnection;
        if (!pc) {
            parts.push('no peer connection');
            return parts.join(', ');
        }
        parts.push('ice ' + pc.iceConnectionState);
        try {
            const stats = await pc.getStats();
            const mine = new Set();
            const theirs = new Set();
            let pairs = 0;
            let worked = 0;
            stats.forEach(s => {
                if (s.type === 'local-candidate') {
                    mine.add(this.describe(s));
                } else if (s.type === 'remote-candidate') {
                    theirs.add(this.describe(s));
                } else if (s.type === 'candidate-pair') {
                    pairs++;
                    if (s.state === 'succeeded') {
                        worked++;
                    }
                }
            });
            parts.push('you ' + ([...mine].join(' ') || 'none'));
            parts.push('host ' + ([...theirs].join(' ') || 'none'));
            parts.push('pairs ' + worked + '/' + pairs);
        } catch (err) {
            parts.push('no stats');
        }
        return parts.join(', ');
    },

    describe(c) {
        const addr = c.address || c.ip || '';
        const where = !addr ? (c.candidateType === 'host' ? 'hidden' : '?')
            : addr.endsWith('.local') ? 'hidden'
                : addr.includes(':') ? 'ip6'
                    : /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr) ? 'lan'
                        : 'ip4';
        return c.candidateType + ':' + where;
    },

    fromHost(msg) {
        if (!this.isGuest) {
            return;
        }
        this.heard = performance.now();
        if (msg.t === 'ping') {
            this.send({ t: 'pong' });
        } else if (msg.t === 'roster') {
            this.roster = msg.roster || [];
            this.rosterChanged();
        } else if (msg.t === 'closed') {
            this.closed(msg.why);
        } else {
            if (msg.t === 'start') {
                this.started = true;
            }
            const handler = this.handlers[msg.t];
            if (handler) {
                handler(msg, null);
            }
        }
    },

    closed(why) {
        if (!this.isGuest) {
            return;
        }
        this.shutdown();
        if (this.onClosed) {
            this.onClosed(this.TEXT[why] || this.TEXT.lost);
        }
    },

    start() {
        if (!this.isHost) {
            return null;
        }
        const seed = Rng.fresh();
        this.started = true;
        this.broadcast({ t: 'start', seed });
        this.beat();
        return seed;
    },

    post(conn, msg) {
        try {
            if (conn && conn.open) {
                conn.send(msg);
            }
        } catch (err) {
        }
    },

    send(msg) {
        this.post(this.link, msg);
    },

    sendTo(id, msg) {
        const g = this.guests.get(id);
        if (g) {
            this.post(g.conn, msg);
        }
    },

    broadcast(msg, except) {
        for (const g of this.guests.values()) {
            if (g.id !== except) {
                this.post(g.conn, msg);
            }
        }
    },

    hangUp(conn) {
        try {
            conn.close();
        } catch (err) {
        }
    },

    leave() {
        if (this.isHost) {
            this.broadcast({ t: 'closed', why: 'host_left' });
            DB.rpc('close_lobby');
        } else if (this.isGuest) {
            this.send({ t: 'bye' });
        }
        this.shutdown(250);
    },

    shutdown(delay = 0) {
        for (const t of this.timers) {
            clearInterval(t);
        }
        this.timers.length = 0;
        const peer = this.peer;
        this.peer = null;
        this.role = null;
        this.lobby = null;
        this.id = '';
        this.roster = [];
        this.guests = new Map();
        this.link = null;
        this.started = false;
        this.pending = null;
        if (!peer) {
            return;
        }
        const end = () => {
            try {
                peer.destroy();
            } catch (err) {
            }
        };
        if (delay) {
            setTimeout(end, delay);
        } else {
            end();
        }
    }
};
