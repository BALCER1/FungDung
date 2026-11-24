// Carapace Maul: a living beetle-shell hammer. Overlapping chitin plates over a glowing flesh core
// that breathe, flare and clamp with the swing; mandibles, feelers and little legs twitch.
//   Held (after the draw): the player takes `guard.reduce` less damage (see Players.applyLocal).
//   LMB: wide side swipe hitting every enemy in an arc, alternating forehand / backhand.
//   RMB: ground slam (shockwave, launch, floor debris). In the air it becomes a plunging slam that
//        lands harder, wider and further the higher it was started.
Weapons.register('hammer', {
    name: 'Carapace Maul',
    altName: 'Slam',
    melee: true,
    noise: 18,
    replayAtSwing: true,
    offset: [0.34, -0.46, -0.52],
    sprintYaw: 0.25,
    stats: {
        mag: 0, rate: 1.15, auto: true, damage: 85, pellets: 1, spread: 0, range: 3.5,
        hitDelay: 0.26, drawTime: 0.7,
        kick: { back: 0, up: 0, roll: 0 }
    },
    // Highest damage per mode, also used by the co-op host to clamp guest shots. The slam's falloff
    // and air bonus are applied per enemy on the host (`shapeHit`).
    modeDamage: { slam: 140, slamAir: 140 },
    // A guest's slam is sent from the impact point, which can be a few metres from the eye.
    originReach: 7,
    // Damage taken while the hammer is out (after the draw) is multiplied by 1 - reduce.
    guard: { reduce: 0.3 },
    // arc: degrees, maxTargets: per swing, push / lift: launch speed sideways and up, stun: seconds
    // of stagger on landing, combo: seconds after a swing's end before the combo resets,
    // hitStop: seconds the hammer freezes on a hit.
    swipe: { arc: 120, maxTargets: 5, push: 4.5, lift: 1.8, stun: 0.35, combo: 1.2, hitStop: 0.07 },
    // windup / recover: seconds before and after impact, reach: impact distance ahead, radius: hit
    // radius, edge: damage fraction at the radius, falloff: curve exponent, cooldown: seconds from
    // one slam to the next, move: movement speed while committed, launch / out / stun: [centre,
    // edge] up speed, outward speed and stagger.
    slam: {
        windup: 0.55, recover: 0.65, reach: 1.6, radius: 6, edge: 0.4, falloff: 1.3, cooldown: 4,
        move: 0.35, maxTargets: 12, launch: [7.5, 3], out: [4, 2], stun: [0.6, 0.3], hitStop: 0.09
    },
    // Air slam: hang (seconds hovering while it rises overhead), speed (plunge, m/s), the height
    // bonus k = (drop - minDrop) / (fullDrop - minDrop) in 0..1, and at k = 1: damage +50%,
    // radius +2.5 m, launch +40%, stagger +0.3 s. timeout: longest plunge.
    air: { hang: 0.3, speed: 24, minDrop: 0.5, fullDrop: 3.5, damage: 0.5, radius: 2.5, launch: 0.4, stun: 0.3, timeout: 1.5, move: 0.15 },
    color: 0xff6f9a,
    // Shockwave, radius flash, sparks and crack glow.
    slamColor: 0xa64dff,
    inspect: { time: 3.2 },
    hands: { left: 'upper', right: 'lower' },

    // Poses, in the weapon root's space (camera space minus `offset`). At rest it is held like any
    // hammer: handle up and leaning a little in (REST_UP), striking face pointing ahead (REST_FACE,
    // turned slightly out so a bit of the flank shows). Swings and slams turn about a pivot near
    // the chest.
    REST_UP: [-0.12, 1, -0.25],
    REST_FACE: [0.3, 0, -1],
    SWING_PIVOT: [0.05, -0.3, -0.3],
    // Height of the swipe on screen: the head is kept on the line y = SWIPE_Y * depth (camera
    // space), a little below the crosshair, all the way across.
    SWIPE_Y: -0.12,
    SLAM_PIVOT: [0.14, -0.15, -0.42],

    restQuat(out = new THREE.Quaternion()) {
        const y = new THREE.Vector3().fromArray(this.REST_UP).normalize();
        const f = new THREE.Vector3().fromArray(this.REST_FACE);
        f.addScaledVector(y, -f.dot(y)).normalize();
        const z = f.negate();
        const x = new THREE.Vector3().crossVectors(y, z);
        return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    },
    R: 0.019,

    // ------------------------------------------------------------------ model

    build(b) {
        const K = WeaponKit;
        const R = this.R;
        const lod = b.lod;
        const m = {
            chitin: b.mat('chitin', { color: 0x2b2433, roughness: 0.3, metalness: 0.25 }),
            chitinHi: b.mat('chitinHi', { color: 0x5a4864, roughness: 0.36, metalness: 0.2 }),
            rim: b.mat('rim', { color: 0x8c7088, roughness: 0.45, metalness: 0.15 }),
            face: b.mat('face', { color: 0x3a3140, roughness: 0.5, metalness: 0.3, flatShading: true }),
            joint: b.mat('joint', { color: 0x19141d, roughness: 0.5 }),
            leg: b.mat('leg', { color: 0x3b2f40, roughness: 0.45, metalness: 0.1 }),
            sinew: b.mat('sinew', { color: 0xc9a28f, roughness: 0.75 }),
            sinewDark: b.mat('sinewDark', { color: 0x7a574c, roughness: 0.8 }),
            flesh: b.mat('flesh', { color: 0x9c4a60, roughness: 0.5, emissive: 0xff3d6e, emissiveIntensity: 0.15 }),
            vein: b.glow('vein', 0xff3d6e, 0.45, { color: 0xc8576f, roughness: 0.4 }),
            eye: b.glow('eye', 0xffa84a, 1.1, { color: 0xffc27a, roughness: 0.2 })
        };
        const fixed = mesh => {
            delete mesh.userData.tube;
            return mesh;
        };
        const model = b.part(b.group());
        const body = b.group(model);
        body.quaternion.copy(this.restQuat());
        b.part(body);

        // Handle: a jointed chitin leg with sinew wraps where the hands go and a clawed pommel.
        const segs = [[-0.24, -0.06], [-0.06, 0.12], [0.12, 0.31], [0.31, 0.48]];
        for (const [y0, y1] of segs) {
            const len = y1 - y0;
            b.lathe([[R * 0.86, y0], [R * 1.08, y0 + len * 0.3], [R * 1.02, y0 + len * 0.75], [R * 0.86, y1]], m.chitin, body, null, null, { seg: 12 });
        }
        for (const y of [-0.06, 0.12, 0.31]) {
            b.ring(R * 0.92, 0.0042, m.joint, body, [0, y, 0], [Math.PI / 2, 0, 0], { ts: 14, rs: 5 });
            if (lod !== 'potato') {
                for (const a of [0.4, 2.5, 4.4]) {
                    b.mesh(new THREE.ConeGeometry(0.0035, 0.018, 5), m.chitinHi, body,
                        [Math.cos(a) * R, y + 0.012, Math.sin(a) * R], [Math.sin(a) * 2.3, 0, -Math.cos(a) * 2.3]);
                }
            }
        }
        const wrap = (y0, y1) => {
            b.mesh(new THREE.CylinderGeometry(R + 0.0018, R + 0.0018, y1 - y0, b.n(14)), m.sinewDark, body, [0, (y0 + y1) / 2, 0]);
            const turns = Math.round((y1 - y0) / 0.013);
            const pts = [];
            for (let i = 0; i <= turns * 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                pts.push([Math.cos(a) * (R + 0.003), y0 + (i / (turns * 8)) * (y1 - y0), Math.sin(a) * (R + 0.003)]);
            }
            fixed(b.tube(pts, 0.0017, 0.0017, m.sinew, body, { seg: turns * 14, radial: 4 }));
        };
        wrap(-0.235, -0.01);
        wrap(0.13, 0.24);
        b.lathe([[0.001, -0.3], [0.012, -0.292], [0.022, -0.268], [R * 0.9, -0.24]], m.chitinHi, body, null, null, { seg: 12 });
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 0.5;
            b.mesh(new THREE.ConeGeometry(0.004, 0.028, 5), m.chitin, body,
                [Math.cos(a) * 0.016, -0.282, Math.sin(a) * 0.016], [Math.sin(a) * 2.6, 0, -Math.cos(a) * 2.6]);
        }
        // Glowing threads running down from the head.
        for (let k = 0; k < 3; k++) {
            const pts = [];
            for (let i = 0; i <= 8; i++) {
                const y = 0.5 - i * 0.03;
                const a = k * 2.1 + Math.sin(i * 0.9 + k) * 0.5;
                pts.push([Math.cos(a) * (R * 1.06), y, Math.sin(a) * (R * 1.06)]);
            }
            fixed(b.tube(pts, 0.0018, 0.0006, m.vein, body, { seg: 24, radial: 4 }));
        }
        // Fleshy socket where the handle grows into the head.
        b.lathe([[R * 1.02, 0.465], [0.029, 0.5], [0.037, 0.53], [0.032, 0.555], [0.015, 0.57]], m.flesh, body, null, null, { seg: 14 });
        b.ring(R * 1.1, 0.004, m.chitinHi, body, [0, 0.47, 0], [Math.PI / 2, 0, 0], { ts: 14, rs: 5 });

        // Head: everything that squashes and breathes.
        const head = b.part(b.group(body, [0, 0.6, 0]));
        const fleshG = b.part(b.group(head));
        b.sphere(1, m.flesh, fleshG, [0, 0, 0], [0.05, 0.047, 0.11], { ws: 20, hs: 14, wobble: 0.05, freq: 6 });
        for (let k = 0; k < 4; k++) {
            const pts = [];
            const t0 = -Math.PI / 2 + (k - 1.5) * 0.55;
            for (let i = 0; i <= 8; i++) {
                const z = -0.09 + i * 0.0225;
                const s = Math.sqrt(Math.max(0, 1 - (z / 0.11) * (z / 0.11)));
                const th = t0 + 0.25 * Math.sin(z * 40 + k);
                pts.push([Math.cos(th) * 0.0508 * s, Math.sin(th) * 0.0478 * s, z]);
            }
            fixed(b.tube(pts, 0.0022, 0.0012, m.vein, fleshG, { seg: 26, radial: 4 }));
        }

        // Shell: five overlapping segments, each split into a left and right half hinged on the
        // dorsal ridge, so they can lift (breathe) and open outward like wing cases.
        const plates = [];
        const th = 0.0075;
        for (let i = 0; i < 5; i++) {
            const z0 = -0.1 + i * 0.04;
            const len = 0.05;
            const Rr = 0.066 - i * 0.0022;
            for (const side of [-1, 1]) {
                const aA = Math.PI / 2;
                const aB = Math.PI / 2 - side * 2.6;
                const n = b.n(10, 4);
                const shape = new THREE.Shape();
                for (let j = 0; j <= n; j++) {
                    const a = K.lerp(aA, aB, j / n);
                    if (j === 0) {
                        shape.moveTo(Math.cos(a) * Rr, Math.sin(a) * Rr - Rr);
                    } else {
                        shape.lineTo(Math.cos(a) * Rr, Math.sin(a) * Rr - Rr);
                    }
                }
                for (let j = n; j >= 0; j--) {
                    const a = K.lerp(aA, aB, j / n);
                    shape.lineTo(Math.cos(a) * (Rr - th), Math.sin(a) * (Rr - th) - Rr);
                }
                const bevel = lod !== 'potato';
                const geo = new THREE.ExtrudeGeometry(shape, {
                    depth: len, bevelEnabled: bevel, bevelThickness: 0.0018, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 1
                });
                const pivot = b.part(b.group(head, [0, Rr, z0]));
                b.mesh(geo, m.chitin, pivot);
                if (lod !== 'potato') {
                    b.mesh(new THREE.TorusGeometry(Rr - th * 0.4, 0.0022, b.n(5, 3), b.n(18, 6), 2.6), m.rim, pivot,
                        [0, -Rr, len], [0, 0, side > 0 ? aB : aA]);
                }
                if (side > 0) {
                    b.box(0.008, 0.006, len * 0.92, m.chitinHi, pivot, [0, 0.0012, len / 2]);
                }
                plates.push({ pivot, side, i });
            }
        }

        // Belly scutes closing the gap underneath, in front of and behind the socket. Flesh shows at
        // their seams and around the socket, where the legs come out.
        const scutes = [];
        for (const [z0, len] of [[-0.1, 0.03], [-0.072, 0.03], [0.04, 0.032], [0.07, 0.034]]) {
            const Rr = 0.059;
            const n = b.n(8, 3);
            const shape = new THREE.Shape();
            const aA = -Math.PI / 2 - 0.58;
            const aB = -Math.PI / 2 + 0.58;
            for (let j = 0; j <= n; j++) {
                const a = K.lerp(aA, aB, j / n);
                if (j === 0) {
                    shape.moveTo(Math.cos(a) * Rr, Math.sin(a) * Rr);
                } else {
                    shape.lineTo(Math.cos(a) * Rr, Math.sin(a) * Rr);
                }
            }
            for (let j = n; j >= 0; j--) {
                const a = K.lerp(aA, aB, j / n);
                shape.lineTo(Math.cos(a) * (Rr - 0.006), Math.sin(a) * (Rr - 0.006));
            }
            const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 1 });
            const sc = b.part(b.group(head, [0, 0, z0]));
            b.mesh(geo, m.chitinHi, sc);
            scutes.push(sc);
        }

        // Striking face: a flared chitin anvil with a ridged pad and rim.
        const face = b.part(b.group(head, [0, 0, -0.1]));
        const anvil = new THREE.CylinderGeometry(0.064, 0.071, 0.04, b.n(18));
        anvil.rotateX(Math.PI / 2);
        b.mesh(anvil, m.face, face, [0, 0, -0.015]);
        const pad = new THREE.CylinderGeometry(0.056, 0.06, 0.012, b.n(18));
        pad.rotateX(Math.PI / 2);
        b.mesh(pad, m.chitinHi, face, [0, 0, -0.04]);
        b.ring(0.069, 0.0042, m.rim, face, [0, 0, -0.03], null, { ts: 28, rs: 5 });
        if (lod !== 'potato') {
            for (let k = 0; k < 6; k++) {
                b.box(0.004, 0.05, 0.004, m.rim, face, [0, 0, -0.047], [0, 0, k * Math.PI / 3]);
            }
        }

        // The beetle's own head at the back: crown, eyes, mandibles and feelers.
        const crown = b.group(head, [0, -0.004, 0.11]);
        b.sphere(1, m.chitinHi, crown, [0, 0, 0.005], [0.044, 0.038, 0.034], { ws: 16, hs: 10 });
        for (const s of [-1, 1]) {
            b.sphere(0.0085, m.eye, crown, [s * 0.03, 0.012, 0.016], null, { ws: 10, hs: 8 });
        }
        const jaws = [];
        for (const s of [-1, 1]) {
            const jaw = b.part(b.group(crown, [s * 0.02, -0.014, 0.028]));
            jaw.userData.side = s;
            fixed(b.tube([[0, 0, 0], [s * 0.02, -0.002, 0.025], [s * 0.014, 0.002, 0.05], [-s * 0.004, 0, 0.062]], 0.008, 0.0015, m.chitinHi, jaw, { seg: 16, radial: 6 }));
            b.mesh(new THREE.ConeGeometry(0.003, 0.011, 5), m.rim, jaw, [s * 0.013, 0, 0.032], [0, 0, s * Math.PI / 2]);
            jaws.push(jaw);
        }
        const antennae = [];
        for (const s of [-1, 1]) {
            const ant = b.part(b.group(crown, [s * 0.014, 0.03, 0]));
            ant.userData.side = s;
            fixed(b.tube([[0, 0, 0], [s * 0.008, 0.022, 0.012], [s * 0.02, 0.038, 0.035], [s * 0.032, 0.042, 0.065]], 0.0016, 0.0007, m.leg, ant, { seg: 14, radial: 4 }));
            b.sphere(0.0022, m.eye, ant, [s * 0.032, 0.042, 0.065], null, { ws: 6, hs: 4 });
            antennae.push(ant);
        }

        // Little legs under the head, dangling out from under the shell.
        const legs = [];
        const rows = lod === 'potato' ? [-0.02] : [-0.075, -0.02, 0.06];
        rows.forEach((z, r) => {
            for (const s of [-1, 1]) {
                const hip = b.part(b.group(head, [s * 0.034, -0.05, z], [0, 0, s * 0.1]));
                fixed(b.tube([[0, 0, 0], [s * 0.013, -0.002, 0], [s * 0.026, -0.01, 0]], 0.0026, 0.0018, m.leg, hip, { seg: 6, radial: 5 }));
                const knee = b.part(b.group(hip, [s * 0.026, -0.01, 0]));
                fixed(b.tube([[0, 0, 0], [s * 0.004, -0.015, 0.002], [s * 0.006, -0.03, 0.003]], 0.0018, 0.0007, m.leg, knee, { seg: 6, radial: 4 }));
                legs.push({ hip, knee, s, ph: r * 2.1 + (s > 0 ? Math.PI : 0), tw: 0 });
            }
        });

        const muzzle = b.group(head, [0, 0, -0.15]);
        b.grip('lower', body, [0, -0.065, 0], { fingers: [0, 0, -1], back: [1, 0, 0], around: R + 0.004, curl: 0.95 });
        b.grip('upper', body, [0, 0.185, 0], { fingers: [0, 0, -1], back: [-1, 0, 0], around: R + 0.004, curl: 0.95 });
        // Both hands at the very end of the handle, for the long sweeping swipe.
        b.grip('endLow', body, [0, -0.19, 0], { fingers: [0, 0, -1], back: [1, 0, 0], around: R + 0.004, curl: 1 });
        b.grip('endHigh', body, [0, -0.09, 0], { fingers: [0, 0, -1], back: [-1, 0, 0], around: R + 0.004, curl: 1 });
        return { model, body, head, fleshG, plates, scutes, face, jaws, antennae, legs, muzzle, m };
    },

    init(w) {
        const d = w.data;
        d.combo = 0;
        d.lastSwing = -99;
        d.cool = 0;
        d.buffer = 0;
        d.stopT = 0;
        d.st = '';
        d.impacted = false;
        d.impactAt = 0;
        d.strikeAt = -1;
        d.peak = 0;
        d.power = 0;
        d.remotePower = 0;
        d.swingHit = false;
        d.handK = 0;
        d.handFrom = 0;
        d.open = 0;
        d.squash = new Spring(260, 13);
        d.bulge = new Spring(170, 9);
        d.rattle = new Spring(320, 8);
        d.jolt = new Spring(230, 15);
        d.restQ = this.restQuat();
        d.off = new THREE.Vector3().fromArray(this.offset);
        d.swingPivot = new THREE.Vector3().fromArray(this.SWING_PIVOT);
        d.slamPivot = new THREE.Vector3().fromArray(this.SLAM_PIVOT);
        d.P = new THREE.Vector3();
        d.Q = new THREE.Quaternion().copy(d.restQ);
        d.fromP = new THREE.Vector3();
        d.fromQ = new THREE.Quaternion().copy(d.restQ);
        d.tp = new THREE.Vector3();
        d.tq = new THREE.Quaternion();
        d.p2 = new THREE.Vector3();
        d.q2 = new THREE.Quaternion();
        d.q3 = new THREE.Quaternion();
        d.vx = new THREE.Vector3();
        d.vy = new THREE.Vector3();
        d.vz = new THREE.Vector3();
        d.m4 = new THREE.Matrix4();
        d.eu = new THREE.Euler();
        d.v = new THREE.Vector3();
        d.v2 = new THREE.Vector3();
    },

    // ------------------------------------------------------------------ guard

    damageTaken(w) {
        return w.state === 'draw' ? 1 : 1 - this.guard.reduce;
    },

    // A hit was softened: the hammer braces and its plates clamp.
    guarded(w, dmg) {
        const d = w.data;
        d.jolt.kick(-2.5 - Math.min(4, dmg * 0.08));
        d.rattle.kick(5);
        d.squash.kick(2);
    },

    // ------------------------------------------------------------------ swipe

    isSwipe(mode) {
        return mode === 'swipeL' || mode === 'swipeR';
    },

    fireOpts(w) {
        const d = w.data;
        if (w.time - d.lastSwing > 1 / this.stats.rate + this.swipe.combo) {
            d.combo = 0;
        }
        const mode = d.combo % 2 ? 'swipeR' : 'swipeL';
        d.combo++;
        d.lastSwing = w.time;
        return { mode };
    },

    // Each swing blends in from wherever the hammer is now (rest, or held cocked by a combo).
    onFire(w) {
        const d = w.data;
        d.fromP.copy(d.P);
        d.fromQ.copy(d.Q);
        d.swingHit = false;
        d.handFrom = d.handK || 0;
    },

    enemyOf(obj) {
        for (let o = obj; o; o = o.parent) {
            if (o.userData.enemy) {
                return o.userData.enemy;
            }
        }
        return null;
    },

    // A ray toward the enemy's torso, head or legs that reaches it without a wall in between. Other
    // enemies do not block (a crowd is hit together). Same raycaster and scene as `Arsenal.trace`,
    // so batched meshes and part multipliers work as for a shot.
    losHit(w, from, e) {
        const v = w.data.v2;
        for (const k of [0.55, 0.85, 0.3]) {
            const to = v.set(e.pos.x, e.pos.y + e.height * k, e.pos.z).sub(from);
            const dist = to.length();
            if (dist < 1e-3) {
                continue;
            }
            const h = this.rayTo(from, to.multiplyScalar(1 / dist), dist + 0.6, e);
            if (h) {
                return h;
            }
        }
        return null;
    },

    rayTo(from, dir, far, e) {
        const room = Game.room;
        if (!room) {
            return null;
        }
        const ray = Arsenal.ray;
        ray.set(from, dir);
        ray.far = far;
        for (const h of ray.intersectObject(room.group, true)) {
            if (!h.object.visible) {
                continue;
            }
            const owner = this.enemyOf(h.object);
            if (owner === e) {
                const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
                return { point: h.point, normal, object: h.object, distance: h.distance };
            }
            if (!owner) {
                return null;
            }
        }
        return null;
    },

    // Every enemy in the arc in front, nearest first, at most once each. The one under the
    // crosshair keeps the crosshair hit, so aiming at a head still crits.
    swipeHits(w, shot) {
        const S = this.swipe;
        const range = this.stats.range;
        const o = shot.origin;
        const fwd = w.data.v.set(shot.aim.x, 0, shot.aim.z);
        if (fwd.lengthSq() < 1e-6) {
            return [];
        }
        fwd.normalize();
        const half = S.arc * Math.PI / 360;
        const first = shot.hits && shot.hits[0];
        const firstE = first ? this.enemyOf(first.object) : null;
        const cands = [];
        for (const e of Enemies.list) {
            if (e.dead) {
                continue;
            }
            const dx = e.pos.x - o.x;
            const dz = e.pos.z - o.z;
            const dist = Math.hypot(dx, dz);
            if (dist - e.radius > range || e.pos.y + e.height < o.y - 2.4 || e.pos.y > o.y + 0.9) {
                continue;
            }
            if (dist > 0.05) {
                const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dz * fwd.z) / dist)));
                if (ang > half + Math.asin(Math.min(1, e.radius / Math.max(dist, e.radius)))) {
                    continue;
                }
            }
            cands.push({ e, dist });
        }
        cands.sort((a, b) => a.dist - b.dist);
        const out = [];
        for (const c of cands) {
            if (out.length >= S.maxTargets) {
                break;
            }
            if (first && c.e === firstE) {
                out.push(first);
                continue;
            }
            const h = this.losHit(w, o, c.e);
            if (h && h.distance <= range + c.e.radius + 0.6) {
                out.push(h);
            }
        }
        return out;
    },

    // The swing connects: swap the single crosshair trace for every enemy in the arc.
    onTrace(w, shot) {
        const d = w.data;
        const first = shot.hits && shot.hits[0];
        if (w.remote) {
            if (first && !this.enemyOf(first.object)) {
                this.scrape(w, first);
            }
            shot.hits = [];
            return;
        }
        const hits = this.swipeHits(w, shot);
        shot.hits = hits;
        shot.power = 0;
        if (hits.length) {
            d.swingHit = true;
            d.stopT = this.swipe.hitStop;
            d.squash.kick(5);
            d.bulge.kick(4);
            d.rattle.kick(5);
            Enemies.shake(0.3, hits[0].point);
            const K = WeaponKit;
            for (const h of hits) {
                for (let i = 0; i < 8; i++) {
                    w.fx.emit({
                        world: true, pos: h.point, vel: K.sphereDir().multiplyScalar(K.rand(0.5, 1.6)), life: K.rand(0.3, 0.6),
                        size: 0.02, sizeEnd: 0.06, color: i % 2 ? 0xffc2d0 : this.color, additive: i % 2 === 0, opacity: 0.5, drag: 3
                    });
                }
            }
        } else if (first && !this.enemyOf(first.object)) {
            this.scrape(w, first);
            d.stopT = 0.035;
            d.rattle.kick(3);
        }
    },

    scrape(w, hit) {
        const K = WeaponKit;
        for (let i = 0; i < 7; i++) {
            const v = K.sphereDir().multiplyScalar(0.8).addScaledVector(hit.normal, 1.5).multiplyScalar(K.rand(0.8, 2));
            w.fx.emit({ world: true, pos: hit.point, vel: v, life: K.rand(0.12, 0.25), size: 0.006, sizeEnd: 0, color: i % 2 ? 0xffe6c0 : 0xffffff, drag: 3, gravity: 6, stretch: 0.02 });
        }
        const mat = hit.object && hit.object.material;
        if (mat && mat.color) {
            GroundFX.scuff(hit.point, mat.color, 4);
        }
    },

    // ------------------------------------------------------------------ slam

    altPress(w) {
        if (!w.remote) {
            w.data.buffer = 0.3;
        }
    },

    canSlam(w, move) {
        const d = w.data;
        return w.state === 'ready' && !w.pending && d.cool <= 0 && !(move && move.sprinting) &&
            (w.cooldown <= 0 || w.fireT > 0.45);
    },

    startSlam(w) {
        const d = w.data;
        const air = !Player.onGround;
        d.cool = this.slam.cooldown;
        d.buffer = 0;
        w.buffer = 0;
        w.setState(air ? 'slamAir' : 'slam');
        this.enterSlam(w);
        d.peak = Player.pos.y;
    },

    enterSlam(w) {
        const d = w.data;
        d.st = w.state;
        d.impacted = false;
        d.impactAt = 0;
        d.strikeAt = -1;
        d.remoteImpact = false;
    },

    // Where the slam lands: `reach` ahead of whoever holds it (less if a wall is closer), on the
    // first surface below. Works for the local player and for a teammate's copy alike.
    impactPoint(w, air) {
        const d = w.data;
        const eye = w.root.parent || w.root;
        eye.updateWorldMatrix(true, false);
        const o = d.v.setFromMatrixPosition(eye.matrixWorld);
        const fwd = d.v2.set(0, 0, -1).applyQuaternion(eye.getWorldQuaternion(d.q3));
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-4) {
            fwd.set(0, 0, -1);
        }
        fwd.normalize();
        const feet = w.remote ? o.y - CONFIG.eye : Player.pos.y;
        let reach = air ? 0.7 : this.slam.reach;
        for (let s = 0.1; s <= reach; s += 0.1) {
            if (GroundFX.solidAt(o.x + fwd.x * s, feet + 0.6, o.z + fwd.z * s)) {
                reach = Math.max(0, s - 0.2);
                break;
            }
        }
        const hit = GroundFX.sample(o.x + fwd.x * reach, feet + 1, o.z + fwd.z * reach, 4);
        hit.aim = fwd.clone();
        return hit;
    },

    slamRadius(k) {
        return this.slam.radius + this.air.radius * k;
    },

    // Enemies around the impact, nearest first, that the blast can reach without a wall between.
    slamHits(w, I, R) {
        const from = new THREE.Vector3(I.x, I.y + 0.5, I.z);
        const cands = [];
        for (const e of Enemies.list) {
            if (e.dead) {
                continue;
            }
            const dist = Math.hypot(e.pos.x - I.x, e.pos.z - I.z);
            const dy = e.pos.y - I.y;
            if (dist > R + e.radius || dy < -1.5 || dy > 1.6) {
                continue;
            }
            cands.push({ e, dist });
        }
        cands.sort((a, b) => a.dist - b.dist);
        const out = [];
        for (const c of cands) {
            if (out.length >= this.slam.maxTargets) {
                break;
            }
            let h = this.losHit(w, from, c.e);
            if (!h && c.dist < 1.4 && c.e.partById) {
                // Standing on the impact: the ray starts inside it. Any part will do.
                const found = c.e.partById(0);
                if (found && found.mesh) {
                    h = { point: new THREE.Vector3(c.e.pos.x, c.e.pos.y + c.e.height * 0.5, c.e.pos.z), normal: new THREE.Vector3(0, 1, 0), object: found.mesh, distance: c.dist };
                }
            }
            if (h) {
                out.push(h);
            }
        }
        return out;
    },

    // The hammer hits the floor. Effects on every client; damage only from the holder's own copy.
    impact(w, air) {
        const d = w.data;
        const S = this.slam;
        const A = this.air;
        d.impacted = true;
        d.impactAt = w.actT;
        const I = this.impactPoint(w, air);
        let k = 0;
        if (air) {
            k = w.remote ? d.remotePower : (d.peak - I.point.y - A.minDrop) / (A.fullDrop - A.minDrop);
            k = Math.max(0, Math.min(1, k || 0));
        }
        d.power = k;
        const R = this.slamRadius(k);
        GroundFX.slam({ point: I.point, color: I.color, glow: this.slamColor, power: k, radius: R, box: I.box });
        Enemies.shake((w.remote ? 0.9 : 1.15) + 0.6 * k, I.point);
        d.stopT = S.hitStop;
        d.squash.kick(9 + 5 * k);
        d.bulge.kick(6 + 3 * k);
        d.rattle.kick(8);
        if (w.remote || !w.onShot) {
            return;
        }
        const mode = air ? 'slamAir' : 'slam';
        const aim = I.aim;
        w.data.lastCharge = Math.round(k * 100) / 100;
        w.onShot({
            weapon: w.id, mode, origin: I.point.clone(), aim, dirs: [aim.clone()], damage: this.modeDamage[mode],
            range: R, power: k, side: 0, muzzle: I.point.clone(), fire: { mode },
            hits: this.slamHits(w, I.point, R)
        });
    },

    move(w) {
        const d = w.data;
        if (w.state === 'slam') {
            return { scale: this.slam.move, noJump: true };
        }
        if (w.state === 'slamAir') {
            return { scale: d.impacted ? this.slam.move : w.actT < this.air.hang ? 0.5 : this.air.move, noJump: true };
        }
        return null;
    },

    // Runs on remote copies too, which see the slam states arrive over the network and the impact
    // as a fire event (`replay`).
    altTick(w, dt, move) {
        const d = w.data;
        const S = this.slam;
        const A = this.air;
        const real = dt / (w.timeScale || 1);
        if (d.stopT > 0) {
            d.stopT -= real;
        }
        w.timeScale = d.stopT > 0 ? 0.05 : 1;
        d.cool = Math.max(0, d.cool - real);
        d.buffer -= real;
        if (w.state !== d.st) {
            if (w.state === 'slam' || w.state === 'slamAir') {
                this.enterSlam(w);
            }
            d.st = w.state;
        }
        if (!w.remote && d.buffer > 0 && this.canSlam(w, move)) {
            this.startSlam(w);
        }
        const late = w.remote ? 0.4 : 0;

        if (w.state === 'slam') {
            if (!d.impacted && w.actT >= S.windup) {
                this.impact(w, false);
            }
            if (w.actT >= S.windup + S.recover + late) {
                w.setState('ready');
            }
        }

        if (w.state === 'slamAir') {
            if (!d.impacted && !w.remote) {
                d.peak = Math.max(d.peak, Player.pos.y);
                if (w.actT < A.hang) {
                    Player.vel.y *= Math.exp(-7 * real);
                } else {
                    Player.vel.y = -A.speed;
                    if (d.strikeAt < 0) {
                        const floor = GroundFX.groundAt(Player.pos.x, Player.pos.y + 0.1, Player.pos.z);
                        if ((Player.pos.y - floor) / A.speed < 0.09) {
                            d.strikeAt = w.actT;
                        }
                    }
                    if ((Player.onGround && w.actT > A.hang + 0.01) || w.actT > A.hang + A.timeout) {
                        this.impact(w, true);
                    }
                }
            }
            if (!d.impacted && w.remote) {
                if (d.remoteImpact && w.actT >= d.strikeAt + 0.06) {
                    this.impact(w, true);
                } else if (w.actT > A.hang + A.timeout) {
                    this.impact(w, true);
                }
            }
            if (d.impacted && w.actT >= d.impactAt + S.recover + late) {
                w.setState('ready');
            }
        }
    },

    // A teammate's fire event. Swipes replay as normal swings; a slam event marks the impact.
    replay(w, o) {
        const d = w.data;
        const mode = o.mode || '';
        if (mode === 'slam' || mode === 'slamAir') {
            if (w.state !== mode) {
                w.setState(mode, false);
                this.enterSlam(w);
                if (mode === 'slam') {
                    w.actT = this.slam.windup - 0.01;
                } else {
                    w.actT = this.air.hang;
                }
            }
            d.remotePower = w.data.lastCharge || 0;
            if (mode === 'slamAir' && !d.impacted && !d.remoteImpact) {
                d.remoteImpact = true;
                d.strikeAt = w.actT;
            }
            return;
        }
        if (w.state !== 'ready') {
            w.setState('ready', false);
        }
        w.fire(o);
    },

    cancel(w) {
        const d = w.data;
        d.stopT = 0;
        w.timeScale = 1;
        d.buffer = 0;
        d.st = '';
        d.impacted = false;
        d.strikeAt = -1;
    },

    // ------------------------------------------------------------------ hits (host)

    flat(v, out) {
        out.set(v.x, 0, v.z);
        const l = out.length();
        return l > 1e-6 ? out.multiplyScalar(1 / l) : out.set(0, 0, -1);
    },

    // One enemy's share of a hammer hit, from shot data only: the swipe shoves sideways along the
    // swing, the slam launches up and away from the impact with damage falling off to the edge.
    shapeHit(shot, e) {
        const mode = shot.mode;
        const v = new THREE.Vector3();
        const out = new THREE.Vector3(e.pos.x - shot.origin.x, 0, e.pos.z - shot.origin.z);
        if (this.isSwipe(mode)) {
            const W = this.swipe;
            const aim = this.flat(shot.aim || (shot.by ? shot.by.aim : v.set(0, 0, -1)), new THREE.Vector3());
            const s = mode === 'swipeR' ? 1 : -1;
            if (out.lengthSq() > 1e-6) {
                out.normalize();
            }
            v.set(-aim.z * s, 0, aim.x * s).addScaledVector(out, 0.6);
            if (v.lengthSq() > 1e-6) {
                v.normalize();
            }
            v.multiplyScalar(W.push);
            v.y = W.lift;
            return { scale: 1, push: v, stun: W.stun };
        }
        if (mode === 'slam' || mode === 'slamAir') {
            const S = this.slam;
            const A = this.air;
            const k = mode === 'slamAir' ? Math.max(0, Math.min(1, shot.power || 0)) : 0;
            const R = this.slamRadius(k);
            const dist = out.length();
            const f = Math.min(1, dist / R);
            const L = WeaponKit.lerp;
            if (dist > 1e-3) {
                out.multiplyScalar(1 / dist);
            } else if (shot.aim) {
                this.flat(shot.aim, out);
            }
            const boost = 1 + A.launch * k;
            v.copy(out).multiplyScalar(L(S.out[0], S.out[1], f) * boost);
            v.y = L(S.launch[0], S.launch[1], f) * boost;
            return {
                scale: L(1, S.edge, Math.pow(f, S.falloff)) * (1 + A.damage * k),
                push: v,
                stun: L(S.stun[0], S.stun[1], f) + A.stun * k
            };
        }
        return null;
    },

    maxHits(mode) {
        return this.isSwipe(mode) ? this.swipe.maxTargets : this.slam.maxTargets;
    },

    // Host check of a guest's swipe or slam against the hammer's own stats. Returns the hits to
    // keep, or null to drop the whole shot.
    validate(shot, hits, by) {
        const now = performance.now() / 1000;
        const H = by.hammerNet || (by.hammerNet = { swipe: -99, slam: -99 });
        const seen = new Set();
        const out = [];
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        if (this.isSwipe(shot.mode)) {
            if (!shot.aim || now - H.swipe < 0.55 / this.stats.rate) {
                return null;
            }
            this.flat(shot.aim, a);
            if (a.dot(this.flat(by.aim, b)) < Math.cos(0.75)) {
                return null;
            }
            H.swipe = now;
            const half = this.swipe.arc * Math.PI / 360 + 0.26;
            for (const h of hits) {
                const e = Enemies.get(h[0]);
                if (!e || e.dead || seen.has(e.id)) {
                    continue;
                }
                const dx = (+h[2] || 0) - by.eye.x;
                const dz = (+h[4] || 0) - by.eye.z;
                const dist = Math.hypot(dx, dz);
                if (dist > this.stats.range + e.radius + 1) {
                    continue;
                }
                if (dist > 0.5 && Math.acos(Math.max(-1, Math.min(1, (dx * a.x + dz * a.z) / dist))) > half + Math.asin(Math.min(1, e.radius / dist))) {
                    continue;
                }
                seen.add(e.id);
                out.push(h);
                if (out.length >= this.swipe.maxTargets) {
                    break;
                }
            }
            return out;
        }
        if (shot.mode !== 'slam' && shot.mode !== 'slamAir') {
            return null;
        }
        const A = this.air;
        const air = shot.mode === 'slamAir';
        const I = shot.origin;
        if (now - H.slam < this.slam.cooldown * 0.85 ||
            Math.hypot(I.x - by.pos.x, I.z - by.pos.z) > this.slam.reach + 1.5 + (air ? 1.5 : 0)) {
            return null;
        }
        H.slam = now;
        if (air) {
            const peak = Math.max(by.peakY === undefined ? by.pos.y : by.peakY, by.pos.y);
            const kMax = Math.max(0, Math.min(1, (peak + 1 - I.y - A.minDrop) / (A.fullDrop - A.minDrop)));
            shot.power = Math.min(shot.power || 0, kMax);
        } else {
            shot.power = 0;
        }
        const R = this.slamRadius(shot.power);
        const from = new THREE.Vector3(I.x, I.y + 0.5, I.z);
        for (const h of hits) {
            const e = Enemies.get(h[0]);
            if (!e || e.dead || seen.has(e.id)) {
                continue;
            }
            const dist = Math.hypot(e.pos.x - I.x, e.pos.z - I.z);
            if (dist > R + e.radius + 0.5 || Math.abs(e.pos.y - I.y) > 2) {
                continue;
            }
            const to = b.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z).sub(from);
            const len = to.length();
            if (len > 0.6) {
                const wall = Arsenal.trace(from, to.multiplyScalar(1 / len), len);
                if (wall && !this.enemyOf(wall.object) && wall.distance < len - 0.4) {
                    continue;
                }
            }
            seen.add(e.id);
            out.push(h);
            if (out.length >= this.slam.maxTargets) {
                break;
            }
        }
        return out;
    },

    // ------------------------------------------------------------------ HUD

    meter(w) {
        const d = w.data;
        return d.cool > 0 ? 1 - d.cool / this.slam.cooldown : 1;
    },

    status(w) {
        const d = w.data;
        const out = [];
        if (this.damageTaken(w) < 1) {
            out.push('Guard -' + Math.round(this.guard.reduce * 100) + '%');
        }
        if (w.state === 'slam' || w.state === 'slamAir') {
            out.push(d.impacted ? 'Recovering' : 'Slamming');
        } else {
            out.push(d.cool > 0 ? 'Slam ' + Math.ceil(d.cool) + 's' : 'Slam ready');
        }
        return out.join('  ·  ');
    },

    // ------------------------------------------------------------------ animation

    // The hammer laid out along a horizontal swing at angle `a` (0 straight ahead, + to the right)
    // and height `e`: handle pointing out from the pivot, face (-z) leading a leftward sweep.
    // `reach` is how far out the arms push the handle, `roll` turns it in the wrists.
    swingPose(w, a, e, reach, roll, outP, outQ) {
        const d = w.data;
        const y = d.vy.set(Math.sin(a), e, -Math.cos(a)).normalize();
        const z = d.vz.set(Math.cos(a), 0, Math.sin(a));
        const x = d.vx.crossVectors(y, z);
        outQ.setFromRotationMatrix(d.m4.makeBasis(x, y, z));
        if (roll) {
            outQ.multiply(d.q3.setFromAxisAngle(d.v.set(0, 1, 0), roll));
        }
        outP.copy(d.swingPivot).addScaledVector(y, reach).sub(d.off);
    },

    // The hammer in an overhead arc: `b` = 0 handle straight up, rising toward pi/2 (ahead) and
    // past it (down in front), leaning `lean` to the right. The face leads the strike.
    slamPose(w, b, lean, outP, outQ) {
        const d = w.data;
        const y = d.vy.set(lean, Math.cos(b), -Math.sin(b)).normalize();
        const z = d.vz.set(0, Math.sin(b), Math.cos(b));
        const x = d.vx.crossVectors(y, z);
        outQ.setFromRotationMatrix(d.m4.makeBasis(x, y, z));
        outP.copy(d.slamPivot).addScaledVector(y, 0.2).sub(d.off);
    },

    pose(w, dt) {
        const K = WeaponKit;
        const P = w.parts;
        const d = w.data;
        for (const s of [d.squash, d.bulge, d.rattle, d.jolt]) {
            s.update(dt);
        }
        const pos = d.tp.set(0, 0, 0);
        const quat = d.tq.copy(d.restQ);
        const look = { open: 0, flare: 0, lead: 1, legs: 0.25 };
        const f = w.fireT;
        const cycle = 1 / this.stats.rate;

        if (w.state === 'slam' || w.state === 'slamAir') {
            this.poseSlam(w, pos, quat, look);
        } else if (w.state === 'ready' && f < cycle + 0.1 && this.isSwipe(w.lastMode)) {
            this.poseSwipe(w, f, cycle, pos, quat, look);
        }
        const it = w.inspectT;
        if (it >= 0) {
            this.poseInspect(w, it, pos, quat, look);
        }

        // Idle crawl: the head weighs the hammer down a little and it never sits quite still.
        const t = w.time;
        pos.y += d.jolt.x * 0.012 + Math.sin(t * 1.1) * 0.002;
        pos.x += Math.sin(t * 0.7) * 0.0015;
        d.P.copy(pos);
        d.Q.copy(quat);
        P.body.position.copy(pos);
        P.body.quaternion.copy(quat);

        this.animateShell(w, dt, look);
    },

    // Swing height that puts the head at SWIPE_Y on screen at angle `a`: closer at the sides, so
    // it is raised there to stay level instead of dipping.
    levelE(w, a, reach) {
        const p = w.data.swingPivot;
        const D = reach + 0.6;
        return (this.SWIPE_Y * (-p.z + D * Math.cos(a)) - p.y) / D;
    },

    poseSwipe(w, f, cycle, pos, quat, look) {
        const K = WeaponKit;
        const d = w.data;
        const H = this.stats.hitDelay;
        // side +1: backhand, sweeping to the right with the mandibles leading; -1: forehand.
        const side = w.lastMode === 'swipeR' ? 1 : -1;
        // A sweep of the whole area: both hands slide to the end of the handle (handPose) and the
        // arms stretch right out, so the head travels a long, wide, nearly level arc from far on
        // the starting side to far on the other, crossing the middle as the hit lands (at H).
        // Wind: arms already reaching out to the side, coiling back. Sweep: long and steady.
        // Follow through past the far side, then recover.
        const aWind = -side * 0.95;
        const aEnd = side * 0.95;
        const aOver = side * 1.12;
        const u = K.e('outCubic', f, 0, H - 0.14);
        const coil = K.hump(f, 0, H - 0.1) * 0.12;
        const s = K.e('inOutSine', f, H - 0.14, H + 0.14);
        const o = K.e('outCubic', f, H + 0.14, H + 0.3);
        const r = K.e('inOutCubic', f, H + 0.34, cycle - 0.02);
        const a = aWind - side * coil + (aEnd - aWind) * s + (aOver - aEnd) * o;
        const reach = K.lerp(0.4 - coil * 0.3, 0.62, K.ease.outQuad(K.seg(s, 0, 0.5))) - 0.06 * o;
        const e = this.levelE(w, a, reach) + coil * 0.2 - 0.02 * o;
        const roll = side * (0.1 * (1 - s) - 0.12 * o);
        this.swingPose(w, a, e, reach, roll, d.p2, d.q2);
        pos.copy(d.fromP).lerp(d.p2, u);
        quat.copy(d.fromQ).slerp(d.q2, u);
        // The whole view turns with the body: a shove into the swing, then it settles.
        if (w.atFire(H - 0.14)) {
            w.swayX.kick(-side * 3);
            w.recoilR.kick(side * 0.3);
            w.recoilZ.kick(-0.4);
        }
        if (r > 0) {
            // Trigger held: stay cocked on the side the next swing starts from. Otherwise go home.
            const next = d.combo % 2 ? 1 : -1;
            if (!w.remote && w.trigger) {
                this.swingPose(w, -next * 0.95, this.levelE(w, -next * 0.95, 0.4), 0.4, next * 0.1, d.p2, d.q2);
            } else {
                d.p2.set(0, 0, 0);
                d.q2.copy(d.restQ);
            }
            pos.lerp(d.p2, r);
            quat.slerp(d.q2, r);
        }
        // Wind-up drags the plates open; the sweep flares the trailing plates; a hit clamps them.
        look.open = 0.25 * K.hump(f, 0, H) * (1 - s);
        look.flare = 0.55 * K.hump(f, H - 0.14, H + 0.24) * (d.swingHit && f > H ? 0.3 : 1);
        look.lead = side;
        look.legs = 0.6 + 0.6 * K.hump(f, 0, H + 0.2);
    },

    poseSlam(w, pos, quat, look) {
        const K = WeaponKit;
        const d = w.data;
        const S = this.slam;
        const A = this.air;
        const t = w.actT;
        const air = w.state === 'slamAir';
        let raise;
        let strike;
        let rec = 0;
        let top;
        if (!air) {
            raise = K.e('inOutSine', t, 0, S.windup * 0.8);
            strike = d.impacted ? 1 : K.e('inCubic', t, S.windup - 0.11, S.windup);
            top = -0.15;
        } else {
            raise = K.e('outCubic', t, 0, A.hang * 0.8);
            top = -0.3;
            if (d.impacted) {
                strike = 1;
            } else if (d.strikeAt >= 0) {
                strike = K.e('inCubic', t, d.strikeAt, d.strikeAt + (w.remote ? 0.06 : 0.09));
            } else {
                strike = 0;
            }
        }
        if (d.impacted) {
            rec = K.e('inOutSine', t, d.impactAt + 0.12, d.impactAt + S.recover);
        }
        this.slamPose(w, K.lerp(top, 1.9, strike), 0.3 - 0.45 * strike, d.p2, d.q2);
        pos.lerp(d.p2, raise);
        quat.slerp(d.q2, raise);
        if (raise >= 1 && strike <= 0) {
            // Held overhead, trembling with the weight (harder while plunging).
            const k = air && t > A.hang ? 0.004 : 0.002;
            pos.x += Math.sin(t * 61) * k;
            pos.y += Math.sin(t * 53) * k;
        }
        if (d.impacted) {
            const since = t - d.impactAt;
            if (since < 0.14) {
                pos.y += Math.sin(since * 95) * 0.006 * (1 - since / 0.14);
            }
            pos.lerp(d.p2.set(0, 0, 0), rec);
            quat.slerp(d.q2.copy(d.restQ), rec);
        }
        // Plates spread like wing cases on the way up, slam shut on impact, ripple back after.
        const wide = air ? 1.25 : 1;
        look.open = d.impacted ? 0 : raise * wide * (1 - 0.6 * strike);
        look.legs = 0.5 + 1.2 * raise * (d.impacted ? 0 : 1);
        look.flare = 0;
    },

    poseInspect(w, it, pos, quat, look) {
        const K = WeaponKit;
        const d = w.data;
        const T = this.inspect.time;
        const env = K.e('inOutCubic', it, 0, 0.6) * (1 - K.e('inOutCubic', it, T - 0.6, T));
        // Tip the head in toward the middle of the view and lift it a little.
        d.q2.setFromEuler(d.eu.set(env * 0.12, env * 0.2, env * 0.22));
        quat.premultiply(d.q2);
        pos.x -= env * 0.05;
        pos.y += env * 0.04;
        pos.z += env * 0.02;
        // Turn it in the hands to show both flanks.
        const twist = 0.85 * K.e('inOutCubic', it, 0.7, 1.3) - 1.7 * K.e('inOutCubic', it, 1.5, 2.2) + 0.85 * K.e('inOutCubic', it, 2.4, 2.8);
        d.q3.setFromAxisAngle(d.vy.set(0, 1, 0), twist);
        quat.multiply(d.q3);
        look.open = 0.35 * K.hump(it, 0.8, 2.6);
        look.legs = 1.1 * env;
        look.inspect = it;
    },

    // The living shell: breathing, opening, flaring, squash and rattle on impacts, legs and feelers.
    animateShell(w, dt, look) {
        const P = w.parts;
        const d = w.data;
        const K = WeaponKit;
        const t = w.time;
        d.open += (look.open - d.open) * (1 - Math.exp(-(look.open < d.open ? 22 : 8) * dt));
        const rat = d.rattle.x;
        const it = look.inspect === undefined ? -1 : look.inspect;
        for (const pl of P.plates) {
            const i = pl.i;
            const s = pl.side;
            const wave = Math.sin(t * 1.7 - i * 0.9 + (s > 0 ? 0 : 0.4));
            let a = 0.035 + 0.025 * wave + d.open * (0.8 + 0.08 * i);
            a += look.flare * (look.lead < 0 ? i / 4 : 1 - i / 4) * 0.7;
            a += rat * 0.05 * Math.sin(i * 2.1 + s * 1.3);
            if (it >= 0) {
                a += 0.3 * K.hump(it, 0.8 + i * 0.12, 1.6 + i * 0.12);
                if (i === 2 && s > 0) {
                    a += 0.7 * K.hump(it, 1.4, 2.4);
                }
            }
            pl.pivot.rotation.z += s * Math.max(-0.02, a);
            pl.pivot.rotation.x -= 0.03 + 0.02 * Math.sin(t * 1.7 - i * 0.9 + 1.2) + d.open * 0.22 * (i / 4) + Math.abs(rat) * 0.03;
            pl.pivot.position.z += 0.0012 * Math.sin(t * 2.3 - i * 1.1);
        }

        P.scutes.forEach((sc, i) => {
            sc.position.y -= 0.0015 * (1 + Math.sin(t * 1.7 + i * 1.3)) + d.open * 0.006 + Math.abs(rat) * 0.001;
        });
        const sq = Math.max(-0.6, Math.min(0.6, d.squash.x * 0.06));
        P.head.scale.set(1 + 0.4 * sq, 1 - 0.6 * sq, 1 + 0.2 * sq);
        P.head.rotation.z += 0.025 * Math.sin(t * 0.9);
        P.head.rotation.x += 0.015 * Math.sin(t * 1.3);
        const bulge = Math.max(-0.3, Math.min(0.5, d.bulge.x * 0.05));
        P.fleshG.scale.setScalar(1 + 0.1 * d.open + bulge + 0.02 * Math.sin(t * 2.3));

        const twitchJaw = 0.08 * Math.max(0, Math.sin(t * 3.1) * Math.sin(t * 7.7));
        const jaw = 0.1 + 0.6 * d.open + twitchJaw + Math.abs(rat) * 0.04;
        for (const j of P.jaws) {
            j.rotation.y += j.userData.side * jaw;
        }
        P.antennae.forEach((an, k) => {
            const s = an.userData.side;
            an.rotation.x += 0.18 * Math.sin(t * 2.1 + k * 1.7) - 0.3 * d.open + rat * 0.03;
            an.rotation.z += s * (0.12 * Math.sin(t * 1.6 + k) + 0.25 * d.open);
        });

        const act = look.legs + 0.8 * d.open + Math.min(1, w.rigVel.length() * 2);
        for (const L of P.legs) {
            L.tw = Math.max(0, L.tw - dt * 4);
            if (Math.random() < dt * 0.5) {
                L.tw = 1;
            }
            const c = t * 8 + L.ph;
            L.hip.rotation.y += 0.3 * act * Math.sin(c);
            L.hip.rotation.z += L.s * (0.22 * act * Math.max(0, Math.sin(c + 1.2)) + 0.5 * L.tw * L.tw);
            L.knee.rotation.z += L.s * (0.3 * act * Math.sin(c + 0.6) - 0.4 * L.tw);
        }

        const glow = 0.15 + 0.06 * Math.sin(t * 2.3) + 0.8 * d.open + 1.4 * Math.max(0, bulge);
        P.m.flesh.emissiveIntensity = glow;
        P.m.vein.emissiveIntensity = 0.4 + glow * 0.7;
        P.m.eye.emissiveIntensity = 1 + 0.8 * d.open + 0.3 * Math.sin(t * 1.9);
    },

    handPose(w, H) {
        const K = WeaponKit;
        const d = w.data;
        const f = w.fireT;
        const cycle = 1 / this.stats.rate;
        const hit = this.stats.hitDelay;
        // Swipe: both hands slide down to the end of the handle for reach, and back up after
        // (they stay there while the trigger is held, ready for the next swing).
        let k = 0;
        if (w.state === 'ready' && f < cycle + 0.1 && this.isSwipe(w.lastMode)) {
            const slideIn = K.lerp(d.handFrom || 0, 1, K.e('inOutCubic', f, 0, hit - 0.12));
            const held = !w.remote && w.trigger;
            k = slideIn * (held ? 1 : 1 - K.e('inOutCubic', f, hit + 0.32, cycle - 0.04));
            const g = 0.18 * K.hump(f, hit - 0.16, hit + 0.25);
            H.left.squeeze(g);
            H.right.squeeze(g);
        }
        d.handK = k;
        if (k > 0) {
            H.left.to('endHigh', k);
            H.right.to('endLow', k);
        }
        if (w.state === 'slam' || w.state === 'slamAir') {
            H.left.squeeze(0.12);
            H.right.squeeze(0.18);
        }
    },

    effects(w, dt) {
        const P = w.parts;
        const fx = w.fx;
        const K = WeaponKit;
        const d = w.data;
        const f = w.fireT;
        const H = this.stats.hitDelay;
        if (w.state === 'ready' && f > H - 0.13 && f < H + 0.16 && this.isSwipe(w.lastMode)) {
            // A long wake behind the head, so the sweep reads as one wide arc.
            const n = fx.rate('trail', 160, dt);
            for (let i = 0; i < n; i++) {
                const p = w.localPos(P.head, [K.rand(-0.05, 0.05), K.rand(-0.05, 0.05), K.rand(-0.14, 0.14)]);
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.04), life: K.rand(0.25, 0.4), size: 0.005, sizeEnd: 0.001, color: i % 3 ? this.color : 0xffffff, opacity: 0.6, drag: 4 });
            }
        }
        if (d.open > 0.2) {
            const n = fx.rate('ooze', 40 * d.open, dt);
            for (let i = 0; i < n; i++) {
                const p = w.localPos(P.fleshG, [K.rand(-0.045, 0.045), K.rand(-0.01, 0.05), K.rand(-0.09, 0.09)]);
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(0.03).add(d.v.set(0, 0.04, 0)), life: K.rand(0.4, 0.8), size: K.rand(0.002, 0.004), sizeEnd: 0.001, color: Math.random() < 0.7 ? this.color : 0xffffff, drag: 2, gravity: -0.05 });
            }
        }
        const n = fx.rate('mote', 3, dt);
        for (let i = 0; i < n; i++) {
            const p = w.localPos(P.fleshG, [K.rand(-0.03, 0.03), -0.045, K.rand(-0.08, 0.08)]);
            fx.emit({ pos: p, vel: d.v.set(0, -0.02, 0), life: 1, size: 0.002, sizeEnd: 0.004, color: this.color, opacity: 0.6, drag: 1, gravity: 0.02 });
        }
        if (d.impacted && w.actT - d.impactAt < 0.05 && (w.state === 'slam' || w.state === 'slamAir')) {
            const n2 = fx.rate('burst', 400, dt);
            for (let i = 0; i < n2; i++) {
                const p = w.localPos(P.fleshG, [K.rand(-0.04, 0.04), K.rand(-0.04, 0.04), K.rand(-0.1, 0.1)]);
                fx.emit({ pos: p, vel: K.sphereDir().multiplyScalar(K.rand(0.1, 0.3)), life: K.rand(0.3, 0.6), size: K.rand(0.003, 0.006), sizeEnd: 0, color: i % 2 ? this.color : 0xffffff, drag: 3 });
            }
        }
    }
});
