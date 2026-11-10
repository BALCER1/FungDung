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

    TEXT: {
        noPeer: 'Multiplayer could not load. Check your connection and reload the page.',
        server: 'Could not reach the matchmaking server. Check your connection and try again.',
        failed: 'Could not connect to the host. Some networks (school, work, mobile data) block direct connections between players.',
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

    openPeer() {
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
                peer = new Peer(this.newId());
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
        const opened = await this.openPeer();
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

    register(lobby) {
        return DB.rpc('create_lobby', {
            p_name: lobby.name,
            p_private: lobby.private,
            p_password: lobby.private ? lobby.password : null,
            p_peer: this.id,
            p_id: lobby.id
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

    async join(lobbyId, password) {
        this.shutdown();
        if (!this.available()) {
            return { ok: false, error: this.TEXT.noPeer };
        }
        const res = await DB.rpc('join_lobby', { p_lobby: lobbyId, p_password: password || null });
        if (res.error) {
            return { ok: false, error: res.error };
        }
        if (!res.data || !res.data.ok) {
            const code = (res.data && res.data.error) || 'failed';
            return { ok: false, code, error: this.TEXT[code] || this.TEXT.failed };
        }
        const opened = await this.openPeer();
        if (!opened.ok) {
            this.shutdown();
            return opened;
        }
        const out = await this.dial(res.data.peer_id, password);
        if (!out.ok) {
            this.shutdown();
        }
        return out;
    },

    dial(hostPeer, password) {
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
            this.pending = finish;
            timer = setTimeout(() => finish({ ok: false, code: 'failed', error: this.TEXT.failed }), CONFIG.lobby.connectTimeout * 1000);
            const conn = this.peer.connect(hostPeer, { reliable: true, serialization: 'json' });
            this.link = conn;
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
                    finish({ ok: false, code: 'failed', error: this.TEXT.failed });
                }
            };
            conn.on('close', dropped);
            conn.on('error', dropped);
        });
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
