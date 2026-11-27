// Rootbound Spear: melee poke along the crosshair. Hold RMB to charge a throw; the thrown spear
// sticks, dissolves into spores, and a new one regrows in the hand from tendrils and mycelium.
// The regrown spear is infused: its next `lifesteal.hits` pokes that hit an enemy heal the wielder.
// Charging grows a grapnel head of claws and thorns out of the blade's base, and it flies open: an enemy whose
// body passes within `throwCfg.hook` of the path is snagged, not only one the tip touches.
Weapons.register('spear', {
    name: 'Rootbound Spear',
    // Curve detail at High, on top of DETAIL.scale (see WeaponBuilder).
    segScale: { high: 0.7 },
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
    // regrow: length of the throw and regrow animations, release: seconds into the throw that the
    // spear leaves the hand. hook: metres past an enemy's radius the open grapnel snags it,
    // hookGrow: seconds into a charge over which it grows out in the hand, hookSpin: its spin in
    // flight in radians a second.
    // trail: life (s), width, spacing between samples, max samples, and the two twisting strands
    // (radius, drift outward per second, width, twist in radians per metre).
    throwCfg: {
        chargeTime: 0.6, minCharge: 0.3, speed: [18, 36], minDamage: 40, gravity: 5,
        life: 1.0, dissolve: 0.6, cooldown: 3.5, throwTime: 0.42, release: 0.05, regrow: 1.6, scale: 1.25,
        hook: 0.3, hookGrow: [0.03, 0.3], hookSpin: 9,
        trail: { life: 0.32, width: 0.12, spacing: 0.25, max: 48, radius: 0.07, drift: 0.5, strand: 0.03, twist: 2.6 }
    },
    // hits: lifesteal pokes a regrown spear carries, heal: HP per hit.
    lifesteal: { hits: 3, heal: 5 },
    color: 0xff8f84,
    inspect: { time: 3.6 },
    hands: { left: 'front', right: 'rear' },
    // Left hand pointing ahead while the right hand throws, then pulled down and in as the throw
    // goes (rig space).
    LEFT_AIM: { p: [-0.37, 0.03, -0.24], fingers: [0.25, 0.35, -1], back: [-0.35, 0.9, 0.25], curl: 0.3 },
    LEFT_PULL: { p: [-0.3, -0.14, -0.13], fingers: [0.45, 0.1, -1], back: [-0.5, 0.8, 0.2], curl: 0.9 },
    // Model offsets [x, y, z, rot x, rot y, rot z] through the throw: the spear whipped forward at
    // release, and the empty hand's follow-through down and across the body.
    THRUST: [-0.03, 0.05, -0.32, -0.05, 0.05, 0.06],
    FOLLOW: [-0.13, -0.15, -0.4, -0.38, 0.24, 0.12],

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
            claw: b.glow('claw', 0xff6a5d, 0.25, { color: 0xf1e2d4, roughness: 0.35, metalness: 0.2 }),
            halo: new THREE.MeshBasicMaterial({ color: 0xff5a4c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
        };
        // Emissive the claws keep on the thrown copy (`flyingMesh` resets the rest to 0).
        m.claw.userData.flyGlow = 0.6;
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
        const { hook, tines } = this.buildHook(b, model, m, fixed);

        const tip = b.group(model, [0, 0, this.BLADE_Z - 0.3]);
        const muzzle = b.group(model, [0, 0, this.BLADE_Z - 0.2]);
        const rear = b.grip('rear', model, [0, 0, 0.08], { fingers: [-1, 0.25, 0], back: [0.25, 1, 0], around: R + 0.002, curl: 0.95 });
        const front = b.part(b.grip('front', model, [0, 0, -0.25], { fingers: [1, 0.3, 0], back: [0.3, -1, 0], around: R + 0.002, curl: 0.85 }));
        b.grip('reach', model, [0, 0, -0.53], { fingers: [1, 0.3, 0], back: [0.3, -1, 0], around: R + 0.002, curl: 0.8 });
        // Open hand on the root binding below the socket, for the inspect.
        b.grip('stroke', model, [0, 0, -0.6], { fingers: [1, 0.3, 0], back: [0.3, -1, 0], around: R + 0.006, curl: 0.3 });
        return { model, body, veins, web, hook, tines, blade, guard, tip, muzzle, rear, front, shrooms, tendrils, nodes, hairs, m };
    },

    // Grapnel head around the blade's base: six bone claws that reach out and curl back (each with
    // a root sheath and a forward barb) and six short thorns between them, angled forward. Each
    // sits on a hinge; `userData.tine` holds its swing (rotation.y) folded, open and clamped on a
    // hit. In the hand it grows out and opens while a throw charges; the thrown copy leaves open.
    buildHook(b, model, m, fixed) {
        const hook = b.group(model, [0, 0, this.BLADE_Z - 0.004]);
        hook.visible = false;
        b.part(hook);
        const tines = [];
        const n = 6;
        for (let i = 0; i < n; i++) {
            const a = ((i + 0.5) / n) * Math.PI * 2;
            const hinge = b.group(hook, [Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0], [0, 0, a]);
            const claw = b.part(b.group(hinge));
            claw.userData.tine = { fold: -1.25, open: 0, grab: -0.45 };
            const s = (i % 2 ? 1 : -1) * 0.007;
            const L = p => p.map(v => v * 1.25);
            const pts = [[0, 0, 0.012], [0.03, s * 0.3, -0.022], [0.07, s, -0.034], [0.11, s * 0.8, -0.016], [0.135, s * 0.3, 0.025], [0.14, 0, 0.06], [0.132, 0, 0.082]].map(L);
            fixed(b.tube(pts, 0.0095, 0.0008, m.claw, claw, { seg: 22, radial: 6 }));
            fixed(b.tube(pts.slice(0, 3), 0.0125, 0.0075, m.rootDark, claw, { seg: 8, radial: 6 }));
            fixed(b.tube([[0.07, s, -0.034], [0.085, s, -0.058], [0.093, s, -0.076]].map(L), 0.0055, 0.0005, m.claw, claw, { seg: 6, radial: 5 }));
            tines.push(claw);
        }
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const hinge = b.group(hook, [Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.01], [0, 0, a]);
            const thorn = b.part(b.group(hinge));
            thorn.userData.tine = { fold: -1.0, open: 0, grab: 0.12 };
            fixed(b.tube([[0, 0, 0], [0.036, 0, -0.036], [0.068, 0, -0.08]], 0.0068, 0.0005, m.claw, thorn, { seg: 8, radial: 5 }));
            tines.push(thorn);
        }
        b.ring(0.017, 0.006, m.rootDark, hook, [0, 0, 0.004], null, { ts: 14, rs: 5 });
        return { hook, tines };
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
        if (w.state === 'charge' || (w.state === 'throw' && !w.data.launched)) {
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
        d.armed = false;
        d.relC = 0;
        d.windA = 0;
        d.hookS = 0;
        d.hookO = 0;
        d.hookSpin = 0;
        d.pose = [0, 0, 0, 0, 0, 0];
        d.trail = null;
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
                // No pose blend: the throw starts from the wind-up pose and whips forward at once.
                w.setState('throw', false);
            }
        }
        // The spear leaves the hand `release` seconds into the throw (or as the throw ends, if a
        // remote copy's state moved on first).
        const throwing = w.state === 'throw';
        if (throwing && !d.launched) {
            d.armed = true;
        }
        if (d.armed && (!throwing || w.actT + dt >= T.release)) {
            d.armed = false;
            d.launched = true;
            this.launch(w);
        }
        if (!throwing) {
            d.launched = false;
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
        d.armed = false;
        d.regrowing = false;
    },

    dispose(w) {
        this.drop(w);
        const tr = w.data.trail;
        if (tr) {
            if (tr.mesh.parent) {
                tr.mesh.parent.remove(tr.mesh);
            }
            tr.mesh.geometry.dispose();
            tr.mesh.material.map.dispose();
            tr.mesh.material.dispose();
            w.data.trail = null;
        }
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
            damage: Math.round(K.lerp(T.minDamage, this.modeDamage.throw, c)), m4: new THREE.Matrix4(),
            hp: new THREE.Vector3(), spin: d.hookSpin, hitT: -1
        };
        if (!w.remote) {
            d.cool = T.cooldown;
        }
        d.relC = d.charge;
        d.charge = 0;
        // The rig lurches forward with the release.
        w.recoilZ.kick(-1.6 - c);
        w.recoilX.kick(-1.4);
        w.recoilR.kick(0.9);
        const tr = this.trail(w);
        tr.pts.length = 0;
        tr.live = true;
        // Something between the eye and the launch point (a wall right in front) is hit at once.
        const gap = start.clone().sub(origin);
        const block = w.trace ? w.trace(origin, gap.clone().normalize(), gap.length()) : null;
        if (block) {
            this.flyHit(w, f, block);
        }
        this.placeFlying(f);
        this.poseHook(f, 0);
        // Release burst: a shock ring around the shaft and a spray of spores and streaks.
        const at = start.clone().addScaledVector(f.dir, 0.4);
        w.fx.emit({ world: true, shape: 'ring', pos: at, dir: f.dir, vel: new THREE.Vector3(), life: 0.22, size: 0.03, sizeEnd: 0.28 + 0.12 * c, color: this.color, opacity: 0.85 });
        for (let i = 0; i < 14; i++) {
            w.fx.emit({ world: true, pos: at, vel: K.cone(f.dir, 0.6).multiplyScalar(K.rand(0.5, 2.5)), life: K.rand(0.25, 0.45), size: 0.003, sizeEnd: 0.008, color: i % 3 ? this.color : 0xffffff, opacity: 0.7, drag: 3 });
        }
        for (let i = 0; i < 6; i++) {
            w.fx.emit({ world: true, pos: at, vel: K.cone(f.dir, 0.25).multiplyScalar(K.rand(3, 6)), life: K.rand(0.1, 0.18), size: 0.004, sizeEnd: 0, color: 0xffffff, drag: 4, stretch: 0.05 });
        }
    },

    // A world copy of the spear body and its grapnel head, with its own materials (so its glow
    // does not leak into the spear in the hand).
    flyingMesh(w) {
        const mesh = w.parts.body.clone(true);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.setScalar(1);
        const hook = w.parts.hook.clone(true);
        hook.visible = true;
        mesh.add(hook);
        const tines = [];
        hook.traverse(o => {
            o.visible = true;
            if (o.userData.tine) {
                tines.push(o);
            }
        });
        const mats = new Map();
        mesh.traverse(o => {
            o.layers.set(0);
            if (o.material) {
                if (!mats.has(o.material)) {
                    const c = o.material.clone();
                    if (c.emissive) {
                        c.emissive.set(0xff6f63);
                        c.emissiveIntensity = c.userData.flyGlow || 0;
                    }
                    mats.set(o.material, c);
                }
                o.material = mats.get(o.material);
            }
        });
        mesh.userData.mats = [...mats.values()];
        mesh.userData.hook = hook;
        mesh.userData.tines = tines;
        return mesh;
    },

    // The thrown copy's grapnel: it leaves the hand fully open, flares forward a little as it
    // flies off, spins in flight, and the claws clamp down when it hits something.
    poseHook(f, dt) {
        const K = WeaponKit;
        const T = this.throwCfg;
        const flare = 0.25 * K.hump(f.t, 0, 0.16);
        const grab = f.hitT >= 0 ? K.e('outCubic', f.t, f.hitT, f.hitT + 0.1) : 0;
        for (const o of f.mesh.userData.tines) {
            const u = o.userData.tine;
            o.rotation.y = K.lerp(u.open + flare, u.grab, grab);
            o.scale.setScalar(1);
        }
        if (!f.landed && !f.stuck) {
            f.spin += dt * T.hookSpin;
        }
        f.mesh.userData.hook.rotation.z = f.spin;
    },

    // How far past an enemy's radius the grapnel snags it (open from the moment it is thrown).
    reach(f) {
        return this.throwCfg.hook;
    },

    scratch: null,
    sv() {
        return this.scratch || (this.scratch = Array.from({ length: 8 }, () => new THREE.Vector3()));
    },

    // Closest points of segments p1-q1 and p2-q2: { s, t } along each (0..1) and d2, the squared
    // distance between them.
    segSeg(p1, q1, p2, q2, out) {
        const V = this.sv();
        const d1 = V[0].subVectors(q1, p1);
        const d2 = V[1].subVectors(q2, p2);
        const r = V[2].subVectors(p1, p2);
        const a = d1.dot(d1);
        const e = d2.dot(d2);
        const f = d2.dot(r);
        const cl = WeaponKit.clamp;
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
        const pa = V[3].copy(p1).addScaledVector(d1, s);
        const pb = V[4].copy(p2).addScaledVector(d2, t);
        out.s = s;
        out.t = t;
        out.d2 = pa.distanceToSquared(pb);
        return out;
    },

    // The first live enemy along the path a -> b whose body (a vertical segment, its radius wide)
    // comes within `reach` of it, with a hit on its model: { hit, s } (s is the fraction along the
    // path), or null. The body point aimed at stays below the head, so a near miss over an enemy
    // is not a head shot; a direct hit from the normal trace still is.
    hookHit(a, b, reach) {
        const room = typeof Game !== 'undefined' && Game.room;
        if (!(reach > 0) || !room || typeof Enemies === 'undefined') {
            return null;
        }
        const V = this.sv();
        const q0 = V[5];
        const q1 = V[6];
        const cands = [];
        const ss = {};
        for (const e of Enemies.list) {
            if (e.dead) {
                continue;
            }
            q0.set(e.pos.x, e.pos.y + e.height * 0.15, e.pos.z);
            q1.set(e.pos.x, e.pos.y + e.height * 0.7, e.pos.z);
            const r = e.radius + reach;
            if (this.segSeg(a, b, q0, q1, ss).d2 <= r * r) {
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
            q.set(e.pos.x, e.pos.y + e.height * WeaponKit.lerp(0.15, 0.7, c.t), e.pos.z);
            n.copy(q).sub(p);
            const dist = n.length();
            if (dist > 1e-3) {
                n.multiplyScalar(1 / dist);
            } else {
                n.copy(b).sub(a).normalize();
            }
            // From the spear toward the body; if the spear is already inside the model, from
            // just outside it.
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

    // First thing a ray meets: a hit on a live enemy, or null if a wall (anything else) comes first.
    // Corpses are passed through. Same raycaster as `Arsenal.trace`, so batched models count.
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
        f.hitT = f.t;
        this.endTrail(w, hit.point);
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
            const step = f.vel.length() * dt;
            const hit = w.trace ? w.trace(f.pos, f.dir, step) : null;
            // The open grapnel snags an enemy the path passes close to, if it comes before
            // whatever the tip itself would hit. The spear swings into it as it latches on.
            const end = this.sv()[7].copy(f.pos).addScaledVector(f.vel, dt);
            const snag = this.hookHit(f.pos, end, this.reach(f));
            if (snag && (!hit || snag.s * step <= hit.distance + 0.05)) {
                const at = f.pos.clone().lerp(end, snag.s);
                f.dir.lerp(snag.hit.point.clone().sub(at).normalize(), 0.7).normalize();
                this.flyHit(w, f, snag.hit);
            } else if (hit) {
                this.flyHit(w, f, hit);
            } else {
                f.pos.copy(end);
                const n = fx.rate('trail', 50, dt);
                for (let i = 0; i < n; i++) {
                    fx.emit({ world: true, pos: f.mesh.localToWorld(_ev.set(0, 0, -Math.random() * 0.8)), vel: K.sphereDir().multiplyScalar(0.15), life: K.rand(0.3, 0.6), size: 0.006, sizeEnd: 0.002, color: Math.random() < 0.6 ? this.color : 0xffffff, drag: 2 });
                }
            }
        }
        this.placeFlying(f);
        this.poseHook(f, dt);
        // Where the grapnel sits (the blade's base), for the trail and the snap.
        f.hp.copy(f.pos).addScaledVector(f.dir, -0.3 * T.scale);
        if (!f.landed && !f.stuck) {
            this.feedTrail(w.data.trail, f.hp, f.dir, dt);
            // The head snaps open: a ring the size of its reach and spores flung out sideways.
            const snap = 0.05;
            if (f.t - dt < snap && f.t >= snap) {
                fx.emit({ world: true, shape: 'ring', pos: f.hp, dir: f.dir, vel: new THREE.Vector3(), life: 0.2, size: 0.05, sizeEnd: T.hook + 0.15, color: this.color, opacity: 0.8 });
                for (let i = 0; i < 12; i++) {
                    const side = K.sphereDir().addScaledVector(f.dir, -K.sphereDir().dot(f.dir)).normalize();
                    fx.emit({ world: true, pos: f.hp, vel: side.multiplyScalar(K.rand(1.5, 3)).addScaledVector(f.vel, 0.5), life: K.rand(0.15, 0.3), size: 0.005, sizeEnd: 0, color: i % 3 ? this.color : 0xffffff, drag: 5, stretch: 0.03 });
                }
            }
        }
        // Dissolve: the spear glows, shrinks toward its middle and comes apart into spores.
        const k = K.seg(f.t, f.end, f.end + T.dissolve);
        const glow = K.seg(f.t, f.end - 0.25, f.end + 0.2);
        for (const mat of f.mesh.userData.mats) {
            if (mat.emissive) {
                mat.emissiveIntensity = (mat.userData.flyGlow || 0) + glow * 1.4;
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
        const tr = w.data.trail;
        if (tr) {
            tr.pts.length = 0;
            tr.live = false;
            tr.mesh.visible = false;
        }
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

    // ------------------------------------------------------------------ trail

    // Ribbon behind the thrown spear: a glowing band along the flight path (it follows the arc)
    // with two strands twisting around it and drifting apart as they fade. One mesh of three
    // camera-facing strips, additive, faded through vertex colours, so it is one draw call. Built
    // once per weapon, in world space under `fx.worldParent` (the scene).
    trail(w) {
        const d = w.data;
        if (d.trail) {
            if (!d.trail.mesh.parent && w.fx.worldParent) {
                w.fx.worldParent.add(d.trail.mesh);
            }
            return d.trail;
        }
        const N = this.throwCfg.trail.max;
        const V = 3 * N * 2;
        const geo = new THREE.BufferGeometry();
        const pos = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
        const col = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
        pos.setUsage(THREE.DynamicDrawUsage);
        col.setUsage(THREE.DynamicDrawUsage);
        const uv = new Float32Array(V * 2);
        const idx = [];
        for (let s = 0; s < 3; s++) {
            for (let i = 0; i < N; i++) {
                const v = (s * N + i) * 2;
                uv[v * 2] = 0;
                uv[v * 2 + 1] = 0.5;
                uv[v * 2 + 2] = 1;
                uv[v * 2 + 3] = 0.5;
                if (i < N - 1) {
                    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
                }
            }
        }
        geo.setAttribute('position', pos);
        geo.setAttribute('color', col);
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        const mat = new THREE.MeshBasicMaterial({
            map: this.trailTexture(), vertexColors: true, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        mat.fog = false;
        mat.toneMapped = false;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.visible = false;
        if (w.fx.worldParent) {
            w.fx.worldParent.add(mesh);
        }
        d.trail = {
            mesh, pts: [], list: [], live: false, cs: Array.from({ length: N }, () => new THREE.Vector3()),
            head: { p: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3(), s: 0, age: 0 },
            cam: new THREE.Vector3(), tan: new THREE.Vector3(), off: new THREE.Vector3()
        };
        return d.trail;
    },

    // Across the band: soft pink edges, a hot white core.
    trailTexture() {
        const W = 64;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = 2;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(W, 2);
        const c = new THREE.Color(this.color);
        for (let x = 0; x < W; x++) {
            const u = Math.abs((x + 0.5) / W * 2 - 1);
            const body = Math.pow(1 - u, 1.6);
            const hot = Math.exp(-Math.pow(u / 0.22, 2)) * 0.85;
            for (let y = 0; y < 2; y++) {
                const i = (y * W + x) * 4;
                img.data[i] = Math.min(255, (c.r * body + hot) * 255);
                img.data[i + 1] = Math.min(255, (c.g * body + hot) * 255);
                img.data[i + 2] = Math.min(255, (c.b * body + hot) * 255);
                img.data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return new THREE.CanvasTexture(cv);
    },

    trailPoint(p, dir, s, age, out) {
        const q = out || { p: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3(), s: 0, age: 0 };
        q.p.copy(p);
        q.side.set(0, 1, 0).cross(dir);
        if (q.side.lengthSq() < 1e-6) {
            q.side.set(1, 0, 0);
        }
        q.side.normalize();
        q.up.crossVectors(dir, q.side).normalize();
        q.s = s;
        q.age = age;
        return q;
    },

    // Adds samples up to the grapnel's position, `spacing` apart (several per frame when it moves
    // fast, spread over the frame's time so they fade evenly).
    feedTrail(tr, p, dir, dt) {
        if (!tr || !tr.live) {
            return;
        }
        const C = this.throwCfg.trail;
        const pts = tr.pts;
        const last = pts[pts.length - 1];
        if (!last) {
            pts.push(this.trailPoint(p, dir, 0, 0));
            return;
        }
        const gap = last.p.distanceTo(p);
        if (gap >= C.spacing) {
            const from = last.p.clone();
            const steps = Math.min(8, Math.floor(gap / C.spacing));
            for (let k = 1; k <= steps; k++) {
                const u = k / steps;
                pts.push(this.trailPoint(from.clone().lerp(p, u), dir, last.s + gap * u, (1 - u) * dt));
            }
        }
        while (pts.length > C.max - 1) {
            pts.shift();
        }
    },

    // The spear hit something: the trail runs up to the impact and stops growing.
    endTrail(w, point) {
        const tr = w.data.trail;
        const f = w.data.flying;
        if (!tr || !tr.live) {
            return;
        }
        if (f) {
            this.feedTrail(tr, point, f.dir, 0);
            const last = tr.pts[tr.pts.length - 1];
            if (last && last.p.distanceToSquared(point) > 1e-4) {
                tr.pts.push(this.trailPoint(point, f.dir, last.s + last.p.distanceTo(point), 0));
            }
        }
        tr.live = false;
    },

    updateTrail(w, dt) {
        const tr = w.data.trail;
        if (!tr) {
            return;
        }
        const C = this.throwCfg.trail;
        const N = C.max;
        const pts = tr.pts;
        for (const q of pts) {
            q.age += dt;
        }
        while (pts.length && pts[0].age > C.life) {
            pts.shift();
        }
        const list = tr.list;
        list.length = 0;
        for (const q of pts) {
            list.push(q);
        }
        const f = w.data.flying;
        const last = pts[pts.length - 1];
        if (tr.live && f && last) {
            list.push(this.trailPoint(f.hp, f.dir, last.s + last.p.distanceTo(f.hp), 0, tr.head));
        }
        const n = Math.min(N, list.length);
        tr.mesh.visible = n >= 2;
        if (n < 2) {
            return;
        }
        tr.cam.setFromMatrixPosition(camera.matrixWorld);
        const pos = tr.mesh.geometry.attributes.position;
        const col = tr.mesh.geometry.attributes.color;
        const P = pos.array;
        const Cl = col.array;
        const cs = tr.cs;
        const tan = tr.tan;
        const off = tr.off;
        for (let s = 0; s < 3; s++) {
            // Centres of this strip: the band on the path, the strands on a widening helix.
            for (let i = 0; i < n; i++) {
                const q = list[i];
                cs[i].copy(q.p);
                if (s > 0) {
                    const a = q.s * C.twist + (s === 2 ? Math.PI : 0);
                    const r = C.radius + q.age * C.drift;
                    cs[i].addScaledVector(q.side, Math.cos(a) * r).addScaledVector(q.up, Math.sin(a) * r);
                }
            }
            for (let i = 0; i < N; i++) {
                const v = (s * N + i) * 2;
                const j = Math.min(i, n - 1);
                const q = list[j];
                const k = i < n ? Math.max(0, 1 - q.age / C.life) : 0;
                const width = (s === 0 ? C.width * (0.3 + 0.7 * k) : C.strand * k) * 0.5;
                const bright = i < n ? (s === 0 ? Math.pow(k, 1.3) : 0.9 * k) : 0;
                tan.copy(cs[Math.min(j + 1, n - 1)]).sub(cs[Math.max(j - 1, 0)]);
                off.copy(cs[j]).sub(tr.cam).cross(tan);
                const len = off.length();
                off.multiplyScalar(len > 1e-8 ? width / len : 0);
                const c = cs[j];
                P[v * 3] = c.x + off.x;
                P[v * 3 + 1] = c.y + off.y;
                P[v * 3 + 2] = c.z + off.z;
                P[v * 3 + 3] = c.x - off.x;
                P[v * 3 + 4] = c.y - off.y;
                P[v * 3 + 5] = c.z - off.z;
                for (let m = 0; m < 6; m++) {
                    Cl[v * 3 + m] = bright;
                }
            }
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
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

    // Wind-up offsets [x, y, z, rot x, rot y, rot z] of the model for a charged throw: `a` is how
    // far the spear has come up (0..1), `c` the eased charge, which draws it further back.
    windup(a, c, out) {
        out[0] = a * 0.03 + c * 0.015;
        out[1] = a * 0.14 + c * 0.03;
        out[2] = a * 0.1 + c * 0.17;
        out[3] = a * 0.1 + c * 0.07;
        out[4] = -a * 0.05 - c * 0.03;
        out[5] = -a * 0.1 - c * 0.08;
        return out;
    },

    addPose(M, o) {
        M.position.x += o[0];
        M.position.y += o[1];
        M.position.z += o[2];
        M.rotation.x += o[3];
        M.rotation.y += o[4];
        M.rotation.z += o[5];
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

        // Grapnel in the hand: when a throw starts charging, the claws and thorns grow out of the
        // blade's base, open wider as the charge builds and turn slowly, quivering at full power.
        // The release whip snaps them fully open, and the thrown copy leaves open.
        let hs = 0;
        let ho = 0;
        if (w.state === 'charge') {
            const c = K.ease.outCubic(d.charge);
            hs = K.e('outBack', w.actT, T.hookGrow[0], T.hookGrow[1]) * K.lerp(0.7, 1, c);
            ho = K.lerp(0.2, 0.85, c);
            d.hookS = hs;
            d.hookO = ho;
        } else if (w.state === 'throw' && !d.launched) {
            const r = K.e('outCubic', w.actT, 0, T.release);
            hs = K.lerp(d.hookS, 1, r);
            ho = K.lerp(d.hookO, 1, r);
        }
        P.hook.visible = hs > 0.01;
        if (P.hook.visible) {
            const q = w.state === 'charge' && d.charge >= 1 ? 0.05 * Math.sin(w.time * 18) : 0;
            for (const o of P.tines) {
                const u = o.userData.tine;
                o.rotation.y = K.lerp(u.fold, u.open, ho) + q;
                o.scale.setScalar(Math.max(0.001, hs));
            }
            d.hookSpin += dt * (0.5 + 2.5 * ho);
            P.hook.rotation.z = d.hookSpin;
        }

        // Charging a throw: the spear comes up beside the head and is drawn far back, tip raised and
        // rolled, shaking harder as the charge builds.
        if (w.state === 'charge') {
            const a = K.e('outCubic', w.actT, 0, 0.22);
            d.windA = a;
            this.addPose(M, this.windup(a, K.ease.outCubic(d.charge), d.pose));
            const tremble = d.charge >= 1 ? 0.0025 : 0.0008 * d.charge;
            M.position.x += Math.sin(w.time * 47) * tremble;
            M.position.y += Math.sin(w.time * 53) * tremble;
        }
        // Throwing: from the wind-up the spear whips forward and leaves the hand at `release`; the
        // empty hand follows through down and across the body, then comes back up for the regrow.
        if (w.state === 'throw') {
            P.veins.visible = false;
            P.body.visible = !d.launched;
            const t = w.actT;
            const o = this.windup(d.windA, K.ease.outCubic(d.launched ? d.relC : d.charge), d.pose);
            const r = K.e('inQuad', t, 0, T.release);
            const fo = K.e('outCubic', t, T.release * 0.6, 0.2);
            const back = K.e('inOutCubic', t, 0.2, T.throwTime);
            for (let i = 0; i < 6; i++) {
                o[i] = K.lerp(K.lerp(o[i], this.THRUST[i], r), this.FOLLOW[i], fo) * (1 - back);
            }
            this.addPose(M, o);
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
            // The front arm pulls down as the throw goes, and is pointing again for the regrow.
            H.left.to(this.LEFT_AIM, 1);
            H.left.to(this.LEFT_PULL, K.e('outCubic', t, 0.01, 0.15) * (1 - K.e('inOutCubic', t, 0.24, T.throwTime)));
            H.right.squeeze(0.15 * (1 - K.seg(t, 0, T.release)) - 0.8 * K.e('outQuad', t, T.release * 0.8, T.release + 0.07));
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
        this.updateTrail(w, dt);

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
        // The grapnel sprouting: a puff of spores and splinters at the blade's base.
        if (w.state === 'charge' && w.atAct(0.08)) {
            const at = w.localPos(P.hook);
            for (let i = 0; i < 14; i++) {
                fx.emit({ pos: at, vel: K.sphereDir().multiplyScalar(K.rand(0.08, 0.25)), life: K.rand(0.2, 0.4), size: K.rand(0.002, 0.005), sizeEnd: 0, color: i % 3 ? glow : 0xffffff, drag: 3 });
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
