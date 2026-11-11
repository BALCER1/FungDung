const rand = (a, b) => a + Rng.w() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

const RunMap = {
    GAP: 200,
    HEIGHT: 820,
    layers: [],
    current: null,

    generate(stages) {
        const counts = [1];
        for (let i = 1; i < stages - 1; i++) {
            counts.push(Math.min(randInt(2, 4), counts[i - 1] * 3));
        }
        counts.push(1);

        this.layers = counts.map((n, layer) => {
            const inner = layer > 0 && layer < stages - 1;
            return Array.from({ length: n }, (_, index) => ({
                layer,
                index,
                type: this.pickType(layer, stages),
                next: [],
                visited: false,
                x: layer * this.GAP + (inner ? rand(-25, 25) : 0),
                y: this.HEIGHT * (index + 1) / (n + 1) + (n > 1 ? rand(-30, 30) : 0)
            }));
        });
        for (let i = 0; i < stages - 1; i++) {
            this.connect(this.layers[i], this.layers[i + 1]);
        }
        this.current = null;
    },

    pickType(layer, stages) {
        if (layer === 0) {
            return 'start';
        }
        if (layer === stages - 1) {
            return 'boss';
        }
        if (layer === stages - 2) {
            return 'rest';
        }
        if (layer === Math.floor(stages / 2)) {
            return 'treasure';
        }
        const weights = {
            combat: 40,
            event: 18,
            shop: 10,
            treasure: 8,
            elite: layer >= 3 ? 12 : 0,
            rest: layer >= 4 ? 5 : 0,
            cellar: layer >= 2 ? 7 : 0
        };
        let r = Rng.w() * Object.values(weights).reduce((a, b) => a + b, 0);
        for (const [type, w] of Object.entries(weights)) {
            r -= w;
            if (r < 0) {
                return type;
            }
        }
        return 'combat';
    },

    connect(A, B) {
        if (B.length === 1) {
            A.forEach(n => n.next.push(B[0]));
            return;
        }
        const centre = i => A.length === 1 ? (B.length - 1) / 2 : i * (B.length - 1) / (A.length - 1);
        A.forEach((n, i) => {
            const c = Math.round(centre(i));
            let lo = c;
            let hi = c;
            if (Rng.w() < 0.5 && lo > 0) {
                lo--;
            }
            if (Rng.w() < 0.4 && hi < B.length - 1 && hi - lo < 2) {
                hi++;
            }
            for (let j = lo; j <= hi; j++) {
                n.next.push(B[j]);
            }
        });
        B.forEach((m, j) => {
            if (A.some(n => n.next.includes(m))) {
                return;
            }
            let best = null;
            let bestDist = Infinity;
            A.forEach((n, i) => {
                const d = Math.abs(centre(i) - j);
                if (n.next.length < 3 && d < bestDist) {
                    best = n;
                    bestDist = d;
                }
            });
            (best || A[A.length - 1]).next.push(m);
        });
        A.forEach(n => n.next.sort((p, q) => p.index - q.index));
    },

    choices() {
        return this.current ? this.current.next : this.layers[0];
    },

    visit(node) {
        node.visited = true;
        this.current = node;
    }
};

const MapView = {
    R: 24,
    themes: {
        light: { bg: '#f4f1ee', label: '#999', path: '#222', option: '#444', edge: '#aaa', faint: '#ddd8d3', outline: '#333', current: '#222', ring: '#e0a800', hover: '#222', name: '#333' },
        dark: { bg: '#15171c', label: '#666', path: '#fff', option: '#ddd', edge: '#555', faint: '#2c2f36', outline: '#000', current: '#fff', ring: '#ffd84d', hover: '#fff', name: '#ddd' }
    },
    running: false,
    done: false,
    drag: null,

    init() {
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.info = document.getElementById('mapInfo');
        this.hint = document.getElementById('mapHint');
        document.getElementById('legend').innerHTML = Rooms.all()
            .map(d => `<span><i style="background:${Rooms.css(d.color)}"></i>${d.name}</span>`)
            .join('');
        this.frame = this.frame.bind(this);

        addEventListener('resize', () => {
            if (this.running) {
                this.resize();
            }
        });
        this.canvas.addEventListener('mousedown', e => {
            this.finishAnim();
            this.drag = { x: e.clientX, y: e.clientY, moved: 0 };
        });
        addEventListener('mousemove', e => {
            if (!this.running) {
                return;
            }
            if (this.drag) {
                const dx = e.clientX - this.drag.x;
                const dy = e.clientY - this.drag.y;
                this.drag.x = e.clientX;
                this.drag.y = e.clientY;
                this.drag.moved += Math.abs(dx) + Math.abs(dy);
                this.cam.x -= dx / this.cam.zoom;
                this.cam.y -= dy / this.cam.zoom;
                this.clampCam();
            } else if (this.done) {
                this.hover = this.pick(e);
            }
            this.canvas.style.cursor = this.drag ? 'grabbing' : this.hover ? 'pointer' : 'grab';
        });
        addEventListener('mouseup', e => {
            if (!this.drag) {
                return;
            }
            const click = this.drag.moved < 5;
            this.drag = null;
            if (click && this.running) {
                const node = this.pick(e);
                if (node) {
                    this.close();
                    this.onPick(node);
                }
            }
        });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.finishAnim();
            const before = this.toMap(e);
            const fit = this.fitView().zoom;
            this.cam.zoom = Math.max(fit * 0.8, Math.min(3, this.cam.zoom * Math.exp(-e.deltaY * 0.0015)));
            const after = this.toMap(e);
            this.cam.x += before.x - after.x;
            this.cam.y += before.y - after.y;
            this.clampCam();
        }, { passive: false });
        addEventListener('keydown', e => {
            if (this.running && !e.repeat) {
                this.finishAnim();
            }
        });
    },

    open(opts) {
        this.onPick = opts.onPick;
        this.browse = !!opts.browse;
        this.readOnly = !!opts.readOnly;
        this.choices = this.browse ? [] : RunMap.choices();
        this.hover = null;
        this.drag = null;
        this.reachable = this.findReachable();
        const total = RunMap.layers.length;
        const here = RunMap.current;
        if (opts.info) {
            this.info.textContent = opts.info;
        } else if (this.browse) {
            this.info.textContent = `Stage ${here.layer + 1} of ${total} - ${Rooms.get(here.type).name}. Press M to return`;
        } else if (here) {
            const n = this.choices.length;
            this.info.textContent = `Stage ${here.layer + 2} of ${total} - choose your next room (${n} option${n > 1 ? 's' : ''})`;
        } else {
            this.info.textContent = `Stage 1 of ${total} - click the start room to begin`;
        }
        this.resize();
        this.buildAnim(opts.animate);
        this.running = true;
        this.last = performance.now();
        requestAnimationFrame(this.frame);
    },

    close() {
        this.running = false;
        this.drag = null;
    },

    findReachable() {
        const seen = new Set();
        const stack = RunMap.current ? [RunMap.current] : [...RunMap.layers[0]];
        while (stack.length) {
            const n = stack.pop();
            if (!seen.has(n)) {
                seen.add(n);
                stack.push(...n.next);
            }
        }
        return seen;
    },

    resize() {
        this.dpr = Math.min(devicePixelRatio, 2);
        this.cw = innerWidth;
        this.ch = innerHeight;
        this.canvas.width = this.cw * this.dpr;
        this.canvas.height = this.ch * this.dpr;
    },

    fitView() {
        const w = (RunMap.layers.length - 1) * RunMap.GAP;
        const zoom = Math.min((this.cw - 40) / (w + 120), (this.ch - 130) / (RunMap.HEIGHT + 60));
        return { x: w / 2, y: RunMap.HEIGHT / 2 - 10, zoom };
    },

    focusView(nodes) {
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const minX = Math.min(...xs) - 150;
        const maxX = Math.max(...xs) + 150;
        const minY = Math.min(...ys) - 110;
        const maxY = Math.max(...ys) + 110;
        const zoom = Math.min(this.cw / (maxX - minX), (this.ch - 130) / (maxY - minY), 1.3);
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: Math.max(zoom, this.fitView().zoom) };
    },

    buildAnim(animate) {
        const here = RunMap.current || this.choices[0];
        const ahead = this.choices.length ? this.choices : here.next;
        const focus = this.focusView([here, ...ahead, ...ahead.flatMap(n => n.next)]);
        if (animate) {
            const fit = this.fitView();
            const close = { x: here.x, y: here.y, zoom: focus.zoom * 1.8 };
            this.keys = [
                { t: 0, v: close },
                { t: 0.5, v: close },
                { t: 1.7, v: fit },
                { t: 2.5, v: fit },
                { t: 3.7, v: focus }
            ];
        } else {
            this.keys = [{ t: 0, v: focus }];
        }
        this.end = this.keys[this.keys.length - 1].t;
        this.t = 0;
        this.done = false;
        this.cam = this.sample(0);
    },

    finishAnim() {
        if (this.running && !this.done) {
            this.t = this.end;
            this.cam = this.sample(this.end);
            this.done = true;
        }
    },

    sample(t) {
        const k = this.keys;
        if (t >= this.end) {
            return { ...k[k.length - 1].v };
        }
        let i = 0;
        while (t > k[i + 1].t) {
            i++;
        }
        const a = k[i];
        const b = k[i + 1];
        const u = (t - a.t) / (b.t - a.t);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        return {
            x: a.v.x + (b.v.x - a.v.x) * e,
            y: a.v.y + (b.v.y - a.v.y) * e,
            zoom: Math.exp(Math.log(a.v.zoom) + (Math.log(b.v.zoom) - Math.log(a.v.zoom)) * e)
        };
    },

    clampCam() {
        const w = (RunMap.layers.length - 1) * RunMap.GAP;
        this.cam.x = Math.max(-100, Math.min(w + 100, this.cam.x));
        this.cam.y = Math.max(-100, Math.min(RunMap.HEIGHT + 100, this.cam.y));
    },

    toMap(e) {
        const c = this.cam;
        return {
            x: (e.clientX - this.cw / 2) / c.zoom + c.x,
            y: (e.clientY - this.ch / 2) / c.zoom + c.y
        };
    },

    pick(e) {
        if (this.readOnly) {
            return null;
        }
        const p = this.toMap(e);
        return this.choices.find(n => Math.hypot(n.x - p.x, n.y - p.y) < this.R * 1.4) || null;
    },

    frame(now) {
        if (!this.running) {
            return;
        }
        if (!this.done) {
            this.t += Math.min((now - this.last) / 1000, 0.05);
            this.cam = this.sample(this.t);
            this.done = this.t >= this.end;
        }
        this.last = now;
        this.hint.textContent = this.done ? 'Drag to move - scroll to zoom' : 'Click or press any key to skip';
        this.draw(now / 1000);
        requestAnimationFrame(this.frame);
    },

    draw(time) {
        const ctx = this.ctx;
        const c = this.cam;
        const z = c.zoom;
        const P = this.themes[document.documentElement.classList.contains('dark') ? 'dark' : 'light'];
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, this.cw, this.ch);
        ctx.translate(this.cw / 2, this.ch / 2);
        ctx.scale(z, z);
        ctx.translate(-c.x, -c.y);

        ctx.font = '14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = P.label;
        RunMap.layers.forEach((layer, i) => {
            ctx.fillText(`Stage ${i + 1}`, i * RunMap.GAP, -10);
        });

        for (const layer of RunMap.layers) {
            for (const n of layer) {
                for (const m of n.next) {
                    const path = n.visited && m.visited;
                    const option = this.done && n === RunMap.current && this.choices.includes(m);
                    ctx.strokeStyle = path ? P.path : option ? P.option : this.reachable.has(m) ? P.edge : P.faint;
                    ctx.lineWidth = (path ? 4 : option ? 3 : 2) / z;
                    ctx.setLineDash(option ? [8 / z, 6 / z] : []);
                    ctx.beginPath();
                    ctx.moveTo(n.x, n.y);
                    ctx.lineTo(m.x, m.y);
                    ctx.stroke();
                }
            }
        }
        ctx.setLineDash([]);

        for (const layer of RunMap.layers) {
            for (const n of layer) {
                const def = Rooms.get(n.type);
                const col = new THREE.Color(def.color);
                const dim = !n.visited && !this.reachable.has(n);
                ctx.globalAlpha = dim ? 0.25 : 1;
                ctx.fillStyle = Rooms.css(def.color);
                ctx.beginPath();
                ctx.arc(n.x, n.y, this.R, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 2 / z;
                ctx.strokeStyle = P.outline;
                ctx.stroke();
                ctx.font = 'bold 16px system-ui, sans-serif';
                ctx.fillStyle = col.r * 0.3 + col.g * 0.59 + col.b * 0.11 > 0.55 ? '#111' : '#fff';
                ctx.fillText(def.icon || def.name[0], n.x, n.y + 1);
                ctx.globalAlpha = 1;

                if (n === RunMap.current) {
                    ctx.strokeStyle = P.current;
                    ctx.lineWidth = 4 / z;
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, this.R + 7, 0, Math.PI * 2);
                    ctx.stroke();
                }
                if (this.done && this.choices.includes(n)) {
                    const pulse = n === this.hover ? 12 : 7 + Math.sin(time * 5) * 3;
                    ctx.strokeStyle = n === this.hover ? P.hover : P.ring;
                    ctx.lineWidth = 3 / z;
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, this.R + pulse, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = P.name;
                    ctx.font = '13px system-ui, sans-serif';
                    ctx.fillText(def.name, n.x, n.y + this.R + 28);
                }
            }
        }
    }
};
