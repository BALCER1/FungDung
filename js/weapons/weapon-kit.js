const WeaponKit = {
    clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)),
    lerp: (a, b, t) => a + (b - a) * t,

    seg(t, a, b) {
        return WeaponKit.clamp((t - a) / (b - a));
    },
    hump(t, a, b) {
        return Math.sin(WeaponKit.seg(t, a, b) * Math.PI);
    },
    e(name, t, a, b) {
        return WeaponKit.ease[name](WeaponKit.seg(t, a, b));
    },

    ease: {
        linear: t => t,
        inQuad: t => t * t,
        outQuad: t => 1 - (1 - t) * (1 - t),
        inCubic: t => t * t * t,
        outCubic: t => 1 - Math.pow(1 - t, 3),
        inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
        outBack: t => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        },
        outElastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1)
    },

    noise(x, y, z) {
        return (
            Math.sin(x * 1.3 + Math.sin(y * 1.7) * 1.2) * Math.cos(y * 1.1 + Math.sin(z * 1.9)) +
            Math.sin(z * 1.5 + Math.cos(x * 0.9) * 1.3)
        ) * 0.5;
    },

    rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    grow(mesh, p) {
        const { tub, rad } = mesh.userData.tube;
        const segs = Math.floor(WeaponKit.clamp(p) * tub);
        mesh.geometry.setDrawRange(0, segs * rad * 6);
        mesh.visible = segs > 0;
    },

    rand: (a, b) => a + Math.random() * (b - a),

    sphereDir(out = new THREE.Vector3()) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        return out.set(Math.cos(a) * s, u, Math.sin(a) * s);
    },

    cone(dir, spread, out = new THREE.Vector3()) {
        const r = spread * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        return out.set(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(q);
    }
};

class Spring {
    constructor(stiffness = 220, damping = 16) {
        this.k = stiffness;
        this.c = damping;
        this.x = 0;
        this.v = 0;
    }
    kick(v) {
        this.v += v;
    }
    update(dt) {
        let left = dt;
        while (left > 0) {
            const h = Math.min(left, 1 / 120);
            this.v += (-this.k * this.x - this.c * this.v) * h;
            this.x += this.v * h;
            left -= h;
        }
    }
}

class WeaponBuilder {
    constructor() {
        this.mats = {};
        this.parts = [];
        this.grips = {};
        this.lod = DETAIL.guns;
    }

    n(count, min = 3) {
        return DETAIL.seg(this.lod, count, min);
    }

    mat(key, opts) {
        if (!this.mats[key]) {
            this.mats[key] = DETAIL.litMaterial(opts);
        }
        return this.mats[key];
    }
    glow(key, color, intensity = 1, opts = {}) {
        return this.mat(key, Object.assign({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }, opts));
    }
    glass(key, color = 0xffffff, opacity = 0.28) {
        return this.mat(key, { color, transparent: true, opacity, roughness: 0.08, depthWrite: false, side: THREE.DoubleSide });
    }

    place(obj, parent, pos, rot, scale) {
        if (pos) {
            obj.position.set(pos[0], pos[1], pos[2]);
        }
        if (rot) {
            obj.rotation.set(rot[0], rot[1], rot[2]);
        }
        if (scale !== undefined && scale !== null) {
            if (typeof scale === 'number') {
                obj.scale.setScalar(scale);
            } else {
                obj.scale.set(scale[0], scale[1], scale[2]);
            }
        }
        if (parent) {
            parent.add(obj);
        }
        return obj;
    }
    group(parent, pos, rot, scale) {
        return this.place(new THREE.Group(), parent, pos, rot, scale);
    }
    mesh(geo, mat, parent, pos, rot, scale) {
        return this.place(new THREE.Mesh(geo, mat), parent, pos, rot, scale);
    }
    part(obj) {
        obj.userData.rest = {
            p: obj.position.clone(),
            r: obj.rotation.clone(),
            s: obj.scale.clone(),
            v: obj.visible
        };
        this.parts.push(obj);
        return obj;
    }

    grip(name, parent, pos, o = {}) {
        const g = this.group(parent, pos);
        HandKit.basis(o.fingers || [0, 0, -1], o.back || [0, 1, 0], g.quaternion);
        if (o.around !== undefined) {
            g.position.add(new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion).multiplyScalar(o.around + HandKit.PALM));
        }
        g.userData.grip = { curl: o.curl === undefined ? 0.85 : o.curl };
        g.name = 'grip:' + name;
        this.grips[name] = g;
        return g;
    }

    displace(geo, fn) {
        const pos = geo.attributes.position;
        const nor = geo.attributes.normal;
        const v = new THREE.Vector3();
        const n = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            n.fromBufferAttribute(nor, i);
            const d = fn(v, n);
            pos.setXYZ(i, v.x + n.x * d, v.y + n.y * d, v.z + n.z * d);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
    }
    wobble(geo, amp, freq = 40, seed = 0) {
        const pos = geo.attributes.position;
        const N = WeaponKit.noise;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i) * freq + seed;
            const y = pos.getY(i) * freq;
            const z = pos.getZ(i) * freq - seed;
            pos.setXYZ(
                i,
                pos.getX(i) + amp * N(x, y, z),
                pos.getY(i) + amp * N(y + 31, z, x),
                pos.getZ(i) + amp * N(z - 17, x, y + 67)
            );
        }
        pos.needsUpdate = true;
        return geo;
    }

    tubeZ(rFront, rBack, len, mat, parent, pos, opts = {}) {
        const geo = new THREE.CylinderGeometry(
            rFront, rBack, len,
            this.n(opts.seg || 16),
            this.n(opts.hseg || Math.max(1, Math.round(len / 0.04)), 1),
            !!opts.open,
            Math.PI
        );
        geo.rotateX(-Math.PI / 2);
        if (opts.wobble) {
            this.wobble(geo, opts.wobble, opts.freq || 40, opts.seed || 0);
        }
        return this.mesh(geo, mat, parent, pos, opts.rot, opts.scale);
    }
    sphere(r, mat, parent, pos, scale, opts = {}) {
        const geo = new THREE.SphereGeometry(r, this.n(opts.ws || 18, 4), this.n(opts.hs || 12, 2), 0, Math.PI * 2, opts.t0 || 0, opts.tl || Math.PI);
        if (opts.wobble) {
            this.wobble(geo, opts.wobble, opts.freq || 40, opts.seed || 0);
        }
        return this.mesh(geo, mat, parent, pos, opts.rot, scale);
    }
    ring(r, tube, mat, parent, pos, rot, opts = {}) {
        const geo = new THREE.TorusGeometry(r, tube, this.n(opts.rs || 8), this.n(opts.ts || 28, 4), opts.arc || Math.PI * 2);
        return this.mesh(geo, mat, parent, pos, rot, opts.scale);
    }
    disc(r, mat, parent, pos, rot) {
        return this.mesh(new THREE.CircleGeometry(r, this.n(20, 5)), mat, parent, pos, rot);
    }
    lathe(points, mat, parent, pos, rot, opts = {}) {
        const geo = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), this.n(opts.seg || 24, 4));
        return this.mesh(geo, mat, parent, pos, rot, opts.scale);
    }
    box(w, h, d, mat, parent, pos, rot) {
        return this.mesh(new THREE.BoxGeometry(w, h, d), mat, parent, pos, rot);
    }

    tube(points, r0, r1, mat, parent, opts = {}) {
        const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
        const tub = this.n(opts.seg || 24, 2);
        const rad = this.n(opts.radial || 8);
        const geo = new THREE.TubeGeometry(curve, tub, 1, rad, false);
        const pos = geo.attributes.position;
        const c = new THREE.Vector3();
        const v = new THREE.Vector3();
        for (let i = 0; i <= tub; i++) {
            curve.getPointAt(i / tub, c);
            const r = WeaponKit.lerp(r0, r1, i / tub);
            for (let j = 0; j <= rad; j++) {
                const k = i * (rad + 1) + j;
                v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
                pos.setXYZ(k, v.x, v.y, v.z);
            }
        }
        pos.needsUpdate = true;
        if (opts.wobble) {
            this.wobble(geo, opts.wobble, opts.freq || 40, opts.seed || 0);
        }
        const m = this.mesh(geo, mat, parent);
        m.userData.tube = { tub, rad, curve, r0, r1 };
        if (opts.ends) {
            const a = points[0];
            const b = points[points.length - 1];
            this.sphere(r0, mat, parent, a, null, { ws: 10, hs: 8 });
            this.sphere(r1, mat, parent, b, null, { ws: 10, hs: 8 });
        }
        return m;
    }

    rbox(w, h, d, r, mat, parent, pos, rot) {
        if (this.lod === 'potato') {
            return this.box(w, h, d, mat, parent, pos, rot);
        }
        const fine = this.lod === 'high';
        const bev = Math.min(r * 0.5, w * 0.2, h * 0.2, d * 0.2);
        const W = w - 2 * bev;
        const H = h - 2 * bev;
        const R = Math.min(r, W / 2, H / 2);
        const s = new THREE.Shape();
        s.moveTo(-W / 2 + R, -H / 2);
        s.lineTo(W / 2 - R, -H / 2);
        s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
        s.lineTo(W / 2, H / 2 - R);
        s.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2);
        s.lineTo(-W / 2 + R, H / 2);
        s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R);
        s.lineTo(-W / 2, -H / 2 + R);
        s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
        const geo = new THREE.ExtrudeGeometry(s, {
            depth: Math.max(0.0001, d - 2 * bev), bevelEnabled: true,
            bevelThickness: bev, bevelSize: bev, bevelSegments: fine ? 2 : 1, curveSegments: fine ? 4 : 2
        });
        geo.center();
        return this.mesh(geo, mat, parent, pos, rot);
    }

    cap(r, h, mat, gillMat, parent, pos, rot, opts = {}) {
        const g = this.group(parent, pos, rot, opts.scale);
        const seg = opts.seg || 26;
        const flat = opts.flat === undefined ? 0.8 : opts.flat;
        const pts = [[r * 0.92, -h * 0.14]];
        const rows = this.n(12);
        for (let i = 0; i <= rows; i++) {
            const a = (i / rows) * Math.PI / 2;
            pts.push([r * Math.pow(Math.cos(a), flat), h * Math.sin(a)]);
        }
        const dome = this.lathe(pts, mat, g, null, null, { seg });
        if (opts.wobble) {
            this.wobble(dome.geometry, opts.wobble, opts.freq || 60, opts.seed || 0);
        }
        if (gillMat) {
            const stemR = opts.stemR === undefined ? r * 0.18 : opts.stemR;
            this.lathe([[stemR, h * 0.3], [r * 0.6, h * 0.08], [r * 0.92, -h * 0.14]], gillMat, g, null, null, { seg });
            const fins = opts.fins === undefined ? (r > 0.03 ? 20 : 0) : opts.fins;
            const n = this.lod === 'potato' ? 0 : this.lod === 'medium' ? Math.round(fins / 2) : fins;
            if (n) {
                const len = r * 0.92 - stemR;
                const finGeo = new THREE.BoxGeometry(len, h * 0.16, Math.max(0.0012, r * 0.018));
                const slope = Math.atan2(h * 0.44, len);
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2;
                    const mid = stemR + len / 2;
                    this.mesh(finGeo, gillMat, g, [Math.cos(a) * mid, h * 0.04, Math.sin(a) * mid], [0, -a, slope]);
                }
            }
        }
        g.userData.capInfo = { r, h, flat };
        return g;
    }

    spots(capGroup, count, mat, size, seed = 1, minA = 0.2, maxA = 1.42) {
        const { r, h, flat } = capGroup.userData.capInfo;
        const rnd = WeaponKit.rng(seed);
        const geo = new THREE.SphereGeometry(1, this.n(8, 4), this.n(6, 2));
        const up = new THREE.Vector3(0, 1, 0);
        const out = [];
        for (let i = 0; i < count; i++) {
            const a = WeaponKit.lerp(minA, maxA, Math.sqrt((i + 0.5) / count));
            const phi = i * 2.39996 + seed + rnd() * 0.5;
            const ca = Math.pow(Math.cos(a), flat);
            const p = new THREE.Vector3(r * ca * Math.cos(phi), h * Math.sin(a), r * ca * Math.sin(phi));
            const n = new THREE.Vector3(p.x / (r * r), p.y / (h * h), p.z / (r * r)).normalize();
            const s = size * (0.6 + rnd() * 0.8);
            const m = this.mesh(geo, mat, capGroup, null, null, [s, s * 0.38, s]);
            m.position.copy(p).addScaledVector(n, -s * 0.05);
            m.quaternion.setFromUnitVectors(up, n);
            out.push(m);
        }
        return out;
    }

    mini(parent, pos, size, capMat, stemMat, rot) {
        const g = this.group(parent, pos, rot);
        this.mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.3, size * 0.9, this.n(8)), stemMat, g, [0, size * 0.45, 0]);
        this.cap(size * 0.62, size * 0.42, capMat, null, g, [0, size * 0.85, 0], null, { seg: 14 });
        return g;
    }

    flash(parent, pos, color, size = 0.05, intensity = 3) {
        const g = this.group(parent, pos);
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const geo = new THREE.IcosahedronGeometry(1, 0);
        const core = this.mesh(geo, mat, g);
        const spike = this.mesh(geo, mat, g);
        core.visible = spike.visible = false;
        const light = new THREE.PointLight(color, 0, 2.5, 2);
        if (DETAIL.lighting === 'high') {
            g.add(light);
        }
        return { group: g, core, spike, light, size, intensity, age: 9 };
    }
}

class SporeFX {
    constructor(local, worldParent) {
        this.local = local;
        this.worldParent = worldParent || null;
        this.live = [];
        this.pools = { dot: [], ring: [] };
        this.geos = {
            dot: new THREE.IcosahedronGeometry(1, DETAIL.guns === 'high' ? 1 : 0),
            ring: new THREE.TorusGeometry(1, 0.07, DETAIL.seg(DETAIL.guns, 6), DETAIL.seg(DETAIL.guns, 32, 6))
        };
        this.max = 500;
        this.layer = 0;
        this.acc = {};
        this._v = new THREE.Vector3();
        this._q = new THREE.Quaternion();
        this._z = new THREE.Vector3(0, 0, 1);
    }

    rate(key, perSecond, dt) {
        this.acc[key] = (this.acc[key] || 0) + perSecond * dt;
        const n = Math.floor(this.acc[key]);
        this.acc[key] -= n;
        return n;
    }

    emit(o) {
        const shape = o.shape || 'dot';
        if (this.live.length >= this.max * DETAIL.particles || (shape === 'dot' && DETAIL.skip())) {
            return null;
        }
        let p = this.pools[shape].pop();
        if (!p) {
            const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
            p = { mesh: new THREE.Mesh(this.geos[shape], mat), shape, pos: new THREE.Vector3(), vel: new THREE.Vector3() };
            p.mesh.frustumCulled = false;
        }
        const mat = p.mesh.material;
        mat.color.set(o.color === undefined ? 0xffffff : o.color);
        mat.blending = o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;

        p.pos.copy(o.pos);
        p.vel.copy(o.vel || this._v.set(0, 0, 0));
        let parent = this.local;
        if (o.world) {
            if (this.worldParent) {
                parent = this.worldParent;
                this.worldParent.worldToLocal(p.pos);
            } else {
                this.local.worldToLocal(p.pos);
                this.local.getWorldQuaternion(this._q).invert();
                p.vel.applyQuaternion(this._q);
            }
        }
        if (p.mesh.parent !== parent) {
            parent.add(p.mesh);
        }
        p.mesh.layers.set(parent === this.local ? this.layer : 0);
        p.mesh.visible = true;
        p.age = 0;
        p.life = o.life || 0.6;
        p.size = o.size || 0.01;
        p.sizeEnd = o.sizeEnd === undefined ? p.size * 0.3 : o.sizeEnd;
        p.opacity = o.opacity === undefined ? 1 : o.opacity;
        p.gravity = o.gravity || 0;
        p.drag = o.drag === undefined ? 1.5 : o.drag;
        p.attract = o.attract || null;
        p.pull = o.pull || 0;
        p.swirl = o.swirl || 0;
        p.stretch = o.stretch || 0;
        p.fadeIn = o.fadeIn === undefined ? 0.04 : o.fadeIn;
        if (shape === 'ring' && o.dir) {
            p.mesh.quaternion.setFromUnitVectors(this._z, this._v.copy(o.dir).normalize());
        } else {
            p.mesh.quaternion.identity();
        }
        this.live.push(p);
        return p;
    }

    update(dt) {
        const v = this._v;
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            p.age += dt;
            let t = p.age / p.life;
            if (p.attract) {
                v.copy(p.attract).sub(p.pos);
                const d = v.length();
                if (d < 0.01) {
                    t = 1;
                } else {
                    v.multiplyScalar(1 / d);
                    p.vel.addScaledVector(v, p.pull * dt * (1 + 0.3 / (d + 0.05)));
                    p.vel.x += -v.z * p.swirl * dt;
                    p.vel.z += v.x * p.swirl * dt;
                }
            }
            if (t >= 1) {
                this.kill(i);
                continue;
            }
            p.vel.y -= p.gravity * dt;
            p.vel.multiplyScalar(Math.exp(-p.drag * dt));
            p.pos.addScaledVector(p.vel, dt);
            const s = WeaponKit.lerp(p.size, p.sizeEnd, t);
            p.mesh.position.copy(p.pos);
            if (p.stretch && p.shape === 'dot') {
                const sp = p.vel.length();
                if (sp > 0.001) {
                    p.mesh.quaternion.setFromUnitVectors(this._z, v.copy(p.vel).multiplyScalar(1 / sp));
                }
                p.mesh.scale.set(s, s, s + sp * p.stretch);
            } else {
                p.mesh.scale.setScalar(s);
            }
            p.mesh.material.opacity = p.opacity * Math.min(1, p.age / p.fadeIn) * (1 - t * t);
        }
    }

    kill(i) {
        const p = this.live[i];
        p.mesh.visible = false;
        this.live.splice(i, 1);
        this.pools[p.shape].push(p);
    }

    clear() {
        for (let i = this.live.length - 1; i >= 0; i--) {
            this.kill(i);
        }
    }

    dispose() {
        this.clear();
        for (const k in this.pools) {
            for (const p of this.pools[k]) {
                if (p.mesh.parent) {
                    p.mesh.parent.remove(p.mesh);
                }
                p.mesh.material.dispose();
            }
            this.pools[k].length = 0;
        }
        this.geos.dot.dispose();
        this.geos.ring.dispose();
    }
}

class SporeProjectiles {
    constructor(fx) {
        this.fx = fx;
        this.live = [];
        this.pool = [];
        this.texCache = {};
        this.max = 64;
        this.geo = SporeProjectiles.quad();
        this.body = new THREE.CylinderGeometry(1, 1, 1, DETAIL.seg(DETAIL.guns, 10, 4), 1).rotateX(Math.PI / 2);
        this._a = new THREE.Vector3();
        this._p = new THREE.Vector3();
        this._z = new THREE.Vector3(0, 0, 1);
    }

    static quad() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        return g;
    }

    static billboard(renderer, scene, camera) {
        const s = this.userData.seg;
        const B = SporeProjectiles._bb || (SporeProjectiles._bb = {
            cam: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(),
            z: new THREE.Vector3(), sc: new THREE.Vector3()
        });
        const len = B.z.subVectors(s.tail, s.head).length();
        if (len < 1e-4 || s.width <= 0) {
            this.matrixWorld.makeScale(0, 0, 0);
            return;
        }
        B.z.multiplyScalar(1 / len);
        B.cam.setFromMatrixPosition(camera.matrixWorld).sub(s.head);
        B.x.crossVectors(B.z, B.cam);
        if (B.x.lengthSq() < 1e-10) {
            B.x.set(0, 1, 0).cross(B.z);
            if (B.x.lengthSq() < 1e-10) {
                B.x.set(1, 0, 0);
            }
        }
        B.x.normalize();
        B.y.crossVectors(B.z, B.x);
        this.matrixWorld.makeBasis(B.x, B.y, B.z).scale(B.sc.set(s.width, 1, len)).setPosition(s.head);
    }

    trailTex(color, core) {
        const key = color + ':' + core;
        if (this.texCache[key]) {
            return this.texCache[key];
        }
        const c = new THREE.Color(color);
        const h = new THREE.Color(core);
        const W = 16;
        const H = 128;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(W, H);
        const d = img.data;
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            const along = Math.pow(1 - v, 1.4);
            const w = 1 - v * 0.5;
            for (let x = 0; x < W; x++) {
                const u = Math.abs((x + 0.5) / W * 2 - 1);
                const body = WeaponKit.clamp((w - u) / 0.15) * along;
                const hot = Math.exp(-Math.pow(u / (w * 0.35), 2)) * along * (1 - v * 0.7);
                const i = (y * W + x) * 4;
                d[i] = Math.min(255, (c.r * body + h.r * hot) * 255);
                d[i + 1] = Math.min(255, (c.g * body + h.g * hot) * 255);
                d[i + 2] = Math.min(255, (c.b * body + h.b * hot) * 255);
                d[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(cv);
        t.flipY = false;
        this.texCache[key] = t;
        return t;
    }

    static neonMat() {
        return new THREE.ShaderMaterial({
            uniforms: { color: { value: new THREE.Color() }, core: { value: new THREE.Color() } },
            vertexShader: `
                varying vec3 vN;
                varying vec3 vV;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    vN = normalize(normalMatrix * normal);
                    vV = normalize(-mv.xyz);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform vec3 color;
                uniform vec3 core;
                varying vec3 vN;
                varying vec3 vV;
                void main() {
                    float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
                    gl_FragColor = vec4(mix(color, core, pow(f, 3.0) * 0.85), 1.0);
                }`
        });
    }

    make() {
        const tmat = new THREE.MeshBasicMaterial({
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        tmat.fog = false;
        tmat.toneMapped = false;
        const trail = new THREE.Mesh(this.geo, tmat);
        trail.frustumCulled = false;
        trail.userData.seg = { head: new THREE.Vector3(), tail: new THREE.Vector3(), width: 0 };
        trail.onBeforeRender = SporeProjectiles.billboard;

        const body = new THREE.Mesh(this.body, SporeProjectiles.neonMat());
        body.frustumCulled = false;
        return {
            trail,
            body,
            from: new THREE.Vector3(),
            dir: new THREE.Vector3(),
            pos: new THREE.Vector3(),
            side: new THREE.Vector3(),
            up: new THREE.Vector3(),
            normal: new THREE.Vector3()
        };
    }

    spawn(from, to, cfg, hit) {
        const parent = this.fx.worldParent;
        if (!parent || this.live.length >= this.max) {
            return;
        }
        const p = this.pool.pop() || this.make();
        p.trail.material.map = this.trailTex(cfg.trailColor || cfg.color, cfg.core || 0xffffff);
        p.trail.material.opacity = cfg.trailOpacity === undefined ? 1 : cfg.trailOpacity;
        p.body.material.uniforms.color.value.set(cfg.color);
        p.body.material.uniforms.core.value.set(cfg.core || 0xffffff);
        parent.add(p.trail);
        parent.add(p.body);
        p.trail.visible = p.body.visible = true;
        p.cfg = cfg;
        p.hit = hit || null;
        p.from.copy(from);
        p.dir.copy(to).sub(from);
        p.dist = Math.max(0.01, p.dir.length());
        p.dir.multiplyScalar(1 / p.dist);
        p.side.set(0, 1, 0).cross(p.dir);
        if (p.side.lengthSq() < 1e-6) {
            p.side.set(1, 0, 0);
        }
        p.side.normalize();
        p.up.copy(p.dir).cross(p.side).normalize();
        if (p.hit && p.hit.normal) {
            p.normal.copy(p.hit.normal);
        } else {
            p.normal.copy(p.dir).negate();
        }
        p.body.quaternion.setFromUnitVectors(this._z, p.dir);
        p.travelled = 0;
        p.tailD = 0;
        p.age = 0;
        p.done = false;
        p.phase = Math.random() * Math.PI * 2;
        p.pos.copy(from);
        this.live.push(p);
    }

    at(p, d, out) {
        out.copy(p.from).addScaledVector(p.dir, d);
        const w = p.cfg.wobble;
        if (w) {
            const fade = Math.min(1, d / 2);
            out.addScaledVector(p.side, Math.sin(d * 2.2 + p.phase) * w * fade);
            out.addScaledVector(p.up, Math.cos(d * 1.7 + p.phase) * w * 0.6 * fade);
        }
        return out;
    }

    update(dt) {
        const K = WeaponKit;
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            const c = p.cfg;
            p.age += dt;

            if (!p.done) {
                p.travelled = Math.min(p.dist, p.travelled + c.speed * dt);
                if (p.travelled >= p.dist || p.age > 4) {
                    p.done = true;
                    p.body.visible = false;
                    this.impact(p);
                }
            }
            this.at(p, p.travelled, p.pos);

            const len = c.length || 0.2;
            const r = c.radius || 0.015;
            const grow = 0.4 + 0.6 * K.clamp(p.travelled);
            p.body.position.copy(p.pos).addScaledVector(p.dir, -len * grow * 0.5);
            p.body.scale.set(r * grow, r * grow, len * grow);

            const head = Math.max(0, p.travelled - (p.done ? 0 : len * grow));
            p.tailD = Math.max(p.tailD, head - (c.tail || 1.5));
            if (p.done) {
                p.tailD = Math.min(head, p.tailD + c.speed * dt);
            }
            const seg = p.trail.userData.seg;
            this.at(p, head, seg.head);
            this.at(p, p.tailD, seg.tail);
            seg.width = (c.trailWidth || r * 2) * grow;
            p.trail.position.copy(seg.head);

            if (p.done && p.tailD >= head - 1e-3) {
                this.recycle(i);
            }
        }
    }

    impact(p) {
        if (!p.hit) {
            return;
        }
        const c = p.cfg;
        const imp = c.impact || {};
        const fx = this.fx;
        const K = WeaponKit;
        const count = imp.sparks === undefined ? 3 : imp.sparks;
        const size = imp.size || 0.012;
        for (let i = 0; i < count; i++) {
            const v = K.sphereDir(this._p).multiplyScalar(0.8).addScaledVector(p.normal, 1.4).multiplyScalar(K.rand(0.8, 1.6));
            fx.emit({ world: true, pos: p.pos, vel: v, life: K.rand(0.15, 0.3), size, sizeEnd: 0, color: i % 2 ? (c.core || 0xffffff) : c.color, drag: 4, gravity: 3, stretch: 0.03 });
        }
        if (imp.ring) {
            const at = this._a.copy(p.pos).addScaledVector(p.normal, 0.03);
            fx.emit({ world: true, shape: 'ring', pos: at, dir: p.normal, vel: this._p.set(0, 0, 0), life: 0.3, size: size * 2, sizeEnd: imp.ring, color: c.color, opacity: 0.9 });
        }
    }

    recycle(i) {
        const p = this.live[i];
        p.trail.visible = p.body.visible = false;
        this.live.splice(i, 1);
        this.pool.push(p);
    }

    clear() {
        for (let i = this.live.length - 1; i >= 0; i--) {
            this.recycle(i);
        }
    }

    dispose() {
        this.clear();
        for (const p of this.pool) {
            for (const m of [p.trail, p.body]) {
                if (m.parent) {
                    m.parent.remove(m);
                }
                m.material.dispose();
            }
        }
        this.pool.length = 0;
        for (const k in this.texCache) {
            this.texCache[k].dispose();
        }
        this.texCache = {};
        this.geo.dispose();
        this.body.dispose();
    }
}

const _wv = new THREE.Vector3();
const _wq = new THREE.Quaternion();

class Weapon {
    constructor(id, opts = {}) {
        const def = Weapons.get(id);
        if (!def) {
            throw new Error('Unknown weapon: ' + id);
        }
        this.id = id;
        this.def = def;
        this.name = def.name;
        this.stats = Object.assign({
            mag: 10, rate: 5, auto: true, damage: 10, pellets: 1, spread: 0,
            reloadTime: 2, drawTime: 0.45, range: 100,
            kick: { back: 0.04, up: 0.06, roll: 0.01 }
        }, def.stats);

        this.b = new WeaponBuilder();
        this.root = new THREE.Group();
        this.root.name = 'weapon:' + id;
        this.root.position.fromArray(def.offset || [0.2, -0.2, -0.42]);
        this.root.scale.setScalar(def.scale || 1);
        this.rig = new THREE.Group();
        this.root.add(this.rig);

        this.data = {};
        this.hands = null;
        this.parts = def.build(this.b, this);
        this.grips = this.b.grips;
        this.rig.add(this.parts.model);
        for (const o of this.parts.rigExtras || []) {
            this.rig.add(o);
        }
        this.fx = new SporeFX(this.rig, opts.worldParent);
        this.projectiles = new SporeProjectiles(this.fx);
        this.onShot = opts.onShot || null;
        this.trace = opts.trace || null;
        this.view = null;

        this.ammo = this.stats.mag;
        this.reloadFrom = this.ammo;
        this.shots = 0;
        this.lastSide = 0;
        this.time = 0;
        this.timeScale = 1;
        this.trigger = false;
        this.buffer = 0;
        this.cooldown = 0;
        this.fireT = 99;
        this.prevFireT = 99;
        this.altHeld = false;
        this.lastMode = 'primary';
        this.zoom = 0;
        this.steady = 0;
        this.spreadScale = 1;
        this.smooth = 0;
        this.rigVel = new THREE.Vector3();
        this._prevRig = new THREE.Vector3();
        this.setState('draw', false);

        this.move = {};
        this.moveBlend = 0;
        this.sprintBlend = 0;
        this.airBlend = 0;
        this.bobPhase = 0;
        this.swayX = new Spring(90, 11);
        this.swayY = new Spring(90, 11);
        this.recoilZ = new Spring(240, 20);
        this.recoilX = new Spring(200, 17);
        this.recoilR = new Spring(160, 14);

        for (const o of this.b.parts) {
            o.userData.prev = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
        }
        if (def.init) {
            def.init(this);
        }
    }

    setTrigger(down) {
        if (down && !this.trigger) {
            this.buffer = 0.18;
        }
        this.trigger = down;
    }
    setAlt(down) {
        if (down && !this.altHeld) {
            this.altHeld = true;
            if (this.state === 'inspect') {
                this.setState('ready');
            }
            if (this.def.altPress && !this.move.sprinting) {
                this.def.altPress(this);
            }
        } else if (!down && this.altHeld) {
            this.altHeld = false;
            if (this.def.altRelease) {
                this.def.altRelease(this);
            }
        }
    }
    inspect() {
        if (this.state === 'ready' && this.def.inspect && this.cooldown <= 0) {
            this.setState('inspect');
            return true;
        }
        return false;
    }
    get inspectT() {
        return this.state === 'inspect' ? this.actT : -1;
    }
    reload() {
        if (this.state === 'inspect') {
            this.setState('ready');
        }
        if (this.state === 'ready' && this.ammo < this.stats.mag) {
            this.reloadFrom = this.ammo;
            this.setState('reload');
            return true;
        }
        return false;
    }
    equip() {
        this.trigger = false;
        this.buffer = 0;
        this.altHeld = false;
        this.zoom = 0;
        this.steady = 0;
        this.spreadScale = 1;
        if (this.def.cancel) {
            this.def.cancel(this);
        }
        this.setState('draw', false);
    }
    look(dx, dy) {
        this.swayX.kick(WeaponKit.clamp(-dx * 0.0011, -0.25, 0.25));
        this.swayY.kick(WeaponKit.clamp(-dy * 0.0011, -0.25, 0.25));
    }
    get reloading() {
        return this.state === 'reload';
    }
    get reloadProgress() {
        return this.state === 'reload' ? WeaponKit.clamp(this.actT / this.stats.reloadTime) : 0;
    }

    setHands(hands) {
        if (this.hands === hands) {
            return;
        }
        if (this.hands && this.hands.space === this.rig) {
            this.hands.unmount();
        }
        this.hands = hands;
        if (hands) {
            hands.mount(this.rig, { grips: this.grips, layer: this.view ? this.view.layer : 0 });
        }
    }

    setState(s, blend = true) {
        this.state = s;
        this.actT = 0;
        this.prevActT = -1e-4;
        this.smooth = blend ? 1 : 0;
    }
    atAct(t) {
        return this.prevActT < t && this.actT >= t;
    }
    atFire(t) {
        return this.prevFireT < t && this.fireT >= t;
    }
    get reloadT() {
        return this.state === 'reload' ? this.actT : -1;
    }
    worldPos(obj, offset, out = new THREE.Vector3()) {
        out.set(offset ? offset[0] : 0, offset ? offset[1] : 0, offset ? offset[2] : 0);
        obj.localToWorld(out);
        return this.view ? this.view.toWorld(out) : out;
    }
    rawWorldPos(obj, offset, out = new THREE.Vector3()) {
        out.set(offset ? offset[0] : 0, offset ? offset[1] : 0, offset ? offset[2] : 0);
        return obj.localToWorld(out);
    }
    worldDir(obj, local, out = new THREE.Vector3()) {
        out.set(local ? local[0] : 0, local ? local[1] : 0, local ? local[2] : -1);
        return out.applyQuaternion(obj.getWorldQuaternion(_wq)).normalize();
    }
    localPos(obj, offset, out = new THREE.Vector3()) {
        this.rawWorldPos(obj, offset, out);
        return this.rig.worldToLocal(out);
    }
    muzzle(side = this.lastSide) {
        return this.def.muzzle ? this.def.muzzle(this, side) : this.parts.muzzle;
    }

    fire(o = {}) {
        const side = this.def.side ? this.def.side(this) : 0;
        this.lastSide = side;
        this.lastMode = o.mode || 'primary';
        this.lastFire = o;
        this.ammo = Math.max(0, this.ammo - (o.ammo || 1));
        this.shots++;
        this.cooldown = o.cooldown !== undefined ? o.cooldown : 1 / this.stats.rate;
        this.buffer = 0;
        this.fireT = 0;
        this.prevFireT = -1e-4;

        const k = this.stats.kick;
        const ks = (o.kickScale || 1) * 22;
        this.recoilZ.kick(k.back * ks);
        this.recoilX.kick(k.up * ks);
        this.recoilR.kick((Math.random() * 2 - 1) * k.roll * ks);

        const fl = this.parts.flashes ? this.parts.flashes[side] || this.parts.flashes[0] : null;
        if (fl) {
            fl.age = 0;
            fl.scale = o.flashScale || 1;
        }
        if (this.def.onFire) {
            this.def.onFire(this, side, o);
        }
        const shot = this.makeShot(side, o);
        if (this.trace) {
            shot.hits = shot.dirs.map(d => this.trace(shot.origin, d, shot.range));
        }
        if (this.onShot) {
            this.onShot(shot);
        }
        const cfg = o.projectile || this.def.projectile;
        if (cfg) {
            shot.dirs.forEach((d, i) => {
                const hit = shot.hits && shot.hits[i];
                const end = hit ? hit.point : shot.origin.clone().addScaledVector(d, Math.min(shot.range, cfg.maxDist || 60));
                this.projectiles.spawn(shot.muzzle, end, cfg, hit);
            });
        }
    }

    clearEffects() {
        if (this.def.cancel) {
            this.def.cancel(this);
        }
        this.projectiles.clear();
        this.fx.clear();
    }

    reportHits(hits, extra = {}) {
        if (this.onShot) {
            this.onShot(Object.assign({ weapon: this.id, damage: this.stats.damage, dirs: [], hits }, extra));
        }
    }

    makeShot(side, o = {}) {
        const eye = this.root.parent || this.root;
        eye.updateWorldMatrix(true, false);
        const origin = new THREE.Vector3().setFromMatrixPosition(eye.matrixWorld);
        const aim = new THREE.Vector3(0, 0, -1).applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion()));
        const dirs = [];
        const pellets = o.pellets || this.stats.pellets;
        const spread = (o.spread !== undefined ? o.spread : this.stats.spread) * this.spreadScale;
        for (let i = 0; i < pellets; i++) {
            dirs.push(spread ? WeaponKit.cone(aim, spread) : aim.clone());
        }
        this.root.updateWorldMatrix(true, true);
        const muzzle = this.zoom > 0.5
            ? origin.clone().addScaledVector(aim, 1.2).addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion())), 0.06)
            : this.worldPos(this.muzzle(side));
        return {
            weapon: this.id,
            origin,
            aim,
            dirs,
            damage: o.damage || this.stats.damage,
            mode: this.lastMode,
            range: this.stats.range,
            muzzle,
            side
        };
    }

    update(dt, move = {}) {
        this.move = move;
        if (this.view) {
            this.view.sync();
        }
        dt *= this.timeScale;
        this.time += dt;
        this.cooldown -= dt;
        this.buffer -= dt;
        const st = this.stats;

        if (this.state === 'draw' && this.actT >= st.drawTime) {
            this.setState('ready');
        }
        if (this.state === 'reload' && this.actT >= st.reloadTime) {
            this.ammo = st.mag;
            this.setState('ready');
        }
        const wants = (this.trigger && st.auto) || this.buffer > 0;
        if (this.state === 'inspect' && (wants || this.actT >= this.def.inspect.time)) {
            this.setState('ready');
        }
        if (this.def.altTick) {
            this.def.altTick(this, dt, move);
        }
        if (wants && this.state === 'ready' && this.cooldown <= 0 && !move.sprinting) {
            if (this.ammo > 0) {
                this.fire();
            } else {
                this.buffer = 0;
                this.reload();
            }
        }
        if (this.state === 'ready' && this.ammo <= 0 && this.cooldown <= 0) {
            this.reload();
        }

        this.pose(dt, move);
        this.root.visible = this.zoom < 0.97;
        this.root.updateWorldMatrix(true, true);
        if (this.def.effects) {
            this.def.effects(this, dt);
        }
        this.projectiles.update(dt);
        this.fx.update(dt);

        this.prevActT = this.actT;
        this.actT += dt;
        this.prevFireT = this.fireT;
        this.fireT += dt;
        this.syncBatch();
    }

    syncBatch() {
        const want = DETAIL.guns !== 'high' && Batch.supported();
        if (want && !this.batch) {
            this.batch = new MeshBatch(this.root, { skip: o => o.name === 'hands' });
        } else if (!want && this.batch) {
            this.batch.dispose();
            this.batch = null;
        }
        if (this.batch) {
            this.batch.sync();
        }
        if (this.hands) {
            this.hands.syncBatch(want);
        }
    }

    pose(dt, move) {
        const K = WeaponKit;
        for (const o of this.b.parts) {
            const r = o.userData.rest;
            o.position.copy(r.p);
            o.rotation.copy(r.r);
            o.scale.copy(r.s);
            o.visible = r.v;
        }
        if (this.hands) {
            this.hands.begin(this.def.hands);
        }

        const speed = move.speed || 0;
        const grounded = move.grounded !== false;
        const sprint = !!move.sprinting && this.state !== 'reload';
        this.moveBlend = K.lerp(this.moveBlend, K.clamp(speed / 6) * (grounded ? 1 : 0.2), Math.min(1, dt * 8));
        this.sprintBlend = K.lerp(this.sprintBlend, sprint ? 1 : 0, Math.min(1, dt * 7));
        this.airBlend = K.lerp(this.airBlend, grounded ? 0 : 1, Math.min(1, dt * 6));
        this.bobPhase += dt * (5.5 + speed * 0.75);
        for (const s of [this.swayX, this.swayY, this.recoilZ, this.recoilX, this.recoilR]) {
            s.update(dt);
        }

        const rig = this.rig;
        const calm = 1 - this.steady * 0.85;
        const bob = 0.011 * this.moveBlend * (1 + this.sprintBlend * 0.8) * calm;
        const t = this.time;
        const sx = this.swayX.x * calm;
        const sy = this.swayY.x * calm;
        rig.position.set(
            Math.sin(this.bobPhase) * bob + sx * 0.05,
            -Math.abs(Math.cos(this.bobPhase)) * bob + Math.sin(t * 1.6) * 0.0018 * calm + sy * 0.04 + this.airBlend * 0.015,
            this.recoilZ.x
        );
        rig.rotation.set(
            this.recoilX.x + sy * 0.5 + Math.sin(t * 1.3) * 0.004 * calm - this.sprintBlend * 0.32,
            sx * 0.6 + this.sprintBlend * (this.def.sprintYaw === undefined ? 0.6 : this.def.sprintYaw),
            this.recoilR.x + sx * 0.5 + Math.sin(this.bobPhase) * 0.012 * this.moveBlend * calm
        );
        rig.position.y += this.recoilX.x * 0.08 - this.sprintBlend * 0.05;
        rig.position.x -= this.sprintBlend * 0.04;

        if (this.state === 'draw') {
            const p = K.e('outCubic', this.actT, 0, this.stats.drawTime);
            rig.position.y -= (1 - p) * 0.32;
            rig.rotation.x -= (1 - p) * 0.9;
            rig.rotation.z += (1 - p) * 0.35;
        }

        for (const f of this.parts.flashes || []) {
            f.age += dt;
            const k = Math.max(0, 1 - f.age / (0.07 * (f.scale || 1)));
            f.core.visible = f.spike.visible = k > 0;
            if (k > 0) {
                const s = f.size * (f.scale || 1) * (0.7 + Math.random() * 0.6) * (0.5 + k * 0.5);
                f.core.scale.setScalar(s);
                f.core.rotation.z = Math.random() * 6;
                f.spike.scale.set(s * 0.45, s * 0.45, s * 2.6);
                f.spike.position.z = -s * 1.4;
            }
            f.light.intensity = k * f.intensity;
        }

        if (this.def.pose) {
            this.def.pose(this, dt);
        }

        if (dt > 0) {
            this.rigVel.copy(rig.position).sub(this._prevRig).multiplyScalar(1 / dt);
        }
        this._prevRig.copy(rig.position);

        let smoothF = 0;
        if (this.smooth > 0) {
            this.smooth = Math.max(0, this.smooth - dt / 0.22);
            const f = this.smooth * 0.9;
            smoothF = f;
            for (const o of this.b.parts) {
                const pv = o.userData.prev;
                o.position.lerp(pv.p, f);
                o.quaternion.slerp(pv.q, f);
                o.scale.lerp(pv.s, f);
            }
        }
        for (const o of this.b.parts) {
            const pv = o.userData.prev;
            pv.p.copy(o.position);
            pv.q.copy(o.quaternion);
            pv.s.copy(o.scale);
        }

        if (this.hands) {
            if (this.def.handPose) {
                this.def.handPose(this, this.hands, dt);
            }
            this.hands.solve(smoothF);
        }
    }

    dangle(spring, dt, gain = 1) {
        spring.v += (-this.rigVel.x * 6 - this.swayX.v * 0.8 + this.recoilX.v * 0.3) * gain * dt * 8;
        spring.update(dt);
        return spring.x;
    }

    dispose() {
        this.setHands(null);
        if (this.batch) {
            this.batch.dispose();
            this.batch = null;
        }
        if (this.def.dispose) {
            this.def.dispose(this);
        }
        if (this.root.parent) {
            this.root.parent.remove(this.root);
        }
        this.projectiles.dispose();
        this.fx.dispose();
        const geos = new Set();
        const mats = new Set();
        this.root.traverse(o => {
            if (o.geometry) {
                geos.add(o.geometry);
            }
            if (o.material) {
                mats.add(o.material);
            }
        });
        geos.forEach(g => g.dispose());
        mats.forEach(m => m.dispose());
    }
}

class WeaponView {
    constructor(camera, opts = {}) {
        this.camera = camera;
        this.layer = opts.layer || 1;
        this.cam = new THREE.PerspectiveCamera(opts.fov || 55, camera.aspect, opts.near || 0.01, opts.far || 50);
        this.cam.layers.set(this.layer);
        this._p = new THREE.Vector3();
        this._d = new THREE.Vector3();
    }
    attach(weapon) {
        weapon.view = this;
        weapon.fx.layer = this.layer;
        weapon.root.traverse(o => {
            if (o.isLight) {
                o.layers.enable(0);
                o.layers.enable(this.layer);
            } else {
                o.layers.set(this.layer);
            }
        });
    }
    detach(weapon) {
        weapon.view = null;
        weapon.fx.layer = 0;
        weapon.root.traverse(o => o.layers.set(0));
    }
    addLights() {
        const c = this.camera;
        const mk = (color, intensity, pos, target) => {
            const l = new THREE.DirectionalLight(color, intensity);
            l.position.fromArray(pos);
            l.target.position.fromArray(target);
            l.layers.set(this.layer);
            c.add(l);
            c.add(l.target);
            return l;
        };
        this.lights = [
            mk(0xfff1dc, 0.16, [-1.2, 1.6, 0.6], [0.2, -0.2, -0.6]),
            mk(0xbfe4ff, 0.42, [1.6, 0.9, -1.8], [0.2, -0.2, -0.5]),
            mk(0xffe0b0, 0.08, [0, -1, -0.2], [0.1, 0, -0.5])
        ];
        return this.lights;
    }
    shareLights(scene) {
        scene.traverse(o => {
            if (o.isLight) {
                o.layers.enable(this.layer);
            }
        });
    }
    sync() {
        const c = this.camera;
        c.updateMatrixWorld();
        c.getWorldPosition(this.cam.position);
        c.getWorldQuaternion(this.cam.quaternion);
        if (this.cam.aspect !== c.aspect) {
            this.cam.aspect = c.aspect;
            this.cam.updateProjectionMatrix();
        }
        this.cam.updateMatrixWorld();
    }
    toWorld(v) {
        const eye = this._p.setFromMatrixPosition(this.cam.matrixWorld);
        const dist = v.distanceTo(eye);
        v.project(this.cam);
        this._d.set(v.x, v.y, 0.5).unproject(this.camera).sub(eye).normalize();
        return v.copy(eye).addScaledVector(this._d, dist);
    }
    render(renderer, scene) {
        this.sync();
        const auto = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        const bg = scene.background;
        const matrices = scene.autoUpdate;
        scene.background = null;
        scene.autoUpdate = false;
        renderer.render(scene, this.cam);
        scene.autoUpdate = matrices;
        scene.background = bg;
        renderer.autoClear = auto;
    }
}

class ScopeOverlay {
    constructor(color = '#c77dff') {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;' +
            'background:radial-gradient(circle at 50% 50%, rgba(90,30,120,0.06) 0, rgba(90,30,120,0.1) 31vmin, rgba(12,4,18,0.92) 33.5vmin, #050208 36vmin);';
        const ticks = [];
        for (let i = 1; i <= 4; i++) {
            ticks.push(`<line x1="${i * 9}" y1="-2" x2="${i * 9}" y2="2"/><line x1="${-i * 9}" y1="-2" x2="${-i * 9}" y2="2"/><line x1="-2" y1="${i * 9}" x2="2" y2="${i * 9}"/>`);
        }
        const gills = [];
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const r0 = 92;
            const r1 = i % 2 ? 97 : 99;
            gills.push(`<line x1="${(Math.cos(a) * r0).toFixed(1)}" y1="${(Math.sin(a) * r0).toFixed(1)}" x2="${(Math.cos(a) * r1).toFixed(1)}" y2="${(Math.sin(a) * r1).toFixed(1)}"/>`);
        }
        el.innerHTML = `<svg viewBox="-100 -100 200 200" style="position:absolute;left:50%;top:50%;width:68vmin;height:68vmin;transform:translate(-50%,-50%);overflow:visible">
            <g stroke="${color}" stroke-width="0.6" fill="none" opacity="0.9">
              <circle r="99" stroke-width="1.4" opacity="0.6"/>
              <g opacity="0.35">${gills.join('')}</g>
              <line x1="-90" y1="0" x2="-6" y2="0"/><line x1="6" y1="0" x2="90" y2="0"/>
              <line x1="0" y1="6" x2="0" y2="90"/><line x1="0" y1="-90" x2="0" y2="-24"/>
              ${ticks.join('')}
              <circle r="14" opacity="0.5" stroke-dasharray="2 3"/>
            </g>
            <circle r="1.4" fill="${color}"/>
          </svg>`;
        const bloom = document.createElement('div');
        bloom.style.cssText = `position:absolute;inset:0;opacity:0;background:radial-gradient(circle at 50% 56%, ${color}cc 0, ${color}55 12vmin, transparent 30vmin);mix-blend-mode:screen`;
        el.appendChild(bloom);
        document.body.appendChild(el);
        this.el = el;
        this.svg = el.firstElementChild;
        this.bloom = bloom;
    }
    update(w, camera, baseFov) {
        const K = WeaponKit;
        const scope = w && w.def.scope;
        const z = scope ? K.ease.inOutSine(w.zoom) : 0;
        const fov = scope ? K.lerp(baseFov, scope.fov, z) : baseFov;
        if (Math.abs(camera.fov - fov) > 0.01) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
        const show = K.seg(z, 0.75, 1);
        this.el.style.opacity = show.toFixed(3);
        this.bloom.style.opacity = show > 0 ? Math.max(0, 1 - w.fireT / 0.16).toFixed(3) : '0';
        if (show > 0) {
            const kick = w.recoilX.x * 260;
            const sway = w.swayX.x * 120;
            this.svg.style.transform = `translate(calc(-50% + ${sway.toFixed(1)}px), calc(-50% - ${kick.toFixed(1)}px))`;
        }
        return z;
    }
    sensitivity(w) {
        const scope = w && w.def.scope;
        return scope ? 1 - (1 - (scope.sensitivity || 0.35)) * w.zoom : 1;
    }
}

const Weapons = {
    defs: {},
    order: [],
    register(id, def) {
        def.id = id;
        this.defs[id] = def;
        this.order.push(id);
    },
    get(id) {
        return this.defs[id];
    },
    create(id, opts) {
        return new Weapon(id, opts);
    }
};
