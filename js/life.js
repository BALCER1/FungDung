// Downed, spectating and revive/respawn for the local player.
// States live on Players.local: alive (down false), downed (down true, dead false),
// spectating (down true, dead true). Remote players get the same flags from Coop state sync.
// Enemies never see a downed or dead player because Players.active() skips `down`.
const Life = {
    bleed: 0,
    eye: CONFIG.eye,
    reviveId: '',
    reviveT: 0,
    reviveWait: 0,
    target: null,
    watchId: '',
    el: {},

    init() {
        const hud = document.getElementById('hud');
        const center = document.createElement('div');
        center.style.cssText = 'position:fixed;left:50%;top:63%;transform:translateX(-50%);min-width:240px;text-align:center;color:#fff;' +
            'font:600 14px system-ui,sans-serif;text-shadow:0 1px 3px #000a';
        center.innerHTML = '<div data-t></div><div data-w style="height:6px;margin-top:6px;background:#0007;border:1px solid #fff4;border-radius:3px;overflow:hidden">' +
            '<i data-b style="display:block;height:100%;width:0;background:#69db7c"></i></div>';
        hud.appendChild(center);

        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);padding:8px 18px;text-align:center;color:#fff;' +
            'font:600 13px system-ui,sans-serif;background:rgba(0,0,0,.6);border-radius:6px;white-space:nowrap';
        banner.innerHTML = '<div data-h style="font-size:18px;letter-spacing:.04em"></div><div data-s style="opacity:.8;margin-top:2px"></div>';
        hud.appendChild(banner);

        this.el = {
            center, banner,
            text: center.querySelector('[data-t]'),
            wrap: center.querySelector('[data-w]'),
            bar: center.querySelector('[data-b]'),
            head: banner.querySelector('[data-h]'),
            sub: banner.querySelector('[data-s]')
        };
        this.hideHud();

        Net.on('rv', (msg, from) => {
            if (Coop.running && Net.isHost) {
                this.grantRevive(Players.get(from), Players.get(String(msg.id)));
            }
        });
        Net.on('up', () => {
            if (Coop.running && Net.isGuest) {
                this.revived();
            }
        });
        Net.on('vend', (msg, from) => {
            if (Coop.running && Net.isHost) {
                this.vend(Players.get(from), String(msg.k));
            }
        });
        Net.on('vended', msg => {
            const v = Game.room && Game.room.vending;
            if (Coop.running && Net.isGuest && v && msg.k === Game.roomKey) {
                v.left = msg.left | 0;
                v.show();
            }
        });
        Net.on('respawn', msg => {
            if (Coop.running && Net.isGuest && Game.room && msg.k === Game.roomKey) {
                this.respawn();
            }
        });
        Net.on('lost', () => {
            if (Coop.running && Net.isGuest && Game.state !== 'dead') {
                Game.die();
            }
        });

        addEventListener('mousedown', e => {
            if (Game.state === 'playing' && Players.local.dead) {
                this.cycle(e.button === 2 ? -1 : 1);
            }
        });
        addEventListener('contextmenu', e => {
            if (Game.state === 'playing' && Players.local.down) {
                e.preventDefault();
            }
        });
        addEventListener('keydown', e => {
            if (e.code === 'KeyE' && !e.repeat && Game.state === 'playing' && this.nearVending()) {
                this.useVending();
            }
        });
    },

    reset() {
        const L = Players.local;
        if (L) {
            L.down = false;
            L.dead = false;
            L.rv = '';
            L.rvT = 0;
        }
        this.bleed = 0;
        this.eye = CONFIG.eye;
        this.reviveId = '';
        this.reviveT = 0;
        this.reviveWait = 0;
        this.target = null;
        this.watchId = '';
        this.hideHud();
    },

    // E is taken by reviving or the vending machine, so the door should ignore it.
    claimsE() {
        return !!this.target || this.nearVending();
    },

    // ------------------------------------------------------------------ state changes

    goDown() {
        const L = Players.local;
        L.down = true;
        L.dead = false;
        this.bleed = CONFIG.downed.bleedout;
        this.stopReviving();
        Arsenal.reset();
    },

    toSpectator() {
        const L = Players.local;
        L.down = true;
        L.dead = true;
        this.bleed = 0;
        this.watchId = '';
        this.stopReviving();
        Arsenal.reset();
    },

    revived() {
        const L = Players.local;
        if (!L.down || L.dead) {
            return;
        }
        L.down = false;
        Vitals.revive(Vitals.max * CONFIG.downed.reviveHp);
        Arsenal.reset();
    },

    respawn() {
        const L = Players.local;
        const v = Game.room && Game.room.vending;
        if (!L.dead || !v) {
            return;
        }
        L.down = false;
        L.dead = false;
        this.watchId = '';
        this.eye = CONFIG.eye;
        Vitals.revive(Vitals.max * CONFIG.vending.hp);
        Player.pos.set(v.spot.x, 0, v.spot.z);
        Player.vel.set(0, 0, 0);
        Player.yaw = v.spot.yaw;
        Player.pitch = 0;
        Player.stun = 0;
        Player.syncCamera();
        Arsenal.reset();
    },

    // Called by Game.enterRoom. A downed player who gets moved on with the party was left behind.
    enteredRoom() {
        const L = Players.local;
        if (L.down && !L.dead) {
            this.toSpectator();
        }
        this.eye = L.down ? CONFIG.downed.eye : CONFIG.eye;
    },

    lose() {
        if (Coop.running && Net.isHost) {
            Net.broadcast({ t: 'lost' });
        }
        Game.die();
    },

    // ------------------------------------------------------------------ per frame (simulation)

    update(dt) {
        const L = Players.local;
        if (Vitals.dead && !L.down) {
            this.goDown();
        }
        if (L.down && !L.dead) {
            this.bleed -= dt;
            if (this.bleed <= 0) {
                this.toSpectator();
            }
        }
        if ((!Coop.running || Net.isHost) && Players.list.every(p => p.down)) {
            this.lose();
            return;
        }
        this.updateReviving(dt);
        this.updateHud();
    },

    stopReviving() {
        this.reviveId = '';
        this.reviveT = 0;
        this.target = null;
        Players.local.rv = '';
        Players.local.rvT = 0;
    },

    updateReviving(dt) {
        const L = Players.local;
        let target = null;
        if (!L.down && Game.present && Game.room) {
            let best = CONFIG.downed.reviveRange;
            for (const p of Players.list) {
                if (p.local || !p.down || p.dead || !p.inRoom || Math.abs(p.pos.y - Player.pos.y) > 1.5) {
                    continue;
                }
                const d = Math.hypot(p.pos.x - Player.pos.x, p.pos.z - Player.pos.z);
                if (d < best) {
                    best = d;
                    target = p;
                }
            }
        }
        this.target = target;
        this.reviveWait = Math.max(0, this.reviveWait - dt);
        if (target && Input.keys.KeyE && !this.reviveWait) {
            if (this.reviveId !== target.id) {
                this.reviveId = target.id;
                this.reviveT = 0;
            }
            this.reviveT += dt / CONFIG.downed.reviveTime;
            if (this.reviveT >= 1) {
                this.reviveWait = 1;
                if (Net.isGuest) {
                    Net.send({ t: 'rv', id: target.id });
                } else {
                    this.grantRevive(L, target);
                }
                this.reviveId = '';
                this.reviveT = 0;
            }
        } else {
            this.reviveId = '';
            this.reviveT = 0;
        }
        L.rv = this.reviveId;
        L.rvT = this.reviveT;
    },

    // Host only: `by` finished holding E on `target`.
    grantRevive(by, target) {
        if (!by || by.down || !by.inRoom || !target || !target.down || target.dead || !target.inRoom) {
            return;
        }
        if (by.pos.distanceTo(target.pos) > CONFIG.downed.reviveRange + 2) {
            return;
        }
        if (target.local) {
            this.revived();
        } else {
            Net.sendTo(target.id, { t: 'up' });
        }
    },

    // ------------------------------------------------------------------ vending machine

    nearVending() {
        const v = Game.room && Game.room.vending;
        const L = Players.local;
        if (!v || !L || L.down || !Game.present) {
            return false;
        }
        return Math.hypot(Player.pos.x - v.front.x, Player.pos.z - v.front.z) < CONFIG.vending.range && Player.pos.y < 1.5;
    },

    fallen() {
        return Players.list.filter(p => p.dead && p.inRoom);
    },

    useVending() {
        const v = Game.room.vending;
        if (v.left === 0 || !this.fallen().length) {
            return;
        }
        if (Net.isGuest) {
            Net.send({ t: 'vend', k: Game.roomKey });
        } else {
            this.vend(Players.local, Game.roomKey);
        }
    },

    // Host (or singleplayer) only: `by` used the machine in room `key`.
    vend(by, key) {
        const v = Game.room && Game.room.vending;
        if (!v || key !== Game.roomKey || v.left === 0 || !by || by.down || !by.inRoom) {
            return;
        }
        if (Math.hypot(by.pos.x - v.front.x, by.pos.z - v.front.z) > CONFIG.vending.range + 2) {
            return;
        }
        const dead = this.fallen();
        if (!dead.length) {
            return;
        }
        if (v.left > 0) {
            v.left--;
        }
        v.show();
        for (const p of dead) {
            if (p.local) {
                this.respawn();
            } else {
                Net.sendTo(p.id, { t: 'respawn', k: key });
            }
        }
        if (Coop.running) {
            Net.broadcast({ t: 'vended', k: key, left: v.left });
        }
    },

    // ------------------------------------------------------------------ spectating

    watchable() {
        const out = [];
        for (const r of Net.roster) {
            const p = r.id === Net.id ? null : Players.get(r.id);
            if (p && !p.dead && p.inRoom) {
                out.push(p);
            }
        }
        return out;
    },

    watched() {
        const list = this.watchable();
        let p = list.find(q => q.id === this.watchId) || null;
        if (!p && list.length) {
            p = list[0];
        }
        this.watchId = p ? p.id : '';
        return p;
    },

    cycle(dir) {
        const list = this.watchable();
        if (!list.length) {
            return;
        }
        const i = list.findIndex(q => q.id === this.watchId);
        this.watchId = list[(Math.max(0, i) + dir + list.length) % list.length].id;
    },

    isWatching(p) {
        return Players.local.dead && this.watchId === p.id;
    },

    // Camera for the downed eye height and the spectator view. Runs right before rendering,
    // after Coop has moved the avatars. The camera FOV and all graphics settings stay the player's own.
    view(dt) {
        const L = Players.local;
        if (!Game.room) {
            return;
        }
        const k = 1 - Math.exp(-5 * dt);
        if (L.dead) {
            const p = this.watched();
            const av = p && Coop.avatars.get(p.id);
            if (av && av.group.visible) {
                camera.position.copy(av.base);
                camera.position.y += p.down ? CONFIG.downed.eye : CONFIG.eye;
                camera.rotation.set(av.pitch, av.yaw, 0);
            } else {
                camera.position.set(Player.pos.x, Player.pos.y + CONFIG.downed.eye, Player.pos.z);
                camera.rotation.set(Player.pitch, Player.yaw, 0.25);
            }
            return;
        }
        if (L.down) {
            this.eye += (CONFIG.downed.eye - this.eye) * k;
            const f = (CONFIG.eye - this.eye) / (CONFIG.eye - CONFIG.downed.eye);
            camera.position.set(Player.pos.x, Player.pos.y + this.eye, Player.pos.z);
            camera.rotation.set(Player.pitch, Player.yaw, 0.25 * f);
            return;
        }
        if (this.eye < CONFIG.eye) {
            this.eye += (CONFIG.eye - this.eye) * k;
            if (this.eye > CONFIG.eye - 0.01) {
                this.eye = CONFIG.eye;
            }
            camera.position.set(Player.pos.x, Player.pos.y + this.eye, Player.pos.z);
        }
    },

    // ------------------------------------------------------------------ HUD

    hideHud() {
        if (this.el.center) {
            this.el.center.style.display = 'none';
            this.el.banner.style.display = 'none';
        }
    },

    show(text, progress, head, sub) {
        const e = this.el;
        e.center.style.display = text ? '' : 'none';
        if (text) {
            e.text.textContent = text;
            e.wrap.style.display = progress === null ? 'none' : '';
            e.bar.style.width = ((progress || 0) * 100).toFixed(1) + '%';
        }
        e.banner.style.display = head ? '' : 'none';
        if (head) {
            e.head.textContent = head;
            e.sub.textContent = sub || '';
        }
    },

    updateHud() {
        const L = Players.local;
        const name = p => p.name || 'Teammate';
        if (L.dead) {
            const p = this.watched();
            const sub = 'A teammate can respawn you at a shop vending machine' + (this.watchable().length > 1 ? '  ·  Click to switch' : '');
            this.show('', null, p ? 'Spectating ' + name(p) : 'Waiting for the party', sub);
            return;
        }
        if (L.down) {
            const by = Players.list.find(p => !p.local && p.rv === L.id && p.rvT > 0);
            this.show(by ? name(by) + ' is picking you up' : '', by ? by.rvT : null,
                'Downed  ' + Math.max(0, Math.ceil(this.bleed)) + 's', 'A teammate can hold E next to you to pick you up');
            return;
        }
        if (this.target) {
            this.show((this.reviveT > 0 ? 'Picking up ' : 'Hold E to pick up ') + name(this.target), this.reviveT, '', '');
            return;
        }
        if (this.nearVending()) {
            const v = Game.room.vending;
            const n = this.fallen().length;
            const text = v.left === 0 ? 'Respawn machine is out of order'
                : n ? 'E: respawn ' + n + ' fallen teammate' + (n > 1 ? 's' : '')
                    : 'Respawn machine - no fallen teammates';
            this.show(text, null, '', '');
            return;
        }
        this.show('', null, '', '');
    }
};
