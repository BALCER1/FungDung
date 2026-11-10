const BATCH_LAYER = 30;
const BATCH_MASK = 1 << BATCH_LAYER;
const _bm = new THREE.Matrix4();
const _bn = new THREE.Matrix3();
const _bv = new THREE.Vector3();
const _noHit = () => {};

const Batch = {
    clones: new Map(),

    supported() {
        return typeof renderer === 'undefined' || renderer.capabilities.floatVertexTextures;
    },

    stamp() {
        return typeof renderer === 'undefined' ? -1 : renderer.info.render.frame;
    },

    skinned(mat) {
        let c = this.clones.get(mat);
        if (!c) {
            c = mat.clone();
            c.skinning = true;
            this.clones.set(mat, c);
            mat.addEventListener('dispose', () => {
                c.dispose();
                this.clones.delete(mat);
            });
        }
        const f = this.stamp();
        if (c.userData.synced !== f || f < 0) {
            c.userData.synced = f;
            for (const k of ['color', 'emissive', 'specular']) {
                if (mat[k] && mat[k].isColor) {
                    c[k].copy(mat[k]);
                }
            }
            for (const k of ['emissiveIntensity', 'opacity', 'shininess', 'roughness', 'metalness']) {
                if (mat[k] !== undefined) {
                    c[k] = mat[k];
                }
            }
            c.visible = mat.visible;
        }
        return c;
    }
};

class MeshBatch {
    constructor(root, opts = {}) {
        this.root = root;
        this.skip = opts.skip || null;
        this.bounds = opts.bounds || null;
        this.items = new Map();
        this.seen = new Set();
        this.proxy = null;
        this.skeleton = null;
        this.verts = 0;
        this.full = true;
    }

    eligible(m) {
        const mat = m.material;
        const g = m.geometry;
        return !!mat && !Array.isArray(mat) && !mat.transparent && !mat.vertexColors && !mat.isShaderMaterial &&
            !m.isSkinnedMesh && !m.isInstancedMesh && !m.userData.tube && !m.userData.noBatch &&
            g.attributes.position && g.attributes.normal && g.drawRange.start === 0 && g.drawRange.count === Infinity;
    }

    sync() {
        const seen = this.seen;
        seen.clear();
        let reindex = false;
        const walk = (o, vis) => {
            if (o === this.proxy || (this.skip && this.skip(o))) {
                return;
            }
            vis = vis && o.visible;
            if (o.isMesh && this.eligible(o)) {
                seen.add(o);
                let it = this.items.get(o);
                if (!it) {
                    it = { layers: o.layers.mask, dynamic: false, start: 0, count: 0, trs: new Float32Array(10) };
                    this.items.set(o, it);
                    this.snap(o, it);
                    this.full = true;
                } else {
                    if (it.geo !== o.geometry || it.parent !== o.parent) {
                        this.full = true;
                    }
                    if (!it.dynamic && this.moved(o, it)) {
                        it.dynamic = true;
                        this.full = true;
                    }
                    if (it.mat !== o.material || it.vis !== vis) {
                        reindex = true;
                    }
                }
                it.geo = o.geometry;
                it.parent = o.parent;
                it.mat = o.material;
                it.vis = vis;
                if (o.layers.mask !== BATCH_MASK) {
                    it.layers = o.layers.mask;
                    o.layers.mask = BATCH_MASK;
                }
            }
            const kids = o.children;
            for (let i = 0; i < kids.length; i++) {
                walk(kids[i], vis);
            }
        };
        walk(this.root, true);
        for (const [m, it] of this.items) {
            if (!seen.has(m)) {
                m.layers.mask = it.layers;
                this.items.delete(m);
                this.full = true;
            }
        }
        if (!this.items.size) {
            this.dropProxy();
            return;
        }
        if (this.full) {
            this.rebuild();
            reindex = true;
        }
        if (reindex) {
            this.reindex();
        }
        this.proxy.layers.mask = this.root.layers.mask;
        for (const m of this.srcMats) {
            Batch.skinned(m);
        }
    }

    snap(o, it) {
        const t = it.trs;
        t[0] = o.position.x;
        t[1] = o.position.y;
        t[2] = o.position.z;
        t[3] = o.quaternion.x;
        t[4] = o.quaternion.y;
        t[5] = o.quaternion.z;
        t[6] = o.quaternion.w;
        t[7] = o.scale.x;
        t[8] = o.scale.y;
        t[9] = o.scale.z;
    }

    moved(o, it) {
        const t = it.trs;
        const p = o.position;
        const q = o.quaternion;
        const s = o.scale;
        const e = 1e-6;
        return Math.abs(t[0] - p.x) > e || Math.abs(t[1] - p.y) > e || Math.abs(t[2] - p.z) > e ||
            Math.abs(t[3] - q.x) > e || Math.abs(t[4] - q.y) > e || Math.abs(t[5] - q.z) > e || Math.abs(t[6] - q.w) > e ||
            Math.abs(t[7] - s.x) > e || Math.abs(t[8] - s.y) > e || Math.abs(t[9] - s.z) > e;
    }

    rebuild() {
        this.full = false;
        let total = 0;
        for (const [m, it] of this.items) {
            const g = m.geometry;
            it.count = g.index ? g.index.count : g.attributes.position.count;
            it.start = total;
            total += it.count;
        }
        this.verts = total;
        const pos = new Float32Array(total * 3);
        const nor = new Float32Array(total * 3);
        const si = new Uint16Array(total * 4);
        const sw = new Float32Array(total * 4);
        const bones = [];
        const boneIndex = new Map();
        for (const [m, it] of this.items) {
            const bone = it.dynamic ? m : m.parent;
            let b = boneIndex.get(bone);
            if (b === undefined) {
                b = bones.length;
                bones.push(bone);
                boneIndex.set(bone, b);
            }
            if (it.dynamic) {
                _bm.identity();
            } else {
                if (m.matrixAutoUpdate) {
                    m.updateMatrix();
                }
                _bm.copy(m.matrix);
            }
            _bn.getNormalMatrix(_bm);
            const g = m.geometry;
            const P = g.attributes.position;
            const N = g.attributes.normal;
            const idx = g.index;
            for (let k = 0; k < it.count; k++) {
                const src = idx ? idx.getX(k) : k;
                const d = it.start + k;
                _bv.fromBufferAttribute(P, src).applyMatrix4(_bm);
                pos[d * 3] = _bv.x;
                pos[d * 3 + 1] = _bv.y;
                pos[d * 3 + 2] = _bv.z;
                _bv.fromBufferAttribute(N, src).applyMatrix3(_bn).normalize();
                nor[d * 3] = _bv.x;
                nor[d * 3 + 1] = _bv.y;
                nor[d * 3 + 2] = _bv.z;
                si[d * 4] = b;
                sw[d * 4] = 1;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        if (this.bounds) {
            geo.boundingSphere = this.bounds.clone();
        }
        if (this.skeleton) {
            this.skeleton.dispose();
        }
        this.skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
        if (!this.proxy) {
            this.proxy = new THREE.SkinnedMesh(geo, []);
            this.proxy.name = 'batch';
            this.proxy.raycast = _noHit;
            this.proxy.frustumCulled = !!this.bounds;
            this.root.add(this.proxy);
        } else {
            this.proxy.geometry.dispose();
            this.proxy.geometry = geo;
        }
        this.proxy.bind(this.skeleton, new THREE.Matrix4());
    }

    reindex() {
        const byMat = new Map();
        for (const it of this.items.values()) {
            if (!it.vis) {
                continue;
            }
            let list = byMat.get(it.mat);
            if (!list) {
                list = [];
                byMat.set(it.mat, list);
            }
            list.push(it);
        }
        let n = 0;
        for (const list of byMat.values()) {
            for (const it of list) {
                n += it.count;
            }
        }
        const idx = this.verts > 65535 ? new Uint32Array(n) : new Uint16Array(n);
        const geo = this.proxy.geometry;
        geo.clearGroups();
        const src = [];
        let o = 0;
        for (const [mat, list] of byMat) {
            const start = o;
            for (const it of list) {
                for (let k = 0; k < it.count; k++) {
                    idx[o++] = it.start + k;
                }
            }
            geo.addGroup(start, o - start, src.length);
            src.push(mat);
        }
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        this.srcMats = src;
        this.proxy.material = src.map(m => Batch.skinned(m));
    }

    dispose() {
        for (const [m, it] of this.items) {
            if (m.layers.mask === BATCH_MASK) {
                m.layers.mask = it.layers;
            }
        }
        this.items.clear();
        this.dropProxy();
    }

    dropProxy() {
        if (this.proxy) {
            if (this.proxy.parent) {
                this.proxy.parent.remove(this.proxy);
            }
            this.proxy.geometry.dispose();
            this.proxy = null;
        }
        if (this.skeleton) {
            this.skeleton.dispose();
            this.skeleton = null;
        }
        this.full = true;
    }
}
