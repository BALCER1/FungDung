const SHELLCAP_MOODS = ['wary', 'hunting', 'angry', 'bloodlust'];
const HEAD_MULT = 2.0
const LIMB_MULT = 0.6
const SHELL_VS = {
    shotgun: [1.5, 0.55, 1],
    rifle: [1.0, 0.45, 1.1],
    pistols: [1.15, 0.5, 1.1],
    sniper: [1.1, 0.25, 0.5],
    boomerang: [1.3, 0.45, 1]
};
const SC = {
    hip: 0.94, thigh: 0.5, shin: 0.5, upper: 0.5, fore: 0.52,
    legX: 0.2, shoulderX: 0.44, shoulderY: 0.52
};
const GAIT_WALK = { stride: 1.25, duty: 0.62, minF: 0.7, arc: 0.12, off: [0, 0.5, 0, 0] };
const GAIT_RUN = { stride: 1.9, duty: 0.5, minF: 1.1, arc: 0.18, off: [0, 0.5, 0.25, 0.75] };
const LIMB_REST = [[0.25, 0.05], [-0.25, 0.05], [0.5, 0.85], [-0.5, 0.85]];
const LEG_POLE = [new THREE.Vector3(0.12, 0, 1), new THREE.Vector3(-0.12, 0, 1)];
const ARM_POLE = [new THREE.Vector3(0.5, 0.25, -1), new THREE.Vector3(-0.5, 0.25, -1)];
const FIST_REACH = 0.3;

const _noRay = () => {};
const _sv = new THREE.Vector3();
const _sv2 = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qf = new THREE.Quaternion();

function shellGeoBase(rx, ry, rz, phi0, phiLen, th0, thLen, seg = 10, bump = 0.06) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(3, Math.round(seg * 0.75)), phi0, phiLen, th0, thLen);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const k = 1 + bump * Math.sin(x * 13 + y * 7) * Math.cos(z * 11 - y * 5);
        p.setXYZ(i, x * rx * k, y * ry * k, z * rz * k);
    }
    g.computeVertexNormals();
    return g;
}

function mergeGeos(list) {
    const pos = [];
    const nor = [];
    for (let g of list) {
        if (g.index) {
            g = g.toNonIndexed();
        }
        if (!g.attributes.normal) {
            g.computeVertexNormals();
        }
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
}

function chip(g, amt, seed = 1) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        p.setXYZ(i,
            x + Math.sin(y * 31 + z * 17 + seed) * amt,
            y + Math.sin(x * 23 + z * 29 + seed * 2) * amt,
            z + Math.sin(x * 19 + y * 37 + seed * 3) * amt);
    }
    g.computeVertexNormals();
    return g;
}

function fistGeo(side, n = v => v) {
    const sg = side ? -1 : 1;
    const g = new THREE.BoxGeometry(0.44, 0.68, 0.16, n(4, 1), n(6, 2), n(2, 1));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        const y = p.getY(i);
        let z = p.getZ(i);
        const t = (y + 0.34) / 0.68;
        z *= 1 + 0.9 * (1 - t);
        z += 0.07 * (1 - (x / 0.22) * (x / 0.22));
        x *= 0.9 + 0.2 * (1 - t);
        p.setXYZ(i, x, y, z);
    }
    chip(g, 0.012, side + 3);
    const parts = [g];
    for (let i = -1; i <= 1; i++) {
        parts.push(new THREE.ConeGeometry(0.045, 0.16, n(4)).rotateX(Math.PI + 0.35).translate(i * 0.14, -0.4, 0.07));
    }
    const centre = sg * Math.PI / 4;
    return mergeGeos(parts).rotateY(centre).translate(Math.sin(centre) * 0.12, -0.32, Math.cos(centre) * 0.12);
}

const SC_DEATH = { split: 2.35, melt: 1.1, seep: 2.6, seepSpread: 0.9, seepDur: 2.6, fade: 2.0 };
const _eu = new THREE.Euler();
const _span = new THREE.Vector2();
const _dark = new THREE.Color(0x0c0907);

function scEase(x) {
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    return x * x * (3 - 2 * x);
}

function sampleVerts(geo) {
    let s = geo.userData.lowSamples;
    if (!s) {
        const p = geo.attributes.position;
        const step = Math.max(1, Math.floor(p.count / 64));
        s = [];
        for (let i = 0; i < p.count; i += step) {
            s.push(p.getX(i), p.getY(i), p.getZ(i));
        }
        geo.userData.lowSamples = s;
    }
    return s;
}

function spanY(obj, out) {
    out.set(Infinity, -Infinity);
    obj.traverse(o => {
        if (!o.isMesh || !o.visible) {
            return;
        }
        const s = sampleVerts(o.geometry);
        const e = o.matrixWorld.elements;
        for (let i = 0; i < s.length; i += 3) {
            const y = e[1] * s[i] + e[5] * s[i + 1] + e[9] * s[i + 2] + e[13];
            if (y < out.x) {
                out.x = y;
            }
            if (y > out.y) {
                out.y = y;
            }
        }
    });
    return out;
}

const ShellcapKit = {
    ready: false,
    build() {
        if (this.ready) {
            return;
        }
        this.ready = true;
        const moods = [0x86ff3c, 0xffb21e, 0xff5a17, 0xff1438];
        this.colors = moods.map(c => new THREE.Color(c));
        this.chip = new THREE.Color(0x8a7362);
        this.dust = new THREE.Color(0x6e6258);
        const stone = (color, emissive, shininess = 14) => new THREE.MeshPhongMaterial({
            color, emissive, specular: 0x3a3029, shininess, flatShading: true, side: THREE.DoubleSide
        });
        this.mat = {
            shell: stone(0x2b2320, 0x000000),
            cracked: stone(0x45302a, 0x3a1000),
            critical: stone(0x5a2e1c, 0x8a2c06, 6),
            bone: stone(0xc9bba0, 0x000000, 30),
            flash: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
            flesh: moods.map(c => new THREE.MeshLambertMaterial({ color: 0x17120f, emissive: c, emissiveIntensity: 0.5 })),
            glow: moods.map(c => new THREE.MeshBasicMaterial({ color: c }))
        };
        this.geos = {};
        this.level = DETAIL.enemies;
        this.geo = this.geos[this.level] = this.makeGeo(this.level);
    },

    get(key) {
        const [k, i] = key.split('.');
        return i === undefined ? this.geo[k] : this.geo[k][+i];
    },

    setDetail(level) {
        if (!this.ready || this.level === level) {
            return;
        }
        this.level = level;
        this.geo = this.geos[level] || (this.geos[level] = this.makeGeo(level));
        scene.traverse(o => {
            const key = o.isMesh && o.geometry.userData.scKey;
            if (key) {
                o.geometry = this.get(key);
            }
        });
    },

    makeGeo(level) {
        const n = (v, min = 3) => DETAIL.seg(level, v, min);
        const shellGeo = (rx, ry, rz, phi0, phiLen, th0, thLen, seg, bump) =>
            shellGeoBase(rx, ry, rz, phi0, phiLen, th0, thLen, n(seg, 4), bump);
        const TR = [0.34, 0.38, 0.29];
        const lathe = pts => new THREE.LatheGeometry(pts.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), n(10, 4));
        const S = 1.08;
        const H = Math.PI / 2;
        const torsoShell = (p0, pl, t0, tl, bump = 0.07) => shellGeo(TR[0] * S, TR[1] * S, TR[2] * S, p0, pl, t0, tl, 10, bump);

        const spikes = [];
        const crystals = [];
        for (let i = 0; i < 5; i++) {
            const th = 0.3 + i * 0.2;
            const y = Math.cos(th) * TR[1] * S;
            const z = -Math.sin(th) * TR[2] * S;
            spikes.push(new THREE.ConeGeometry(0.045, 0.17, n(4)).rotateX(-0.5 - i * 0.14).translate(0, y + 0.03, z - 0.05));
            if (i < 4) {
                const sx = (i % 2 ? 1 : -1) * 0.14;
                crystals.push(new THREE.OctahedronGeometry(0.055).scale(0.7, 2.6, 0.7)
                    .rotateX(-0.55 - i * 0.1).rotateZ(-sx * 2.2).translate(sx, y + 0.02, z - 0.04));
            }
        }
        const horns = [];
        for (const sg of [1, -1]) {
            horns.push(new THREE.ConeGeometry(0.045, 0.36, n(5)).translate(0, 0.18, 0).rotateX(-1.25).rotateZ(-0.55 * sg).translate(0.13 * sg, 0.12, -0.03));
        }
        const eyes = [];
        for (const sg of [1, -1]) {
            eyes.push(new THREE.BoxGeometry(0.065, 0.014, 0.02).rotateZ(0.38 * sg).translate(0.055 * sg, -0.012, 0.205));
            eyes.push(new THREE.BoxGeometry(0.045, 0.012, 0.02).rotateZ(0.45 * sg).translate(0.115 * sg, 0.006, 0.175));
        }
        const toes = [];
        for (let i = -1; i <= 1; i++) {
            toes.push(new THREE.ConeGeometry(0.03, 0.14, n(4)).rotateX(Math.PI / 2).translate(i * 0.065, -0.05, 0.31));
        }
        const pauldron = [shellGeo(0.25, 0.21, 0.25, 0, Math.PI * 2, 0, 1.35, 8, 0.1)];
        pauldron.push(new THREE.ConeGeometry(0.05, 0.24, n(4)).translate(0, 0.12, 0).rotateZ(-0.35).translate(0.05, 0.17, 0));
        pauldron.push(new THREE.ConeGeometry(0.04, 0.17, n(4)).translate(0, 0.085, 0).rotateZ(-0.7).rotateX(-0.4).translate(0.12, 0.12, -0.08));

        const geo = {
            torso: new THREE.SphereGeometry(1, n(16, 4), n(12)).scale(TR[0], TR[1], TR[2]),
            pelvis: new THREE.SphereGeometry(0.2, n(12, 4), n(8)).scale(1.35, 0.85, 1.1),
            chestL: torsoShell(H - 0.03, 1.3, 0.25, 0.83),
            chestR: torsoShell(H - 1.27, 1.3, 0.25, 0.83),
            belly: torsoShell(H - 1.05, 2.1, 1.03, 0.8),
            back: torsoShell(3 * H - 1.5, 3.0, 0.2, 1.05, 0.09),
            backLow: torsoShell(3 * H - 1.5, 3.0, 1.2, 0.72),
            collar: shellGeo(0.29, 0.15, 0.27, H - 1.5, 3.0, 0.45, 0.9, 9, 0.08),
            spikes: mergeGeos(spikes),
            crystals: mergeGeos(crystals),
            tasset: shellGeo(0.3, 0.22, 0.27, H - 1.1, 2.2, 1.15, 1.1, 8, 0.08),
            head: new THREE.SphereGeometry(0.15, n(10, 4), n(8)).scale(1, 0.9, 1.2),
            maw: new THREE.SphereGeometry(0.065, n(8, 4), n(6)),
            helm: mergeGeos([
                shellGeo(0.21, 0.16, 0.26, 0, Math.PI * 2, 0, 1.5, 9, 0.07),
                chip(new THREE.BoxGeometry(0.34, 0.06, 0.1, n(3, 1), 1, 1).rotateX(0.35).translate(0, 0.025, 0.2), 0.01),
                ...horns
            ]),
            eyes: mergeGeos(eyes),
            tusk: new THREE.ConeGeometry(0.03, 0.21, n(5)).translate(0, 0.105, 0).rotateX(2.0).translate(0, -0.02, 0.02),
            upper: lathe([[0, 0.05], [0.1, 0.03], [0.125, -0.12], [0.115, -0.3], [0.09, -0.46], [0, -0.52]]),
            fore: lathe([[0, 0.04], [0.095, 0.02], [0.105, -0.14], [0.09, -0.34], [0.075, -0.5], [0, -0.54]]),
            pauldron: mergeGeos(pauldron),
            rerebrace: [0, 1].map(s => shellGeo(0.14, 0.26, 0.14, (s ? 0 : Math.PI) - 1.3, 2.6, 0.35, 2.4, 8, 0.07)),
            fist: [fistGeo(0, n), fistGeo(1, n)],
            thigh: lathe([[0, 0.05], [0.14, 0.03], [0.165, -0.08], [0.16, -0.2], [0.135, -0.34], [0.1, -0.46], [0, -0.52]]),
            thighPlate: shellGeo(0.19, 0.29, 0.19, H - 1.4, 2.8, 0.3, 2.45, 9, 0.08).translate(0, -0.22, 0),
            knee: shellGeo(0.12, 0.11, 0.1, 0, Math.PI * 2, 0, 1.4, 8, 0.07).rotateX(Math.PI / 2).translate(0, 0, 0.07),
            shin: lathe([[0, 0.04], [0.1, 0.02], [0.12, -0.1], [0.105, -0.24], [0.07, -0.42], [0.06, -0.48], [0, -0.52]]),
            greave: shellGeo(0.125, 0.21, 0.125, H - 1.1, 2.2, 0.4, 2.3, 8, 0.07).translate(0, -0.25, 0.01),
            foot: chip(new THREE.BoxGeometry(0.21, 0.085, 0.35, n(2, 1), 1, n(2, 1)).translate(0, -0.042, 0.08), 0.012),
            toes: mergeGeos(toes),
            shardA: new THREE.TetrahedronGeometry(0.1),
            shardB: chip(new THREE.BoxGeometry(0.2, 0.05, 0.14, n(2, 1), 1, n(2, 1)), 0.015),
            shardC: level === 'potato' ? new THREE.IcosahedronGeometry(0.085) : new THREE.DodecahedronGeometry(0.085)
        };
        for (const k in geo) {
            if (Array.isArray(geo[k])) {
                geo[k].forEach((g, i) => {
                    g.userData.scKey = k + '.' + i;
                });
            } else {
                geo[k].userData.scKey = k;
            }
        }
        return geo;
    },
    stain() {
        if (!this.stainKit) {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const ctx = c.getContext('2d');
            let seed = 7;
            const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            for (let i = 0; i < 16; i++) {
                const a = rnd() * Math.PI * 2;
                const r = i ? 10 + rnd() * 22 : 0;
                const x = 64 + Math.cos(a) * r;
                const y = 64 + Math.sin(a) * r;
                const R = i ? 12 + rnd() * 16 : 40;
                const g = ctx.createRadialGradient(x, y, 0, x, y, R);
                g.addColorStop(0, 'rgba(255,255,255,0.5)');
                g.addColorStop(0.6, 'rgba(255,255,255,0.3)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, R, 0, Math.PI * 2);
                ctx.fill();
            }
            this.stainKit = { tex: new THREE.CanvasTexture(c), geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) };
        }
        return this.stainKit;
    }
};

function shellcapPose() {
    return {
        hip: SC.hip, lean: 0.42, twist: 0, roll: 0, headP: 0, headY: 0, headR: 0, jaw: 0.1,
        tuck: 0, glow: 0, gal: 0,
        shP: [0, 0], shR: [0.22, 0.22], shY: [0, 0], elb: [-0.5, -0.5], ftw: [0, 0]
    };
}
const SHELLCAP_SCALARS = ['hip', 'lean', 'twist', 'roll', 'headP', 'headY', 'headR', 'jaw', 'tuck', 'glow'];
const SHELLCAP_ARMS = ['shP', 'shR', 'shY', 'elb', 'ftw'];

class Shellcap extends Enemy {
    constructor(def, x, y, z) {
        super(def, x, y, z);
        ShellcapKit.build();
        this.seed = Math.random() * 100;
        this.plates = [];
        this.shields = [null, null];
        this.fleshMeshes = [];
        this.glowMeshes = [];
        this.flashList = [];
        this.flashT = 0;
        this.mood = 0;
        this.blockT = 0;
        this.blockZone = 'high';
        this.blockAdvance = false;
        this.staggerT = 0;
        this.duckT = 0;
        this.underFire = 0;
        this.recentHurt = 0;
        this.recoil = 0;
        this.recoilV = 0;
        this.recoilRoll = 0;
        this.recoilRollV = 0;
        this.beat = 0;
        this.thud = 0;
        this.recall = false;
        this.fxT = 0;
        this.swipeSide = 0;
        this.side = Math.random() < 0.5 ? 1 : -1;
        this.arcT = 0;
        this.weaveT = 0;
        this.anticT = 0;
        this.lurkT = 0;
        this.spotT = 0;
        this.idleT = Math.random() * 3;
        this.searchT = 0;
        this.searchStage = 0;
        this.searchPause = 0;
        this.goalT = 0;
        this.retreatTries = 0;
        this.fallBand = 0;
        this.flankDone = false;
        this.dying = null;
        this.cycle = Math.random();
        this.gaitRun = false;
        this.groundK = 1;
        this.prevSpeed = 0;
        this.accF = 0;
        this.limbs = [0, 1, 2, 3].map(() => ({
            on: false, t: -1, dur: 0.2, arc: 0.1, lastStep: 0,
            planted: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), foot: new THREE.Vector3()
        }));
        this.pt = shellcapPose();
        this.pc = shellcapPose();
        this.eyeMat = new THREE.MeshBasicMaterial({ color: ShellcapKit.colors[0] });
        this.buildModel();
    }

    buildModel() {
        const G = ShellcapKit.geo;
        const M = ShellcapKit.mat;
        const J = this.j = {};
        const bones = [];
        const bone = (name, parent, x = 0, y = 0, z = 0) => {
            const b = new THREE.Bone();
            b.name = name;
            b.position.set(x, y, z);
            parent.add(b);
            bones.push(b);
            return b;
        };
        const add = (geo, mat, parent, part) => {
            const m = new THREE.Mesh(geo, mat);
            m.userData.base = mat;
            if (part) {
                m.userData.part = part;
            }
            parent.add(m);
            return m;
        };
        const flesh = (geo, zone, mult, parent) => {
            const m = add(geo, M.flesh[0], parent, { zone, mult });
            this.fleshMeshes.push(m);
            return m;
        };
        const glow = (geo, zone, mult, parent) => {
            const m = add(geo, M.glow[0], parent, { zone, mult });
            this.glowMeshes.push(m);
            return m;
        };
        const plate = (name, label, geo, hp, parent, o = {}) => {
            const pl = {
                name, label, hp, max: hp, front: !!o.front, zone: o.zone || null, heat: 0, broken: false,
                under: o.under || LIMB_MULT, mesh: null, regrowing: false
            };
            pl.make = () => {
                const m = add(ShellcapKit.get(geo.userData.scKey), M.shell, parent);
                if (o.pos) {
                    m.position.fromArray(o.pos);
                }
                if (o.rot) {
                    m.rotation.fromArray(o.rot);
                }
                m.userData.part = { plate: pl };
                for (const [g, kind] of o.extras || []) {
                    const mat = kind === 'glow' ? M.glow[this.mood] : M.shell;
                    const c = new THREE.Mesh(ShellcapKit.get(g.userData.scKey), mat);
                    c.userData.base = mat;
                    m.add(c);
                    if (kind === 'glow') {
                        this.glowMeshes.push(c);
                    }
                }
                pl.mesh = m;
                return m;
            };
            pl.make();
            this.plates.push(pl);
            return pl;
        };
        const fleshMult = this.def.brain.fleshMult;

        const hips = J.body = bone('hips', this.root, 0, SC.hip, 0);
        flesh(G.pelvis, 'limb', LIMB_MULT, hips);
        plate('tasset', 'hip plate', G.tasset, 32, hips, { pos: [0, -0.02, 0], under: LIMB_MULT });

        J.legs = [];
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const side = s ? 'R' : 'L';
            const thigh = bone('thigh_' + side, hips, SC.legX * sg, -0.03, 0);
            flesh(G.thigh, 'limb', LIMB_MULT, thigh);
            plate('thigh' + side, 'thigh shell', G.thighPlate, 28, thigh);
            const shin = bone('shin_' + side, thigh, 0, -SC.thigh, 0);
            flesh(G.shin, 'limb', LIMB_MULT, shin);
            plate('knee' + side, 'knee cap', G.knee, 22, shin);
            plate('greave' + side, 'shin shell', G.greave, 22, shin);
            const foot = bone('foot_' + side, shin, 0, -SC.shin, 0);
            add(G.foot, M.shell, foot, { zone: 'limb', mult: 0.5 });
            add(G.toes, M.bone, foot, { zone: 'limb', mult: 0.5 });
            J.legs.push({ thigh, shin, foot });
        }

        const torso = J.torso = bone('spine', hips, 0, 0.06, -0.02);
        flesh(G.torso, 'body', fleshMult, torso).position.y = 0.36;
        const torsoPlates = [
            ['chestL', 'chest plate', G.chestL, 45, true, 'high'],
            ['chestR', 'chest plate', G.chestR, 45, true, 'high'],
            ['belly', 'belly plate', G.belly, 50, true, 'low'],
            ['back', 'back plate', G.back, 55, false, null],
            ['backLow', 'lower back', G.backLow, 45, false, null]
        ];
        for (const [name, label, geo, hp, front, zone] of torsoPlates) {
            plate(name, label, geo, hp, torso, {
                front, zone, under: fleshMult, pos: [0, 0.36, 0],
                extras: name === 'back' ? [[G.spikes, 'shell'], [G.crystals, 'glow']] : null
            });
        }
        plate('collar', 'collar', G.collar, 38, torso, { front: true, zone: 'high', under: fleshMult, pos: [0, 0.62, 0.05] });

        const neck = bone('neck', torso, 0, 0.6, 0.2);
        const head = J.head = bone('head', neck);
        head.rotation.order = 'YXZ';
        flesh(G.head, 'head', HEAD_MULT, head);
        glow(G.maw, 'head', HEAD_MULT, head).position.set(0, -0.08, 0.13);
        add(G.eyes, this.eyeMat, head, { zone: 'head', mult: HEAD_MULT });
        this.helm = plate('helm', 'skull helm', G.helm, 60, head, { front: true, zone: 'high', under: HEAD_MULT, pos: [0, 0.03, 0] });
        J.jaw = [];
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const jaw = bone('jaw_' + (s ? 'R' : 'L'), head, 0.07 * sg, -0.1, 0.12);
            add(G.tusk, M.bone, jaw, { zone: 'head', mult: 1.2 });
            J.jaw.push(jaw);
        }

        J.arms = [];
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const side = s ? 'R' : 'L';
            const sh = bone('shoulder_' + side, torso, SC.shoulderX * sg, SC.shoulderY, 0);
            sh.rotation.order = 'YXZ';
            flesh(G.upper, 'limb', LIMB_MULT, sh);
            plate('pauldron' + side, 'pauldron', G.pauldron, 40, sh, { pos: [0.04 * sg, 0.07, 0], rot: [0, s ? Math.PI : 0, -0.35] });
            plate('rerebrace' + side, 'arm plate', G.rerebrace[s], 30, sh, { pos: [0, -0.24, 0] });
            const elb = bone('forearm_' + side, sh, 0, -SC.upper, 0);
            flesh(G.fore, 'limb', LIMB_MULT, elb);
            this.shields[s] = plate('fist' + side, 'shield fist', G.fist[s], 100, elb);
            const hand = bone('hand_' + side, elb, 0, -SC.fore, 0);
            J.arms.push({ sh, elb, hand });
        }
        this.skeleton = new THREE.Skeleton(bones);
    }

    shellLeft() {
        let hp = 0;
        let max = 0;
        for (const pl of this.plates) {
            hp += pl.broken ? 0 : Math.max(0, pl.hp);
            max += pl.max;
        }
        return max ? hp / max : 0;
    }
    shieldsLeft() {
        return (this.shields[0].broken ? 0 : 1) + (this.shields[1].broken ? 0 : 1);
    }
    faceBare() {
        return this.helm.broken;
    }
    moodColor() {
        return ShellcapKit.colors[this.mood];
    }
    setMood(i) {
        if (this.mood === i) {
            return;
        }
        this.mood = i;
        const M = ShellcapKit.mat;
        for (const m of this.fleshMeshes) {
            m.userData.base = M.flesh[i];
            if (m.material !== M.flash) {
                m.material = M.flesh[i];
            }
        }
        for (const m of this.glowMeshes) {
            m.userData.base = M.glow[i];
            if (m.material !== M.flash) {
                m.material = M.glow[i];
            }
        }
    }
    debugText(now) {
        const p = this.pack;
        const mem = p ? p.mem : this.mem;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const lines = [
            `SHELLCAP  ${this.intent}${this.role ? ' / ' + this.role : ''}${p ? `   pack ${p.mood} x${p.members.length}` : '   alone'}`,
            `> ${this.thought}`,
            `hp ${Math.ceil(this.hp)}/${this.maxHp}  shell ${Math.round(this.shellLeft() * 100)}%  shields ${this.shieldsLeft()}/2${this.dr ? `  dr ${Math.round(this.dr * 100)}%` : ''}`,
            `speed ${sp.toFixed(1)} ${this.gaitRun ? 'gallop' : 'walk'}  alert ${Math.round(this.alert * 100)}%${this.alertFloor ? ' (prowling)' : ''}  ${this.seesPlayer ? 'SEES YOU' : ''}`,
            mem.known() ? `memory: saw you ${mem.age(now).toFixed(1)}s ago, searched ${mem.searched.length} spots` : 'memory: never seen you'
        ];
        return lines.join('\n');
    }

    takeHit(amount, part, hit, dir, shot) {
        if (this.dead) {
            return null;
        }
        const fx = Enemies.fx;
        const pl = part && part.plate;
        const key = shot && shot.mode === 'boomerang' ? 'boomerang' : shot && shot.weapon;
        this.lastHeavy = key === 'sniper';
        const vs = SHELL_VS[key] || [1, 0.3];
        let dmg;
        let kind;
        let zone;
        if (pl && !pl.broken) {
            pl.hp -= amount * vs[0];
            dmg = amount * vs[1];
            kind = 'shell';
            fx.burst(hit.point, 5, ShellcapKit.chip, 3, 0.35, { grav: 9, drag: 1 });
            if (pl.hp <= 0) {
                dmg += (-pl.hp / vs[0]) * 0.5;
                this.breakPlate(pl, dir);
                kind = 'break';
            } else {
                this.crackLook(pl);
            }
            zone = pl.zone;
        } else {
            const mult = pl ? pl.under : (part && part.mult) || 1;
            dmg = amount * mult * (vs[2] || 1);
            kind = mult >= 2 ? 'crit' : mult >= 1 ? 'flesh' : 'shell';
            fx.burst(hit.point, mult > 1.2 ? 12 : 5, this.moodColor(), 2.6, 0.55, { grav: 2 });
            zone = hit.point.y - this.pos.y > 1.3 ? 'high' : 'low';
        }
        dmg *= 1 - this.dr;
        this.hp -= dmg;
        if (!pl || !pl.broken || kind === 'break') {
            this.flashMesh(hit.object);
        }
        this.kick(Math.min(0.4, 0.05 + dmg * 0.004), dir);
        if (this.hp <= 0) {
            this.die(dir);
            return 'kill';
        }
        if (shot && shot.weapon === 'sniper') {
            this.stagger(1, dir);
        }
        this.mind.onHurt(this, { plate: pl, zone, dmg, dir, flesh: !pl && !!part && part.zone !== 'limb' }, Enemies.time);
        return kind;
    }

    takeBlast(hits, shot) {
        if (this.dead) {
            return null;
        }
        const fx = Enemies.fx;
        const vs = SHELL_VS[shot.weapon] || [1, 0.3];
        this.lastHeavy = hits.length >= 3;
        const close = clampN(1.4 - this.pos.distanceTo(Player.pos) * 0.07, 1, 1.3);
        const amount = shot.damage * close;
        const dir = new THREE.Vector3();
        const rank = { shell: 1, flesh: 2, break: 3, crit: 4 };
        let dmg = 0;
        let kind = 'shell';
        let worst = null;
        let flashed = false;
        let zone = 'high';
        for (const h of hits) {
            dir.add(h.dir);
        }
        dir.normalize();
        for (const h of hits) {
            const pl = h.part && h.part.plate;
            let k;
            if (pl && !pl.broken) {
                pl.hp -= amount * vs[0];
                dmg += amount * vs[1];
                pl.heat += 1;
                k = 'shell';
                if (pl.hp <= 0) {
                    dmg += (-pl.hp / vs[0]) * 0.5;
                    this.breakPlate(pl, dir);
                    k = 'break';
                } else {
                    this.crackLook(pl);
                }
                if (!worst || pl.hp < worst.hp) {
                    worst = pl;
                }
                fx.burst(h.hit.point, 2, ShellcapKit.chip, 3, 0.35, { grav: 9, drag: 1 });
            } else {
                const mult = pl ? pl.under : (h.part && h.part.mult) || 1;
                dmg += amount * mult * (vs[2] || 1);
                k = mult >= 2 ? 'crit' : mult >= 1 ? 'flesh' : 'shell';
                fx.burst(h.hit.point, 3, this.moodColor(), 2.6, 0.5, { grav: 2 });
                zone = h.hit.point.y - this.pos.y > 1.3 ? 'high' : 'low';
            }
            if (rank[k] > rank[kind]) {
                kind = k;
            }
            if (!flashed && h.hit.object.parent !== Enemies.junk) {
                this.flashMesh(h.hit.object);
                flashed = true;
            }
        }
        dmg *= 1 - this.dr;
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.die(dir);
            return 'kill';
        }
        this.stagger(clampN(hits.length / 6, 0.3, 1), dir);
        this.mind.onHurt(this, { plate: worst, zone: worst ? worst.zone : zone, dmg, dir, flesh: !worst }, Enemies.time);
        return kind;
    }

    kick(k, dir) {
        this.recoilV += k * 7;
        const side = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw);
        this.recoilRollV += side * k * 6;
    }

    stagger(k, dir) {
        this.kick(0.25 + k * 0.35, dir);
        this.vel.x += dir.x * (1.5 + 2 * k);
        this.vel.z += dir.z * (1.5 + 2 * k);
        const dur = 0.35 + 0.35 * k;
        this.staggerT = Math.max(this.staggerT, dur);
        const a = this.action;
        if (!this.onGround || (a && a.air)) {
            return;
        }
        if (a && (a.name === 'howl' || a.name === 'screech') && !a.sent) {
            this.recall = true;
        }
        if (!a || a.name !== 'stagger' || a.k < k) {
            this.action = { name: 'stagger', t: 0, dur, k, lock: true };
        }
    }

    flashMesh(m) {
        const M = ShellcapKit.mat;
        if (!m || !m.isMesh || !m.userData.base || m.parent === Enemies.junk) {
            return;
        }
        if (m.material !== M.flash) {
            m.material = M.flash;
            this.flashList.push(m);
        }
        this.flashT = 0.06;
    }

    crackLook(pl) {
        const M = ShellcapKit.mat;
        const f = pl.hp / pl.max;
        const base = f < 0.34 ? M.critical : f < 0.67 ? M.cracked : M.shell;
        pl.mesh.userData.base = base;
        if (pl.mesh.material !== M.flash) {
            pl.mesh.material = base;
        }
    }

    breakPlate(pl, dir) {
        const M = ShellcapKit.mat;
        pl.broken = true;
        pl.regrowing = false;
        pl.hp = 0;
        const m = pl.mesh;
        m.material = m.userData.base = M.critical;
        const i = this.flashList.indexOf(m);
        if (i >= 0) {
            this.flashList.splice(i, 1);
        }
        m.traverse(c => {
            const k = this.glowMeshes.indexOf(c);
            if (k >= 0) {
                this.glowMeshes.splice(k, 1);
            }
        });
        Enemies.detach(m, new THREE.Vector3(
            dir.x * 2.2 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, dir.z * 2.2 + (Math.random() - 0.5) * 2
        ), 1.4 + Math.random() * 0.8);
        Enemies.fx.burst(m.position, 26, this.moodColor(), 3, 0.75, { grav: 3 });
        Enemies.fx.burst(m.position, 14, ShellcapKit.chip, 4, 0.5, { grav: 10 });
        this.staggerT = Math.max(this.staggerT, 0.3);
    }

    regrowShell(dt, rate) {
        let pl = this.plates.find(p => p.regrowing) || null;
        for (const p of pl ? [] : this.plates) {
            const f = p.broken ? -1 : p.hp / p.max;
            if (f < 1 && (!pl || f < (pl.broken ? -1 : pl.hp / pl.max))) {
                pl = p;
            }
        }
        if (!pl) {
            return;
        }
        if (pl.broken) {
            pl.broken = false;
            pl.regrowing = true;
            pl.hp = 1;
            pl.make();
            pl.mesh.scale.setScalar(0.15);
        }
        pl.hp = Math.min(pl.max, pl.hp + rate * dt);
        if (pl.regrowing) {
            pl.mesh.scale.setScalar(0.15 + 0.85 * pl.hp / pl.max);
            if (pl.hp >= pl.max) {
                pl.regrowing = false;
                pl.mesh.scale.setScalar(1);
            }
            if (Math.random() < dt * 8) {
                pl.mesh.getWorldPosition(_sv);
                Enemies.fx.emit(_sv.x, _sv.y, _sv.z, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, this.moodColor(), 0.8, 0, 2);
            }
        }
        this.crackLook(pl);
    }

    die(dir) {
        const M = ShellcapKit.mat;
        this.mind.died(this, Enemies.time);
        for (const m of this.flashList) {
            m.material = m.userData.base;
        }
        this.flashList.length = 0;
        Enemies.kill(this);
        const heavy = this.lastHeavy;
        const side = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw);
        if (DETAIL.deathFx === 'simple') {
            this.dying = {
                simple: true, t: 0, y: this.visY, col: this.moodColor().clone(),
                side: Math.abs(side) > 0.2 ? Math.sign(side) : (Math.random() < 0.5 ? 1 : -1)
            };
            this.root.rotation.order = 'YXZ';
            this.action = { name: 'dying', t: 0, lock: true };
            _sv.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
            Enemies.fx.burst(_sv, 16, this.dying.col, 3, 0.6, { up: 1, grav: 2 });
            Enemies.shake(heavy ? 0.4 : 0.2, this.pos);
            return;
        }
        const d = this.dying = {
            t: 0, dir: dir.clone(), heavy, twitchT: 0, shiverT: 0, thumped: false, split: false,
            side: Math.abs(side) > 0.2 ? Math.sign(side) : (Math.random() < 0.5 ? 1 : -1),
            col: this.moodColor().clone(),
            tremble: new THREE.Vector3(), trembleTo: new THREE.Vector3(),
            low: 0, squeeze: 0, pieces: [], stain: null, centre: new THREE.Vector3(), floor: 0,
            flesh: M.flesh[this.mood].clone(),
            glow: M.glow[this.mood].clone(),
            rock: []
        };
        const swap = new Map();
        for (const m of M.flesh) {
            swap.set(m, d.flesh);
        }
        for (const m of M.glow) {
            swap.set(m, d.glow);
        }
        for (const key of ['shell', 'cracked', 'critical', 'bone']) {
            const c = M[key].clone();
            swap.set(M[key], c);
            d.rock.push({ m: c, c: c.color.clone(), glows: key === 'cracked' || key === 'critical' });
        }
        this.root.traverse(o => {
            const s = o.isMesh && swap.get(o.userData.base || o.material);
            if (s) {
                o.material = o.userData.base = s;
            }
        });
        this.root.rotation.order = 'YXZ';
        this.action = { name: 'dying', t: 0, lock: true };
        this.want.set(0, 0, 0);
        this.wantS.set(0, 0, 0);
        this.blockT = 0;
        const fling = heavy ? 5 : 2.5;
        this.vel.x += dir.x * fling;
        this.vel.z += dir.z * fling;
        if (heavy) {
            this.vel.y = 3;
            this.onGround = false;
        }
        this.kick(heavy ? 1.1 : 0.75, dir);
        _sv.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
        Enemies.fx.burst(_sv, 40, d.col, 4, 0.8, { up: 1, grav: 2 });
        Enemies.fx.burst(_sv, 14, ShellcapKit.chip, 5, 0.6, { grav: 10 });
        Enemies.shake(heavy ? 0.5 : 0.25, this.pos);
    }

    updateSimpleDeath(dt) {
        const d = this.dying;
        const t = (d.t += dt);
        const fall = scEase(t / 0.45);
        const sink = scEase((t - 0.7) / 0.8);
        const root = this.root;
        root.position.set(this.pos.x, d.y - 1.3 * sink, this.pos.z);
        root.rotation.set(0, this.yaw, -d.side * 1.45 * fall);
        root.scale.setScalar(1 - 0.4 * sink);
        this.eyeMat.color.copy(d.col).multiplyScalar(1 - fall);
        if (t < 1.5) {
            return false;
        }
        this.eyeMat.dispose();
        return true;
    }

    updateDying(dt, now) {
        const d = this.dying;
        if (d.simple) {
            return this.updateSimpleDeath(dt);
        }
        const t = (d.t += dt);
        if (d.split) {
            return this.updateRemains(dt, t - SC_DEATH.split);
        }
        this.action.t = t;
        this.want.set(0, 0, 0);
        if (this.onGround) {
            this.locomote(dt);
        }
        this.physics(dt);
        this.crouch += (0.6 - this.crouch) * (1 - Math.exp(-6 * dt));
        this.recoilV += (-70 * this.recoil - 9 * this.recoilV) * dt;
        this.recoil += this.recoilV * dt;
        this.recoilRollV += (-60 * this.recoilRoll - 8 * this.recoilRollV) * dt;
        this.recoilRoll += this.recoilRollV * dt;
        this.visY = this.onGround ? this.visY + (this.pos.y - this.visY) * (1 - Math.exp(-16 * dt)) : this.pos.y;

        const curl = scEase((t - 0.22) / 0.85);
        const roll = scEase((t - 0.65) / 0.55);
        d.squeeze = scEase((t - (SC_DEATH.split - 0.45)) / 0.4);
        d.twitchT -= dt;
        if (t < 0.9 && d.twitchT <= 0) {
            d.twitchT = 0.06 + Math.random() * 0.08;
            const a = Math.random() * Math.PI * 2;
            this.kick(0.1 + Math.random() * 0.2 * (1 - t), _sv2.set(Math.sin(a), 0, Math.cos(a)));
        }
        d.shiverT -= dt;
        if (d.shiverT <= 0) {
            d.shiverT = 0.04 + Math.random() * 0.05;
            const amp = 0.06 * curl * (1 - roll * 0.5) + 0.08 * d.squeeze;
            d.trembleTo.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
        }
        d.tremble.lerp(d.trembleTo, 1 - Math.exp(-30 * dt));

        this.animate(dt, now);
        this.curlPose(curl);
        const root = this.root;
        root.position.set(this.pos.x, this.visY, this.pos.z);
        root.rotation.set(0.18 * curl + d.tremble.x * 0.5, this.yaw, -d.side * 1.3 * roll + d.tremble.z);
        root.scale.setScalar(1 - 0.06 * d.squeeze);
        root.updateMatrixWorld(true);
        const low = spanY(root, _span).x - this.visY;
        d.low += (low - d.low) * Math.min(1, dt * 25);
        root.position.y = this.visY - (d.low + 0.03) * curl;

        if (roll > 0.92 && !d.thumped) {
            d.thumped = true;
            Enemies.shake(0.35, this.pos);
            Enemies.fx.burst(_sv.set(this.pos.x, this.visY + 0.15, this.pos.z), 22, ShellcapKit.dust, 2.5, 0.9, { up: 0.4, grav: 2, drag: 2.5 });
        }

        const col = d.col;
        const flicker = Math.random() < 0.25 ? 0.3 : 1;
        const fade = 1 - 0.75 * scEase(t / 1.8);
        d.flesh.emissiveIntensity = 0.5 * fade * flicker + 0.6 * clamp01(1 - t * 4) + 1.4 * d.squeeze;
        d.glow.color.copy(col).multiplyScalar(fade * flicker + 0.8 * d.squeeze);
        this.eyeMat.color.copy(col).multiplyScalar(Math.max(0, 1 - t / 1.2) * flicker);
        const crack = 0.3 * clamp01(t / 0.5) * fade * flicker + 0.9 * d.squeeze;
        for (const r of d.rock) {
            if (r.glows) {
                r.m.emissive.copy(col).multiplyScalar(crack);
            }
        }
        if (curl > 0.3 && Math.random() < dt * (8 + 40 * d.squeeze)) {
            this.j.torso.getWorldPosition(_sv);
            Enemies.fx.emit(_sv.x + (Math.random() - 0.5) * 0.6, _sv.y + (Math.random() - 0.5) * 0.4, _sv.z + (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, col, 0.9, -0.2, 1.5);
        }
        if (t >= SC_DEATH.split) {
            this.fallApart();
        }
        return false;
    }

    curlPose(c) {
        if (c <= 0) {
            return;
        }
        const d = this.dying;
        const J = this.j;
        const tr = d.tremble;
        const sq = d.squeeze;
        const pose = (bone, x, y, z, order) => {
            _qa.setFromEuler(_eu.set(x, y, z, order || 'XYZ'));
            bone.quaternion.slerp(_qa, c);
        };
        J.body.position.x *= 1 - c;
        J.body.position.y += (0.45 - J.body.position.y) * c;
        J.body.quaternion.identity();
        pose(J.body, -0.45, 0, 0);
        pose(J.torso, 1.5 + 0.15 * sq + tr.x, tr.y, tr.z);
        pose(J.head, 1.15 + 0.15 * sq, 0.25 * d.side, 0, 'YXZ');
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            pose(J.jaw[s], -0.05, 0, sg * 0.06);
            pose(J.arms[s].sh, -1.15 - 0.1 * sq, -sg * 0.65, sg * 0.05, 'YXZ');
            pose(J.arms[s].elb, -2.25, sg * 1.7, 0);
            pose(J.legs[s].thigh, -2.05 - 0.15 * sq, 0, sg * 0.2);
            pose(J.legs[s].shin, 2.65, 0, 0);
            pose(J.legs[s].foot, 0.5, 0, 0);
        }
    }

    fallApart() {
        const d = this.dying;
        const root = this.root;
        d.split = true;
        root.updateMatrixWorld(true);
        const parts = [];
        root.traverse(o => {
            if (o.isMesh && o.parent && o.parent.isBone) {
                parts.push(o);
            }
        });
        const c = d.centre.set(0, 0, 0);
        for (const m of parts) {
            c.add(m.getWorldPosition(_sv));
        }
        c.divideScalar(Math.max(1, parts.length));
        for (const m of parts) {
            Enemies.junk.attach(m);
        }
        root.remove(this.j.body);
        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);
        root.scale.set(1, 1, 1);
        root.updateMatrixWorld(true);
        d.floor = Enemies.floorAt(c.x, c.y - 0.2, c.z);

        for (const m of parts) {
            const geo = m.geometry;
            if (!geo.boundingSphere) {
                geo.computeBoundingSphere();
            }
            m.updateMatrixWorld(true);
            const pivot = new THREE.Object3D();
            pivot.position.copy(geo.boundingSphere.center).applyMatrix4(m.matrixWorld);
            root.add(pivot);
            pivot.attach(m);
            m.userData.part = null;
            const soft = m.material === d.flesh || m.material === d.glow || m.material === this.eyeMat;
            const ox = pivot.position.x - c.x;
            const oz = pivot.position.z - c.z;
            const ol = Math.hypot(ox, oz) || 1;
            const sp = soft ? 0.2 + Math.random() * 0.5 : 0.6 + Math.random() * 1.2;
            const up = soft ? 0 : 0.6 + Math.random() * 1.2 + Math.max(0, pivot.position.y - c.y) * 2;
            d.pieces.push({
                obj: pivot, soft, settled: false,
                delay: Math.random() * 0.3,
                vel: new THREE.Vector3(ox / ol * sp, up, oz / ol * sp),
                spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(soft ? 1.5 : 5),
                seepDelay: Math.random() * SC_DEATH.seepSpread, depth: 0, y0: 0, tilt: (Math.random() - 0.5) * 0.5
            });
        }

        d.flesh.transparent = true;
        d.flesh.needsUpdate = true;
        const col = d.col;
        Enemies.fx.burst(c, 45, col, 2.2, 1.1, { up: 0.6, grav: 1.5 });
        Enemies.fx.burst(c, 30, col, 1.2, 1.4, { grav: 5 });
        Enemies.fx.burst(c, 24, ShellcapKit.chip, 3, 0.6, { up: 0.5, grav: 9 });
        _sv.set(c.x, d.floor + 0.08, c.z);
        for (let i = 0; i < 24; i++) {
            const a = i / 24 * Math.PI * 2;
            Enemies.fx.emit(_sv.x, _sv.y, _sv.z, Math.sin(a) * 2.5, 0.2, Math.cos(a) * 2.5, ShellcapKit.dust, 0.8, 0.5, 3);
        }
        Enemies.shake(0.4, _sv);

        const S = ShellcapKit.stain();
        const st = d.stain = new THREE.Mesh(S.geo, new THREE.MeshBasicMaterial({
            map: S.tex, color: col.clone().multiplyScalar(0.35), transparent: true, opacity: 0, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
        }));
        st.raycast = _noRay;
        st.position.set(c.x, d.floor + 0.015, c.z);
        st.rotation.y = Math.random() * Math.PI * 2;
        st.scale.setScalar(0.3);
        root.add(st);
    }

    stepPiece(p, dt) {
        const o = p.obj;
        p.vel.y -= GRAV * dt;
        const nx = o.position.x + p.vel.x * dt;
        const nz = o.position.z + p.vel.z * dt;
        if (Enemies.groundAt(nx, nz) > o.position.y + 0.1) {
            p.vel.x *= -0.4;
            p.vel.z *= -0.4;
        } else {
            o.position.x = nx;
            o.position.z = nz;
        }
        o.position.y += p.vel.y * dt;
        o.rotation.x += p.spin.x * dt;
        o.rotation.y += p.spin.y * dt;
        o.rotation.z += p.spin.z * dt;
        o.updateMatrixWorld(true);
        const g = Enemies.floorAt(o.position.x, o.position.y, o.position.z);
        const low = spanY(o, _span).x;
        if (low < g) {
            o.position.y += g - low;
            if (p.vel.y < -1.5) {
                p.vel.y *= -0.25;
                p.vel.x *= 0.5;
                p.vel.z *= 0.5;
                p.spin.multiplyScalar(0.4);
            } else {
                p.settled = true;
            }
        }
    }

    updateRemains(dt, ts) {
        const d = this.dying;
        const D = SC_DEATH;
        const col = d.col;
        const end = D.seep + D.seepSpread + D.seepDur;
        const melt = clamp01(ts / D.melt);
        d.flesh.opacity = 1 - melt;
        d.flesh.emissiveIntensity = 1.6 * (1 - melt) * (1 - melt);
        d.glow.color.copy(col).multiplyScalar(Math.max(0, 1 - ts / 1.4));
        this.eyeMat.color.setScalar(0);
        const darken = 0.65 * scEase((ts - D.seep) / (D.seepSpread + D.seepDur * 0.5));
        for (const r of d.rock) {
            r.m.color.copy(r.c).lerp(_dark, darken);
            if (r.glows) {
                r.m.emissive.copy(col).multiplyScalar(0.6 * Math.max(0, 1 - ts / 1.2));
            }
        }

        for (const p of d.pieces) {
            const o = p.obj;
            if (!o.visible || ts < p.delay) {
                continue;
            }
            if (!p.settled) {
                this.stepPiece(p, dt);
            }
            if (p.soft) {
                const k = clamp01((ts - p.delay) / D.melt);
                o.scale.setScalar(Math.max(0.01, 1 - 0.85 * k * k));
                if (p.settled) {
                    o.position.y -= dt * 0.3 * k;
                }
                if (Math.random() < dt * 6 * (1 - k)) {
                    Enemies.fx.emit(o.position.x, o.position.y, o.position.z, (Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3,
                        col, 0.6, 6, 1);
                }
                if (k >= 1) {
                    o.visible = false;
                }
                continue;
            }
            const s = clamp01((ts - D.seep - p.seepDelay) / D.seepDur);
            if (s <= 0) {
                continue;
            }
            if (!p.depth) {
                p.settled = true;
                o.updateMatrixWorld(true);
                spanY(o, _span);
                p.depth = Math.max(0.1, _span.y - Enemies.floorAt(o.position.x, _span.x, o.position.z) + 0.05);
                p.y0 = o.position.y;
            }
            o.position.y = p.y0 - p.depth * scEase(s);
            o.rotation.z += p.tilt * dt / D.seepDur;
            if (Math.random() < dt * 2.5 * (1 - s)) {
                Enemies.fx.emit(o.position.x + (Math.random() - 0.5) * 0.3, d.floor + 0.05, o.position.z + (Math.random() - 0.5) * 0.3,
                    0, 0.3 + Math.random() * 0.3, 0, col, 1.4, -0.1, 1);
            }
            if (s >= 1) {
                o.visible = false;
            }
        }

        const st = d.stain;
        const grow = scEase(ts / 1.4);
        const soak = scEase((ts - D.seep) / (end - D.seep));
        st.scale.setScalar(0.3 + 1.5 * grow + 0.5 * soak);
        st.material.opacity = 0.8 * grow * (1 - clamp01((ts - end + 0.5) / D.fade));
        st.material.color.copy(col).multiplyScalar(0.35).lerp(_dark, scEase(ts / 2.5));

        if (ts < end + D.fade - 0.5) {
            return false;
        }
        d.flesh.dispose();
        d.glow.dispose();
        for (const r of d.rock) {
            r.m.dispose();
        }
        st.material.dispose();
        this.eyeMat.dispose();
        return true;
    }

    update(dt, now) {
        if (this.action && this.action.name === 'mantle') {
            this.updateMantle(dt, now);
        } else {
            super.update(dt, now);
        }
        if (this.flashT > 0) {
            this.flashT -= dt;
            if (this.flashT <= 0) {
                for (const m of this.flashList) {
                    m.material = m.userData.base;
                }
                this.flashList.length = 0;
            }
        }
        this.recoilV += (-70 * this.recoil - 9 * this.recoilV) * dt;
        this.recoil += this.recoilV * dt;
        this.recoilRollV += (-60 * this.recoilRoll - 8 * this.recoilRollV) * dt;
        this.recoilRoll += this.recoilRollV * dt;
        this.beat = Math.max(0, this.beat - dt * 3.5);
        this.thud = Math.max(0, this.thud - dt * 6);
    }

    leap(x, y, z, apex, kind) {
        if (kind === 'climb' || kind === 'hop') {
            if (this.onGround && this.startMantle(x, z)) {
                return;
            }
            if (y - this.pos.y > 0.9) {
                this.cd.leap = Math.max(this.cd.leap || 0, 0.8);
                return;
            }
            super.leap(x, y, z, Math.min(apex, Math.max(y, this.pos.y) + 0.45), 'hop');
            return;
        }
        super.leap(x, y, z, apex, kind);
    }

    dropOff(cells, i) {
        const nav = Enemies.nav;
        const P = Player.pos;
        if (!this.engaged || !this.cool('dive') || Math.hypot(P.x - this.pos.x, P.z - this.pos.z) < 9) {
            return false;
        }
        const low = nav.h[cells[i]];
        const drop = this.pos.y - low;
        const reach = Math.min(5.5, 2.5 + drop);
        let best = -1;
        for (let j = i; j < cells.length; j++) {
            const c = cells[j];
            if (Math.abs(nav.h[c] - low) > Nav.STEP) {
                break;
            }
            const d = Math.hypot(nav.cx(c) - this.pos.x, nav.cz(c) - this.pos.z);
            if (d > reach) {
                break;
            }
            if (d >= 1.6 && nav.straight(cells[i], c)) {
                best = c;
            }
        }
        if (best < 0) {
            return false;
        }
        this.cd.dive = 2.5;
        this.leap(nav.cx(best), nav.h[best], nav.cz(best), this.pos.y + 0.55, 'dive');
        return true;
    }

    unstick() {
        const w = Math.hypot(this.want.x, this.want.z) || 1;
        if (this.startMantle(this.pos.x + this.want.x / w * 2, this.pos.z + this.want.z / w * 2)) {
            return;
        }
        this.vel.y = 3.5;
        this.vel.x += (Math.random() - 0.5) * 3;
        this.vel.z += (Math.random() - 0.5) * 3;
        this.onGround = false;
    }

    findLedge(x, z) {
        const room = Enemies.room;
        if (!room || !room.colliders) {
            return [];
        }
        const ox = this.pos.x;
        const oy = this.pos.y;
        const oz = this.pos.z;
        let fx = x - ox;
        let fz = z - oz;
        const dist = Math.hypot(fx, fz);
        if (dist < 0.05) {
            return [];
        }
        fx /= dist;
        fz /= dist;
        const limit = Math.min(dist + 0.8, 2.4);
        const found = [];
        for (const b of room.colliders) {
            let inside = false;
            if (b.off || b.max.y - oy < Nav.STEP * 0.8 || b.min.y > oy + 3.8) {
                continue;
            }
            let t = Infinity;
            let nx = 0;
            let nz = 0;
            let px = 0;
            let pz = 0;
            let score;
            if (ox > b.min.x && ox < b.max.x && oz > b.min.z && oz < b.max.z) {
                if (b.min.y < oy + 1.9) {
                    continue;
                }
                inside = true;
                let score = Infinity;
                for (const [d, sx, sz] of [[ox - b.min.x, -1, 0], [b.max.x - ox, 1, 0], [oz - b.min.z, 0, -1], [b.max.z - oz, 0, 1]]) {
                    const s = d - 0.6 * (sx * fx + sz * fz);
                    if (s < score) {
                        score = s;
                        t = d;
                        nx = sx;
                        nz = sz;
                    }
                }
            } else {
                let t0 = -Infinity;
                let t1 = Infinity;
                let ax = 0;
                if (Math.abs(fx) < 1e-6) {
                    if (ox < b.min.x || ox > b.max.x) {
                        t0 = Infinity;
                    }
                } else {
                    t0 = Math.min((b.min.x - ox) / fx, (b.max.x - ox) / fx);
                    t1 = Math.max((b.min.x - ox) / fx, (b.max.x - ox) / fx);
                }
                if (Math.abs(fz) < 1e-6) {
                    if (oz < b.min.z || oz > b.max.z) {
                        t0 = Infinity;
                    }
                } else {
                    const ta = Math.min((b.min.z - oz) / fz, (b.max.z - oz) / fz);
                    if (ta > t0) {
                        t0 = ta;
                        ax = 1;
                    }
                    t1 = Math.min(t1, Math.max((b.min.z - oz) / fz, (b.max.z - oz) / fz));
                }
                if (t0 <= t1 && t0 >= -0.05 && t0 <= limit) {
                    t = Math.max(0, t0);
                    nx = ax === 0 ? -Math.sign(fx) : 0;
                    nz = ax === 1 ? -Math.sign(fz) : 0;
                    px = ox + fx * t;
                    pz = oz + fz * t;
                    score = t;
                } else {
                    const cx = clampN(ox, b.min.x, b.max.x);
                    const cz = clampN(oz, b.min.z, b.max.z);
                    const dx = ox - cx;
                    const dz = oz - cz;
                    t = Math.hypot(dx, dz);
                    if (t > 1.1 || t < 1e-4) {
                        continue;
                    }
                    if (Math.abs(dx) >= Math.abs(dz)) {
                        nx = Math.sign(dx);
                    } else {
                        nz = Math.sign(dz);
                    }
                    px = cx;
                    pz = cz;
                    score = t + 0.5 - 0.4 * (-nx * fx - nz * fz);
                }
            }
            if (inside) {
                px = ox;
                pz = oz;
                score = t;
            }
            if (t > limit) {
                continue;
            }
            const top = colTop(b, clampN(px, b.min.x, b.max.x), clampN(pz, b.min.z, b.max.z));
            if (top - oy < Nav.STEP * 0.8 || top - oy > 3.8) {
                continue;
            }
            found.push({ b, t, nx, nz, px, pz, top, score: score + top * 0.05 });
        }
        return found.sort((a, b) => a.score - b.score).slice(0, 4);
    }

    startMantle(x, z) {
        for (const hit of this.findLedge(x, z)) {
            if (this.tryMantle(hit)) {
                return true;
            }
        }
        return false;
    }

    tryMantle(hit) {
        const room = Enemies.room;
        const { b: best, nx, nz } = hit;
        const oy = this.pos.y;
        const E = new THREE.Vector3(hit.px, 0, hit.pz);
        const inset = (lo, hi, v) => hi - lo > 0.7 ? clampN(v, lo + 0.35, hi - 0.35) : (lo + hi) / 2;
        let depth;
        if (nx) {
            E.x = nx > 0 ? best.max.x : best.min.x;
            E.z = inset(best.min.z, best.max.z, hit.pz);
            depth = best.max.x - best.min.x;
        } else {
            E.z = nz > 0 ? best.max.z : best.min.z;
            E.x = inset(best.min.x, best.max.x, hit.px);
            depth = best.max.z - best.min.z;
        }
        const top = colTop(best, clampN(E.x, best.min.x, best.max.x), clampN(E.z, best.min.z, best.max.z));
        if (top - oy < Nav.STEP * 0.8 || top - oy > 3.8) {
            return false;
        }
        E.y = top;
        const n = new THREE.Vector3(nx, 0, nz);
        const L = E.clone().addScaledVector(n, -Math.min(0.6, depth * 0.5));
        L.y = colTop(best, L.x, L.z);
        const supported = room.colliders.some(c => !c.off && L.x >= c.min.x && L.x <= c.max.x && L.z >= c.min.z && L.z <= c.max.z &&
            Math.abs(colTop(c, L.x, L.z) - L.y) < 0.25);
        _sv.set(L.x, L.y + 0.02, L.z);
        if (!supported || Enemies.hits(_sv, this.radius * 0.9, this.height)) {
            return false;
        }
        const A = E.clone().addScaledVector(n, 0.62);
        A.y = oy;
        _sv.set(A.x, oy + Nav.STEP + 0.05, A.z);
        if (Enemies.hits(_sv, 0.3, 1.2) || Math.abs(Enemies.floorAt(A.x, oy, A.z) - oy) > Nav.STEP) {
            return false;
        }
        const H = top - oy;
        const yaw = Math.atan2(-nx, -nz);
        const X = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const B = E.clone().addScaledVector(n, 0.48);
        const C = E.clone().addScaledVector(n, 0.1);
        const lead = Math.random() < 0.5 ? 0 : 1;
        const grip = [0, 1].map(s => E.clone().addScaledVector(X, s ? -0.34 : 0.34).addScaledVector(n, -0.14));
        const foot = E.clone().addScaledVector(X, lead ? -0.2 : 0.2).addScaledVector(n, -Math.min(0.22, depth * 0.4));
        const S = this.pos.clone();
        const durs = [
            0.1 + Math.hypot(A.x - S.x, A.z - S.z) / 3.6,
            H > 1.2 ? 0.18 + 0.03 * H : 0.13,
            0.16 + 0.15 * clampN(H - 0.6, 0, 3),
            0.2 + 0.05 * H,
            H < 1 ? 0.16 : 0.24
        ];
        const ends = [];
        durs.reduce((acc, d) => {
            ends.push(acc + d);
            return acc + d;
        }, 0);
        this.action = {
            name: 'mantle', t: 0, lock: true, air: true, phase: 0, u: 0, ends,
            S, A, B, C, L, E, n, X, yaw, top: L.y, oy, H, lead, grip, foot,
            hangY: Math.max(oy, top - 1.95), pullY: Math.max(oy, top - 0.8),
            armW: 0, scrab: 0, stepW: 0, gripped: false, stepped: false
        };
        this.vel.set(0, 0, 0);
        this.climbing = false;
        return true;
    }

    updateMantle(dt, now) {
        const a = this.action;
        for (const k in this.cd) {
            this.cd[k] -= dt;
        }
        a.t += dt;
        this.want.set(0, 0, 0);
        this.wantS.set(0, 0, 0);
        const e = a.ends;
        const t = a.t;
        let ph = 0;
        while (ph < 4 && t >= e[ph]) {
            ph++;
        }
        const t0 = ph ? e[ph - 1] : 0;
        const u = clamp01((t - t0) / (e[ph] - t0));
        a.phase = ph;
        a.u = u;
        const p = this.pos;
        const climbs = a.hangY > a.oy + 0.15 ? 1 : 0;
        if (ph === 0) {
            p.lerpVectors(a.S, a.A, scEase(u));
        } else if (ph === 1) {
            p.lerpVectors(a.A, a.B, scEase(u));
            p.y = a.oy + (a.hangY - a.oy) * (1 - (1 - u) * (1 - u));
            a.armW = scEase(u * 1.4);
            a.scrab = climbs * scEase((u - 0.6) / 0.4);
        } else if (ph === 2) {
            p.lerpVectors(a.B, a.C, u * u);
            p.y = a.hangY + (a.pullY - a.hangY) * scEase(u) - climbs * 0.07 * Math.sin(Math.PI * Math.min(1, u * 3));
            a.armW = 1;
            a.scrab = climbs ? 1 : 0.35 * Math.sin(Math.PI * u);
        } else if (ph === 3) {
            p.lerpVectors(a.C, a.L, u * u);
            p.y = a.pullY + (a.top - a.pullY) * (1 - (1 - u) * (1 - u)) + 0.04 * Math.sin(Math.PI * u);
            a.armW = 1;
            a.scrab = climbs * (1 - clamp01(u * 2.5));
            a.stepW = scEase(u * 2.2);
        } else {
            p.copy(a.L);
            a.armW = 1 - scEase(u * 1.6);
            a.stepW = 1 - scEase(u * 1.4);
            a.scrab = 0;
        }
        this.onGround = ph === 0 || ph === 4;
        this.vel.set(0, 0, 0);
        this.visY = p.y;
        this.yaw = wrapAngle(this.yaw + wrapAngle(a.yaw - this.yaw) * (1 - Math.exp(-14 * dt)));
        this.faceYaw = this.yaw;
        this.yawVel = 0;
        this.crouch += -this.crouch * (1 - Math.exp(-7 * dt));

        if (!a.gripped && a.armW > 0.95) {
            a.gripped = true;
            this.thud = 0.7;
            for (const g of a.grip) {
                Enemies.fx.burst(_sv.copy(g).setY(g.y + 0.05), 6, ShellcapKit.chip, 2, 0.45, { up: 0.6, grav: 9 });
                Enemies.fx.burst(_sv, 5, ShellcapKit.dust, 1, 0.6, { up: 0.3, grav: 1, drag: 3 });
            }
            Enemies.shake(0.15, p);
        }
        if (!a.stepped && a.stepW > 0.95) {
            a.stepped = true;
            this.thud = Math.max(this.thud, 0.5);
            Enemies.fx.burst(_sv.copy(a.foot).setY(a.foot.y + 0.05), 6, ShellcapKit.dust, 1.2, 0.6, { up: 0.4, grav: 1.5, drag: 3 });
        }
        if (a.scrab > 0.5 && Math.random() < dt * 12) {
            _sv.copy(a.E).addScaledVector(a.n, 0.06).addScaledVector(a.X, (Math.random() - 0.5) * 0.5);
            _sv.y = p.y + 0.2 + Math.random() * 0.5;
            Enemies.fx.emit(_sv.x, _sv.y, _sv.z, a.n.x * 0.8, 0.3, a.n.z * 0.8, ShellcapKit.chip, 0.5, 9, 1);
        }

        _sv.set(p.x, p.y + this.height * 0.5, p.z);
        this.onScreen = Enemies.frustum.containsPoint(_sv) || p.distanceTo(Player.pos) < 8;
        this.root.position.copy(p);
        this.root.rotation.y = this.yaw;
        if (this.onScreen || Player.pos.distanceTo(p) < 8) {
            this.animate(dt, now);
        }
        if (t >= e[4]) {
            this.action = null;
            this.onGround = true;
            this.vel.set(-a.n.x * 1.2, 0, -a.n.z * 1.2);
            this.stuckT = 0;
            this.stuckRef.copy(p);
            this.footfall(p, 2, false);
        }
    }

    mantleLimbs(a) {
        const J = this.j;
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const arm = J.arms[s];
            if (a.armW > 0.01) {
                _sv.copy(a.grip[s]);
                _sv.y += FIST_REACH;
                J.torso.worldToLocal(_sv);
                solveTwoBone(arm.sh.position, _sv, SC.upper, SC.fore, ARM_POLE[s], _qa, _qb);
                arm.sh.quaternion.slerp(_qa, a.armW);
                arm.elb.quaternion.slerp(_qb, a.armW);
            }
            const leg = J.legs[s];
            if (a.scrab > 0.01) {
                const w = Math.sin(a.t * 13 + s * Math.PI);
                _qa.setFromEuler(_eu.set(-0.75 - 0.45 * w, 0, sg * 0.1, 'XYZ'));
                _qb.setFromEuler(_eu.set(1.15 + 0.5 * w, 0, 0, 'XYZ'));
                leg.thigh.quaternion.slerp(_qa, a.scrab);
                leg.shin.quaternion.slerp(_qb, a.scrab);
            }
            if (s === a.lead && a.stepW > 0.01) {
                _sv.copy(a.foot);
                _sv.y += 0.09;
                J.body.worldToLocal(_sv);
                solveTwoBone(leg.thigh.position, _sv, SC.thigh, SC.shin, LEG_POLE[s], _qa, _qb);
                leg.thigh.quaternion.slerp(_qa, a.stepW);
                leg.shin.quaternion.slerp(_qb, a.stepW);
            }
            leg.foot.quaternion.copy(_qf.copy(leg.thigh.quaternion).multiply(leg.shin.quaternion).invert());
        }
    }

    landed() {
        for (const L of this.limbs) {
            L.on = false;
        }
        this.thud = 1;
        _sv.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2;
            Enemies.fx.emit(_sv.x, _sv.y, _sv.z, Math.sin(a) * 3, 0.4, Math.cos(a) * 3, ShellcapKit.dust, 0.7, 1, 3);
        }
        Enemies.shake(0.35, this.pos);
    }

    restWorld(i, out) {
        const [bx, bz] = LIMB_REST[i];
        const s = Math.sin(this.yaw);
        const c = Math.cos(this.yaw);
        return out.set(this.pos.x + bx * c + bz * s, this.pos.y, this.pos.z - bx * s + bz * c);
    }

    groundY(p) {
        const r = Enemies.floorAt(p.x, this.pos.y + 0.25, p.z);
        return Math.abs(r - this.pos.y) < 0.6 ? r : this.pos.y;
    }

    gait(dt) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 3.3) {
            this.gaitRun = true;
        } else if (sp < 2.7) {
            this.gaitRun = false;
        }
        const G = this.gaitRun ? GAIT_RUN : GAIT_WALK;
        const grounded = this.onGround;
        const moving = grounded && sp > 0.3;
        const f = Math.max(G.minF, sp / G.stride);
        if (moving) {
            this.cycle += dt * f;
        }
        let stepping = false;
        for (const L of this.limbs) {
            if (L.t >= 0) {
                stepping = true;
            }
        }
        for (let i = 0; i < 4; i++) {
            const L = this.limbs[i];
            const want = i < 2 || this.gaitRun;
            if (!grounded || !want) {
                L.on = false;
                L.t = -1;
                continue;
            }
            this.restWorld(i, _rest);
            if (!L.on) {
                L.on = true;
                L.planted.copy(_rest);
                L.foot.copy(_rest);
                L.t = -1;
                L.lastStep = Math.floor(this.cycle + G.off[i]);
            }
            if (L.t >= 0) {
                L.t += dt / L.dur;
                const s = Math.min(1, L.t);
                const lead = moving ? (1 - s) * L.dur + (G.duty / f) * 0.5 : 0;
                L.to.set(_rest.x + this.vel.x * lead, 0, _rest.z + this.vel.z * lead);
                L.to.y = this.groundY(L.to);
                const e = s * s * (3 - 2 * s);
                L.foot.lerpVectors(L.from, L.to, e);
                L.foot.y += L.arc * Math.sin(Math.PI * s);
                if (L.t >= 1) {
                    L.t = -1;
                    L.planted.copy(L.to);
                    this.footfall(L.to, sp, i >= 2);
                }
            } else {
                L.foot.copy(L.planted);
                const ph = this.cycle + G.off[i];
                const cyc = Math.floor(ph);
                const u = ph - cyc;
                const far = L.planted.distanceToSquared(_rest);
                if (moving && u >= G.duty && cyc !== L.lastStep) {
                    L.lastStep = cyc;
                    this.startStep(L, (1 - u) / f, G.arc);
                } else if (far > (moving ? G.stride * G.stride * 0.6 : 0.032) && (moving || !stepping)) {
                    L.lastStep = cyc;
                    this.startStep(L, moving ? 0.2 : 0.3, 0.1);
                    stepping = true;
                }
            }
        }
    }

    startStep(L, dur, arc) {
        L.t = 0;
        L.dur = Math.max(0.14, dur);
        L.arc = arc;
        L.from.copy(L.planted);
    }

    footfall(p, sp, fist) {
        this.thud = Math.max(this.thud, Math.min(1, 0.35 + sp * 0.12));
        if (sp > 1.2 && this.onScreen) {
            Enemies.fx.burst(_sv.set(p.x, p.y + 0.05, p.z), fist ? 5 : 3, ShellcapKit.dust, 1.2, 0.6, { up: 0.5, grav: 1.5, drag: 3 });
        }
        if (sp > 3) {
            Enemies.shake(0.12, p);
        }
    }

    animate(dt, now) {
        const T = this.pt;
        const C = this.pc;
        const J = this.j;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const moveK = Math.min(1, sp / 1.5);
        const a = this.action;
        const an = a ? a.name : '';
        const g = C.gal;
        const cyc = this.cycle * Math.PI * 2;
        this.accF += (clampN((sp - this.prevSpeed) / Math.max(dt, 1e-3), -12, 12) - this.accF) * (1 - Math.exp(-6 * dt));
        this.prevSpeed = sp;
        this.groundK += ((this.onGround ? 1 : 0) - this.groundK) * (1 - Math.exp(-14 * dt));

        T.gal = this.gaitRun && this.onGround && this.blockT <= 0 ? 1 : 0;
        const sway = (0.045 * (1 - g) + 0.035 * g) * Math.sin(cyc) * moveK;
        T.hip = SC.hip - 0.04 * moveK - 0.1 * g - this.crouch * 0.36;
        T.lean = 0.45 + 0.1 * moveK + 0.68 * g + this.crouch * 0.35 + clampN(this.accF * 0.035, -0.1, 0.16);
        T.twist = (0.13 * (1 - g) + 0.16 * g) * Math.sin(cyc) * moveK;
        T.roll = -sway * 2.2;
        T.headR = 0;
        T.jaw = 0.12 + Math.sin(now * 1.7 + this.seed) * 0.05 + 0.25 * g;
        T.tuck = this.onGround ? 0 : 1;
        T.glow = 0;
        for (let s = 0; s < 2; s++) {
            T.shP[s] = -0.3 * Math.cos(cyc + s * Math.PI - 3.8) * moveK + 0.1;
            T.shR[s] = 0.24;
            T.shY[s] = 0;
            T.elb[s] = -0.5 - 0.1 * moveK;
            T.ftw[s] = 0;
        }

        let tx = null;
        let tz = 0;
        let ty = 0;
        if (an === 'ack' && a.from) {
            tx = a.from.x;
            ty = a.from.y + 1.2;
            tz = a.from.z;
        } else if (this.seesPlayer && an !== 'dying') {
            tx = Player.pos.x;
            ty = Player.pos.y + 1.6;
            tz = Player.pos.z;
        } else if (this.goalSet && (this.intent === 'investigate' || this.intent === 'search')) {
            tx = this.goal.x;
            ty = this.goal.y + 1;
            tz = this.goal.z;
        }
        let lookY = Math.sin(now * 0.45 + this.seed) * 0.45;
        let lookP = 0;
        if (tx !== null) {
            const dx = tx - this.pos.x;
            const dz = tz - this.pos.z;
            lookY = clampN(wrapAngle(Math.atan2(dx, dz) - this.yaw), -1, 1);
            lookP = clampN(-Math.atan2(ty - (this.pos.y + 1.4), Math.hypot(dx, dz)), -0.6, 0.6);
        }
        T.headY = lookY;
        T.headP = -T.lean * 0.95 + lookP;

        switch (an) {
            case 'howl': {
                const t = a.t;
                if (t < 0.32) {
                    T.hip -= 0.16;
                    T.lean = 0.85;
                    T.headP = 0.45;
                    T.jaw = 0.05;
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = -0.35;
                        T.elb[s] = -1.7;
                        T.shY[s] = 0.45;
                        T.ftw[s] = 0.6;
                    }
                } else if (t < a.dur - 0.28) {
                    T.hip += 0.06;
                    T.lean = -0.35;
                    T.headP = -1.0;
                    T.jaw = 1.0;
                    T.glow = 1;
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = -0.95;
                        T.shR[s] = 1.3;
                        T.shY[s] = -0.2;
                        T.elb[s] = -0.35;
                        T.ftw[s] = 0.9;
                    }
                }
                break;
            }
            case 'screech':
                T.lean = 0.6;
                T.headP = -0.25;
                T.jaw = 1.0;
                T.glow = 1;
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -0.6;
                    T.shR[s] = 1.0;
                    T.elb[s] = -0.6;
                    T.ftw[s] = 0.7;
                }
                break;
            case 'ack':
                T.lean = 0.6;
                T.jaw = 0.5;
                T.headR = 0.15 * Math.sin(a.t * 7);
                T.glow = 0.7;
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -0.35;
                    T.elb[s] = -1.0;
                }
                break;
            case 'swipe': {
                const s = a.side;
                if (a.t < a.wind) {
                    T.shP[s] = -2.6;
                    T.elb[s] = -1.0;
                    T.shR[s] = 0.45;
                    T.twist = s ? 0.45 : -0.45;
                    T.lean = 0.25;
                } else if (a.t < a.wind + 0.22) {
                    T.shP[s] = -0.7;
                    T.elb[s] = -0.2;
                    T.shY[s] = 0.55;
                    T.twist = s ? -0.55 : 0.55;
                    T.lean = 0.8;
                }
                T.jaw = 0.6;
                break;
            }
            case 'bash': {
                const s = a.side;
                if (a.t < a.wind) {
                    T.shP[s] = 0.45;
                    T.shR[s] = 0.75;
                    T.elb[s] = -1.45;
                    T.ftw[s] = 1.4;
                    T.twist = s ? 0.6 : -0.6;
                    T.lean = 0.35;
                    T.hip -= 0.08;
                } else if (a.t < a.wind + 0.25) {
                    T.shP[s] = -1.5;
                    T.shR[s] = 0.2;
                    T.shY[s] = 0.45;
                    T.elb[s] = -0.15;
                    T.ftw[s] = 1.6;
                    T.twist = s ? -0.6 : 0.6;
                    T.lean = 0.75;
                }
                T.jaw = 0.8;
                break;
            }
            case 'lunge':
                if (!a.fly) {
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = 0.7;
                        T.elb[s] = -0.6;
                    }
                    T.hip -= 0.12;
                } else {
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = -1.7;
                        T.elb[s] = -0.15;
                        T.shR[s] = 0.35;
                    }
                    T.lean = 0.85;
                    T.headP = -0.4;
                    T.tuck = 0.4;
                }
                T.jaw = 0.9;
                break;
            case 'dodge':
                T.roll = (a.side || 1) * 0.45;
                T.lean = 0.6;
                break;
            case 'stagger': {
                const k = a.k || 0.5;
                T.lean = 0.8 + 0.25 * k;
                T.headP = 0.35 * k;
                T.hip -= 0.1 * k;
                T.jaw = 0.55;
                T.gal = 0;
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -0.5;
                    T.shR[s] = 0.15;
                    T.shY[s] = 0.5;
                    T.elb[s] = -1.6;
                    T.ftw[s] = 0.4;
                }
                break;
            }
            case 'dying': {
                if (a.t < 0.25) {
                    T.lean = 0.0;
                    T.headP = -0.7;
                    T.jaw = 1.0;
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = -0.6;
                        T.shR[s] = 0.85;
                        T.elb[s] = -0.6;
                    }
                } else {
                    T.hip = 0.5;
                    T.lean = 1.1;
                    T.headP = 0.75;
                    T.jaw = 0.6;
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = 0.15;
                        T.shR[s] = 0.3;
                        T.elb[s] = -0.2;
                    }
                }
                T.gal = 0;
                break;
            }
            case 'mantle': {
                const u = a.u;
                T.gal = 0;
                T.tuck = 0;
                if (a.phase === 0) {
                    T.hip -= 0.2 * u;
                    T.lean = 0.75;
                    T.headP = -0.95;
                    T.jaw = 0.35;
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = 0.55;
                        T.shR[s] = 0.35;
                        T.elb[s] = -0.8;
                        T.ftw[s] = 0.3;
                    }
                } else if (a.phase === 1) {
                    T.lean = 0.1;
                    T.headP = -0.75;
                    T.jaw = 0.75;
                    for (let s = 0; s < 2; s++) {
                        T.shP[s] = -2.85;
                        T.shR[s] = 0.25;
                        T.elb[s] = -0.25;
                        T.ftw[s] = 0.5;
                    }
                } else if (a.phase === 2) {
                    T.lean = 0.15 + 0.85 * u;
                    T.headP = -T.lean * 0.9 - 0.25 * (1 - u);
                    T.jaw = 0.95;
                    T.headR = 0.12 * Math.sin(a.t * 9);
                    T.glow = 0.4;
                } else if (a.phase === 3) {
                    T.lean = 1.1 - 0.35 * u;
                    T.hip -= 0.18 * (1 - u);
                    T.headP = -T.lean * 0.7;
                    T.jaw = 0.55;
                } else {
                    T.lean = 0.5 + 0.25 * (1 - u);
                }
                break;
            }
            case 'dive': {
                const fall = this.vel.y < 0 ? clamp01(-this.vel.y / 8) : 0;
                T.gal = 0;
                T.tuck = 0.35 - 0.25 * fall;
                T.lean = 0.95 - 0.3 * fall;
                T.headP = -0.7;
                T.jaw = 0.9;
                T.glow = 0.5;
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -1.35 + 0.5 * fall;
                    T.shR[s] = 0.55;
                    T.shY[s] = -0.15;
                    T.elb[s] = -0.45;
                    T.ftw[s] = 0.3;
                }
                break;
            }
            case 'climb':
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -2.7;
                    T.elb[s] = -0.4;
                    T.shR[s] = 0.3;
                }
                T.lean = 0.5;
                break;
            case 'vault':
                T.shP[0] = -0.9;
                T.elb[0] = 0;
                T.shR[0] = -0.1;
                T.shP[1] = -0.3;
                T.shR[1] = 1.0;
                T.lean = 0.65;
                T.roll = 0.25;
                break;
            case 'hop':
                T.shR[0] = T.shR[1] = 0.7;
                break;
        }

        if (!an) {
            if (this.intent === 'regen') {
                T.lean = 1.0;
                T.headP = 0.5;
                T.jaw = 0.05;
                T.glow = 0.5 + 0.5 * Math.sin(now * 3);
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -0.75;
                    T.elb[s] = -1.9;
                    T.shY[s] = 0.55;
                    T.shR[s] = 0.05;
                    T.ftw[s] = 1.2;
                }
            } else if (this.intent === 'lurk') {
                for (let s = 0; s < 2; s++) {
                    T.shP[s] = -0.45;
                    T.elb[s] = -1.0;
                }
            }
        }
        if (!an && this.blockT <= 0 && T.gal === 0 && this.engaged && this.seesPlayer &&
            this.intent !== 'regen' && this.faceBare()) {
            const lead = this.side > 0 ? 0 : 1;
            for (let s = 0; s < 2; s++) {
                if (this.shields[s].broken) {
                    continue;
                }
                const hiFist = s === lead || this.shields[lead].broken;
                T.shP[s] = hiFist ? -1.15 : -0.9;
                T.elb[s] = hiFist ? -2.0 : -2.15;
                T.shY[s] = hiFist ? 0.5 : 0.45;
                T.shR[s] = 0.1;
                T.ftw[s] = hiFist ? 1.8 : 1.7;
            }
            T.headP += 0.25;
            T.lean += 0.08;
        }
        if (this.blockT > 0 && an !== 'dying') {
            const hi = this.blockZone !== 'low';
            for (let s = 0; s < 2; s++) {
                if (this.shields[s].broken) {
                    continue;
                }
                T.shP[s] = hi ? -1.2 : -0.85;
                T.elb[s] = hi ? -1.95 : -2.3;
                T.shY[s] = 0.5;
                T.shR[s] = 0.1;
                T.ftw[s] = 1.85;
            }
            T.headP += 0.3;
            T.lean += 0.12;
            T.gal = 0;
        }

        const k = 1 - Math.exp(-(an === 'mantle' ? 15 : 9.5) * dt);
        for (const key of SHELLCAP_SCALARS) {
            C[key] += (T[key] - C[key]) * k;
        }
        C.gal += (T.gal - C.gal) * (1 - Math.exp(-5 * dt));
        for (const key of SHELLCAP_ARMS) {
            for (let s = 0; s < 2; s++) {
                C[key][s] += (T[key][s] - C[key][s]) * k;
            }
        }

        const rc = this.recoil;
        const bt = this.beat * this.beat;
        const th = this.thud;
        const bob = moveK * (g > 0.5 ? 0.04 * Math.cos(cyc * 2) : 0.035 * Math.cos(cyc * 2 - 0.6));
        J.body.position.set(sway, C.hip + bob - th * 0.05 + bt * 0.04, 0);
        J.torso.rotation.set(C.lean + 0.03 * g * Math.sin(cyc * 2) * moveK - rc * 0.6 - bt * 0.14 + th * 0.05, C.twist, C.roll + this.recoilRoll);
        J.torso.scale.setScalar(1 + bt * 0.05);
        J.head.rotation.set(C.headP - rc * 0.5 - bt * 0.2, C.headY, C.headR - this.recoilRoll * 0.5);
        for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const jaw = C.jaw + bt * 0.4;
            J.jaw[s].rotation.set(-jaw * 0.5, 0, sg * jaw * 0.6);
            const arm = J.arms[s];
            arm.sh.rotation.set(C.shP[s], -sg * C.shY[s], sg * C.shR[s]);
            arm.elb.rotation.set(C.elb[s], sg * C.ftw[s], 0);
        }

        this.gait(dt);
        this.root.updateMatrixWorld(true);
        const gk = this.groundK;
        for (let s = 0; s < 2; s++) {
            const leg = J.legs[s];
            const L = this.limbs[s];
            leg.thigh.rotation.set(-0.25 - 0.8 * C.tuck, 0, 0);
            leg.shin.rotation.set(0.5 + 1.2 * C.tuck, 0, 0);
            if (L.on) {
                _sv.copy(L.foot);
                _sv.y += 0.09;
                J.body.worldToLocal(_sv);
                solveTwoBone(leg.thigh.position, _sv, SC.thigh, SC.shin, LEG_POLE[s], _qa, _qb);
                leg.thigh.quaternion.slerp(_qa, gk);
                leg.shin.quaternion.slerp(_qb, gk);
            }
            leg.foot.quaternion.copy(_qf.copy(leg.thigh.quaternion).multiply(leg.shin.quaternion).invert());
            if (L.t >= 0) {
                leg.foot.rotateX(-0.3 * Math.sin(Math.PI * Math.min(1, L.t)));
            }
        }
        const armW = C.gal * gk;
        if (armW > 0.01) {
            for (let s = 0; s < 2; s++) {
                const L = this.limbs[2 + s];
                if (!L.on) {
                    continue;
                }
                const arm = J.arms[s];
                _sv.copy(L.foot);
                _sv.y += FIST_REACH;
                J.torso.worldToLocal(_sv);
                solveTwoBone(arm.sh.position, _sv, SC.upper, SC.fore, ARM_POLE[s], _qa, _qb);
                arm.sh.quaternion.slerp(_qa, armW);
                arm.elb.quaternion.slerp(_qb, armW);
            }
        }
        if (an === 'mantle') {
            this.mantleLimbs(a);
        }

        if (an === 'dying') {
            return;
        }
        const col = this.moodColor();
        this.eyeMat.color.copy(col).multiplyScalar(0.75 + 0.25 * Math.sin(now * 2.3 + this.seed) + 0.6 * C.glow + bt);
        this.fxT += dt;
        if (this.fxT > 0.06) {
            this.fxT = 0;
            if (C.glow > 0.7 && (an === 'howl' || an === 'screech')) {
                J.head.getWorldPosition(_sv);
                Enemies.fx.emit(_sv.x, _sv.y, _sv.z, (Math.random() - 0.5) * 1.5, 1.2 + Math.random(), (Math.random() - 0.5) * 1.5, col, 0.8, -0.5, 1.5);
            } else if (this.intent === 'regen' && !an) {
                Enemies.fx.emit(this.pos.x + (Math.random() - 0.5) * 0.8, this.pos.y + 0.4 + Math.random() * 0.6, this.pos.z + (Math.random() - 0.5) * 0.8,
                    0, 0.6 + Math.random() * 0.4, 0, col, 1.4, -0.2, 0.8);
            }
        }
    }
}

class ShellcapMind extends HiveMind {
    vision(e) {
        const cfg = this.cfg;
        const P = Player.pos;
        const dx = P.x - e.pos.x;
        const dz = P.z - e.pos.z;
        const hd = Math.hypot(dx, dz);
        const d = Math.hypot(hd, P.y - e.pos.y);
        if (d > cfg.sight) {
            return 0;
        }
        const dot = hd > 0.01 ? (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / hd : 1;
        const cosH = Math.cos(cfg.cone);
        const inCone = dot > cosH;
        if (!inCone && d > cfg.near) {
            return 0;
        }
        const nav = Enemies.nav;
        const eyeY = e.pos.y + e.bodyHeight() * 0.85;
        let parts = 0;
        for (const h of [1.6, 1.0, 0.3]) {
            if (nav.sight(e.pos.x, eyeY, e.pos.z, P.x, P.y + h, P.z)) {
                parts++;
            }
        }
        if (!parts) {
            return 0;
        }
        const centre = inCone ? (dot - cosH) / (1 - cosH) : 0.3;
        let s = (1 - d / cfg.sight) * (0.4 + 0.6 * centre) * (0.5 + parts / 6);
        if (Enemies.player.sprinting) {
            s *= 1.4;
        }
        return Math.max(0.1, s);
    }

    aimedAt(e, k) {
        const P = Enemies.player;
        _sv.set(e.pos.x, e.pos.y + 1, e.pos.z).sub(P.eye).normalize();
        return _sv.dot(P.aim) > k;
    }

    lookingAway(e) {
        const P = Enemies.player;
        const dx = e.pos.x - P.pos.x;
        const dz = e.pos.z - P.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const ah = Math.hypot(P.aim.x, P.aim.z) || 1;
        return (dx * P.aim.x + dz * P.aim.z) / (d * ah) < 0.25;
    }

    sense(e, now) {
        const P = Enemies.player;
        const s = this.vision(e);
        e.seesPlayer = s > 0;
        if (s > 0) {
            e.mem.saw(Player.pos, Player.vel, now);
            if (e.engaged) {
                if (e.pack) {
                    e.pack.share(Player.pos, now, Player.vel);
                }
                if (e.intent === 'search') {
                    e.thinkT = 0;
                }
                if (P.zoom > 0.5 && this.aimedAt(e, 0.996) && e.cool('dodge') && e.onGround && !e.action && Math.random() < 0.35) {
                    this.dodge(e, 'scope on me - dodging');
                }
            } else {
                const gain = e.alertFloor > 0 ? 1.8 : 1;
                e.alert = Math.min(1, e.alert + s * this.cfg.senseEvery * 4 * gain);
                e.thought = 'something there... ' + Math.round(e.alert * 100) + '%';
                if (e.alert >= 1) {
                    this.engage(e, now, e.pack && e.pack.hunting ? 'found you again' : 'spotted you');
                }
            }
        } else if (!e.engaged && e.alert > e.alertFloor) {
            e.alert = Math.max(e.alertFloor, e.alert - this.cfg.senseEvery * 0.15);
        }
    }

    hear(e, n, now) {
        const src = n.src;
        const err = e.pos.distanceTo(src) * 0.15 * (1 - n.loud * 0.6);
        _sv2.set(src.x + (Math.random() - 0.5) * 2 * err, src.y, src.z + (Math.random() - 0.5) * 2 * err);
        e.mem.heard(_sv2, now);
        if (e.engaged) {
            if (e.pack) {
                e.pack.mem.heard(_sv2, now);
            }
            return;
        }
        const gain = n.kind === 'shot' ? 1.3 : n.kind === 'impact' ? 0.9 : n.kind === 'land' ? 0.6 : 0.4;
        e.alert = Math.min(1, e.alert + n.loud * gain * (e.alertFloor > 0 ? 1.5 : 1) + 0.08);
        if (e.alert >= 1 || (n.kind === 'shot' && n.loud > 0.45)) {
            this.engage(e, now, 'heard a ' + n.kind);
            return;
        }
        if (!e.action) {
            e.intent = 'investigate';
            e.goal.copy(_sv2);
            e.goalSet = true;
            e.searchT = 0;
            e.thought = 'heard a ' + n.kind + ' - investigating';
            e.face(_sv2.x, _sv2.z);
        }
    }

    engage(e, now, why) {
        if (e.engaged) {
            return;
        }
        e.engaged = true;
        e.alert = 1;
        e.intent = 'chase';
        e.goalSet = false;
        if (e.pack && e.pack.engaged) {
            e.pack.mem.absorb(e.mem);
            e.thought = why + ' - pack already hunting';
            return;
        }
        const caller = this.members.find(k => k !== e && !k.dead && k.action && !k.action.sent &&
            (k.action.name === 'howl' || k.action.name === 'screech') && k.pos.distanceTo(e.pos) < this.cfg.comm);
        if (caller && !(e.action && e.action.name === 'mantle')) {
            e.action = { name: 'ack', t: 0, dur: 0.85, from: caller.pos.clone(), pulse: 0.6 };
            e.thought = why + ' - kin is already calling';
            return;
        }
        const quick = e.pos.distanceTo(Player.pos) < 5 || (e.pack && e.pack.hunting);
        this.call(e, quick);
        e.thought = why + ' - calling the hive';
    }

    call(e, quick) {
        e.action = quick
            ? { name: 'screech', t: 0, dur: 0.6, beats: [0.2], done: [], lock: true }
            : { name: 'howl', t: 0, dur: 1.65, beats: [0.5, 0.8, 1.1], done: [], lock: true };
    }

    called(k, caller, now) {
        const was = k.engaged;
        k.engaged = true;
        k.alert = 1;
        if (!was) {
            k.intent = 'chase';
            k.goalSet = false;
            k.thought = 'answered the call';
            if (!k.action || !k.action.lock) {
                k.action = { name: 'ack', t: 0, dur: 0.9, from: caller.pos.clone(), pulse: 0.45 };
            }
        }
    }

    died(e, now) {
        const p = e.pack || this.newPack(e);
        const kin = [];
        for (const k of this.members) {
            if (k === e || k.dead || k.pos.distanceTo(e.pos) > this.cfg.deathCall) {
                continue;
            }
            kin.push(k);
            if (k.pack && k.pack !== p) {
                this.merge(p, k.pack);
            } else if (!k.pack) {
                this.join(p, k);
            }
            this.called(k, e, now);
        }
        Enemies.commFx(e, kin, e.moodColor());
        p.engaged = true;
        p.hunting = true;
        p.anger = Math.min(0.9, p.anger + 0.3);
        p.share(Player.pos, now, Player.vel);
        p.dirty = true;
        for (const m of p.members) {
            if (m !== e && !(m.action && m.action.lock)) {
                m.thought = 'kin died - enraged';
            }
        }
    }

    assess(p, now) {
        for (let i = p.members.length - 1; i >= 0; i--) {
            if (p.members[i].dead) {
                this.leave(p.members[i]);
            }
        }
        if (!p.members.length) {
            return;
        }
        p.engaged = p.members.some(m => m.engaged);
        if (!p.engaged) {
            return;
        }
        const cfg = this.cfg;
        const P = Enemies.player;
        const moving = Math.hypot(Player.vel.x, Player.vel.z) > 1.5;
        const age = p.mem.age(now);
        if (age > cfg.lostAfter && moving && now > (p.tremorT || 0) && p.members.some(m => m.pos.distanceTo(Player.pos) < cfg.tremorRange)) {
            p.tremorT = now + cfg.tremorEvery;
            const err = 3 + Math.random() * 4;
            _sv2.set(Player.pos.x + (Math.random() - 0.5) * 2 * err, Player.pos.y, Player.pos.z + (Math.random() - 0.5) * 2 * err);
            p.mem.saw(_sv2, null, now - cfg.lostAfter + 1.5);
            for (const m of p.members) {
                if (m.intent === 'search') {
                    m.searchStage = 0;
                    m.goalSet = false;
                    m.searchPause = 0;
                    m.thought = 'felt your footsteps through the mycelium';
                }
            }
        }
        if (p.mem.age(now) > cfg.searchFor) {
            for (const m of p.members) {
                this.standDown(m);
            }
            p.engaged = false;
            p.hunting = true;
            p.anger *= 0.5;
            p.lust = 0;
            p.mood = 'wary';
            return;
        }
        p.anger = Math.max(0, p.anger - 0.008);
        p.lust = Math.max(0, p.lust - 0.006);
        if (P.hpF < 0.35) {
            p.lust = Math.min(0.8, p.lust + 0.06);
        }
        let close = 0;
        for (const m of p.members) {
            if (m.engaged && m.pos.distanceTo(Player.pos) < 10) {
                close++;
            }
        }
        if (close >= 3) {
            p.lust = Math.min(0.8, p.lust + 0.02);
        }
        const ag = p.aggression;
        const mood = ag < 0.35 ? 0 : ag < 0.6 ? 1 : ag < 0.85 ? 2 : 3;
        if (SHELLCAP_MOODS[mood] !== p.mood) {
            p.mood = SHELLCAP_MOODS[mood];
            p.dirty = true;
        }
        for (const m of p.members) {
            m.setMood(m.engaged ? mood : 0);
        }
        p.roleT -= 0.4;
        if (p.dirty || p.roleT <= 0) {
            this.assignRoles(p);
        }
    }

    standDown(e) {
        e.engaged = false;
        e.alertFloor = 0.35;
        e.alert = 0.35;
        e.intent = 'idle';
        e.idleT = 1 + Math.random() * 2;
        e.goalSet = false;
        e.role = null;
        e.blockT = 0;
        e.setMood(0);
        e.thought = 'lost you - prowling';
    }

    assignRoles(p) {
        const ip = p.mem.seen.pos;
        const fighters = p.members.filter(m => m.engaged && m.intent !== 'retreat' && m.intent !== 'regen');
        fighters.sort((a, b) => a.pos.distanceToSquared(ip) - b.pos.distanceToSquared(ip));
        const n = fighters.length;
        const rushers = p.mood === 'bloodlust' || n < 2 ? n : Math.max(1, Math.round(n / 3));
        let side = Math.random() < 0.5 ? 1 : -1;
        fighters.forEach((m, i) => {
            const prev = m.role;
            if (i < rushers) {
                m.role = 'rush';
                m.side = side;
                m.arcK = 0.7 + 0.45 * Math.floor(i / 2);
                side = -side;
            } else if (n >= 3 && i === n - 1) {
                m.role = 'lurk';
            } else {
                m.role = 'flank';
                m.side = side;
                side = -side;
            }
            if (m.role !== prev) {
                m.flankDone = false;
                m.lurkT = 0;
                m.spotT = 0;
            }
        });
        p.dirty = false;
        p.roleT = 3;
    }

    allies(e) {
        const p = e.pack;
        if (!p) {
            return 0;
        }
        let n = 0;
        for (const m of p.members) {
            if (m !== e && !m.dead && m.engaged && m.intent !== 'retreat' && m.intent !== 'regen' && m.pos.distanceTo(e.pos) < 30) {
                n++;
            }
        }
        return n;
    }

    think(e, now) {
        if (!e.engaged) {
            this.thinkCalm(e, now);
            return;
        }
        if (e.action && (e.action.lock || e.action.air)) {
            return;
        }
        const cfg = this.cfg;
        const p = e.pack;
        const P = Enemies.player;
        const mem = this.memOf(e);
        const allies = this.allies(e);
        const lone = allies === 0;
        const aggr = p ? p.aggression : 0.5;
        const mood = p ? p.mood : 'hunting';
        const hpF = e.hp / e.maxHp;
        const dP = e.pos.distanceTo(Player.pos);
        const healing = e.intent === 'regen' || e.intent === 'retreat';

        if (lone && healing) {
            e.intent = 'chase';
            e.goalSet = false;
            e.thought = 'no kin left to cover me - fighting';
        }

        if (!e.seesPlayer && mem.age(now) > cfg.lostAfter && !(healing && !lone)) {
            if (e.intent !== 'search') {
                e.intent = 'search';
                e.searchStage = 0;
                e.searchPause = 0;
                e.goalSet = false;
            }
            return;
        }
        if (lone) {
            e.intent = 'chase';
            e.thought = mem.age(now) < 0.8 ? (dP < cfg.directRange ? 'alone - going straight for you' : 'alone - circling in')
                : 'chasing where you went';
            return;
        }

        if (e.intent === 'regen') {
            if (hpF >= 0.97) {
                e.intent = 'rush';
                e.fallBand = 0;
                e.thought = 'regrown - rejoining the pack';
                p.dirty = true;
            } else if (mood === 'bloodlust' && hpF > 0.6) {
                e.intent = 'rush';
                e.thought = 'pack is in bloodlust - rejoining half-healed';
                p.dirty = true;
            } else if (dP < 6 && e.seesPlayer) {
                e.intent = 'rush';
                e.thought = 'found while healing - fighting back';
            } else if (dP < cfg.regenSafe) {
                e.intent = 'retreat';
                this.pickRetreat(e);
                e.thought = 'too close to heal - moving off';
            } else {
                e.thought = `regenerating ${Math.round(hpF * 100)}%, shell ${Math.round(e.shellLeft() * 100)}%`;
            }
            return;
        }

        if (e.intent === 'retreat') {
            if (mood === 'bloodlust' && hpF > 0.45) {
                e.intent = 'rush';
                e.thought = 'pack went into bloodlust - back in';
            } else {
                e.thought = `hurt ${Math.round(hpF * 100)}% - falling back to regrow while kin hold you`;
                return;
            }
        }

        const band = hpF < 0.25 ? 2 : hpF < cfg.fallBackHp ? 1 : 0;
        if (band > e.fallBand) {
            e.fallBand = band;
            const someoneHealing = p.members.some(m => m !== e && !m.dead && (m.intent === 'retreat' || m.intent === 'regen'));
            const nerve = (P.reloading ? 0.2 : 0) + (P.hpF < 0.3 ? 0.35 : 0);
            if ((mood !== 'bloodlust' || hpF < 0.3) && !someoneHealing && Math.random() < cfg.fallBackChance - nerve) {
                e.intent = 'retreat';
                e.retreatTries = 0;
                this.pickRetreat(e);
                p.dirty = true;
                e.thought = `hurt ${Math.round(hpF * 100)}% - kin can hold you, falling back to regrow`;
                return;
            }
            e.thought = `hurt ${Math.round(hpF * 100)}% - ` + (someoneHealing ? 'kin is already healing, fighting on' : 'fighting on');
        }

        const kinOnYou = p.members.some(m => m !== e && !m.dead && m.pos.distanceTo(Player.pos) < 2.8);
        const opening = P.reloading ? 'you are reloading' : P.hpF < 0.3 ? 'you are weak' : kinOnYou ? 'kin has you engaged' : null;
        if (opening && dP < 10 && e.role !== 'rush') {
            e.intent = 'rush';
            e.thought = opening + ' - rushing in';
            return;
        }

        switch (e.role) {
            case 'flank':
                if (e.flankDone || dP < 6) {
                    e.intent = 'rush';
                    e.thought = 'flanked - closing in';
                } else {
                    e.intent = 'flank';
                    e.thought = `flanking ${e.side > 0 ? 'left' : 'right'} while kin draw fire`;
                }
                break;
            case 'lurk': {
                const away = this.lookingAway(e);
                if (e.lurkT > cfg.lurkWait || (away && dP < 14)) {
                    e.intent = 'rush';
                    e.role = 'rush';
                    e.thought = away ? 'you looked away - pouncing' : 'done waiting - pouncing';
                } else {
                    e.intent = 'lurk';
                    e.thought = 'lurking - waiting for an opening';
                }
                break;
            }
            default:
                e.intent = 'rush';
                e.thought = dP < cfg.directRange ? (mood === 'bloodlust' ? 'BLOODLUST - tearing in' : 'in range - going straight for you')
                    : mood === 'bloodlust' ? 'BLOODLUST - surrounding you'
                        : P.zoom > 0.5 ? 'you are scoped - weaving in'
                            : `circling in from the ${e.side > 0 ? 'left' : 'right'}`;
        }
    }

    thinkCalm(e) {
        if (e.intent === 'investigate') {
            e.searchT += this.cfg.thinkEvery * 1.6;
            if (e.searchT > 9) {
                e.intent = 'idle';
                e.idleT = 2;
                e.goalSet = false;
                e.thought = 'nothing there';
            }
            return;
        }
        if (e.intent === 'idle') {
            e.thought = e.alertFloor > 0 ? 'prowling - stopping to listen' : e.alert > 0.05 ? 'uneasy...' : 'idle';
        } else if (e.intent === 'roam') {
            e.thought = e.alertFloor > 0 ? 'prowling - still looking for you' : 'roaming';
        } else {
            e.intent = 'idle';
        }
    }

    act(e, dt, now) {
        const cfg = this.cfg;
        const p = e.pack;
        const lust = !!p && p.mood === 'bloodlust' && e.engaged;
        e.crouchTarget = 0;
        e.dr = lust ? cfg.lustDR : 0;
        e.strafe = false;
        e.recentHurt = Math.max(0, e.recentHurt - dt * 20);
        e.staggerT -= dt;
        e.blockT -= dt;
        e.duckT -= dt;
        e.underFire -= dt;
        for (const pl of e.plates) {
            pl.heat = Math.max(0, pl.heat - dt * 2.5);
        }
        if (e.action && this.runAction(e, e.action, dt, now)) {
            return;
        }
        const lone = this.allies(e) === 0;
        const aggr = p ? p.aggression : 0.4;
        const run = cfg.run * (1 + 0.2 * aggr) * (lust ? cfg.lustSpeed : 1);
        const P = Player.pos;
        const mem = this.memOf(e);
        const dP = e.pos.distanceTo(P);

        switch (e.intent) {
            case 'idle':
                e.stop();
                e.idleT -= dt;
                if (e.alert > 0.25 && mem.known()) {
                    e.face(mem.seen.pos.x, mem.seen.pos.z);
                } else {
                    e.faceYaw += Math.sin(now * 0.6 + e.seed) * dt * 0.5;
                }
                if (e.idleT <= 0) {
                    this.pickRoam(e);
                    e.intent = 'roam';
                    e.goalT = 0;
                }
                break;
            case 'roam':
                e.goalT += dt;
                if (e.navTo(e.goal.x, e.goal.z, e.alertFloor > 0 ? cfg.prowl : cfg.walk, now) < 0.8 || e.goalT > 15) {
                    e.intent = 'idle';
                    e.idleT = 1.5 + Math.random() * 3;
                    e.goalSet = false;
                }
                break;
            case 'investigate':
                if (e.navTo(e.goal.x, e.goal.z, cfg.prowl, now) < 1.2) {
                    e.stop();
                    e.faceYaw += Math.sin(now * 1.3 + e.seed) * dt * 1.6;
                }
                break;
            case 'search':
                this.search(e, dt, now, mem, run);
                break;
            case 'chase':
            case 'rush':
                if (!lone && dP < 3.8 && !this.mayAttack(e)) {
                    this.circle(e, cfg.walk * 1.4, dt);
                    e.thought = 'circling - waiting for a gap';
                    break;
                }
                if (e.seesPlayer || mem.age(now) < 0.8) {
                    if (dP > cfg.directRange && Math.abs(P.y - e.pos.y) < 1.5) {
                        this.approach(e, run, now);
                    } else {
                        e.goalSet = false;
                        e.chase(run, now);
                    }
                    this.melee(e);
                } else {
                    mem.predict(now, e.goal);
                    e.goalSet = true;
                    e.navTo(e.goal.x, e.goal.z, run, now);
                }
                break;
            case 'flank':
                this.flankPoint(e, now);
                if (e.navTo(e.goal.x, e.goal.z, run, now) < 1.2) {
                    e.flankDone = true;
                }
                this.melee(e);
                break;
            case 'lurk':
                e.lurkT += dt;
                if (now > e.spotT) {
                    this.pickLurk(e);
                    e.spotT = now + 3;
                }
                if (e.navTo(e.goal.x, e.goal.z, cfg.walk * 1.2, now) < 0.8) {
                    e.stop();
                    e.face(P.x, P.z);
                }
                e.crouchTarget = 0.75;
                this.melee(e);
                break;
            case 'retreat':
                if (e.navTo(e.goal.x, e.goal.z, run * 0.9, now) < 1) {
                    if (dP >= cfg.regenSafe) {
                        e.intent = 'regen';
                        e.goalSet = false;
                        e.thought = 'regenerating';
                    } else if (++e.retreatTries > 2) {
                        e.intent = 'rush';
                        e.thought = 'cornered - fighting';
                    } else {
                        this.pickRetreat(e);
                    }
                }
                break;
            case 'regen':
                e.stop();
                e.crouchTarget = 1;
                e.dr = cfg.regenDR;
                if (dP >= cfg.regenSafe) {
                    e.hp = Math.min(e.maxHp, e.hp + cfg.regenRate * dt);
                    e.regrowShell(dt, cfg.shellRegen);
                }
                if (e.seesPlayer) {
                    e.face(P.x, P.z);
                }
                break;
        }

        if (e.engaged && e.seesPlayer && (e.intent === 'rush' || e.intent === 'flank' || e.intent === 'chase') &&
            dP > 4.5 && dP < 24 && now > e.anticT && e.cool('block') && e.shieldsLeft() > 0) {
            const bare = e.faceBare();
            const aimed = this.aimedAt(e, bare ? 0.96 : 0.975);
            e.anticT = now + (bare ? 0.35 : 0.5);
            if (Math.random() < (aimed ? (bare ? 0.8 : 0.45) : (bare ? 0.25 : 0.05))) {
                this.guard(e, 'high', aimed ? (bare ? 'face is bare and you are aiming at it - covering up' : 'you are aiming at me - shields up') : 'bracing behind my fists', true);
                e.blockT = bare ? 1.4 + Math.random() * 0.8 : 1 + Math.random() * 0.6;
            }
        }

        if (e.duckT > 0) {
            e.crouchTarget = 1;
            e.want.multiplyScalar(0.5);
        }
        if (e.blockT > 0) {
            e.want.multiplyScalar(e.blockAdvance ? 0.7 : 0.45);
            e.face(P.x, P.z);
            e.strafe = true;
        } else if (e.underFire > 0 && !lone && (e.intent === 'rush' || e.intent === 'flank') && dP > 8) {
            e.crouchTarget = Math.max(e.crouchTarget, 0.4);
            e.want.multiplyScalar(0.85);
        }
        if (e.staggerT > 0) {
            e.want.multiplyScalar(0.3);
        }
    }

    search(e, dt, now, mem, run) {
        const cfg = this.cfg;
        if (e.searchPause > 0) {
            e.searchPause -= dt;
            e.stop();
            e.faceYaw += Math.sin(now * 1.7 + e.seed) * dt * 2;
            e.thought = 'searching - looking around';
            return;
        }
        const claimed = (x, z) => !!e.pack && e.pack.members.some(m => m !== e && m.intent === 'search' && m.goalSet &&
            Math.hypot(m.goal.x - x, m.goal.z - z) < 3);
        if (e.goalSet && e.searchStage < 2 && e.goalT > 0.5 && mem.searchedNear(e.goal.x, e.goal.z, 2)) {
            e.goalSet = false;
            e.searchStage++;
        }
        if (!e.goalSet) {
            e.goalT = 0;
            if (e.searchStage === 0 && !mem.searchedNear(mem.seen.pos.x, mem.seen.pos.z) && !claimed(mem.seen.pos.x, mem.seen.pos.z)) {
                e.goal.copy(mem.seen.pos);
                e.thought = 'running to where I last sensed you';
            } else if (e.searchStage <= 1 && !mem.searchedNear(mem.predict(now, _sv2).x, _sv2.z) && !claimed(_sv2.x, _sv2.z)) {
                e.goal.copy(_sv2);
                e.searchStage = 1;
                e.thought = 'running to where you were heading';
            } else {
                this.pickSweep(e, mem, now);
                e.searchStage = Math.max(2, e.searchStage);
                e.thought = 'sweeping places you could hide';
            }
            e.goalSet = true;
        }
        e.goalT += dt;
        const speed = e.searchStage < 2 ? run * 0.9 : cfg.jog;
        if (e.navTo(e.goal.x, e.goal.z, speed, now) < 1.3 || e.goalT > 12) {
            mem.mark(e.goal.x, e.goal.z);
            e.searchStage++;
            e.goalSet = false;
            e.searchPause = 0.6 + Math.random() * 0.7;
        }
    }

    pickSweep(e, mem, now) {
        const nav = Enemies.nav;
        const c = mem.predict(now, _sv2);
        const from = mem.seen.pos;
        const claimed = e.pack ? e.pack.members.filter(m => m !== e && m.intent === 'search' && m.goalSet).map(m => m.goal) : [];
        const i = nav.scan(c.x, c.z, 2, 14, k => {
            const x = nav.cx(k);
            const z = nav.cz(k);
            let s = Math.random() * 2 - Math.hypot(x - e.pos.x, z - e.pos.z) * 0.12;
            if (mem.searchedNear(x, z, 3)) {
                s -= 8;
            }
            if (!nav.sight(from.x, from.y + 1.5, from.z, x, nav.h[k] + 1, z)) {
                s += 5;
            }
            for (const o of claimed) {
                if (Math.hypot(o.x - x, o.z - z) < 4) {
                    s -= 6;
                }
            }
            return s;
        }, 30);
        if (i >= 0) {
            e.goal.set(nav.cx(i), nav.h[i], nav.cz(i));
        } else {
            e.goal.copy(c);
        }
    }

    pickRoam(e) {
        const nav = Enemies.nav;
        const mem = this.memOf(e);
        const prowl = e.alertFloor > 0 && mem.known();
        const c = prowl ? mem.seen.pos : e.home;
        const i = nav.scan(c.x, c.z, 3, prowl ? 18 : 10, k => {
            if (Math.abs(nav.h[k] - e.pos.y) > 1.7) {
                return -Infinity;
            }
            let s = Math.random() * 3;
            if (prowl && mem.searchedNear(nav.cx(k), nav.cz(k), 4)) {
                s -= 2;
            }
            return s;
        }, 14);
        if (i >= 0) {
            e.goal.set(nav.cx(i), nav.h[i], nav.cz(i));
            e.goalSet = true;
        } else {
            e.goal.copy(e.pos);
        }
    }

    mayAttack(e) {
        const p = e.pack;
        if (!p || p.mood === 'bloodlust') {
            return true;
        }
        let busy = 0;
        for (const m of p.members) {
            if (m !== e && !m.dead && m.action && (m.action.name === 'swipe' || m.action.name === 'lunge' || m.action.name === 'bash')) {
                busy++;
            }
        }
        return busy < this.cfg.attackers;
    }

    approach(e, speed, now) {
        if (now > e.arcT) {
            e.arcT = now + 0.5;
            if (e.underFire > 0 && now > e.weaveT) {
                e.side = -e.side;
                e.weaveT = now + 1 + Math.random() * 0.7;
            }
            const nav = Enemies.nav;
            const P = Player.pos;
            const dx = e.pos.x - P.x;
            const dz = e.pos.z - P.z;
            const d = Math.hypot(dx, dz);
            const a = Math.atan2(dx, dz) + e.side * this.cfg.arc * (e.arcK || 1);
            const r = clampN(d * 0.55, 3.5, 12);
            const c = nav.nearest(P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, i => nav.open(i), 6);
            if (c >= 0) {
                e.goal.set(nav.cx(c), nav.h[c], nav.cz(c));
            } else {
                e.goal.copy(P);
            }
            e.goalSet = true;
        }
        e.navTo(e.goal.x, e.goal.z, speed, now);
    }

    circle(e, speed, dt) {
        const P = Player.pos;
        const nav = Enemies.nav;
        const dx = e.pos.x - P.x;
        const dz = e.pos.z - P.z;
        const ang = Math.atan2(dx, dz) + e.side * dt * 1.2;
        const tx = P.x + Math.sin(ang) * 3.4;
        const tz = P.z + Math.cos(ang) * 3.4;
        const c = nav.cell(tx, tz);
        if (!nav.open(c) || Math.abs(nav.h[c] - e.pos.y) > Nav.STEP) {
            e.side = -e.side;
        }
        e.steer(tx, tz, speed, false);
        e.face(P.x, P.z);
        e.strafe = true;
    }

    melee(e) {
        if (!this.mayAttack(e)) {
            return;
        }
        const P = Player.pos;
        const dx = P.x - e.pos.x;
        const dz = P.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        if (Math.abs(P.y - e.pos.y) > 1.3 || !e.onGround || e.action) {
            return;
        }
        const cfg = this.cfg;
        if (d < 2.5 && e.cool('swipe')) {
            e.blockT = 0;
            e.swipeSide = 1 - e.swipeSide;
            if (e.cool('bash') && !e.shields[e.swipeSide].broken && Math.random() < cfg.bashChance) {
                e.action = { name: 'bash', t: 0, dur: 1.05, wind: 0.42, side: e.swipeSide, hit: false, lock: true };
                e.cd.bash = cfg.bashCd;
                e.cd.swipe = 1.2;
                e.thought = 'shield bash';
                return;
            }
            e.action = { name: 'swipe', t: 0, dur: 0.9, wind: 0.36, side: e.swipeSide, hit: false, lock: true };
            e.cd.swipe = cfg.swipeCd;
            return;
        }
        if (d > cfg.lungeMin && d < cfg.lungeMax && e.cool('lunge') && e.seesPlayer) {
            e.cd.lunge = 0.6;
            const near = 1 - (d - cfg.lungeMin) / (cfg.lungeMax - cfg.lungeMin);
            if (Math.random() < 0.35 + near * 0.4 + (e.pack ? e.pack.aggression * 0.25 : 0.15)) {
                e.cd.lunge = cfg.lungeCd;
                e.blockT = 0;
                e.action = { name: 'lunge', t: 0, dur: 1.6, wind: 0.38, hit: false, fly: false, lock: true };
                e.thought = 'pouncing';
            }
        }
    }

    strike(e, dmg, knock = 0, stun = 0) {
        const p = e.pack;
        Vitals.hurt(Math.round(dmg * (1 + (p ? p.aggression : 0) * 0.3)), e.pos);
        _sv.set(Player.pos.x - e.pos.x, 0, Player.pos.z - e.pos.z).normalize();
        if (knock) {
            Player.knock(_sv, knock, stun);
            Enemies.shake(1, Player.pos);
        } else {
            Player.vel.x += _sv.x * 5;
            Player.vel.z += _sv.z * 5;
            Enemies.shake(0.4, Player.pos);
        }
        if (p) {
            p.lust = Math.min(0.8, p.lust + 0.1);
        }
    }

    runAction(e, a, dt, now) {
        const P = Player.pos;
        switch (a.name) {
            case 'howl':
            case 'screech': {
                e.stop();
                e.face(e.mem.seen.pos.x, e.mem.seen.pos.z);
                for (let i = 0; i < a.beats.length; i++) {
                    if (a.done[i] || a.t < a.beats[i]) {
                        continue;
                    }
                    a.done[i] = true;
                    e.beat = 1;
                    const col = e.moodColor();
                    _sv.set(e.pos.x, e.pos.y + e.height * 0.85, e.pos.z);
                    Enemies.fx.burst(_sv, 18, col, 2.5, 0.8, { up: 1.2, drag: 1.5 });
                    if (i === 0) {
                        a.sent = true;
                        const n = this.broadcast(e, this.cfg.comm * (a.name === 'howl' ? 1 : 0.75), now);
                        e.thought = n ? `called ${n} kin - forming an attack` : 'no kin answered - hunting alone';
                    }
                }
                if (a.t >= a.dur) {
                    e.action = null;
                }
                return true;
            }
            case 'stagger':
                e.stop();
                e.crouchTarget = 0.3 * a.k;
                if (a.t >= a.dur) {
                    e.action = null;
                    if (e.recall) {
                        e.recall = false;
                        this.call(e, true);
                    }
                }
                return true;
            case 'ack':
                e.stop();
                e.face(a.from.x, a.from.z);
                if (a.pulse && a.t >= a.pulse) {
                    a.pulse = 0;
                    e.beat = 0.8;
                    _sv.set(e.pos.x, e.pos.y + e.height * 0.85, e.pos.z);
                    CommFX.ring(_sv, e.moodColor(), 1.4, 0.6);
                }
                if (a.t >= a.dur) {
                    e.action = null;
                }
                return true;
            case 'swipe':
            case 'bash': {
                const bash = a.name === 'bash';
                const dx = P.x - e.pos.x;
                const dz = P.z - e.pos.z;
                const d = Math.hypot(dx, dz) || 1;
                if (a.t < a.wind) {
                    e.face(P.x, P.z);
                    e.stop();
                } else if (a.t < a.wind + 0.16) {
                    e.steer(P.x, P.z, bash ? 4.5 : 3);
                } else {
                    e.stop();
                }
                if (!a.hit && a.t >= a.wind + (bash ? 0.1 : 0.08)) {
                    a.hit = true;
                    const facing = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / d;
                    if (d < (bash ? 2.9 : 2.8) && facing > 0.35 && Math.abs(P.y - e.pos.y) < 1.4) {
                        if (bash) {
                            this.strike(e, this.cfg.bashDmg, this.cfg.bashKnock, this.cfg.bashStun);
                        } else {
                            this.strike(e, this.cfg.swipeDmg);
                        }
                    }
                }
                if (a.t >= a.dur) {
                    e.action = null;
                }
                return true;
            }
            case 'lunge': {
                e.stop();
                if (a.t < a.wind) {
                    e.crouchTarget = 0.85;
                    e.face(P.x, P.z);
                    return true;
                }
                if (!a.fly) {
                    a.fly = true;
                    a.coast = true;
                    const dx = P.x - e.pos.x;
                    const dz = P.z - e.pos.z;
                    const d = Math.hypot(dx, dz) || 1;
                    const vy = 3.8 + d * 0.32;
                    const sp = Math.min(13, (d - 0.6) / (2 * vy / GRAV));
                    e.vel.set(dx / d * sp, vy, dz / d * sp);
                    e.onGround = false;
                    a.flyT = a.t;
                }
                if (!a.hit && Math.hypot(P.x - e.pos.x, P.z - e.pos.z) < 1.6 && Math.abs(P.y - e.pos.y) < 1.4) {
                    a.hit = true;
                    this.strike(e, this.cfg.lungeDmg);
                    e.vel.x *= 0.2;
                    e.vel.z *= 0.2;
                }
                if (e.onGround && a.t > a.flyT + 0.15) {
                    a.coast = false;
                    a.landT = a.landT || a.t;
                    e.crouchTarget = 0.5;
                    if (a.t > a.landT + 0.45) {
                        e.action = null;
                    }
                }
                if (a.t > a.dur) {
                    e.action = null;
                }
                return true;
            }
            case 'dodge':
                e.crouchTarget = 0.4;
                if (a.t >= a.dur && e.onGround) {
                    e.action = null;
                }
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

    onHurt(e, hit, now) {
        e.recentHurt += hit.dmg;
        if (e.pos.distanceTo(Player.pos) > 9) {
            e.underFire = 1.5;
        }
        e.mem.saw(Player.pos, Player.vel, now);
        e.mem.shotFrom.pos.copy(Player.pos);
        e.mem.shotFrom.t = now;
        if (e.pack) {
            e.pack.mem.absorb(e.mem);
            e.pack.anger = Math.min(0.85, e.pack.anger + hit.dmg / 600);
        }
        if (!e.engaged) {
            this.engage(e, now, 'got shot');
            return;
        }
        const a = e.action;
        if (a && (a.lock || a.air)) {
            return;
        }
        if (e.intent === 'regen' || e.intent === 'search') {
            e.thinkT = 0;
        }
        const facing = -(hit.dir.x * Math.sin(e.yaw) + hit.dir.z * Math.cos(e.yaw));
        if (e.blockT > 0 && facing > 0.3) {
            e.blockT = Math.max(e.blockT, 0.9);
            return;
        }
        const pl = hit.plate;
        const bare = e.faceBare();
        if (pl) {
            pl.heat += 1;
            const frac = pl.broken ? 0 : pl.hp / pl.max;
            const helmGone = pl === e.helm && pl.broken;
            if (pl.front && frac < 0.6 && facing > 0.3 && e.shieldsLeft() > 0 && (e.cool('block') || helmGone)) {
                this.guard(e, pl.zone, pl.label + (pl.broken ? ' gone' : ' cracking') + ' - shields up');
                return;
            }
            if (pl.heat >= 2.5 && e.cool('dodge') && e.onGround) {
                if (pl.zone === 'high' && Math.random() < 0.4) {
                    e.duckT = 0.7;
                    e.cd.dodge = 1.4;
                    e.thought = 'ducking under the fire';
                } else {
                    this.dodge(e, pl.label + ' under focused fire - dodging');
                }
            }
        } else if (hit.flesh) {
            if (facing > 0.3 && e.shieldsLeft() > 0 && (e.cool('block') || (bare && hit.zone === 'high'))) {
                this.guard(e, hit.zone, bare && hit.zone === 'high' ? 'shot in the bare face - covering up' : 'flesh exposed - shields up');
            } else if (e.cool('dodge') && e.onGround && Math.random() < 0.5) {
                this.dodge(e, 'flesh exposed - dodging');
            }
        }
    }

    guard(e, zone, why, advance = false) {
        const bare = e.faceBare() && zone !== 'low';
        e.blockT = bare ? 2.3 : 1.7;
        e.blockZone = zone || 'high';
        e.blockAdvance = advance;
        e.cd.block = bare ? (advance ? 2 : 1.4) : (advance ? 3.5 : 2.6);
        e.thought = why;
    }

    dodge(e, why) {
        const nav = Enemies.nav;
        const P = Player.pos;
        const dx = P.x - e.pos.x;
        const dz = P.z - e.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const px = -dz / d;
        const pz = dx / d;
        let side = Math.random() < 0.5 ? 1 : -1;
        for (let k = 0; k < 2; k++, side = -side) {
            const c = nav.cell(e.pos.x + px * side * 2.2, e.pos.z + pz * side * 2.2);
            const mid = nav.cell(e.pos.x + px * side * 1.1, e.pos.z + pz * side * 1.1);
            if (nav.open(c) && nav.open(mid) && Math.abs(nav.h[c] - e.pos.y) < Nav.STEP && Math.abs(nav.h[mid] - e.pos.y) < Nav.STEP) {
                e.dash(px * side, pz * side, 6, 0.3, 'dodge', { side, lock: true });
                e.vel.y = 3.2;
                e.onGround = false;
                e.face(P.x, P.z);
                e.cd.dodge = this.cfg.dodgeCd;
                e.thought = why;
                return true;
            }
        }
        e.duckT = 0.7;
        e.cd.dodge = 1;
        e.thought = 'boxed in - ducking';
        return false;
    }

    pickRetreat(e) {
        const nav = Enemies.nav;
        const P = Player.pos;
        const eye = Enemies.player.eye;
        const safe = this.cfg.regenSafe;
        const ax = e.pos.x - P.x;
        const az = e.pos.z - P.z;
        const i = nav.scan(e.pos.x, e.pos.z, 5, 24, c => {
            const x = nav.cx(c);
            const z = nav.cz(c);
            const dp = Math.hypot(x - P.x, z - P.z);
            if (dp < safe + 2) {
                return -Infinity;
            }
            let s = Math.min(dp, 26) * 0.4 - Math.hypot(x - e.pos.x, z - e.pos.z) * 0.25;
            if ((x - e.pos.x) * ax + (z - e.pos.z) * az < 0) {
                s -= 6;
            }
            if (!nav.sight(x, nav.h[c] + 0.8, z, eye.x, eye.y, eye.z)) {
                s += 8;
            }
            return s;
        }, 40);
        if (i >= 0) {
            e.goal.set(nav.cx(i), nav.h[i], nav.cz(i));
        } else {
            const d = Math.hypot(ax, az) || 1;
            e.goal.set(e.pos.x + ax / d * 10, 0, e.pos.z + az / d * 10);
        }
        e.goalSet = true;
    }

    pickLurk(e) {
        const nav = Enemies.nav;
        const P = Player.pos;
        const eye = Enemies.player.eye;
        const i = nav.scan(P.x, P.z, 7, 12, c => {
            const x = nav.cx(c);
            const z = nav.cz(c);
            let s = -Math.hypot(x - e.pos.x, z - e.pos.z) * 0.25;
            if (!nav.sight(x, nav.h[c] + 0.9, z, eye.x, eye.y, eye.z)) {
                s += 10;
            }
            return s;
        }, 28);
        if (i >= 0) {
            e.goal.set(nav.cx(i), nav.h[i], nav.cz(i));
            e.goalSet = true;
        }
    }

    flankPoint(e, now) {
        if (now < e.spotT) {
            return;
        }
        e.spotT = now + 1.5;
        const nav = Enemies.nav;
        const P = Player.pos;
        let cx = 0;
        let cz = 0;
        let n = 0;
        for (const m of e.pack.members) {
            if (m.role === 'rush' && !m.dead) {
                cx += m.pos.x;
                cz += m.pos.z;
                n++;
            }
        }
        if (n) {
            cx /= n;
            cz /= n;
        } else {
            cx = e.pos.x;
            cz = e.pos.z;
        }
        const dx = P.x - cx;
        const dz = P.z - cz;
        const d = Math.hypot(dx, dz) || 1;
        const ux = dx / d;
        const uz = dz / d;
        const tx = P.x - uz * e.side * 7 + ux * 1.5;
        const tz = P.z + ux * e.side * 7 + uz * 1.5;
        const c = nav.nearest(tx, tz, i => nav.open(i), 8);
        if (c >= 0) {
            e.goal.set(nav.cx(c), nav.h[c], nav.cz(c));
        } else {
            e.goal.copy(P);
        }
        e.goalSet = true;
    }
}

Enemies.register('shellcap', {
    name: 'Shellcap',
    color: 0x86ff3c,
    hp: 180,
    radius: 0.5,
    height: 1.8,
    climbReach: 6,
    hearing: 1,
    move: {
        accel: 4.2,
        decel: 6.5,
        turn: 3.4,
        reach: 1.55
    },
    brain: {
        senseEvery: 0.2,
        thinkEvery: 0.3,
        sight: 40,
        cone: 1.45,
        near: 6,
        comm: 22,
        deathCall: 15,
        walk: 1.2,
        prowl: 1.7,
        jog: 2.4,
        run: 4.6,
        baseAggro: 0.38,
        lustSpeed: 1.15,
        lustDR: 0.25,
        directRange: 7,
        arc: 0.65,
        lungeMin: 3,
        lungeMax: 8.5,
        lungeCd: 3,
        swipeCd: 1.0,
        bashChance: 0.4,
        bashCd: 3.5,
        bashDmg: 14,
        bashKnock: 9,
        bashStun: 0.55,
        lurkWait: 5,
        fallBackHp: 0.5,
        fallBackChance: 0.85,
        regenSafe: 10,
        regenRate: 6,
        shellRegen: 14,
        regenDR: 0.5,
        fleshMult: 1.5,
        swipeDmg: 10,
        lungeDmg: 15,
        attackers: 3,
        dodgeCd: 2.4,
        lostAfter: 4,
        tremorRange: 45,
        tremorEvery: 3,
        searchFor: 45
    },
    mind: def => new ShellcapMind(def),
    create: (def, x, y, z) => new Shellcap(def, x, y, z)
});
