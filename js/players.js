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
            inRoom: true,
            down: false,
            dead: false,
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
        P.eye.set(Player.pos.x, Player.pos.y + CONFIG.eye, Player.pos.z);
        P.yaw = Player.yaw;
        P.pitch = Player.pitch;
        P.onGround = Player.onGround;
        P.reloading = !!(w && w.reloading);
        P.zoom = w ? w.zoom : 0;
        P.weapon = w ? w.id : '';
        P.hpF = Vitals.hp / Vitals.max;
        P.sprinting = Math.hypot(Player.vel.x, Player.vel.z) > CONFIG.walk + 0.5;
    },

    hurt(p, amount, o = {}) {
        if (!p || p.down) {
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

    applyLocal(dmg, o = {}) {
        Vitals.hurt(dmg, o.from);
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
