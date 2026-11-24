const Players = {
    list: [],
    local: null,
    damageScale: 1,
    onRemoteHurt: null,

    make(id, opts = {}) {
        return {
            id,
            local: !!opts.local,
            name: opts.name || '',
            pos: opts.pos || new THREE.Vector3(),
            vel: opts.vel || new THREE.Vector3(),
            yaw: 0,
            pitch: 0,
            onGround: true,
            aim: new THREE.Vector3(0, 0, -1),
            eye: new THREE.Vector3(),
            reloading: false,
            zoom: 0,
            weapon: '',
            hpF: 1,
            sprinting: false,
            crouching: false,
            inRoom: true,
            down: false,
            dead: false,
            god: false,
            rv: '',
            rvT: 0,
            nav: { floor: 0, top: false, cells: [0, 0] },
            step: { t: 0, ground: true, vy: 0 }
        };
    },

    init() {
        this.local = this.make('local', { local: true, pos: Player.pos, vel: Player.vel });
        this.list = [this.local];
    },

    add(id, opts) {
        const p = this.make(id, opts);
        this.list.push(p);
        return p;
    },

    remove(id) {
        const i = this.list.findIndex(p => p.id === id && !p.local);
        if (i >= 0) {
            this.list.splice(i, 1);
        }
    },

    get(id) {
        return this.list.find(p => p.id === id) || null;
    },

    active() {
        return this.list.filter(p => p.inRoom && !p.down);
    },

    update() {
        const P = this.local;
        const w = Arsenal.current;
        camera.getWorldDirection(P.aim);
        P.eye.set(Player.pos.x, Player.pos.y + Player.eyeY(), Player.pos.z);
        P.yaw = Player.yaw;
        P.pitch = Player.pitch;
        P.onGround = Player.onGround;
        P.reloading = !!(w && w.reloading);
        P.zoom = w ? w.zoom : 0;
        P.weapon = w ? w.id : '';
        P.hpF = Vitals.hp / Vitals.max;
        P.god = Settings.god();
        P.sprinting = Math.hypot(Player.vel.x, Player.vel.z) > CONFIG.walk + 0.5;
        P.crouching = Player.crouching && !P.down;
    },

    hurt(p, amount, o = {}) {
        if (!p || p.down || p.god) {
            return 0;
        }
        const dmg = Math.round(amount * this.damageScale);
        if (p.local) {
            this.applyLocal(dmg, o);
        } else if (this.onRemoteHurt) {
            this.onRemoteHurt(p, dmg, o);
        }
        return dmg;
    },

    // Healing. HP lives on the player's own client, so only the local player can be healed here.
    heal(p, amount) {
        if (!p || !p.local || p.down || !(amount > 0)) {
            return 0;
        }
        const before = Vitals.hp;
        Vitals.heal(amount);
        return Vitals.hp - before;
    },

    // Every hit on the local player lands here exactly once: singleplayer, the host's own player
    // (from `hurt`) and a guest (from the host's `hurt` message), after `damageScale`. So the held
    // weapon's damage reduction (`def.damageTaken`, e.g. the hammer's guard) is applied here and
    // only here, from the weapon this client is really holding right now.
    applyLocal(dmg, o = {}) {
        if (Settings.god()) {
            return;
        }
        const w = typeof Arsenal !== 'undefined' ? Arsenal.current : null;
        const k = w && w.def.damageTaken ? w.def.damageTaken(w) : 1;
        let reduced = false;
        if (k < 1 && dmg > 0) {
            dmg = Math.max(1, Math.round(dmg * k));
            reduced = true;
            if (w.def.guarded) {
                w.def.guarded(w, dmg);
            }
        }
        Vitals.hurt(dmg, o.from, reduced);
        const d = o.dir;
        if (d && o.knock) {
            Player.knock(d, o.knock, o.stun || 0);
        } else if (d && o.push) {
            Player.vel.x += d.x * o.push;
            Player.vel.z += d.z * o.push;
        }
        if (o.shake) {
            Enemies.shake(o.shake, Player.pos);
        }
    }
};
