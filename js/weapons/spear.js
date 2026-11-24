// Rootbound Spear: melee poke along the crosshair. Hold RMB to charge a throw; the thrown spear
// sticks, dissolves into spores, and a new one regrows in the hand from tendrils and mycelium.
// The regrown spear is infused: its next `lifesteal.hits` pokes that hit an enemy heal the wielder.
Weapons.register('spear', {
    name: 'Rootbound Spear',
    altName: 'Throw',
    melee: true,
    noise: 9,
    offset: [0.29, -0.2, -0.2],
    sprintYaw: 0.3,
    stats: {
        mag: 0, rate: 1.6, auto: true, damage: 55, pellets: 1, spread: 0, range: 4.2,
        hitDelay: 0.1, drawTime: 0.5,
        kick: { back: 0, up: 0.01, roll: 0.012 }
    },
    // Highest damage per mode, also used by the co-op host to clamp guest shots.
    modeDamage: { throw: 95 },
    // chargeTime: seconds to full power, minCharge: power of a tap, speed / minDamage: at 0 and full
    // power (max damage is modeDamage.throw), life: seconds in flight before it starts to dissolve,
    // dissolve: seconds to dissolve, cooldown: seconds from one throw to the next, throwTime and
    // regrow: length of the throw and regrow animations.
    throwCfg: {
        chargeTime: 0.6, minCharge: 0.3, speed: [18, 36], minDamage: 40, gravity: 5,
        life: 1.0, dissolve: 0.6, cooldown: 3.5, throwTime: 0.28, regrow: 1.6, scale: 1.25
    },
    // hits: lifesteal pokes a regrown spear carries, heal: HP per hit.
    lifesteal: { hits: 3, heal: 5 },
    color: 0xff8f84,
    inspect: { time: 3.6 },
    hands: { left: 'front', right: 'rear' },
    // Left hand pointing ahead while the right hand throws (rig space).
    LEFT_AIM: { p: [-0.37, 0.03, -0.24], fingers: [0.25, 0.35, -1], back: [-0.35, 0.9, 0.25], curl: 0.3 },

    R: 0.0155,
    BLADE: [[0.011, 0], [0.017, 0.013], [0.038, 0.054], [0.05, 0.1], [0.048, 0.14], [0.037, 0.19], [0.021, 0.245], [0.0004, 0.3]],
    BLADE_Z: -0.79,
    BLADE_FLAT: 0.2,

    // Blade half width at a distance `d` from its base, from the lathe profile.
    bladeR(d) {
        const P = this.BLADE;
        for (let i = 1; i < P.length; i++) {
            if (d <= P[i][1]) {
                const t = (d - P[i - 1][1]) / (P[i][1] - P[i - 1][1]);
                return WeaponKit.lerp(P[i - 1][0], P[i][0], t);
            }
        }
        return 0;
    },

    build(b) {
        const K = WeaponKit;
        const R = this.R;
        const m = {
            wood: b.mat('wood', { color: 0xb59c7e, roughness: 0.85, emissive: 0xff6f63, emissiveIntensity: 0 }),
            grain: b.mat('grain', { color: 0x8f7458, roughness: 0.9 }),
            leather: b.mat('leather', { color: 0x4d3226, roughness: 0.8 }),
            strap: b.mat('strap', { color: 0x2f1f18, roughness: 0.85 }),
            steel: b.mat('steel', { color: 0xd8d6d0, metalness: 0.55, roughness: 0.28, flatShading: true }),
            edge: b.mat('edge', { color: 0xf2f1ec, metalness: 0.6, roughness: 0.18, flatShading: true }),
            iron: b.mat('iron', { color: 0xaaa59c, metalness: 0.3, roughness: 0.45 }),
            root: b.mat('root', { color: 0xd98c83, roughness: 0.7 }),
            rootDark: b.mat('rootDark', { color: 0xb0605a, roughness: 0.75 }),
            cap: b.mat('cap', { color: 0xe38f84, roughness: 0.5 }),
            capDeep: b.mat('capDeep', { color: 0xc96a60, roughness: 0.5 }),
            gill: b.mat('gill', { color: 0xf6d6ce, roughness: 0.8, side: THREE.DoubleSide }),
            stem: b.mat('stem', { color: 0xf3e5dd, roughness: 0.7 }),
            spot: b.mat('spot', { color: 0xfff4ee, roughness: 0.6 }),
            tendril: b.glow('tendril', 0xff5f52, 0.8, { color: 0xf0897d, roughness: 0.5 }),
            hair: b.glow('hair', 0xff8073, 0.45, { color: 0xffb3a9, roughness: 0.6 }),
            web: b.glow('web', 0xff6a5d, 0.5, { color: 0xf5a59a, roughness: 0.6 }),
            halo: new THREE.MeshBasicMaterial({ color: 0xff5a4c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
        };
        const model = b.part(b.group(null, null, [0.066, 0.096, 0.45]));
        // `body` is the spear itself (cloned when thrown, filled in when it regrows); `veins` holds
        // the lifesteal tendrils.
        const body = b.part(b.group(model));
        const veins = b.part(b.group(model));
        // Tubes that never grow can be merged by MeshBatch (it skips meshes with userData.tube).
        const fixed = mesh => {
            delete mesh.userData.tube;
            return mesh;
        };

        // Shaft, grain lines and a mushroom pommel.
        b.tubeZ(R * 0.94, R, 1.06, m.wood, body, [0, 0, -0.17], { seg: 14, wobble: 0.0009, freq: 30 });
        b.ring(R * 1.05, 0.003, m.iron, body, [0, 0, 0.355], null, { ts: 16, rs: 5 });
        const pommel = b.cap(0.025, 0.018, m.cap, m.gill, body, [0, 0, 0.36], [Math.PI / 2, 0, 0], { flat: 0.6, fins: 14, stemR: R });
        b.spots(pommel, 6, m.spot, 0.0042, 3);
        const rnd = K.rng(11);
        for (let i = 0; i < 4; i++) {
            const a = rnd() * Math.PI * 2;
            const z0 = 0.3 - rnd() * 0.25;
            const pts = [];
            for (let j = 0; j <= 6; j++) {
                const z = z0 - j * 0.15;
                const aa = a + Math.sin(j * 1.3 + i) * 0.12;
                pts.push([Math.cos(aa) * R * 0.99, Math.sin(aa) * R * 0.99, z]);
            }
            fixed(b.tube(pts, 0.0011, 0.0006, m.grain, body, { seg: 30, radial: 4 }));
        }

        // Leather wraps where the hands go.
        const wrap = (z0, z1) => {
            const len = z0 - z1;
            b.tubeZ(R + 0.0022, R + 0.0022, len, m.leather, body, [0, 0, (z0 + z1) / 2], { seg: 14 });
            const turns = Math.round(len / 0.014);
            const pts = [];
            for (let i = 0; i <= turns * 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                pts.push([Math.cos(a) * (R + 0.0034), Math.sin(a) * (R + 0.0034), z0 - (i / (turns * 8)) * len]);
            }
            fixed(b.tube(pts, 0.0016, 0.0016, m.strap, body, { seg: turns * 16, radial: 4 }));
            for (const z of [z0, z1]) {
                b.ring(R + 0.003, 0.0022, m.strap, body, [0, 0, z], null, { ts: 18, rs: 5 });
            }
        };
        wrap(0.16, 0);
        wrap(-0.16, -0.34);

        // Socket, a mushroom-cap guard with its gills toward the wielder, and the blade.
        b.lathe([[R * 0.98, 0], [0.0185, 0.012], [0.0205, 0.05], [0.019, 0.085], [0.0135, 0.11]], m.iron, body, [0, 0, -0.69], [-Math.PI / 2, 0, 0], { seg: 16 });
        b.ring(0.0205, 0.0022, m.iron, body, [0, 0, -0.705], null, { ts: 20, rs: 5 });
        const guard = b.part(b.cap(0.036, 0.016, m.cap, m.gill, body, [0, 0, -0.738], [-Math.PI / 2, 0, 0], { flat: 0.55, fins: 22, stemR: 0.02, wobble: 0.0008, freq: 90 }));
        b.spots(guard, 9, m.spot, 0.0055, 5, 0.25, 1.2);
        b.ring(0.0345, 0.0018, m.capDeep, body, [0, 0, -0.737], null, { ts: 30, rs: 5 });
        const bladeGeo = new THREE.LatheGeometry(this.BLADE.map(p => new THREE.Vector2(p[0], p[1])), 4);
        bladeGeo.scale(1, 1, this.BLADE_FLAT);
        bladeGeo.rotateX(-Math.PI / 2);
        bladeGeo.computeVertexNormals();
        const blade = b.part(b.group(body, [0, 0, this.BLADE_Z]));
        b.mesh(bladeGeo, m.steel, blade);
        for (const s of [-1, 1]) {
            const pts = [];
            for (let i = 0; i <= 12; i++) {
                const d = 0.02 + (i / 12) * 0.275;
                pts.push([s * this.bladeR(d) * 0.985, 0, -d]);
            }
            fixed(b.tube(pts, 0.0013, 0.0004, m.edge, blade, { seg: 28, radial: 4 }));
        }

        // Roots binding the socket and creeping down the shaft.
        for (let k = 0; k < 2; k++) {
            const pts = [];
            for (let i = 0; i <= 36; i++) {
                const a = k * Math.PI + i * 0.55;
                const r = 0.0215 + Math.sin(i * 0.9 + k) * 0.0012;
                pts.push([Math.cos(a) * r, Math.sin(a) * r, -0.625 - i * 0.0026]);
            }
            fixed(b.tube(pts, 0.0034, 0.0026, k ? m.rootDark : m.root, body, { seg: 100, radial: 6, wobble: 0.0008, freq: 120 }));
        }
        for (const [a0, len, r0] of [[0.6, 0.26, 0.0034], [2.5, 0.18, 0.0028], [4.2, 0.22, 0.003], [5.4, 0.1, 0.0022]]) {
            const pts = [];
            for (let i = 0; i <= 8; i++) {
                const t = i / 8;
                const a = a0 + Math.sin(t * 5 + a0) * 0.35;
                pts.push([Math.cos(a) * (R + 0.0012), Math.sin(a) * (R + 0.0012), -0.63 + t * len]);
            }
            fixed(b.tube(pts, r0, 0.0006, m.root, body, { seg: 36, radial: 5, wobble: 0.0006, freq: 140, seed: a0 }));
        }

        // Mushrooms: a cluster between the wraps, one up the shaft, shelf fungi and gill rings.
        const ring = (z, a, list) => list.map(([da, dz, size, tilt]) => {
            const aa = a + da;
            const g = b.mini(body, [Math.cos(aa) * R * 0.9, Math.sin(aa) * R * 0.9, z + dz], size, size > 0.015 ? m.cap : m.capDeep, m.stem, [0, 0, aa - Math.PI / 2 + tilt]);
            return b.part(g);
        });
        const shrooms = [
            ...ring(-0.47, 2.2, [[0, 0, 0.026, 0], [0.5, -0.025, 0.018, 0.25], [-0.45, 0.02, 0.014, -0.3], [0.2, 0.035, 0.01, 0.1]]),
            ...ring(-0.08, 2.0, [[0, 0, 0.019, 0], [0.55, 0.022, 0.013, 0.3], [-0.4, -0.02, 0.01, -0.2]]),
            ...ring(-0.66, 0.9, [[0, 0, 0.012, 0.2], [0.6, 0.015, 0.009, 0.4]])
        ];
        for (const [z, r, a] of [[-0.6, 0.02, Math.PI], [-0.632, 0.015, Math.PI + 0.3], [-0.575, 0.012, Math.PI - 0.4], [-0.22, 0.012, 0.3]]) {
            const g = b.group(body, [Math.cos(a) * (R + 0.002), Math.sin(a) * (R + 0.002), z], [0, 0, a - Math.PI]);
            b.sphere(r, m.cap, g, [-r * 0.85, 0, 0], [1, 0.28, 0.85], { ws: 14, hs: 6, tl: Math.PI / 2, wobble: 0.0006, freq: 200 });
            b.mesh(new THREE.CircleGeometry(r, b.n(14, 5)), m.gill, g, [-r * 0.85, -0.0004, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);
        }
        for (const z of [-0.385, -0.4]) {
            b.ring(R + 0.0015, 0.0022, m.gill, body, [0, 0, z], null, { ts: 18, rs: 5 });
        }

        // Lifesteal tendrils: three glowing spirals from just ahead of the front hand to the socket,
        // two carrying on along the blade's ridges, each with a halo, beads and hairs.
        const tendrils = [];
        const nodes = [];
        const hairs = [];
        const z0 = -0.36;
        const z1 = -0.79;
        const nodeGeo = new THREE.IcosahedronGeometry(1, b.lod === 'high' ? 1 : 0);
        for (let k = 0; k < 3; k++) {
            const pts = [];
            const steps = 44;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const z = K.lerp(z0, z1, t);
                const a = k * 2.094 + t * Math.PI * 2 * 3.2;
                const r = (z < -0.69 ? 0.0235 : R + 0.004) + Math.sin(t * 31 + k) * 0.0009;
                pts.push([Math.cos(a) * r, Math.sin(a) * r, z]);
            }
            if (k < 2) {
                const s = k ? -1 : 1;
                for (let i = 1; i <= 8; i++) {
                    const d = (i / 8) * 0.25;
                    const y = s * (this.bladeR(d) * this.BLADE_FLAT + 0.0022);
                    pts.push([Math.sin(i * 1.7 + k) * 0.002, y, this.BLADE_Z - d]);
                }
            }
            const opts = { seg: 170, radial: 6, wobble: 0.0008, freq: 160, seed: k * 7 };
            const t = b.tube(pts, 0.0052, k < 2 ? 0.0018 : 0.0028, m.tendril, veins, opts);
            const halo = b.tube(pts, 0.011, k < 2 ? 0.004 : 0.006, m.halo, veins, Object.assign({}, opts, { radial: 6 }));
            t.userData.halo = halo;
            t.visible = halo.visible = false;
            tendrils.push(t);

            const curve = t.userData.tube.curve;
            const rn = K.rng(31 + k);
            const count = k < 2 ? 14 : 10;
            for (let i = 0; i < count; i++) {
                const u = (i + 0.3 + rn() * 0.4) / count;
                const n = b.mesh(nodeGeo, m.tendril, veins);
                curve.getPointAt(u, n.position);
                n.userData.node = { k, u, s: 0.005 + rn() * 0.004 };
                n.visible = false;
                nodes.push(n);
                if (rn() < 0.9) {
                    const p = curve.getPointAt(u);
                    const out = new THREE.Vector3(p.x, p.y, 0).normalize();
                    if (out.lengthSq() < 0.5) {
                        out.set(0, 1, 0);
                    }
                    const len = 0.016 + rn() * 0.022;
                    const side = new THREE.Vector3(-out.y, out.x, 0).multiplyScalar((rn() - 0.5) * len);
                    const h = b.tube([
                        p.toArray(),
                        p.clone().addScaledVector(out, len * 0.5).add(side).add(new THREE.Vector3(0, 0, (rn() - 0.5) * 0.012)).toArray(),
                        p.clone().addScaledVector(out, len).addScaledVector(side, 1.6).toArray()
                    ], 0.0017, 0.0004, m.hair, veins, { seg: 10, radial: 4 });
                    h.visible = false;
                    h.userData.hair = { k, u };
                    hairs.push(h);
                }
            }
        }

        const web = this.buildWeb(b, model, m.web);

        const tip = b.group(model, [0, 0, this.BLADE_Z - 0.3]);
        const muzzle = b.group(model, [0, 0, this.BLADE_Z - 0.2]);
        const rear = b.grip('rear', model, [0, 0, 0.08], { fingers: [-1, 0.25, 0], back: [0.25, 1, 0], around: R + 0.002, curl: 0.95 });
        const front = b.part(b.grip('front', model, [0, 0, -0.25], { fingers: [1, 0.3, 0], back: [0.3, -1, 0], around: R + 0.002, curl: 0.85 }));
        b.grip('reach', model, [0, 0, -0.53], { fingers: [1, 0.3, 0], back: [0.3, -1, 0], around: R + 0.002, curl: 0.8 });
        // Open hand on the root binding below the socket, for the inspect.
        b.grip('stroke', model, [0, 0, -0.6], { fingers: [1, 0.3, 0], back: [0.3, -1, 0], around: R + 0.006, curl: 0.3 });
        return { model, body, veins, web, blade, guard, tip, muzzle, rear, front, shrooms, tendrils, nodes, hairs, m };
    },

    // Radius of the handle's surface at z, over the leather wraps and the root binding.
    handleR(z) {
        const R = this.R;
        const inWrap = (z <= 0.16 && z >= 0) || (z <= -0.16 && z >= -0.34);
        return z < -0.62 ? 0.026 : inWrap ? 0.0215 : R + 0.003;
    },

    // Mycelium sheath over the whole handle, from behind the back hand to the socket. Grows with a
    // charged throw and while a spear regrows. Long strands are tubes grown with WeaponKit.grow;
    // rings, fuzz and beads pop in (plain meshes, so MeshBatch can merge them).
    buildWeb(b, parent, mat) {
        const K = WeaponKit;
        const web = b.group(parent);
        web.visible = false;
        const zA = 0.14;
        const zB = -0.7;
        const span = zA - zB;
        const u = z => (zA - z) / span;
        const rnd = K.rng(77);
        const lod = b.lod === 'high' ? 1 : b.lod === 'medium' ? 0.6 : 0.3;
        const strands = [];
        for (let k = 0; k < 8; k++) {
            const pts = [];
            const a0 = (k / 8) * Math.PI * 2 + rnd() * 0.4;
            for (let i = 0; i <= 21; i++) {
                const z = zA - (i / 21) * span;
                const a = a0 + Math.sin(z * 7 + k) * 0.45 + z * 1.6;
                const r = this.handleR(z) + 0.0006 + rnd() * 0.0008;
                pts.push([Math.cos(a) * r, Math.sin(a) * r, z]);
            }
            const t = b.tube(pts, 0.0019, 0.0011, mat, web, { seg: 90, radial: 4, wobble: 0.0006, freq: 180, seed: k });
            t.visible = false;
            t.userData.web = { d0: rnd() * 0.12 };
            strands.push(t);
        }
        const bits = [];
        const bit = (mesh, z, base) => {
            mesh.userData.bit = { u: u(z), base };
            mesh.visible = false;
            bits.push(mesh);
        };
        for (let i = 0; i < Math.round(22 * lod); i++) {
            const z = zA - rnd() * span;
            const geo = new THREE.TorusGeometry(this.handleR(z) + 0.0008, 0.0011, b.n(4, 3), b.n(12, 4), 0.8 + rnd() * 1.6);
            bit(b.mesh(geo, mat, web, [0, 0, z], [0, 0, rnd() * Math.PI * 2]), z, 1);
        }
        const cone = new THREE.ConeGeometry(0.0009, 1, b.n(4, 3));
        cone.translate(0, 0.5, 0);
        for (let i = 0; i < Math.round(50 * lod); i++) {
            const z = zA - rnd() * span;
            const a = rnd() * Math.PI * 2;
            const r = this.handleR(z);
            const len = 0.006 + rnd() * 0.012;
            const h = b.mesh(cone, mat, web, [Math.cos(a) * r, Math.sin(a) * r, z], [rnd() * 0.6 - 0.3, 0, a - Math.PI / 2]);
            bit(h, z, len);
        }
        const bead = new THREE.IcosahedronGeometry(1, 0);
        for (let i = 0; i < Math.round(24 * lod); i++) {
            const z = zA - rnd() * span;
            const a = rnd() * Math.PI * 2;
            const r = this.handleR(z) + 0.001;
            bit(b.mesh(bead, mat, web, [Math.cos(a) * r, Math.sin(a) * r, z]), z, 0.0022 + rnd() * 0.0022);
        }
        return { group: web, strands, bits };
    },

    // Sheath growth this frame: 0 hidden, 1 covering the whole handle.
    webGrowth(w) {
        const K = WeaponKit;
        if (w.state === 'charge') {
            return K.ease.outCubic(w.data.charge);
        }
        if (w.state === 'regrow') {
            const T = this.throwCfg;
            return K.seg(w.actT, 0, 0.7) * (1 - K.e('inOutSine', w.actT, T.regrow - 0.45, T.regrow));
        }
        if (w.state === 'inspect') {
            // The sheath follows the hand up the shaft, then withers.
            return K.e('outCubic', w.actT, 0.75, 1.6) * (1 - K.e('inOutSine', w.actT, 1.85, 2.4));
        }
        return 0;
    },

    // Inspect: raise the spear in front, run the free hand up the shaft (the mycelium sheath grows
    // after it and the wood glows), turn the blade to the light (a glint runs up the edge), then
    // spin it in the hands, flinging spores off the mushrooms, and lower it.
    inspectRoll(it) {
        const K = WeaponKit;
        return 1.3 * K.e('inOutCubic', it, 1.9, 2.3) + (Math.PI * 2 - 1.3) * K.e('inOutCubic', it, 2.6, 3.1);
    },

    init(w) {
        const d = w.data;
        d.charges = 0;
        d.shown = 0;
        d.charge = 0;
        d.cool = 0;
        d.drink = -1;
        d.launched = false;
        d.regrowing = false;
        d.flying = null;
        d.jiggle = new Spring(140, 7);
        d.axis = new THREE.Vector3(0, 0, -1).applyEuler(w.parts.model.rotation);
        d.v = new THREE.Vector3();
        d.v2 = new THREE.Vector3();
    },

    fireOpts(w) {
        return w.data.charges > 0 ? { mode: 'infused' } : undefined;
    },

    altPress(w) {
        if (w.state !== 'ready' || w.data.cool > 0) {
            return;
        }
        w.data.charge = 0;
        w.setState('charge');
    },

    // Runs on remote copies too, which only see the states arrive over the network.
    altTick(w, dt, move) {
        const d = w.data;
        const T = this.throwCfg;
        d.cool = Math.max(0, d.cool - dt);
        if (d.drink >= 0) {
            d.drink += dt;
        }
        if (!w.remote && w.state === 'ready' && w.altHeld && d.cool <= 0 && !(move && move.sprinting)) {
            d.charge = 0;
            w.setState('charge');
        }
        const target = d.charges / this.lifesteal.hits;
        d.shown += (target - d.shown) * Math.min(1, dt * 6);

        if (w.state === 'charge') {
            d.charge = Math.min(1, d.charge + dt / T.chargeTime);
            if (move && move.sprinting) {
                w.setState('ready');
            } else if (!w.altHeld) {
                w.setState('throw');
            }
        }
        if (w.state !== 'throw') {
            d.launched = false;
        } else if (!d.launched) {
            d.launched = true;
            this.launch(w);
        }
        if (w.state === 'throw' && w.actT + dt >= T.throwTime) {
            w.setState('regrow');
        }
        if (w.state === 'regrow') {
            d.regrowing = true;
            if (w.actT + dt >= T.regrow) {
                w.setState('ready');
            }
        }
        if (d.regrowing && w.state !== 'regrow') {
            d.regrowing = false;
            d.charges = this.lifesteal.hits;
            d.shown = 1;
            d.drink = -1;
        }
    },

    cancel(w) {
        const d = w.data;
        this.drop(w);
        if (w.state === 'throw' || w.state === 'regrow') {
            d.charges = 0;
            d.shown = 0;
        }
        d.charge = 0;
        d.launched = false;
        d.regrowing = false;
    },

    dispose(w) {
        this.drop(w);
    },

    enemyOf(obj) {
        for (let o = obj; o; o = o.parent) {
            if (o.userData.enemy) {
                return o.userData.enemy;
            }
        }
        return null;
    },

    // Called after the poke is traced and before its damage is applied.
    onTrace(w, shot) {
        const d = w.data;
        const hit = shot.hits && shot.hits[0];
        d.lastHit = hit ? hit.point.clone() : null;
        if (!hit) {
            return;
        }
        const e = this.enemyOf(hit.object);
        if (!e || e.dead) {
            this.scrape(w, hit);
            return;
        }
        if (shot.mode === 'infused' && d.charges > 0) {
            d.charges--;
            d.drink = 0;
            if (!w.remote) {
                Players.heal(Players.local, this.lifesteal.heal);
            }
        }
    },

    scrape(w, hit) {
        const fx = w.fx;
        const K = WeaponKit;
        for (let i = 0; i < 7; i++) {
            const v = K.sphereDir().multiplyScalar(0.8).addScaledVector(hit.normal, 1.5).multiplyScalar(K.rand(0.8, 2));
            fx.emit({ world: true, pos: hit.point, vel: v, life: K.rand(0.12, 0.25), size: 0.006, sizeEnd: 0, color: i % 2 ? 0xffe6c0 : 0xffffff, drag: 3, gravity: 6, stretch: 0.02 });
        }
        for (let i = 0; i < 4; i++) {
            fx.emit({ world: true, pos: hit.point, vel: K.sphereDir().multiplyScalar(0.2).addScaledVector(hit.normal, 0.4), life: 0.6, size: 0.02, sizeEnd: 0.06, color: 0x9a9080, additive: false, opacity: 0.35, drag: 3 });
        }
    },

    // ------------------------------------------------------------------ thrown spear

    // Sends a copy of the spear from beside the eye toward whatever is under the crosshair.
    launch(w) {
        const d = w.data;
        const T = this.throwCfg;
        const K = WeaponKit;
        this.drop(w);
        const parent = w.fx.worldParent;
        if (!parent) {
            return;
        }
        const eye = w.root.parent || w.root;
        eye.updateWorldMatrix(true, false);
        const q = eye.getWorldQuaternion(new THREE.Quaternion());
        const origin = new THREE.Vector3().setFromMatrixPosition(eye.matrixWorld);
        const aim = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const far = w.trace ? w.trace(origin, aim, 80) : null;
        const target = far ? far.point.clone() : origin.clone().addScaledVector(aim, 80);
        const start = origin.clone().add(new THREE.Vector3(0.18, -0.08, -0.45).applyQuaternion(q));
        const c = Math.max(T.minCharge, d.charge);
        const speed = K.lerp(T.speed[0], T.speed[1], c);
        const vel = target.clone().sub(start).normalize().multiplyScalar(speed);
        vel.y += 0.5 * T.gravity * Math.min(target.distanceTo(start) / speed, 1.5);

        const mesh = this.flyingMesh(w);
        parent.add(mesh);
        const f = d.flying = {
            mesh, pos: start, vel, dir: vel.clone().normalize(), t: 0, end: T.life, landed: false, stuck: null,
            damage: Math.round(K.lerp(T.minDamage, this.modeDamage.throw, c)), m4: new THREE.Matrix4()
        };
        if (!w.remote) {
            d.cool = T.cooldown;
        }
        d.charge = 0;
        // Something between the eye and the launch point (a wall right in front) is hit at once.
        const gap = start.clone().sub(origin);
        const block = w.trace ? w.trace(origin, gap.clone().normalize(), gap.length()) : null;
        if (block) {
            this.flyHit(w, f, block);
        }
        this.placeFlying(f);
        for (let i = 0; i < 8; i++) {
            w.fx.emit({ world: true, pos: start.clone().addScaledVector(f.dir, 0.4), vel: K.cone(f.dir, 0.6).multiplyScalar(K.rand(0.5, 2)), life: K.rand(0.25, 0.45), size: 0.003, sizeEnd: 0.008, color: this.color, opacity: 0.6, drag: 3 });
        }
    },

    // A world copy of the spear body with its own materials (so its glow does not leak into the
    // spear in the hand).
    flyingMesh(w) {
        const mesh = w.parts.body.clone(true);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.setScalar(1);
        const mats = new Map();
        mesh.traverse(o => {
            o.layers.set(0);
            if (o.material) {
                if (!mats.has(o.material)) {
                    const c = o.material.clone();
                    if (c.emissive) {
                        c.emissive.set(0xff6f63);
                        c.emissiveIntensity = 0;
                    }
                    mats.set(o.material, c);
                }
                o.material = mats.get(o.material);
            }
        });
        mesh.userData.mats = [...mats.values()];
        return mesh;
    },

    placeFlying(f) {
        const s = this.throwCfg.scale;
        const mesh = f.mesh;
        if (f.stuck) {
            f.m4.multiplyMatrices(f.stuck.obj.matrixWorld, f.stuck.local);
            f.m4.decompose(mesh.position, mesh.quaternion, mesh.scale);
            return;
        }
        mesh.quaternion.setFromUnitVectors(_ev.set(0, 0, -1), f.dir);
        mesh.scale.setScalar(s);
        mesh.position.copy(f.pos).addScaledVector(f.dir, -(0.3 - this.BLADE_Z) * s);
    },

    flyHit(w, f, hit) {
        f.pos.copy(hit.point);
        const e = this.enemyOf(hit.object);
        f.end = Math.min(f.end, f.t + 0.6);
        if (e && !e.dead) {
            if (!w.remote) {
                w.reportHits([hit], { mode: 'throw', damage: f.damage, origin: hit.point.clone().addScaledVector(f.dir, -1) });
            }
            f.pos.addScaledVector(f.dir, 0.22);
            this.placeFlying(f);
            f.mesh.updateMatrixWorld(true);
            hit.object.updateWorldMatrix(true, false);
            f.stuck = { obj: hit.object, local: new THREE.Matrix4().copy(hit.object.matrixWorld).invert().multiply(f.mesh.matrixWorld) };
            return;
        }
        f.landed = true;
        f.pos.addScaledVector(f.dir, 0.12);
        this.scrape(w, hit);
    },

    updateFlying(w, dt) {
        const f = w.data.flying;
        if (!f) {
            return;
        }
        const T = this.throwCfg;
        const K = WeaponKit;
        const fx = w.fx;
        f.t += dt;
        if (!f.landed && !f.stuck) {
            f.vel.y -= T.gravity * dt;
            f.dir.copy(f.vel).normalize();
            const hit = w.trace ? w.trace(f.pos, f.dir, f.vel.length() * dt) : null;
            if (hit) {
                this.flyHit(w, f, hit);
            } else {
                f.pos.addScaledVector(f.vel, dt);
                const n = fx.rate('trail', 50, dt);
                for (let i = 0; i < n; i++) {
                    fx.emit({ world: true, pos: f.mesh.localToWorld(_ev.set(0, 0, -Math.random() * 0.8)), vel: K.sphereDir().multiplyScalar(0.15), life: K.rand(0.3, 0.6), size: 0.006, sizeEnd: 0.002, color: Math.random() < 0.6 ? this.color : 0xffffff, drag: 2 });
                }
            }
        }
        this.placeFlying(f);
        // Dissolve: the spear glows, shrinks toward its middle and comes apart into spores.
        const k = K.seg(f.t, f.end, f.end + T.dissolve);
        const glow = K.seg(f.t, f.end - 0.25, f.end + 0.2);
        for (const mat of f.mesh.userData.mats) {
            if (mat.emissive) {
                mat.emissiveIntensity = glow * 1.4;
            }
        }
        if (k > 0) {
            const mid = (0.3 - this.BLADE_Z) * 0.5;
            f.mesh.updateMatrixWorld(true);
            const centre = f.mesh.localToWorld(_ev.set(0, 0, -mid)).clone();
            f.mesh.scale.multiplyScalar(Math.max(0.001, 1 - K.ease.inQuad(k)));
            f.mesh.position.lerp(centre, K.ease.inQuad(k));
            const n = fx.rate('dissolve', 160 * (1 - k * 0.6), dt);
            for (let i = 0; i < n; i++) {
                const p = centre.clone().addScaledVector(f.dir, (Math.random() - 0.5) * 1.3 * (1 - k));
                fx.emit({ world: true, pos: p, vel: K.sphereDir().multiplyScalar(K.rand(0.2, 0.6)).add(_ev.set(0, 0.25, 0)), life: K.rand(0.5, 1.0), size: K.rand(0.008, 0.016), sizeEnd: 0.002, color: Math.random() < 0.65 ? this.color : 0xffe2dc, drag: 2, gravity: -0.3 });
            }
        }
        if (f.t >= f.end + T.dissolve) {
            this.drop(w);
        }
    },

    drop(w) {
        const f = w.data.flying;
        if (!f) {
            return;
        }
        if (f.mesh.parent) {
            f.mesh.parent.remove(f.mesh);
        }
        for (const mat of f.mesh.userData.mats) {
            mat.dispose();
        }
        w.data.flying = null;
    },

    // ------------------------------------------------------------------ HUD

    meter(w) {
        const d = w.data;
        if (w.state === 'charge') {
            return d.charge;
        }
        if (w.state === 'regrow') {
            return w.actT / this.throwCfg.regrow;
        }
        return d.charges / this.lifesteal.hits;
    },

    status(w) {
        const d = w.data;
        if (w.state === 'charge') {
            return 'Charging ' + Math.round(d.charge * 100) + '%';
        }
        if (w.state === 'throw' || w.state === 'regrow') {
            return 'Regrowing...';
        }
        const out = [];
        if (d.charges > 0) {
            out.push('Lifesteal ' + d.charges + '/' + this.lifesteal.hits);
        }
        out.push(d.cool > 0 ? 'Throw ' + Math.ceil(d.cool) + 's' : 'Throw ready');
        return out.join('  ·  ');
    },

    // ------------------------------------------------------------------ animation

    // Tendril growth this frame: 0 hidden, 1 fully grown.
    growth(w) {
        if (w.state === 'throw') {
            return 0;
        }
        if (w.state === 'regrow') {
            return WeaponKit.seg(w.actT, 0.05, 0.6);
        }
        return w.data.shown;
    },

    pose(w, dt) {
        const P = w.parts;
        const K = WeaponKit;
        const d = w.data;
        const T = this.throwCfg;
        const M = P.model;
        d.jiggle.update(dt);

        // Tendrils, halos, beads and hairs.
        const g = this.growth(w);
        const per = [0, 1, 2].map(k => K.seg(g, k * 0.06, 0.88 + k * 0.06));
        P.tendrils.forEach((t, k) => {
            K.grow(t, per[k]);
            K.grow(t.userData.halo, per[k]);
        });
        for (const n of P.nodes) {
            const o = n.userData.node;
            const s = K.ease.outBack(K.seg(per[o.k], o.u, o.u + 0.06));
            n.visible = s > 0.001;
            n.scale.setScalar(o.s * Math.max(0.001, s) * (1 + Math.sin(w.time * 4 + o.u * 20) * 0.15));
        }
        for (const h of P.hairs) {
            const o = h.userData.hair;
            K.grow(h, K.seg(per[o.k], o.u + 0.02, o.u + 0.12));
        }
        const flash = d.drink >= 0 ? 1.8 * (1 - K.seg(d.drink, 0, 0.5)) : 0;
        const regrowing = w.state === 'regrow' ? 0.5 * (1 - K.seg(w.actT, 0.6, T.regrow)) : 0;
        const pulse = 0.3 * Math.sin(w.time * 5);
        P.m.tendril.emissiveIntensity = 0.8 + pulse + flash + regrowing;
        P.m.hair.emissiveIntensity = 0.45 + pulse * 0.5 + flash * 0.4 + regrowing * 0.5;
        P.m.halo.opacity = 0.3 + 0.08 * Math.sin(w.time * 5) + flash * 0.15 + regrowing * 0.15;
        P.m.wood.emissiveIntensity = 0;

        const wg = this.webGrowth(w);
        const W = P.web;
        W.group.visible = wg > 0.001;
        if (W.group.visible) {
            for (const t of W.strands) {
                const o = t.userData.web;
                K.grow(t, K.seg(wg, o.d0, o.d0 + 0.85));
            }
            for (const mesh of W.bits) {
                const o = mesh.userData.bit;
                const k = Math.max(0.001, K.ease.outBack(K.seg(wg, o.u * 0.9, o.u * 0.9 + 0.1)));
                mesh.visible = k > 0.002;
                if (o.base === 1) {
                    mesh.scale.setScalar(k);
                } else if (o.base < 0.005) {
                    mesh.scale.setScalar(o.base * k);
                } else {
                    mesh.scale.set(k, o.base * k, k);
                }
            }
        }
        const full = w.state === 'charge' && w.data.charge >= 1;
        P.m.web.emissiveIntensity = 0.45 + wg * 0.6 + (full ? 0.35 + 0.35 * Math.sin(w.time * 16) : 0);

        P.shrooms.forEach((s, i) => {
            s.rotation.z += d.jiggle.x * (i % 2 ? -0.05 : 0.06);
            s.rotation.x += d.jiggle.x * 0.03 + Math.sin(w.time * 1.4 + i) * 0.015;
        });

        // Charging a throw: the spear comes up and back over the shoulder.
        if (w.state === 'charge') {
            const a = K.e('outCubic', w.actT, 0, 0.25);
            const c = K.ease.outCubic(d.charge);
            M.position.x -= a * 0.02;
            M.position.y += a * 0.13;
            M.position.z += a * 0.1 + c * 0.08;
            M.rotation.x += a * 0.08;
            M.rotation.y -= a * 0.04;
            const tremble = d.charge >= 1 ? 0.0025 : 0;
            M.position.x += Math.sin(w.time * 47) * tremble;
            M.position.y += Math.sin(w.time * 53) * tremble;
        }
        // Throwing: the spear is gone; the empty grip follows through.
        if (w.state === 'throw') {
            P.body.visible = false;
            P.veins.visible = false;
            const t = w.actT;
            const out = K.e('outCubic', t, 0, 0.1) * (1 - K.e('inOutCubic', t, 0.12, T.throwTime));
            M.position.y += 0.13 - out * 0.12;
            M.position.z += 0.18 - out * 0.4;
            M.rotation.x += 0.08 - out * 0.1;
        }
        // Regrowing: tendrils shoot out of the hand, the shaft fills in along them, then the
        // guard, mushrooms and blade pop out.
        if (w.state === 'regrow') {
            const t = w.actT;
            const show = K.e('inOutCubic', t, 0, 0.35) * (1 - K.e('inOutCubic', t, T.regrow - 0.4, T.regrow));
            M.position.x -= show * 0.06;
            M.position.y += show * 0.09;
            M.position.z -= show * 0.06;
            M.rotation.y += show * 0.16;
            M.rotation.x += show * 0.04;
            const fill = K.e('outCubic', t, 0.4, 1.1);
            P.body.visible = t > 0.4;
            P.body.scale.set(K.lerp(0.35, 1, fill), K.lerp(0.35, 1, fill), Math.max(0.01, fill));
            P.blade.scale.setScalar(Math.max(0.001, K.ease.outBack(K.seg(t, 1.0, 1.3))));
            P.guard.scale.multiplyScalar(Math.max(0.001, K.ease.outBack(K.seg(t, 0.9, 1.2))));
            P.shrooms.forEach((s, i) => {
                s.scale.multiplyScalar(Math.max(0.001, K.ease.outBack(K.seg(t, 0.95 + i * 0.04, 1.2 + i * 0.04))));
            });
            P.m.wood.emissiveIntensity = t > 0.4 ? 0.9 * (1 - K.seg(t, 0.9, T.regrow)) : 0;
            if (w.atAct(1.1)) {
                d.jiggle.kick(8);
            }
        }

        // Poke: short draw back, long thrust along the shaft (which points at the crosshair a few
        // metres out), hold, recover. The front hand lets the shaft slide.
        const f = w.fireT;
        if (f < 0.6 && w.state === 'ready') {
            const back = K.e('outQuad', f, 0, 0.06) * (1 - K.e('inQuad', f, 0.06, 0.1));
            const out = K.e('outCubic', f, 0.055, 0.15) * (1 - K.e('inOutCubic', f, 0.25, 0.58));
            M.position.addScaledVector(d.axis, out * 0.62 - back * 0.06);
            M.rotation.z += K.hump(f, 0.05, 0.3) * 0.06;
            P.front.position.z += out * 0.62 * 0.35;
            if (d.lastHit && f > 0.1 && f < 0.24) {
                M.position.x += Math.sin(w.time * 90) * 0.0025;
            }
        }

        const it = w.inspectT;
        if (it >= 0) {
            const IT = this.inspect.time;
            const up = K.e('inOutCubic', it, 0, 0.55) * (1 - K.e('inOutCubic', it, IT - 0.5, IT));
            const check = K.hump(it, 1.85, 2.6);
            M.rotation.x += up * 0.6 - check * 0.12;
            M.rotation.y += up * 0.22 + check * 0.3;
            M.rotation.z -= up * 0.1;
            M.position.x -= up * 0.12;
            M.position.y -= up * 0.05;
            M.position.z -= up * 0.05;
            // The spear turns in the hands (the grips stay put): blade to the light, then a full spin.
            const roll = this.inspectRoll(it);
            P.body.rotation.z += roll;
            P.veins.rotation.z += roll;
            M.position.y += K.hump(it, 2.6, 3.1) * 0.015;
            P.m.wood.emissiveIntensity = Math.max(P.m.wood.emissiveIntensity, 0.75 * K.hump(it, 0.7, 1.9));
            if (w.atAct(0.55) || w.atAct(3.1)) {
                d.jiggle.kick(9);
            }
        }
    },

    handPose(w, H) {
        const K = WeaponKit;
        const T = this.throwCfg;
        const t = w.actT;
        if (w.state === 'charge') {
            H.left.to(this.LEFT_AIM, K.e('inOutCubic', t, 0, 0.25));
            H.right.squeeze(0.1 * w.data.charge);
        }
        if (w.state === 'throw') {
            H.left.to(this.LEFT_AIM, 1);
            H.right.squeeze(-0.8 * K.e('outQuad', t, 0, 0.08));
        }
        if (w.state === 'regrow') {
            H.left.to(this.LEFT_AIM, 1 - K.e('inOutCubic', t, 1.05, 1.45));
            H.right.squeeze(-0.8 * (1 - K.e('inOutCubic', t, 0.35, 0.8)));
        }
        const f = w.fireT;
        if (f < 0.6 && w.state === 'ready') {
            H.left.squeeze(-0.25 * K.hump(f, 0.06, 0.4));
        }
        const it = w.inspectT;
        if (it >= 0) {
            // The free hand opens and slides up the shaft to the roots, then back to its grip.
            H.left.track(it, [[0.65, 1.55, 'stroke'], [1.75, 2.2, 'front']]);
            H.left.squeeze(-0.55 * K.hump(it, 0.6, 1.9));
            H.right.squeeze(0.15 * K.hump(it, 2.55, 3.15));
        }
    },

    effects(w, dt) {
        const P = w.parts;
        const fx = w.fx;
        const K = WeaponKit;
        const d = w.data;
        const glow = this.color;

        this.updateFlying(w, dt);

        const wg = this.webGrowth(w);
        if (wg > 0.02) {
            const n = fx.rate('web', 10 + 50 * wg * (w.state === 'charge' ? w.data.charge : 1), dt);
            for (let i = 0; i < n; i++) {
                const front = w.state === 'regrow' && wg < 1 && Math.random() < 0.6;
                const z = 0.14 - 0.84 * (front ? wg * 0.9 : Math.random() * wg);
                const a = Math.random() * Math.PI * 2;
                const r = this.handleR(z) + 0.002;
                const p = w.localPos(P.model, [Math.cos(a) * r, Math.sin(a) * r, z]);
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.05).add(new THREE.Vector3(0, 0.02, 0)), life: K.rand(0.25, 0.6), size: K.rand(0.002, 0.004), sizeEnd: 0, color: Math.random() < 0.7 ? glow : 0xffffff, drag: 2 });
            }
        }

        if (d.charges > 0 && w.state === 'ready') {
            const n = fx.rate('spore', 10, dt);
            for (let i = 0; i < n; i++) {
                const t = P.tendrils[(Math.random() * 3) | 0];
                const p = w.localPos(P.veins, t.userData.tube.curve.getPointAt(Math.random() * d.shown, d.v).toArray());
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.02).add(new THREE.Vector3(0, 0.03, 0)), life: K.rand(0.6, 1.2), size: 0.0025, sizeEnd: 0.005, color: glow, opacity: 0.8, drag: 1.5, gravity: -0.02 });
            }
        }
        // Drinking: motes run from the blade back into the hand.
        if (d.drink >= 0 && d.drink < 0.5) {
            const hand = w.localPos(P.front, null, d.v2);
            const n = fx.rate('drink', 140, dt);
            for (let i = 0; i < n; i++) {
                const t = P.tendrils[(Math.random() * 3) | 0];
                const p = w.localPos(P.veins, t.userData.tube.curve.getPointAt(K.rand(0.4, 1), d.v).toArray());
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.05), attract: hand, pull: 9, life: 0.5, size: K.rand(0.003, 0.006), sizeEnd: 0.001, color: Math.random() < 0.7 ? glow : 0xffffff, drag: 1.5, fadeIn: 0.05 });
            }
        }
        if (w.state === 'charge') {
            const tip = w.localPos(P.tip, null, d.v2);
            const n = fx.rate('gather', 15 + d.charge * 45, dt);
            for (let i = 0; i < n; i++) {
                const p = tip.clone().add(K.sphereDir().multiplyScalar(K.rand(0.05, 0.14)));
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.04), attract: tip, pull: 3 + d.charge * 4, swirl: 3, life: 0.6, size: K.rand(0.002, 0.004), sizeEnd: 0.001, color: Math.random() < 0.7 ? glow : 0xffffff, drag: 1.2, fadeIn: 0.08 });
            }
        }
        if (w.state === 'regrow') {
            const t = w.actT;
            const hand = w.localPos(P.rear, null, d.v2);
            if (t < 0.6) {
                const n = fx.rate('gather', 70, dt);
                for (let i = 0; i < n; i++) {
                    const p = hand.clone().add(K.sphereDir().multiplyScalar(K.rand(0.06, 0.18)));
                    fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.05), attract: hand, pull: 6, swirl: -4, life: 0.5, size: K.rand(0.0015, 0.003), sizeEnd: 0.001, color: Math.random() < 0.7 ? glow : 0xffffff, drag: 1.2, fadeIn: 0.06 });
                }
            }
            const g = this.growth(w);
            if (g > 0 && g < 1) {
                P.tendrils.forEach((tube, k) => {
                    const u = K.seg(g, k * 0.06, 0.88 + k * 0.06);
                    if (u <= 0 || u >= 1) {
                        return;
                    }
                    const n = fx.rate('front' + k, 70, dt);
                    for (let i = 0; i < n; i++) {
                        const p = w.localPos(P.veins, tube.userData.tube.curve.getPointAt(u, d.v).toArray());
                        fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.08), life: K.rand(0.25, 0.5), size: K.rand(0.003, 0.006), sizeEnd: 0, color: i % 3 ? glow : 0xffffff, drag: 2 });
                    }
                });
            }
            if (t > 0.4 && t < 1.1) {
                const n = fx.rate('fill', 40, dt);
                for (let i = 0; i < n; i++) {
                    const z = -K.seg(t, 0.4, 1.1) * 0.75 * Math.random();
                    const p = w.localPos(P.body, [K.rand(-0.02, 0.02), K.rand(-0.02, 0.02), z]);
                    fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.05).add(new THREE.Vector3(0, 0.04, 0)), life: 0.5, size: 0.004, sizeEnd: 0.008, color: 0xf2c4bc, additive: false, opacity: 0.6, drag: 2 });
                }
            }
            if (w.atAct(1.05)) {
                const b = w.localPos(P.blade, [0, 0, -0.12]);
                for (let i = 0; i < 24; i++) {
                    fx.emit({ pos: b, vel: K.sphereDir().multiplyScalar(K.rand(0.15, 0.4)), life: K.rand(0.3, 0.6), size: K.rand(0.003, 0.006), sizeEnd: 0, color: i % 2 ? glow : 0xffffff, drag: 3 });
                }
            }
            if (w.atAct(1.3)) {
                const tip = w.localPos(P.tip);
                const dir = tip.clone().sub(w.localPos(P.muzzle)).normalize();
                fx.emit({ shape: 'ring', pos: tip, dir, vel: new THREE.Vector3(), life: 0.3, size: 0.005, sizeEnd: 0.05, color: 0xffffff, opacity: 0.9 });
            }
        }
        if (w.atFire(0.1)) {
            const tip = w.localPos(P.tip);
            const back = w.localPos(P.muzzle).sub(tip).normalize();
            for (let i = 0; i < 5; i++) {
                fx.emit({ pos: tip, vel: back.clone().multiplyScalar(K.rand(0.4, 0.9)).add(K.sphereDir().multiplyScalar(0.1)), life: 0.18, size: 0.002, sizeEnd: 0, color: 0xffffff, opacity: 0.6, drag: 3, stretch: 0.05 });
            }
        }
        const it = w.inspectT;
        if (it >= 0) {
            // Motes trailing the stroking hand.
            if (it > 0.7 && it < 1.6) {
                const z = K.lerp(-0.25, -0.6, K.e('inOutCubic', it, 0.65, 1.55));
                const p = w.localPos(P.model, [0, 0, z]);
                const n = fx.rate('stroke', 45, dt);
                for (let i = 0; i < n; i++) {
                    fx.emit({ pos: p.clone().add(K.sphereDir().multiplyScalar(0.02)), vel: K.sphereDir().multiplyScalar(0.03).add(new THREE.Vector3(0, 0.03, 0)), life: K.rand(0.4, 0.8), size: K.rand(0.002, 0.004), sizeEnd: 0.001, color: Math.random() < 0.7 ? glow : 0xffffff, drag: 2, fadeIn: 0.05 });
                }
            }
            // A glint running up the turned blade's edge.
            if (it > 2.0 && it < 2.4) {
                const d2 = K.seg(it, 2.0, 2.4) * 0.28 + 0.02;
                const s = Math.sin(it * 40) > 0 ? 1 : -1;
                const p = w.localPos(P.blade, [s * this.bladeR(d2), 0, -d2]);
                const n = fx.rate('glint', 70, dt);
                for (let i = 0; i < n; i++) {
                    fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.02), life: 0.18, size: 0.006, sizeEnd: 0, color: 0xffffff, drag: 4 });
                }
            }
            // The spin flings spores off the mushrooms.
            if (it > 2.75 && it < 3.05) {
                const n = fx.rate('fling', 60, dt);
                for (let i = 0; i < n; i++) {
                    const sh = P.shrooms[(Math.random() * P.shrooms.length) | 0];
                    const p = w.localPos(sh, [0, 0.01, 0]);
                    const out = p.clone().sub(w.localPos(P.model, [0, 0, -0.4])).setZ(0);
                    if (out.lengthSq() < 1e-8) {
                        out.set(0, 1, 0);
                    }
                    out.normalize().multiplyScalar(K.rand(0.1, 0.25));
                    fx.emit({ pos: p, vel: out.add(K.sphereDir().multiplyScalar(0.03)), life: K.rand(0.5, 0.9), size: 0.003, sizeEnd: 0.008, color: i % 3 ? 0xf2c4bc : glow, additive: i % 3 === 0, opacity: 0.55, drag: 2.5 });
                }
            }
        }
    }
});
