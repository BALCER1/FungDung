Weapons.register('sniper', {
    name: 'Amanita Longshot',
    altName: 'Scope',
    offset: [0.27, -0.18, -0.6],
    stats: {
        mag: 5, rate: 0.95, auto: true, damage: 95, pellets: 1, spread: 0.028, range: 300,
        reloadTime: 3.0, drawTime: 0.6,
        kick: { back: 0.15, up: 0.3, roll: 0.06 }
    },
    color: 0xc77dff,
    projectile: {
        speed: 130, color: 0xb45cff, core: 0xffffff, maxDist: 120,
        radius: 0.026, length: 0.45, tail: 5,
        impact: { sparks: 6, size: 0.018, ring: 0.35 }
    },
    scope: { fov: 16, sensitivity: 0.3 },
    inspect: { time: 3.4 },
    hands: { left: 'forend', right: 'grip' },

    build(b) {
        const C = {
            stem: 0xf2e9d8, cap: 0xc92f28, spot: 0xfaf4e8, gill: 0xf0e2c8, wood: 0x6b4a33,
            glow: 0xc77dff, dark: 0x140c18, myc: 0xf6f2e8
        };
        const m = {
            stem: b.mat('stem', { color: C.stem }),
            cap: b.mat('cap', { color: C.cap, roughness: 0.42 }),
            spot: b.glow('spot', C.glow, 0.4, { color: 0xb9afa6, roughness: 0.7 }),
            gill: b.mat('gill', { color: C.gill, side: THREE.DoubleSide }),
            wood: b.mat('wood', { color: C.wood, flatShading: true, roughness: 0.95 }),
            dark: b.mat('dark', { color: C.dark, roughness: 1, side: THREE.DoubleSide }),
            lens: b.glow('lens', C.glow, 1.4),
            lensRear: b.glow('lensRear', 0x3a1850, 0.25, { color: 0x2a1238, roughness: 0.1 }),
            myc: b.mat('myc', { color: C.myc }),
            spotWhite: b.mat('spotWhite', { color: C.spot })
        };
        const model = b.group();

        b.tubeZ(0.012, 0.016, 0.8, m.stem, model, [0, 0.008, -0.54], { wobble: 0.001 });
        const coils = [];
        for (let i = 0; i < 7; i++) {
            const mat = b.glow('coil' + i, C.glow, 0.2, { color: C.gill });
            const z = -0.22 - i * 0.095;
            const g = b.group(model, [0, 0.008, z]);
            b.ring(0.02 - i * 0.0006, 0.0045, mat, g);
            b.lathe([[0.012, 0], [0.024 - i * 0.0006, 0.004], [0.026 - i * 0.0006, 0.007]], mat, g, null, [Math.PI / 2, 0, 0], { seg: 20 });
            coils.push({ g: b.part(g), mat });
        }
        const volva = b.lathe([[0.015, 0], [0.024, 0.01], [0.026, 0.03], [0.022, 0.05], [0.025, 0.056]], m.gill, model, [0, 0.008, -0.92], [-Math.PI / 2, 0, 0], { seg: 20 });
        b.displace(volva.geometry, v => (v.y > 0.045 ? 0.004 * Math.sin(Math.atan2(v.z, v.x) * 9) : 0));
        b.disc(0.013, m.dark, model, [0, 0.008, -0.968], [0, Math.PI, 0]);
        for (const s of [-1, 1]) {
            b.tube([[s * 0.008, -0.01, -0.5], [s * 0.016, -0.02, -0.62], [s * 0.014, -0.022, -0.76]], 0.004, 0.0025, m.wood, model, { seg: 12, radial: 6, ends: true });
        }
        b.ring(0.018, 0.004, m.wood, model, [0, -0.002, -0.5], [0, 0, 0], { scale: [1.2, 1, 1] });

        b.tubeZ(0.035, 0.04, 0.32, m.stem, model, [0, 0, -0.02], { wobble: 0.0015 });
        const skirt = b.lathe([[0.039, 0], [0.047, 0.012], [0.058, 0.026], [0.064, 0.034]], m.gill, model, [0, 0, 0.06], [Math.PI / 2, 0, 0], { seg: 30 });
        b.displace(skirt.geometry, v => (v.y > 0.02 ? 0.003 * Math.sin(Math.atan2(v.z, v.x) * 11) : 0));

        const reactor = b.part(b.group(model, [0, 0.03, -0.03]));
        b.mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.04, 14), m.stem, reactor, [0, 0.012, 0]);
        b.ring(0.022, 0.004, m.gill, reactor, [0, 0.022, 0], [Math.PI / 2, 0, 0]);
        const cap = b.part(b.cap(0.088, 0.052, m.cap, m.gill, reactor, [0, 0.03, 0], null, { flat: 0.7, fins: 24, stemR: 0.02 }));
        const spots = b.spots(cap, 22, m.spot, 0.011, 3).map(s => b.part(s));

        const sy = 0.122;
        b.tubeZ(0.019, 0.021, 0.22, m.stem, model, [0, sy, -0.03], { wobble: 0.001 });
        b.tubeZ(0.027, 0.019, 0.035, m.stem, model, [0, sy, -0.155], { open: true });
        b.disc(0.024, m.lens, model, [0, sy, -0.16], [0, Math.PI, 0]);
        b.ring(0.024, 0.004, m.gill, model, [0, sy, -0.172]);
        b.tubeZ(0.02, 0.024, 0.03, m.stem, model, [0, sy, 0.095], { open: true });
        b.tubeZ(0.0215, 0.0215, 0.014, m.dark, model, [0, sy, 0.105], { open: true, seg: 22, hseg: 1 });
        b.disc(0.0215, m.lensRear, model, [0, sy, 0.0985]);
        b.ring(0.024, 0.004, m.gill, model, [0, sy, 0.11]);
        for (const z of [-0.1, 0.05]) {
            b.mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.04, 8), m.stem, model, [0, sy - 0.03, z]);
        }
        b.part(b.mini(model, [-0.016, sy + 0.012, 0.035], 0.016, m.cap, m.stem, [0, 0, 0.5]));
        const turrets = [];
        for (const [pos, rot] of [[[0, sy + 0.021, -0.03], [0, 0, 0]], [[0.021, sy, -0.03], [0, 0, -Math.PI / 2]]]) {
            const g = b.group(model, pos, rot);
            b.mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.012, 14), m.stem, g, [0, 0.004, 0]);
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                b.box(0.0015, 0.009, 0.002, m.gill, g, [Math.cos(a) * 0.0098, 0.004, Math.sin(a) * 0.0098], [0, -a, 0]);
            }
            const dial = b.part(b.group(g, [0, 0.01, 0]));
            b.cap(0.0105, 0.006, m.cap, null, dial, null, null, { seg: 14 });
            b.box(0.0016, 0.002, 0.008, m.spotWhite, dial, [0, 0.006, -0.004]);
            turrets.push(dial);
        }
        b.lathe([[0.024, 0], [0.027, 0.008], [0.029, 0.016]], m.gill, model, [0, sy, 0.112], [Math.PI / 2, 0, 0], { seg: 22 });
        const cover = b.part(b.group(model, [0, sy + 0.029, -0.174]));
        const lid = b.cap(0.029, 0.009, m.cap, m.gill, cover, [0, -0.029, -0.004], [-Math.PI / 2, 0, 0], { seg: 18, fins: 0, flat: 0.5 });
        b.spots(lid, 5, m.spot, 0.004, 13, 0.25, 1.2);
        b.ring(0.004, 0.0015, m.stem, cover, [0, 0, 0], [0, Math.PI / 2, 0], { ts: 10, rs: 4 });

        const bolt = b.part(b.group(model, [0.036, 0.006, 0.08]));
        b.mesh(new THREE.CylinderGeometry(0.0045, 0.005, 0.045, 8), m.stem, bolt, [0.022, 0, 0], [0, 0, Math.PI / 2]);
        const knob = b.cap(0.014, 0.012, m.cap, m.gill, bolt, [0.044, 0, 0], [0, 0, -Math.PI / 2], { fins: 0, seg: 14 });
        b.spots(knob, 4, m.spot, 0.003, 9);

        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            b.box(0.002, 0.012, 0.03, m.gill, model, [Math.cos(a) * 0.022, 0.008 + Math.sin(a) * 0.022, -0.185], [0, 0, a + Math.PI / 2]);
        }
        b.ring(0.024, 0.003, m.cap, model, [0, 0.008, -0.17]);

        b.tube([[0, -0.02, 0.07], [0, -0.07, 0.09], [0, -0.13, 0.115]], 0.019, 0.017, m.wood, model, { wobble: 0.002, ends: true });
        b.ring(0.022, 0.0032, m.stem, model, [0, -0.03, 0.03], [0, Math.PI / 2, 0], { arc: Math.PI });
        b.box(0.004, 0.02, 0.007, m.gill, model, [0, -0.03, 0.035], [0.3, 0, 0]);
        b.tube([[0, 0.0, 0.13], [0, -0.012, 0.24], [0, -0.035, 0.37]], 0.031, 0.04, m.stem, model, { wobble: 0.002, ends: true });
        b.tube([[0, 0.018, 0.17], [0, 0.024, 0.25], [0, 0.004, 0.33]], 0.013, 0.016, m.stem, model, { wobble: 0.002, ends: true });
        const butt = b.cap(0.052, 0.018, m.cap, m.gill, model, [0, -0.035, 0.375], [Math.PI / 2, 0, 0], { fins: 16, flat: 0.5 });
        b.spots(butt, 7, m.spot, 0.006, 5, 0.3, 1.3);
        b.tube([[0.03, 0.0, 0.13], [0.035, -0.02, 0.22], [0.03, -0.05, 0.32]], 0.0028, 0.002, m.myc, model, { seg: 20, radial: 5 });
        const wrap = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const a = t * Math.PI * 2 * 6;
            const y = -0.025 - t * 0.09;
            const z = 0.072 + t * 0.04;
            wrap.push([Math.cos(a) * 0.0205, y, z + Math.sin(a) * 0.0205]);
        }
        b.tube(wrap, 0.0022, 0.0022, m.myc, model, { seg: 160, radial: 4 });
        const pad = b.cap(0.028, 0.008, m.cap, null, model, [0.0, 0.036, 0.25], [0, 0, 0], { seg: 18, flat: 0.4, scale: [1, 1, 2.2] });
        b.spots(pad, 6, m.spot, 0.004, 21, 0.4, 1.3);
        b.ring(0.006, 0.0018, m.stem, model, [0, -0.06, 0.3], [0, Math.PI / 2, 0], { ts: 12, rs: 4 });

        const muzzle = b.group(model, [0, 0.008, -0.975]);
        const flash = b.flash(muzzle, null, C.glow, 0.1, 5);
        b.part(model);

        const lens = b.group(model, [0, sy, -0.165]);

        b.grip('grip', model, [0, -0.08, 0.095], { fingers: [0.65, -0.27, -0.65], back: [0.75, 0.1, 0.6], around: 0.018, curl: 0.9 });
        b.grip('forend', model, [0, 0.004, -0.27], { fingers: [0.8, -0.6, 0], back: [-0.6, -0.8, 0], around: 0.024, curl: 0.85 });
        b.grip('bolt', bolt, [0.044, 0, 0], { fingers: [0, -0.3, -1], back: [1, 0.3, 0], around: 0.014, curl: 0.75 });
        b.grip('cap', model, [-0.115, 0.11, -0.03], { fingers: [0.3, 0.2, -1], back: [-0.6, 0.8, 0], curl: 0.1 });
        b.grip('capSide', model, [0.12, 0.065, 0.02], { fingers: [0, 0, -1], back: [1, 0.3, 0], curl: 0.2 });
        b.grip('cover', cover, [0, -0.1, -0.045], { fingers: [0, 1, 0.2], back: [0, 0, -1], curl: 0.35 });
        return { model, reactor, cap, spots, coils, bolt, turrets, cover, lens, muzzle, flashes: [flash], m };
    },

    init(w) {
        w.data.capPos = new THREE.Vector3();
        w.data.aim = 0;
    },

    altTick(w, dt, move) {
        const K = WeaponKit;
        const d = w.data;
        const bolting = w.fireT > 0.2 && w.fireT < 0.85;
        const want = w.altHeld && w.state === 'ready' && !bolting && !(move && move.sprinting);
        d.aim = K.clamp(d.aim + (want ? dt / 0.24 : -dt / 0.16));
        const a = K.ease.inOutSine(d.aim);
        w.zoom = K.seg(d.aim, 0.7, 1);
        w.steady = a;
        w.spreadScale = 1 - a;
    },
    cancel(w) {
        w.data.aim = 0;
        w.zoom = 0;
        w.steady = 0;
        w.spreadScale = 1;
    },

    charge(w) {
        const r = w.reloadT;
        if (r < 0) {
            return w.ammo / w.stats.mag;
        }
        return WeaponKit.lerp(w.reloadFrom / w.stats.mag, 1, WeaponKit.e('inOutSine', r, 0.4, 2.25));
    },

    boltCycle(P, t, t0) {
        const K = WeaponKit;
        const up = K.e('outCubic', t, t0, t0 + 0.1) * (1 - K.e('inOutCubic', t, t0 + 0.38, t0 + 0.5));
        const slide = K.e('outCubic', t, t0 + 0.1, t0 + 0.22) - K.e('inOutCubic', t, t0 + 0.26, t0 + 0.38);
        P.bolt.rotation.z += up * 1.25;
        P.bolt.position.z += slide * 0.065;
        P.model.rotation.z += up * 0.07;
        P.model.position.y -= up * 0.008;
    },

    pose(w, dt) {
        const P = w.parts;
        const K = WeaponKit;
        const f = w.fireT;
        const r = w.reloadT;
        const charge = this.charge(w);
        const t = w.time;

        P.m.spot.emissiveIntensity = 0.05 + charge * 0.75 + Math.sin(t * 2.2) * 0.1 * charge + (r >= 0 ? WeaponKit.hump(r, 2.2, 2.6) * 1.2 : 0);
        P.m.lens.emissiveIntensity = 0.8 + charge * 0.8;
        P.coils.forEach((c, i) => {
            let e = 0.12 + charge * 0.25;
            e += Math.exp(-Math.max(0, f - i * 0.012) * 18) * (f >= i * 0.012 ? 3 : 0);
            if (r >= 0) {
                const on = K.e('outCubic', r, 1.35 + (6 - i) * 0.11, 1.5 + (6 - i) * 0.11);
                e += on * 1.6 * (1 - K.seg(r, 2.4, 2.9) * 0.6);
                c.g.scale.multiplyScalar(1 + K.hump(r, 1.35 + (6 - i) * 0.11, 1.6 + (6 - i) * 0.11) * 0.35);
            }
            c.mat.emissiveIntensity = e;
        });

        const aim = K.ease.inOutSine(w.data.aim);
        if (aim > 0) {
            P.model.position.x -= 0.27 * aim;
            P.model.position.y += 0.058 * aim;
            P.model.position.z += 0.37 * aim;
            P.model.rotation.z += K.hump(w.data.aim, 0, 1) * 0.08;
        }
        const it = w.inspectT;
        const coverOpen = Math.max(K.ease.outBack(K.seg(w.data.aim, 0, 0.35)), it >= 0 ? K.hump(it, 1.4, 2.4) : 0);
        P.cover.rotation.x += coverOpen * 1.75;
        P.turrets.forEach((d, i) => {
            d.rotation.y += aim * (i ? -0.6 : 0.9) + (it >= 0 ? K.e('inOutCubic', it, 2.0 + i * 0.2, 2.5 + i * 0.2) * Math.PI : 0);
        });

        if (it >= 0) {
            const env = K.e('inOutCubic', it, 0, 0.55) * (1 - K.e('inOutCubic', it, 2.85, 3.4));
            P.model.rotation.y -= env * 0.95;
            P.model.rotation.x -= env * 0.12;
            P.model.rotation.z -= env * 0.38;
            P.model.position.x -= env * 0.16;
            P.model.position.y += env * 0.05;
            P.model.position.z -= env * 0.1;
            P.reactor.rotation.y += K.e('inOutCubic', it, 0.5, 1.6) * Math.PI * 2;
            P.spots.forEach((sp, i) => {
                const t0 = 0.6 + (i / P.spots.length) * 0.9;
                sp.scale.multiplyScalar(1 + K.hump(it, t0, t0 + 0.25) * 0.7);
            });
            P.m.spot.emissiveIntensity += K.hump(it, 0.6, 1.8) * 0.8;
            P.m.lens.emissiveIntensity += K.hump(it, 1.75, 2.0) * 3;
            this.boltCycle(P, Math.min(it, 2.9), 2.4);
        }

        const sq = K.hump(f, 0, 0.16) * 0.16;
        P.cap.scale.y *= 1 - sq;
        P.cap.scale.x *= 1 + sq * 0.4;
        P.cap.scale.z *= 1 + sq * 0.4;
        if (f < 1) {
            this.boltCycle(P, f, 0.22);
        }

        if (r < 0) {
            return;
        }
        const raise = K.e('outCubic', r, 0, 0.45) * (1 - K.e('inOutCubic', r, 2.45, 2.92));
        P.model.rotation.x -= raise * 0.22;
        P.model.rotation.z += raise * 0.3;
        P.model.rotation.y += raise * 0.25;
        P.model.position.x -= raise * 0.09;
        P.model.position.y += raise * 0.035;
        P.model.position.z += raise * 0.06;

        const absorbing = K.seg(r, 0.3, 0.6) * (1 - K.seg(r, 2.15, 2.3));
        const beat = Math.pow(Math.max(0, Math.sin(r * 8.5)), 6) * 0.07 * absorbing;
        const pop = K.hump(r, 2.26, 2.46) * 0.16;
        P.cap.scale.multiplyScalar(1 + beat + pop);
        P.reactor.rotation.y += K.e('inOutCubic', r, 0.3, 2.3) * Math.PI * 2;
        P.spots.forEach((s, i) => {
            const lit = K.seg(charge * P.spots.length, i, i + 1);
            s.scale.multiplyScalar(1 + K.hump(r, 0.4 + i * 0.08, 0.6 + i * 0.08) * 0.6 * (lit > 0 ? 1 : 0));
        });

        this.boltCycle(P, r, 2.48);
    },

    handPose(w, H) {
        const K = WeaponKit;
        if (w.fireT < 1.2) {
            H.right.track(w.fireT, [[0.08, 0.22, 'bolt'], [0.74, 0.92, 'grip']]);
        }
        const it = w.inspectT;
        if (it >= 0) {
            H.left.track(it, [[0.25, 0.42, 'capSide'], [0.72, 0.92, 'forend'], [1.2, 1.4, 'cover'], [1.7, 1.95, 'forend']]);
            H.left.nudge(0, 0, -0.07 * K.e('inOutCubic', it, 0.44, 0.62));
            H.right.track(it, [[2.24, 2.4, 'bolt'], [2.92, 3.12, 'grip']]);
        }
        const r = w.reloadT;
        if (r < 0) {
            return;
        }
        const absorbing = K.seg(r, 0.5, 0.7) * (1 - K.seg(r, 2.15, 2.3));
        H.left.track(r, [[0.2, 0.5, 'cap'], [2.36, 2.6, 'forend']]);
        H.left.nudge(Math.sin(r * 19) * 0.002 * absorbing, Math.sin(r * 8.5) * 0.004 * absorbing, 0);
        H.left.squeeze(-0.15 * absorbing + K.hump(r, 2.2, 2.45) * 0.9);
        H.right.track(r, [[2.32, 2.48, 'bolt'], [2.86, 3.0, 'grip']]);
    },

    effects(w, dt) {
        const P = w.parts;
        const fx = w.fx;
        const K = WeaponKit;
        const glow = this.color;
        if (w.inspectT >= 0 && w.atAct(1.82)) {
            const p = w.localPos(P.lens);
            for (let i = 0; i < 8; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.2), life: 0.35, size: 0.004, sizeEnd: 0, color: i % 2 ? 0xffffff : glow, drag: 3, stretch: 0.03 });
            }
        }

        if (w.atFire(0) && w.zoom < 0.5) {
            const o = w.worldPos(P.muzzle);
            const d = w.worldDir(P.muzzle);
            for (const [s0, s1, life, sp] of [[0.03, 0.22, 0.25, 2], [0.02, 0.13, 0.18, 4]]) {
                fx.emit({ world: true, shape: 'ring', pos: o, dir: d, vel: d.clone().multiplyScalar(sp), life, size: s0, sizeEnd: s1, color: glow, opacity: 0.9 });
            }
            for (let i = 0; i < 16; i++) {
                fx.emit({ world: true, pos: o, vel: K.cone(d, 0.18).multiplyScalar(K.rand(3, 8)), life: K.rand(0.25, 0.5), size: 0.007, sizeEnd: 0.001, color: i % 3 ? glow : 0xffffff, drag: 3, stretch: 0.012 });
            }
            for (let i = 0; i < 6; i++) {
                fx.emit({ world: true, pos: o, vel: K.cone(d, 0.7).multiplyScalar(K.rand(0.4, 1.2)), life: K.rand(0.8, 1.3), size: 0.02, sizeEnd: 0.1, color: 0xd9c9e6, additive: false, opacity: 0.35, drag: 3, gravity: -0.2 });
            }
            const c = w.localPos(P.cap, [0, 0.03, 0]);
            for (let i = 0; i < 10; i++) {
                fx.emit({ pos: c, vel: K.sphereDir().multiplyScalar(0.25).add(new THREE.Vector3(0, 0.2, 0)), life: 0.5, size: 0.004, color: glow, drag: 2 });
            }
        }
        if (w.atFire(0.38)) {
            const p = w.localPos(P.bolt, [0, 0.02, -0.03]);
            fx.emit({ pos: p, vel: new THREE.Vector3(1.0, 1.3, 0.3), life: 0.9, size: 0.012, sizeEnd: 0.01, color: 0x6a4a7a, additive: false, gravity: 6, drag: 0.3 });
            fx.emit({ pos: p, vel: new THREE.Vector3(0.5, 0.6, 0.1), life: 0.5, size: 0.005, sizeEnd: 0, color: glow, drag: 1 });
        }

        const r = w.reloadT;
        if (r < 0) {
            return;
        }
        const cp = w.localPos(P.cap, [0, 0.025, 0], w.data.capPos);
        if (r > 0.35 && r < 2.15) {
            const n = fx.rate('motes', 85, dt);
            for (let i = 0; i < n; i++) {
                const dir = K.sphereDir();
                dir.y = Math.abs(dir.y) * 0.6 + 0.1;
                dir.normalize();
                const pos = cp.clone().addScaledVector(dir, K.rand(0.14, 0.3));
                const tangent = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(K.rand(0.2, 0.5));
                fx.emit({
                    pos, vel: tangent, attract: cp, pull: 3.2, swirl: 3,
                    life: 1.4, size: K.rand(0.004, 0.008), sizeEnd: 0.002, color: Math.random() < 0.75 ? glow : 0xffd6f6, drag: 1.4, fadeIn: 0.2
                });
            }
        }
        if (w.atAct(2.28)) {
            for (let i = 0; i < 28; i++) {
                const a = (i / 28) * Math.PI * 2;
                fx.emit({ pos: cp, vel: new THREE.Vector3(Math.cos(a) * 0.9, K.rand(-0.1, 0.35), Math.sin(a) * 0.9), life: 0.45, size: 0.005, sizeEnd: 0.001, color: i % 2 ? glow : 0xffffff, drag: 3.5 });
            }
            fx.emit({ pos: cp, shape: 'ring', dir: new THREE.Vector3(0, 1, 0), life: 0.3, size: 0.06, sizeEnd: 0.2, color: glow, opacity: 0.8 });
        }
    }
});
