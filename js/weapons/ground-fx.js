// Ground effects for heavy impacts (the hammer's slam): a glowing shockwave that hugs the floor and
// stops at walls, a flash and an edge ring marking the radius, sparks along the wave, chunks of the
// floor (tinted from the surface that was actually hit) that burst out and settle, a dust ring and
// a crack decal whose cracks glow for a moment. Cosmetic only (Math.random), pooled (one
// instanced mesh for every chunk, one points cloud for every puff), and parented to the scene,
// never Game.room.group, so shots and hit tests cannot see them. Cleared with the room.
const _gfv = new THREE.Vector3();
const _gfv2 = new THREE.Vector3();
const _gfq = new THREE.Quaternion();
const _gfm = new THREE.Matrix4();
const _gfs = new THREE.Vector3();
const _gfc = new THREE.Color();

const GroundFX = {
    ready: false,
    room: null,
    MAX_CHUNKS: 96,
    MAX_DUST: 160,
    MAX_RINGS: 6,
    MAX_FLASH: 2,
    MAX_DECALS: 3,
    RING_SEGS: 48,
    STEP: 0.25,
    MAX_R: 10,
    DOWN: new THREE.Vector3(0, -1, 0),
    DUST: new THREE.Color(0xd9d2c6),
    GLOW: 0xa64dff,
    WHITE: new THREE.Color(0xffffff),

    init() {
        if (this.ready) {
            return;
        }
        this.ready = true;
        this.ray = new THREE.Raycaster();
        this.group = new THREE.Group();
        this.group.name = 'ground-fx';
        scene.add(this.group);

        // Chunks: one instanced rock, per-instance colour. Hidden instances have zero scale.
        const rock = new THREE.DodecahedronGeometry(1, 0);
        rock.scale(1, 0.62, 0.85);
        this.chunkMat = DETAIL.litMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
        this.chunkMesh = new THREE.InstancedMesh(rock, this.chunkMat, this.MAX_CHUNKS);
        this.chunkMesh.frustumCulled = false;
        this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.chunks = [];
        _gfm.makeScale(0, 0, 0);
        for (let i = 0; i < this.MAX_CHUNKS; i++) {
            this.chunkMesh.setMatrixAt(i, _gfm);
            this.chunkMesh.setColorAt(i, _gfc.set(0xffffff));
            this.chunks.push({
                on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(),
                axis: new THREE.Vector3(0, 1, 0), spin: 0, size: 0.05, t: 0, life: 2, delay: 0, settled: false
            });
        }
        this.chunkNext = 0;
        this.group.add(this.chunkMesh);

        // Dust: soft round points with their own colour, size and alpha (normal blending).
        const N = this.MAX_DUST;
        this.dust = [];
        this.dustPos = new Float32Array(N * 3);
        this.dustTint = new Float32Array(N * 3);
        this.dustAlpha = new Float32Array(N);
        this.dustSize = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            this.dust.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, life: 1, s0: 0.2, s1: 0.8, a: 0.6, drag: 2.5 });
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
        dg.setAttribute('tint', new THREE.BufferAttribute(this.dustTint, 3));
        dg.setAttribute('alpha', new THREE.BufferAttribute(this.dustAlpha, 1));
        dg.setAttribute('size', new THREE.BufferAttribute(this.dustSize, 1));
        this.dustMat = new THREE.ShaderMaterial({
            uniforms: { scale: { value: 400 } },
            vertexShader: [
                'attribute vec3 tint;',
                'attribute float alpha;',
                'attribute float size;',
                'uniform float scale;',
                'varying vec3 vTint;',
                'varying float vAlpha;',
                'void main() {',
                '    vTint = tint;',
                '    vAlpha = alpha;',
                '    vec4 mv = modelViewMatrix * vec4(position, 1.0);',
                '    gl_PointSize = alpha > 0.0 ? size * scale / max(0.1, -mv.z) : 0.0;',
                '    gl_Position = projectionMatrix * mv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vTint;',
                'varying float vAlpha;',
                'void main() {',
                '    float d = length(gl_PointCoord - vec2(0.5));',
                '    float a = smoothstep(0.5, 0.05, d) * vAlpha;',
                '    if (a < 0.01) discard;',
                '    gl_FragColor = vec4(vTint, a);',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false
        });
        this.dustPoints = new THREE.Points(dg, this.dustMat);
        this.dustPoints.frustumCulled = false;
        this.dustNext = 0;
        this.group.add(this.dustPoints);

        // Shockwave rings: per angle an inner, crest and outer vertex that follow the floor.
        const ringVS = [
            'attribute float alpha;',
            'varying float vAlpha;',
            'void main() {',
            '    vAlpha = alpha;',
            '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n');
        const ringFS = [
            'uniform vec3 color;',
            'uniform float opacity;',
            'varying float vAlpha;',
            'void main() {',
            '    gl_FragColor = vec4(color, vAlpha * opacity);',
            '}'
        ].join('\n');
        const S = this.RING_SEGS;
        const steps = Math.ceil(this.MAX_R / this.STEP) + 1;
        this.rings = [];
        for (let r = 0; r < this.MAX_RINGS; r++) {
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array((S + 1) * 3 * 3);
            const alpha = new Float32Array((S + 1) * 3);
            const idx = [];
            for (let i = 0; i < S; i++) {
                for (let k = 0; k < 2; k++) {
                    const a = i * 3 + k;
                    const b = (i + 1) * 3 + k;
                    idx.push(a, b, a + 1, b, b + 1, a + 1);
                }
            }
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
            geo.setIndex(idx);
            const mat = new THREE.ShaderMaterial({
                uniforms: { color: { value: new THREE.Color() }, opacity: { value: 1 } },
                vertexShader: ringVS,
                fragmentShader: ringFS,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
            mesh.visible = false;
            mesh.renderOrder = 2;
            this.group.add(mesh);
            this.rings.push({
                on: false, mesh, pos, alpha, center: new THREE.Vector3(), R: 6, t: 0, dur: 0.5, segs: S,
                limit: new Float32Array(S + 1), heights: new Float32Array((S + 1) * steps), steps, lift: 0.12,
                fixed: false, k: 0, glow: new THREE.Color()
            });
        }

        // Crack decals, sharing one canvas texture.
        this.crackTex = this.drawCrack();
        this.decals = [];
        const plane = new THREE.PlaneGeometry(1, 1);
        plane.rotateX(-Math.PI / 2);
        for (let i = 0; i < this.MAX_DECALS; i++) {
            const mat = new THREE.MeshBasicMaterial({
                map: this.crackTex, transparent: true, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
            });
            const mesh = new THREE.Mesh(plane, mat);
            mesh.visible = false;
            mesh.renderOrder = 1;
            this.group.add(mesh);
            // The same cracks again, additive and glowing, fading out first.
            const glow = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
                map: this.crackTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
                polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
            }));
            glow.visible = false;
            glow.renderOrder = 2;
            this.group.add(glow);
            this.decals.push({ on: false, mesh, glow, t: 0, life: 6, size: 2 });
        }
        this.decalNext = 0;

        // Radius flash: a disc the size of the hit area, brightest at its edge, gone in a moment.
        this.flashTex = this.drawFlash();
        this.flashes = [];
        for (let i = 0; i < this.MAX_FLASH; i++) {
            const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
                map: this.flashTex, transparent: true, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
            }));
            mesh.visible = false;
            mesh.renderOrder = 3;
            this.group.add(mesh);
            this.flashes.push({ on: false, mesh, t: 0, life: 0.65, R: 6 });
        }
        this.flashNext = 0;
    },

    drawFlash() {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.18, 'rgba(255,255,255,0.4)');
        g.addColorStop(0.75, 'rgba(255,255,255,0.18)');
        g.addColorStop(0.92, 'rgba(255,255,255,0.75)');
        g.addColorStop(0.97, 'rgba(255,255,255,0.3)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(c);
    },

    // Radial cracks around a scorched centre, drawn once.
    drawCrack() {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 120);
        g.addColorStop(0, 'rgba(255,255,255,0.8)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        const rnd = WeaponKit.rng(23);
        const crack = (x, y, a, len, w, depth) => {
            let px = x;
            let py = y;
            const steps = Math.max(3, Math.round(len / 9));
            for (let i = 0; i < steps; i++) {
                a += (rnd() - 0.5) * 0.7;
                const nx = px + Math.cos(a) * len / steps;
                const ny = py + Math.sin(a) * len / steps;
                ctx.lineWidth = Math.max(0.6, w * (1 - i / steps));
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(nx, ny);
                ctx.stroke();
                if (depth > 0 && rnd() < 0.22) {
                    crack(nx, ny, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * 0.45, w * 0.6, depth - 1);
                }
                px = nx;
                py = ny;
            }
        };
        for (let i = 0; i < 11; i++) {
            const a = (i / 11) * Math.PI * 2 + rnd() * 0.4;
            crack(128 + Math.cos(a) * 10, 128 + Math.sin(a) * 10, a, 70 + rnd() * 45, 4.5, 2);
        }
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const r = 22 + rnd() * 9;
            if (i === 0) {
                ctx.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
            } else {
                ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
            }
        }
        ctx.stroke();
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return tex;
    },

    // ------------------------------------------------------------------ floor queries

    colliders() {
        return Game.room ? Game.room.colliders : [];
    },

    // Highest collider top at (x, z) that is not above y; 0 (the room floor) if none.
    groundAt(x, y, z) {
        let best = 0;
        for (const b of this.colliders()) {
            if (b.off || x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) {
                continue;
            }
            const top = colTop(b, x, z);
            if (top <= y && top > best) {
                best = top;
            }
        }
        return best;
    },

    solidAt(x, y, z) {
        for (const b of this.colliders()) {
            if (!b.off && x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && y > b.min.y && y < colTop(b, x, z)) {
                return true;
            }
        }
        return false;
    },

    isEnemy(o) {
        for (; o; o = o.parent) {
            if (o.userData.enemy || o === Enemies.group) {
                return true;
            }
        }
        return false;
    },

    // What is under (x, y, z): the first upward-facing room surface in reach. Its colour, point,
    // normal, and the footprint of a box top (for the decal). Room boxes are never batched, and this
    // raycaster leaves BATCH_LAYER off so batched enemy meshes are skipped as well.
    sample(x, y, z, reach = 4) {
        this.init();
        const out = { point: new THREE.Vector3(x, y - reach, z), normal: new THREE.Vector3(0, 1, 0), color: new THREE.Color(0x77736c), box: null, hit: false };
        const room = Game.room;
        if (room) {
            this.ray.set(_gfv.set(x, y, z), this.DOWN);
            this.ray.far = reach;
            for (const h of this.ray.intersectObject(room.group, true)) {
                const m = h.object;
                if (!m.visible || !m.material || !m.material.color || this.isEnemy(m)) {
                    continue;
                }
                const n = h.face ? _gfv2.copy(h.face.normal).transformDirection(m.matrixWorld) : _gfv2.set(0, 1, 0);
                if (n.y < 0.5) {
                    continue;
                }
                out.point.copy(h.point);
                out.normal.copy(n);
                out.color.copy(m.material.color);
                out.hit = true;
                const P = m.geometry && m.geometry.parameters;
                if (P && P.width && P.depth) {
                    m.getWorldPosition(_gfv);
                    out.box = { x0: _gfv.x - P.width / 2, x1: _gfv.x + P.width / 2, z0: _gfv.z - P.depth / 2, z1: _gfv.z + P.depth / 2 };
                }
                return out;
            }
            out.point.y = this.groundAt(x, y, z);
        }
        return out;
    },

    // ------------------------------------------------------------------ spawning

    // o: { point, color (floor), glow (shockwave colour), power (0..1 air bonus), radius, box }
    slam(o) {
        this.init();
        this.sync();
        const k = o.power || 0;
        const R = Math.min(this.MAX_R - 0.5, o.radius || 6);
        const base = o.color.clone();
        const glow = new THREE.Color(o.glow === undefined ? this.GLOW : o.glow);
        const ring = this.spawnRing(o.point, R, glow, k);
        const edge = this.takeRing();
        if (edge !== ring) {
            edge.on = true;
            edge.fixed = true;
            edge.segs = ring.segs;
            edge.center.copy(ring.center);
            edge.R = R;
            edge.k = k;
            edge.t = -ring.dur * 0.8;
            edge.dur = 1.3 + 0.3 * k;
            edge.lift = 0.04;
            edge.limit.set(ring.limit);
            edge.heights.set(ring.heights);
            edge.glow.copy(glow);
            edge.mesh.material.uniforms.color.value.copy(glow).lerp(_gfc.set(0xffffff), 0.2);
            edge.mesh.geometry.setDrawRange(0, ring.segs * 12);
            edge.mesh.visible = false;
        }
        this.spawnFlash(o.point, R, glow);
        this.spawnDecal(o.point, base, 2.1 + 1.3 * k, o.box, glow);

        const K = WeaponKit;
        const dirt = _gfc.set(0x4a3b2e);
        const tint = () => {
            const c = base.clone().multiplyScalar(K.rand(0.74, 1.12));
            return c.lerp(dirt, K.rand(0, 0.18));
        };
        const n = Math.round(36 * (1 + 0.4 * k));
        for (let i = 0; i < n; i++) {
            if (i >= 5 && DETAIL.skip()) {
                continue;
            }
            const a = Math.random() * Math.PI * 2;
            const dx = Math.cos(a);
            const dz = Math.sin(a);
            if (i % 9 < 4) {
                // Burst from the impact itself.
                const sp = K.rand(2, 7) * (1 + 0.3 * k);
                this.spawnChunk(
                    _gfv.set(o.point.x + dx * K.rand(0.05, 0.4), o.point.y + 0.05, o.point.z + dz * K.rand(0.05, 0.4)),
                    _gfv2.set(dx * sp, K.rand(3, 8) * (1 + 0.3 * k), dz * sp),
                    K.rand(0.045, 0.12) * (1 + 0.35 * k), tint(), 0
                );
            } else {
                // Kicked up as the wave passes.
                const lim = ring ? this.limitAt(ring, a) : R;
                let d = K.rand(0.8, R * 0.9);
                if (d > lim) {
                    d = lim * K.rand(0.4, 0.95);
                }
                const delay = ring ? ring.dur * (1 - Math.cbrt(Math.max(0, 1 - d / R))) : 0;
                const y = ring ? this.heightAt(ring, a, d) : o.point.y;
                const sp = K.rand(0.8, 3);
                this.spawnChunk(
                    _gfv.set(o.point.x + dx * d, y + 0.04, o.point.z + dz * d),
                    _gfv2.set(dx * sp, K.rand(2, 4.8) * (1 + 0.25 * k), dz * sp),
                    K.rand(0.03, 0.08) * (1 + 0.25 * k), tint(), delay
                );
            }
        }

        const dust = base.clone().lerp(this.DUST, 0.45);
        const puffs = Math.round(26 * (1 + 0.5 * k));
        for (let i = 0; i < puffs; i++) {
            if (i >= 6 && DETAIL.skip()) {
                continue;
            }
            const a = (i / puffs) * Math.PI * 2 + Math.random() * 0.3;
            const sp = K.rand(3.5, 7) * (1 + 0.3 * k);
            this.spawnDust(
                _gfv.set(o.point.x + Math.cos(a) * 0.3, o.point.y + 0.12, o.point.z + Math.sin(a) * 0.3),
                _gfv2.set(Math.cos(a) * sp, K.rand(0.2, 1.1), Math.sin(a) * sp),
                dust, K.rand(0.25, 0.4), K.rand(0.8, 1.4) * (1 + 0.3 * k), K.rand(0.7, 1.3), 0.55
            );
        }
        for (let i = 0; i < 6; i++) {
            this.spawnDust(
                _gfv.set(o.point.x + K.rand(-0.3, 0.3), o.point.y + 0.2, o.point.z + K.rand(-0.3, 0.3)),
                _gfv2.set(K.rand(-0.6, 0.6), K.rand(1, 2.2), K.rand(-0.6, 0.6)),
                dust, 0.3, K.rand(1, 1.6) * (1 + 0.3 * k), K.rand(1, 1.6), 0.45
            );
        }
    },

    // Small puff of floor-coloured dust and a few chips, e.g. a swing scraping the ground.
    scuff(point, color, n = 4) {
        this.init();
        this.sync();
        const K = WeaponKit;
        const dust = color.clone().lerp(this.DUST, 0.45);
        for (let i = 0; i < n; i++) {
            this.spawnDust(_gfv.copy(point), _gfv2.set(K.rand(-1, 1), K.rand(0.3, 1), K.rand(-1, 1)), dust, 0.12, K.rand(0.35, 0.6), K.rand(0.4, 0.7), 0.4);
        }
    },

    spawnChunk(p, v, size, color, delay) {
        const i = this.chunkNext;
        this.chunkNext = (i + 1) % this.MAX_CHUNKS;
        const c = this.chunks[i];
        c.on = true;
        c.p.copy(p);
        c.v.copy(v);
        c.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
        WeaponKit.sphereDir(c.axis);
        c.spin = WeaponKit.rand(6, 16);
        c.size = size;
        c.t = 0;
        c.life = WeaponKit.rand(2.2, 3.4);
        c.delay = delay;
        c.settled = false;
        c.popped = delay <= 0;
        this.chunkMesh.setColorAt(i, color);
        this.chunkMesh.instanceColor.needsUpdate = true;
    },

    spawnDust(p, v, color, s0, s1, life, alpha) {
        const i = this.dustNext;
        this.dustNext = (i + 1) % this.MAX_DUST;
        const d = this.dust[i];
        d.on = true;
        d.p.copy(p);
        d.v.copy(v);
        d.t = 0;
        d.life = life;
        d.s0 = s0;
        d.s1 = s1;
        d.a = alpha;
        d.drag = 2.6;
        const j = i * 3;
        this.dustTint[j] = color.r;
        this.dustTint[j + 1] = color.g;
        this.dustTint[j + 2] = color.b;
    },

    // Walks out along each angle over the room's colliders, recording the floor height, and stops
    // at anything taller than a step (walls, pillars, cover, crates) or the room's edge.
    takeRing() {
        return this.rings.find(r => !r.on) || this.rings.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    },

    spawnRing(center, R, color, k) {
        const ring = this.takeRing();
        ring.fixed = false;
        ring.k = k;
        ring.glow.copy(color);
        const lod = DETAIL.particles >= 1 ? 'high' : DETAIL.particles >= 0.5 ? 'medium' : 'potato';
        const S = Math.min(this.RING_SEGS, DETAIL.seg(lod, this.RING_SEGS, 12));
        ring.on = true;
        ring.segs = S;
        ring.center.copy(center);
        ring.R = R;
        ring.t = 0;
        ring.dur = 0.55 + 0.15 * k;
        ring.lift = 0.28 + 0.14 * k;
        ring.mesh.material.uniforms.color.value.copy(color).lerp(_gfc.set(0xffffff), 0.12);
        ring.mesh.geometry.setDrawRange(0, S * 12);
        const steps = Math.ceil(R / this.STEP) + 1;
        const cols = this.colliders();
        for (let a = 0; a <= S; a++) {
            const ang = (a / S) * Math.PI * 2;
            const dx = Math.cos(ang);
            const dz = Math.sin(ang);
            let y = center.y;
            let lim = R;
            for (let s = 0; s < ring.steps; s++) {
                const d = s * this.STEP;
                if (s > 0 && s < steps && lim === R) {
                    const x = center.x + dx * d;
                    const z = center.z + dz * d;
                    let floor = 0;
                    let wall = false;
                    for (const b of cols) {
                        if (b.off || x < b.min.x - 0.05 || x > b.max.x + 0.05 || z < b.min.z - 0.05 || z > b.max.z + 0.05) {
                            continue;
                        }
                        const top = colTop(b, x, z);
                        if (top > y + 0.55) {
                            if (b.min.y < y + 1.2) {
                                wall = true;
                                break;
                            }
                        } else if (top > floor) {
                            floor = top;
                        }
                    }
                    if (wall) {
                        lim = Math.max(0, d - this.STEP * 0.6);
                    } else {
                        y = floor;
                    }
                }
                ring.heights[a * ring.steps + s] = y;
            }
            ring.limit[a] = lim;
        }
        ring.mesh.visible = true;
        return ring;
    },

    limitAt(ring, ang) {
        const S = ring.segs;
        const a = Math.round((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * S);
        return ring.limit[a % (S + 1)];
    },

    heightAt(ring, ang, d) {
        const S = ring.segs;
        const a = Math.round((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * S) % (S + 1);
        return this.heightOf(ring, a, d);
    },

    heightOf(ring, a, d) {
        const s = Math.max(0, Math.min(ring.steps - 1, Math.round(d / this.STEP)));
        return ring.heights[a * ring.steps + s];
    },

    spawnFlash(point, R, color) {
        const f = this.flashes[this.flashNext];
        this.flashNext = (this.flashNext + 1) % this.MAX_FLASH;
        f.on = true;
        f.t = 0;
        f.R = R;
        f.mesh.position.set(point.x, point.y + 0.02, point.z);
        f.mesh.rotation.y = Math.random() * Math.PI * 2;
        f.mesh.material.color.copy(color).multiplyScalar(0.8);
        f.mesh.material.opacity = 1;
        f.mesh.scale.setScalar(0.01);
        f.mesh.visible = true;
    },

    // Sized to the surface it lands on, so it does not hang off a crate or platform.
    spawnDecal(point, color, size, box, glow) {
        const d = this.decals[this.decalNext];
        this.decalNext = (this.decalNext + 1) % this.MAX_DECALS;
        let x = point.x;
        let z = point.z;
        if (box) {
            size = Math.min(size, box.x1 - box.x0, box.z1 - box.z0);
            x = Math.max(box.x0 + size / 2, Math.min(box.x1 - size / 2, x));
            z = Math.max(box.z0 + size / 2, Math.min(box.z1 - size / 2, z));
        }
        if (size < 0.3) {
            return;
        }
        d.on = true;
        d.t = 0;
        d.life = 6;
        d.size = size;
        d.mesh.position.set(x, point.y + 0.012, z);
        d.mesh.rotation.y = Math.random() * Math.PI * 2;
        d.mesh.material.color.copy(color).multiplyScalar(0.28);
        d.mesh.material.opacity = 1;
        d.mesh.visible = true;
        d.mesh.scale.setScalar(size * 0.5);
        d.glow.position.copy(d.mesh.position);
        d.glow.position.y += 0.003;
        d.glow.rotation.y = d.mesh.rotation.y;
        d.glow.material.color.set(glow === undefined ? this.GLOW : glow);
        d.glow.material.opacity = 1;
        d.glow.visible = true;
    },

    // ------------------------------------------------------------------ per frame

    sync() {
        if (Game.room !== this.room) {
            this.clear();
            this.room = Game.room;
        }
    },

    clear() {
        if (!this.ready) {
            return;
        }
        for (const c of this.chunks) {
            c.on = false;
        }
        _gfm.makeScale(0, 0, 0);
        for (let i = 0; i < this.MAX_CHUNKS; i++) {
            this.chunkMesh.setMatrixAt(i, _gfm);
        }
        this.chunkMesh.instanceMatrix.needsUpdate = true;
        for (const d of this.dust) {
            d.on = false;
        }
        this.dustAlpha.fill(0);
        this.dustPoints.geometry.attributes.alpha.needsUpdate = true;
        for (const r of this.rings) {
            r.on = false;
            r.mesh.visible = false;
        }
        for (const d of this.decals) {
            d.on = false;
            d.mesh.visible = false;
            d.glow.visible = false;
        }
        for (const f of this.flashes) {
            f.on = false;
            f.mesh.visible = false;
        }
    },

    update(dt) {
        if (!this.ready) {
            return;
        }
        this.sync();
        this.updateRings(dt);
        this.updateChunks(dt);
        this.updateDust(dt);
        for (const d of this.decals) {
            if (!d.on) {
                continue;
            }
            d.t += dt;
            d.mesh.scale.setScalar(d.size * (0.5 + 0.5 * WeaponKit.e('outCubic', d.t, 0, 0.18)));
            d.mesh.material.opacity = 1 - WeaponKit.seg(d.t, d.life - 2, d.life);
            d.glow.scale.copy(d.mesh.scale);
            d.glow.material.opacity = 1 - WeaponKit.e('inQuad', d.t, 0.2, 2.2);
            d.glow.visible = d.glow.material.opacity > 0.01;
            if (d.t >= d.life) {
                d.on = false;
                d.mesh.visible = false;
                d.glow.visible = false;
            }
        }
        for (const f of this.flashes) {
            if (!f.on) {
                continue;
            }
            f.t += dt;
            f.mesh.scale.setScalar(2 * f.R * (0.25 + 0.75 * WeaponKit.e('outCubic', f.t, 0, 0.22)));
            f.mesh.material.opacity = 0.6 * (1 - WeaponKit.e('inQuad', f.t, 0.05, f.life));
            if (f.t >= f.life) {
                f.on = false;
                f.mesh.visible = false;
            }
        }
    },

    updateRings(dt) {
        for (const ring of this.rings) {
            if (!ring.on) {
                continue;
            }
            ring.t += dt;
            if (ring.fixed) {
                this.updateEdge(ring);
                continue;
            }
            const u = ring.t / ring.dur;
            if (u >= 1) {
                ring.on = false;
                ring.mesh.visible = false;
                continue;
            }
            const r = ring.R * WeaponKit.ease.outCubic(u);
            const w = 0.35 + 0.5 * u;
            const c = ring.center;
            const P = ring.pos;
            const A = ring.alpha;
            const S = ring.segs;
            for (let a = 0; a <= S; a++) {
                const ang = (a / S) * Math.PI * 2;
                const dx = Math.cos(ang);
                const dz = Math.sin(ang);
                const lim = ring.limit[a];
                const rr = Math.min(r, lim);
                const fade = r > lim ? Math.max(0, 1 - (r - lim) / 0.5) : 1;
                const ri = Math.max(0, rr - w);
                const ro = Math.min(rr + w * 0.35, lim + 0.05);
                const j = a * 9;
                const yi = this.heightOf(ring, a, ri);
                const yc = this.heightOf(ring, a, rr);
                const yo = this.heightOf(ring, a, ro);
                P[j] = c.x + dx * ri;
                P[j + 1] = yi + 0.03;
                P[j + 2] = c.z + dz * ri;
                P[j + 3] = c.x + dx * rr;
                P[j + 4] = yc + 0.03 + ring.lift * fade * (1 - u);
                P[j + 5] = c.z + dz * rr;
                P[j + 6] = c.x + dx * ro;
                P[j + 7] = yo + 0.03;
                P[j + 8] = c.z + dz * ro;
                A[a * 3] = 0.3 * fade;
                A[a * 3 + 1] = fade;
                A[a * 3 + 2] = 0;
            }
            ring.mesh.material.uniforms.opacity.value = 0.95 * (1 - u * u);
            const g = ring.mesh.geometry;
            g.attributes.position.needsUpdate = true;
            g.attributes.alpha.needsUpdate = true;

            // Sparks thrown up off the wave front.
            ring.spark = (ring.spark || 0) + dt * 160 * (1 + ring.k) * (1 - u);
            const fx = typeof Enemies !== 'undefined' ? Enemies.fx : null;
            while (fx && ring.spark >= 1) {
                ring.spark -= 1;
                const a = Math.floor(Math.random() * S);
                const lim = ring.limit[a];
                if (r > lim) {
                    continue;
                }
                const ang = (a / S) * Math.PI * 2;
                const y = this.heightOf(ring, a, r) + 0.05;
                fx.emit(c.x + Math.cos(ang) * r, y, c.z + Math.sin(ang) * r,
                    Math.cos(ang) * WeaponKit.rand(0.5, 1.5), WeaponKit.rand(2, 4.5) * (1 + 0.3 * ring.k), Math.sin(ang) * WeaponKit.rand(0.5, 1.5),
                    Math.random() < 0.75 ? ring.glow : this.WHITE, WeaponKit.rand(0.4, 0.8), 6, 1.5);
            }
        }
    },

    // The edge of the hit area: a thin glowing ring at the radius (or the wall that stopped the
    // wave), lit once the wave reaches it, then fading.
    updateEdge(ring) {
        if (ring.t >= ring.dur) {
            ring.on = false;
            ring.mesh.visible = false;
            return;
        }
        if (ring.t < 0) {
            ring.mesh.visible = false;
            return;
        }
        ring.mesh.visible = true;
        const K = WeaponKit;
        const env = K.e('outCubic', ring.t, 0, 0.08) * (1 - K.e('inQuad', ring.t, 0.35, ring.dur));
        const c = ring.center;
        const P = ring.pos;
        const A = ring.alpha;
        const S = ring.segs;
        const w = 0.12;
        for (let a = 0; a <= S; a++) {
            const ang = (a / S) * Math.PI * 2;
            const dx = Math.cos(ang);
            const dz = Math.sin(ang);
            const rr = Math.min(ring.R, ring.limit[a]);
            const j = a * 9;
            const yc = this.heightOf(ring, a, rr);
            P[j] = c.x + dx * (rr - w);
            P[j + 1] = this.heightOf(ring, a, rr - w) + 0.03;
            P[j + 2] = c.z + dz * (rr - w);
            P[j + 3] = c.x + dx * rr;
            P[j + 4] = yc + 0.03 + ring.lift;
            P[j + 5] = c.z + dz * rr;
            P[j + 6] = c.x + dx * (rr + w * 0.5);
            P[j + 7] = yc + 0.03;
            P[j + 8] = c.z + dz * (rr + w * 0.5);
            A[a * 3] = 0;
            A[a * 3 + 1] = 1;
            A[a * 3 + 2] = 0;
        }
        ring.mesh.material.uniforms.opacity.value = 0.9 * env;
        const g = ring.mesh.geometry;
        g.attributes.position.needsUpdate = true;
        g.attributes.alpha.needsUpdate = true;
    },

    updateChunks(dt) {
        let dirty = false;
        for (let i = 0; i < this.MAX_CHUNKS; i++) {
            const c = this.chunks[i];
            if (!c.on) {
                continue;
            }
            dirty = true;
            if (c.delay > 0) {
                c.delay -= dt;
                if (c.delay > 0) {
                    _gfm.makeScale(0, 0, 0);
                    this.chunkMesh.setMatrixAt(i, _gfm);
                    continue;
                }
            }
            if (!c.popped) {
                c.popped = true;
                const col = this.chunkMesh.instanceColor;
                _gfc.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(this.DUST, 0.45);
                if (!DETAIL.skip()) {
                    this.spawnDust(c.p, _gfv2.set(c.v.x * 0.3, 0.6, c.v.z * 0.3), _gfc, 0.15, 0.55, 0.6, 0.45);
                }
            }
            c.t += dt;
            const s = c.size;
            if (!c.settled) {
                c.v.y -= 25 * dt;
                const nx = c.p.x + c.v.x * dt;
                const nz = c.p.z + c.v.z * dt;
                if (this.solidAt(nx, c.p.y + s * 0.3, nz)) {
                    c.v.x *= -0.35;
                    c.v.z *= -0.35;
                } else {
                    c.p.x = nx;
                    c.p.z = nz;
                }
                c.p.y += c.v.y * dt;
                const g = this.groundAt(c.p.x, c.p.y + 0.3, c.p.z) + s * 0.55;
                if (c.p.y < g) {
                    c.p.y = g;
                    if (c.v.y < -1.6) {
                        c.v.y *= -0.3;
                        c.v.x *= 0.55;
                        c.v.z *= 0.55;
                        c.spin *= 0.55;
                    } else {
                        c.v.set(0, 0, 0);
                        c.settled = true;
                    }
                }
                _gfq.setFromAxisAngle(c.axis, c.spin * dt);
                c.q.premultiply(_gfq);
            }
            const k = c.t > c.life ? 1 - (c.t - c.life) / 0.8 : Math.min(1, c.t / 0.06 + 0.3);
            if (k <= 0) {
                c.on = false;
                _gfm.makeScale(0, 0, 0);
                this.chunkMesh.setMatrixAt(i, _gfm);
                continue;
            }
            const sink = c.t > c.life ? (c.t - c.life) * s * 0.6 : 0;
            _gfv.copy(c.p);
            _gfv.y -= sink;
            _gfm.compose(_gfv, c.q, _gfs.setScalar(s * k));
            this.chunkMesh.setMatrixAt(i, _gfm);
        }
        if (dirty) {
            this.chunkMesh.instanceMatrix.needsUpdate = true;
        }
    },

    updateDust(dt) {
        let live = false;
        for (let i = 0; i < this.MAX_DUST; i++) {
            const d = this.dust[i];
            if (!d.on) {
                continue;
            }
            live = true;
            d.t += dt;
            const u = d.t / d.life;
            const j = i * 3;
            if (u >= 1) {
                d.on = false;
                this.dustAlpha[i] = 0;
                continue;
            }
            const k = Math.exp(-d.drag * dt);
            d.v.x *= k;
            d.v.z *= k;
            d.v.y = d.v.y * k + 0.15 * dt;
            d.p.addScaledVector(d.v, dt);
            this.dustPos[j] = d.p.x;
            this.dustPos[j + 1] = d.p.y;
            this.dustPos[j + 2] = d.p.z;
            this.dustSize[i] = WeaponKit.lerp(d.s0, d.s1, WeaponKit.ease.outCubic(u));
            this.dustAlpha[i] = d.a * Math.min(1, d.t / 0.06) * (1 - u) * (1 - u);
        }
        if (live || this.dustLive) {
            const a = this.dustPoints.geometry.attributes;
            a.position.needsUpdate = true;
            a.alpha.needsUpdate = true;
            a.size.needsUpdate = true;
            a.tint.needsUpdate = true;
            this.dustMat.uniforms.scale.value = renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360);
        }
        this.dustLive = live;
    }
};
