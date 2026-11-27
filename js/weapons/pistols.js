// Chanterelle Eagles: a pair of chanterelle revolvers. Orange frames, cream gills, teal glow,
// vines that grow during the reload, a spore sac under each grip that shows its rounds, tassels.
// Each has an 8-chamber cylinder (8 rounds a gun, 16 in all) and sharp chanterelle blades: a long
// one under the barrel and a spur on the trigger guard.
//   LMB: the guns take turns. Each shot snaps the hammer and turns the cylinder one chamber.
//   R: the old fungal reload; the cylinders swing out, spent spore husks fall, and they snap shut.
//   RMB: both guns are thrown almost straight at the crosshair, spinning so the blades cut. As
//        they reach the far point, roots lash out of the hands, sleeves and body, catch them and
//        haul them back in.
(() => {
    const GA = -0.32;
    const GP = [0, -0.002, 0.03];
    const gripPt = (x, y, z) => [
        GP[0] + x,
        GP[1] + y * Math.cos(GA) - z * Math.sin(GA),
        GP[2] + y * Math.sin(GA) + z * Math.cos(GA)
    ];
    // Revolver layout, gun space (barrel along -z). The top chamber lines up with the bore.
    const BORE = 0.036;
    const CR = 0.021;                 // cylinder radius
    const CH = 0.0125;                // chamber circle radius
    const CY = BORE - CH;             // cylinder axis height
    const CZ = 0.022;                 // cylinder rear face
    const CL = 0.042;                 // cylinder length
    const CHAMBERS = 8;
    const STEP = Math.PI * 2 / CHAMBERS;
    const MUZZLE_Z = -0.165;
    const V1 = new THREE.Vector3();
    const V2 = new THREE.Vector3();
    const V3 = new THREE.Vector3();
    const V4 = new THREE.Vector3();

    Weapons.register('pistols', {
        name: 'Chanterelle Eagles',
        altName: 'Throw',
        offset: [0, -0.145, -0.45],
        sprintYaw: 0.2,
        // Curve detail at High, on top of DETAIL.scale (see WeaponBuilder).
        segScale: { high: 0.7, medium: 0.85 },
        stats: {
            mag: 16, rate: 5, auto: true, damage: 17, pellets: 1, spread: 0.022, range: 70,
            reloadTime: 2.5, drawTime: 0.4,
            kick: { back: 0.03, up: 0.048, roll: 0.024 }
        },
        color: 0x45ffc8,
        projectile: {
            speed: 65, color: 0x2bffc0, core: 0xe6fff8, maxDist: 50, wobble: 0.03,
            radius: 0.018, length: 0.16, tail: 1.5,
            impact: { sparks: 3, size: 0.012 }
        },
        inspect: { time: 3.2 },
        // The throw. windup / flight / catch: seconds. Flight: `out` seconds flying out, then the
        // roots catch the gun at the far point and haul it back for the rest (it turns back at once,
        // no hover). reach: metres to the far point (less before a wall: `wall` short of it, never
        // under `minReach`; enemies do not stop it). gap: each gun's sideways offset from the aim
        // line, at the hand and at the far point. rise: metres of lift on the way out. keep: speed
        // left at the far point (fraction of the launch speed). reel: return speed at the start
        // (fraction of the average; it ends faster). hitRadius: metres past an enemy's radius the
        // spinning blades cut (the blade sweep at flight size). hitCd: seconds between one gun's
        // hits. spin: radians a second out and back. grow: flight size, at the hands and at the far
        // point. netSlack / maxHits: the co-op host's allowance (metres past reach, hits a throw).
        throwT: {
            windup: 0.22, flight: 1.5, catch: 0.32, damage: 30, reach: 11, wall: 0.6, minReach: 1.5,
            out: 0.5, gap: [0.26, 0.1], rise: 0.15, keep: 0.6, reel: 0.6, hitRadius: 0.3, hitCd: 0.3,
            spin: [18, 10], grow: [1, 1.6], netSlack: 1, maxHits: 10,
            // The roots that catch the guns: per gun (2 at low detail), points per root at High
            // (DETAIL.seg scales it), width at the base and the tip (m), seconds they take to lash
            // out (they leave that long before the gun reaches the far point), how far they bow and
            // whip (fractions of their length, never more than `maxBend` m), and how long they take
            // to pull back in.
            roots: { perGun: 4, seg: 24, width: [0.034, 0.008], shoot: 0.2, bow: 0.18, lash: 0.12, maxBend: 0.7, retract: 0.14 },
            // Fungi sprouting along each root as it lashes past: orange cordyceps clubs and little
            // chanterelle caps, per root at [high, medium, low], their size (times `perMetre` of root
            // length, so they still read far off, up to `maxScale`), and how long one takes to pop out.
            fungi: { cordyceps: [4, 2, 1], caps: [2, 1, 0], size: [0.9, 1.5], perMetre: 0.14, maxScale: 2.4, grow: 0.18 }
        },
        hands: { left: 'holdL', right: 'holdR' },
        throwPose: [
            { p: [-0.3, 0.03, -0.14], fingers: [-0.3, 0.5, -1], back: [-0.3, 0.6, 0.8], curl: 0.1 },
            { p: [0.3, 0.03, -0.14], fingers: [0.3, 0.5, -1], back: [0.3, 0.6, 0.8], curl: 0.1 }
        ],

        build(b) {
            const C = {
                chant: 0xeaa13a, deep: 0xc97a22, stem: 0xf2e3c3, gill: 0xf5d49b, bark: 0x6a4529,
                glow: 0x45ffc8, dark: 0x1a1008
            };
            const m = {
                chant: b.mat('chant', { color: C.chant, roughness: 0.5 }),
                deep: b.mat('deep', { color: C.deep, roughness: 0.55 }),
                frill: b.mat('frill', { color: C.chant, roughness: 0.5, flatShading: true, side: THREE.DoubleSide }),
                stem: b.mat('stem', { color: C.stem }),
                gill: b.mat('gill', { color: C.gill, side: THREE.DoubleSide }),
                bark: b.mat('bark', { color: C.bark, roughness: 0.95, flatShading: true }),
                dark: b.mat('dark', { color: C.dark, roughness: 1, side: THREE.DoubleSide }),
                blade: b.mat('blade', { color: 0xc2621a, roughness: 0.3, metalness: 0.35, flatShading: true }),
                edge: b.mat('edge', { color: 0xfff0d2, roughness: 0.2, metalness: 0.5, flatShading: true }),
                vine: b.glow('vine', C.glow, 0.5, { color: 0xe9fff7, roughness: 0.6 }),
                inlay: b.glow('inlay', C.glow, 0.7, { color: 0x2a6b58 }),
                bud: b.glow('bud', C.glow, 1.2),
                node: b.glow('node', C.glow, 1.6)
            };
            const model = b.group();
            const guns = [];

            // Small decoration left out at lower detail: `lo` (medium and low), `po` (low only).
            const lo = b.lod !== 'high';
            const po = b.lod === 'potato';
            for (const side of [-1, 1]) {
                const g = b.group(model, [side * 0.24, 0, 0], [0, side * 0.055, -side * 0.05]);
                const gun = { g, side, open: 0, thumb: 0 };

                // ---- frame: lower frame, standing breech, top strap with gills, rear sight
                b.rbox(0.017, 0.012, 0.072, 0.003, m.chant, g, [0, -0.004, 0.0]);
                b.rbox(0.024, 0.044, 0.016, 0.005, m.chant, g, [0, 0.02, 0.031]);
                b.tubeZ(CR * 0.85, CR * 0.85, 0.004, m.deep, g, [0, CY, CZ + 0.002], { seg: 20 });
                const strapY = CY + CR + 0.0032;
                b.rbox(0.015, 0.0055, 0.068, 0.002, m.chant, g, [0, strapY, -0.002]);
                for (let i = 0; i < (po ? 3 : 6); i++) {
                    b.box(0.0168, 0.0016, 0.0024, m.gill, g, [0, strapY + 0.003, 0.028 - i * (po ? 0.009 : 0.0046)]);
                }
                for (const sx of [-1, 1]) {
                    b.box(0.0035, 0.007, 0.005, m.stem, g, [sx * 0.0042, strapY + 0.006, 0.032]);
                    // Gills down the breech's sides.
                    for (let k = 0; k < (lo ? 0 : 3); k++) {
                        b.box(0.0024, 0.018, 0.0022, m.gill, g, [sx * 0.0122, 0.012, 0.026 + k * 0.004]);
                    }
                }
                gun.port = b.glow('port' + side, C.glow, 1.2);
                b.box(0.0016, 0.009, 0.012, gun.port, g, [0.0127, 0.033, 0.031]);
                b.mini(g, [-0.0095, -0.004, 0.012], 0.01, m.deep, m.stem, [0, 0, Math.PI / 2]);

                // ---- barrel: round, with deep side ribs, a cream top rib, the frilled muzzle
                const blen = -0.022 - MUZZLE_Z;
                const bz = (-0.022 + MUZZLE_Z) / 2;
                b.tubeZ(0.0092, 0.0098, blen, m.chant, g, [0, BORE, bz], { seg: 16 });
                b.tubeZ(0.0108, 0.0108, 0.008, m.deep, g, [0, BORE, -0.026], { seg: 16 });
                for (const sx of [-1, 1]) {
                    for (let k = 0; k < (po ? 1 : 2); k++) {
                        b.box(0.0025, 0.0022, blen - 0.02, m.deep, g, [sx * 0.0094, BORE + 0.002 - k * 0.0052, bz - 0.006]);
                    }
                    b.box(0.0012, 0.0022, blen - 0.03, m.inlay, g, [sx * 0.0099, BORE - 0.0055, bz - 0.004]);
                }
                b.rbox(0.008, 0.005, blen + 0.004, 0.0018, m.stem, g, [0, BORE + 0.0105, bz]);
                for (let i = 0; i < (po ? 0 : 3); i++) {
                    b.box(0.0045, 0.0015, 0.003, m.dark, g, [0, BORE + 0.0131, -0.12 - i * 0.008]);
                }
                b.mini(g, [0, BORE + 0.0125, -0.152], 0.013, m.deep, m.stem);
                const frill = b.lathe([[0.0075, 0], [0.012, 0.0018], [0.0175, 0.0028], [0.0205, 0.0012]], m.frill, g, [0, BORE, MUZZLE_Z - 0.0005], [-Math.PI / 2, 0, 0], { seg: 28 });
                b.displace(frill.geometry, v => (Math.hypot(v.x, v.z) > 0.014 ? 0.0018 * Math.sin(Math.atan2(v.z, v.x) * 7) : 0));
                b.disc(0.0075, m.dark, g, [0, BORE, MUZZLE_Z - 0.0015], [0, Math.PI, 0]);
                b.tubeZ(0.0075, 0.0075, 0.03, m.dark, g, [0, BORE, MUZZLE_Z + 0.015], { seg: 10, open: true });

                // ---- blades: one long blade under the barrel, a spur on the trigger guard
                this.buildBlade(b, m, g, 'barrel', [0, BORE - 0.0094, -0.034]);
                this.buildBlade(b, m, g, 'guard', [0, -0.008, -0.037]);

                // ---- trigger guard and trigger
                b.ring(0.018, 0.003, m.stem, g, [0, -0.006, -0.022], [0, Math.PI / 2, Math.PI], { arc: Math.PI });
                gun.trigger = b.part(b.group(g, [0, -0.008, -0.015]));
                b.box(0.004, 0.016, 0.006, m.gill, gun.trigger, [0, -0.004, -0.001], [0.35, 0, 0]);

                // ---- cylinder on its crane. The crane swings it out toward the middle of the view
                // about an axis along the barrel, low on the inner side.
                const pivot = [-side * 0.009, 0.004, 0];
                gun.crane = b.part(b.group(g, pivot));
                const yoke = b.group(gun.crane, pivot.map(v => -v));
                b.box(0.004, 0.012, 0.004, m.deep, yoke, [-side * 0.006, 0.01, CZ - CL - 0.003], [0, 0, side * 0.5]);
                gun.cyl = b.part(b.group(yoke, [0, CY, CZ]));
                this.buildCylinder(b, m, gun.cyl);
                gun.chambers = [];
                for (let k = 0; k < CHAMBERS; k++) {
                    const a = Math.PI / 2 + k * STEP;
                    gun.chambers.push(b.group(gun.cyl, [Math.cos(a) * CH, Math.sin(a) * CH, 0.002]));
                }

                b.rbox(0.03, 0.02, 0.02, 0.005, m.stem, g, [0, 0.0, 0.026]);
                const grip = b.group(g, GP, [GA, 0, 0]);
                b.rbox(0.031, 0.104, 0.046, 0.01, m.bark, grip, [0, -0.052, 0]);
                for (const sx of [-1, 1]) {
                    for (let i = 0; i < 9; i++) {
                        b.box(0.0025, 0.0022, 0.032, m.gill, grip, [sx * 0.0158, -0.016 - i * 0.0085, 0]);
                    }
                }
                b.rbox(0.026, 0.01, 0.018, 0.004, m.stem, grip, [0, -0.002, 0.026]);
                b.rbox(0.033, 0.006, 0.048, 0.003, m.deep, grip, [0, -0.105, 0]);

                gun.sac = b.part(b.group(grip, [0, -0.112, 0.002]));
                gun.glass = b.glass('glass' + side, 0xdffff5, 0.3);
                gun.core = b.glow('core' + side, C.glow, 1.2);
                b.sphere(0.019, gun.glass, gun.sac, null, [1, 0.85, 1.2]);
                gun.coreMesh = b.part(b.sphere(0.0135, gun.core, gun.sac, null, [1, 0.9, 1.15], { wobble: 0.0015, freq: 120 }));

                gun.hammer = b.part(b.group(g, [0, 0.042, 0.038]));
                b.mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.016, b.n(6)), m.stem, gun.hammer, [0, 0.006, 0.004], [-0.5, 0, 0]);
                b.cap(0.01, 0.008, m.deep, m.gill, gun.hammer, [0, 0.013, 0.01], [-1.1, 0, 0], { fins: 0, seg: 12 });

                gun.vines = [];
                gun.extras = [];
                const rnd = WeaponKit.rng(side > 0 ? 11 : 23);
                const up = new THREE.Vector3(0, 1, 0);
                for (const phase of [0, Math.PI]) {
                    const pts = [];
                    const axis = [];
                    const N1 = 16;
                    const N2 = 26;
                    for (let i = 0; i <= N1; i++) {
                        const t = i / N1;
                        const yl = WeaponKit.lerp(-0.112, -0.004, t);
                        const a = phase + t * 2.2 * Math.PI * 2;
                        const rr = 1 + 0.12 * Math.sin(a * 3 + phase);
                        pts.push(gripPt(Math.cos(a) * 0.0205 * rr, yl, Math.sin(a) * 0.029 * rr));
                        axis.push(gripPt(0, yl, 0));
                    }
                    // Up the grip, then round the barrel to the muzzle.
                    for (let i = 1; i <= N2; i++) {
                        const t = i / N2;
                        const z = WeaponKit.lerp(0.03, -0.162, t);
                        const a = phase + 2.2 * Math.PI * 2 + t * 3.2 * Math.PI * 2;
                        const rr = 1 + 0.12 * Math.sin(a * 3 + phase);
                        const ry = z > -0.03 ? 0.022 : 0.0135;
                        pts.push([Math.cos(a) * ry * rr, BORE - 0.004 + Math.sin(a) * (ry + 0.006) * rr, z]);
                        axis.push([0, BORE - 0.004, z]);
                    }
                    const vine = b.tube(pts, 0.0029, 0.0014, m.vine, g, { seg: 160, radial: 5 });
                    vine.visible = false;
                    gun.vines.push(vine);

                    const n = pts.length - 1;
                    for (let k = 0; k < 4; k++) {
                        const idx = Math.round(WeaponKit.lerp(0.18, 0.92, (k + rnd() * 0.5) / 4) * n);
                        const base = new THREE.Vector3(...pts[idx]);
                        const out = base.clone().sub(new THREE.Vector3(...axis[idx])).normalize();
                        const curl = new THREE.Vector3().crossVectors(out, up).normalize().multiplyScalar(rnd() < 0.5 ? 1 : -1);
                        const p1 = base.clone().addScaledVector(out, 0.008).addScaledVector(curl, 0.005);
                        const p2 = base.clone().addScaledVector(out, 0.016).addScaledVector(curl, 0.002);
                        const branch = b.tube([base.toArray(), p1.toArray(), p2.toArray()], 0.0017, 0.0008, m.vine, g, { seg: 10, radial: 4 });
                        branch.visible = false;
                        const bud = b.mini(g, p2.toArray(), 0.011, m.bud, m.vine);
                        bud.quaternion.setFromUnitVectors(up, out);
                        bud.visible = false;
                        b.part(bud);
                        gun.extras.push({ kind: 'branch', mesh: branch, u: idx / n });
                        gun.extras.push({ kind: 'bud', mesh: bud, u: idx / n });
                    }
                    for (let k = 0; k < 6; k++) {
                        const idx = Math.round(((k + 0.5) / 6) * n);
                        const node = b.sphere(0.0036, m.node, g, pts[idx], null, { ws: 8, hs: 6 });
                        node.visible = false;
                        b.part(node);
                        gun.extras.push({ kind: 'node', mesh: node, u: idx / n });
                    }
                }

                for (const sx of [-1, 1]) {
                    b.box(0.0012, 0.0022, 0.05, m.inlay, g, [sx * 0.0088, -0.003, 0.0]);
                }
                for (const sx of [-1, 1]) {
                    const med = b.group(grip, [sx * 0.0175, -0.05, 0], [0, 0, -sx * Math.PI / 2]);
                    b.cap(0.0075, 0.004, m.deep, null, med, null, null, { seg: 14 });
                    b.ring(0.008, 0.0012, m.inlay, med, [0, 0.0005, 0], [Math.PI / 2, 0, 0], { ts: 18, rs: 4 });
                }
                b.ring(0.0045, 0.0013, m.stem, grip, [0, -0.106, 0.024], [0, Math.PI / 2, 0], { ts: 10, rs: 4 });
                gun.tassel = b.part(b.group(grip, [0, -0.11, 0.026]));
                b.tube([[0, 0, 0], [0.001, -0.012, 0.001], [0, -0.024, 0]], 0.0011, 0.0011, m.vine, gun.tassel, { seg: 8, radial: 4 });
                b.sphere(0.0035, m.node, gun.tassel, [0, -0.026, 0], null, { ws: 8, hs: 6 });

                gun.muzzle = b.group(g, [0, BORE, MUZZLE_Z - 0.01]);
                gun.flash = b.flash(gun.muzzle, null, C.glow, 0.05, 2);
                b.part(g);

                const n = side > 0 ? 'R' : 'L';
                const hold = { fingers: [0, 0, -1], back: [side, 0, 0.35], around: 0.017, curl: 0.9 };
                b.grip('grip' + n, grip, [0, -0.05, 0], hold);
                gun.hold = b.group(model);
                b.grip('hold' + n, b.group(gun.hold, GP, [GA, 0, 0]), [0, -0.05, 0], hold);
                gun.twirl = 0;
                guns.push(gun);
            }
            b.part(model);
            return { model, guns, flashes: [guns[0].flash, guns[1].flash], m };
        },

        // The cylinder, along -z from its rear face (z = 0): chanterelle orange with cream gill
        // ridges between the eight chambers, deep-orange end rings, dark chamber mouths.
        buildCylinder(b, m, p) {
            const r = CR;
            const L = CL;
            b.lathe([[r * 0.25, 0], [r * 0.94, 0], [r, L * 0.08], [r, L * 0.9], [r * 0.92, L], [r * 0.25, L]], m.chant, p, null, [-Math.PI / 2, 0, 0], { seg: 24 });
            for (const z of b.lod === 'potato' ? [] : [-L * 0.06, -L * 0.94]) {
                b.ring(r * 1.0, 0.0011, m.deep, p, [0, 0, z], null, { ts: 24, rs: 4 });
            }
            for (let k = 0; k < CHAMBERS; k++) {
                const a = Math.PI / 2 + (k + 0.5) * STEP;
                b.box(r * 0.1, r * 0.14, L * 0.72, m.gill, p, [Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99, -L * 0.5], [0, 0, a - Math.PI / 2]);
            }
            // Chamber mouths at the front; the back (seen when it swings out) only above low detail.
            const hole = new THREE.CircleGeometry(0.0037, b.n(10, 4));
            for (let k = 0; k < CHAMBERS; k++) {
                const a = Math.PI / 2 + k * STEP;
                b.mesh(hole, m.dark, p, [Math.cos(a) * CH, Math.sin(a) * CH, -L - 0.0003], [0, Math.PI, 0]);
                if (b.lod !== 'potato') {
                    b.mesh(hole, m.dark, p, [Math.cos(a) * CH, Math.sin(a) * CH, 0.0003]);
                }
            }
            b.disc(r * 0.24, m.stem, p, [0, 0, -L - 0.0002], [0, Math.PI, 0]);
        },

        // A chanterelle blade: a flat body with a scalloped edge (the cap's false gills) and a pale
        // honed edge strip, flat-shaded and thin. Built in profile (u forward, v up) and turned so
        // u runs along -z. 'barrel': long, under the barrel, its tip hooking up past the muzzle.
        // 'guard': a short curved spur on the front of the trigger guard.
        buildBlade(b, m, p, kind, pos) {
            const K = WeaponKit;
            const body = [];
            const edge = [];
            if (kind === 'barrel') {
                const L = 0.168;
                const n = b.lod === 'potato' ? 8 : b.lod === 'medium' ? 14 : 22;
                body.push([0, 0], [L * 0.86, 0], [L * 0.95, 0.003], [L, 0.008]);
                for (let i = 0; i <= n; i++) {
                    const u = L * (0.985 - i / n * 0.985);
                    const depth = K.lerp(0.0175, 0.006, u / L) + (u > L * 0.86 ? (u - L * 0.86) * 0.25 : 0);
                    const sc = 0.0013 * Math.sin((u / L) * Math.PI * 7) * (u > L * 0.05 && u < L * 0.86 ? 1 : 0);
                    edge.push([u, -depth + sc + (u > L * 0.9 ? (u - L * 0.9) * 1.3 : 0)]);
                }
                body.push(...edge, [0, -0.012]);
            } else {
                body.push([0, 0.003], [0.007, -0.001], [0.016, -0.007], [0.025, -0.017], [0.012, -0.012], [0.002, -0.014], [0, -0.011]);
                edge.push([0.025, -0.017], [0.012, -0.012], [0.002, -0.014]);
            }
            const shape = new THREE.Shape();
            body.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
            const t = kind === 'barrel' ? 0.0028 : 0.0026;
            const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
            geo.translate(0, 0, -t / 2);
            b.mesh(geo, m.blade, p, pos, [0, Math.PI / 2, 0]);
            // The honed edge: a strip a little thicker than the blade along its cutting edge.
            const strip = new THREE.Shape();
            strip.moveTo(edge[0][0], edge[0][1]);
            for (let i = 1; i < edge.length; i++) {
                strip.lineTo(edge[i][0], edge[i][1]);
            }
            for (let i = edge.length - 1; i >= 0; i--) {
                strip.lineTo(edge[i][0], edge[i][1] + 0.0022);
            }
            const sg = new THREE.ExtrudeGeometry(strip, { depth: t + 0.0012, bevelEnabled: false });
            sg.translate(0, 0, -(t + 0.0012) / 2);
            b.mesh(sg, m.edge, p, pos, [0, Math.PI / 2, 0]);
            if (kind === 'barrel' && b.lod !== 'potato') {
                // A glowing fuller down each face, under the spine.
                for (const sx of [-1, 1]) {
                    b.box(0.0008, 0.0018, 0.11, m.inlay, p, [pos[0] + sx * (t / 2 + 0.0002), pos[1] - 0.0045, pos[2] - 0.065]);
                }
            }
        },

        init(w) {
            w.data.kick = [new Spring(280, 12), new Spring(280, 12)];
            w.data.twist = [new Spring(210, 9), new Spring(210, 9)];
            w.data.gunFireT = [9, 9];
            w.data.sacPos = [new THREE.Vector3(), new THREE.Vector3()];
            w.data.tip = new THREE.Vector3();
            w.data.tassel = [new Spring(50, 2), new Spring(50, 2)];
            w.data.thrown = null;
            w.data.roots = null;
        },

        altPress(w) {
            if (w.state === 'ready' && w.cooldown <= 0) {
                w.data.thrown = null;
                w.setState('throw');
            }
        },
        altTick(w, dt) {
            if (w.state !== 'throw') {
                if (w.data.thrown) {
                    this.cancel(w);
                }
                return;
            }
            const T = this.throwT;
            if (!w.data.thrown && w.actT >= T.windup) {
                this.launch(w);
            }
            if (w.data.thrown) {
                this.fly(w, dt);
            }
            if (w.actT >= T.windup + T.flight + T.catch) {
                this.cancel(w);
                w.setState('ready');
            }
        },
        dispose(w) {
            w.parts.guns.forEach(gun => {
                if (gun.clone) {
                    gun.clone.parent.remove(gun.clone);
                    gun.clone.userData.disc.geometry.dispose();
                    gun.clone.userData.disc.material.dispose();
                }
            });
            const rt = w.data.roots;
            if (rt) {
                if (rt.mesh.parent) {
                    rt.mesh.parent.remove(rt.mesh);
                }
                rt.mesh.geometry.dispose();
                rt.mesh.material.map.dispose();
                rt.mesh.material.dispose();
                for (const mesh of [rt.fungi.cord, rt.fungi.cap]) {
                    if (mesh.parent) {
                        mesh.parent.remove(mesh);
                    }
                    mesh.geometry.dispose();
                    mesh.material.dispose();
                    mesh.dispose();
                }
                w.data.roots = null;
            }
        },
        // Ends a throw at once: the flying copies and the roots go, the guns are back in hand.
        cancel(w) {
            const th = w.data.thrown;
            if (th) {
                th.guns.forEach(g => {
                    g.clone.visible = false;
                });
            }
            w.data.thrown = null;
            const rt = w.data.roots;
            if (rt) {
                rt.mesh.visible = false;
                rt.fungi.cord.visible = rt.fungi.cap.visible = false;
            }
        },

        cloneOf(w, gun) {
            if (!gun.clone) {
                const c = gun.g.clone(true);
                const lights = [];
                c.traverse(o => {
                    o.layers.set(0);
                    if (o.isLight) {
                        lights.push(o);
                    }
                });
                lights.forEach(l => l.parent.remove(l));
                const disc = new THREE.Mesh(
                    new THREE.RingGeometry(0.03, 0.16, DETAIL.seg(w.lod || DETAIL.guns, 40, 8)),
                    new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
                );
                disc.rotation.y = Math.PI / 2;
                c.add(disc);
                c.userData.disc = disc;
                c.rotation.order = 'YXZ';
                c.visible = false;
                w.fx.worldParent.add(c);
                gun.clone = c;
            }
            return gun.clone;
        },

        // Both guns leave the hands toward the crosshair: each aims at a point `gap[1]` beside the
        // aim point, `reach` ahead (or short of a wall), and its own path is cut short of a wall too.
        launch(w) {
            const K = WeaponKit;
            const T = this.throwT;
            const P = w.parts;
            const eye = w.root.parent || w.root;
            const q = eye.getWorldQuaternion(new THREE.Quaternion());
            const origin = eye.getWorldPosition(new THREE.Vector3());
            const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
            const up = new THREE.Vector3(0, 1, 0);
            // Enemies do not stop the throw (the blades go through to cut them); walls do.
            let D = T.reach;
            const wall = this.wallAt(origin, f, T.reach);
            if (wall >= 0) {
                D = Math.max(T.minReach, wall - T.wall);
            }
            const view = w.view;
            const ratio = view ? Math.tan(K.clamp(view.camera.fov, 1, 170) * Math.PI / 360) / Math.tan(view.cam.fov * Math.PI / 360) : 1;
            const aimAt = origin.clone().addScaledVector(f, D);
            const th = { f, right, up, D, ratio, yaw: Math.atan2(-f.x, -f.z), guns: [] };
            P.guns.forEach((gun, s) => {
                if (!w.fx.worldParent) {
                    return;
                }
                const sign = s ? 1 : -1;
                const start = w.worldPos(gun.g);
                const far = aimAt.clone().addScaledVector(right, sign * T.gap[1]);
                const dir = far.clone().sub(start);
                const len = dir.length();
                const hit = this.wallAt(start, dir.normalize(), len);
                if (hit >= 0) {
                    far.copy(start).addScaledVector(dir, Math.max(0.3, hit - 0.4));
                }
                const clone = this.cloneOf(w, gun);
                clone.visible = true;
                clone.position.copy(start);
                th.guns.push({
                    s, sign, gun, clone, start, far, pos: start.clone(), prev: start.clone(), spin: 0, hitCd: 0, caught: false,
                    seed: Math.random() * 10, roots: this.rootSeeds(sign)
                });
            });
            w.data.thrown = th;
            this.rootMesh(w);
        },

        // Where a thrown gun is `u` seconds into the flight: out along a nearly straight line at
        // close to full speed (down to `keep` of it at the end), a slight rise; then, caught by the
        // roots, it turns back at once (a short jolt past the far point) and is hauled to where the
        // hand holds it now, steadily at first and faster at the end.
        pathAt(th, g, u, hand, out) {
            const K = WeaponKit;
            const T = this.throwT;
            if (u < T.out) {
                const k = u / T.out;
                const a = 2 - T.keep;
                out.copy(g.start).lerp(g.far, k * (a - (a - 1) * k));
                return out.addScaledVector(th.up, T.rise * Math.sin(Math.PI * k));
            }
            const q = K.clamp((u - T.out) / (T.flight - T.out));
            out.copy(g.far).lerp(hand, T.reel * q + (1 - T.reel) * q * q);
            // The jolt as the roots take the weight, and a little whip from the haul.
            if (q < 0.07) {
                out.addScaledVector(th.f, 0.22 * Math.sin(Math.PI * q / 0.07));
            }
            return out.addScaledVector(th.right, g.sign * 0.08 * Math.sin(q * Math.PI * 3) * (1 - q));
        },

        fly(w, dt) {
            const K = WeaponKit;
            const T = this.throwT;
            const th = w.data.thrown;
            const t = w.actT - T.windup;
            const u = K.clamp(t / T.flight);
            const P = w.parts;
            const hand = V1;
            th.guns.forEach(g => {
                if (g.caught) {
                    return;
                }
                w.worldPos(P.model, g.gun.g.userData.rest.p.toArray(), hand);
                this.pathAt(th, g, Math.min(t, T.flight), hand, g.pos);
                const pos = g.pos;
                g.clone.position.copy(pos);

                g.spin += dt * (t < T.out ? T.spin[0] : T.spin[1]) * -g.sign;
                g.clone.rotation.set(0.12 * Math.sin(Math.PI * u), th.yaw + g.spin, g.sign * Math.PI / 2);
                g.clone.scale.setScalar(th.ratio * K.lerp(T.grow[0], T.grow[1], Math.sin(Math.PI * u)));
                g.clone.userData.disc.material.opacity = 0.18 + 0.15 * Math.sin(Math.PI * u) + Math.random() * 0.06;

                const n = w.fx.rate('boom' + g.s, 110, dt);
                const sc = g.clone.scale.x;
                for (let i = 0; i < n; i++) {
                    const a = th.yaw + g.spin + Math.random() * 0.5;
                    const tipPos = pos.clone().add(new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(0.13 * sc));
                    w.fx.emit({ world: true, pos: tipPos, vel: K.sphereDir().multiplyScalar(0.2), life: K.rand(0.3, 0.55), size: K.rand(0.014, 0.024), sizeEnd: 0, color: Math.random() < 0.7 ? this.color : 0xffffff, drag: 2 });
                }

                // The spinning blades cut anything the path passes within `hitRadius` of (an enemy's
                // body, checked as a swept capsule, then a ray so walls still block), or whatever the
                // plain trace along the path meets first.
                g.hitCd -= dt;
                const step = V2.copy(pos).sub(g.prev);
                const len = step.length();
                if (w.trace && len > 0.001 && g.hitCd <= 0) {
                    const dir = step.multiplyScalar(1 / len);
                    let hit = w.trace(g.prev, dir, len + 0.12);
                    const cut = this.bladeSweep(g.prev, pos, T.hitRadius);
                    if (cut && (!hit || cut.s * len <= hit.distance + 0.05)) {
                        hit = cut.hit;
                    }
                    if (hit) {
                        g.hitCd = T.hitCd;
                        for (let i = 0; i < 12; i++) {
                            w.fx.emit({ world: true, pos: hit.point, vel: K.sphereDir().multiplyScalar(1.4).add(hit.normal || new THREE.Vector3()), life: 0.35, size: 0.012, sizeEnd: 0, color: i % 3 ? this.color : 0xffffff, drag: 3, gravity: 3, stretch: 0.02 });
                        }
                        w.reportHits([hit], { mode: 'boomerang', damage: T.damage, side: g.s });
                    }
                }
                g.prev.copy(pos);

                if (t >= T.flight) {
                    g.caught = true;
                    g.clone.visible = false;
                    w.data.kick[g.s].kick(-8);
                    w.data.twist[g.s].kick(g.sign * 6);
                    const p = w.localPos(g.gun.g);
                    for (let i = 0; i < 14; i++) {
                        w.fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.35), life: 0.35, size: 0.004, color: i % 2 ? this.color : 0xffffff, drag: 3 });
                    }
                }
            });
        },

        // ------------------------------------------------------------------ blade hits

        enemyOf(obj) {
            for (let o = obj; o; o = o.parent) {
                if (o.userData.enemy) {
                    return o.userData.enemy;
                }
            }
            return null;
        },

        // Squared distance between segments p1-q1 and p2-q2, and `s`, how far along the first.
        segSeg(p1, q1, p2, q2) {
            const cl = WeaponKit.clamp;
            const d1 = V3.subVectors(q1, p1);
            const d2 = V4.subVectors(q2, p2);
            const r = new THREE.Vector3().subVectors(p1, p2);
            const a = d1.dot(d1);
            const e = d2.dot(d2);
            const f = d2.dot(r);
            let s = 0;
            let t = 0;
            if (a < 1e-9 && e < 1e-9) {
                s = t = 0;
            } else if (a < 1e-9) {
                t = cl(f / e);
            } else {
                const c = d1.dot(r);
                if (e < 1e-9) {
                    s = cl(-c / a);
                } else {
                    const b = d1.dot(d2);
                    const den = a * e - b * b;
                    s = den > 1e-12 ? cl((b * f - c * e) / den) : 0;
                    t = (b * s + f) / e;
                    if (t < 0) {
                        t = 0;
                        s = cl(-c / a);
                    } else if (t > 1) {
                        t = 1;
                        s = cl((b - c) / a);
                    }
                }
            }
            const pa = p1.clone().addScaledVector(d1, s);
            const pb = p2.clone().addScaledVector(d2, t);
            return { s, t, d2: pa.distanceToSquared(pb) };
        },

        // The first live enemy whose body (a vertical segment, its radius wide) the path a -> b comes
        // within `reach` of, confirmed by a ray from the path toward it (walls block, corpses are
        // passed): { hit, s } or null.
        bladeSweep(a, b, reach) {
            const room = typeof Game !== 'undefined' && Game.room;
            if (!room || typeof Enemies === 'undefined') {
                return null;
            }
            const cands = [];
            const q0 = new THREE.Vector3();
            const q1 = new THREE.Vector3();
            for (const e of Enemies.list) {
                if (e.dead) {
                    continue;
                }
                q0.set(e.pos.x, e.pos.y + e.height * 0.1, e.pos.z);
                q1.set(e.pos.x, e.pos.y + e.height * 0.85, e.pos.z);
                const r = e.radius + reach;
                const ss = this.segSeg(a, b, q0, q1);
                if (ss.d2 <= r * r) {
                    cands.push({ e, s: ss.s, t: ss.t });
                }
            }
            cands.sort((x, y) => x.s - y.s);
            const p = new THREE.Vector3();
            const q = new THREE.Vector3();
            const n = new THREE.Vector3();
            for (const c of cands) {
                const e = c.e;
                p.copy(a).lerp(b, c.s);
                q.set(e.pos.x, e.pos.y + e.height * WeaponKit.lerp(0.1, 0.85, c.t), e.pos.z);
                n.copy(q).sub(p);
                const dist = n.length();
                if (dist > 1e-3) {
                    n.multiplyScalar(1 / dist);
                } else {
                    n.copy(b).sub(a).normalize();
                }
                let hit = this.rayEnemy(room, p, n, dist + e.radius + 0.3);
                if (!hit) {
                    const from = q.clone().addScaledVector(n, -(e.radius + 0.35));
                    hit = this.rayEnemy(room, from, n, e.radius + 0.7);
                }
                if (hit) {
                    return { hit, s: c.s };
                }
            }
            return null;
        },

        // Distance to the first thing along a ray that is not an enemy (a wall, floor, crate), or -1.
        wallAt(from, dir, far) {
            const room = typeof Game !== 'undefined' && Game.room;
            if (!room) {
                return -1;
            }
            const ray = Arsenal.ray;
            ray.set(from, dir);
            ray.far = far;
            for (const h of ray.intersectObject(room.group, true)) {
                if (h.object.visible && !this.enemyOf(h.object)) {
                    return h.distance;
                }
            }
            return -1;
        },

        rayEnemy(room, from, dir, far) {
            const ray = Arsenal.ray;
            ray.set(from, dir);
            ray.far = far;
            for (const h of ray.intersectObject(room.group, true)) {
                if (!h.object.visible) {
                    continue;
                }
                const e = this.enemyOf(h.object);
                if (!e) {
                    return null;
                }
                if (!e.dead) {
                    const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
                    return { point: h.point, normal, object: h.object, distance: h.distance };
                }
            }
            return null;
        },

        // Co-op host check of a guest's thrown hits: only enemies within the throw's reach (plus
        // the blades' sweep and some slack) of the thrower, and at most `maxHits` a throw. Normal
        // shots pass unchanged.
        validate(shot, hits, by) {
            if (shot.mode !== 'boomerang') {
                return hits;
            }
            const T = this.throwT;
            const now = performance.now() / 1000;
            const N = by.eagleNet || (by.eagleNet = { at: -99, n: 0 });
            if (now - N.at > T.windup + T.flight + T.catch) {
                N.at = now;
                N.n = 0;
            }
            const out = [];
            for (const h of hits) {
                const e = Enemies.get(h[0]);
                if (!e || e.dead || N.n >= T.maxHits) {
                    continue;
                }
                const max = T.reach + e.radius + T.hitRadius + T.netSlack;
                const dx = e.pos.x - by.eye.x;
                const dz = e.pos.z - by.eye.z;
                if (Math.hypot(dx, dz) > max || Math.hypot((+h[2] || 0) - by.eye.x, (+h[4] || 0) - by.eye.z) > max + 0.5) {
                    continue;
                }
                N.n++;
                out.push(h);
            }
            return out;
        },

        // ------------------------------------------------------------------ roots

        // Random shape of each root for one throw (cosmetic): which way it bows, where it grips the
        // gun, its phase, knots and how late it leaves.
        rootSeeds(sign) {
            const K = WeaponKit;
            const n = this.throwT.roots.perGun;
            return Array.from({ length: n }, (_, k) => ({
                bow: K.sphereDir(new THREE.Vector3()).add(new THREE.Vector3(sign * 0.6, 0.3 + k * 0.15, 0)).normalize(),
                bend: K.rand(0.6, 1.2),
                phase: Math.random() * Math.PI * 2,
                knot: Math.random() * 10,
                wrap: k / n * Math.PI * 2 + Math.random() * 0.6,
                delay: k * 0.025 + Math.random() * 0.03,
                sprouts: this.sproutSeeds()
            }));
        },

        // Where the fungi sit on one root: along it (v), round it (ang), how big, and which kind.
        // The first ones of each kind are the ones kept at lower detail.
        sproutSeeds() {
            const K = WeaponKit;
            const F = this.throwT.fungi;
            const out = [];
            for (const [kind, counts] of [['cord', F.cordyceps], ['cap', F.caps]]) {
                for (let i = 0; i < counts[0]; i++) {
                    out.push({ kind, i, v: K.rand(0.06, 0.95), ang: Math.random() * Math.PI * 2, size: K.rand(F.size[0], F.size[1]), sway: Math.random() * 6 });
                }
            }
            return out;
        },

        // The roots: one world-space mesh for every root of both guns, each a camera-facing tapered
        // ribbon with a bark texture and a glowing teal vein (unlit, opaque), so one draw call.
        // Points per root follow the gun's detail level (a teammate's copy uses DETAIL.remoteGuns);
        // low detail has two roots a gun.
        rootMesh(w) {
            const d = w.data;
            if (d.roots) {
                if (!d.roots.mesh.parent && w.fx.worldParent) {
                    for (const mesh of [d.roots.mesh, d.roots.fungi.cord, d.roots.fungi.cap]) {
                        w.fx.worldParent.add(mesh);
                    }
                }
                return d.roots;
            }
            if (!w.fx.worldParent) {
                return null;
            }
            const lod = w.lod || DETAIL.guns;
            const R = this.throwT.roots;
            const per = lod === 'potato' ? Math.min(2, R.perGun) : R.perGun;
            const N = DETAIL.seg(lod, R.seg, 6);
            const S = 2 * per;
            const V = S * N * 2;
            const geo = new THREE.BufferGeometry();
            const pos = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
            const col = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
            pos.setUsage(THREE.DynamicDrawUsage);
            col.setUsage(THREE.DynamicDrawUsage);
            const uv = new Float32Array(V * 2);
            const idx = [];
            for (let s = 0; s < S; s++) {
                for (let i = 0; i < N; i++) {
                    const v = (s * N + i) * 2;
                    uv.set([0, i / (N - 1), 1, i / (N - 1)], v * 2);
                    if (i < N - 1) {
                        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
                    }
                }
            }
            geo.setAttribute('position', pos);
            geo.setAttribute('color', col);
            geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            geo.setIndex(idx);
            const mat = new THREE.MeshBasicMaterial({ map: this.rootTexture(), vertexColors: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
            mesh.visible = false;
            mesh.name = 'roots';
            w.fx.worldParent.add(mesh);
            const lv = lod === 'potato' ? 2 : lod === 'medium' ? 1 : 0;
            const F = this.throwT.fungi;
            const fungi = {
                cord: this.fungusMesh(w, this.cordycepsGeo(lod), S * F.cordyceps[lv]),
                cap: this.fungusMesh(w, this.capGeo(lod), S * F.caps[lv]),
                limit: { cord: F.cordyceps[lv], cap: F.caps[lv] },
                m: new THREE.Matrix4(), q: new THREE.Quaternion(), sc: new THREE.Vector3(), p: new THREE.Vector3(),
                t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0)
            };
            d.roots = {
                mesh, N, per, fungi, pts: Array.from({ length: N }, () => new THREE.Vector3()),
                cam: new THREE.Vector3(), tan: new THREE.Vector3(), off: new THREE.Vector3(),
                side: new THREE.Vector3(), base: new THREE.Vector3(), tip: new THREE.Vector3(), aim: new THREE.Vector3()
            };
            return d.roots;
        },

        // Joins geometries into one non-indexed geometry, each painted one colour per vertex by `paint`
        // (a function of the vertex position) so a fungus is one instanced mesh with one material.
        paintMerge(parts) {
            const pos = [];
            const nor = [];
            const col = [];
            const c = new THREE.Color();
            const v = new THREE.Vector3();
            for (const [geo, paint] of parts) {
                const g = geo.index ? geo.toNonIndexed() : geo;
                g.computeVertexNormals();
                const P = g.attributes.position;
                const Nn = g.attributes.normal;
                for (let i = 0; i < P.count; i++) {
                    v.fromBufferAttribute(P, i);
                    pos.push(v.x, v.y, v.z);
                    nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i));
                    paint(v, c);
                    col.push(c.r, c.g, c.b);
                }
                geo.dispose();
                g.dispose();
            }
            const out = new THREE.BufferGeometry();
            out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
            out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            return out;
        },

        // A cordyceps: a thin tapering stalk (dark at the root, orange up top) and an elongated
        // bright orange club with a pale tip. About 6 cm tall at size 1, base at the origin, along +y.
        cordycepsGeo(lod) {
            const rs = DETAIL.seg(lod, 5, 4);
            const stalk = new THREE.CylinderGeometry(0.0022, 0.0038, 0.05, rs, 2, true);
            stalk.translate(0, 0.025, 0);
            const club = new THREE.SphereGeometry(0.0055, rs, DETAIL.seg(lod, 4, 3));
            club.scale(1, 2.3, 1);
            club.translate(0, 0.058, 0);
            const base = new THREE.Color(0x4a2a12);
            const orange = new THREE.Color(0xe8702a);
            const bright = new THREE.Color(0xff9a3c);
            const tip = new THREE.Color(0xffe2b0);
            return this.paintMerge([
                [stalk, (v, c) => c.copy(base).lerp(orange, Math.min(1, v.y / 0.05))],
                [club, (v, c) => c.copy(bright).lerp(tip, Math.max(0, (v.y - 0.064) / 0.007))]
            ]);
        },

        // A little chanterelle: a cream stem flaring into an orange funnel cap, base at the origin.
        capGeo(lod) {
            const pts = [[0.0016, 0], [0.0024, 0.01], [0.009, 0.016], [0.0145, 0.0182], [0.0125, 0.0155]];
            const geo = new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), DETAIL.seg(lod, 8, 5));
            const stem = new THREE.Color(0xf2e3c3);
            const cap = new THREE.Color(0xeaa13a);
            return this.paintMerge([[geo, (v, c) => c.copy(stem).lerp(cap, Math.min(1, Math.max(0, (v.y - 0.011) / 0.005)))]]);
        },

        fungusMesh(w, geo, max) {
            const mat = DETAIL.litMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
            const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, max));
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.visible = false;
            mesh.count = 0;
            mesh.name = 'fungi';
            w.fx.worldParent.add(mesh);
            return mesh;
        },

        // Across a root: dark bark edges, lighter bark toward the middle, a thin glowing teal vein
        // down the centre. Along it, faint bark rings.
        rootTexture() {
            const W = 32;
            const H = 32;
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const ctx = cv.getContext('2d');
            const img = ctx.createImageData(W, H);
            const edge = new THREE.Color(0x24160b);
            const mid = new THREE.Color(0x7a4f2a);
            const vein = new THREE.Color(this.color);
            const c = new THREE.Color();
            for (let y = 0; y < H; y++) {
                const ring = 0.85 + 0.15 * Math.sin(y / H * Math.PI * 12);
                for (let x = 0; x < W; x++) {
                    const u = Math.abs((x + 0.5) / W * 2 - 1);
                    c.copy(edge).lerp(mid, Math.pow(1 - u, 0.7)).multiplyScalar(ring);
                    c.lerp(vein, Math.exp(-Math.pow(u / 0.14, 2)) * 0.9);
                    const i = (y * W + x) * 4;
                    img.data[i] = c.r * 255;
                    img.data[i + 1] = c.g * 255;
                    img.data[i + 2] = c.b * 255;
                    img.data[i + 3] = 255;
                }
            }
            ctx.putImageData(img, 0, 0);
            const t = new THREE.CanvasTexture(cv);
            t.wrapT = THREE.RepeatWrapping;
            return t;
        },

        // Where root k of gun s comes out of the player: the palm, the wrist, the sleeve, the body
        // (below the eye, on that side). Hands are in the gun pass, so through `w.worldPos`.
        rootBase(w, s, k, out) {
            const H = w.hands;
            const hand = H && (s ? H.right : H.left);
            const sign = s ? 1 : -1;
            if (k < 3 && hand && hand.root.visible) {
                const sock = k === 0 ? hand.sockets.palm : hand.sockets.wrist;
                return w.worldPos(sock, k === 2 ? [0, 0.012, 0.11] : null, out);
            }
            const eye = w.root.parent || w.root;
            out.set(sign * (0.1 + (k % 2) * 0.06), k === 3 ? -0.42 : -0.3, -0.12);
            return eye.localToWorld(out);
        },

        // Each frame of a throw: the roots lash out of the player just before a gun reaches the far
        // point (bowing, whipping), catch it there, writhe as they haul it back, and pull into the
        // hand at the catch. Tapered and knotted, with a teal vein that flares when they grab.
        updateRoots(w, dt) {
            const th = w.data.thrown;
            const rt = w.data.roots;
            if (!rt) {
                return;
            }
            if (!th) {
                rt.mesh.visible = false;
                rt.fungi.cord.visible = rt.fungi.cap.visible = false;
                return;
            }
            const K = WeaponKit;
            const T = this.throwT;
            const R = T.roots;
            const u = w.actT - T.windup;
            const N = rt.N;
            const P = rt.mesh.geometry.attributes.position.array;
            const Cl = rt.mesh.geometry.attributes.color.array;
            rt.cam.setFromMatrixPosition(camera.matrixWorld);
            let any = false;
            const Fu = rt.fungi;
            const count = { cord: 0, cap: 0 };
            for (let s = 0; s < 2; s++) {
                const g = th.guns.find(x => x.s === s);
                for (let k = 0; k < rt.per; k++) {
                    const strip = s * rt.per + k;
                    const r = g && g.roots[k];
                    const start = T.out - R.shoot + (r ? r.delay : 0);
                    const reach = g && !g.caught ? K.ease.outCubic(K.seg(u, start, T.out)) : 0;
                    const fade = 1 - K.seg(u, T.flight - R.retract, T.flight);
                    const live = reach > 0 && fade > 0;
                    const B = this.rootBase(w, s, k, rt.base);
                    const E = rt.aim;
                    if (live) {
                        any = true;
                        // Where it grips the gun: round its middle, each root from its own side.
                        const tip = rt.tip.copy(g.clone.position);
                        tip.x += Math.cos(r.wrap + u * 6) * 0.05;
                        tip.y += Math.sin(r.wrap + u * 6) * 0.05;
                        E.copy(B).lerp(tip, reach);
                    } else {
                        E.copy(B);
                    }
                    const len = B.distanceTo(E);
                    const caught = K.seg(u, T.out, T.out + 0.12);
                    // Lashing while they shoot out, a hard tightening on the catch, writhing as they haul.
                    const lash = Math.min(R.maxBend * 0.6, R.lash * len) * ((1 - caught) * 1.4 + 0.35);
                    const bow = Math.min(R.maxBend, R.bow * len) * (r ? r.bend : 1) * (1 - 0.7 * caught);
                    const side = rt.side.copy(E).sub(B).cross(r ? r.bow : V2.set(0, 1, 0));
                    if (side.lengthSq() < 1e-8) {
                        side.set(1, 0, 0);
                    }
                    side.normalize();
                    for (let i = 0; i < N; i++) {
                        const v = i / (N - 1);
                        const p = rt.pts[i].copy(B).lerp(E, v);
                        if (r) {
                            const env = Math.sin(Math.PI * v);
                            p.addScaledVector(r.bow, bow * env);
                            p.addScaledVector(side, lash * env * Math.sin(v * 9 - u * 26 + r.phase));
                            // Kinks, fixed per root.
                            p.addScaledVector(r.bow, Math.min(0.1, 0.025 * len) * env * Math.sin(v * 23 + r.knot));
                        }
                    }
                    if (live && r) {
                        this.placeFungi(rt, r, u, start, fade, count, len);
                    }
                    const flare = 1 + 1.2 * K.hump(u, T.out - 0.02, T.out + 0.25);
                    for (let i = 0; i < N; i++) {
                        const v = (strip * N + i) * 2;
                        const c = rt.pts[i];
                        const t = i / (N - 1);
                        const knot = r ? 1 + 0.3 * Math.max(0, Math.sin(t * 13 + r.knot)) ** 6 + 0.12 * Math.sin(t * 31 + r.knot) : 1;
                        const width = live ? K.lerp(R.width[0], R.width[1], t) * knot * fade * (k === 3 ? 1.2 : 1) : 0;
                        const j0 = Math.max(i - 1, 0);
                        const j1 = Math.min(i + 1, N - 1);
                        rt.tan.copy(rt.pts[j1]).sub(rt.pts[j0]);
                        rt.off.copy(c).sub(rt.cam).cross(rt.tan);
                        const l = rt.off.length();
                        rt.off.multiplyScalar(l > 1e-8 ? width * 0.5 / l : 0);
                        P[v * 3] = c.x + rt.off.x;
                        P[v * 3 + 1] = c.y + rt.off.y;
                        P[v * 3 + 2] = c.z + rt.off.z;
                        P[v * 3 + 3] = c.x - rt.off.x;
                        P[v * 3 + 4] = c.y - rt.off.y;
                        P[v * 3 + 5] = c.z - rt.off.z;
                        const bright = live ? flare : 0;
                        for (let m = 0; m < 6; m++) {
                            Cl[v * 3 + m] = bright;
                        }
                    }
                    if (live && w.fx.rate('root' + strip, 10, dt)) {
                        const p = rt.pts[Math.floor(Math.random() * N)];
                        const glow = Math.random() < 0.6;
                        w.fx.emit({ world: true, pos: p, vel: K.sphereDir(V3).multiplyScalar(0.15), life: K.rand(0.3, 0.6), size: 0.006, sizeEnd: 0, color: glow ? this.color : 0x8a5a30, additive: glow, drag: 2, gravity: 1 });
                    }
                }
            }
            rt.mesh.visible = any;
            for (const kind of ['cord', 'cap']) {
                const mesh = Fu[kind];
                mesh.count = count[kind];
                mesh.visible = count[kind] > 0;
                if (count[kind]) {
                    mesh.instanceMatrix.needsUpdate = true;
                }
            }
            rt.mesh.geometry.attributes.position.needsUpdate = true;
            rt.mesh.geometry.attributes.color.needsUpdate = true;
        },

        // The fungi on one root (its points are in `rt.pts`): each pops out (overshooting) a moment
        // after the root passes, standing out of the bark and leaning toward the tip, swaying, and
        // shrinks away with the root at the catch.
        placeFungi(rt, r, u, start, fade, count, len) {
            const K = WeaponKit;
            const F = this.throwT.fungi;
            const R = this.throwT.roots;
            const Fu = rt.fungi;
            const N = rt.N;
            for (const sp of r.sprouts) {
                if (sp.i >= Fu.limit[sp.kind]) {
                    continue;
                }
                const at = start + 0.04 + sp.v * 0.16;
                const grow = K.ease.outBack(K.seg(u, at, at + F.grow)) * fade;
                if (grow <= 0.01) {
                    continue;
                }
                const x = sp.v * (N - 1);
                const i = Math.min(N - 2, Math.floor(x));
                const p = Fu.p.copy(rt.pts[i]).lerp(rt.pts[i + 1], x - i);
                const t = Fu.t.copy(rt.pts[i + 1]).sub(rt.pts[i]).normalize();
                // Round the root: a direction square to it, turned by the sprout's angle.
                const n = Fu.n.copy(r.bow).addScaledVector(t, -r.bow.dot(t)).normalize();
                const b = Fu.b.crossVectors(t, n);
                n.multiplyScalar(Math.cos(sp.ang)).addScaledVector(b, Math.sin(sp.ang));
                p.addScaledVector(n, K.lerp(R.width[0], R.width[1], sp.v) * 0.35);
                n.addScaledVector(t, 0.45 + 0.15 * Math.sin(u * 7 + sp.sway)).normalize();
                Fu.q.setFromUnitVectors(Fu.up, n);
                const size = sp.size * grow * Math.min(F.maxScale, 0.8 + F.perMetre * len);
                Fu.m.compose(p, Fu.q, Fu.sc.set(size, size, size));
                Fu[sp.kind].setMatrixAt(count[sp.kind]++, Fu.m);
            }
        },

        // ------------------------------------------------------------------ firing

        side(w) {
            return w.ammo % 2 === 0 ? 1 : 0;
        },
        muzzle(w, side) {
            return w.parts.guns[side].muzzle;
        },
        onFire(w, side) {
            w.data.kick[side].kick(22);
            w.data.twist[side].kick((side ? -1 : 1) * 8);
            w.data.gunFireT[side] = 0;
        },
        share(w, side, ammo = w.ammo) {
            return side ? Math.floor(ammo / 2) : Math.ceil(ammo / 2);
        },

        tl(s) {
            const d = s * 0.08;
            return {
                d,
                growA: 0.62 + d * 0.5,
                growB: 1.42 + d * 0.5,
                wither: [1.86, 2.12],
                sacA: 1.15 + d * 0.5,
                sacB: 1.75 + d * 0.5,
                // The cylinder swings out after the twirl, the husks fall, it snaps shut at `rack`.
                open: [0.46 + d, 0.6 + d],
                eject: 0.66 + d,
                rack: 2.14 + d
            };
        },

        pose(w, dt) {
            const P = w.parts;
            const K = WeaponKit;
            const r = w.reloadT;
            const half = w.stats.mag / 2;
            P.m.vine.emissiveIntensity = 0.45 + Math.sin(w.time * 5) * 0.15 + (r >= 0 ? K.hump(r, 1.5, 1.85) * 2.2 : 0);
            P.m.bud.emissiveIntensity = 1 + Math.sin(w.time * 7) * 0.3;

            P.guns.forEach((gun, s) => {
                const kick = w.data.kick[s];
                const twist = w.data.twist[s];
                kick.update(dt);
                twist.update(dt);
                w.data.gunFireT[s] += dt;
                const ft = w.data.gunFireT[s];
                const g = gun.g;
                const sign = s ? 1 : -1;
                const share = this.share(w, s);
                gun.twirl = 0;
                gun.open = 0;
                gun.thumb = 0;

                // Each shot: a big muzzle flip, a shove back into the hand and a wrist twist.
                g.rotation.x += kick.x * 0.24;
                g.position.z += kick.x * 0.016;
                g.position.y += kick.x * 0.006;
                g.rotation.z += twist.x * 0.035;
                g.rotation.y += twist.x * 0.012;
                gun.tassel.rotation.z += w.dangle(w.data.tassel[s], dt, 1.6) * 0.8;
                gun.tassel.rotation.x += Math.sin(w.time * 2 + s) * 0.08;

                if (w.state === 'throw') {
                    const T = this.throwT;
                    const t = w.actT;
                    const wind = K.e('inOutCubic', t, 0, T.windup);
                    const flying = t >= T.windup && t < T.windup + T.flight;
                    g.visible = !flying;
                    if (t < T.windup) {
                        g.position.z += wind * 0.07;
                        g.position.x += sign * wind * 0.04;
                        g.rotation.z += sign * wind * Math.PI / 2;
                        g.rotation.y -= sign * wind * 0.6;
                        g.rotation.x += wind * 0.15;
                    } else if (!flying) {
                        const ct = t - T.windup - T.flight;
                        const c = 1 - K.e('outCubic', ct, 0, T.catch);
                        g.rotation.z += sign * c * Math.PI / 2;
                        g.rotation.y += -sign * c * 2.5;
                        g.position.z += c * 0.06;
                        g.position.y -= c * 0.02;
                    }
                }

                // The hammer snaps and the cylinder turns one chamber after each of this gun's shots.
                if (ft < 0.25) {
                    gun.hammer.rotation.x -= (1 - K.e('outBack', ft, 0.03, 0.2)) * 0.9;
                }
                gun.trigger.rotation.x += K.hump(ft, 0, 0.1) * 0.4;
                const fired = half - share;
                const turn = K.e('inOutCubic', ft, 0.015, 0.08);
                gun.cyl.rotation.z = fired > 0 ? -(fired - 1 + turn) * STEP : 0;
                gun.port.emissiveIntensity = 0.15 + 1.3 * share / half + Math.sin(w.time * 4 + s) * 0.1;
                gun.core.emissiveIntensity = 0.3 + 1.1 * share / half + Math.sin(w.time * 3 + s) * 0.15;
                gun.coreMesh.scale.multiplyScalar(0.35 + 0.65 * share / half);
                gun.coreMesh.rotation.y += w.time * 0.8;

                const it = w.inspectT;
                if (it >= 0) {
                    const d = s * 0.1;
                    const env = K.e('inOutCubic', it, 0, 0.45) * (1 - K.e('inOutCubic', it, 2.65, 3.2));
                    g.position.x -= sign * env * 0.06;
                    g.position.y += env * 0.07;
                    g.position.z += env * 0.03;
                    const flip = K.e('inOutCubic', it, 1.3 + d, 1.95 + d);
                    g.rotation.y += -sign * env * 1.0 * (1 - 2 * flip);
                    gun.twirl += K.e('inOutCubic', it, 0.45 + d, 1.15 + d) * Math.PI * 4;
                    g.rotation.x += gun.twirl;
                    g.rotation.z += sign * env * 0.1;
                    // A peek: the cylinder flicks out and snaps back.
                    gun.open = Math.max(gun.open, K.hump(it, 2.05 + d, 2.45 + d) * 0.45);
                    gun.port.emissiveIntensity += K.hump(it, 2.05 + d, 2.45 + d) * 2.5;
                }

                if (r < 0) {
                    this.swing(gun, sign);
                    gun.vines.forEach(v => {
                        v.visible = false;
                    });
                    gun.extras.forEach(x => {
                        if (x.kind === 'branch') {
                            x.mesh.visible = false;
                        }
                    });
                    return;
                }

                const T = this.tl(s);
                const spin = K.e('inOutCubic', r, T.d, 0.45 + T.d);
                g.rotation.x += spin * Math.PI * 2;
                gun.twirl += spin * Math.PI * 2;
                g.position.y += K.hump(r, T.d, 0.45 + T.d) * 0.04;

                // The cylinder swings out after the twirl (the thumb pushes it), and snaps shut at
                // the rack.
                gun.open = Math.max(gun.open, K.e('outBack', r, T.open[0], T.open[1]) * (1 - K.e('inCubic', r, T.rack - 0.07, T.rack)));
                gun.thumb = K.hump(r, T.open[0] - 0.06, T.open[1] + 0.05);
                this.swing(gun, sign);

                const growSac = K.seg(r, T.sacA, T.sacB);
                if (r > 0.24 + T.d) {
                    gun.sac.visible = growSac > 0;
                    gun.sac.scale.multiplyScalar(Math.max(0.001, K.ease.outElastic(growSac)));
                    const from = 0.35 + 0.65 * this.share(w, s, w.reloadFrom) / half;
                    gun.coreMesh.scale.copy(gun.coreMesh.userData.rest.s).multiplyScalar(Math.max(0.35, K.lerp(from, 1, growSac)));
                    gun.core.emissiveIntensity = 0.6 + growSac * 1.2 + K.hump(r, 1.6, 1.95) * 2.2;
                }

                const show = K.e('inOutCubic', r, 0.42, 0.75) * (1 - K.e('inOutCubic', r, 1.95, 2.3));
                g.position.x -= sign * show * 0.075;
                g.position.y += show * 0.085;
                g.position.z += show * 0.03;
                g.rotation.y -= sign * show * 1.2;
                g.rotation.x += show * 0.1 + Math.sin(r * 3 + s) * 0.03 * show;

                const vg = K.e('inOutSine', r, T.growA, T.growB);
                const wither = K.e('inCubic', r, T.wither[0], T.wither[1]);
                gun.vines.forEach(v => WeaponKit.grow(v, vg * (1 - wither)));
                const span = T.growB - T.growA;
                gun.extras.forEach(x => {
                    const reach = T.growA + x.u * span;
                    const out = 1 - K.e('inCubic', r, T.wither[0] - 0.08, T.wither[0] + 0.06);
                    if (x.kind === 'branch') {
                        WeaponKit.grow(x.mesh, K.seg(r, reach, reach + 0.15) * out);
                    } else if (x.kind === 'bud') {
                        const p = K.seg(r, reach + 0.12, reach + 0.5);
                        x.mesh.visible = p > 0 && out > 0;
                        x.mesh.scale.multiplyScalar(Math.max(0.001, K.ease.outElastic(p) * out));
                    } else {
                        const p = K.seg(r, reach, reach + 0.2);
                        x.mesh.visible = p > 0 && out > 0;
                        x.mesh.scale.multiplyScalar(Math.max(0.001, K.ease.outBack(p) * out * (1 + K.hump(r, 1.5, 1.85) * 0.8)));
                    }
                });

                gun.hammer.rotation.x += K.hump(r, T.rack - 0.02, T.rack + 0.18) * 0.7;
                g.rotation.x += K.hump(r, T.rack, T.rack + 0.16) * 0.07;
            });
        },

        // Swings the crane out by `gun.open` (0..1): the cylinder tips out toward the middle of the
        // view and down a little.
        swing(gun, sign) {
            gun.crane.rotation.z += sign * gun.open * 1.4;
        },

        handPose(w, H) {
            const K = WeaponKit;
            const T = this.throwT;
            const it = w.inspectT;
            const r = w.reloadT;
            w.parts.guns.forEach((gun, s) => {
                const hand = s ? H.right : H.left;
                const g = gun.g;
                gun.hold.position.copy(g.position);
                gun.hold.rotation.copy(g.rotation);
                gun.hold.rotation.x -= gun.twirl;
                let open = 0;
                if (it >= 0) {
                    open = K.hump(it, 0.45 + s * 0.1, 1.15 + s * 0.1);
                }
                if (r >= 0) {
                    const d = this.tl(s).d;
                    open = Math.max(open, K.hump(r, d, 0.45 + d));
                }
                if (w.state === 'throw') {
                    const t = w.actT;
                    const out = K.e('outCubic', t, T.windup - 0.02, T.windup + 0.14) * (1 - K.e('inOutCubic', t, T.windup + T.flight - 0.3, T.windup + T.flight));
                    hand.to(this.throwPose[s], out);
                    open = Math.max(open, out);
                    // The hands thrust out as the roots lash from them, clench as they catch the gun,
                    // and haul back while it is reeled in.
                    const u = t - T.windup;
                    hand.nudge(0, 0, -0.08 * K.hump(u, T.out - T.roots.shoot - 0.05, T.out + 0.08) + 0.06 * K.hump(u, T.out, T.flight));
                    open *= 1 - 0.85 * K.hump(u, T.out - 0.02, T.flight - 0.1);
                }
                hand.squeeze(-0.7 * open);
                // The thumb straightens to push the cylinder out.
                hand.bend('thumb', -0.6 * gun.thumb);
            });
        },

        effects(w, dt) {
            const P = w.parts;
            const fx = w.fx;
            const K = WeaponKit;
            const glow = this.color;

            if (w.atFire(0)) {
                const gun = P.guns[w.lastSide];
                const o = w.worldPos(gun.muzzle);
                const d = w.worldDir(gun.muzzle);
                for (let i = 0; i < 9; i++) {
                    fx.emit({ world: true, pos: o, vel: K.cone(d, 0.4).multiplyScalar(K.rand(1.2, 3)), life: K.rand(0.2, 0.4), size: 0.005, sizeEnd: 0.001, color: i % 3 ? glow : 0xffe1a0, drag: 3, stretch: 0.008 });
                }
                fx.emit({ world: true, shape: 'ring', pos: o, dir: d, vel: d.clone().multiplyScalar(0.8), life: 0.12, size: 0.012, sizeEnd: 0.05, color: glow, opacity: 0.7 });
                fx.emit({ world: true, pos: o, vel: d.clone().multiplyScalar(0.6), life: 0.45, size: 0.01, sizeEnd: 0.035, color: 0xd6e8d8, additive: false, opacity: 0.3, drag: 3, gravity: -0.2 });
            }

            const th = w.data.thrown;
            if (w.state === 'throw' && th) {
                const T = this.throwT;
                // The roots burst out of the player: bark and spores at their bases.
                if (w.atAct(T.windup + T.out - T.roots.shoot)) {
                    for (let s = 0; s < 2; s++) {
                        for (let k = 0; k < T.roots.perGun; k++) {
                            const b = this.rootBase(w, s, k, V4);
                            for (let i = 0; i < 4; i++) {
                                fx.emit({ world: true, pos: b, vel: K.sphereDir().multiplyScalar(K.rand(0.4, 1.2)), life: K.rand(0.3, 0.6), size: 0.006, sizeEnd: 0.002, color: i % 2 ? glow : 0x6a4529, additive: i % 2 === 1, drag: 3, gravity: 3 });
                            }
                        }
                    }
                }
                // They catch the guns: a yank through the rig and a burst at each gun.
                if (w.atAct(T.windup + T.out)) {
                    if (!w.remote) {
                        w.recoilZ.kick(-0.9);
                        w.recoilX.kick(-0.4);
                    }
                    for (const g of th.guns) {
                        for (let i = 0; i < 14; i++) {
                            fx.emit({ world: true, pos: g.clone.position, vel: K.sphereDir().multiplyScalar(K.rand(0.8, 2)), life: K.rand(0.2, 0.45), size: 0.008, sizeEnd: 0, color: i % 3 ? glow : 0x8a5a30, additive: i % 3 !== 0, drag: 3, stretch: 0.02 });
                        }
                    }
                }
            }
            this.updateRoots(w, dt);

            const r = w.reloadT;
            if (r < 0) {
                return;
            }
            const tip = w.data.tip;
            const half = w.stats.mag / 2;
            P.guns.forEach((gun, s) => {
                const T = this.tl(s);
                const sign = s ? 1 : -1;
                const sp = w.localPos(gun.sac, null, w.data.sacPos[s]);
                if (w.atAct(0.24 + T.d)) {
                    fx.emit({ pos: sp, vel: new THREE.Vector3(sign * 0.9, 0.7, 0.4), life: 0.9, size: 0.016, sizeEnd: 0.012, color: 0x52786a, additive: false, gravity: 5, drag: 0.3 });
                    for (let i = 0; i < 8; i++) {
                        fx.emit({ pos: sp, vel: K.sphereDir().multiplyScalar(0.3).add(new THREE.Vector3(sign * 0.4, 0.3, 0)), life: 0.5, size: 0.004, color: glow, drag: 2 });
                    }
                }
                if (w.atAct(T.eject)) {
                    // Spent spore husks drop out of the fired chambers, with a puff of old spores.
                    const spent = half - this.share(w, s, w.reloadFrom);
                    for (let k = 0; k < spent; k++) {
                        const p = w.localPos(gun.chambers[k]);
                        fx.emit({ pos: p, vel: new THREE.Vector3(-sign * K.rand(0.2, 0.6), K.rand(-0.1, 0.3), K.rand(0, 0.4)), life: 0.9, size: 0.0045, sizeEnd: 0.0035, color: Math.random() < 0.5 ? 0x8a5a2a : 0xb07a3a, additive: false, gravity: 6, drag: 0.5 });
                        fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.1), life: 0.5, size: 0.004, sizeEnd: 0.012, color: 0xc9b48a, additive: false, opacity: 0.35, drag: 2 });
                    }
                }
                if (r > T.growA && r < T.growB + 0.05) {
                    const vg = K.e('inOutSine', r, T.growA, T.growB);
                    gun.vines.forEach((v, k) => {
                        const n = fx.rate('tip' + s + k, 50, dt);
                        if (!n) {
                            return;
                        }
                        v.userData.tube.curve.getPointAt(Math.min(1, vg), tip);
                        const p = w.localPos(gun.g, [tip.x, tip.y, tip.z]);
                        for (let i = 0; i < n; i++) {
                            fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.12), life: 0.35, size: 0.0035, sizeEnd: 0, color: i % 2 ? glow : 0xffffff, drag: 2 });
                        }
                    });
                }
                if (r > T.sacA - 0.3 && r < T.sacB) {
                    const n = fx.rate('mote' + s, 40, dt);
                    for (let i = 0; i < n; i++) {
                        const pos = sp.clone().addScaledVector(K.sphereDir(), K.rand(0.05, 0.1));
                        fx.emit({ pos, vel: K.sphereDir().multiplyScalar(0.05), attract: sp, pull: 2.2, swirl: 2.5 * sign, life: 0.9, size: K.rand(0.003, 0.005), sizeEnd: 0.001, color: glow, drag: 1.5, fadeIn: 0.12 });
                    }
                }
                if (w.atAct(1.62 + T.d * 0.5)) {
                    gun.vines.forEach(v => {
                        for (let i = 0; i < 10; i++) {
                            v.userData.tube.curve.getPointAt(Math.random(), tip);
                            fx.emit({ pos: w.localPos(gun.g, [tip.x, tip.y, tip.z]), vel: K.sphereDir().multiplyScalar(0.25), life: 0.4, size: 0.004, color: i % 2 ? glow : 0xffffff, drag: 3 });
                        }
                    });
                }
                if (r > T.wither[0] && r < T.wither[1]) {
                    const n = fx.rate('wither' + s, 45, dt);
                    for (let i = 0; i < n; i++) {
                        gun.vines[i % 2].userData.tube.curve.getPointAt(Math.random() * (1 - K.seg(r, T.wither[0], T.wither[1])), tip);
                        fx.emit({ pos: w.localPos(gun.g, [tip.x, tip.y, tip.z]), vel: K.sphereDir().multiplyScalar(0.08), life: 0.6, size: 0.003, sizeEnd: 0.002, color: 0xa7c9b8, additive: false, opacity: 0.8, gravity: 1.2, drag: 1.5 });
                    }
                }
                if (w.atAct(T.rack + 0.02)) {
                    // The cylinder snaps shut.
                    w.data.kick[s].kick(-4);
                    const p = w.localPos(gun.cyl, [0, 0, -CL * 0.5]);
                    for (let i = 0; i < 6; i++) {
                        fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.35), life: 0.25, size: 0.003, color: glow, drag: 3 });
                    }
                }
            });
        }
    });
})();
