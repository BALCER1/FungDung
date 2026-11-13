const Vitals = {
    max: 100,
    hp: 100,
    dead: false,
    flash: 0,
    marks: [],
    el: {},

    init() {
        const hud = document.getElementById('hud');
        const bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;left:16px;bottom:16px;width:220px;color:#fff;font:600 13px system-ui,sans-serif;text-shadow:0 1px 3px #000a';
        bar.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>HP</span><span data-v></span></div>' +
            '<div style="height:8px;background:#0006;border:1px solid #fff4;border-radius:2px;overflow:hidden">' +
            '<i data-b style="display:block;height:100%;width:100%;background:#e8eaed;transition:width .12s"></i></div>';
        hud.appendChild(bar);
        this.el.value = bar.querySelector('[data-v]');
        this.el.bar = bar.querySelector('[data-b]');

        const vig = document.createElement('div');
        vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(190,10,30,.85) 100%)';
        hud.appendChild(vig);
        this.el.vig = vig;

        const ring = document.createElement('div');
        ring.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none';
        hud.appendChild(ring);
        this.el.ring = ring;
        this.draw();
    },

    reset() {
        this.hp = this.max;
        this.dead = false;
        this.flash = 0;
        for (const m of this.marks) {
            m.el.remove();
        }
        this.marks.length = 0;
        this.draw();
    },

    hurt(n, from) {
        if (this.dead) {
            return;
        }
        this.hp = Math.max(0, this.hp - n);
        this.flash = Math.min(1, this.flash + 0.3 + n / 40);
        if (from) {
            this.indicate(from);
        }
        this.draw();
        if (this.hp <= 0) {
            this.dead = true;
        }
    },

    revive(hp) {
        this.hp = Math.max(1, Math.min(this.max, Math.round(hp)));
        this.dead = false;
        this.flash = 0;
        this.draw();
    },

    heal(n) {
        this.hp = Math.min(this.max, this.hp + n);
        this.draw();
    },

    indicate(from) {
        const dx = from.x - Player.pos.x;
        const dz = from.z - Player.pos.z;
        const s = Math.sin(Player.yaw);
        const c = Math.cos(Player.yaw);
        const right = dx * c - dz * s;
        const ahead = -dx * s - dz * c;
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:-14px;top:-150px;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;' +
            'border-bottom:22px solid rgba(255,40,60,.9);transform-origin:14px 150px;filter:drop-shadow(0 0 4px #f00)';
        el.style.transform = `rotate(${Math.atan2(right, ahead)}rad)`;
        this.el.ring.appendChild(el);
        this.marks.push({ el, t: 0.9 });
    },

    update(dt) {
        this.flash = Math.max(0, this.flash - dt * 1.6);
        const spectating = typeof Players !== 'undefined' && Players.local && Players.local.dead;
        const low = this.hp / this.max < 0.3 && !spectating ?0.25 + 0.1 * Math.sin(performance.now() / 160) : 0;
        this.el.vig.style.opacity = Math.max(this.flash, low).toFixed(3);
        for (let i = this.marks.length - 1; i >= 0; i--) {
            const m = this.marks[i];
            m.t -= dt;
            m.el.style.opacity = Math.max(0, m.t / 0.9).toFixed(3);
            if (m.t <= 0) {
                m.el.remove();
                this.marks.splice(i, 1);
            }
        }
    },

    draw() {
        if (!this.el.bar) {
            return;
        }
        const f = this.hp / this.max;
        this.el.value.textContent = Math.ceil(this.hp) + ' / ' + this.max;
        this.el.bar.style.width = (f * 100) + '%';
        this.el.bar.style.background = f < 0.3 ? '#ff3b4e' : f < 0.6 ? '#ffb347' : '#e8eaed';
    }
};
