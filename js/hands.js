const HandKit = {
    PALM: 0.02,
    _v: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    _m: new THREE.Matrix4(),

    basis(fingers, back, out = new THREE.Quaternion()) {
        const [x, y, z] = HandKit._v;
        z.fromArray(fingers).normalize().negate();
        y.fromArray(back).addScaledVector(z, -y.dot(z)).normalize();
        x.crossVectors(y, z);
        return out.setFromRotationMatrix(HandKit._m.makeBasis(x, y, z));
    }
};

const HandShapes = {
    box(w, h, d, bevel) {
        const b = Math.min(bevel, w * 0.3, h * 0.3, d * 0.3);
        const W = w - 2 * b;
        const H = h - 2 * b;
        const r = Math.min(W, H) * 0.2;
        const s = new THREE.Shape();
        s.moveTo(-W / 2 + r, -H / 2);
        s.lineTo(W / 2 - r, -H / 2);
        s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + r);
        s.lineTo(W / 2, H / 2 - r);
        s.quadraticCurveTo(W / 2, H / 2, W / 2 - r, H / 2);
        s.lineTo(-W / 2 + r, H / 2);
        s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - r);
        s.lineTo(-W / 2, -H / 2 + r);
        s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2);
        let geo = new THREE.ExtrudeGeometry(s, {
            depth: Math.max(0.0001, d - 2 * b), bevelEnabled: true,
            bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3
        });
        geo.center();
        if (geo.index) {
            geo = geo.toNonIndexed();
        }
        geo.deleteAttribute('uv');
        return geo;
    },
    shape(geo, fn) {
        const pos = geo.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            fn(v.fromBufferAttribute(pos, i));
            pos.setXYZ(i, v.x, v.y, v.z);
        }
        geo.computeVertexNormals();
        return geo;
    },
    tint(geo, k) {
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            const c = typeof k === 'number' ? k : k(v.fromBufferAttribute(pos, i));
            col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return geo;
    },
    shade(geo, lo = 0.72) {
        geo.computeBoundingBox();
        const { min, max } = geo.boundingBox;
        return HandShapes.tint(geo, v => lo + (1 - lo) * Math.min(1, Math.max(0, (v.y - min.y) / (max.y - min.y))));
    },
    UV_SIZE: 0.06,
    uvs(geo) {
        const pos = geo.attributes.position;
        const nor = geo.attributes.normal;
        const uv = new Float32Array(pos.count * 2);
        const k = 1 / HandShapes.UV_SIZE;
        for (let i = 0; i < pos.count; i++) {
            const ax = Math.abs(nor.getX(i));
            const ay = Math.abs(nor.getY(i));
            const az = Math.abs(nor.getZ(i));
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
            uv[i * 2] = u * k + 0.5;
            uv[i * 2 + 1] = v * k + 0.5;
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return geo;
    },
    merge(list) {
        let n = 0;
        for (const g of list) {
            n += g.attributes.position.count;
            HandShapes.uvs(g);
        }
        const out = new THREE.BufferGeometry();
        for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
            const arr = new Float32Array(n * size);
            let o = 0;
            for (const g of list) {
                arr.set(g.attributes[name].array, o);
                o += g.attributes[name].array.length;
            }
            out.setAttribute(name, new THREE.BufferAttribute(arr, size));
        }
        list.forEach(g => g.dispose());
        return out;
    },
    gill(len, x, y, z, yaw = 0) {
        const g = HandShapes.box(0.0013, 0.0014, len, 0.0004);
        g.rotateY(yaw);
        g.translate(x, y, z);
        return HandShapes.tint(g, 0.62);
    },

    segment(w, h, len, tip) {
        const S = HandShapes;
        const core = S.box(w * 0.86, h * 0.72, len + h * 0.4, h * 0.2);
        core.translate(0, -h * 0.13, -len / 2);
        if (tip) {
            S.shape(core, v => {
                const t = Math.max(0, (-v.z - len * 0.5) / (len * 0.6));
                v.x *= 1 - 0.3 * t;
                v.y += t * h * 0.08;
            });
        }
        S.tint(core, 1);
        const flesh = S.merge([
            core,
            S.gill(len * 0.72, -w * 0.17, -h * 0.49, -len * 0.5),
            S.gill(len * 0.72, w * 0.17, -h * 0.49, -len * 0.5)
        ]);
        const plate = S.box(w, h * 0.5, len + (tip ? h * 0.55 : h * 0.12), h * 0.16);
        plate.translate(0, h * 0.21, -len / 2 - (tip ? h * 0.22 : 0));
        if (tip) {
            S.shape(plate, v => {
                const t = Math.max(0, (-v.z - len * 0.45) / (len * 0.75));
                v.x *= 1 - 0.55 * t;
                v.y -= t * t * h * 0.22;
            });
        } else {
            S.shape(plate, v => {
                v.y += (1 - Math.min(1, (v.x * v.x) / (w * w * 0.25))) * h * 0.06 * (v.y > h * 0.2 ? 1 : 0);
            });
        }
        return { flesh, shell: S.merge([S.shade(plate)]) };
    },
    prep(geo) {
        const g = geo.toNonIndexed();
        g.deleteAttribute('uv');
        geo.dispose();
        return g;
    },

    build() {
        const S = HandShapes;
        const core = S.box(0.054, 0.021, 0.066, 0.006);
        core.translate(0, -0.005, 0);
        S.tint(core, 1);
        const gills = [];
        const n = 22;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const dx = Math.sin(a);
            const dz = Math.cos(a);
            const edge = Math.min(0.024 / Math.max(0.001, Math.abs(dx)), 0.029 / Math.max(0.001, Math.abs(dz)));
            const r0 = i % 2 ? 0.014 : 0.0065;
            const len = edge - r0 - 0.002;
            gills.push(S.gill(len, dx * (r0 + len / 2), -0.0157, dz * (r0 + len / 2), a));
        }
        const palmFlesh = S.merge([core, ...gills]);
        const main = S.box(0.062, 0.012, 0.042, 0.004);
        main.translate(0, 0.008, -0.004);
        S.shape(main, v => {
            if (v.y > 0.009) {
                v.y += 0.005 * (1 - (v.x * v.x) / (0.031 * 0.031));
            }
        });
        const ridge = S.box(0.066, 0.011, 0.017, 0.0035);
        ridge.rotateX(0.18);
        ridge.translate(0, 0.009, -0.027);
        const rear = S.box(0.056, 0.011, 0.024, 0.0035);
        rear.rotateX(-0.14);
        rear.translate(0, 0.0075, 0.023);
        const palmShell = S.merge([S.shade(rear), S.shade(main), S.shade(ridge)]);

        const tcore = S.merge([S.tint(S.box(0.019, 0.017, 0.024, 0.005), 1)]);
        tcore.translate(0, -0.002, 0);
        const tplate = S.box(0.021, 0.009, 0.024, 0.003);
        tplate.translate(0, 0.006, 0);

        const finger = (l1, l2) => ({
            prox: S.segment(0.0135, 0.0135, l1, false), dist: S.segment(0.0125, 0.0125, l2, true), len: [l1, l2]
        });

        const oval = g => g.scale(1.08, 0.8, 1);
        const band = S.prep(new THREE.CylinderGeometry(0.031, 0.0285, 0.02, 20, 1, true));
        band.rotateX(Math.PI / 2);
        band.translate(0, 0.0025, 0.044);
        const hem = S.prep(new THREE.TorusGeometry(0.031, 0.003, 8, 28));
        hem.translate(0, 0.0025, 0.054);
        const cap = S.prep(new THREE.SphereGeometry(0.0305, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2));
        cap.rotateX(Math.PI / 2);
        cap.scale(1, 1, 0.3);
        cap.translate(0, 0.0025, 0.0535);
        const cuff = S.merge([S.tint(oval(band), 1), S.tint(oval(hem), 0.85), S.tint(oval(cap), 0.8)]);

        const trim = [];
        const strap = S.prep(new THREE.TorusGeometry(0.0302, 0.0024, 6, 32));
        strap.translate(0, 0.0025, 0.043);
        trim.push(S.tint(oval(strap), 1));
        const buckle = S.box(0.013, 0.0045, 0.011, 0.0015);
        buckle.translate(0, 0.0025 + 0.0302 * 0.8 + 0.0016, 0.043);
        const tongue = S.box(0.0026, 0.005, 0.009, 0.0008);
        tongue.translate(0, 0.0025 + 0.0302 * 0.8 + 0.0022, 0.043);
        trim.push(S.tint(buckle, 1.15), S.tint(tongue, 0.6));
        for (const x of [-0.0215, -0.0072, 0.0072, 0.0215]) {
            const stud = S.prep(new THREE.CylinderGeometry(0.0027, 0.0034, 0.0026, 10));
            stud.rotateX(0.18);
            stud.translate(x, 0.0156, -0.0272);
            trim.push(S.tint(stud, 1.1));
        }

        return {
            palm: { flesh: palmFlesh, shell: palmShell },
            fingers: { index: finger(0.023, 0.018), middle: finger(0.025, 0.019), ring: finger(0.023, 0.017), little: finger(0.019, 0.015) },
            thumb: {
                base: { flesh: tcore, shell: S.merge([S.shade(tplate)]) },
                prox: S.segment(0.0185, 0.017, 0.021, false), dist: S.segment(0.017, 0.0155, 0.017, true), len: [0.021, 0.017]
            },
            cuff, trim: S.merge(trim)
        };
    }
};

const _hp = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _hs = new THREE.Vector3();
const _hm = new THREE.Matrix4();

class Hand {
    constructor(pair, side) {
        this.pair = pair;
        this.side = side;
        this.name = side < 0 ? 'left' : 'right';
        const tx = -side;
        this.tx = tx;

        const G = Hands.geometry();
        this.root = new THREE.Group();
        this.root.name = 'hand:' + this.name;
        this.meshes = { shell: [], flesh: [], cuff: [], trim: [] };
        const mk = (piece, parent, pos) => {
            for (const region of ['flesh', 'shell']) {
                const m = new THREE.Mesh(piece[region], pair.material(region));
                if (pos) {
                    m.position.fromArray(pos);
                }
                parent.add(m);
                this.meshes[region].push(m);
            }
        };
        const group = (parent, pos, rot) => {
            const g = new THREE.Group();
            g.position.fromArray(pos);
            if (rot) {
                g.rotation.fromArray(rot);
            }
            parent.add(g);
            return g;
        };
        const digit = (parts, parent, pos, splay) => {
            const knuckle = group(parent, pos, [0, splay, 0]);
            mk(parts.prox, knuckle);
            const joint = group(knuckle, [0, 0, -parts.len[0]]);
            mk(parts.dist, joint);
            return { knuckle, joint };
        };

        mk(G.palm, this.root);
        const F = G.fingers;
        this.fingers = [F.index, F.middle, F.ring, F.little].map((parts, i) => {
            const x = tx * (0.0215 - i * 0.0143);
            return digit(parts, this.root, [x, -0.002, -0.028 - (i === 1 ? 0.001 : 0) + (i === 3 ? 0.003 : 0)], -x * 6);
        });
        this.thumb = group(this.root, [tx * 0.027, -0.006, 0.01]);
        mk(G.thumb.base, this.thumb, [tx * 0.004, 0, 0]);
        this.thumbDigit = digit(G.thumb, this.thumb, [0, 0, -0.008], -tx * 0.7);
        this.digits = { inner: 0, index: 0, middle: 1, ring: 2, outer: 3, little: 3, thumb: 4 };
        this.bends = [0, 0, 0, 0, 0];

        for (const region of ['cuff', 'trim']) {
            const m = new THREE.Mesh(G[region], pair.material(region));
            this.root.add(m);
            this.meshes[region].push(m);
        }

        this.sockets = {
            wrist: group(this.root, [0, 0.0025, 0.044]),
            back: group(this.root, [0, 0.019, 0]),
            palm: group(this.root, [0, -0.017, -0.004]),
            knuckles: group(this.root, [0, 0.004, -0.032])
        };
        this.items = {};

        this.rest = { p: [side * 0.22, -0.42, -0.2], fingers: [0, 1, -0.3], back: [side * 0.3, 0, 1], curl: 0.5 };

        this.pos = new THREE.Vector3();
        this.quat = new THREE.Quaternion();
        this.curl = 0;
        this.prev = { p: new THREE.Vector3(), q: new THREE.Quaternion(), c: 0, ok: false };
        this.cmds = [];
        this.ncmd = 0;
        this.off = new THREE.Vector3();
        this.extraCurl = 0;
        this.scaleUp = 0;
        this.hidden = false;
        this.fromRest = false;
        this.moved = 0;
    }

    to(target, weight = 1) {
        if (!(weight > 0) || target === null || target === undefined) {
            return this;
        }
        let c = this.cmds[this.ncmd];
        if (!c) {
            c = this.cmds[this.ncmd] = { target: null, w: 0 };
        }
        c.target = target;
        c.w = Math.min(1, weight);
        this.ncmd++;
        return this;
    }
    track(t, keys) {
        for (const k of keys) {
            this.to(k[2], WeaponKit.e(k[3] || 'inOutCubic', t, k[0], k[1]));
        }
        return this;
    }
    nudge(x, y, z) {
        this.off.x += x;
        this.off.y += y;
        this.off.z += z;
        return this;
    }
    squeeze(v) {
        this.extraCurl += v;
        return this;
    }
    bend(digit, v) {
        this.bends[typeof digit === 'number' ? digit : this.digits[digit]] += v;
        return this;
    }
    pop(v) {
        this.scaleUp += v;
        return this;
    }
    hide() {
        this.hidden = true;
        return this;
    }

    attach(socket, obj) {
        this.detach(socket);
        this.sockets[socket].add(obj);
        this.items[socket] = obj;
        this.pair.setLayer(obj);
        return obj;
    }
    detach(socket) {
        const obj = this.items[socket];
        if (obj) {
            obj.parent.remove(obj);
            delete this.items[socket];
        }
        return obj || null;
    }

    _begin(base) {
        this.ncmd = 0;
        this.off.set(0, 0, 0);
        this.extraCurl = 0;
        this.scaleUp = 0;
        this.bends.fill(0);
        this.hidden = false;
        this.fromRest = !base;
        this.to(base || this.rest);
    }

    _solve(f) {
        const P = this.pair;
        let first = true;
        this.moved = 0;
        for (let i = 0; i < this.ncmd; i++) {
            const c = this.cmds[i];
            if (!P.resolve(c.target, _hp, _hq)) {
                continue;
            }
            if (first) {
                this.pos.copy(_hp);
                this.quat.copy(_hq);
                this.curl = P._curl;
                first = false;
            } else {
                this.pos.lerp(_hp, c.w);
                this.quat.slerp(_hq, c.w);
                this.curl += (P._curl - this.curl) * c.w;
                this.moved += c.w;
            }
        }
        const visible = !this.hidden && !first && (!this.fromRest || this.moved > 0.01);
        this.root.visible = visible;
        if (!visible) {
            this.prev.ok = false;
            return;
        }
        this.pos.add(_hp.copy(this.off).applyQuaternion(this.quat));
        this.curl = Math.min(1.1, Math.max(-0.25, this.curl + this.extraCurl));

        const pv = this.prev;
        if (f > 0 && pv.ok) {
            this.pos.lerp(pv.p, f);
            this.quat.slerp(pv.q, f);
            this.curl += (pv.c - this.curl) * f;
        }
        pv.p.copy(this.pos);
        pv.q.copy(this.quat);
        pv.c = this.curl;
        pv.ok = true;

        this.root.position.copy(this.pos);
        this.root.quaternion.copy(this.quat);
        this.root.scale.setScalar(P.scale * (1 + this.scaleUp));
        const c = this.curl;
        const b = this.bends;
        for (let i = 0; i < 4; i++) {
            const k = Math.min(1.2, Math.max(-0.12, c * (1 + i * 0.04) + b[i]));
            this.fingers[i].knuckle.rotation.x = -0.12 - k * 1.05;
            this.fingers[i].joint.rotation.x = -0.25 - Math.max(0, k) * 1.25;
        }
        const t = Math.min(1.2, Math.max(-0.4, c + b[4]));
        this.thumb.rotation.set(0, this.tx * t * 0.35, -this.tx * t * 0.8);
        this.thumbDigit.joint.rotation.x = -0.15 - Math.max(0, t) * 0.9;
    }
}

class Hands {
    constructor(opts = {}) {
        this.scale = opts.scale || 1;
        const pick = (v, d) => (v === undefined ? d : v);
        const gray = pick(opts.color, 0x8a8f96);
        const plain = c => Hands.plain(c);
        this.regions = {
            shell: plain(pick(opts.shell, gray)),
            flesh: plain(pick(opts.flesh, gray)),
            cuff: plain(pick(opts.cuff, gray)),
            trim: plain(pick(opts.trim, gray))
        };
        this.root = new THREE.Group();
        this.root.name = 'hands';
        this.left = new Hand(this, -1);
        this.right = new Hand(this, 1);
        this.root.add(this.left.root, this.right.root);
        this.space = null;
        this.grips = null;
        this.layer = 0;
        this._inv = new THREE.Matrix4();
        this._curl = 0;
        this._warned = {};
    }

    static plain(color) {
        return DETAIL.litMaterial({ color, roughness: 0.6, metalness: 0.05, vertexColors: false });
    }

    syncBatch(want) {
        if (want && !this.batch) {
            this.batch = new MeshBatch(this.root);
        } else if (!want && this.batch) {
            this.batch.dispose();
            this.batch = null;
        }
        if (this.batch) {
            this.batch.sync();
        }
    }

    relight() {
        for (const region in this.regions) {
            const old = this.regions[region];
            const mat = Hands.plain(old.color);
            if (old.emissive && mat.emissive) {
                mat.emissive.copy(old.emissive);
                mat.emissiveIntensity = old.emissiveIntensity;
            }
            this.setMaterial(region, mat);
            old.dispose();
        }
    }

    static geometry() {
        if (!Hands._geo) {
            Hands._geo = HandShapes.build();
        }
        return Hands._geo;
    }

    get both() {
        return [this.left, this.right];
    }
    material(region) {
        return this.regions[region];
    }

    paint(color, region = 'shell') {
        this.regions[region].color.set(color);
        return this;
    }
    setSkin(skin) {
        for (const region in skin) {
            const mat = this.regions[region];
            const o = skin[region];
            for (const key in o) {
                if (mat[key] && mat[key].isColor) {
                    mat[key].set(o[key]);
                } else {
                    mat[key] = o[key];
                }
            }
            mat.needsUpdate = true;
        }
        return this;
    }
    setMaterial(region, mat) {
        this.regions[region] = mat;
        for (const h of this.both) {
            for (const m of h.meshes[region]) {
                m.material = mat;
            }
        }
        return this;
    }
    equip(socket, make) {
        return this.both.map(h => h.attach(socket, make(h)));
    }
    unequip(socket) {
        return this.both.map(h => h.detach(socket));
    }

    mount(parent, opts = {}) {
        parent.add(this.root);
        this.space = parent;
        this.grips = opts.grips || null;
        this.layer = opts.layer || 0;
        this.setLayer(this.root);
        for (const h of this.both) {
            h.prev.ok = false;
        }
    }
    unmount() {
        if (this.root.parent) {
            this.root.parent.remove(this.root);
        }
        this.space = null;
        this.grips = null;
    }
    setLayer(obj) {
        obj.traverse(o => {
            if (o.isLight) {
                o.layers.enable(0);
                o.layers.enable(this.layer);
            } else {
                o.layers.set(this.layer);
            }
        });
    }

    begin(base) {
        this.left._begin(base && base.left);
        this.right._begin(base && base.right);
    }
    solve(smooth = 0) {
        if (!this.space) {
            return;
        }
        this.space.updateWorldMatrix(true, false);
        this._inv.copy(this.space.matrixWorld).invert();
        this.left._solve(smooth);
        this.right._solve(smooth);
    }

    resolve(t, p, q) {
        if (typeof t === 'string') {
            const g = this.grips && this.grips[t];
            if (!g) {
                if (!this._warned[t]) {
                    this._warned[t] = true;
                    console.warn('Hands: no grip called "' + t + '"');
                }
                return false;
            }
            t = g;
        }
        if (t.isObject3D) {
            t.updateWorldMatrix(true, false);
            _hm.multiplyMatrices(this._inv, t.matrixWorld).decompose(p, q, _hs);
            const g = t.userData.grip;
            this._curl = g ? g.curl : 0.85;
            return true;
        }
        if (!t._q) {
            t._q = HandKit.basis(t.fingers || [0, 0, -1], t.back || [0, 1, 0]);
        }
        p.fromArray(t.p);
        q.copy(t._q);
        this._curl = t.curl === undefined ? 0.85 : t.curl;
        return true;
    }
}
