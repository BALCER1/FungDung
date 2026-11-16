// Floating damage numbers for the local player's own hits. Purely cosmetic and per browser:
// the host reports a guest's damage back in its `hm` reply, so every player sees only their own.
const DamageNumbers = {
    list: [],
    root: null,
    rank: { shell: 1, flesh: 2, break: 3, crit: 4, kill: 5 },
    colors: { shell: '#d8d2c4', break: '#ffd36b', flesh: '#7dffb5', crit: '#ff9a3c', kill: '#ff3b4e' },
    _v: new THREE.Vector3(),

    mode() {
        return Settings.values.damageNumbers;
    },

    // `key` groups hits on one enemy so rapid hits add up into one number while it is fresh.
    add(key, amount, point, kind) {
        const mode = this.mode();
        if (mode === 'off' || !(amount > 0) || !this.colors[kind]) {
            return;
        }
        const K = CONFIG.damageNumbers;
        let n = null;
        if (mode === 'stack') {
            n = this.list.find(d => d.key === key && d.kind !== 'kill' && d.t < K.merge);
        }
        if (n) {
            n.value += amount;
            n.pos.copy(point);
            n.t = 0;
            if (this.rank[kind] > this.rank[n.kind]) {
                n.kind = kind;
            }
        } else {
            if (this.list.length >= K.max) {
                this.drop(this.list[0]);
            }
            n = {
                key, value: amount, kind, t: 0, pos: point.clone(),
                dx: (Math.random() - 0.5) * 2 * K.spread,
                el: this.make()
            };
            this.list.push(n);
        }
        n.el.textContent = Math.max(1, Math.round(n.value));
        n.el.style.color = this.colors[n.kind];
        n.el.style.fontSize = (n.kind === 'crit' || n.kind === 'kill' ? K.bigSize : K.size) + 'px';
    },

    make() {
        if (!this.root) {
            this.root = document.createElement('div');
            this.root.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:5';
            document.getElementById('hud').appendChild(this.root);
        }
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;font-weight:bold;font-family:inherit;white-space:nowrap;will-change:transform,opacity;' +
            'text-shadow:0 0 3px #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000';
        this.root.appendChild(el);
        return el;
    },

    drop(n) {
        n.el.remove();
        this.list.splice(this.list.indexOf(n), 1);
    },

    // Runs every rendered frame, after the camera has been placed for this frame.
    update(dt) {
        if (!this.list.length) {
            return;
        }
        const K = CONFIG.damageNumbers;
        camera.updateMatrixWorld();
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        for (let i = this.list.length - 1; i >= 0; i--) {
            const n = this.list[i];
            n.t += dt;
            if (n.t >= K.life) {
                this.drop(n);
                continue;
            }
            const v = this._v.copy(n.pos).project(camera);
            if (v.z > 1) {
                n.el.style.opacity = '0';
                continue;
            }
            const f = n.t / K.life;
            const x = (v.x + 1) * 0.5 * innerWidth + n.dx;
            const y = (1 - v.y) * 0.5 * innerHeight - K.rise * Math.sqrt(f);
            const pop = 1 + 0.45 * Math.max(0, 1 - n.t / 0.12);
            n.el.style.opacity = Math.min(1, (1 - f) / 0.35).toFixed(2);
            n.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
        }
    },

    clear() {
        while (this.list.length) {
            this.drop(this.list[0]);
        }
    }
};
