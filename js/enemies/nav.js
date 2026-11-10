const Nav = {
    STEP: 0.55,
    VAULT: 1.6,
    DX: [1, -1, 0, 0, 1, 1, -1, -1],
    DZ: [0, 0, 1, -1, 1, -1, 1, -1]
};

class NavHeap {
    constructor() {
        this.ids = [];
        this.keys = [];
        this.lastKey = 0;
    }
    get size() {
        return this.ids.length;
    }
    clear() {
        this.ids.length = 0;
        this.keys.length = 0;
    }
    push(id, key) {
        const ids = this.ids;
        const keys = this.keys;
        let i = ids.length;
        ids.push(id);
        keys.push(key);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (keys[p] <= key) {
                break;
            }
            ids[i] = ids[p];
            keys[i] = keys[p];
            i = p;
        }
        ids[i] = id;
        keys[i] = key;
    }
    pop() {
        const ids = this.ids;
        const keys = this.keys;
        const top = ids[0];
        this.lastKey = keys[0];
        const lastId = ids.pop();
        const lastKey = keys.pop();
        const n = ids.length;
        if (n > 0) {
            let i = 0;
            for (;;) {
                let c = 2 * i + 1;
                if (c >= n) {
                    break;
                }
                if (c + 1 < n && keys[c + 1] < keys[c]) {
                    c++;
                }
                if (keys[c] >= lastKey) {
                    break;
                }
                ids[i] = ids[c];
                keys[i] = keys[c];
                i = c;
            }
            ids[i] = lastId;
            keys[i] = lastKey;
        }
        return top;
    }
}

class NavGrid {
    constructor(room, o = {}) {
        const bd = room.bounds;
        this.cs = o.cell || 0.5;
        this.radius = o.radius || 0.35;
        this.maxClimb = o.maxClimb || 3.3;
        this.overhead = o.overhead || 1.7;
        this.x0 = -bd.W;
        this.z0 = -bd.L;
        this.nx = Math.ceil(bd.W * 2 / this.cs);
        this.nz = Math.ceil(bd.L * 2 / this.cs);
        const n = this.nx * this.nz;
        this.n = n;
        this.h = new Float32Array(n);
        this.raw = new Float32Array(n);
        this.blocked = new Uint8Array(n);
        this.over = new Uint8Array(n);
        this.ramp = new Uint8Array(n);

        this.g = new Float32Array(n);
        this.came = new Int32Array(n);
        this.stamp = new Uint32Array(n);
        this.closed = new Uint32Array(n);
        this.run = 0;
        this.heap = new NavHeap();
        this.flows = new Map();
        this.build(room.colliders);
    }

    build(colliders) {
        const decks = [];
        const roofs = [];
        const solids = [];
        for (const c of colliders) {
            if (c.off) {
                continue;
            }
            if (c.min.y > this.overhead && !c.slope && c.max.y <= this.maxClimb && c.max.y - c.min.y < 1) {
                decks.push(c);
                roofs.push(c);
                continue;
            }
            if (c.min.y > this.overhead) {
                roofs.push(c);
                this.fill(c, 0, true, i => {
                    this.over[i] = 1;
                });
                continue;
            }
            solids.push(c);
            const topAt = c.slope ? i => colTop(c, this.cx(i), this.cz(i)) : () => c.max.y;
            this.fill(c, this.radius, false, i => {
                const top = topAt(i);
                if (top > this.h[i]) {
                    this.h[i] = top;
                }
            });
            this.fill(c, 0, true, i => {
                const top = topAt(i);
                if (top > this.raw[i]) {
                    this.raw[i] = top;
                }
                if (c.slope) {
                    this.ramp[i] = 1;
                }
            });
        }
        this.hLow = this.h;
        this.hTop = Float32Array.from(this.h);
        this.deck = new Uint8Array(this.n);
        for (const c of decks) {
            this.fill(c, 0, false, i => {
                if (c.max.y > this.hTop[i]) {
                    this.hTop[i] = c.max.y;
                }
                this.deck[i] = 1;
            });
        }
        const capped = new Uint8Array(this.n);
        for (const c of solids) {
            if (roofs.some(r => r.min.x < c.max.x && r.max.x > c.min.x && r.min.z < c.max.z && r.max.z > c.min.z &&
                r.min.y - c.max.y < 1.9 && r.min.y >= c.max.y - 0.05)) {
                this.fill(c, this.radius, false, i => {
                    if (!this.ramp[i]) {
                        capped[i] = 1;
                    }
                });
            }
        }
        this.blockedLow = this.blocked;
        this.blockedTop = new Uint8Array(this.n);
        for (let i = 0; i < this.n; i++) {
            const lo = this.hLow[i];
            const hi = this.hTop[i];
            if (lo > this.maxClimb || (this.over[i] && lo > 0.3) || (this.deck[i] && lo > 0.3) || capped[i]) {
                this.blockedLow[i] = 1;
            }
            if (hi > this.maxClimb || (this.over[i] && hi > 0.3) || (capped[i] && !this.deck[i])) {
                this.blockedTop[i] = 1;
            }
        }
        this.low = false;
        this.h = this.hTop;
        this.blocked = this.blockedTop;
    }

    setLayer(low) {
        if (low === this.low) {
            return;
        }
        this.low = low;
        this.h = low ? this.hLow : this.hTop;
        this.blocked = low ? this.blockedLow : this.blockedTop;
    }

    fill(c, pad, overlap, fn) {
        const cs = this.cs;
        const k = overlap ? 0 : 0.5;
        const x0 = Math.max(0, Math.ceil((c.min.x - pad - this.x0) / cs - (overlap ? 1 : k)));
        const x1 = Math.min(this.nx - 1, Math.floor((c.max.x + pad - this.x0) / cs - k));
        const z0 = Math.max(0, Math.ceil((c.min.z - pad - this.z0) / cs - (overlap ? 1 : k)));
        const z1 = Math.min(this.nz - 1, Math.floor((c.max.z + pad - this.z0) / cs - k));
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                fn(z * this.nx + x);
            }
        }
    }

    ix(x) {
        return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.x0) / this.cs)));
    }
    iz(z) {
        return Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.z0) / this.cs)));
    }
    cell(x, z) {
        return this.iz(z) * this.nx + this.ix(x);
    }
    cx(i) {
        return this.x0 + (i % this.nx + 0.5) * this.cs;
    }
    cz(i) {
        return this.z0 + (Math.floor(i / this.nx) + 0.5) * this.cs;
    }
    cellDist(a, b) {
        const dx = Math.abs(a % this.nx - b % this.nx);
        const dz = Math.abs(Math.floor(a / this.nx) - Math.floor(b / this.nx));
        return Math.max(dx, dz);
    }
    open(i) {
        return i >= 0 && !this.blocked[i];
    }

    flat(a, b) {
        return !this.blocked[b] && Math.abs(this.h[a] - this.h[b]) <= Nav.STEP;
    }
    link(a, b, diag) {
        if (this.blocked[b]) {
            return -1;
        }
        const nx = this.nx;
        if (diag) {
            const o1 = Math.floor(a / nx) * nx + b % nx;
            const o2 = Math.floor(b / nx) * nx + a % nx;
            if (!this.flat(a, o1) || !this.flat(a, o2) || !this.flat(b, o1) || !this.flat(b, o2)) {
                return -1;
            }
        }
        const dh = this.h[b] - this.h[a];
        if (dh > this.maxClimb) {
            return -1;
        }
        let c = 1;
        if (dh > Nav.STEP) {
            c += this.climbCost(dh);
        } else if (dh < -Nav.STEP) {
            c += 0.4 - dh * 0.3;
        }
        return diag ? c * 1.4142 : c;
    }
    climbCost(dh) {
        return 7 + 4 * dh;
    }
    hdist(a, b) {
        const dx = Math.abs(a % this.nx - b % this.nx);
        const dz = Math.abs(Math.floor(a / this.nx) - Math.floor(b / this.nx));
        return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    }

    path(from, to, maxIter = 9000) {
        const run = ++this.run;
        const { g, came, stamp, closed, heap, nx, nz } = this;
        heap.clear();
        g[from] = 0;
        came[from] = -1;
        stamp[from] = run;
        heap.push(from, this.hdist(from, to));
        let best = from;
        let bestH = this.hdist(from, to);
        let it = 0;
        while (heap.size && it++ < maxIter) {
            const a = heap.pop();
            if (a === to) {
                best = a;
                break;
            }
            if (closed[a] === run) {
                continue;
            }
            closed[a] = run;
            const hA = this.hdist(a, to);
            if (hA < bestH) {
                bestH = hA;
                best = a;
            }
            const ax = a % nx;
            const az = Math.floor(a / nx);
            for (let d = 0; d < 8; d++) {
                const x = ax + Nav.DX[d];
                const z = az + Nav.DZ[d];
                if (x < 0 || z < 0 || x >= nx || z >= nz) {
                    continue;
                }
                const b = z * nx + x;
                if (closed[b] === run) {
                    continue;
                }
                const c = this.link(a, b, d >= 4);
                if (c < 0) {
                    continue;
                }
                const ng = g[a] + c;
                if (stamp[b] !== run || ng < g[b]) {
                    stamp[b] = run;
                    g[b] = ng;
                    came[b] = a;
                    heap.push(b, ng + this.hdist(b, to));
                }
            }
        }
        const out = [];
        for (let i = best; i !== -1; i = came[i]) {
            out.push(i);
        }
        return out.reverse();
    }

    flowTo(who, target, now) {
        let pair = this.flows.get(who.id);
        if (!pair) {
            pair = {
                top: { target: -1, t: -1e9, dist: new Float32Array(this.n) },
                low: { target: -1, t: -1e9, dist: new Float32Array(this.n) }
            };
            this.flows.set(who.id, pair);
        }
        const f = this.low ? pair.low : pair.top;
        if (f.target === target || (f.target >= 0 && now - f.t < 0.25)) {
            return f;
        }
        f.target = target;
        f.t = now;
        const d = f.dist;
        d.fill(Infinity);
        const heap = this.heap;
        const { nx, nz } = this;
        heap.clear();
        d[target] = 0;
        heap.push(target, 0);
        while (heap.size) {
            const a = heap.pop();
            if (heap.lastKey > d[a]) {
                continue;
            }
            const ax = a % nx;
            const az = Math.floor(a / nx);
            for (let k = 0; k < 8; k++) {
                const x = ax + Nav.DX[k];
                const z = az + Nav.DZ[k];
                if (x < 0 || z < 0 || x >= nx || z >= nz) {
                    continue;
                }
                const b = z * nx + x;
                if (this.blocked[b]) {
                    continue;
                }
                const c = this.link(b, a, k >= 4);
                if (c < 0) {
                    continue;
                }
                const nd = d[a] + c;
                if (nd < d[b]) {
                    d[b] = nd;
                    heap.push(b, nd);
                }
            }
        }
        return f;
    }

    downhill(i, f) {
        const { nx, nz } = this;
        const ax = i % nx;
        const az = Math.floor(i / nx);
        let best = -1;
        let bd = f.dist[i];
        for (let k = 0; k < 8; k++) {
            const x = ax + Nav.DX[k];
            const z = az + Nav.DZ[k];
            if (x < 0 || z < 0 || x >= nx || z >= nz) {
                continue;
            }
            const b = z * nx + x;
            const c = this.link(i, b, k >= 4);
            if (c < 0) {
                continue;
            }
            const v = f.dist[b] + c * 0.001;
            if (v < bd) {
                bd = v;
                best = b;
            }
        }
        return best;
    }

    sight(ax, ay, az, bx, by, bz) {
        const dx = bx - ax;
        const dz = bz - az;
        const steps = Math.ceil(Math.hypot(dx, dz) / (this.cs * 0.5));
        for (let s = 1; s < steps; s++) {
            const t = s / steps;
            if (this.raw[this.cell(ax + dx * t, az + dz * t)] > ay + (by - ay) * t) {
                return false;
            }
        }
        return true;
    }

    straight(a, b) {
        const ax = this.cx(a);
        const az = this.cz(a);
        const dx = this.cx(b) - ax;
        const dz = this.cz(b) - az;
        const steps = Math.ceil(Math.hypot(dx, dz) / (this.cs * 0.5));
        let prev = this.h[a];
        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const i = this.cell(ax + dx * t, az + dz * t);
            if (this.blocked[i] || Math.abs(this.h[i] - prev) > Nav.STEP) {
                return false;
            }
            prev = this.h[i];
        }
        return true;
    }

    nearest(x, z, test, R = 8) {
        const cx = this.ix(x);
        const cz = this.iz(z);
        for (let r = 0; r <= R; r++) {
            let best = -1;
            let bd = Infinity;
            for (let dz = -r; dz <= r; dz++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) {
                        continue;
                    }
                    const X = cx + dx;
                    const Z = cz + dz;
                    if (X < 0 || Z < 0 || X >= this.nx || Z >= this.nz) {
                        continue;
                    }
                    const i = Z * this.nx + X;
                    if (!test(i)) {
                        continue;
                    }
                    const d = dx * dx + dz * dz;
                    if (d < bd) {
                        bd = d;
                        best = i;
                    }
                }
            }
            if (best >= 0) {
                return best;
            }
        }
        return -1;
    }

    scan(x, z, rMin, rMax, score, samples = 32) {
        let best = -1;
        let bs = -Infinity;
        for (let s = 0; s < samples; s++) {
            const a = Rng.ai() * Math.PI * 2;
            const r = rMin + Rng.ai() * (rMax - rMin);
            const px = x + Math.sin(a) * r;
            const pz = z + Math.cos(a) * r;
            if (px < this.x0 || pz < this.z0 || px > -this.x0 || pz > -this.z0) {
                continue;
            }
            const i = this.cell(px, pz);
            if (this.blocked[i]) {
                continue;
            }
            const v = score(i);
            if (v > bs) {
                bs = v;
                best = i;
            }
        }
        return best;
    }

    randomCell(test, tries = 300) {
        for (let t = 0; t < tries; t++) {
            const i = Math.floor(Rng.w() * this.n);
            if (!this.blocked[i] && test(i)) {
                return i;
            }
        }
        return -1;
    }
}
