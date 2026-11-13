class Avatar {
    constructor(player, color) {
        this.player = player;
        this.yaw = 0;
        this.pitch = 0;
        this.weapon = null;
        this.wstate = null;
        this.hands = new Hands();
        this.base = new THREE.Vector3();
        this.tip = 0;

        this.group = new THREE.Group();
        this.group.name = 'player:' + player.id;
        this.group.visible = false;
        this.group.rotation.order = 'YXZ';

        const r = CONFIG.radius;
        const h = CONFIG.height;
        const pts = [];
        for (let i = 0; i <= 8; i++) {
            const a = (i / 8) * Math.PI / 2;
            pts.push(new THREE.Vector2(Math.sin(a) * r, r - Math.cos(a) * r));
        }
        for (let i = 0; i <= 8; i++) {
            const a = (i / 8) * Math.PI / 2;
            pts.push(new THREE.Vector2(Math.cos(a) * r, h - r + Math.sin(a) * r));
        }
        this.bodyMat = new THREE.MeshLambertMaterial({ color });
        this.body = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), this.bodyMat);
        this.group.add(this.body);

        this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x15171c });
        this.eyeGeo = new THREE.SphereGeometry(0.045, 10, 8);
        this.eyes = [];
        for (const x of [-0.1, 0.1]) {
            const eye = new THREE.Mesh(this.eyeGeo, this.eyeMat);
            eye.position.set(x, CONFIG.eye - 0.1, -r + 0.035);
            this.group.add(eye);
            this.eyes.push(eye);
        }

        this.head = new THREE.Group();
        this.head.position.y = CONFIG.eye;
        this.head.rotation.order = 'YXZ';
        this.group.add(this.head);

        this.label = this.makeLabel(player.name || 'Player');
        this.group.add(this.label);
    }

    makeLabel(text) {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 64;
        const ctx = c.getContext('2d');
        ctx.font = '600 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0, 0, 0, .8)';
        ctx.strokeText(text, 128, 32);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, 128, 32);
        const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.6, 0.4, 1);
        sprite.position.y = CONFIG.height + 0.4;
        sprite.renderOrder = 10;
        return sprite;
    }

    setWeapon(id) {
        if (this.weapon) {
            this.weapon.dispose();
            this.weapon = null;
        }
        this.wstate = null;
        if (!Weapons.get(id)) {
            return;
        }
        const w = new Weapon(id, {
            worldParent: scene,
            lod: CONFIG.remoteGunDetail,
            remote: true,
            trace: (origin, dir, range) => Arsenal.trace(origin, dir, range)
        });
        this.head.add(w.root);
        w.setHands(this.hands);
        this.weapon = w;
    }

    fire(ev) {
        const w = this.weapon;
        if (!w || ev[7] !== w.id) {
            return;
        }
        const o = {};
        if (ev[0]) {
            o.mode = ev[0];
        }
        if (ev[1]) {
            o.pellets = ev[1];
        }
        if (ev[2] !== null && ev[2] !== undefined) {
            o.spread = ev[2];
        }
        if (ev[3]) {
            o.kickScale = ev[3];
        }
        if (ev[4]) {
            o.flashScale = ev[4];
        }
        if (ev[5] && w.def[ev[5]]) {
            o.projectile = w.def[ev[5]];
        }
        w.data.lastCharge = ev[6] || 0;
        if (w.state !== 'ready') {
            w.setState('ready', false);
        }
        w.ammo = Math.max(1, w.ammo);
        w.fire(o);
    }

    update(dt) {
        const p = this.player;
        const g = this.group;
        const down = p.down ? 1 : 0;
        if (!g.visible || this.base.distanceToSquared(p.pos) > 16) {
            this.base.copy(p.pos);
            this.yaw = p.yaw;
            this.pitch = p.pitch;
            this.tip = down;
        }
        g.visible = true;
        const k = 1 - Math.exp(-14 * dt);
        this.base.lerp(p.pos, k);
        this.yaw += wrapAngle(p.yaw - this.yaw) * k;
        this.pitch += (p.pitch - this.pitch) * k;
        this.head.rotation.x = this.pitch;

        // Downed: fall over backwards. The name tag is counter-rotated so it stays above the body.
        this.tip += (down - this.tip) * (1 - Math.exp(-6 * dt));
        const a = this.tip * Math.PI / 2;
        g.position.copy(this.base);
        g.position.y += CONFIG.radius * this.tip;
        g.rotation.set(a, this.yaw, 0);
        const lh = CONFIG.height + 0.4;
        this.label.position.set(0, lh * Math.cos(a), -lh * Math.sin(a));
        this.head.visible = !p.down;

        // Spectated: the camera sits in this head, so only the gun and hands are drawn.
        const fp = Life.isWatching(p);
        this.body.visible = !fp;
        this.label.visible = !fp;
        for (const eye of this.eyes) {
            eye.visible = !fp;
        }

        if (!this.weapon || this.weapon.id !== p.weapon) {
            this.setWeapon(p.weapon);
        }
        const w = this.weapon;
        if (!w) {
            p.events.length = 0;
            return;
        }
        if (p.wstate !== this.wstate) {
            this.wstate = p.wstate;
            if (p.wstate === 'reload') {
                w.ammo = p.ammo;
                w.reloadFrom = p.ammo;
            } else if (p.wstate === 'charge') {
                w.data.charge = 0;
            } else if (p.wstate === 'throw') {
                w.data.thrown = null;
            }
            if (p.wstate && w.state !== p.wstate) {
                w.setState(p.wstate);
            }
        }
        w.altHeld = p.alt || w.state === 'charge';
        if (w.state !== 'reload') {
            w.ammo = p.ammo;
        }
        for (const ev of p.events) {
            this.fire(ev);
        }
        p.events.length = 0;
        w.update(dt, { speed: Math.hypot(p.vel.x, p.vel.z), sprinting: p.sprinting, grounded: p.onGround });
    }

    dispose() {
        if (this.weapon) {
            this.weapon.dispose();
            this.weapon = null;
        }
        this.hands.syncBatch(false);
        for (const key in this.hands.regions) {
            this.hands.regions[key].dispose();
        }
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
        this.body.geometry.dispose();
        this.bodyMat.dispose();
        this.eyeGeo.dispose();
        this.eyeMat.dispose();
        this.label.material.map.dispose();
        this.label.material.dispose();
    }
}

const Coop = {
    running: false,
    partyNode: null,
    partyKey: '',
    avatars: new Map(),
    latest: new Map(),
    relay: new Map(),
    events: [],
    group: null,
    sendT: 0,
    deadline: 0,
    partyText: '',
    el: {},
    leftRoom: false,
    // Player state array: 17 fields, then the event list (see mine/apply).
    FIELDS: 17,
    WAIT_TEXT: 'Waiting for host to choose the next room...',
    COLORS: [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c],
    uiStates: { playing: true, paused: true, options: true, mapview: true, map: true, entering: true },
    promptStates: { playing: true, paused: true, options: true, mapview: true, entering: true },

    init() {
        for (const id of ['party', 'travelPrompt', 'travelText', 'travelBtn']) {
            this.el[id] = document.getElementById(id);
        }
        this.group = new THREE.Group();
        this.group.name = 'players';
        scene.add(this.group);

        Arsenal.onLocalShot = shot => this.localShot(shot);
        Net.on('st', (msg, from) => this.fromGuest(msg, from));
        Net.on('ps', msg => this.fromHost(msg));
        Net.on('room', msg => this.partyMoved(msg));
        Net.on('done', () => this.complete());
        Net.on('enq', (msg, from) => this.enemiesFor(msg, from));
        Net.on('en', msg => this.enemiesFull(msg));
        Net.on('es', msg => this.enemiesTick(msg));
        Net.on('sh', (msg, from) => this.remoteShot(msg, from));
        Net.on('hm', msg => Enemies.hitmark(String(msg.k)));
        Net.on('hurt', msg => this.hurt(msg));
        Enemies.remote = {
            fire: shot => {
                this.shotOut(shot).f = 1;
            },
            hit: (e, part, hit, shot) => {
                const o = this.shotOut(shot);
                const r = v => Math.round(v * 100) / 100;
                if (o.h.length < 24) {
                    o.h.push([e.id, part && part.id !== undefined ? part.id : -1, r(hit.point.x), r(hit.point.y), r(hit.point.z)]);
                }
                if (e.flashMesh) {
                    e.flashMesh(hit.object);
                }
                Enemies.hitmark('shell');
            },
            miss: (hit, shot) => {
                const o = this.shotOut(shot);
                if (!o.n) {
                    o.n = [Math.round(hit.point.x * 100) / 100, Math.round(hit.point.y * 100) / 100, Math.round(hit.point.z * 100) / 100];
                }
            },
            end: shot => this.sendShot(shot)
        };
        Net.on('complete', () => {
            if (this.running) {
                Game.finishRun();
            }
        });
        this.el.travelBtn.addEventListener('click', () => {
            if (this.deadline) {
                this.travel();
            }
        });
        addEventListener('keydown', e => {
            if (e.code === 'KeyT' && !e.repeat && this.deadline && Game.state === 'playing') {
                this.travel();
            }
        });
    },

    begin() {
        this.end();
        this.running = true;
        Players.local.id = Net.id;
        Players.local.name = DB.name || 'You';
        Enemies.record = Net.isHost;
        Players.onRemoteHurt = Net.isHost ? (p, dmg, o) => this.sendHurt(p, dmg, o) : null;
        this.syncRoster();
    },

    end() {
        this.running = false;
        this.partyNode = null;
        this.partyKey = '';
        this.deadline = 0;
        this.leftRoom = false;
        this.events = [];
        this.latest.clear();
        this.relay.clear();
        for (const av of this.avatars.values()) {
            av.dispose();
        }
        this.avatars.clear();
        Players.list = [Players.local];
        Players.local.id = 'local';
        Players.local.inRoom = true;
        Players.onRemoteHurt = null;
        Players.damageScale = 1;
        Enemies.record = false;
        Enemies.partySize = 1;
        Life.reset();
        this.showUi();
    },

    syncRoster() {
        if (!this.running) {
            return;
        }
        const ids = new Set(Net.roster.map(r => r.id));
        for (const r of Net.roster) {
            if (r.id !== Net.id && !Players.get(r.id)) {
                const p = Players.add(r.id, { name: r.name });
                p.inRoom = false;
                p.room = '';
                p.events = [];
            }
        }
        for (const p of Players.list.slice()) {
            if (!p.local && !ids.has(p.id)) {
                Players.remove(p.id);
                this.latest.delete(p.id);
                this.relay.delete(p.id);
                const av = this.avatars.get(p.id);
                if (av) {
                    av.dispose();
                    this.avatars.delete(p.id);
                }
            }
        }
    },

    // ------------------------------------------------------------------ state sync

    localShot(shot) {
        if (!this.running) {
            return;
        }
        const o = shot.fire || {};
        const def = Weapons.get(shot.weapon);
        let key = '';
        if (o.projectile) {
            for (const k in def) {
                if (def[k] === o.projectile) {
                    key = k;
                    break;
                }
            }
        }
        const w = Arsenal.weapons[shot.weapon];
        this.events.push([
            o.mode || '', o.pellets || 0, o.spread === undefined ? null : o.spread, o.kickScale || 0, o.flashScale || 0,
            key, (w && w.data.lastCharge) || 0, shot.weapon
        ]);
    },

    mine() {
        const w = Arsenal.current;
        const L = Players.local;
        const door = Game.room && Game.room.door;
        const r2 = v => Math.round(v * 100) / 100;
        const r3 = v => Math.round(v * 1000) / 1000;
        const flags = (Player.onGround ? 1 : 0) | (L.sprinting ? 2 : 0) | (w.reloading ? 4 : 0) | (w.altHeld ? 8 : 0) |
            (w.zoom > 0.5 ? 16 : 0) | (L.inRoom && door && door.isOpen ? 32 : 0) | (L.down ? 64 : 0) | (L.dead ? 128 : 0) | (L.god ? 256 : 0);
        const out = [
            Net.id, r2(Player.pos.x), r2(Player.pos.y), r2(Player.pos.z), r2(Player.vel.x), r2(Player.vel.y), r2(Player.vel.z),
            r3(Player.yaw), r3(Player.pitch), w.id, w.state, w.ammo, flags, Math.round(Vitals.hp / Vitals.max * 100),
            L.inRoom ? Game.roomKey : '', L.rv, Math.round(L.rvT * 100), this.events
        ];
        this.events = [];
        return out;
    },

    apply(a) {
        const p = Array.isArray(a) && a.length >= this.FIELDS ? Players.get(a[0]) : null;
        if (!p || p.local) {
            return;
        }
        p.pos.set(+a[1] || 0, +a[2] || 0, +a[3] || 0);
        p.vel.set(+a[4] || 0, +a[5] || 0, +a[6] || 0);
        p.yaw = +a[7] || 0;
        p.pitch = +a[8] || 0;
        p.weapon = String(a[9]);
        p.wstate = String(a[10]);
        p.ammo = a[11] | 0;
        const f = a[12] | 0;
        p.onGround = !!(f & 1);
        p.sprinting = !!(f & 2);
        p.reloading = !!(f & 4);
        p.alt = !!(f & 8);
        p.zoom = f & 16 ? 1 : 0;
        p.door = !!(f & 32);
        p.down = !!(f & 64);
        p.dead = !!(f & 128);
        p.god = !!(f & 256);
        p.hpF = Math.max(0, Math.min(1, (+a[13] || 0) / 100));
        p.room = String(a[14] || '');
        p.rv = String(a[15] || '');
        p.rvT = Math.max(0, Math.min(1, (+a[16] || 0) / 100));
        p.eye.set(p.pos.x, p.pos.y + (p.down ? CONFIG.downed.eye : CONFIG.eye), p.pos.z);
        const cp = Math.cos(p.pitch);
        p.aim.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
        if (Array.isArray(a[this.FIELDS])) {
            for (const ev of a[this.FIELDS]) {
                if (Array.isArray(ev) && p.events.length < 64) {
                    p.events.push(ev);
                }
            }
        }
    },

    fromGuest(msg, from) {
        if (!this.running || !Net.isHost || !Array.isArray(msg.s) || msg.s.length < this.FIELDS) {
            return;
        }
        const s = msg.s;
        s[0] = from;
        const p = Players.get(from);
        const was = p ? p.room : '';
        this.apply(s);
        if (p && was && was === Game.roomKey && !p.room && !p.down) {
            this.leftRoom = true;
        }
        let queue = this.relay.get(from);
        if (!queue) {
            this.relay.set(from, queue = []);
        }
        if (Array.isArray(s[this.FIELDS])) {
            for (const ev of s[this.FIELDS]) {
                if (queue.length < 64) {
                    queue.push(ev);
                }
            }
        }
        this.latest.set(from, s);
    },

    fromHost(msg) {
        if (!this.running || !Net.isGuest || !Array.isArray(msg.l)) {
            return;
        }
        for (const s of msg.l) {
            this.apply(s);
        }
    },

    send() {
        const me = this.mine();
        if (Net.isGuest) {
            Net.send({ t: 'st', s: me });
            return;
        }
        const list = [me];
        for (const [id, s] of this.latest) {
            const copy = s.slice(0, this.FIELDS);
            const queue = this.relay.get(id) || [];
            copy.push(queue.slice());
            queue.length = 0;
            list.push(copy);
        }
        Net.broadcast({ t: 'ps', l: list });
        this.sendEnemies();
    },

    // ------------------------------------------------------------------ enemies

    rosterPlayers() {
        return Net.roster.map(r => (r.id === Net.id ? Players.local : Players.get(r.id)));
    },

    sendEnemies() {
        const there = Players.list.filter(p => !p.local && p.inRoom);
        if (!there.length || !Game.room) {
            Enemies.out.length = 0;
            return;
        }
        const s = Enemies.snapshot(p => Net.roster.findIndex(r => r.id === p.id));
        const e = Enemies.out.slice();
        Enemies.out.length = 0;
        if (!s.length && !e.length) {
            return;
        }
        const msg = { t: 'es', k: Game.roomKey, s, e };
        for (const p of there) {
            Net.sendTo(p.id, msg);
        }
    },

    askEnemies() {
        Net.send({ t: 'enq', k: Game.roomKey });
    },

    enemiesFor(msg, from) {
        if (this.running && Net.isHost && Game.room && msg.k === Game.roomKey) {
            Net.sendTo(from, { t: 'en', k: Game.roomKey, l: Enemies.fullState() });
        }
    },

    enemiesFull(msg) {
        if (this.running && Enemies.puppets && msg.k === Game.roomKey && Array.isArray(msg.l)) {
            Enemies.spawnPuppets(msg.l);
        }
    },

    enemiesTick(msg) {
        if (!this.running || !Enemies.puppets || !Enemies.synced || msg.k !== Game.roomKey) {
            return;
        }
        if (Array.isArray(msg.e)) {
            Enemies.applyEvents(msg.e);
        }
        if (Array.isArray(msg.s)) {
            Enemies.applySnapshot(msg.s, this.rosterPlayers());
        }
    },

    shotOut(shot) {
        return shot.net || (shot.net = { f: 0, h: [], n: null });
    },

    sendShot(shot) {
        const o = shot.net;
        shot.net = null;
        if (!this.running || !o || (!o.f && !o.h.length && !o.n)) {
            return;
        }
        const r = v => Math.round(v * 100) / 100;
        Net.send({
            t: 'sh', w: shot.weapon, m: shot.mode || '', d: shot.damage, p: shot.dirs.length,
            o: shot.origin ? [r(shot.origin.x), r(shot.origin.y), r(shot.origin.z)] : null,
            f: o.f, h: o.h, n: o.n
        });
    },

    remoteShot(msg, from) {
        const by = Players.get(from);
        const def = Weapons.get(msg.w);
        if (!this.running || !Net.isHost || !by || !by.inRoom || !def) {
            return;
        }
        const stats = Object.assign({ damage: 10, pellets: 1 }, def.stats);
        const mode = String(msg.m || '');
        const maxDamage = mode === 'boomerang' ? (def.throwT ? def.throwT.damage : stats.damage)
            : mode === 'charged' ? stats.damage * 2 : stats.damage;
        const maxPellets = mode === 'charged' ? stats.pellets + 7 : stats.pellets;
        const vec = a => new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);
        const origin = Array.isArray(msg.o) ? vec(msg.o) : by.eye.clone();
        if (origin.distanceTo(by.eye) > 4) {
            origin.copy(by.eye);
        }
        const shot = {
            weapon: String(msg.w), mode, origin, by, remote: true,
            damage: Math.max(0, Math.min(+msg.d || 0, by.god ? CONFIG.god.damage : maxDamage)),
            dirs: new Array(Math.max(0, Math.min(msg.p | 0, maxPellets)))
        };
        const hits = Array.isArray(msg.h) ? msg.h.filter(Array.isArray).slice(0, Math.max(1, maxPellets)) : [];
        const kind = Enemies.remoteShot(shot, hits, Array.isArray(msg.n) ? vec(msg.n) : null, !!msg.f);
        if (kind) {
            Net.sendTo(from, { t: 'hm', k: kind });
        }
    },

    sendHurt(p, dmg, o) {
        const r = v => Math.round(v * 100) / 100;
        Net.sendTo(p.id, {
            t: 'hurt', d: dmg,
            f: o.from ? [r(o.from.x), r(o.from.y), r(o.from.z)] : null,
            v: o.dir ? [r(o.dir.x), r(o.dir.z)] : null,
            k: o.knock || 0, s: o.stun || 0, p: o.push || 0, sh: o.shake || 0
        });
    },

    hurt(msg) {
        if (!this.running || !Net.isGuest || !Game.present || !Game.room) {
            return;
        }
        Players.applyLocal(Math.max(0, msg.d | 0), {
            from: Array.isArray(msg.f) ? new THREE.Vector3(+msg.f[0] || 0, +msg.f[1] || 0, +msg.f[2] || 0) : null,
            dir: Array.isArray(msg.v) ? new THREE.Vector3(+msg.v[0] || 0, 0, +msg.v[1] || 0) : null,
            knock: +msg.k || 0, stun: +msg.s || 0, push: +msg.p || 0, shake: +msg.sh || 0
        });
    },

    // ------------------------------------------------------------------ per frame

    frame(dt) {
        const L = Players.local;
        L.inRoom = Game.present && !!Game.room;
        L.room = L.inRoom ? Game.roomKey : '';
        for (const p of Players.list) {
            if (!p.local) {
                p.inRoom = !!Game.room && !!p.room && p.room === Game.roomKey;
            }
        }
        this.sendT += dt;
        const step = 1 / CONFIG.netRate;
        if (this.sendT >= step) {
            this.sendT = Math.min(this.sendT - step, step);
            this.send();
        }
        const door = Game.room && Game.room.door;
        if (door && !door.isOpen && Players.list.some(p => !p.local && p.inRoom && p.door)) {
            door.open();
        }
        // A spectating host cannot walk through the door, so it gets the room-pick map as soon
        // as a living teammate leaves through it.
        if (Net.isHost && L.dead && this.leftRoom && Game.present && Game.room) {
            this.leftRoom = false;
            Game.present = false;
            Game.openMap();
        }
        this.updateAvatars(dt);
        this.updatePrompt();
        this.showUi();
    },

    updateAvatars(dt) {
        const drawn = Game.state !== 'map';
        let i = 0;
        for (const r of Net.roster) {
            const color = this.COLORS[i++ % this.COLORS.length];
            const p = r.id === Net.id ? null : Players.get(r.id);
            if (!p) {
                continue;
            }
            let av = this.avatars.get(p.id);
            if (!p.inRoom || !drawn || p.dead) {
                if (av) {
                    av.group.visible = false;
                }
                p.events.length = 0;
                continue;
            }
            if (!av) {
                av = new Avatar(p, color);
                this.group.add(av.group);
                this.avatars.set(p.id, av);
            }
            av.update(dt);
        }
    },

    rebuildWeapons() {
        for (const av of this.avatars.values()) {
            av.hands.relight();
            if (av.weapon) {
                av.setWeapon(av.weapon.id);
            }
        }
    },

    // ------------------------------------------------------------------ room travel

    keyOf(node) {
        return node.layer + ':' + node.index;
    },

    hostPick(node) {
        Enemies.partySize = Math.max(1, Net.roster.length);
        this.leftRoom = false;
        Game.enterRoom(node);
        this.partyNode = node;
        this.partyKey = this.keyOf(node);
        Net.broadcast({ t: 'room', l: node.layer, i: node.index });
    },

    partyMoved(msg) {
        const layer = this.running && Net.isGuest ? RunMap.layers[msg.l] : null;
        const node = layer ? layer[msg.i] : null;
        if (!node) {
            return;
        }
        this.partyNode = node;
        this.partyKey = this.keyOf(node);
        if (Game.state === 'map' || Players.local.dead) {
            this.travel();
        } else if (Game.room) {
            this.deadline = performance.now() + CONFIG.travelCountdown * 1000;
            Enemies.loadPuppets(Game.room);
        }
    },

    travel() {
        const node = this.partyNode;
        this.deadline = 0;
        if (!node) {
            return;
        }
        MapView.close();
        Game.enterRoom(node);
    },

    atDoor() {
        if (!RunMap.current.next.length) {
            Game.present = false;
            if (Net.isHost) {
                this.complete();
            } else {
                Net.send({ t: 'done' });
                Game.openMap();
            }
            return;
        }
        if (Net.isGuest && this.partyNode && this.partyKey !== Game.roomKey) {
            this.travel();
            return;
        }
        Game.present = false;
        this.deadline = 0;
        Game.openMap();
    },

    complete() {
        if (!this.running || !Net.isHost) {
            return;
        }
        Net.broadcast({ t: 'complete' });
        Game.finishRun();
    },

    updatePrompt() {
        const e = this.el;
        const show = this.deadline > 0 && !!Game.room && !!this.promptStates[Game.state];
        e.travelPrompt.hidden = !show;
        if (!show) {
            return;
        }
        const name = Rooms.get(this.partyNode.type).name;
        const left = Math.ceil((this.deadline - performance.now()) / 1000);
        if (left > 0) {
            e.travelText.textContent = `The party has moved to ${name} - travelling in ${left}s`;
        } else if (Game.state === 'playing' && !document.hidden) {
            this.travel();
        } else {
            e.travelText.textContent = `The party has moved to ${name} - you will travel as soon as you are back in the game`;
        }
    },

    showUi() {
        const e = this.el;
        const show = this.running && !!this.uiStates[Game.state];
        if (!show) {
            e.party.hidden = true;
            e.travelPrompt.hidden = true;
            return;
        }
        const lines = [];
        for (const r of Net.roster) {
            const p = r.id === Net.id ? Players.local : Players.get(r.id);
            const here = !!p && !!this.partyKey && p.room === this.partyKey;
            const status = !p ? '' : p.dead ? '  dead' : p.down ? '  downed' : '';
            lines.push((here ? '● ' : '○ ') + r.name + (r.id === Net.id ? ' (you)' : '') + (here ? '' : '  travelling') + status);
        }
        const text = lines.join('\n');
        if (text !== this.partyText) {
            this.partyText = text;
            e.party.textContent = text;
        }
        e.party.hidden = false;
    }
};
