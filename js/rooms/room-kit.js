const Rooms = {
    defs: {},
    order: [],
    register(type, def) {
        def.type = type;
        this.defs[type] = def;
        this.order.push(type);
    },
    get(type) {
        return this.defs[type];
    },
    all() {
        return this.order.map(t => this.defs[t]);
    },
    css(color) {
        return '#' + new THREE.Color(color).getHexString();
    }
};

class Door {
    constructor(b, x, z, w, h, color) {
        this.x = x;
        this.z = z;
        this.t = 0;
        this.isOpen = false;
        this.pivot = new THREE.Group();
        this.pivot.position.set(x - w / 2, 0, z - 0.25);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), b.mat(color));
        leaf.position.set(w / 2, h / 2, 0);
        this.pivot.add(leaf);
        b.group.add(this.pivot);
        this.collider = b.solid(x, 0, z - 0.25, w, h, 0.3);
    }
    near(pos) {
        return Math.hypot(pos.x - this.x, pos.z - this.z) < 3;
    }
    open() {
        this.isOpen = true;
        this.collider.off = true;
    }
    passed(pos) {
        return pos.z < this.z - 1.2;
    }
    update(dt) {
        if (this.isOpen && this.t < 1) {
            this.t = Math.min(1, this.t + dt * 1.5);
            const e = this.t * this.t * (3 - 2 * this.t);
            this.pivot.rotation.y = e * 1.6;
        }
    }
}

const RoomKit = {
    shade(color, k) {
        return new THREE.Color(color).multiplyScalar(k).getHex();
    },
    basicRoom(b, o) {
        const W = (o.width || 14) / 2;
        const L = (o.length || 22) / 2;
        const H = o.height || 5;
        const T = 0.5;
        const wall = o.wall || o.color;
        const floor = o.floor || this.shade(o.color, 0.85);
        const ceiling = o.ceiling || this.shade(o.color, 0.95);
        const dw = 2.4;
        const dh = 3.2;
        const side = W - dw / 2;

        b.deco(0, -0.1, 0, W * 2, 0.1, L * 2, floor);
        b.deco(0, H, 0, W * 2, 0.1, L * 2, ceiling);
        b.box(-W - T / 2, 0, 0, T, H, L * 2 + T * 2, wall);
        b.box(W + T / 2, 0, 0, T, H, L * 2 + T * 2, wall);
        b.box(0, 0, L + T / 2, W * 2, H, T, wall);

        b.box(-(dw / 2 + side / 2), 0, -L - T / 2, side, H, T, wall);
        b.box(dw / 2 + side / 2, 0, -L - T / 2, side, H, T, wall);
        b.box(0, dh, -L - T / 2, dw, H - dh, T, wall);

        const depth = 4;
        const cz = -L - T - depth / 2;
        b.dark(0, -0.1, cz, dw + 1, 0.1, depth, false);
        b.dark(0, dh, cz, dw + 1, 0.1, depth, false);
        b.dark(-dw / 2 - 0.25, 0, cz, 0.5, dh, depth);
        b.dark(dw / 2 + 0.25, 0, cz, 0.5, dh, depth);
        b.dark(0, 0, -L - T - depth - 0.25, dw + 1, dh, 0.5);

        b.door = new Door(b, 0, -L, dw, dh, o.doorColor || 0x5b4130);
        b.spawn = { x: 0, z: L - 2, yaw: 0 };
        return { W, L, H };
    },

    // ---- random helpers ----
    rand(a, b) {
        return a + Math.random() * (b - a);
    },
    pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    },
    weighted(table) {
        let r = Math.random() * Object.values(table).reduce((a, b) => a + b, 0);
        for (const [k, w] of Object.entries(table)) {
            r -= w;
            if (r < 0) {
                return k;
            }
        }
        return Object.keys(table)[0];
    },

    // Shades of the room colour so props read against the floor and walls.
    palette(color) {
        const tint = (k) => {
            const c = new THREE.Color(color);
            return k > 1 ? c.lerp(new THREE.Color(0xffffff), k - 1).getHex() : c.multiplyScalar(k).getHex();
        };
        return {
            pillar: tint(0.7),
            cover: tint(1.25),
            wall: tint(0.9),
            raised: tint(0.75),
            stairs: tint(0.62),
            mound: tint(0.78),
            crate: tint(0.55)
        };
    },

    // ---- building blocks ----
    // Stairs are stacked solid blocks; each rise stays under CONFIG.step so you walk straight up.
    // (x, z) is the foot of the stairs, (dx, dz) the axis direction you climb toward.
    stairs(b, x, z, width, top, dx, dz, color) {
        const n = Math.ceil(top / 0.4);
        const rise = top / n;
        const D = 0.6;
        for (let i = 0; i < n; i++) {
            const h = rise * (i + 1);
            const px = x + dx * (i + 0.5) * D;
            const pz = z + dz * (i + 0.5) * D;
            if (dx) {
                b.box(px, 0, pz, D, h, width, color);
            } else {
                b.box(px, 0, pz, width, h, D, color);
            }
        }
        return n * D;
    },
    stairsLength(top) {
        return Math.ceil(top / 0.4) * 0.6;
    },
    pillar(b, x, z, size, h, color) {
        b.box(x, 0, z, size, h, size, color);
    },
    // Low wall you can see (and shoot) over.
    cover(b, x, z, len, alongX, color, h = 1.3) {
        b.box(x, 0, z, alongX ? len : 0.5, h, alongX ? 0.5 : len, color);
    },
    // Stepped hill; every tier is a walkable step.
    mound(b, x, z, w, d, tiers, color) {
        for (let i = 0; i < tiers; i++) {
            const tw = w - i * 1.6;
            const td = d - i * 1.6;
            if (tw < 1.2 || td < 1.2) {
                break;
            }
            b.box(x, 0, z, tw, 0.4 * (i + 1), td, color);
        }
    },
    crates(b, x, z, w, d, color) {
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
            const s = this.rand(0.9, 1.2);
            const cx = x + this.rand(-w / 2 + s / 2, w / 2 - s / 2);
            const cz = z + this.rand(-d / 2 + s / 2, d / 2 - s / 2);
            b.box(cx, 0, cz, s, s, s, color);
            if (Math.random() < 0.35) {
                const t = s * 0.8;
                b.box(cx + this.rand(-0.1, 0.1), s, cz + this.rand(-0.1, 0.1), t, t, t, color);
            }
        }
    },
    // Raised platform on four legs with stairs up one side. Fits inside a w x d footprint.
    balcony(b, x, z, w, d, top, pal) {
        const run = this.stairsLength(top);
        const alongX = w >= d;
        const long = alongX ? w : d;
        const short = alongX ? d : w;
        const s = Math.min(4.5, long - run, short);
        if (s < 2.5) {
            return false;
        }
        const flip = Math.random() < 0.5 ? 1 : -1;
        const start = -(run + s) / 2;
        const slab = start + run + s / 2;
        const sx = alongX ? x + slab * flip : x;
        const sz = alongX ? z : z + slab * flip;
        const t = 0.35;
        b.box(sx, top - t, sz, s, t, s, pal.raised);
        for (const ox of [-1, 1]) {
            for (const oz of [-1, 1]) {
                this.pillar(b, sx + ox * (s / 2 - 0.3), sz + oz * (s / 2 - 0.3), 0.45, top - t, pal.pillar);
            }
        }
        const fx = alongX ? x + start * flip : x;
        const fz = alongX ? z : z + start * flip;
        this.stairs(b, fx, fz, Math.min(2, s), top, alongX ? flip : 0, alongX ? 0 : flip, pal.stairs);
        return true;
    },

    // Fills one cell of the room grid with a random prop. w/d is the usable footprint.
    feature(b, kind, x, z, w, d, H, pal) {
        const alongX = Math.random() < 0.5;
        switch (kind) {
            case 'pillars': {
                const size = this.rand(1.1, 1.6);
                const pattern = this.pick(['one', 'pair', 'quad']);
                const ox = Math.max(0, w / 2 - size);
                const oz = Math.max(0, d / 2 - size);
                if (pattern === 'one') {
                    this.pillar(b, x, z, size * 1.5, H, pal.pillar);
                } else if (pattern === 'pair') {
                    this.pillar(b, x - (alongX ? ox : 0), z - (alongX ? 0 : oz), size, H, pal.pillar);
                    this.pillar(b, x + (alongX ? ox : 0), z + (alongX ? 0 : oz), size, H, pal.pillar);
                } else {
                    for (const sx of [-1, 1]) {
                        for (const sz of [-1, 1]) {
                            this.pillar(b, x + sx * ox * 0.7, z + sz * oz * 0.7, size, H, pal.pillar);
                        }
                    }
                }
                break;
            }
            case 'cover': {
                const len = Math.min(alongX ? w : d, this.rand(3, 5.5));
                this.cover(b, x, z, len, alongX, pal.cover);
                if (Math.random() < 0.5) {
                    // turn it into an L with a short arm off one end
                    const len2 = Math.min((alongX ? d : w) / 2, this.rand(2, 3.5));
                    const end = (len / 2 - 0.25) * (Math.random() < 0.5 ? 1 : -1);
                    const dir = Math.random() < 0.5 ? 1 : -1;
                    const ex = alongX ? x + end : x + dir * len2 / 2;
                    const ez = alongX ? z + dir * len2 / 2 : z + end;
                    this.cover(b, ex, ez, len2, !alongX, pal.cover);
                }
                break;
            }
            case 'wall': {
                const len = Math.min(alongX ? w : d, this.rand(4, 7));
                const h = Math.random() < 0.5 ? H : this.rand(2.6, H * 0.7);
                b.box(x, 0, z, alongX ? len : 0.7, h, alongX ? 0.7 : len, pal.wall);
                break;
            }
            case 'mound':
                this.mound(b, x, z, w * this.rand(0.7, 1), d * this.rand(0.7, 1), 2 + Math.floor(Math.random() * 3), pal.mound);
                break;
            case 'crates':
                this.crates(b, x, z, w, d, pal.crate);
                break;
            case 'balcony':
                if (!this.balcony(b, x, z, w, d, this.rand(2.4, 3), pal)) {
                    this.feature(b, 'cover', x, z, w, d, H, pal);
                }
                break;
        }
    },

    // Raised walkway along a side wall with stairs at the spawn end.
    ledge(b, side, W, L, width, top, pal) {
        const run = this.stairsLength(top);
        const z0 = -L;
        const z1 = L - 5 - run;
        const x = side * (W - width / 2);
        b.box(x, 0, (z0 + z1) / 2, width, top, z1 - z0, pal.raised);
        this.stairs(b, x, z1 + run, width, top, 0, -1, pal.stairs);
        return width;
    },

    // Big room with optional side ledges and a grid of random props.
    // Spawn end and door end are kept clear so you never start boxed in.
    arena(b, o) {
        const dims = this.basicRoom(b, o);
        const { W, L, H } = dims;
        const pal = this.palette(o.color);

        const sides = o.ledges === undefined ? this.pick([[], [-1], [1], [-1, 1]]) : o.ledges;
        let left = -W + 1;
        let right = W - 1;
        for (const s of sides) {
            const lw = this.ledge(b, s, W, L, o.ledgeWidth || 4, o.ledgeHeight || 3, pal);
            if (s < 0) {
                left = -W + lw + 1.5;
            } else {
                right = W - lw - 1.5;
            }
        }

        const top = -L + (o.doorClear || 6);
        const bottom = L - (o.spawnClear || 7);
        const cell = o.cell || 11;
        const cols = Math.max(1, Math.round((right - left) / cell));
        const rows = Math.max(1, Math.round((bottom - top) / cell));
        const cw = (right - left) / cols;
        const cd = (bottom - top) / rows;
        const margin = 1.5;
        const table = o.features || { pillars: 3, cover: 4, wall: 2, mound: 2, crates: 3, balcony: 2, empty: 2 };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const kind = this.weighted(table);
                if (kind === 'empty') {
                    continue;
                }
                const x = left + cw * (c + 0.5) + this.rand(-0.6, 0.6);
                const z = top + cd * (r + 0.5) + this.rand(-0.6, 0.6);
                this.feature(b, kind, x, z, cw - margin * 2, cd - margin * 2, H, pal);
            }
        }
        return Object.assign(dims, { pal });
    }
};
