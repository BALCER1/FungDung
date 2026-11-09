Weapons.register('rifle', {
    name: 'Morel Carbine',
    altName: 'Burst',
    offset: [0.27, -0.17, -0.58],
    stats: {
        mag: 24, rate: 8.5, auto: true, damage: 18, pellets: 1, spread: 0.014, range: 120,
        reloadTime: 2.6, drawTime: 0.45,
        kick: { back: 0.028, up: 0.04, roll: 0.02 }
    },
    color: 0xffc44a,
    projectile: {
        speed: 80, color: 0xffb020, core: 0xfff3c8, maxDist: 60,
        radius: 0.02, length: 0.22, tail: 2.2,
        impact: { sparks: 3, size: 0.012 }
    },
    burstProjectile: {
        speed: 95, color: 0xffc940, core: 0xffffff, maxDist: 70,
        radius: 0.022, length: 0.28, tail: 2.8,
        impact: { sparks: 4, size: 0.014 }
    },
    inspect: { time: 3.3 },
    hands: { left: 'handguard', right: 'grip' },

    build(b) {
        const C = {
            stem: 0xdfcaa6, morel: 0x7a5434, gill: 0xb48a63, cap: 0x8b5a34, bracket: 0xc77b3a,
            bracket2: 0xe9c48a, wood: 0x4f3422, gold: 0xffc44a, dark: 0x1b120b, pouch: 0xc8b083, myc: 0xf6f2e8
        };
        const m = {
            stem: b.mat('stem', { color: C.stem }),
            morel: b.mat('morel', { color: C.morel, flatShading: true, roughness: 0.9 }),
            gill: b.mat('gill', { color: C.gill, side: THREE.DoubleSide }),
            cap: b.mat('cap', { color: C.cap, roughness: 0.55 }),
            bracket: b.mat('bracket', { color: C.bracket, roughness: 0.6, side: THREE.DoubleSide }),
            bracket2: b.mat('bracket2', { color: C.bracket2, roughness: 0.6, side: THREE.DoubleSide }),
            wood: b.mat('wood', { color: C.wood, flatShading: true, roughness: 0.95 }),
            dark: b.mat('dark', { color: C.dark, roughness: 1, side: THREE.DoubleSide }),
            glass: b.glass('glass', 0xfff4dd, 0.3),
            liquid: b.glow('liquid', C.gold, 1.1),
            gills: b.glow('gillGlow', C.gold, 0.2, { color: C.gill }),
            hatchGlow: b.glow('hatchGlow', C.gold, 0.6),
            pouch: b.mat('pouch', { color: C.pouch, flatShading: true, roughness: 0.95 }),
            myc: b.mat('myc', { color: C.myc }),
            bubble: b.glow('bubble', 0xfff2c8, 1.2, { transparent: true, opacity: 0.85 }),
            strap: b.mat('strap', { color: 0x5a4430, roughness: 0.9 })
        };
        const model = b.group();

        b.tubeZ(0.0135, 0.017, 0.58, m.stem, model, [0, 0.012, -0.43], { wobble: 0.0015 });
        for (const z of [-0.47, -0.58, -0.66]) {
            b.ring(0.018, 0.005, m.gill, model, [0, 0.012, z]);
        }
        const tip = b.lathe([[0.016, 0], [0.022, 0.012], [0.02, 0.03], [0.014, 0.048], [0.011, 0.052]], m.morel, model, [0, 0.012, -0.71], [-Math.PI / 2, 0, 0], { seg: 18 });
        b.displace(tip.geometry, v => 0.002 * Math.sin(Math.atan2(v.z, v.x) * 7) * Math.sin(v.y * 300));
        b.disc(0.011, m.dark, model, [0, 0.012, -0.76], [0, Math.PI, 0]);
        b.part(b.mini(model, [0, 0.026, -0.645], 0.02, m.cap, m.stem));

        b.tubeZ(0.027, 0.031, 0.22, m.stem, model, [0, 0.008, -0.27], { wobble: 0.002 });
        const brackets = [];
        for (const side of [-1, 1]) {
            [[-0.2, 0.028, 0.03, m.bracket], [-0.255, 0.012, 0.026, m.bracket2], [-0.31, 0.024, 0.022, m.bracket]].forEach(([z, y, r, mat], i) => {
                const g = b.group(model, [side * 0.026, y, z], [0, side > 0 ? 0 : Math.PI, 0]);
                b.mesh(new THREE.SphereGeometry(r, 16, 6, Math.PI / 2, Math.PI, 0, Math.PI / 2), mat, g, null, null, [1, 0.32, 1]);
                b.ring(r * 0.98, 0.0025, m.gill, g, null, [Math.PI / 2, 0, -Math.PI / 2], { arc: Math.PI, ts: 14 });
                brackets.push(b.part(g));
            });
        }

        b.tubeZ(0.03, 0.033, 0.32, m.stem, model, [0, -0.002, -0.02], { wobble: 0.0015 });

        const L = 0.26;
        const pts = [];
        for (let i = 0; i <= 18; i++) {
            const y = (i / 18) * L;
            pts.push([0.052 * Math.pow(Math.sin(Math.PI * y / L), 0.65) + 0.004 * (y / L), y]);
        }
        const morel = b.lathe(pts, m.morel, model, [0, 0.036, 0.11], [-Math.PI / 2, 0, 0], { seg: 34 });
        b.displace(morel.geometry, v => {
            const f = 150;
            const n = Math.sin(v.x * f) * Math.sin(v.y * f * 0.9) * Math.sin(v.z * f);
            return 0.006 * Math.pow(1 - Math.abs(n), 5) - 0.0025;
        });

        const hz = -0.035;
        const hy = 0.087;
        b.disc(0.022, m.dark, model, [0, hy - 0.001, hz], [-Math.PI / 2, 0, 0]);
        const hatchRim = b.ring(0.024, 0.003, m.hatchGlow, model, [0, hy, hz], [Math.PI / 2, 0, 0]);
        const hatch = b.part(b.group(model, [0, hy, hz + 0.028]));
        b.cap(0.03, 0.012, m.cap, m.gill, hatch, [0, 0.002, -0.028], null, { fins: 12, flat: 0.6 });
        b.sphere(0.005, m.stem, hatch, [0, 0.015, -0.028]);

        for (const side of [-1, 1]) {
            for (let i = 0; i < 6; i++) {
                b.box(0.003, 0.02, 0.011, m.gills, model, [side * 0.031, 0.0, -0.11 + i * 0.024], [0, 0, side * 0.15]);
            }
        }

        const vial = b.part(b.group(model, [0, -0.07, -0.085], [0.22, 0, 0]));
        b.mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.1, 18, 1, true), m.glass, vial);
        b.sphere(0.021, m.glass, vial, [0, -0.05, 0], null, { t0: Math.PI / 2, tl: Math.PI / 2 });
        const liqGeo = new THREE.CylinderGeometry(0.0165, 0.0165, 0.1, 16);
        liqGeo.translate(0, 0.05, 0);
        const liquid = b.part(b.mesh(liqGeo, m.liquid, vial, [0, -0.052, 0]));
        b.sphere(0.0165, m.liquid, vial, [0, -0.052, 0], null, { t0: Math.PI / 2, tl: Math.PI / 2, ws: 14, hs: 6 });
        b.ring(0.022, 0.004, m.gill, vial, [0, 0.048, 0], [Math.PI / 2, 0, 0]);
        b.ring(0.022, 0.003, m.gill, vial, [0, -0.02, 0], [Math.PI / 2, 0, 0]);

        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 0.5;
            b.tube([[Math.cos(a) * 0.024, 0.046, Math.sin(a) * 0.024], [Math.cos(a) * 0.026, 0, Math.sin(a) * 0.026], [Math.cos(a) * 0.022, -0.05, Math.sin(a) * 0.022]], 0.0016, 0.0016, m.myc, vial, { seg: 8, radial: 4 });
        }
        const bubbles = [];
        for (let i = 0; i < 5; i++) {
            const a = i * 2.4;
            bubbles.push(b.part(b.sphere(0.0022 + (i % 2) * 0.0012, m.bubble, vial, [Math.cos(a) * 0.009, -0.04, Math.sin(a) * 0.009], null, { ws: 6, hs: 4 })));
        }

        const selector = b.part(b.group(model, [-0.033, -0.004, 0.045]));
        b.mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.016, 6), m.stem, selector, [0, 0.008, 0]);
        b.cap(0.007, 0.006, m.cap, null, selector, [0, 0.016, 0], [0, 0, 0], { seg: 10 });
        b.sphere(0.004, m.stem, selector, [0, 0, 0], null, { ws: 8, hs: 6 });
        const pips = [];
        for (let i = 0; i < 3; i++) {
            const mat = b.glow('pip' + i, C.gold, 0.2, { color: 0x6b5222 });
            b.sphere(0.0034, mat, model, [-0.0335, 0.012, 0.06 + i * 0.011], null, { ws: 8, hs: 6 });
            pips.push(mat);
        }

        b.mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.05, 6), m.stem, model, [0, 0.085, 0.07]);
        b.ring(0.0075, 0.0022, m.cap, model, [0, 0.112, 0.07], null, { ts: 14, rs: 5 });
        for (let i = 0; i < 3; i++) {
            b.box(0.008, 0.004, 0.0035, m.dark, model, [0, 0.027, -0.68 - i * 0.009]);
        }

        b.ring(0.006, 0.0018, m.stem, model, [0, -0.026, -0.3], [0, Math.PI / 2, 0], { ts: 12, rs: 4 });
        b.ring(0.006, 0.0018, m.stem, model, [0, -0.05, 0.27], [0, Math.PI / 2, 0], { ts: 12, rs: 4 });
        const sling = b.part(b.group(model, [0, -0.03, 0]));
        b.tube([[0, 0.004, -0.3], [0.004, -0.06, -0.16], [0.006, -0.1, 0.0], [0.004, -0.085, 0.16], [0, -0.02, 0.27]], 0.0035, 0.0035, m.strap, sling, { seg: 40, radial: 5 });

        const bolt = b.part(b.group(model, [0.03, 0.012, 0.02]));
        b.mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.03, 8), m.stem, bolt, [0.015, 0, 0], [0, 0, Math.PI / 2]);
        b.cap(0.014, 0.012, m.cap, m.gill, bolt, [0.028, 0, 0], [0, 0, -Math.PI / 2], { fins: 0, seg: 14 });

        b.tube([[0, -0.02, 0.07], [0, -0.07, 0.09], [0, -0.13, 0.115]], 0.019, 0.017, m.wood, model, { wobble: 0.002, ends: true });
        b.ring(0.022, 0.0032, m.stem, model, [0, -0.03, 0.03], [0, Math.PI / 2, 0], { arc: Math.PI });
        b.box(0.004, 0.02, 0.007, m.gill, model, [0, -0.03, 0.035], [0.3, 0, 0]);
        b.tube([[0, 0.0, 0.13], [0, -0.008, 0.21], [0, -0.03, 0.3]], 0.028, 0.034, m.stem, model, { wobble: 0.002, ends: true });
        b.tube([[0, 0.028, 0.07], [0, 0.03, 0.2], [0, 0.0, 0.29]], 0.012, 0.016, m.wood, model, { wobble: 0.002, ends: true });
        b.sphere(0.036, m.stem, model, [0, 0.004, 0.132], [1, 1, 0.9], { ws: 20, hs: 14, wobble: 0.0015 });
        b.ring(0.034, 0.0065, m.gill, model, [0, 0.003, 0.112]);
        b.ring(0.031, 0.0055, m.gill, model, [0, -0.002, 0.155], [0.12, 0, 0]);
        b.cap(0.05, 0.016, m.cap, m.gill, model, [0, -0.032, 0.3], [Math.PI / 2, 0, 0], { fins: 16, flat: 0.5 });

        const muzzle = b.group(model, [0, 0.012, -0.77]);
        const flash = b.flash(muzzle, null, C.gold, 0.05, 2.5);

        const pouch = b.group();
        pouch.visible = false;
        b.part(pouch);
        const sack = b.lathe([[0.001, 0], [0.024, 0.008], [0.036, 0.03], [0.033, 0.055], [0.016, 0.075], [0.011, 0.082], [0.015, 0.09], [0.013, 0.094]], m.pouch, pouch, null, null, { seg: 20 });
        b.wobble(sack.geometry, 0.003, 50);
        sack.geometry.computeVertexNormals();
        b.ring(0.012, 0.003, m.myc, pouch, [0, 0.079, 0], [Math.PI / 2, 0, 0]);
        b.disc(0.012, m.hatchGlow, pouch, [0, 0.092, 0], [-Math.PI / 2, 0, 0]);
        b.tube([[0.012, 0.08, 0], [0.03, 0.07, 0.01], [0.034, 0.05, 0.02]], 0.0022, 0.0015, m.myc, pouch, { seg: 10, radial: 4 });
        const pouchMouth = b.group(pouch, [0, 0.095, 0]);
        b.part(model);

        const steady = b.group();
        b.grip('grip', steady, [0, -0.08, 0.095], { fingers: [0.65, -0.27, -0.65], back: [0.75, 0.1, 0.6], around: 0.018, curl: 0.9 });
        b.grip('handguard', steady, [0, 0.008, -0.255], { fingers: [0.8, -0.6, 0], back: [-0.6, -0.8, 0], around: 0.03, curl: 0.8 });
        b.grip('hatch', hatch, [-0.036, 0.008, -0.042], { fingers: [0.2, 0.3, -1], back: [-1, 0.4, 0], curl: 0.4 });
        b.grip('bolt', bolt, [0.028, 0, 0], { fingers: [0, -0.3, -1], back: [1, 0.3, 0], around: 0.014, curl: 0.75 });
        b.grip('hatchR', hatch, [0.036, 0.008, -0.042], { fingers: [-0.2, 0.3, -1], back: [1, 0.4, 0], curl: 0.4 });
        b.grip('vial', vial, [0.09, 0, 0], { fingers: [-1, 0, 0], back: [0, 1, 0], curl: 0.15 });
        b.grip('pouch', pouch, [0, 0.04, 0], { fingers: [0, 0.3, -1], back: [-1, -0.2, 0], around: 0.034, curl: 0.75 });

        return { model, morel, hatch, hatchRim, vial, liquid, bubbles, bolt, brackets, selector, pips, sling, muzzle, flashes: [flash], pouch, pouchMouth, steady, rigExtras: [pouch, steady], m };
    },

    init(w) {
        w.data.slosh = new Spring(120, 5);
        w.data.slingSpring = new Spring(40, 2.2);
        w.data.target = new THREE.Vector3();
        w.data.burst = 0;
        w.data.burstLeft = 0;
        w.data.sel = 0;
    },

    onFire(w, side, o) {
        w.data.slosh.kick(2 + Math.random() * 2);
        w.data.slingSpring.kick(o && o.mode === 'burst' ? 1.5 : 0.6);
    },

    altPress(w) {
        if (w.state !== 'ready' || w.cooldown > 0 || w.data.burst > 0) {
            return;
        }
        if (w.ammo <= 0) {
            w.reload();
            return;
        }
        w.data.burst = Math.min(3, w.ammo);
        w.data.burstLeft = w.data.burst;
    },
    altTick(w, dt, move) {
        if (w.data.burst <= 0) {
            return;
        }
        if (w.state !== 'ready' || (move && move.sprinting)) {
            w.data.burst = 0;
            return;
        }
        if (w.cooldown <= 0) {
            w.data.burst--;
            w.data.burstLeft = w.data.burst;
            w.fire({
                mode: 'burst', spread: 0.006, kickScale: 0.85, flashScale: 1.35,
                cooldown: w.data.burst > 0 ? 1 / 16 : 0.4,
                projectile: this.burstProjectile
            });
        }
    },
    cancel(w) {
        w.data.burst = 0;
    },

    fill(w) {
        const r = w.reloadT;
        if (r < 0) {
            return w.ammo / w.stats.mag;
        }
        return WeaponKit.lerp(w.reloadFrom / w.stats.mag, 1, WeaponKit.e('inOutSine', r, 0.95, 1.85));
    },

    pose(w, dt) {
        const P = w.parts;
        const K = WeaponKit;
        const f = w.fireT;
        const r = w.reloadT;
        w.data.slosh.update(dt);

        const fill = this.fill(w);
        P.liquid.scale.y = Math.max(0.02, fill);
        P.liquid.rotation.z = w.data.slosh.x * 0.08;
        P.m.liquid.emissiveIntensity = 0.7 + fill * 0.6 + Math.sin(w.time * 4) * 0.1;
        P.m.gills.emissiveIntensity = 0.15 + Math.exp(-f * 14) * 2.6 + (r >= 0 ? K.hump(r, 0.9, 1.9) * 0.9 : 0);
        P.bolt.position.z += K.hump(f, 0, 0.07) * 0.018;
        P.brackets.forEach((g, i) => {
            g.rotation.x += w.data.slosh.x * 0.02 * (i % 3 - 1);
        });

        P.sling.rotation.z += w.dangle(w.data.slingSpring, dt, 1.4) * 0.6;
        P.sling.rotation.x += w.data.slingSpring.v * 0.01;
        P.bubbles.forEach((bub, i) => {
            const ph = (w.time * (0.25 + i * 0.07) + i * 0.37) % 1;
            bub.position.y = -0.045 + ph * 0.095 * Math.max(0.05, fill);
            bub.position.x += Math.sin(w.time * 3 + i) * 0.002;
            bub.visible = fill > 0.05;
        });
        const burstOn = w.data.burst > 0 || (w.lastMode === 'burst' && f < 0.35);
        w.data.sel = K.lerp(w.data.sel, burstOn ? 1 : 0, Math.min(1, dt * 18));
        P.selector.rotation.x -= w.data.sel * 1.1;
        P.pips.forEach((mat, i) => {
            const lit = burstOn ? (i < w.data.burstLeft ? 1 : 0) : 0.15;
            mat.emissiveIntensity = 0.15 + lit * 1.8 + (burstOn ? 0 : Math.sin(w.time * 2 + i) * 0.05);
        });

        const it = w.inspectT;
        if (it >= 0) {
            const env = K.e('inOutCubic', it, 0, 0.5) * (1 - K.e('inOutCubic', it, 2.75, 3.3));
            P.model.rotation.y -= env * 1.05;
            P.model.rotation.x += env * 0.12;
            P.model.rotation.z -= env * 0.15;
            P.model.position.x -= env * 0.2;
            P.model.position.y += env * 0.07;
            P.model.position.z += env * 0.06;
            P.vial.rotation.z += K.hump(it, 0.85, 1.0) * 0.25;
            P.liquid.rotation.z += K.hump(it, 0.85, 1.3) * 0.15 * Math.sin(it * 30);
            if (w.atAct(0.9)) {
                w.data.slosh.kick(8);
            }
            P.hatch.rotation.x += K.hump(it, 1.25, 1.75) * 0.9;
            w.data.roll = K.e('inOutCubic', it, 1.9, 2.65) * Math.PI * 2;
            P.model.rotation.z += w.data.roll;
            P.bolt.position.z += K.hump(it, 2.75, 3.0) * 0.03;
        }

        if (r < 0) {
            return;
        }
        const tilt = K.e('outCubic', r, 0, 0.36) * (1 - K.e('inOutCubic', r, 2.05, 2.5));
        P.model.rotation.z += tilt * 0.45;
        P.model.rotation.x += tilt * 0.35;
        P.model.rotation.y += tilt * 0.12;
        P.model.position.x -= tilt * 0.1;
        P.model.position.y += tilt * 0.01;

        const open = K.e('outBack', r, 0.2, 0.46) * (1 - K.e('inCubic', r, 1.98, 2.1));
        P.hatch.rotation.x += open * 1.8;
        P.m.hatchGlow.emissiveIntensity = 0.6 + open * 1.4 + K.hump(r, 0.9, 1.9) * 1.5;

        const inP = K.e('outCubic', r, 0.3, 0.72);
        const outP = K.e('inCubic', r, 1.86, 2.16);
        P.pouch.visible = r > 0.3 && r < 2.16;
        if (P.pouch.visible) {
            const tgt = w.localPos(P.model, [0, 0.087, -0.04], w.data.target);
            tgt.x -= 0.088;
            tgt.y += 0.11;
            P.pouch.position.set(
                tgt.x - 0.22 * (1 - inP) + 0.05 * outP,
                tgt.y - 0.24 * (1 - inP) + 0.2 * outP,
                tgt.z + 0.06 * (1 - inP) + 0.12 * outP
            );
            const tip = K.e('outCubic', r, 0.68, 0.92) * (1 - K.e('inOutCubic', r, 1.78, 1.96));
            const pouring = K.seg(r, 0.9, 1.85) > 0 && r < 1.85;
            P.pouch.rotation.set(
                0.15 * tip,
                0,
                -tip * 2.05 + (pouring ? Math.sin(r * 38) * 0.07 : 0) + (1 - inP) * 0.8
            );
            if (pouring) {
                P.pouch.position.y += Math.sin(r * 29) * 0.003;
            }
            P.pouch.scale.multiplyScalar(K.lerp(0.4, 1, inP) * (1 - outP * 0.6));
        }

        const boltBack = K.e('outCubic', r, 2.16, 2.28) - K.e('outBack', r, 2.33, 2.45);
        P.bolt.position.z += boltBack * 0.05;
        P.model.rotation.z += boltBack * 0.06;
    },

    handPose(w, H) {
        const K = WeaponKit;
        const P = w.parts;
        const it = w.inspectT;
        P.steady.position.copy(P.model.position);
        P.steady.rotation.copy(P.model.rotation);
        P.steady.rotation.z -= it >= 0 ? w.data.roll : 0;
        if (it >= 0) {
            H.left.track(it, [[0.55, 0.8, 'vial'], [1.05, 1.25, 'hatchR'], [1.55, 1.8, 'handguard']]);
            const loose = K.hump(it, 1.8, 2.75);
            H.left.squeeze(-0.6 * loose);
            H.right.squeeze(-0.5 * loose);
            H.left.nudge(0, 0, -0.016 * K.hump(it, 0.82, 0.96));
            H.right.track(it, [[2.58, 2.74, 'bolt'], [3.02, 3.22, 'grip']]);
        }
        const r = w.reloadT;
        if (r < 0) {
            return;
        }
        H.left.track(r, [[0.08, 0.2, 'hatch'], [0.3, 0.52, 'pouch'], [1.92, 2.14, 'handguard']]);
        H.right.track(r, [[1.98, 2.15, 'bolt'], [2.42, 2.6, 'grip']]);
    },

    effects(w, dt) {
        const P = w.parts;
        const fx = w.fx;
        const K = WeaponKit;
        const gold = this.color;

        if (w.inspectT >= 0 && w.atAct(0.92)) {
            const p = w.localPos(P.vial, [0, 0.0, 0]);
            for (let i = 0; i < 10; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.06), attract: p, pull: 0.5, swirl: 4, life: 0.8, size: 0.003, color: gold, drag: 1, fadeIn: 0.05 });
            }
        }
        if (w.atFire(0) && w.lastMode === 'burst') {
            const o = w.worldPos(P.muzzle);
            const d = w.worldDir(P.muzzle);
            fx.emit({ world: true, shape: 'ring', pos: o, dir: d, vel: d.clone().multiplyScalar(2.5), life: 0.16, size: 0.02, sizeEnd: 0.09, color: 0xffffff, opacity: 0.8 });
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const side = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(P.muzzle.getWorldQuaternion(new THREE.Quaternion()));
                fx.emit({ world: true, pos: o, vel: side.multiplyScalar(1.2).addScaledVector(d, 1), life: 0.2, size: 0.004, sizeEnd: 0, color: gold, drag: 4, stretch: 0.02 });
            }
        }
        if (w.atFire(0)) {
            const o = w.worldPos(P.muzzle);
            const d = w.worldDir(P.muzzle);
            for (let i = 0; i < 7; i++) {
                fx.emit({ world: true, pos: o, vel: K.cone(d, 0.35).multiplyScalar(K.rand(1.5, 3.5)), life: K.rand(0.2, 0.4), size: 0.006, sizeEnd: 0.001, color: gold, drag: 3, stretch: 0.01 });
            }
            fx.emit({ world: true, pos: o, vel: d.clone().multiplyScalar(0.8), life: 0.5, size: 0.015, sizeEnd: 0.045, color: 0xd8c9a0, additive: false, opacity: 0.3, drag: 3, gravity: -0.2 });
            fx.emit({ world: true, shape: 'ring', pos: o, dir: d, vel: d.clone().multiplyScalar(1.2), life: 0.12, size: 0.015, sizeEnd: 0.06, color: gold, opacity: 0.7 });
            for (const side of [-1, 1]) {
                const p = w.localPos(P.model, [side * 0.034, 0, -0.05]);
                fx.emit({ pos: p, vel: new THREE.Vector3(side * 0.4, 0.1, 0), life: 0.3, size: 0.004, sizeEnd: 0.012, color: gold, opacity: 0.5, drag: 4 });
            }
        }

        const r = w.reloadT;
        if (r < 0) {
            return;
        }
        if (r > 0.9 && r < 1.85) {
            const mouth = w.localPos(P.pouchMouth);
            const n = fx.rate('pour', 160, dt);
            for (let i = 0; i < n; i++) {
                fx.emit({
                    pos: mouth.clone().add(new THREE.Vector3(K.rand(-0.004, 0.004), 0, K.rand(-0.004, 0.004))),
                    vel: new THREE.Vector3(K.rand(0.05, 0.2), K.rand(-0.15, 0), K.rand(-0.03, 0.03)),
                    life: 0.28, size: K.rand(0.0025, 0.0045), sizeEnd: 0.002, color: Math.random() < 0.8 ? gold : 0xfff2c8,
                    gravity: 3.2, drag: 0.6, fadeIn: 0.01
                });
            }
            const hatchPos = w.localPos(P.model, [0, 0.09, -0.035]);
            const g = fx.rate('glint', 30, dt);
            for (let i = 0; i < g; i++) {
                fx.emit({ pos: hatchPos, vel: K.sphereDir().multiplyScalar(0.12).add(new THREE.Vector3(0, 0.15, 0)), life: 0.4, size: 0.003, color: 0xfff2c8, drag: 2 });
            }
            const dust = fx.rate('dust', 12, dt);
            for (let i = 0; i < dust; i++) {
                fx.emit({ pos: hatchPos, vel: K.sphereDir().multiplyScalar(0.05).add(new THREE.Vector3(0, 0.08, 0)), life: 0.7, size: 0.006, sizeEnd: 0.022, color: 0xe9d9a8, additive: false, opacity: 0.3, drag: 2 });
            }
        }
        if (w.atAct(2.1)) {
            const p = w.localPos(P.model, [0, 0.095, -0.035]);
            for (let i = 0; i < 12; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.3).add(new THREE.Vector3(0, 0.15, 0)), life: 0.5, size: 0.005, sizeEnd: 0.018, color: 0xe9d9a8, additive: false, opacity: 0.45, drag: 4 });
            }
        }
        if (w.atAct(2.42)) {
            const p = w.localPos(P.bolt, [0.03, 0, 0]);
            for (let i = 0; i < 6; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.4), life: 0.25, size: 0.003, color: gold, drag: 3 });
            }
        }
    }
});
