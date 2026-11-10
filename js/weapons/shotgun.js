Weapons.register('shotgun', {
    name: 'Puffcap Blunderbuss',
    altName: 'Charge',
    offset: [0.28, -0.19, -0.64],
    stats: {
        mag: 6, rate: 1.25, auto: true, damage: 9, pellets: 9, spread: 0.09, range: 40,
        reloadTime: 2.35, drawTime: 0.5,
        kick: { back: 0.12, up: 0.22, roll: 0.05 }
    },
    color: 0xb8ff4d,
    projectile: {
        speed: 55, color: 0x9dff2e, core: 0xf4ffd6, maxDist: 28,
        radius: 0.02, length: 0.1, tail: 2.6, trailWidth: 0.05,
        impact: { sparks: 1, size: 0.012 }
    },
    chargedProjectile: {
        speed: 75, color: 0xc6ff4a, core: 0xffffff, maxDist: 34,
        radius: 0.026, length: 0.14, tail: 3.4, trailWidth: 0.065,
        impact: { sparks: 2, size: 0.014, ring: 0.18 }
    },
    inspect: { time: 3.4 },
    hands: { left: 'pump', right: 'grip' },

    build(b, w) {
        const C = {
            stem: 0xe9dcc0, gill: 0xc79f78, cap: 0xa66c44, puff: 0xefe7d0,
            wood: 0x5c3b25, myc: 0xf6f2e8, glow: 0xb8ff4d, dark: 0x1b130c
        };
        const m = {
            stem: b.mat('stem', { color: C.stem }),
            gill: b.mat('gill', { color: C.gill, side: THREE.DoubleSide }),
            cap: b.mat('cap', { color: C.cap, roughness: 0.55 }),
            puff: b.mat('puff', { color: C.puff, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }),
            wart: b.mat('wart', { color: 0xd8ccb0, flatShading: true }),
            wood: b.mat('wood', { color: C.wood, flatShading: true, roughness: 0.95 }),
            myc: b.mat('myc', { color: C.myc, roughness: 0.8 }),
            dark: b.mat('dark', { color: C.dark, roughness: 1, side: THREE.DoubleSide }),
            glow: b.glow('glow', C.glow, 1.2),
            inner: b.glow('inner', 0x6fae1e, 0.5),
            bell: b.glow('bell', C.glow, 0.1, { color: C.gill }),
            vent: b.mat('vent', { color: 0x3b2c1c, roughness: 1 })
        };
        const model = b.group();
        const by = 0.045;

        for (const x of [-0.031, 0.031]) {
            b.tubeZ(0.024, 0.03, 0.5, m.stem, model, [x, by, -0.33], { wobble: 0.0025, seed: x * 100 });
            b.tubeZ(0.043, 0.025, 0.07, m.gill, model, [x, by, -0.612], { open: true, seg: 18 });
            b.disc(0.024, m.dark, model, [x, by, -0.6], [0, Math.PI, 0]);
            b.ring(0.042, 0.006, m.cap, model, [x, by, -0.647]);
            b.ring(0.027, 0.005, m.gill, model, [x, by, -0.12]);
            b.ring(0.034, 0.0035, m.bell, model, [x, by, -0.636]);
            for (let i = 0; i < 3; i++) {
                b.ring(0.029 - i * 0.0006, 0.0028, m.gill, model, [x, by, -0.555 + i * 0.016]);
            }
        }
        b.mini(model, [0, by + 0.026, -0.6], 0.016, m.glow, m.stem);
        const helix = [];
        for (let i = 0; i <= 44; i++) {
            const a = i * 0.62;
            helix.push([Math.cos(a) * 0.064, by + Math.sin(a) * 0.04, -0.13 - i * 0.0062]);
        }
        b.tube(helix, 0.0026, 0.0018, m.myc, model, { seg: 140, radial: 5, wobble: 0.002, freq: 90 });

        const pump = b.part(b.group(model, [0, 0, -0.38]));
        b.tubeZ(0.062, 0.068, 0.095, m.cap, pump, [0, by - 0.006, 0], { seg: 20, wobble: 0.002 });
        b.ring(0.066, 0.008, m.gill, pump, [0, by - 0.006, -0.048]);
        b.ring(0.07, 0.008, m.gill, pump, [0, by - 0.006, 0.048]);
        for (let i = 0; i < 14; i++) {
            const a = Math.PI + (i / 13 - 0.5) * 2.4;
            b.box(0.006, 0.006, 0.08, m.gill, pump, [Math.sin(a) * 0.069, by - 0.006 + Math.cos(a) * 0.069, 0], [0, 0, -a]);
        }

        b.tubeZ(0.034, 0.04, 0.2, m.stem, model, [0, 0.022, -0.01], { wobble: 0.002 });
        const gauge = [];
        b.rbox(0.006, 0.014, 0.13, 0.003, m.wood, model, [-0.036, 0.02, -0.03]);
        for (let i = 0; i < 5; i++) {
            const mat = b.glow('gauge' + i, C.glow, 0.05, { color: 0x4a5a2a });
            b.sphere(0.0045, mat, model, [-0.039, 0.02, -0.08 + i * 0.025], null, { ws: 8, hs: 6 });
            gauge.push(mat);
        }

        const R = 0.085;
        const cut = 0.86;
        const chamber = b.part(b.group(model, [0, 0.068, -0.02], null, [1, 0.86, 1.18]));
        b.sphere(R, m.puff, chamber, null, null, { ws: 24, hs: 16, t0: cut, tl: Math.PI - cut, wobble: 0.003, freq: 70 });
        const cy = R * Math.cos(cut);
        const cr = R * Math.sin(cut);
        b.disc(cr * 0.98, m.inner, chamber, [0, cy - 0.006, 0], [-Math.PI / 2, 0, 0]);
        const pods = [];
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.5;
            const pod = b.sphere(0.014, m.glow, chamber, [Math.cos(a) * cr * 0.58, cy, Math.sin(a) * cr * 0.58], [1, 0.85, 1], { ws: 10, hs: 8 });
            pods.push(b.part(pod));
        }
        const lid = b.part(b.group(chamber, [0, cy, cr]));
        b.sphere(R, m.puff, lid, [0, -cy, -cr], null, { ws: 24, hs: 10, tl: cut, wobble: 0.003, freq: 70 });
        const lidSprout = b.part(b.mini(lid, [0, R - cy - 0.004, -cr], 0.03, m.cap, m.stem));
        b.ring(R * 1.0, 0.0045, m.myc, chamber, [0, -0.012, 0], [Math.PI / 2, 0, 0], { ts: 40 });
        b.cap(0.012, 0.008, m.cap, null, chamber, [R * 0.99, -0.012, 0], [0, 0, -Math.PI / 2], { seg: 12 });
        const vents = [];
        for (const [th, ph] of [[1.75, 0.35], [2.05, -0.15], [1.55, -0.55], [2.2, 0.6]]) {
            const n = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
            const g = b.group(chamber);
            g.position.copy(n).multiplyScalar(R * 0.985);
            g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
            b.mesh(new THREE.CircleGeometry(0.0055, b.n(10, 4)), m.vent, g, [0, 0.0005, 0], [-Math.PI / 2, 0, 0]);
            b.ring(0.0058, 0.0016, m.wart, g, null, [Math.PI / 2, 0, 0], { ts: 12, rs: 5 });
            vents.push(g);
        }
        const rnd = WeaponKit.rng(7);
        const wartGeo = new THREE.ConeGeometry(0.004, 0.007, b.n(5));
        for (let i = 0; i < 26; i++) {
            const th = WeaponKit.lerp(cut + 0.15, Math.PI - 0.3, rnd());
            const ph = rnd() * Math.PI * 2;
            const n = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
            const wart = b.mesh(wartGeo, m.wart, chamber);
            wart.position.copy(n).multiplyScalar(R * 0.99);
            wart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        }

        b.tube([[0, 0.01, 0.04], [0, -0.05, 0.06], [0, -0.115, 0.09]], 0.022, 0.019, m.wood, model, { wobble: 0.003, ends: true });
        b.ring(0.024, 0.0035, m.stem, model, [0, -0.012, 0.0], [0, Math.PI / 2, 0], { arc: Math.PI });
        b.box(0.005, 0.022, 0.008, m.gill, model, [0, -0.01, 0.005], [0.3, 0, 0]);
        b.tube([[0, 0.02, 0.08], [0, 0.005, 0.17], [0, -0.025, 0.26], [0, -0.07, 0.34]], 0.034, 0.046, m.wood, model, { wobble: 0.005, freq: 30, ends: true });
        b.tube([[0.01, 0.0, 0.2], [0.04, -0.03, 0.24], [0.05, -0.07, 0.27]], 0.009, 0.003, m.wood, model, { wobble: 0.002, seg: 12 });
        b.tube([[-0.01, -0.02, 0.25], [-0.04, -0.06, 0.28], [-0.045, -0.1, 0.3]], 0.008, 0.002, m.wood, model, { wobble: 0.002, seg: 12 });
        b.tube([[0.03, 0.02, 0.1], [0.036, 0.005, 0.18], [0.03, -0.02, 0.25]], 0.003, 0.002, m.myc, model, { seg: 16, radial: 5 });
        b.cap(0.05, 0.014, m.cap, m.gill, model, [0, -0.074, 0.352], [Math.PI / 2 - 0.45, 0, 0], { flat: 0.5, fins: 16 });
        b.rbox(0.008, 0.03, 0.09, 0.004, m.wood, model, [0.038, -0.01, 0.2], [0.32, 0, 0]);
        for (let i = 0; i < 3; i++) {
            const z = 0.17 + i * 0.03;
            const y = 0.0 - (z - 0.17) * 0.33;
            b.sphere(0.011, m.glow, model, [0.047, y, z], [0.8, 1, 1], { ws: 10, hs: 8 });
            b.ring(0.011, 0.0022, m.myc, model, [0.047, y, z], [0, Math.PI / 2, 0], { ts: 14, rs: 4 });
        }
        b.ring(0.008, 0.002, m.stem, model, [0, -0.052, 0.22], [0, Math.PI / 2, 0], { ts: 14, rs: 4 });
        const charm = b.part(b.group(model, [0, -0.06, 0.22]));
        b.tube([[0, 0, 0], [0.002, -0.022, 0], [0, -0.042, 0]], 0.0013, 0.0013, m.myc, charm, { seg: 8, radial: 4 });
        b.sphere(0.011, m.puff, charm, [0, -0.052, 0], [1, 0.9, 1], { ws: 12, hs: 8, wobble: 0.001, freq: 200 });
        b.mini(charm, [0, -0.044, 0], 0.012, m.cap, m.stem);

        const sprouts = [
            b.mini(model, [0, by + 0.028, -0.22], 0.026, m.cap, m.stem, [0, 0, 0.2]),
            b.mini(model, [0.012, by + 0.026, -0.27], 0.018, m.cap, m.stem, [0, 0, -0.3]),
            b.mini(model, [-0.03, 0.005, 0.2], 0.022, m.cap, m.stem, [0, 0, 0.9])
        ].map(s => b.part(s));

        const muzzle = b.group(model, [0, by, -0.66]);
        const flash = b.flash(muzzle, [0, 0, -0.02], C.glow, 0.09, 4);
        b.part(model);

        const bells = [-0.031, 0.031].map(x => b.group(model, [x, by, -0.64]));

        b.grip('grip', model, [0, -0.07, 0.069], { fingers: [0.65, -0.27, -0.65], back: [0.75, 0.1, 0.6], around: 0.021, curl: 0.9 });
        b.grip('pump', pump, [0, by - 0.006, 0], { fingers: [0.8, -0.6, 0], back: [-0.6, -0.8, 0], around: 0.066, curl: 0.7 });
        b.grip('lidL', lid, [-0.088, 0.004, -0.07], { fingers: [0, 0.5, -1], back: [-1, 0.2, 0], curl: 0.45 });
        b.grip('lidTop', lid, [-0.03, 0.045, -0.06], { fingers: [0.2, 0, -1], back: [-0.35, 1, 0], curl: 0.2 });
        const flick = b.grip('flick', null, [-0.4, 0.02, 0.16], { fingers: [1, 0.05, -0.3], back: [0, -0.25, -1], curl: 0.6 });
        const podSlots = [
            [0.045, -0.031, -0.029],
            [0.012, -0.03, -0.03], [-0.006, -0.03, -0.034], [0.012, -0.03, -0.012], [-0.008, -0.031, -0.016], [0.002, -0.032, 0.002]
        ].map(p => new THREE.Vector3(...p).applyQuaternion(flick.quaternion).add(flick.position));
        return { model, chamber, lid, lidSprout, pump, pods, sprouts, muzzle, flashes: [flash], gauge, vents, charm, bells, podSlots, rigExtras: [flick], m };
    },

    init(w) {
        w.data.jiggle = new Spring(160, 6);
        w.data.charmSpring = new Spring(60, 2.5);
        w.data.charge = 0;
        w.data.lastCharge = 0;
        w.data.bellPos = [new THREE.Vector3(), new THREE.Vector3()];
        w.data.podFrom = new THREE.Vector3();
        w.data.podAt = new THREE.Vector3();
        w.data.podRound = new THREE.Vector3();
        w.data.m4 = new THREE.Matrix4();
    },

    onFire(w, side, o) {
        w.data.jiggle.kick(o && o.mode === 'charged' ? 14 : 9);
        w.data.charmSpring.kick(o && o.mode === 'charged' ? 5 : 3);
    },

    altPress(w) {
        if (w.state !== 'ready' || w.cooldown > 0) {
            return;
        }
        if (w.ammo <= 0) {
            w.reload();
            return;
        }
        w.data.charge = 0;
        w.setState('charge');
    },
    altTick(w, dt, move) {
        if (w.state !== 'charge') {
            return;
        }
        if (move && move.sprinting) {
            w.setState('ready');
            return;
        }
        w.data.charge = Math.min(1, w.data.charge + dt / 1.1);
        if (!w.altHeld) {
            const c = w.data.charge;
            w.data.lastCharge = c;
            w.setState('ready');
            w.fire({
                mode: 'charged',
                ammo: c > 0.5 && w.ammo >= 2 ? 2 : 1,
                pellets: 9 + Math.round(7 * c),
                spread: 0.09 * (1 - 0.55 * c),
                damage: Math.round(9 * (1 + c)),
                kickScale: 1 + 0.8 * c,
                cooldown: 1.05,
                flashScale: 1 + c,
                projectile: c > 0.35 ? this.chargedProjectile : this.projectile
            });
        }
    },
    cancel(w) {
        w.data.charge = 0;
    },

    podWindow(w, k) {
        const missing = w.stats.mag - w.reloadFrom;
        const start = 0.52 + k * (0.85 / Math.max(1, missing));
        return [start, start + 0.28];
    },
    podGap(w) {
        return 0.85 / Math.max(1, w.stats.mag - w.reloadFrom);
    },
    podRoll(w) {
        return Math.min(0.12, this.podGap(w) * 0.6);
    },
    podQueue(w, k, r) {
        let q = k;
        const roll = this.podRoll(w);
        for (let j = 0; j < k; j++) {
            const a = this.podWindow(w, j)[0];
            q -= WeaponKit.e('inOutSine', r, a + 0.05, a + 0.05 + roll);
        }
        return q;
    },

    pose(w, dt) {
        const P = w.parts;
        const K = WeaponKit;
        const f = w.fireT;
        const r = w.reloadT;
        P.m.glow.emissiveIntensity = 1 + Math.sin(w.time * 3.2) * 0.3;
        P.m.inner.emissiveIntensity = 0.35 + 0.15 * Math.sin(w.time * 2.1);

        w.data.jiggle.update(dt);
        const sw = w.dangle(w.data.charmSpring, dt);
        P.charm.rotation.z += sw * 0.9;
        P.charm.rotation.x += Math.sin(w.time * 1.7) * 0.05 + w.data.charmSpring.v * 0.02;

        const charging = w.state === 'charge';
        const c = charging ? w.data.charge : 0;
        const ce = K.ease.outQuad(c);
        const lastC = w.fireT < 0.5 && w.lastMode === 'charged' ? w.data.lastCharge * (1 - K.seg(w.fireT, 0, 0.5)) : 0;
        P.m.bell.emissiveIntensity = 0.08 + ce * 2.2 + lastC * 2 + (c >= 1 ? Math.sin(w.time * 30) * 0.4 : 0);
        P.gauge.forEach((mat, i) => {
            const lit = K.seg(c, i / 5, (i + 1) / 5);
            mat.emissiveIntensity = 0.05 + lit * 1.8 + (c >= 1 ? Math.sin(w.time * 18 + i) * 0.4 : 0);
        });
        if (charging) {
            const tremble = c * c * 0.012;
            P.chamber.scale.multiplyScalar(1 + ce * 0.2 + Math.sin(w.time * 47) * tremble);
            P.pump.position.z += K.e('outCubic', w.actT, 0, 0.3) * 0.07;
            P.lid.rotation.x += ce * 0.12 + Math.max(0, Math.sin(w.time * 23)) * 0.05 * c;
            P.model.position.z += ce * 0.025;
            P.model.rotation.x += ce * 0.05;
            P.model.rotation.z += Math.sin(w.time * 41) * tremble * 0.8;
            P.model.position.x += Math.sin(w.time * 53) * tremble * 0.2;
            P.sprouts.forEach((s, i) => {
                s.rotation.z += Math.sin(w.time * 35 + i) * 0.15 * c;
            });
        }

        const it = w.inspectT;
        if (it >= 0) {
            const env = K.e('inOutCubic', it, 0, 0.5) * (1 - K.e('inOutCubic', it, 2.8, 3.4));
            const yaw = 0.95 * K.e('inOutCubic', it, 0, 0.55) - 1.75 * K.e('inOutCubic', it, 1.45, 2.3);
            P.model.rotation.y += yaw * (1 - K.e('inOutCubic', it, 2.8, 3.4));
            P.model.rotation.x += env * 0.18;
            P.model.rotation.z += env * 0.12 + K.hump(it, 1.45, 2.3) * 0.3;
            P.model.position.x -= env * 0.13;
            P.model.position.y += env * 0.05;
            P.model.position.z += env * 0.12;
            P.chamber.scale.multiplyScalar(1 + Math.sin(it * 5) * 0.025 * env);
            P.lid.rotation.x += K.hump(it, 0.85, 1.4) * 0.7;
            P.lidSprout.rotation.x -= K.hump(it, 0.85, 1.4) * 0.3;
            P.pump.position.z += K.hump(it, 2.35, 2.75) * 0.045;
            if (w.atAct(1.12)) {
                w.data.jiggle.kick(6);
            }
        }

        P.sprouts.forEach((s, i) => {
            s.rotation.z += w.data.jiggle.x * (i % 2 ? -0.06 : 0.05);
            s.rotation.x += w.data.jiggle.x * 0.04;
        });

        if (f < 0.7) {
            const sq = K.hump(f, 0, 0.14) * 0.2;
            P.chamber.scale.y *= 1 - sq;
            P.chamber.scale.x *= 1 + sq * 0.45;
            P.chamber.scale.z *= 1 + sq * 0.3;
            P.lid.rotation.x += K.hump(f, 0, 0.1) * 0.25;
            const rack = K.e('outCubic', f, 0.24, 0.36) - K.e('inOutCubic', f, 0.4, 0.56);
            P.pump.position.z += rack * 0.075;
            P.model.rotation.z += rack * 0.13;
            P.model.rotation.x += rack * 0.05;
            P.model.position.y -= rack * 0.012;
        }

        P.pods.forEach((pod, i) => {
            pod.visible = i < w.ammo;
        });

        if (r >= 0) {
            const tilt = K.e('outCubic', r, 0, 0.32) * (1 - K.e('inOutCubic', r, 1.75, 2.15));
            P.model.rotation.z += tilt * 0.45;
            P.model.rotation.x += tilt * 0.38;
            P.model.rotation.y += tilt * 0.12;
            P.model.position.x -= tilt * 0.1;
            P.model.position.y += tilt * 0.01;

            const open = K.e('outBack', r, 0.12, 0.38) * (1 - K.e('inCubic', r, 1.48, 1.6));
            P.lid.rotation.x += open * 1.95;
            P.lidSprout.rotation.x -= open * 0.4;
            const slam = K.hump(r, 1.6, 1.78);
            P.chamber.scale.y *= 1 - slam * 0.12;
            P.chamber.scale.x *= 1 + slam * 0.06;
            if (w.atAct(1.6)) {
                w.data.jiggle.kick(7);
            }

            P.model.updateMatrix();
            P.chamber.updateMatrix();
            const toChamber = w.data.m4.multiplyMatrices(P.model.matrix, P.chamber.matrix).invert();
            const from = w.data.podFrom.copy(P.podSlots[0]).applyMatrix4(toChamber);
            const at = w.data.podAt;
            const cs = P.chamber.scale;
            const round = w.data.podRound.set(0.7 / cs.x, 0.7 / cs.y, 0.7 / cs.z);
            const missing = w.stats.mag - w.reloadFrom;
            for (let k = 0; k < missing; k++) {
                const pod = P.pods[w.reloadFrom + k];
                const [a, z] = this.podWindow(w, k);
                const p = K.seg(r, a, z);
                const grow = K.ease.outBack(K.seg(r, 0.36 + k * 0.025, 0.5 + k * 0.025));
                pod.visible = grow > 0;
                const rest = pod.userData.rest.p;
                if (pod.visible && r < a) {
                    const q = Math.min(P.podSlots.length - 1, this.podQueue(w, k, r));
                    const i = Math.floor(q);
                    at.copy(P.podSlots[i]).lerp(P.podSlots[Math.min(i + 1, P.podSlots.length - 1)], q - i).applyMatrix4(toChamber);
                    pod.position.copy(at);
                    pod.scale.copy(round).multiplyScalar(Math.max(0.001, grow));
                } else if (pod.visible && p < 1) {
                    const e = K.ease.outQuad(p);
                    pod.position.set(
                        K.lerp(from.x, rest.x, e),
                        K.lerp(from.y, rest.y, e) + Math.sin(e * Math.PI) * 0.2,
                        K.lerp(from.z, rest.z, e)
                    );
                    pod.scale.lerpVectors(round, pod.userData.rest.s, e);
                } else if (p >= 1) {
                    const pop = K.hump(r, z, z + 0.12);
                    pod.scale.multiplyScalar(1 + pop * 0.35);
                }
            }

            const rack = K.e('outCubic', r, 1.82, 1.94) - K.e('inOutCubic', r, 1.98, 2.14);
            P.pump.position.z += rack * 0.075;
            P.model.rotation.z += rack * 0.1;
        }
    },

    handPose(w, H) {
        const K = WeaponKit;
        if (w.state === 'charge') {
            H.left.squeeze(w.data.charge * 0.25);
        }
        const it = w.inspectT;
        if (it >= 0) {
            H.left.track(it, [[0.6, 0.85, 'lidL'], [1.35, 1.65, 'pump']]);
        }
        const r = w.reloadT;
        if (r < 0) {
            return;
        }
        H.left.track(r, [[0.0, 0.13, 'lidL'], [0.3, 0.46, 'flick'], [1.36, 1.48, 'lidTop'], [1.64, 1.8, 'pump']]);
        const flicking = K.seg(r, 0.3, 0.46) * (1 - K.seg(r, 1.36, 1.48));
        H.left.bend('inner', 0.3 * flicking);
        const missing = w.stats.mag - w.reloadFrom;
        const relax = this.podRoll(w);
        for (let k = 0; k < missing; k++) {
            const a = this.podWindow(w, k)[0];
            const snap = K.e('outQuad', r, a - 0.01, a + 0.04) * (1 - K.e('inOutSine', r, a + 0.05, a + 0.05 + relax));
            H.left.bend('thumb', -1.0 * snap);
        }
        H.left.nudge(0, -0.014 * K.hump(r, 1.46, 1.62), 0);
    },

    effects(w, dt) {
        const P = w.parts;
        const fx = w.fx;
        const K = WeaponKit;
        const glow = this.color;

        const charging = w.state === 'charge';
        const c = charging ? w.data.charge : 0;
        const wisps = fx.rate('wisp', 2.5 + c * 25, dt);
        for (let i = 0; i < wisps; i++) {
            const v = P.vents[(Math.random() * P.vents.length) | 0];
            const p = w.localPos(v, [0, 0.002, 0]);
            const out = w.localPos(v, [0, 0.03, 0]).sub(p).normalize();
            fx.emit({ pos: p, vel: out.multiplyScalar(K.rand(0.05, 0.12)).add(new THREE.Vector3(0, 0.05, 0)), life: K.rand(0.6, 1.1), size: 0.003, sizeEnd: 0.012, color: 0xdfe8c0, additive: false, opacity: 0.35, drag: 1.5, gravity: -0.08 });
        }
        if (charging) {
            P.bells.forEach((bell, k) => {
                const bp = w.localPos(bell, null, w.data.bellPos[k]);
                const n = fx.rate('suck' + k, 20 + c * 70, dt);
                for (let i = 0; i < n; i++) {
                    const pos = bp.clone().add(K.sphereDir().multiplyScalar(K.rand(0.06, 0.16))).add(new THREE.Vector3(0, 0, -0.06));
                    fx.emit({ pos, vel: K.sphereDir().multiplyScalar(0.05), attract: bp, pull: 3 + c * 4, swirl: k ? 3 : -3, life: 0.8, size: K.rand(0.003, 0.006), sizeEnd: 0.001, color: Math.random() < 0.7 ? glow : 0xffffff, drag: 1.2, fadeIn: 0.1 });
                }
            });
            if (c >= 1) {
                const n = fx.rate('crackle', 18, dt);
                for (let i = 0; i < n; i++) {
                    const p = w.localPos(P.chamber, K.sphereDir().multiplyScalar(0.09).toArray());
                    fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.5), life: 0.15, size: 0.003, color: 0xffffff, drag: 4, stretch: 0.03 });
                }
            }
        }
        const it = w.inspectT;
        if (it >= 0 && w.atAct(1.0)) {
            const p = w.localPos(P.chamber, [0, 0.08, 0.02]);
            for (let i = 0; i < 12; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.12).add(new THREE.Vector3(0, 0.18, 0)), life: 0.9, size: 0.004, sizeEnd: 0.016, color: i % 3 ? 0xdfe8c0 : glow, additive: i % 3 === 0, opacity: 0.5, drag: 2 });
            }
        }

        if (w.atFire(0)) {
            const charged = w.lastMode === 'charged' ? w.data.lastCharge : 0;
            const o = w.worldPos(P.muzzle);
            const d = w.worldDir(P.muzzle);
            if (charged > 0.3) {
                for (let i = 0; i < 3; i++) {
                    fx.emit({ world: true, shape: 'ring', pos: o, dir: d, vel: d.clone().multiplyScalar(2 + i * 1.5), life: 0.25 + i * 0.05, size: 0.04, sizeEnd: 0.2 + charged * 0.15 - i * 0.04, color: i ? glow : 0xffffff, opacity: 0.85 });
                }
                for (let i = 0; i < 20; i++) {
                    fx.emit({ world: true, pos: o, vel: K.cone(d, 0.9).multiplyScalar(K.rand(1, 4)), life: K.rand(0.3, 0.6), size: 0.006, sizeEnd: 0, color: 0xffffff, drag: 3, stretch: 0.02 });
                }
            }
            for (let i = 0; i < 26; i++) {
                fx.emit({
                    world: true, pos: o, vel: K.cone(d, 0.28).multiplyScalar(K.rand(2.5, 6)),
                    life: K.rand(0.3, 0.6), size: K.rand(0.008, 0.014), sizeEnd: 0.002, color: glow, drag: 2.6, stretch: 0.01
                });
            }
            for (let i = 0; i < 7; i++) {
                fx.emit({
                    world: true, pos: o, vel: K.cone(d, 0.5).multiplyScalar(K.rand(0.6, 1.8)),
                    life: K.rand(0.6, 1.0), size: 0.025, sizeEnd: K.rand(0.07, 0.11), color: 0xc9d9a0,
                    additive: false, opacity: 0.4, drag: 3.5, gravity: -0.25, fadeIn: 0.05
                });
            }
            fx.emit({ world: true, shape: 'ring', pos: o, dir: d, vel: d.clone().multiplyScalar(1.5), life: 0.2, size: 0.03, sizeEnd: 0.14, color: glow, opacity: 0.8 });
        }
        if (w.atFire(0.33)) {
            const p = w.localPos(P.chamber, [0.07, 0.03, 0]);
            fx.emit({ pos: p, vel: new THREE.Vector3(1.3, 1.1, 0.5), life: 0.8, size: 0.013, sizeEnd: 0.011, color: 0x7e6440, additive: false, gravity: 6, drag: 0.4 });
            for (let i = 0; i < 4; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.3).add(new THREE.Vector3(0.4, 0.3, 0)), life: 0.5, size: 0.004, color: glow, drag: 2 });
            }
        }

        const r = w.reloadT;
        if (r < 0) {
            return;
        }
        if (w.atAct(0.16)) {
            const p = w.localPos(P.chamber, [0, 0.07, 0]);
            for (let i = 0; i < 10; i++) {
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.25).add(new THREE.Vector3(0, 0.25, 0)), life: 0.6, size: 0.006, sizeEnd: 0.02, color: 0xd9d0b0, additive: false, opacity: 0.5, drag: 3 });
            }
        }
        const missing = w.stats.mag - w.reloadFrom;
        for (let k = 0; k < missing; k++) {
            const pod = P.pods[w.reloadFrom + k];
            const [a, z] = this.podWindow(w, k);
            if (w.atAct(a)) {
                for (let i = 0; i < 6; i++) {
                    fx.emit({ pos: P.podSlots[0], vel: K.sphereDir().multiplyScalar(0.2).add(new THREE.Vector3(0.25, 0.45, -0.1)), life: 0.3, size: 0.004, color: glow, drag: 3 });
                }
            }
            if (r > a && r < z) {
                const n = fx.rate('trail' + k, 90, dt);
                for (let i = 0; i < n; i++) {
                    fx.emit({ pos: w.localPos(pod), vel: K.sphereDir().multiplyScalar(0.05), life: 0.3, size: 0.006, sizeEnd: 0, color: glow, drag: 1 });
                }
            }
            if (w.atAct(z)) {
                const p = w.localPos(pod);
                for (let i = 0; i < 8; i++) {
                    fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.35).add(new THREE.Vector3(0, 0.2, 0)), life: 0.35, size: 0.004, color: glow, drag: 3 });
                }
            }
        }
        if (w.atAct(1.6)) {
            const c = w.localPos(P.chamber, [0, 0.05, 0]);
            for (let i = 0; i < 18; i++) {
                const a = (i / 18) * Math.PI * 2;
                fx.emit({
                    pos: c, vel: new THREE.Vector3(Math.cos(a) * 0.5, K.rand(0.05, 0.25), Math.sin(a) * 0.5),
                    life: 0.7, size: 0.006, sizeEnd: 0.026, color: 0xdcd3b4, additive: false, opacity: 0.55, drag: 4.5
                });
            }
        }
    }
});
