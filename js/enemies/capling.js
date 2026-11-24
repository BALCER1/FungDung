// Capling: a hunched, blocky fungal colony worker (about 1.1 m) with dark brownish-green skin,
// long bone talons and glowing mushrooms growing from its back. It is very proud of its silver
// armour: an angular breastplate, layered pauldrons, forearm guards, light shin splints, brass trim,
// and one of several big helmets after real medieval ones, sunk into an armoured collar. Mycelium
// has started to grow over all of it. Calm ones polish their breastplate; breaking a piece enrages
// the wearer. Bloodthirsty: once alerted it lurches at you with its hands out, grabbing like a
// zombie, rakes and pounces, and the colony works itself into a frenzy every time it draws blood.
// Built to be cheap in numbers:
// - One colony brain per room (`CaplingMind`) senses and decides for every worker a few times a
//   second. A worker only steers to the spot the colony gave it and attacks when allowed.
// - Movement uses the per-player flow field Shellcaps already compute, so workers never run A*
//   while fighting.
// - Jointed limbs (hip, knee, ankle, shoulder, elbow, wrist, fingers) are driven by a walk cycle,
//   not IK. The hips are lifted to keep the lower foot on the floor, which gives the bob. Far
//   workers animate at a lower rate.
// Shares `SHELL_VS`, `HEAD_MULT`, `LIMB_MULT`, `shellGeoBase`, `mergeGeos` and `chip` with
// shellcap.js, which loads first.

const CAPLING_HITS = ['shell', 'flesh', 'crit', 'break'];
// Glow colour by bloodlust (mood 0..3): amber to blood red.
const CAPLING_MOODS = [0xffc23c, 0xff8a1e, 0xff4a14, 0xff1430];
// Helmet styles. `eyes`: the face shows (open helmets); closed ones have glowing eye slits instead.
const CAPLING_HELMS = [
    { name: 'kettle hat', eyes: true },
    { name: 'nasal helm', eyes: true },
    { name: 'great helm', eyes: false },
    { name: 'sallet', eyes: false },
    { name: 'barbute', eyes: false }
];
const CP = {
    thigh: 0.21, shin: 0.19, legX: 0.14, hipDrop: 0.03, ankle: 0.02,
    spine: 0.05, shoulderX: 0.27, shoulderY: 0.33, shoulderZ: 0.02, upper: 0.2, fore: 0.19,
    neck: 0.33, neckZ: 0.15, headY: 0.05, helm: 1.3,
    stride: 0.7, run: 3.6,
    farMyco: 24         // beyond this the mycelium on the armour is not drawn
};
CP.hip = CP.thigh + CP.shin + CP.hipDrop + CP.ankle;
const CP_KEYS = ['lean', 'twist', 'sway', 'roll', 'headP', 'headY', 'headR'];
const CP_PAIRS = ['hip', 'knee', 'ankle', 'sh', 'shOut', 'shY', 'elb', 'wr', 'grip'];
const _cv = new THREE.Vector3();

function cpEase(x) {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    return x * x * (3 - 2 * x);
}

function cpLerp(a, b, k) {
    return a + (b - a) * k;
}

function caplingPose() {
    return {
        lean: 0.45, twist: 0, sway: 0, roll: 0, headP: -0.3, headY: 0, headR: 0,
        hip: [-0.26, -0.26], knee: [0.52, 0.52], ankle: [-0.23, -0.23],
        sh: [0, 0], shOut: [0.2, -0.2], shY: [0, 0], elb: [-0.4, -0.4], wr: [0.2, 0.2], grip: [0.4, 0.4]
    };
}

// Colours are painted into the geometry (a `color` attribute), so a whole worker needs only three
// materials: matte (skin, hands, feet, mouth, mycelium), metal (steel, brass, bone talons) and the
// glow. With the batch's `colors` option that is three draw calls per worker.
const CP_COLOR = {
    flesh: 0x45402a,    // brownish dark green skin
    dark: 0x24211a,     // hands, feet, slits
    myco: 0xece3c8,     // mycelium
    steel: 0xa3a9b0,
    brass: 0xb08f4c,
    bone: 0xc8b894
};

const CaplingKit = {
    ready: false,
    build() {
        if (this.ready) {
            return;
        }
        this.ready = true;
        // Armour tints multiply the painted colours, so cracked and broken plates stay recognisable.
        const metal = (color, emissive) => new THREE.MeshPhongMaterial({
            color, emissive, specular: 0xd8dee6, shininess: 80, flatShading: true, side: THREE.DoubleSide, vertexColors: true
        });
        this.mat = {
            matte: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x070604, vertexColors: true }),
            shell: metal(0xffffff, 0x000000),
            cracked: metal(0xdbc7ad, 0x2a0c00),
            critical: metal(0xbf7045, 0x6a1c04),
            glow: CAPLING_MOODS.map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })),
            flash: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        };
        this.colors = CAPLING_MOODS.map(c => new THREE.Color(c));
        this.chip = new THREE.Color(0x9aa0a6);
        this.dust = new THREE.Color(0x6e6258);
        this.spore = new THREE.Color(0xe8d9a8);
        this.geos = {};
        this.level = DETAIL.enemies;
        this.geo = this.geos[this.level] = this.makeGeo(this.level);
    },

    setDetail(level) {
        if (!this.ready || this.level === level) {
            return;
        }
        this.level = level;
        this.geo = this.geos[level] || (this.geos[level] = this.makeGeo(level));
        scene.traverse(o => {
            const key = o.isMesh && o.geometry.userData.cpKey;
            if (key) {
                o.geometry = this.geo[key];
            }
        });
    },

    // Seeded generator for geometry details, so every client builds the same mycelium.
    prng(seed) {
        let s = seed | 0;
        return () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // Face normals, so the smooth-shaded matte material still looks faceted.
    flat(g) {
        const o = g.index ? g.toNonIndexed() : g;
        o.computeVertexNormals();
        return o;
    },

    // One colour over a whole piece.
    paint(g, hex) {
        const o = g.index ? g.toNonIndexed() : g;
        if (!o.attributes.normal) {
            o.computeVertexNormals();
        }
        const c = new THREE.Color(hex);
        const n = o.attributes.position.count;
        const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            a[i * 3] = c.r;
            a[i * 3 + 1] = c.g;
            a[i * 3 + 2] = c.b;
        }
        o.setAttribute('color', new THREE.BufferAttribute(a, 3));
        return o;
    },

    // Like `mergeGeos`, but keeps the painted colours (white where a piece has none).
    merge(list) {
        const parts = [];
        let n = 0;
        for (let g of list) {
            if (g.index) {
                g = g.toNonIndexed();
            }
            if (!g.attributes.normal) {
                g.computeVertexNormals();
            }
            parts.push(g);
            n += g.attributes.position.count;
        }
        const pos = new Float32Array(n * 3);
        const nor = new Float32Array(n * 3);
        const col = new Float32Array(n * 3).fill(1);
        let o = 0;
        for (const g of parts) {
            const c = g.attributes.position.count;
            pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
            nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
            if (g.attributes.color) {
                col.set(g.attributes.color.array.subarray(0, c * 3), o * 3);
            }
            o += c;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return out;
    },

    // Mycelium: thin strands that creep over the real (faceted) surface of a piece of armour,
    // branching as they go, with tiny pale mushrooms sprouting from them. `surfs` are the outer
    // surfaces to grow on, `o.centre` a point inside the piece (to tell outward faces from inward
    // ones; `o.radial` ignores height for that, `o.keep(normal)` filters faces). Each step is
    // projected back onto the nearest triangle, so strands follow every facet and stop at the edges.
    // A strand is a flat ribbon just above the surface (two triangles a step, facing out), a sprout
    // a three-sided stalk and a five-sided cap.
    grow(surfs, o) {
        const V = THREE.Vector3;
        const rnd = this.prng(o.seed);
        const centre = o.centre || new V();
        const tris = [];
        let total = 0;
        for (const s of surfs) {
            const g = s.index ? s.toNonIndexed() : s;
            const p = g.attributes.position;
            for (let i = 0; i + 2 < p.count; i += 3) {
                const t = new THREE.Triangle(new V().fromBufferAttribute(p, i), new V().fromBufferAttribute(p, i + 1), new V().fromBufferAttribute(p, i + 2));
                const area = t.getArea();
                if (area < 1e-6) {
                    continue;
                }
                const nrm = t.getNormal(new V());
                const out = t.getMidpoint(new V()).sub(centre);
                if (o.radial) {
                    out.y = 0;
                }
                if (nrm.dot(out) < 0) {
                    nrm.negate();
                }
                if (nrm.y < -0.4 || (o.keep && !o.keep(nrm))) {
                    continue;
                }
                total += area;
                tris.push({ t, n: nrm, cum: total });
            }
        }
        if (!tris.length) {
            return this.paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)), CP_COLOR.myco);
        }
        const pick = () => {
            const r = rnd() * total;
            let lo = 0;
            let hi = tris.length - 1;
            while (lo < hi) {
                const m = (lo + hi) >> 1;
                if (tris[m].cum < r) {
                    lo = m + 1;
                } else {
                    hi = m;
                }
            }
            return tris[lo];
        };
        const near = new V();
        const project = q => {
            let bd = Infinity;
            let bt = null;
            const best = new V();
            for (const T of tris) {
                T.t.closestPointToPoint(q, near);
                const d = near.distanceToSquared(q);
                if (d < bd) {
                    bd = d;
                    bt = T;
                    best.copy(near);
                }
            }
            return { p: best, n: bt.n, d: Math.sqrt(bd) };
        };
        const tangent = (v, nrm) => v.addScaledVector(nrm, -v.dot(nrm)).normalize();
        const lines = [];
        const sprouts = [];
        const walk = (p, nrm, d, steps, w, depth) => {
            const line = [{ p, n: nrm, w }];
            for (let i = 0; i < steps; i++) {
                d.applyAxisAngle(nrm, (rnd() - 0.5) * o.turn);
                const r = project(p.clone().addScaledVector(d, o.step));
                if (r.d > o.step * 0.8) {
                    break;
                }
                const nd = r.p.clone().sub(p);
                if (nd.lengthSq() < 1e-8) {
                    break;
                }
                d = tangent(nd, r.n);
                p = r.p;
                nrm = r.n;
                line.push({ p, n: nrm, w: w * (0.35 + 0.65 * (1 - (i + 1) / (steps + 1))) });
                if (depth < 2 && rnd() < o.branch) {
                    walk(p, nrm, d.clone().applyAxisAngle(nrm, (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.7)),
                        Math.max(2, Math.floor(steps * 0.6)), w * 0.7, depth + 1);
                }
                if (rnd() < o.sprout) {
                    sprouts.push({ p, n: nrm });
                }
            }
            if (line.length > 1) {
                lines.push(line);
            }
        };
        for (let s = 0; s < o.strands; s++) {
            const T = pick();
            let a = rnd();
            let b = rnd();
            if (a + b > 1) {
                a = 1 - a;
                b = 1 - b;
            }
            const p = T.t.a.clone().addScaledVector(T.t.b.clone().sub(T.t.a), a).addScaledVector(T.t.c.clone().sub(T.t.a), b);
            const d = tangent(new V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), T.n);
            if (isFinite(d.x)) {
                walk(p, T.n, d, o.steps, o.width, 0);
            }
        }

        const v = [];
        const tri = (a, b, c) => v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        const dir = new V();
        const side = new V();
        for (const line of lines) {
            let prev = null;
            for (let i = 0; i < line.length; i++) {
                const a = line[i];
                dir.copy(line[Math.min(i + 1, line.length - 1)].p).sub(line[Math.max(i - 1, 0)].p).normalize();
                // side = dir x normal: with this winding both triangles face out along the normal.
                side.crossVectors(dir, a.n).normalize().multiplyScalar(i === line.length - 1 ? a.w * 0.15 : a.w);
                const base = a.p.clone().addScaledVector(a.n, 0.004);
                const cur = [base.clone().sub(side), base.clone().add(side)];
                if (prev) {
                    tri(prev[0], prev[1], cur[0]);
                    tri(prev[1], cur[1], cur[0]);
                }
                prev = cur;
            }
        }
        const ribbon = new THREE.BufferGeometry();
        ribbon.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        const parts = [ribbon];
        const up = new V(0, 1, 0);
        const q = new THREE.Quaternion();
        const m = new THREE.Matrix4();
        const one = new V(1, 1, 1);
        for (const s of sprouts) {
            const r = o.cap * (0.7 + rnd() * 0.6);
            const h = o.cap * (1.2 + rnd() * 1.3);
            const lean = new V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.7);
            q.setFromUnitVectors(up, s.n.clone().add(lean).normalize());
            m.compose(s.p, q, one);
            parts.push(new THREE.CylinderGeometry(r * 0.22, r * 0.32, h, 3, 1, true).translate(0, h / 2, 0).applyMatrix4(m));
            parts.push(new THREE.ConeGeometry(r, r * 0.7, 5, 1, true).translate(0, h + r * 0.3, 0).applyMatrix4(m));
        }
        return this.paint(this.flat(mergeGeos(parts)), CP_COLOR.myco);
    },

    // Blocky by design: boxes, square prisms and six-sided plates, all flat-shaded. Armour has real
    // thickness (`solid`), so no piece looks paper-thin or hollow from any side. Every piece is
    // painted, and pieces that move together and share a material are merged into one mesh.
    makeGeo(level) {
        const n = (v, min = 3) => DETAIL.seg(level, v, min);
        const H = Math.PI / 2;
        const TAU = Math.PI * 2;
        const C = CP_COLOR;
        const flat = g => this.flat(g);
        const paint = (g, hex) => this.paint(g, hex);
        const merge = list => this.merge(list);
        // A square prism hanging down from a joint, faces aligned with the axes.
        const prism = (rt, rb, h, y) => new THREE.CylinderGeometry(rt, rb, h, 4).rotateY(Math.PI / 4).translate(0, y, 0);
        // An open six-sided surface, `t0`/`tl` in cylinder angles: 0 is the front (+z), PI/2 is +x.
        const arc = (rt, rb, h, y, t0 = 0, tl = TAU, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true, t0, tl).translate(0, y, 0);
        // The same plate with thickness `th`: outer and inner faces, rims and end caps.
        const solid = (rt, rb, h, y, t0 = 0, tl = TAU, seg = 6, th = 0.018) => {
            if (level === 'potato') {
                return arc(rt, rb, h, y, t0, tl, seg);
            }
            const v = [];
            const P = (r, a, yy) => [r * Math.sin(a), yy, r * Math.cos(a)];
            const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
            const y0 = y - h / 2;
            const y1 = y + h / 2;
            for (let i = 0; i < seg; i++) {
                const a0 = t0 + tl * i / seg;
                const a1 = t0 + tl * (i + 1) / seg;
                quad(P(rb, a0, y0), P(rb, a1, y0), P(rt, a1, y1), P(rt, a0, y1));
                quad(P(rb - th, a1, y0), P(rb - th, a0, y0), P(rt - th, a0, y1), P(rt - th, a1, y1));
                quad(P(rt, a0, y1), P(rt, a1, y1), P(rt - th, a1, y1), P(rt - th, a0, y1));
                quad(P(rb, a1, y0), P(rb, a0, y0), P(rb - th, a0, y0), P(rb - th, a1, y0));
            }
            if (tl < TAU - 1e-4) {
                const a1 = t0 + tl;
                quad(P(rb, t0, y0), P(rt, t0, y1), P(rt - th, t0, y1), P(rb - th, t0, y0));
                quad(P(rb, a1, y0), P(rb - th, a1, y0), P(rt - th, a1, y1), P(rt, a1, y1));
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            g.computeVertexNormals();
            return g;
        };
        // A faceted dome closed underneath, matching `SphereGeometry`'s rim vertices exactly.
        const dome = (r, seg, rows, t1) => {
            const g = new THREE.SphereGeometry(r, seg, rows, 0, TAU, 0, t1);
            const v = [];
            const rim = k => {
                const ph = TAU * k / seg;
                return [-r * Math.cos(ph) * Math.sin(t1), r * Math.cos(t1), r * Math.sin(ph) * Math.sin(t1)];
            };
            const c = [0, r * Math.cos(t1), 0];
            for (let k = 0; k < seg; k++) {
                v.push(...c, ...rim(k), ...rim(k + 1));
            }
            const cap = new THREE.BufferGeometry();
            cap.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            return mergeGeos([g, cap]);
        };
        // Narrow the bottom of a box: `bx`, `bz` are the bottom's width and depth as fractions.
        const taper = (g, bx, bz) => {
            g.computeBoundingBox();
            const lo = g.boundingBox.min.y;
            const hi = g.boundingBox.max.y;
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const t = (p.getY(i) - lo) / (hi - lo);
                p.setX(i, p.getX(i) * cpLerp(bx, 1, t));
                p.setZ(i, p.getZ(i) * cpLerp(bz, 1, t));
            }
            return g;
        };
        const stud = (s, x, y, z) => new THREE.ConeGeometry(s * 0.75, s, 4, 1, true).translate(x, y + s * 0.3, z);
        const shell = (rx, ry, rz, p0, pl, t0, tl, seg = 8, bump = 0.02) => shellGeoBase(rx, ry, rz, p0, pl, t0, tl, n(seg, 4), bump);
        // Place a piece standing on +y at `at`, pointing along `dir`.
        const up = new THREE.Vector3(0, 1, 0);
        const aim = (g, at, dir) => g.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(...at), new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...dir).normalize()), new THREE.Vector3(1, 1, 1)));
        // Fewer strands at lower detail levels, and no sprouts at the lowest.
        const myco = (surfs, o) => {
            const p = Object.assign({ strands: 10, steps: 7, step: 0.03, width: 0.008, turn: 1.1, branch: 0.22, sprout: 0.06, cap: 0.014 }, o);
            p.strands = n(p.strands, 2);
            if (level === 'potato') {
                p.sprout = 0;
            }
            return this.grow(surfs, p);
        };

        // ---- body
        // Feet: big and flat, three heavy toe talons and a heel spur.
        const toes = [];
        for (const x of [-0.05, 0, 0.05]) {
            toes.push(new THREE.ConeGeometry(0.024, 0.09, 4, 1, true).rotateX(H + 0.35).translate(x, -0.005, 0.2));
        }
        toes.push(new THREE.ConeGeometry(0.02, 0.06, 4, 1, true).rotateX(-H - 0.3).translate(0, 0, -0.1));
        // Talons: three long, curved, segmented claws and a thumb claw. They curl toward the palm
        // (-z) when the fingers joint closes. The segments' ends are hidden, so they are open.
        const talons = sg => mergeGeos([[-0.042, 0.95], [0, 1.1], [0.042, 0.95], [-0.065 * sg, 0.7]].map(([x, k]) => {
            const claw = level === 'potato'
                ? new THREE.ConeGeometry(0.018, 0.17 * k, 4, 1, true).rotateX(Math.PI).translate(0, -0.085 * k, 0).rotateX(0.45).translate(0, -0.02, 0)
                : mergeGeos([
                    new THREE.BoxGeometry(0.032, 0.045, 0.036).translate(0, -0.02, 0),
                    new THREE.CylinderGeometry(0.017, 0.014, 0.07 * k, 4, 1, true).rotateY(Math.PI / 4).translate(0, -0.035 * k, 0).rotateX(0.25).translate(0, -0.04, 0),
                    new THREE.ConeGeometry(0.014, 0.09 * k, 4, 1, true).rotateX(Math.PI).translate(0, -0.045 * k, 0).rotateX(0.7).translate(0, -0.04 - 0.065 * k, -0.018 * k)
                ]);
            if (Math.abs(x) > 0.06) {
                claw.rotateZ(-0.5 * sg).translate(0, 0.02, 0.03);
            }
            return claw.translate(x, 0, 0);
        }));
        const fangs = [];
        for (const [x, l] of [[-0.05, 0.055], [-0.017, 0.035], [0.017, 0.035], [0.05, 0.055]]) {
            fangs.push(new THREE.ConeGeometry(0.012, l, 4, 1, true).rotateX(Math.PI).translate(x, -0.115 - l / 2, 0.1));
        }
        // A cluster of glowing mushrooms growing out of the back (the soft spot). Their stalks are
        // part of the torso.
        const shrooms = [];
        const stalks = [];
        for (const [x, y, z, r, dx, dy] of [[0.08, 0.27, -0.15, 0.085, 0.3, 2.2], [-0.1, 0.22, -0.14, 0.065, -0.45, 1.8],
            [0.0, 0.12, -0.13, 0.05, 0.15, 1.2], [-0.04, 0.37, -0.15, 0.045, -0.1, 2.6]]) {
            const dir = [dx, dy, -0.9];
            const len = r * 1.6 + 0.04;
            stalks.push(aim(new THREE.CylinderGeometry(r * 0.3, r * 0.42, len, 5, 1, true).translate(0, len / 2, 0), [x, y, z], dir));
            shrooms.push(aim(mergeGeos([
                new THREE.SphereGeometry(r, 6, 2, 0, TAU, 0, H).scale(1, 0.75, 1),
                new THREE.CircleGeometry(r, 6).rotateX(H)
            ]).translate(0, len, 0), [x, y, z], dir));
        }
        const torsoBox = () => chip(taper(new THREE.BoxGeometry(0.46, 0.42, 0.34, 1, 2, 1), 0.76, 0.84).translate(0, 0.2, 0), 0.01);
        const hump = () => chip(new THREE.BoxGeometry(0.4, 0.2, 0.2).rotateX(-0.45).translate(0, 0.36, -0.09), 0.01);

        // ---- breastplate: thick six-sided plates around the front, two faulds below, a wide collar
        // the helmet sits in. Brass: the top edge, a ridge down the front edge, an emblem, studs.
        const chestSurf = [
            arc(0.28, 0.23, 0.36, 0.2, -1.65, 3.3).scale(1, 1, 0.8),
            arc(0.29, 0.285, 0.055, -0.01, -1.6, 3.2).scale(1, 1, 0.82),
            arc(0.3, 0.295, 0.055, -0.06, -1.55, 3.1).scale(1, 1, 0.84),
            arc(0.21, 0.27, 0.1, 0.43).translate(0, 0, 0.04)
        ];
        const chestStuds = [];
        for (const a of [-1.1, -0.55, 0.55, 1.1]) {
            chestStuds.push(stud(0.022, Math.sin(a) * 0.27, 0.36, Math.cos(a) * 0.27 * 0.8));
        }
        const chest = merge([
            paint(mergeGeos([
                solid(0.28, 0.23, 0.36, 0.2, -1.65, 3.3, 6, 0.022).scale(1, 1, 0.8),
                solid(0.29, 0.285, 0.055, -0.01, -1.6, 3.2).scale(1, 1, 0.82),
                solid(0.3, 0.295, 0.055, -0.06, -1.55, 3.1).scale(1, 1, 0.84),
                solid(0.21, 0.27, 0.1, 0.43).translate(0, 0, 0.04)
            ]), C.steel),
            paint(mergeGeos([
                arc(0.287, 0.287, 0.024, 0.37, -1.65, 3.3).scale(1, 1, 0.8),
                arc(0.304, 0.304, 0.016, -0.085, -1.55, 3.1).scale(1, 1, 0.84),
                new THREE.BoxGeometry(0.026, 0.36, 0.02).rotateX(0.11).translate(0, 0.2, 0.206),
                new THREE.CylinderGeometry(0.06, 0.06, 0.026, 6).rotateX(H).translate(0, 0.25, 0.22),
                new THREE.ConeGeometry(0.022, 0.05, 4, 1, true).rotateX(H).translate(0, 0.25, 0.255),
                arc(0.214, 0.214, 0.02, 0.475).translate(0, 0, 0.04),
                ...chestStuds
            ]), C.brass)
        ]);

        // ---- pauldrons: a closed faceted dome over the shoulder and two thick lames wrapping the
        // shoulder (open only toward the body), brass edges, a spike and studs on top.
        const paulSurf = sg => {
            const c = sg * H;
            return [
                new THREE.SphereGeometry(0.15, 6, 3, 0, TAU, 0, 1.3).scale(1, 0.75, 1).translate(0, 0.035, 0),
                arc(0.165, 0.185, 0.07, -0.02, c - 2.6, 5.2, 8),
                arc(0.18, 0.2, 0.07, -0.08, c - 2.5, 5.0, 8)
            ];
        };
        const paul = sg => {
            const c = sg * H;
            return merge([
                paint(mergeGeos([
                    dome(0.15, 6, 3, 1.3).scale(1, 0.75, 1).translate(0, 0.035, 0),
                    solid(0.165, 0.185, 0.07, -0.02, c - 2.6, 5.2, 8),
                    solid(0.18, 0.2, 0.07, -0.08, c - 2.5, 5.0, 8)
                ]), C.steel),
                paint(mergeGeos([
                    arc(0.189, 0.189, 0.014, -0.055, c - 2.6, 5.2, 8),
                    arc(0.204, 0.204, 0.014, -0.115, c - 2.5, 5.0, 8),
                    new THREE.ConeGeometry(0.03, 0.07, 4, 1, true).translate(0, 0.175, 0),
                    ...[-0.6, 0, 0.6].map(d => stud(0.02, Math.sin(c + d) * 0.12, 0.1, Math.cos(c + d) * 0.12))
                ]), C.brass)
            ]);
        };

        // ---- light leg protection: a front shin splint and a knee cop.
        const greaveSurf = [arc(0.125, 0.105, 0.15, -0.105, -1.3, 2.6, 5), new THREE.SphereGeometry(0.075, 4, 2, 0, TAU, 0, 1.35).rotateY(Math.PI / 4).rotateX(H).translate(0, 0, 0.075)];

        const geo = {
            pelvis: flat(paint(chip(new THREE.BoxGeometry(0.34, 0.15, 0.25).translate(0, -0.03, 0), 0.008), C.flesh)),
            // Torso, back mushroom stalks and the mycelium spreading over the back: one mesh.
            torso: flat(merge([
                paint(torsoBox(), C.flesh),
                paint(hump(), C.flesh),
                ...stalks.map(g => paint(g, C.flesh)),
                myco([torsoBox(), hump()], { seed: 51, strands: 10, centre: new THREE.Vector3(0, 0.2, 0), keep: nrm => nrm.z < 0.25, step: 0.035, width: 0.009, sprout: 0.04 })
            ])),
            shrooms: mergeGeos(shrooms),
            // Head, jaw and fangs.
            head: flat(merge([
                paint(chip(new THREE.BoxGeometry(0.2, 0.17, 0.2), 0.008), C.flesh),
                paint(new THREE.BoxGeometry(0.17, 0.05, 0.13).translate(0, -0.1, 0.04), C.flesh),
                paint(mergeGeos(fangs), C.bone)
            ])),
            eyes: mergeGeos([1, -1].map(sg => new THREE.BoxGeometry(0.055, 0.022, 0.02).rotateZ(0.35 * sg).translate(0.05 * sg, 0.025, 0.105))),
            chest,
            chestM: myco(chestSurf, { seed: 11, strands: 16, centre: new THREE.Vector3(0, 0.2, 0), radial: true, step: 0.035, width: 0.01 }),
            paulL: paul(1),
            paulR: paul(-1),
            paulML: myco(paulSurf(1), { seed: 21, strands: 9, centre: new THREE.Vector3(0, -0.06, 0), steps: 6 }),
            paulMR: myco(paulSurf(-1), { seed: 22, strands: 9, centre: new THREE.Vector3(0, -0.06, 0), steps: 6 }),
            // Strong legs: thick thighs, big calves.
            thigh: flat(paint(prism(0.13, 0.1, 0.25, -0.1), C.flesh)),
            // Shin, calf and the mycelium on the shin splint: one mesh.
            shin: flat(merge([
                paint(prism(0.115, 0.075, 0.21, -0.09), C.flesh),
                paint(prism(0.07, 0.05, 0.1, -0.06).translate(0, 0, -0.04), C.flesh),
                myco(greaveSurf, { seed: 31, strands: 5, centre: new THREE.Vector3(0, -0.08, 0), radial: true, steps: 5, step: 0.025, width: 0.007 })
            ])),
            greave: paint(mergeGeos([
                solid(0.125, 0.105, 0.15, -0.105, -1.3, 2.6, 5, 0.016),
                dome(0.075, 4, 2, 1.35).rotateY(Math.PI / 4).rotateX(H).translate(0, 0, 0.075)
            ]), C.steel),
            foot: flat(paint(mergeGeos([chip(new THREE.BoxGeometry(0.17, 0.085, 0.26).translate(0, 0.02, 0.05), 0.008), ...toes]), C.dark)),
            upper: flat(paint(prism(0.1, 0.085, 0.23, -0.1), C.flesh)),
            fore: flat(paint(prism(0.08, 0.095, 0.22, -0.1), C.flesh)),
            vambrace: paint(solid(0.105, 0.12, 0.13, -0.12, 0, TAU, 6, 0.016), C.steel),
            palm: flat(paint(chip(new THREE.BoxGeometry(0.13, 0.09, 0.11).translate(0, -0.04, 0), 0.006), C.dark)),
            talonsL: paint(talons(1), C.bone),
            talonsR: paint(talons(-1), C.bone)
        };
        this.helmGeo(geo, { n, shell, arc, stud, H, TAU, myco });
        // Each helmet: shell and brass trim in one metal mesh (`helm<i>`), dark bits and mycelium in
        // one matte mesh (`helm<i>X`), and the glowing slits (`helm<i>G`).
        for (let v = 0; v < CAPLING_HELMS.length; v++) {
            const k = 'helm' + v;
            geo[k + 'X'] = merge([geo[k + 'D'] ? paint(geo[k + 'D'], C.dark) : null, geo[k + 'M']].filter(Boolean));
            geo[k] = merge([paint(geo[k], C.steel), geo[k + 'T'] ? paint(geo[k + 'T'], C.brass) : null].filter(Boolean));
            delete geo[k + 'T'];
            delete geo[k + 'D'];
            delete geo[k + 'M'];
        }
        for (const k in geo) {
            if (k.startsWith('helm')) {
                geo[k].scale(CP.helm, CP.helm, CP.helm);
            }
            geo[k].userData.cpKey = k;
        }
        return geo;
    },

    // Helmets, built for a head of radius about 0.115 and then scaled up by `CP.helm`. Face toward
    // +z, eyes at y 0.02. Each style has a main shell (`helm<i>`, takes the armour material and
    // cracks), and optional trim (`T`, brass), glow (`G`, eye slits in the bloodlust colour) and
    // dark (`D`) parts, and mycelium creeping over it (`M`). Few segments on purpose: they read as
    // hammered plates.
    helmGeo(geo, k) {
        const { n, shell, arc, stud, H, TAU, myco } = k;
        const seg = n(8, 5);
        const ring = (r, y, tube = 0.008) => new THREE.TorusGeometry(r, tube, 3, seg).rotateX(H).translate(0, y, 0);
        const band = (r, h, y, t0, tl) => new THREE.CylinderGeometry(r, r, h, Math.max(2, Math.round(seg / 2)), 1, true, t0, tl).translate(0, y, 0);
        const v2 = pts => pts.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y));

        // 0. Kettle hat: round crown and a wide sloping brim that shades the eyes.
        geo.helm0 = mergeGeos([
            shell(0.135, 0.135, 0.14, 0, TAU, 0, H).translate(0, 0.055, 0),
            new THREE.CylinderGeometry(0.135, 0.22, 0.045, seg, 1, true).translate(0, 0.0325, 0)
        ]);
        geo.helm0T = mergeGeos([
            arc(0.139, 0.139, 0.02, 0.065, 0, TAU, seg),
            ring(0.22, 0.01),
            new THREE.ConeGeometry(0.022, 0.05, 4).translate(0, 0.205, 0)
        ]);

        // 1. Nasal helm: tall Norman cone with a nose bar, a brow band and spangen strips.
        const cone = [[0, 0.2], [0.035, 0.185], [0.075, 0.14], [0.11, 0.08], [0.128, 0.03], [0.132, 0]];
        geo.helm1 = mergeGeos([
            new THREE.LatheGeometry(v2(cone), seg).translate(0, 0.035, 0),
            new THREE.BoxGeometry(0.026, 0.11, 0.018).translate(0, -0.02, 0.138)
        ]);
        const strips = [0, H, Math.PI, 3 * H].map(a =>
            new THREE.LatheGeometry(v2(cone.map(([r, y]) => [r * 1.04, y * 1.02])), 1, a - 0.07, 0.14).translate(0, 0.035, 0));
        geo.helm1T = mergeGeos([arc(0.136, 0.136, 0.025, 0.045, 0, TAU, seg), ...strips, stud(0.03, 0, 0.245, 0)]);

        // 2. Great helm: flat-topped barrel over the whole head, an eye slit split by a nose strip,
        // breathing holes and a brass crest fin.
        geo.helm2 = new THREE.CylinderGeometry(0.125, 0.14, 0.27, seg, 1, false);
        geo.helm2T = mergeGeos([
            band(0.137, 0.018, 0.05, -1.1, 2.2),
            new THREE.BoxGeometry(0.024, 0.15, 0.014).translate(0, -0.07, 0.137),
            ring(0.125, 0.135),
            new THREE.BoxGeometry(0.02, 0.05, 0.22).translate(0, 0.16, 0)
        ]);
        geo.helm2G = mergeGeos([band(0.135, 0.018, 0.02, 0.09, 0.75), band(0.135, 0.018, 0.02, -0.84, 0.75)]);
        const holes = [];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                const a = 0.55 + i * 0.13;
                holes.push(new THREE.BoxGeometry(0.013, 0.013, 0.013).translate(Math.sin(a) * 0.139, -0.04 - j * 0.03, Math.cos(a) * 0.139));
            }
        }
        geo.helm2D = mergeGeos(holes);

        // 3. Sallet: rounded skull, a long flared tail at the back, a crest and a visor slit.
        geo.helm3 = mergeGeos([
            shell(0.135, 0.13, 0.15, 0, TAU, 0, 1.75),
            shell(0.15, 0.14, 0.19, 3 * H - 1.2, 2.4, 1.4, 0.65)
        ]);
        geo.helm3T = mergeGeos([
            shell(0.143, 0.138, 0.158, H - 0.06, 0.12, 0.05, 1.6, 3, 0),
            shell(0.143, 0.138, 0.158, 3 * H - 0.06, 0.12, 0.05, 1.3, 3, 0)
        ]);
        geo.helm3G = shell(0.139, 0.134, 0.154, H - 0.85, 1.7, 1.45, 0.1, 8, 0);

        // 4. Barbute: a closed round helmet down to the chin with a T-shaped face opening.
        geo.helm4 = shell(0.13, 0.135, 0.135, 0, TAU, 0, 2.25).translate(0, -0.005, 0);
        geo.helm4G = shell(0.1335, 0.138, 0.1385, H - 0.55, 1.1, 1.46, 0.12, 8, 0).translate(0, -0.005, 0);
        geo.helm4D = shell(0.1335, 0.138, 0.1385, H - 0.12, 0.24, 1.58, 0.6, 3, 0).translate(0, -0.005, 0);
        geo.helm4T = mergeGeos([ring(0.101, -0.09), new THREE.ConeGeometry(0.022, 0.06, 4).translate(0, 0.16, 0)]);

        for (let v = 0; v < CAPLING_HELMS.length; v++) {
            geo['helm' + v + 'M'] = myco([geo['helm' + v]], { seed: 41 + v, strands: 11, steps: 6, step: 0.022, width: 0.006, cap: 0.011 });
        }
    }
};

class Capling extends Enemy {
    constructor(def, x, y, z) {
        super(def, x, y, z);
        CaplingKit.build();
        this.parts = [];
        this.plates = [];
        this.glowMeshes = [];
        this.faceParts = [];
        this.flashList = [];
        this.flashT = 0;
        this.mood = 0;
        this.rage = 0;
        this.recoil = 0;
        this.recoilV = 0;
        this.roll = 0;
        this.rollV = 0;
        this.lastDmg = 0;
        this.lastHeavy = false;
        // Cosmetic only, so Math.random.
        this.phase = Math.random() * Math.PI * 2;
        this.seed = Math.random() * 100;
        this.animAcc = 0;
        // Set by the colony brain.
        this.token = false;
        this.steerT = Rng.ai() * 0.15;
        this.wanderT = 0;
        this.slot = new THREE.Vector3(x, y, z);
        this.slotOk = false;
        this.ang = 0;
        this.tdist = 0;
        this.dying = null;
        this.pt = caplingPose();
        this.pc = caplingPose();
        this.helmV = -1;
        this.far = false;
        this.buildModel();
        // The helmet style shapes the world, so the host picks it from the seeded world stream.
        // Guests get it with the armour state (`packState`).
        this.setHelm(Enemies.puppets ? 0 : Math.floor(Rng.w() * CAPLING_HELMS.length));
    }

    buildModel() {
        const G = CaplingKit.geo;
        const M = CaplingKit.mat;
        const J = this.j = {};
        const joint = (parent, x = 0, y = 0, z = 0) => {
            const o = new THREE.Object3D();
            o.position.set(x, y, z);
            parent.add(o);
            return o;
        };
        const add = (key, mat, parent, part) => {
            const m = new THREE.Mesh(G[key], mat);
            m.userData.base = mat;
            if (part) {
                m.userData.part = part;
                part.id = this.parts.length;
                this.parts.push(m);
            }
            parent.add(m);
            return m;
        };
        const glow = (key, parent, part) => {
            const m = add(key, M.glow[this.mood], parent, part);
            this.glowMeshes.push(m);
            return m;
        };
        // Armour that can be shot off; no regrowth. Plate order matters for `packState`.
        const plate = (name, label, key, hp, parent, under, extras) => {
            const m = add(key, M.shell, parent);
            const pl = { name, label, hp, max: hp, broken: false, under, mesh: m };
            m.userData.part = { plate: pl, id: name };
            for (const [k, kind] of extras || []) {
                this.plateExtra(m, G[k], kind);
            }
            this.plates.push(pl);
            return pl;
        };
        const limbArmour = { zone: 'limb', mult: 0.5 };

        const hips = J.hips = joint(this.root, 0, CP.hip, 0);
        // Part 0 must exist: the hammer slam falls back to `partById(0)` at point-blank range.
        add('pelvis', M.matte, hips, { zone: 'body', mult: 1 });
        J.legs = [];
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const hip = joint(hips, CP.legX * sg, -CP.hipDrop, 0);
            add('thigh', M.matte, hip, { zone: 'limb', mult: LIMB_MULT });
            const knee = joint(hip, 0, -CP.thigh, 0);
            // The shin mesh also carries the mycelium growing over the shin splint.
            add('shin', M.matte, knee, { zone: 'limb', mult: LIMB_MULT });
            // Light protection: a shin splint and knee cop.
            add('greave', M.shell, knee, Object.assign({}, limbArmour));
            const ankle = joint(knee, 0, -CP.shin, 0);
            add('foot', M.matte, ankle, { zone: 'limb', mult: 0.5 });
            J.legs.push({ hip, knee, ankle });
        }

        const spine = J.spine = joint(hips, 0, CP.spine, 0);
        // Torso, mushroom stalks and the mycelium on the back are one mesh.
        add('torso', M.matte, spine, { zone: 'body', mult: 1 });
        // The glowing mushrooms growing out of the back are a soft spot: flanking pays.
        glow('shrooms', spine, { zone: 'body', mult: 1.5 });
        this.chest = plate('chest', 'breastplate', 'chest', 30, spine, 1, [['chestM', 'matte']]);

        // The head sits low and forward between the shoulders, sunk into the collar.
        const head = J.head = joint(spine, 0, CP.neck, CP.neckZ);
        head.rotation.order = 'YXZ';
        // Head, jaw and fangs are one mesh.
        add('head', M.matte, head, { zone: 'head', mult: HEAD_MULT }).position.y = CP.headY;
        const eyes = glow('eyes', head, { zone: 'head', mult: HEAD_MULT });
        eyes.position.y = CP.headY;
        this.faceParts.push(eyes);
        this.helm = plate('helm', 'helmet', 'helm0', 25, head, HEAD_MULT);
        this.helm.mesh.position.y = CP.headY;

        J.arms = [];
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const side = s ? 'R' : 'L';
            const sh = joint(spine, CP.shoulderX * sg, CP.shoulderY, CP.shoulderZ);
            sh.rotation.order = 'YXZ';
            add('upper', M.matte, sh, { zone: 'limb', mult: LIMB_MULT });
            // The pauldron rides on the torso and only partly follows the arm, so it stays on top of
            // the shoulder instead of tipping over and showing its inside when the arm reaches.
            const pj = joint(spine, CP.shoulderX * sg, CP.shoulderY, CP.shoulderZ);
            pj.rotation.order = 'YXZ';
            const pl = plate('paul' + side, 'pauldron', 'paul' + side, 15, pj, LIMB_MULT, [['paulM' + side, 'matte']]);
            pl.mesh.position.set(0.01 * sg, 0, 0);
            pl.mesh.rotation.z = -0.25 * sg;
            const elb = joint(sh, 0, -CP.upper, 0);
            add('fore', M.matte, elb, { zone: 'limb', mult: LIMB_MULT });
            add('vambrace', M.shell, elb, Object.assign({}, limbArmour));
            const wr = joint(elb, 0, -CP.fore, 0);
            add('palm', M.matte, wr, { zone: 'limb', mult: 0.5 });
            const fing = joint(wr, 0, -0.08, 0);
            // Bone talons share the shiny metal material.
            add('talons' + side, M.shell, fing, { zone: 'limb', mult: 0.5 });
            J.arms.push({ sh, pj, elb, wr, fing });
        }
    }

    // A matte extra (mycelium, dark bits) is a close-up detail: hidden past `CP.farMyco` (see
    // `animate`).
    plateExtra(m, geo, kind) {
        const M = CaplingKit.mat;
        const mat = kind === 'glow' ? M.glow[this.mood] : M[kind];
        const c = new THREE.Mesh(geo, mat);
        c.userData.base = mat;
        c.userData.lod = kind === 'matte';
        c.visible = !(c.userData.lod && this.far);
        m.add(c);
        if (kind === 'glow') {
            this.glowMeshes.push(c);
        }
        return c;
    }

    // Swap the helmet style. Hits, cracks and breaking work the same for every style.
    setHelm(v) {
        const count = CAPLING_HELMS.length;
        v = ((Math.floor(+v || 0) % count) + count) % count;
        const pl = this.helm;
        if (v === this.helmV || pl.broken) {
            this.helmV = v;
            return;
        }
        this.helmV = v;
        this.unflash();
        const G = CaplingKit.geo;
        const m = pl.mesh;
        m.geometry = G['helm' + v];
        for (const c of m.children.slice()) {
            m.remove(c);
            const i = this.glowMeshes.indexOf(c);
            if (i >= 0) {
                this.glowMeshes.splice(i, 1);
            }
        }
        for (const [suffix, kind] of [['X', 'matte'], ['G', 'glow']]) {
            if (G['helm' + v + suffix]) {
                this.plateExtra(m, G['helm' + v + suffix], kind);
            }
        }
        this.showFace();
    }

    showFace() {
        const on = this.helm.broken || CAPLING_HELMS[Math.max(0, this.helmV)].eyes;
        for (const m of this.faceParts) {
            m.visible = on;
        }
    }

    setMood(i) {
        i = clampN(i | 0, 0, 3);
        if (this.mood === i) {
            return;
        }
        this.mood = i;
        const M = CaplingKit.mat;
        for (const m of this.glowMeshes) {
            m.userData.base = M.glow[i];
            if (m.material !== M.flash) {
                m.material = M.glow[i];
            }
        }
    }

    partById(id) {
        if (typeof id === 'string') {
            const pl = this.plates.find(p => p.name === id);
            return pl ? { part: { plate: pl, id }, mesh: pl.mesh } : null;
        }
        const m = this.parts[id];
        return m ? { part: m.userData.part, mesh: m } : null;
    }

    debugText(now) {
        const T = this.target;
        const mind = this.mind;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const armour = pl => (pl.broken ? 'gone' : Math.round(100 * pl.hp / pl.max) + '%');
        return [
            `CAPLING #${this.id}  ${this.intent}${this.token ? ' [attack token]' : ''}` +
                (mind ? `   colony ${mind.engaged ? 'ALERT  frenzy ' + Math.round(mind.frenzy * 100) + '%' : Math.round(mind.alert * 100) + '%'}` : '') +
                (Players.list.length > 1 ? `   target ${T ? T.name || T.id : 'none'}` : ''),
            `> ${this.thought}`,
            `hp ${Math.ceil(this.hp)}/${this.maxHp}  ${CAPLING_HELMS[Math.max(0, this.helmV)].name} ${armour(this.helm)}  chest ${armour(this.chest)}` +
                `  pauldrons ${armour(this.plates[2])} ${armour(this.plates[3])}`,
            `speed ${sp.toFixed(1)}  bloodlust ${this.mood}/3${this.rage > 0.01 ? `  RAGE ${Math.round(this.rage * 100)}%` : ''}` +
                `${this.slotOk && this.engaged ? `  spot ${Math.hypot(this.slot.x - this.pos.x, this.slot.z - this.pos.z).toFixed(1)}m away` : ''}`
        ].join('\n');
    }

    // ---- damage

    vsFor(shot) {
        const key = shot && shot.mode === 'boomerang' ? 'boomerang' : shot && shot.weapon;
        return SHELL_VS[key] || [1, 0.3];
    }

    // One hit on one part. Returns the hit kind; the health it costs is left in `lastDmg`.
    hitPart(amount, part, hit, dir, vs, quiet) {
        const fx = Enemies.fx;
        const pl = part && part.plate;
        let dmg;
        let kind;
        if (pl && !pl.broken) {
            pl.hp -= amount * vs[0];
            dmg = amount * vs[1];
            kind = 'shell';
            fx.burst(hit.point, quiet ? 2 : 4, CaplingKit.chip, 3, 0.35, { grav: 9 });
            if (pl.hp <= 0) {
                dmg += (-pl.hp / vs[0]) * 0.5;
                this.breakPlate(pl, dir);
                kind = 'break';
            } else {
                this.crackLook(pl);
            }
        } else {
            let mult = pl ? pl.under : (part && part.mult) || 1;
            // The helmet shades the face: no head crits until it is broken.
            if (part && part.zone === 'head' && !this.helm.broken) {
                mult = Math.min(mult, 1.25);
            }
            dmg = amount * mult * (vs[2] || 1);
            kind = mult >= 2 ? 'crit' : mult >= 1 ? 'flesh' : 'shell';
            fx.burst(hit.point, quiet ? 3 : mult > 1.2 ? 10 : 5, CaplingKit.colors[this.mood], 2.4, 0.5, { grav: 2 });
        }
        this.netHit(part, hit.point, dir, kind, pl);
        this.lastDmg = dmg;
        return kind;
    }

    takeHit(amount, part, hit, dir, shot) {
        if (this.dead) {
            return null;
        }
        if (shot && shot.by) {
            this.hitBy = shot.by;
            this.hitT = Enemies.time;
        }
        this.lastHeavy = !!shot && shot.weapon === 'sniper';
        const kind = this.hitPart(amount, part, hit, dir, this.vsFor(shot), false);
        const dmg = this.lastDmg;
        this.flashMesh(hit.object);
        this.hp -= dmg;
        this.kick(Math.min(0.5, 0.08 + dmg * 0.012), dir);
        if (this.hp <= 0) {
            this.die(dir);
            return 'kill';
        }
        if (dmg >= this.maxHp * 0.3 || this.lastHeavy) {
            this.stagger(dir, 1);
        }
        this.mind.onHurt(this, { dmg, by: shot && shot.by, broke: kind === 'break' }, Enemies.time);
        return kind;
    }

    takeBlast(hits, shot) {
        if (this.dead) {
            return null;
        }
        if (shot.by) {
            this.hitBy = shot.by;
            this.hitT = Enemies.time;
        }
        const vs = this.vsFor(shot);
        this.lastHeavy = hits.length >= 3;
        // Same point-blank bonus as the Shellcap, so the shotgun feels the same on both.
        const close = clampN(1.4 - this.pos.distanceTo((shot.by || Players.local).pos) * 0.07, 1, 1.3);
        const dir = new THREE.Vector3();
        for (const h of hits) {
            dir.add(h.dir);
        }
        dir.normalize();
        const rank = { shell: 1, flesh: 2, break: 3, crit: 4 };
        let dmg = 0;
        let kind = 'shell';
        let broke = false;
        let flashed = false;
        for (const h of hits) {
            const k = this.hitPart(shot.damage * close, h.part, h.hit, dir, vs, true);
            dmg += this.lastDmg;
            broke = broke || k === 'break';
            if (rank[k] > rank[kind]) {
                kind = k;
            }
            if (!flashed && h.hit.object.parent !== Enemies.junk) {
                this.flashMesh(h.hit.object);
                flashed = true;
            }
        }
        this.hp -= dmg;
        this.kick(Math.min(0.6, 0.1 + dmg * 0.012), dir);
        if (this.hp <= 0) {
            this.die(dir);
            return 'kill';
        }
        if (hits.length >= 4) {
            this.stagger(dir, clampN(hits.length / 8, 0.4, 1));
        }
        this.mind.onHurt(this, { dmg, by: shot.by, broke }, Enemies.time);
        return kind;
    }

    netHit(part, point, dir, kind, pl) {
        if (!Enemies.record) {
            return;
        }
        const r = v => Math.round(v * 100) / 100;
        Enemies.out.push([
            'h', this.id, part && part.id !== undefined ? part.id : -1, r(point.x), r(point.y), r(point.z), r(dir.x), r(dir.z),
            Math.max(0, CAPLING_HITS.indexOf(kind)), pl ? (pl.broken ? -1 : Math.round(100 * pl.hp / pl.max)) : -1
        ]);
    }

    // Guests: replay a host hit event.
    showHit(partId, point, dir, kind, hpPct) {
        const fx = Enemies.fx;
        const found = this.partById(partId);
        const pl = found && found.part ? found.part.plate : null;
        if (pl && !pl.broken && (kind === 0 || kind === 3)) {
            fx.burst(point, 4, CaplingKit.chip, 3, 0.35, { grav: 9 });
            if (kind === 3) {
                this.breakPlate(pl, dir);
            } else {
                if (hpPct >= 0) {
                    pl.hp = pl.max * hpPct / 100;
                }
                this.crackLook(pl);
            }
        } else {
            fx.burst(point, kind === 2 ? 10 : 5, CaplingKit.colors[this.mood], 2.4, 0.5, { grav: 2 });
        }
        if (found && found.mesh) {
            this.flashMesh(found.mesh);
        }
    }

    // Plate percentages (-1 = broken), then the helmet style.
    packState() {
        const out = this.plates.map(pl => (pl.broken ? -1 : Math.max(0, Math.round(100 * pl.hp / pl.max))));
        out.push(this.helmV);
        return out;
    }

    applyState(arr) {
        const n = this.plates.length;
        if (arr.length > n) {
            this.setHelm(arr[n]);
        }
        for (let i = 0; i < n && i < arr.length; i++) {
            const pl = this.plates[i];
            if (arr[i] < 0) {
                if (!pl.broken) {
                    this.dropPlate(pl);
                }
                continue;
            }
            if (!pl.broken) {
                pl.hp = pl.max * arr[i] / 100;
                this.crackLook(pl);
            }
        }
    }

    scaleHealth(k) {
        super.scaleHealth(k);
        for (const pl of this.plates) {
            pl.max = Math.round(pl.max * k);
            pl.hp = pl.max;
        }
    }

    kick(k, dir) {
        if (!this.dead) {
            Enemies.emit(['k', this.id, Math.round(k * 100) / 100, Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100]);
        }
        this.recoilV += k * 8;
        const side = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw);
        this.rollV += side * k * 7;
    }

    stagger(dir, k) {
        const a = this.action;
        if (!this.onGround || (a && (a.air || a.coast || a.name === 'dying'))) {
            return;
        }
        this.vel.x += dir.x * 2.5 * k;
        this.vel.z += dir.z * 2.5 * k;
        this.action = { name: 'stagger', t: 0, dur: 0.3 + 0.3 * k, lock: true };
    }

    afterLaunch(a) {
        if (a.dir) {
            this.kick(0.4, a.dir);
        }
        this.action = { name: 'stagger', t: 0, dur: a.stun || 0.4, lock: true };
    }

    flashMesh(m) {
        const M = CaplingKit.mat;
        if (!m || !m.isMesh || !m.userData.base || m.parent === Enemies.junk) {
            return;
        }
        if (m.material !== M.flash) {
            m.material = M.flash;
            this.flashList.push(m);
        }
        this.flashT = 0.06;
    }

    unflash() {
        for (const m of this.flashList) {
            m.material = m.userData.base;
        }
        this.flashList.length = 0;
    }

    crackLook(pl) {
        const M = CaplingKit.mat;
        const f = pl.hp / pl.max;
        const base = f < 0.34 ? M.critical : f < 0.67 ? M.cracked : M.shell;
        pl.mesh.userData.base = base;
        if (pl.mesh.material !== M.flash) {
            pl.mesh.material = base;
        }
    }

    // Stop tracking a plate's child meshes (glow, flash) before it leaves the body.
    forget(pl) {
        pl.mesh.traverse(c => {
            let i = this.flashList.indexOf(c);
            if (i >= 0) {
                c.material = c.userData.base;
                this.flashList.splice(i, 1);
            }
            i = this.glowMeshes.indexOf(c);
            if (i >= 0) {
                this.glowMeshes.splice(i, 1);
            }
        });
    }

    breakPlate(pl, dir) {
        pl.broken = true;
        pl.hp = 0;
        this.forget(pl);
        const m = pl.mesh;
        m.material = m.userData.base = CaplingKit.mat.critical;
        const up = pl === this.helm ? 3.2 : 1.6;
        Enemies.detach(m, new THREE.Vector3(
            dir.x * 1.8 + (Math.random() - 0.5) * 1.5, up + Math.random() * 1.5, dir.z * 1.8 + (Math.random() - 0.5) * 1.5
        ), 1.2 + Math.random() * 0.6);
        Enemies.fx.burst(m.position, 14, CaplingKit.spore, 2.5, 0.6, { grav: 3 });
        Enemies.fx.burst(m.position, 8, CaplingKit.chip, 3.5, 0.45, { grav: 10 });
        if (pl === this.helm) {
            this.showFace();
        }
    }

    // Silent removal, for guests joining after the plate already broke.
    dropPlate(pl) {
        pl.broken = true;
        pl.hp = 0;
        this.forget(pl);
        if (pl.mesh.parent) {
            pl.mesh.parent.remove(pl.mesh);
        }
        if (pl === this.helm) {
            this.showFace();
        }
    }

    // ---- death: a quick canned collapse, armour falls off, a spore puff, then it sinks away

    die(dir) {
        const r = v => Math.round(v * 100) / 100;
        Enemies.emit(['d', this.id, r(dir.x), r(dir.y), r(dir.z), this.lastHeavy ? 1 : 0]);
        if (this.mind) {
            this.mind.died(this, Enemies.time);
        }
        this.unflash();
        Enemies.kill(this);
        const simple = DETAIL.deathFx === 'simple';
        if (!simple) {
            for (const pl of this.plates) {
                if (!pl.broken) {
                    pl.broken = true;
                    this.forget(pl);
                    Enemies.detach(pl.mesh, new THREE.Vector3(
                        dir.x * 1.5 + (Math.random() - 0.5), 1.5 + Math.random() * 1.5, dir.z * 1.5 + (Math.random() - 0.5)
                    ), 1 + Math.random() * 0.6);
                }
            }
            this.showFace();
        }
        // Workers share glow materials while alive; a dying one gets its own so it can fade.
        const col = CaplingKit.colors[this.mood];
        const glow = CaplingKit.mat.glow[this.mood].clone();
        for (const m of this.glowMeshes) {
            m.material = m.userData.base = glow;
        }
        const behind = dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw) > 0;
        const side = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw);
        this.dying = { t: 0, glow, col, simple, fwd: behind ? 1 : -1, side: Math.sign(side) || 1, thumped: false };
        this.action = { name: 'dying', t: 0, lock: true };
        this.want.set(0, 0, 0);
        this.wantS.set(0, 0, 0);
        const fling = this.lastHeavy ? 3.5 : 2;
        this.vel.x += dir.x * fling;
        this.vel.z += dir.z * fling;
        _cv.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
        Enemies.fx.burst(_cv, simple ? 10 : 22, col, 2.5, 0.7, { up: 1, grav: 2 });
        Enemies.shake(this.lastHeavy ? 0.15 : 0.08, this.pos);
    }

    updateDying(dt) {
        const d = this.dying;
        const t = (d.t += dt);
        this.want.set(0, 0, 0);
        if (this.onGround) {
            this.locomote(dt);
        }
        this.physics(dt);
        this.visY = this.onGround ? this.visY + (this.pos.y - this.visY) * (1 - Math.exp(-16 * dt)) : this.pos.y;

        const buckle = cpEase(t / 0.18);
        const f = clamp01((t - 0.1) / 0.42);
        const fall = f * f;
        const sink = cpEase((t - 1.5) / 0.9);
        const J = this.j;
        for (let i = 0; i < 2; i++) {
            const L = J.legs[i];
            L.hip.rotation.set(-0.7 * buckle * (1 - 0.5 * fall), 0, 0);
            L.knee.rotation.x = 0.4 + 1.1 * buckle * (1 - 0.6 * fall);
            L.ankle.rotation.x = -0.4 * buckle;
            const A = J.arms[i];
            const sg = i ? -1 : 1;
            A.sh.rotation.set(d.fwd > 0 ? -1.3 * fall : 0.9 * fall, 0, sg * (0.25 + 0.9 * fall));
            A.pj.rotation.set(d.fwd > 0 ? -0.4 * fall : 0.27 * fall, 0, sg * 0.25 * fall);
            A.elb.rotation.x = -0.3 - 0.5 * buckle;
            A.wr.rotation.x = 0.5 * buckle;
            A.fing.rotation.x = 0.3 + 0.9 * buckle;
        }
        J.spine.rotation.set(d.fwd * 0.3 * buckle + 0.3 * (1 - fall), 0, 0);
        J.head.rotation.set(d.fwd * 0.3 * fall - 0.2, 0.4 * d.side * fall, 0);
        const root = this.root;
        root.position.set(this.pos.x, this.visY - 0.14 * buckle * (1 - fall) + 0.15 * fall - 0.55 * sink, this.pos.z);
        root.rotation.set(d.fwd * 1.42 * fall, this.yaw, d.side * 0.15 * fall);
        root.scale.setScalar(1 - 0.5 * sink);

        if (f >= 1 && !d.thumped) {
            d.thumped = true;
            _cv.set(this.pos.x + Math.sin(this.yaw) * 0.55 * d.fwd, this.visY + 0.12, this.pos.z + Math.cos(this.yaw) * 0.55 * d.fwd);
            Enemies.fx.burst(_cv, d.simple ? 8 : 18, CaplingKit.spore, 2, 0.9, { up: 0.6, grav: 1, drag: 2 });
            if (!d.simple) {
                Enemies.fx.burst(_cv, 10, CaplingKit.dust, 2.2, 0.7, { up: 0.3, grav: 2, drag: 2.5 });
                Enemies.shake(0.06, this.pos);
            }
        }
        if (!d.simple && t > 0.6 && t < 1.8 && Math.random() < dt * 8) {
            Enemies.fx.emit(this.pos.x + (Math.random() - 0.5) * 0.6, this.visY + 0.15, this.pos.z + (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, CaplingKit.spore, 0.9, -0.2, 1.5);
        }
        d.glow.color.copy(d.col).multiplyScalar(Math.max(0, 1 - t / 1.2) * (Math.random() < 0.2 ? 0.4 : 1));
        if (t >= 2.4) {
            d.glow.dispose();
            return true;
        }
        return false;
    }

    // ---- per frame

    update(dt, now) {
        super.update(dt, now);
        this.settle(dt);
    }

    puppetUpdate(dt, now) {
        super.puppetUpdate(dt, now);
        this.settle(dt);
    }

    settle(dt) {
        if (this.flashT > 0) {
            this.flashT -= dt;
            if (this.flashT <= 0) {
                this.unflash();
            }
        }
        this.recoilV += (-90 * this.recoil - 11 * this.recoilV) * dt;
        this.recoil += this.recoilV * dt;
        this.rollV += (-80 * this.roll - 10 * this.rollV) * dt;
        this.roll += this.rollV * dt;
    }

    // Batched with vertex colours, so a worker draws in three calls (matte, metal, glow), inside a
    // bounding sphere that fits it, so off-screen workers are skipped.
    syncBatch() {
        const want = Batch.supported();
        if (want && !this.batch) {
            this.batch = new MeshBatch(this.root, { bounds: new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 1.5), colors: true });
        } else if (!want) {
            this.dropBatch();
        }
        if (this.batch) {
            this.batch.sync();
        }
    }

    // Close workers animate every frame, far ones at 30 or 15 Hz. Far ones also drop the mycelium on
    // their armour (2 m of slack so it does not flicker at the edge).
    animate(dt, now) {
        this.animAcc += dt;
        const d = camera.position.distanceTo(this.pos);
        const far = this.far ? d > CP.farMyco - 2 : d > CP.farMyco + 2;
        if (far !== this.far) {
            this.far = far;
            for (const pl of this.plates) {
                if (!pl.broken) {
                    for (const c of pl.mesh.children) {
                        if (c.userData.lod) {
                            c.visible = !far;
                        }
                    }
                }
            }
        }
        const every = d < 14 ? 0 : d < 28 ? 1 / 30 : 1 / 15;
        if (this.animAcc < every) {
            return;
        }
        const step = Math.min(this.animAcc, 0.1);
        this.animAcc = 0;
        this.drawPose(step, now);
    }

    drawPose(dt, now) {
        const P = this.pt;
        const a = this.action;
        const T = this.target;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const k = clamp01(sp / CP.run);
        const walk = clamp01(sp / 0.5);
        const still = 1 - walk;
        const hunt = this.engaged ? 1 : 0;
        const lust = this.mood / 3;
        if (this.onGround) {
            this.phase += dt * sp * Math.PI / CP.stride;
        }
        const s = Math.sin(this.phase);
        const c = Math.cos(this.phase);
        const amp = walk * (0.38 + 0.4 * k);
        // Knee bend: low and bent-kneed always, lower when hunting. Standing still it bobs: a slow
        // heave when calm, an eager bounce on the knees when hunting. The hips follow the legs (see
        // the end), so every bend shows as the body bobbing.
        const bounce = still * (hunt
            ? Math.abs(Math.sin(now * (5 + 2 * lust) + this.seed)) * (0.14 + 0.08 * lust)
            : (0.5 + 0.5 * Math.sin(now * 2.4 + this.seed)) * 0.14);
        const al = 0.26 + 0.1 * hunt + bounce;

        // Torso: deeply hunched, heaving with each bounce, and it dips forward on every step (a lurch).
        P.lean = 0.42 + 0.12 * hunt + 0.12 * k + 0.1 * walk * (1 - Math.abs(c)) + 0.3 * bounce;
        P.roll = s * 0.09 * walk;
        P.twist = -s * 0.12 * walk;
        P.sway = -s * 0.05 * walk;

        // Where the target is, for reaching at it.
        let aim = 0;
        let near = 0;
        let hy;
        let hp;
        if (T && this.engaged) {
            const dx = T.pos.x - this.pos.x;
            const dz = T.pos.z - this.pos.z;
            const d = Math.max(0.5, Math.hypot(dx, dz));
            aim = clampN(Math.atan2(T.pos.y + 1.1 - (this.pos.y + 0.75), d), -0.5, 0.7);
            near = clamp01(1 - (d - 1.2) / 2.5);
            hy = clampN(wrapAngle(Math.atan2(dx, dz) - this.yaw), -0.9, 0.9);
            hp = clampN(-Math.atan2(T.pos.y + 1.4 - (this.pos.y + 0.9), d), -0.7, 0.4);
            // Twitchy when the bloodlust is up. Cosmetic.
            hy += (Math.random() - 0.5) * 0.25 * lust;
        } else {
            hy = Math.sin(now * 0.6 + this.seed) * (sp < 0.3 ? 0.5 : 0.15);
            hp = 0.05 + Math.sin(now * 0.9 + this.seed * 2) * 0.08;
        }
        P.headY = hy - P.twist;
        P.headP = hp - P.lean * 0.9;
        P.headR = 0.08 * s * walk;

        // Legs: swing, lift the knee on the way forward, keep the foot level.
        // Arms, calm: hang heavy and swing against the legs. Hunting: out in front like a zombie,
        // each arm in turn lunging to grab (hands open on the way out, clench and pull back), aimed
        // at the target's chest, faster and wilder when close or bloodthirsty.
        const grab = 4.5 + 3 * lust + 2.5 * near;
        for (let i = 0; i < 2; i++) {
            const sg = i ? -1 : 1;
            const si = i ? -s : s;
            const ci = i ? -c : c;
            P.hip[i] = -si * amp - al;
            P.knee[i] = 2 * al + Math.max(0, ci) * (0.5 + 0.75 * k) * walk;
            P.ankle[i] = -(P.hip[i] + P.knee[i]) * 0.9;

            const g = now * grab + i * Math.PI + this.seed;
            const u = Math.sin(g);
            const ext = Math.max(0, u);
            const wild = 0.5 + 0.5 * Math.max(near, lust);
            P.sh[i] = cpLerp(si * (0.25 + 0.4 * k) * walk - 0.15 + 0.05 * Math.sin(now * 2.4 + this.seed + i),
                -1.4 - P.lean - aim * 0.8 - (0.25 + 0.3 * wild) * u + si * 0.12 * walk, hunt);
            P.shOut[i] = sg * cpLerp(0.22 + 0.05 * k, 0.16 + 0.14 * (1 - ext), hunt);
            P.shY[i] = -sg * (0.1 + 0.3 * ext * wild) * hunt;
            P.elb[i] = cpLerp(-0.35 - 0.4 * k, -0.12 - 0.8 * (1 - ext) * wild, hunt);
            P.wr[i] = cpLerp(0.2, -0.25 + 0.4 * Math.sin(g + 1.2), hunt);
            P.grip[i] = cpLerp(0.55, clamp01(0.5 - 1.2 * Math.cos(g)), hunt);
            if (hunt) {
                P.twist += 0.06 * u * sg;
            }
        }

        let rate = 14;
        if (!this.onGround) {
            const name = a ? a.name : '';
            for (let i = 0; i < 2; i++) {
                const sg = i ? -1 : 1;
                if (name === 'pounce') {
                    // Arms flung wide and forward, claws spread; legs trail.
                    P.hip[i] = 0.4;
                    P.knee[i] = 0.9;
                    P.sh[i] = -1.75 - P.lean * 0.5;
                    P.shOut[i] = sg * 0.45;
                    P.shY[i] = -sg * 0.1;
                    P.elb[i] = -0.15;
                    P.wr[i] = -0.35;
                    P.grip[i] = 0;
                } else if (name === 'launched') {
                    P.hip[i] = Math.sin(now * 17 + i * 2) * 0.7;
                    P.knee[i] = 0.8 + Math.sin(now * 19 + i) * 0.5;
                    P.sh[i] = -1.6 + Math.sin(now * 15 + i * 3) * 0.9;
                    P.shOut[i] = sg * 0.5;
                    P.elb[i] = -0.9;
                    P.grip[i] = 0.5 + 0.5 * Math.sin(now * 20 + i);
                } else {
                    P.hip[i] = -0.7;
                    P.knee[i] = 1.2;
                    P.sh[i] = -1.5;
                    P.shOut[i] = sg * 0.4;
                    P.elb[i] = -0.6;
                }
                P.ankle[i] = 0.2;
            }
            P.lean = name === 'pounce' ? 0.55 : name === 'launched' ? -0.4 : 0.3;
            P.roll = P.twist = P.sway = 0;
        } else if (a && a.name === 'claw') {
            // Overhead rake: the arm goes up and back with the claws open, then tears down and across
            // and clenches; the body crunches into it. The other arm keeps grabbing.
            const i = a.side;
            const sg = i ? -1 : 1;
            const w = cpEase(a.t / a.wind);
            const th = cpEase((a.t - a.wind) / 0.09);
            const back = cpEase((a.t - a.wind - 0.15) / Math.max(0.05, a.dur - a.wind - 0.15));
            const blend = (rest, wind, hit) => cpLerp(cpLerp(cpLerp(rest, wind, w), hit, th), rest, back);
            P.sh[i] = blend(P.sh[i], -2.7, -0.45);
            P.elb[i] = blend(P.elb[i], -1.2, -0.2);
            P.wr[i] = blend(P.wr[i], 0.4, -0.5);
            P.grip[i] = blend(P.grip[i], 0, 1);
            P.shY[i] = blend(P.shY[i], sg * 0.1, -sg * 0.35);
            P.shOut[i] = blend(P.shOut[i], sg * 0.3, sg * 0.05);
            P.twist = blend(P.twist, sg * 0.3, -sg * 0.35);
            P.lean = blend(P.lean, P.lean - 0.15, P.lean + 0.2);
            rate = 32;
        } else if (a && a.name === 'pounce') {
            // Wind-up: sink low with the arms drawn back. Landing: crouch and recover.
            const g = a.landT ? 1 - cpEase((a.t - a.landT) / 0.4) : cpEase(a.t / a.wind);
            for (let i = 0; i < 2; i++) {
                const sg = i ? -1 : 1;
                P.hip[i] = cpLerp(P.hip[i], -0.8, g);
                P.knee[i] = cpLerp(P.knee[i], 1.5, g);
                P.ankle[i] = -(P.hip[i] + P.knee[i]) * 0.9;
                P.sh[i] = cpLerp(P.sh[i], a.landT ? -1.2 : 0.4, g);
                P.shOut[i] = cpLerp(P.shOut[i], sg * 0.5, g);
                P.elb[i] = cpLerp(P.elb[i], -0.9, g);
                P.grip[i] = cpLerp(P.grip[i], 0, g);
            }
            P.lean = cpLerp(P.lean, 0.7, g);
            rate = 20;
        } else if (a && a.name === 'stagger') {
            const g = 1 - cpEase((a.t - a.dur * 0.5) / (a.dur * 0.5));
            P.lean = cpLerp(P.lean, 0, g);
            for (let i = 0; i < 2; i++) {
                const sg = i ? -1 : 1;
                P.sh[i] = cpLerp(P.sh[i], -0.4, g);
                P.shOut[i] = cpLerp(P.shOut[i], sg * 0.6, g);
                P.elb[i] = cpLerp(P.elb[i], -0.3, g);
                P.grip[i] = cpLerp(P.grip[i], 0.1, g);
            }
            rate = 18;
        } else if (a && a.name === 'polish') {
            // Proudly buffing the breastplate: one hand rubs small circles on it, the other holds
            // its edge, the head bent down to admire it.
            const g = cpEase(a.t / 0.4) * (1 - cpEase((a.t - a.dur + 0.4) / 0.4));
            const r = now * 9;
            P.sh[1] = cpLerp(P.sh[1], -0.6 - P.lean + 0.12 * Math.sin(r), g);
            P.shY[1] = cpLerp(P.shY[1], 0.6 + 0.15 * Math.cos(r), g);
            P.shOut[1] = cpLerp(P.shOut[1], 0, g);
            P.elb[1] = cpLerp(P.elb[1], -1.75, g);
            P.wr[1] = cpLerp(P.wr[1], -0.6, g);
            P.grip[1] = cpLerp(P.grip[1], 0.1, g);
            P.sh[0] = cpLerp(P.sh[0], -0.35 - P.lean, g);
            P.shY[0] = cpLerp(P.shY[0], -0.4, g);
            P.elb[0] = cpLerp(P.elb[0], -1.3, g);
            P.grip[0] = cpLerp(P.grip[0], 0.8, g);
            P.lean = cpLerp(P.lean, P.lean - 0.12, g);
            P.headP = cpLerp(P.headP, P.headP + 0.6, g);
            P.headY = cpLerp(P.headY, 0.2 * Math.sin(now * 0.8 + this.seed), g);
            P.headR = cpLerp(P.headR, 0.15, g);
        }

        const C = this.pc;
        const kf = 1 - Math.exp(-rate * dt);
        for (const key of CP_KEYS) {
            C[key] += (P[key] - C[key]) * kf;
        }
        for (const key of CP_PAIRS) {
            const t = P[key];
            const cur = C[key];
            cur[0] += (t[0] - cur[0]) * kf;
            cur[1] += (t[1] - cur[1]) * kf;
        }

        const J = this.j;
        // Bob: lift the hips so the lower foot stands on the floor. Straightening the stance leg,
        // bending the knees, every step and bounce all move the body up and down by themselves.
        let reachDown = 0;
        for (let i = 0; i < 2; i++) {
            reachDown = Math.max(reachDown, CP.thigh * Math.cos(C.hip[i]) + CP.shin * Math.cos(C.hip[i] + C.knee[i]));
        }
        J.hips.position.y = this.onGround ? reachDown + CP.hipDrop + CP.ankle : CP.hip;
        J.hips.rotation.z = C.roll + this.roll * 0.4;
        J.spine.rotation.set(C.lean - this.recoil * 0.8, C.twist, C.sway + this.roll);
        J.head.rotation.set(C.headP + this.recoil * 0.4, C.headY, C.headR);
        for (let i = 0; i < 2; i++) {
            const L = J.legs[i];
            L.hip.rotation.set(C.hip[i], 0, -J.hips.rotation.z);
            L.knee.rotation.x = C.knee[i];
            L.ankle.rotation.x = C.ankle[i];
            const A = J.arms[i];
            A.sh.rotation.set(C.sh[i], C.shY[i], C.shOut[i]);
            A.pj.rotation.set(clampN(C.sh[i] * 0.3, -0.55, 0.3), C.shY[i] * 0.3, (C.shOut[i] - (i ? -0.2 : 0.2)) * 0.5);
            A.elb.rotation.x = C.elb[i];
            A.wr.rotation.x = C.wr[i];
            A.fing.rotation.x = -0.35 + 1.6 * C.grip[i];
        }
    }
}

// One brain for every worker in the room. Every `thinkEvery` seconds it:
// - while calm: checks a few workers' sight in turn, builds a shared alert from sightings and
//   noises, and joins in when another enemy type nearby is already fighting. Idle workers wander
//   or polish their armour;
// - once alerted: the whole colony knows where every player is. It shares the workers out between
//   players (wounded ones draw more), gives the nearest few on each player an attack token and
//   hands out spots on two rings (token holders close in, the rest press in behind), spread evenly
//   around the player.
// Bloodlust: every hit that draws blood raises the colony's frenzy (and a badly wounded player
// counts extra); breaking a worker's armour enrages that worker. Bloodlust makes workers faster,
// attack more often and lets one more attack at once; it shows as the glow going from amber to red
// (`mood`).
// Per frame a worker only re-steers on a short timer and attacks when it may.
class CaplingMind extends HiveMind {
    constructor(def) {
        super(def);
        this.engaged = false;
        this.alert = 0;
        this.frenzy = 0;
        this.tickT = 0;
        this.look = 0;
        this.poi = null;
        this.poiT = 0;
        this.noiseT = -1;
        this.noiseKind = '';
        this.noiseBase = 0;
        this.live = [];
        this.ring = [];
        this.inner = [];
        this.outer = [];
        this.count = new Map();
    }

    update(dt, now) {
        const targets = Enemies.targets;
        const cfg = this.cfg;
        this.tickT -= dt;
        if (this.tickT <= 0) {
            this.tickT = Math.max(this.tickT + cfg.thinkEvery, 0.02);
            this.tick(now);
        }
        for (const e of this.members) {
            if (e.dead) {
                continue;
            }
            if (!targets.length) {
                e.target = null;
                e.token = false;
                e.seesPlayer = false;
                if (e.action && !e.action.air) {
                    e.action = null;
                }
                if (!e.action) {
                    e.stop();
                }
                continue;
            }
            Enemies.enterLayer(e);
            this.act(e, dt, now);
        }
    }

    tick(now) {
        const targets = Enemies.targets;
        const cfg = this.cfg;
        const live = this.live;
        live.length = 0;
        for (const e of this.members) {
            if (!e.dead) {
                live.push(e);
            }
        }
        if (!targets.length || !live.length) {
            return;
        }
        if (!this.engaged) {
            this.watch(live, targets, now);
            if (!this.engaged) {
                this.kinFighting(live, now);
            }
            if (!this.engaged) {
                return;
            }
        }
        this.frenzy = Math.max(0, this.frenzy - cfg.thinkEvery * cfg.frenzyDecay);
        this.assign(live, targets, now);
        for (const T of targets) {
            this.surround(T, live);
        }
        for (const e of live) {
            e.rage = Math.max(0, e.rage - cfg.thinkEvery * cfg.rageDecay);
            e.setMood(Math.min(3, Math.floor(this.lust(e.target, e) * 4)));
        }
        Enemies.enterLayer(null);
    }

    // How bloodthirsty a worker is: the colony's frenzy, plus a bonus when its player is badly hurt,
    // plus its own rage over broken armour.
    lust(T, e) {
        const cfg = this.cfg;
        const hurt = T && T.hpF !== undefined && T.hpF < cfg.wounded ? cfg.woundedLust : 0;
        return Math.min(1, this.frenzy + hurt + (e ? e.rage : 0));
    }

    maxAttackers(T) {
        return this.cfg.attackers + (this.lust(T) >= this.cfg.frenzyExtra ? 1 : 0);
    }

    // ---- calm: looking and listening

    watch(live, targets, now) {
        const cfg = this.cfg;
        let best = 0;
        let spotter = null;
        let who = null;
        const n = Math.min(cfg.looks, live.length);
        for (let k = 0; k < n; k++) {
            const e = live[this.look++ % live.length];
            e.seesPlayer = false;
            for (const T of targets) {
                const s = this.vision(e, T);
                if (s > 0) {
                    e.seesPlayer = true;
                }
                if (s > best) {
                    best = s;
                    spotter = e;
                    who = T;
                }
            }
        }
        if (spotter) {
            this.alert = Math.min(1, this.alert + best * cfg.thinkEvery * cfg.spotGain);
            if (spotter.action && spotter.action.name === 'polish') {
                spotter.action = null;
            }
            spotter.face(who.pos.x, who.pos.z);
            spotter.thought = 'something there... ' + Math.round(this.alert * 100) + '%';
            if (this.alert >= 1) {
                this.engage(spotter, now, 'spotted you');
                return;
            }
        } else {
            this.alert = Math.max(0, this.alert - cfg.thinkEvery * 0.1);
        }
        for (const e of live) {
            e.alert = this.alert;
        }
    }

    // Same rules as the Shellcap's eyes, with fewer rays: crouching only fools a calm colony.
    vision(e, T) {
        const cfg = this.cfg;
        const P = T.pos;
        const sneak = T.crouching && !this.engaged;
        const C = CONFIG.crouch;
        const sight = sneak ? cfg.sight * C.sight : cfg.sight;
        const dx = P.x - e.pos.x;
        const dz = P.z - e.pos.z;
        const hd = Math.hypot(dx, dz);
        const d = Math.hypot(hd, P.y - e.pos.y);
        if (d > sight) {
            return 0;
        }
        const dot = hd > 0.01 ? (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / hd : 1;
        const cosH = Math.cos(cfg.cone);
        const inCone = dot > cosH;
        if (!inCone && d > (sneak ? cfg.near * C.near : cfg.near)) {
            return 0;
        }
        const nav = Enemies.nav;
        const eyeY = e.pos.y + e.height * 0.8;
        if (!nav.sight(e.pos.x, eyeY, e.pos.z, P.x, P.y + (sneak ? 0.9 : 1.4), P.z) &&
            !nav.sight(e.pos.x, eyeY, e.pos.z, P.x, P.y + 0.4, P.z)) {
            return 0;
        }
        let s = (1 - d / cfg.sight) * (inCone ? 0.5 + 0.5 * (dot - cosH) / (1 - cosH) : 0.4);
        if (T.sprinting) {
            s *= 1.4;
        }
        s = Math.max(0.1, s);
        return sneak ? s * C.vision : s;
    }

    // Called once per worker in earshot. Several workers hearing one noise count it once, at the
    // loudest.
    hear(e, n, now) {
        if (this.engaged) {
            return;
        }
        if (now !== this.noiseT || n.kind !== this.noiseKind) {
            this.noiseT = now;
            this.noiseKind = n.kind;
            this.noiseBase = this.alert;
        }
        const gain = n.kind === 'shot' ? 1.3 : n.kind === 'impact' ? 0.9 : n.kind === 'land' ? 0.6 : 0.4;
        this.alert = Math.min(1, Math.max(this.alert, this.noiseBase + n.loud * gain + 0.05));
        if (this.alert >= 1 || (n.kind === 'shot' && n.loud > 0.4)) {
            this.engage(e, now, 'heard a ' + n.kind);
            return;
        }
        this.poi = (this.poi || new THREE.Vector3()).copy(n.src);
        this.poiT = now + 6;
        if (e.action && e.action.name === 'polish') {
            e.action = null;
        }
        e.thought = 'heard a ' + n.kind;
    }

    // Shellcaps (or any other type) fighting near a worker pull the whole colony in.
    kinFighting(live, now) {
        const comm = this.cfg.comm;
        for (const o of Enemies.list) {
            if (o.mind === this || o.dead || !o.engaged) {
                continue;
            }
            for (const e of live) {
                if (e.pos.distanceTo(o.pos) < comm) {
                    this.engage(e, now, 'kin are fighting');
                    return;
                }
            }
        }
    }

    engage(e, now, why) {
        if (this.engaged) {
            return;
        }
        this.engaged = true;
        this.alert = 1;
        this.tickT = 0;
        const kin = [];
        for (const k of this.members) {
            if (k.dead) {
                continue;
            }
            if (k.action && k.action.name === 'polish') {
                k.action = null;
            }
            k.engaged = true;
            k.alert = 1;
            k.intent = 'chase';
            k.goalSet = false;
            k.steerT = 0;
            k.thought = 'colony alerted';
            if (k !== e && kin.length < 8 && k.pos.distanceTo(e.pos) < this.cfg.comm) {
                kin.push(k);
            }
        }
        e.thought = why + ' - alerted the colony';
        Enemies.commFx(e, kin, this.def.color);
    }

    // A worker loves its armour: losing a piece enrages it and stokes the colony.
    onHurt(e, hit, now) {
        if (hit.broke) {
            e.rage = Math.min(this.cfg.rageMax, e.rage + this.cfg.rageBreak);
            this.frenzy = Math.min(1, this.frenzy + this.cfg.frenzyArmour);
            e.thought = 'my armour! - enraged';
        }
        if (!this.engaged) {
            this.engage(e, now, 'got hit');
        }
    }

    died(e, now) {
        this.frenzy = Math.min(1, this.frenzy + this.cfg.frenzyDeath);
        if (!this.engaged) {
            const k = this.members.find(m => m !== e && !m.dead);
            if (k) {
                this.engage(k, now, 'a worker died');
            }
        }
    }

    // ---- alerted: targets, tokens and spots

    // Share workers out between players: nearer and more wounded is better, the current target and
    // a recent attacker get a bonus, and every worker already on a player counts against it. A
    // switch is held back for `CONFIG.targeting.hold` seconds and never happens mid-attack.
    assign(live, targets, now) {
        const K = CONFIG.targeting;
        const cfg = this.cfg;
        const count = this.count;
        count.clear();
        for (const T of targets) {
            count.set(T, 0);
        }
        for (const e of live) {
            if (count.has(e.target)) {
                count.set(e.target, count.get(e.target) + 1);
            }
            e.seesPlayer = true;
        }
        for (const e of live) {
            const cur = count.has(e.target) ? e.target : null;
            if (cur && (now < e.targetT || (e.action && e.action.lock))) {
                continue;
            }
            let best = null;
            let bs = -Infinity;
            for (const T of targets) {
                let s = -e.pos.distanceTo(T.pos) - (count.get(T) - (T === cur ? 1 : 0)) * cfg.spread;
                s += (1 - (T.hpF !== undefined ? T.hpF : 1)) * cfg.scent;
                if (T === cur) {
                    s += cfg.stick;
                }
                if (T === e.hitBy && now - e.hitT < K.attackerFor) {
                    s += cfg.stick;
                }
                if (s > bs) {
                    bs = s;
                    best = T;
                }
            }
            if (best && best !== cur) {
                if (cur) {
                    count.set(cur, count.get(cur) - 1);
                }
                count.set(best, count.get(best) + 1);
                e.target = best;
                e.targetT = now + K.hold;
                e.path = null;
                e.slotOk = false;
                e.steerT = 0;
            }
        }
    }

    surround(T, live) {
        const cfg = this.cfg;
        const P = T.pos;
        const ring = this.ring;
        ring.length = 0;
        for (const e of live) {
            if (e.target !== T) {
                continue;
            }
            e.tdist = Math.hypot(e.pos.x - P.x, e.pos.z - P.z);
            e.ang = Math.atan2(e.pos.x - P.x, e.pos.z - P.z);
            ring.push(e);
        }
        if (!ring.length) {
            return;
        }
        // Tokens go to the nearest few. A holder counts as 1 m nearer, so tokens do not flicker.
        ring.sort((a, b) => (a.tdist - (a.token ? 1 : 0)) - (b.tdist - (b.token ? 1 : 0)));
        const inner = this.inner;
        const outer = this.outer;
        inner.length = outer.length = 0;
        const tokens = this.maxAttackers(T);
        for (let i = 0; i < ring.length; i++) {
            const e = ring[i];
            e.token = i < tokens && e.tdist < cfg.direct + 2;
            (e.token ? inner : outer).push(e);
        }
        Enemies.enterLayer(ring[0]);
        this.place(inner, T, cfg.ring);
        this.place(outer, T, cfg.waitRing);
    }

    // Evenly spaced spots on a ring, in the order the workers already stand around the player and
    // turned to fit where they are, so nobody has to cross through the middle.
    place(list, T, r) {
        const n = list.length;
        if (!n) {
            return;
        }
        list.sort((a, b) => a.ang - b.ang);
        const step = Math.PI * 2 / n;
        let sx = 0;
        let sz = 0;
        for (let i = 0; i < n; i++) {
            const a = list[i].ang - i * step;
            sx += Math.sin(a);
            sz += Math.cos(a);
        }
        const off = Math.atan2(sx, sz);
        const nav = Enemies.nav;
        const P = T.pos;
        const floor = T.nav && T.nav.floor !== undefined ? T.nav.floor : P.y;
        const fits = i => nav.open(i) && Math.abs(nav.h[i] - floor) <= Nav.STEP;
        for (let i = 0; i < n; i++) {
            const e = list[i];
            const a = off + i * step;
            let x = P.x + Math.sin(a) * r;
            let z = P.z + Math.cos(a) * r;
            let c = nav.cell(x, z);
            if (!fits(c)) {
                c = nav.nearest(x, z, fits, 3);
                if (c >= 0) {
                    x = nav.cx(c);
                    z = nav.cz(c);
                }
            }
            e.slotOk = c >= 0;
            if (c >= 0) {
                e.slot.set(x, nav.h[c], z);
            }
        }
    }

    // ---- per worker, per frame

    act(e, dt, now) {
        const a = e.action;
        if (a && this.runAction(e, a, dt, now)) {
            return;
        }
        if (!this.engaged || !e.target) {
            this.idle(e, dt, now);
            return;
        }
        if ((e.steerT -= dt) <= 0) {
            e.steerT = Math.max(e.steerT + this.cfg.steerEvery, 0.02);
            this.move(e, now);
            if (this.tryPounce(e)) {
                return;
            }
        }
        this.tryClaw(e);
    }

    // Close in: straight to the spot when it is near and in a straight line, otherwise down the
    // shared flow field toward the player. Bloodlust makes them faster.
    move(e, now) {
        const cfg = this.cfg;
        const P = e.target.pos;
        const d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
        const speed = cfg.run * (1 + cfg.frenzySpeed * this.lust(e.target, e));
        e.strafe = false;
        if (e.slotOk && d < cfg.direct && Math.abs(P.y - e.pos.y) < 0.9) {
            const nav = Enemies.nav;
            const here = e.navCell();
            const goal = nav.cell(e.slot.x, e.slot.z);
            if (goal === here || nav.straight(here, goal)) {
                const sd = e.steer(e.slot.x, e.slot.z, speed);
                if (sd < 1.5) {
                    e.face(P.x, P.z);
                    e.strafe = true;
                }
                e.intent = e.token ? 'rush' : 'flank';
                e.thought = e.token ? 'closing in for blood' : 'pressing in behind';
                e.goal.copy(e.slot);
                e.goalSet = true;
                e.dbgCells = null;
                return;
            }
        }
        e.intent = 'chase';
        e.thought = 'following the colony trail';
        e.goalSet = false;
        e.chase(speed, now);
    }

    attacking(T) {
        let n = 0;
        for (const m of this.members) {
            if (!m.dead && m.target === T && m.action && (m.action.name === 'claw' || m.action.name === 'pounce')) {
                n++;
            }
        }
        return n;
    }

    tryClaw(e) {
        const cfg = this.cfg;
        if (e.action || !e.onGround || !e.cool('claw')) {
            return;
        }
        const T = e.target;
        const P = T.pos;
        const d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
        if (d > cfg.reach || Math.abs(P.y - e.pos.y) > 1) {
            return;
        }
        // Workers without a token only claw when the player walks right into them and there is room.
        if (!e.token && (d > cfg.reach * 0.7 || this.attacking(T) >= this.maxAttackers(T))) {
            return;
        }
        e.action = { name: 'claw', t: 0, dur: cfg.clawTime, wind: cfg.clawWind, side: Rng.ai() < 0.5 ? 1 : 0, hit: false, lock: true };
        e.cd.claw = cfg.clawCd * (1 - cfg.frenzyCd * this.lust(T, e)) + Rng.ai() * 0.3;
        e.face(P.x, P.z);
        e.thought = 'raking';
    }

    // A leap from a few metres out, claws first. Only token holders, only with a clear run.
    tryPounce(e) {
        const cfg = this.cfg;
        if (!e.token || e.action || !e.onGround || !e.cool('pounce')) {
            return false;
        }
        const T = e.target;
        const P = T.pos;
        const d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
        if (d < cfg.pounceMin || d > cfg.pounceMax || Math.abs(P.y - e.pos.y) > 0.6) {
            return false;
        }
        e.cd.pounce = 0.6;
        if (this.attacking(T) >= this.maxAttackers(T) || Rng.ai() > cfg.pounceChance + 0.3 * this.lust(T, e)) {
            return false;
        }
        const nav = Enemies.nav;
        if (!nav.straight(e.navCell(), nav.cell(P.x, P.z))) {
            return false;
        }
        e.cd.pounce = cfg.pounceCd + Rng.ai();
        e.action = { name: 'pounce', t: 0, dur: 1.5, wind: cfg.pounceWind, hit: false, fly: false, lock: true };
        e.stop();
        e.face(P.x, P.z);
        e.thought = 'pouncing';
        return true;
    }

    // Damage goes through `Players.hurt`. Drawing blood feeds the frenzy.
    strike(e, T, range, push) {
        _cv.set(T.pos.x - e.pos.x, 0, T.pos.z - e.pos.z).normalize();
        const dmg = range[0] + Rng.ai() * (range[1] - range[0]);
        if (Players.hurt(T, dmg, { from: e.pos, dir: _cv, push, shake: 0.25, by: e.id }) > 0) {
            this.frenzy = Math.min(1, this.frenzy + this.cfg.frenzyHit);
        }
    }

    runAction(e, a, dt, now) {
        const cfg = this.cfg;
        switch (a.name) {
            case 'claw': {
                const T = e.target;
                if (!T) {
                    e.action = null;
                    return false;
                }
                const P = T.pos;
                const dx = P.x - e.pos.x;
                const dz = P.z - e.pos.z;
                const d = Math.hypot(dx, dz) || 1;
                if (a.t < a.wind) {
                    e.stop();
                    e.face(P.x, P.z);
                } else if (a.t < a.wind + 0.12 && d > 0.85) {
                    e.steer(P.x, P.z, 3);
                } else {
                    e.stop();
                }
                if (!a.hit && a.t >= a.wind + 0.06) {
                    a.hit = true;
                    const facing = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / d;
                    if (d < cfg.reach + 0.3 && facing > 0.3 && Math.abs(P.y - e.pos.y) < 1.2) {
                        this.strike(e, T, cfg.clawDmg, cfg.clawPush);
                    }
                }
                if (a.t >= a.dur) {
                    e.action = null;
                }
                return true;
            }
            case 'pounce': {
                const T = e.target;
                if (!T) {
                    e.action = null;
                    return false;
                }
                const P = T.pos;
                e.stop();
                if (a.t < a.wind) {
                    e.face(P.x, P.z);
                    return true;
                }
                if (!a.fly) {
                    // Aim where the player will be.
                    a.fly = true;
                    a.coast = true;
                    const tx = P.x + T.vel.x * 0.25;
                    const tz = P.z + T.vel.z * 0.25;
                    const dx = tx - e.pos.x;
                    const dz = tz - e.pos.z;
                    const d = Math.hypot(dx, dz) || 1;
                    const vy = cfg.pounceUp;
                    const sp = Math.min(cfg.pounceSpeed, Math.max(0, d - 0.6) / (2 * vy / GRAV));
                    e.vel.set(dx / d * sp, vy, dz / d * sp);
                    e.onGround = false;
                    e.faceYaw = Math.atan2(dx, dz);
                    a.flyT = a.t;
                }
                if (!a.hit && !a.landT && Math.hypot(P.x - e.pos.x, P.z - e.pos.z) < cfg.reach * 0.9 && Math.abs(P.y - e.pos.y) < 1.2) {
                    a.hit = true;
                    this.strike(e, T, cfg.pounceDmg, cfg.pouncePush);
                    e.vel.x *= 0.2;
                    e.vel.z *= 0.2;
                }
                if (e.onGround && a.t > a.flyT + 0.12) {
                    a.coast = false;
                    a.landT = a.landT || a.t;
                    if (a.t > a.landT + 0.4) {
                        e.action = null;
                    }
                }
                if (a.t > a.dur) {
                    e.action = null;
                }
                return true;
            }
            case 'stagger':
                e.stop();
                if (a.t >= a.dur) {
                    e.action = null;
                }
                return true;
            case 'polish':
                e.stop();
                if (a.t >= a.dur) {
                    e.action = null;
                }
                return true;
            case 'dying':
                return true;
            default:
                if (a.air) {
                    e.stop();
                    return true;
                }
                e.action = null;
                return false;
        }
    }

    // Calm: drift around the spawn spot, stop to polish the armour, or go and look at a noise.
    idle(e, dt, now) {
        const cfg = this.cfg;
        e.token = false;
        if ((e.steerT -= dt) > 0) {
            if (e.goalSet && Math.hypot(e.goal.x - e.pos.x, e.goal.z - e.pos.z) < 0.4) {
                e.goalSet = false;
                e.stop();
            }
            return;
        }
        e.steerT = 0.3;
        const poi = this.poi;
        if (poi && now < this.poiT && e.pos.distanceTo(poi) < cfg.investigate) {
            e.intent = 'investigate';
            e.thought = 'checking a noise';
            e.goalSet = false;
            if (Math.hypot(poi.x - e.pos.x, poi.z - e.pos.z) > 2.5) {
                e.navTo(poi.x, poi.z, cfg.jog, now);
            } else {
                e.stop();
                e.face(poi.x, poi.z);
            }
            return;
        }
        if (now > e.wanderT) {
            e.wanderT = now + 2.5 + Rng.ai() * 4;
            e.goalSet = false;
            const r = Rng.ai();
            if (r < 0.5) {
                const nav = Enemies.nav;
                const c = nav.cell(e.home.x + (Rng.ai() - 0.5) * 2 * cfg.roam, e.home.z + (Rng.ai() - 0.5) * 2 * cfg.roam);
                if (nav.open(c) && nav.straight(e.navCell(), c)) {
                    e.goal.set(nav.cx(c), nav.h[c], nav.cz(c));
                    e.goalSet = true;
                }
            } else if (r < 0.5 + cfg.polish) {
                e.action = { name: 'polish', t: 0, dur: 2.2 + Rng.ai() * 1.6 };
                e.wanderT = now + e.action.dur + 0.5;
                e.stop();
                e.intent = 'idle';
                e.thought = 'polishing its armour';
                return;
            } else {
                e.faceYaw = wrapAngle(e.yaw + (Rng.ai() - 0.5) * 2);
            }
        }
        if (e.goalSet) {
            e.steer(e.goal.x, e.goal.z, cfg.walk);
            e.intent = 'roam';
            e.thought = 'wandering';
        } else {
            e.stop();
            e.intent = 'idle';
            e.thought = 'idle';
        }
    }
}

Enemies.register('capling', {
    name: 'Capling',
    color: 0xffc23c,
    hp: 60,
    radius: 0.36,
    height: 1.1,
    climbReach: 2.6,
    hearing: 0.9,
    move: {
        accel: 9,
        decel: 10,
        turn: 7,
        reach: 1.1
    },
    brain: {
        thinkEvery: 0.25,   // colony decisions per second: 4
        steerEvery: 0.12,   // how often a worker re-steers toward its spot
        looks: 3,           // workers whose sight the calm colony checks per decision
        sight: 28,
        cone: 1.25,
        near: 3.5,
        spotGain: 4,
        comm: 20,           // how far a fighting enemy pulls the colony in
        roam: 3,
        investigate: 18,
        polish: 0.3,        // chance an idle worker stops to polish its armour
        walk: 1.1,
        jog: 2.4,
        run: 3.6,
        direct: 7,          // inside this a worker goes straight to its spot, beyond it follows the flow field
        ring: 1.15,         // attack ring radius
        waitRing: 1.9,      // the rest press in right behind
        attackers: 3,       // workers allowed to attack one player at once
        spread: 3,          // metres of "distance" each worker already on a player adds to it
        stick: 4,           // bonus for the current target, and for whoever hit this worker recently
        scent: 6,           // metres of "distance" a player at 0 HP is worth: wounded players draw them
        reach: 1.3,
        clawTime: 0.6,
        clawWind: 0.24,
        clawCd: 1.2,
        clawDmg: [3, 4],
        clawPush: 2,
        pounceMin: 2.2,     // pounce range, metres
        pounceMax: 4.2,
        pounceChance: 0.3,  // per check (about twice a second), +0.3 at full bloodlust
        pounceCd: 4,
        pounceWind: 0.3,
        pounceUp: 4.2,
        pounceSpeed: 11,
        pounceDmg: [4, 5],
        pouncePush: 4,
        frenzyHit: 0.04,    // colony frenzy gained per hit that draws blood
        frenzyDeath: 0.04,  // and per worker killed
        frenzyArmour: 0.03, // and per piece of armour broken
        frenzyDecay: 0.05,  // lost per second
        frenzySpeed: 0.25,  // run speed bonus at full bloodlust
        frenzyCd: 0.2,      // attack cooldown cut at full bloodlust
        frenzyExtra: 0.9,   // bloodlust at which one more worker may attack at once
        wounded: 0.4,       // a player below this HP fraction...
        woundedLust: 0.3,   // ...adds this much bloodlust to the workers on them
        rageBreak: 0.35,    // a worker's own bloodlust when a piece of its armour breaks...
        rageMax: 0.6,
        rageDecay: 0.04     // ...lost per second
    },
    mind: def => new CaplingMind(def),
    create: (def, x, y, z) => new Capling(def, x, y, z)
});
