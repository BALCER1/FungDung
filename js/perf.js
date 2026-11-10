const Perf = {
    on: false,
    el: null,
    frames: 0,
    total: 0,
    work: 0,
    worst: 0,

    set(on) {
        this.on = on;
        if (on && !this.el) {
            this.el = document.createElement('div');
            this.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:20;padding:4px 8px;border-radius:4px;' +
                'background:#000b;color:#9fff9f;font:12px/1.4 monospace;white-space:pre;pointer-events:none';
            this.el.textContent = '-- fps';
            document.body.appendChild(this.el);
        }
        if (this.el) {
            this.el.hidden = !on;
        }
        this.reset();
    },

    reset() {
        this.frames = 0;
        this.total = 0;
        this.work = 0;
        this.worst = 0;
    },

    frame(interval, work) {
        if (!this.on) {
            return;
        }
        this.frames++;
        this.total += interval;
        this.work += work;
        this.worst = Math.max(this.worst, interval);
        if (this.total < 500) {
            return;
        }
        const n = this.frames;
        this.el.textContent =
            `${Math.round(n * 1000 / this.total)} fps   frame ${(this.total / n).toFixed(1)} ms\n` +
            `JS ${(this.work / n).toFixed(1)} ms   worst ${this.worst.toFixed(1)} ms`;
        this.reset();
    }
};
