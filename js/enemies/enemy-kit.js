const GRAV = 25;
const _ev = new THREE.Vector3();
const _ev2 = new THREE.Vector3();
const _sphere = new THREE.Sphere();

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampN(v, a, b) {
    return v < a ? a : v > b ? b : v;
}
function wrapAngle(a) {
    while (a > Math.PI) {
        a -= Math.PI * 2;
    }
    while (a < -Math.PI) {
        a += Math.PI * 2;
    }
    return a;
}

const _ik = {
    d: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(), p: new THREE.Vector3(),
    k: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),
    m: new THREE.Matrix4(), q: new THREE.Quaternion()
};

function boneQuat(dir, pole, out) {
    const y = _ik.y.copy(dir).negate();
    const z = _ik.z.copy(pole).addScaledVector(y, -pole.dot(y));
    if (z.lengthSq() < 1e-6) {
        z.set(0, 0, 1).addScaledVector(y, -y.z);
    }
    z.normalize();
    const x = _ik.x.crossVectors(y, z);
    _ik.m.makeBasis(x, y, z);
    return out.setFromRotationMatrix(_ik.m);
}

function solveTwoBone(rootPos, target, a, b, pole, qUpper, qLower) {
    const d = _ik.d.subVectors(target, rootPos);
    const dist = clampN(d.length(), Math.abs(a - b) + 0.02, (a + b) * 0.999);
    d.normalize();
    const A = Math.acos(clampN((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1));
    const pp = _ik.p.copy(pole).addScaledVector(d, -pole.dot(d));
    if (pp.lengthSq() < 1e-6) {
        pp.set(0, 0, 1);
    }
    pp.normalize();
    const u = _ik.u.copy(d).multiplyScalar(Math.cos(A)).addScaledVector(pp, Math.sin(A));
    const knee = _ik.k.copy(rootPos).addScaledVector(u, a);
    const v = _ik.v.copy(rootPos).addScaledVector(d, dist).sub(knee).normalize();
    boneQuat(u, pp, qUpper);
    boneQuat(v, pp, _ik.q);
    qLower.copy(qUpper).invert().multiply(_ik.q);
}

class SporeCloud {
    constructor(max = 1200) {
        this.max = max;
        this.cap = max;
        this.next = 0;
        this.pos = new Float32Array(max * 3);
        this.col = new Float32Array(max * 3);
        this.base = new Float32Array(max * 3);
        this.vel = new Float32Array(max * 3);
        this.age = new Float32Array(max);
        this.life = new Float32Array(max);
        this.grav = new Float32Array(max);
        this.drag = new Float32Array(max);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const ctx = c.getContext('2d');
        const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grd.addColorStop(0, '#fff');
        grd.addColorStop(0.35, 'rgba(255,255,255,.6)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 32, 32);
        this.points = new THREE.Points(g, new THREE.PointsMaterial({
            size: 0.09, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false
        }));
        this.points.frustumCulled = false;
        this.reset();
    }
    reset() {
        this.age.fill(1);
        this.life.fill(0);
        this.col.fill(0);
        this.pos.fill(0);
        this.points.geometry.attributes.color.needsUpdate = true;
    }
    setAmount(k) {
        this.cap = Math.max(32, Math.round(this.max * k));
        this.next %= this.cap;
        for (let i = this.cap; i < this.max; i++) {
            this.age[i] = 1;
            this.life[i] = 0;
        }
        this.points.geometry.setDrawRange(0, this.cap);
    }
    emit(x, y, z, vx, vy, vz, color, life, grav = 0, drag = 1) {
        if (DETAIL.skip()) {
            return;
        }
        const i = this.next;
        this.next = (i + 1) % this.cap;
        const j = i * 3;
        this.pos[j] = x;
        this.pos[j + 1] = y;
        this.pos[j + 2] = z;
        this.vel[j] = vx;
        this.vel[j + 1] = vy;
        this.vel[j + 2] = vz;
        this.base[j] = color.r;
        this.base[j + 1] = color.g;
        this.base[j + 2] = color.b;
        this.age[i] = 0;
        this.life[i] = life;
        this.grav[i] = grav;
        this.drag[i] = drag;
    }
    burst(p, n, color, speed, life, o = {}) {
        for (let k = 0; k < n; k++) {
            const u = Math.random() * 2 - 1;
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(1 - u * u);
            const s = speed * (0.4 + Math.random() * 0.6);
            this.emit(p.x, p.y, p.z, Math.cos(a) * r * s, u * s + (o.up || 0), Math.sin(a) * r * s,
                color, life * (0.6 + Math.random() * 0.6), o.grav || 0, o.drag || 2);
        }
    }
    update(dt) {
        const { pos, vel, col, base, age, life, grav, drag } = this;
        for (let i = 0; i < this.cap; i++) {
            const j = i * 3;
            if (age[i] >= life[i]) {
                if (col[j] || col[j + 1] || col[j + 2]) {
                    col[j] = col[j + 1] = col[j + 2] = 0;
                }
                continue;
            }
            age[i] += dt;
            const k = Math.exp(-drag[i] * dt);
            vel[j] *= k;
            vel[j + 1] = vel[j + 1] * k - grav[i] * dt;
            vel[j + 2] *= k;
            pos[j] += vel[j] * dt;
            pos[j + 1] += vel[j + 1] * dt;
            pos[j + 2] += vel[j + 2] * dt;
            const f = 1 - age[i] / life[i];
            const fade = f * f;
            col[j] = base[j] * fade;
            col[j + 1] = base[j + 1] * fade;
            col[j + 2] = base[j + 2] * fade;
        }
        const a = this.points.geometry.attributes;
        a.position.needsUpdate = true;
        a.color.needsUpdate = true;
    }
}

class Memory {
    constructor() {
        this.tracks = new Map();
    }
    byId(id) {
        let s = this.tracks.get(id);
        if (!s) {
            s = {
                id, pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: -1e9,
                shotPos: new THREE.Vector3(), shotT: -1e9, searched: []
            };
            this.tracks.set(id, s);
        }
        return s;
    }
    track(who) {
        return this.byId(who.id);
    }
    known(who) {
        return this.track(who).t > -1e8;
    }
    age(who, now) {
        return now - this.track(who).t;
    }
    freshest() {
        let best = null;
        for (const s of this.tracks.values()) {
            if (s.t > -1e8 && (!best || s.t > best.t)) {
                best = s;
            }
        }
        return best;
    }
    saw(who, pos, vel, now) {
        const s = this.track(who);
        s.pos.copy(pos);
        if (vel) {
            s.vel.set(vel.x, 0, vel.z);
        } else {
            s.vel.set(0, 0, 0);
        }
        s.t = now;
        s.searched.length = 0;
    }
    heard(who, pos, now) {
        const s = this.track(who);
        if (now - s.t > 1.5) {
            s.pos.copy(pos);
            s.vel.set(0, 0, 0);
            s.t = now - 1.5;
        }
    }
    shot(who, pos, now) {
        const s = this.track(who);
        s.shotPos.copy(pos);
        s.shotT = now;
    }
    predict(who, now, out) {
        const s = this.track(who);
        const k = Math.min(now - s.t, 2.5) * 0.8;
        return out.copy(s.pos).addScaledVector(s.vel, k);
    }
    mark(who, x, z) {
        const list = this.track(who).searched;
        list.push({ x, z });
        if (list.length > 32) {
            list.shift();
        }
    }
    searchedNear(who, x, z, r = 3) {
        for (const s of this.track(who).searched) {
            if (Math.hypot(s.x - x, s.z - z) < r) {
                return true;
            }
        }
        return false;
    }
    absorb(o) {
        for (const from of o.tracks.values()) {
            const s = this.byId(from.id);
            if (from.t > s.t) {
                s.pos.copy(from.pos);
                s.vel.copy(from.vel);
                s.t = from.t;
            }
            if (from.shotT > s.shotT) {
                s.shotPos.copy(from.shotPos);
                s.shotT = from.shotT;
            }
            for (const p of from.searched) {
                if (!this.searchedNear(s, p.x, p.z, 1)) {
                    this.mark(s, p.x, p.z);
                }
            }
        }
    }
}

class Enemy {
    constructor(def, x, y, z) {
        this.def = def;
        this.type = def.id;
        const mv = def.move || {};
        this.accel = mv.accel || 6;
        this.decel = mv.decel || 9;
        this.turnRate = mv.turn || 4;
        this.reach = mv.reach || 1.4;
        this.pos = new THREE.Vector3(x, y, z);
        this.home = new THREE.Vector3(x, y, z);
        this.vel = new THREE.Vector3();
        this.want = new THREE.Vector3();
        this.wantS = new THREE.Vector3();
        this.strafe = false;
        this.yaw = Rng.ai() * Math.PI * 2;
        this.faceYaw = this.yaw;
        this.yawVel = 0;
        this.visY = y;
        this.onGround = true;
        this.radius = def.radius;
        this.height = def.height;
        this.hp = this.maxHp = def.hp;
        this.dr = 0;
        this.crouch = 0;
        this.crouchTarget = 0;
        this.dead = false;
        this.root = new THREE.Group();
        this.root.name = def.id;
        this.root.rotation.order = 'YXZ';
        this.root.userData.enemy = this;

        this.mind = null;
        this.pack = null;
        this.engaged = false;
        this.intent = 'idle';
        this.role = null;
        this.thought = 'idle';
        this.alert = 0;
        this.alertFloor = 0;
        this.seesPlayer = false;
        this.mem = new Memory();
        this.id = 0;
        this.target = null;
        this.targetT = 0;
        this.hitBy = null;
        this.hitT = -1e9;
        this.goal = new THREE.Vector3(x, y, z);
        this.goalSet = false;
        this.spot = new THREE.Vector3();
        this.action = null;
        this.cd = {};
        this.senseT = Rng.ai() * 0.25;
        this.thinkT = Rng.ai() * 0.35;

        this.path = null;
        this.pathI = 0;
        this.pathT = 0;
        this.goalCell = -1;
        this.chain = [];
        this.dbgCells = null;
        this.dbgI = 0;
        this.climbing = false;
        this.stuckT = 0;
        this.stuckRef = new THREE.Vector3(x, y, z);
        this.onScreen = true;
    }

    cool(name) {
        return !(this.cd[name] > 0);
    }

    syncBatch() {
        const want = DETAIL.enemies !== 'high' && Batch.supported();
        if (want && !this.batch) {
            this.batch = new MeshBatch(this.root, { bounds: new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.5) });
        } else if (!want) {
            this.dropBatch();
        }
        if (this.batch) {
            this.batch.sync();
        }
    }

    dropBatch() {
        if (this.batch) {
            this.batch.dispose();
            this.batch = null;
        }
    }

    stop() {
        this.want.set(0, 0, 0);
    }
    face(x, z) {
        this.faceYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
    }
    steer(x, z, speed, face = true) {
        const dx = x - this.pos.x;
        const dz = z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.1) {
            this.stop();
            return d;
        }
        const s = Math.min(speed, d * 2.2);
        this.want.set(dx / d * s, 0, dz / d * s);
        if (face) {
            this.faceYaw = Math.atan2(dx, dz);
        }
        return d;
    }

    navTo(x, z, speed, now) {
        const nav = Enemies.nav;
        let goal = nav.cell(x, z);
        if (nav.blocked[goal]) {
            goal = nav.nearest(x, z, i => nav.open(i), 6);
            if (goal < 0) {
                this.stop();
                return 0;
            }
        }
        const here = this.navCell();
        const d = Math.hypot(x - this.pos.x, z - this.pos.z);
        if (goal === here || (d < 3 && Math.abs(nav.h[goal] - this.pos.y) < Nav.STEP && nav.straight(here, goal))) {
            this.path = null;
            this.dbgCells = null;
            this.steer(x, z, speed);
            return d;
        }
        const stale = !this.path || now > this.pathT || nav.cellDist(goal, this.goalCell) > 3;
        if (stale && Enemies.pathBudget > 0) {
            Enemies.pathBudget--;
            this.path = nav.path(here, goal);
            this.pathI = 1;
            this.goalCell = goal;
            this.pathT = now + 0.8 + Rng.ai() * 0.5;
        }
        if (!this.path || this.pathI >= this.path.length) {
            this.steer(x, z, speed);
            return d;
        }
        const p = this.path;
        while (this.pathI < p.length - 1 && this.reached(p[this.pathI])) {
            this.pathI++;
        }
        this.dbgCells = p;
        this.dbgI = this.pathI;
        this.travel(p, this.pathI, here, speed);
        return d;
    }

    chase(speed, now) {
        const nav = Enemies.nav;
        const T = this.target;
        const P = T.pos;
        const dx = P.x - this.pos.x;
        const dz = P.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const dy = P.y - this.pos.y;
        if (d < this.reach && Math.abs(dy) < 0.9) {
            this.stop();
            this.face(P.x, P.z);
            return d;
        }
        if (d < 3 && Math.abs(dy) < 0.9) {
            this.path = null;
            this.dbgCells = null;
            this.steer(P.x, P.z, speed);
            return d;
        }
        const here = this.navCell();
        const f = nav.flowTo(T, Enemies.chaseCell, now);
        if (dy > 1 && d < (this.def.climbReach || 3.6) && this.onGround && this.cool('leap') && !this.action) {
            const viaNav = f.dist[here];
            const direct = d / nav.cs + nav.climbCost(dy);
            if (!isFinite(viaNav) || viaNav > direct * 1.15) {
                this.cd.leap = 1.6;
                this.leap(P.x, P.y, P.z, P.y + 0.8, 'climb');
                return d;
            }
        }
        if (!isFinite(f.dist[here])) {
            return this.navTo(P.x, P.z, speed, now);
        }
        const chain = this.chain;
        chain.length = 0;
        chain.push(here);
        let c = here;
        for (let k = 0; k < 8; k++) {
            const n = nav.downhill(c, f);
            if (n < 0) {
                break;
            }
            chain.push(n);
            c = n;
        }
        if (chain.length < 2) {
            if (this.onGround && this.pos.y - nav.h[here] > Nav.STEP) {
                let dx = nav.cx(here) - this.pos.x;
                let dz = nav.cz(here) - this.pos.z;
                let l = Math.hypot(dx, dz);
                if (l < 0.1) {
                    dx = this.pos.x - P.x;
                    dz = this.pos.z - P.z;
                    l = Math.hypot(dx, dz) || 1;
                }
                this.steer(this.pos.x + dx / l * 1.5, this.pos.z + dz / l * 1.5, Math.max(2, speed * 0.6));
                return d;
            }
            this.steer(P.x, P.z, speed);
            return d;
        }
        this.dbgCells = chain;
        this.dbgI = 1;
        this.travel(chain, 1, here, speed);
        return d;
    }

    navCell() {
        const nav = Enemies.nav;
        const c = nav.cell(this.pos.x, this.pos.z);
        if (!nav.blocked[c]) {
            return c;
        }
        const n = nav.nearest(this.pos.x, this.pos.z, i => nav.open(i) && Math.abs(nav.h[i] - this.pos.y) < Nav.STEP + 0.3, 2);
        return n >= 0 ? n : c;
    }

    reached(cell) {
        const nav = Enemies.nav;
        return Math.hypot(nav.cx(cell) - this.pos.x, nav.cz(cell) - this.pos.z) < 0.55 &&
            Math.abs(nav.h[cell] - this.pos.y) < Nav.STEP + 0.2;
    }

    travel(cells, i, here, speed) {
        const nav = Enemies.nav;
        const next = cells[i];
        const prev = i > 0 ? cells[i - 1] : here;
        const below = nav.h[here] - this.pos.y > Nav.STEP;
        if (nav.ramp[here] || nav.ramp[next]) {
            speed *= 1.3;
        }
        if (nav.h[next] - this.pos.y > Nav.STEP && (below || (nav.h[next] - Math.min(nav.h[prev], nav.h[here]) > Nav.STEP &&
            nav.h[next] - nav.h[prev] > Nav.STEP))) {
            const dx = nav.cx(next) - this.pos.x;
            const dz = nav.cz(next) - this.pos.z;
            if (this.onGround && !this.action && Math.hypot(dx, dz) < 1.5) {
                this.jumpUp(cells, i);
            } else {
                this.steer(nav.cx(next), nav.cz(next), Math.min(speed, 2.5));
            }
            return;
        }
        if (nav.h[next] - this.pos.y < -Nav.STEP && this.onGround && !this.action && this.dropOff(cells, i)) {
            return;
        }
        let t = i;
        for (let k = Math.min(cells.length - 1, i + 7); k > i; k--) {
            if (nav.h[cells[k]] - this.pos.y <= Nav.STEP && nav.straight(here, cells[k])) {
                t = k;
                break;
            }
        }
        this.steer(nav.cx(cells[t]), nav.cz(cells[t]), speed);
    }

    jumpUp(cells, i) {
        const nav = Enemies.nav;
        const c = cells[i];
        const top = nav.h[c];
        if (top - this.pos.y < Nav.VAULT) {
            let peak = top;
            for (let j = i + 1; j < Math.min(cells.length, i + 5); j++) {
                const h = nav.h[cells[j]];
                if (h <= this.pos.y + Nav.STEP) {
                    this.leap(nav.cx(cells[j]), h, nav.cz(cells[j]), peak + 0.5, 'vault');
                    return;
                }
                peak = Math.max(peak, h);
            }
        }
        const dx = nav.cx(c) - this.pos.x;
        const dz = nav.cz(c) - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.leap(nav.cx(c) + dx / d * 0.5, top, nav.cz(c) + dz / d * 0.5, top + 0.6,
            top - this.pos.y > Nav.VAULT ? 'climb' : 'hop');
    }

    leap(x, y, z, apex, kind) {
        const up = Math.max(0.3, apex - this.pos.y);
        const vy = Math.sqrt(2 * GRAV * up);
        const T = vy / GRAV + Math.sqrt(2 * Math.max(0.05, apex - y) / GRAV);
        const dx = x - this.pos.x;
        const dz = z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const vh = Math.min(8, d / T);
        if (d > 0.01) {
            this.vel.x = dx / d * vh;
            this.vel.z = dz / d * vh;
            this.faceYaw = Math.atan2(dx, dz);
        }
        this.vel.y = vy;
        this.onGround = false;
        this.climbing = kind === 'climb';
        this.action = { name: kind, t: 0, dur: T + 0.6, air: true, land: new THREE.Vector3(x, y, z), vh };
    }

    dash(dx, dz, speed, dur, name, extra = {}) {
        const d = Math.hypot(dx, dz) || 1;
        this.vel.x = dx / d * speed;
        this.vel.z = dz / d * speed;
        this.action = Object.assign({ name, t: 0, dur, dash: true, dir: new THREE.Vector3(dx / d, 0, dz / d), speed }, extra);
    }

    update(dt, now) {
        for (const k in this.cd) {
            this.cd[k] -= dt;
        }
        const a = this.action;
        if (a) {
            a.t += dt;
        }
        this.wantS.lerp(this.want, 1 - Math.exp(-7 * dt));

        if (a && a.air) {
            if (a.land) {
                const dx = a.land.x - this.pos.x;
                const dz = a.land.z - this.pos.z;
                const d = Math.hypot(dx, dz);
                if (d > 0.15) {
                    const k = 1 - Math.exp(-6 * dt);
                    this.vel.x += (dx / d * a.vh - this.vel.x) * k;
                    this.vel.z += (dz / d * a.vh - this.vel.z) * k;
                }
            }
            if (this.onGround && a.t > 0.12) {
                this.action = null;
                this.climbing = false;
                this.landed();
            } else if (a.t > a.dur) {
                this.action = null;
                this.climbing = false;
            }
        } else if (a && a.dash && a.t < a.dur) {
            this.vel.x = a.dir.x * a.speed;
            this.vel.z = a.dir.z * a.speed;
        } else if (a && a.coast && !this.onGround) {
        } else {
            this.locomote(dt);
        }
        this.physics(dt);

        const turn = wrapAngle(this.faceYaw - this.yaw);
        const target = clampN(turn * 5, -this.turnRate, this.turnRate);
        this.yawVel += (target - this.yawVel) * (1 - Math.exp(-10 * dt));
        this.yaw = wrapAngle(this.yaw + this.yawVel * dt);
        this.crouch += (this.crouchTarget - this.crouch) * (1 - Math.exp(-7 * dt));
        this.visY = this.onGround ? this.visY + (this.pos.y - this.visY) * (1 - Math.exp(-16 * dt)) : this.pos.y;

        const wantSpeed = Math.hypot(this.want.x, this.want.z);
        this.stuckT += dt;
        if (this.stuckT > 1.2) {
            if (wantSpeed > 1 && this.onGround && !this.action && this.pos.distanceTo(this.stuckRef) < 0.3) {
                this.path = null;
                this.pathT = 0;
                this.unstick();
            }
            this.stuckT = 0;
            this.stuckRef.copy(this.pos);
        }

        _sphere.center.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z);
        _sphere.radius = 1.6;
        this.onScreen = Enemies.frustum.intersectsSphere(_sphere);
        this.root.position.set(this.pos.x, this.visY, this.pos.z);
        this.root.rotation.y = this.yaw;
        if (this.onScreen || Players.local.pos.distanceTo(this.pos) < 8) {
            this.animate(dt, now);
        }
    }

    dropOff() {
        return false;
    }

    unstick() {
        this.vel.y = 6.5;
        this.vel.x += (Rng.ai() - 0.5) * 3;
        this.vel.z += (Rng.ai() - 0.5) * 3;
        this.onGround = false;
    }

    locomote(dt) {
        let tx = this.wantS.x;
        let tz = this.wantS.z;
        const ws = Math.hypot(tx, tz);
        if (ws > 0.05 && !this.strafe) {
            const diff = wrapAngle(Math.atan2(tx, tz) - this.yaw);
            const k = clampN(0.15 + 0.85 * Math.cos(diff), 0.15, 1);
            tx *= k;
            tz *= k;
        }
        const dx = tx - this.vel.x;
        const dz = tz - this.vel.z;
        const dv = Math.hypot(dx, dz);
        const speeding = Math.hypot(tx, tz) > Math.hypot(this.vel.x, this.vel.z);
        const lim = (this.onGround ? (speeding ? this.accel : this.decel) : 1.5) * dt;
        const k = dv > lim ? lim / dv : 1;
        this.vel.x += dx * k;
        this.vel.z += dz * k;
    }

    bodyHeight() {
        return this.height * (1 - 0.35 * this.crouch);
    }

    physics(dt) {
        const h = this.bodyHeight();
        const r = this.radius;
        this.vel.y -= GRAV * dt;
        const p = _ev.copy(this.pos);
        p.x += this.vel.x * dt;
        this.slide(p, 'x', r, h);
        p.z += this.vel.z * dt;
        this.slide(p, 'z', r, h);
        p.y += this.vel.y * dt;
        const was = this.onGround;
        this.onGround = false;
        const hit = Enemies.hits(p, r, h);
        if (hit) {
            if (this.vel.y <= 0) {
                p.y = colTop(hit, p.x, p.z);
                this.onGround = true;
            } else {
                p.y = this.pos.y;
            }
            this.vel.y = 0;
        }
        if (!this.onGround && was && this.vel.y <= 0 && p.y > 0 && !(this.action && (this.action.air || this.action.coast))) {
            const y = p.y;
            p.y = y - 0.6;
            const below = Enemies.hits(p, r, h);
            p.y = y;
            const top = below ? colTop(below, p.x, p.z) : -1;
            if (below && top <= y + 1e-3 && top >= y - 0.6) {
                p.y = top;
                this.vel.y = 0;
                this.onGround = true;
            }
        }
        if (p.y <= 0) {
            p.y = 0;
            this.vel.y = 0;
            this.onGround = true;
        }
        this.pos.copy(p);
        if (!was && this.onGround && !(this.action && this.action.air)) {
            this.landed();
        }
    }

    slide(p, axis, r, h) {
        const b = Enemies.hits(p, r, h);
        if (!b) {
            return;
        }
        const y = p.y;
        const top = colTop(b, p.x, p.z);
        const lift = this.onGround || b.slope ? (top - y <= Nav.STEP + 0.1 ? top - y + 1e-3 : 0)
            : (top - y <= 1.1 && this.vel.y > -5 ? top - y + 0.02 : 0);
        if (lift > 0) {
            p.y = y + lift;
            if (!Enemies.hits(p, r, h)) {
                return;
            }
            p.y = y;
        }
        if (this.climbing && top - y < 3.8) {
            this.vel.y = Math.max(this.vel.y, 7.5);
        }
        p[axis] = this.pos[axis];
        this.vel[axis] = 0;
    }

    landed() {}
    animate() {}
}

class Pack {
    constructor() {
        this.members = [];
        this.mem = new Memory();
        this.anger = 0;
        this.lust = 0;
        this.base = 0.15;
        this.mood = 'wary';
        this.engaged = false;
        this.hunting = false;
        this.dirty = true;
        this.roleT = 0;
    }
    get aggression() {
        return clamp01(this.base + this.anger + this.lust);
    }
    share(who, pos, now, vel) {
        this.mem.saw(who, pos, vel, now);
    }
}

class HiveMind {
    constructor(def) {
        this.def = def;
        this.cfg = def.brain;
        this.members = [];
        this.packs = [];
        this.packT = 0;
    }

    add(e) {
        this.members.push(e);
        e.mind = this;
    }
    remove(e) {
        const i = this.members.indexOf(e);
        if (i >= 0) {
            this.members.splice(i, 1);
        }
        if (e.pack) {
            this.leave(e);
        }
    }

    update(dt, now) {
        const targets = Enemies.targets;
        this.packT -= dt;
        if (this.packT <= 0) {
            this.packT = 0.4;
            if (targets.length) {
                for (let i = this.packs.length - 1; i >= 0; i--) {
                    this.assess(this.packs[i], now);
                }
            }
        }
        const cfg = this.cfg;
        for (const e of this.members) {
            if (e.dead) {
                continue;
            }
            if (!targets.length) {
                e.target = null;
                e.seesPlayer = false;
                e.stop();
                continue;
            }
            if (!e.target || !targets.includes(e.target)) {
                this.retarget(e, now);
            }
            Enemies.enterLayer(e);
            if ((e.senseT -= dt) <= 0) {
                e.senseT += cfg.senseEvery;
                this.sense(e, now);
            }
            if ((e.thinkT -= dt) <= 0) {
                e.thinkT += cfg.thinkEvery * (e.engaged ? 1 : 1.6);
                this.think(e, now);
            }
            this.act(e, dt, now);
        }
    }

    retarget(e, now) {
        const K = CONFIG.targeting;
        const list = Enemies.targets;
        const prev = e.target;
        const cur = list.includes(prev) ? prev : null;
        let best = null;
        let bestScore = -Infinity;
        let bestSee = 0;
        let curSee = 0;
        for (const p of list) {
            const see = this.vision(e, p);
            let score = -e.pos.distanceTo(p.pos);
            if (see > 0) {
                score += K.seen;
            }
            if (p === cur) {
                score += K.stick;
                curSee = see;
            }
            if (p === e.hitBy && now - e.hitT < K.attackerFor) {
                score += K.attacker;
            }
            if (score > bestScore) {
                best = p;
                bestScore = score;
                bestSee = see;
            }
        }
        if (cur && best !== cur && (now < e.targetT || (e.action && e.action.lock))) {
            return curSee;
        }
        if (best !== prev) {
            e.target = best;
            e.targetT = now + K.hold;
            if (prev) {
                this.onRetarget(e, prev);
            }
        }
        return bestSee;
    }

    onRetarget(e) {
        e.path = null;
        e.pathT = 0;
        e.thinkT = 0;
        if (e.pack) {
            e.pack.dirty = true;
        }
    }

    newPack(e) {
        const p = new Pack();
        p.base = this.cfg.baseAggro !== undefined ? this.cfg.baseAggro : 0.15;
        this.packs.push(p);
        this.join(p, e);
        return p;
    }
    join(p, e) {
        if (e.pack === p) {
            return;
        }
        if (e.pack) {
            this.leave(e);
        }
        p.members.push(e);
        e.pack = p;
        p.mem.absorb(e.mem);
        p.dirty = true;
    }
    leave(e) {
        const p = e.pack;
        e.pack = null;
        e.role = null;
        if (!p) {
            return;
        }
        const i = p.members.indexOf(e);
        if (i >= 0) {
            p.members.splice(i, 1);
        }
        p.dirty = true;
        if (!p.members.length) {
            const k = this.packs.indexOf(p);
            if (k >= 0) {
                this.packs.splice(k, 1);
            }
        }
    }
    merge(into, from) {
        if (into === from) {
            return;
        }
        into.mem.absorb(from.mem);
        into.anger = Math.max(into.anger, from.anger);
        into.lust = Math.max(into.lust, from.lust);
        for (const m of from.members.slice()) {
            this.join(into, m);
        }
    }
    memOf(e) {
        return e.pack ? e.pack.mem : e.mem;
    }

    broadcast(e, radius, now) {
        const p = e.pack || this.newPack(e);
        p.mem.absorb(e.mem);
        const kin = [];
        for (const k of this.members) {
            if (k === e || k.dead || k.pos.distanceTo(e.pos) > radius) {
                continue;
            }
            kin.push(k);
            if (k.pack && k.pack !== p) {
                this.merge(p, k.pack);
            } else if (!k.pack) {
                this.join(p, k);
            }
        }
        p.engaged = true;
        p.hunting = true;
        for (const k of kin) {
            this.called(k, e, now);
        }
        Enemies.commFx(e, kin, this.def.color);
        return kin.length;
    }

    assess() {}
    called() {}
    sense() {}
    think() {}
    act() {}
    hear() {}
    vision() {
        return 0;
    }
}

const Enemies = {
    defs: {},
    list: [],
    minds: {},
    nav: null,
    room: null,
    group: null,
    debris: [],
    dying: [],
    shakeAmt: 0,
    time: 0,
    pathBudget: 0,
    chaseCell: 0,
    targets: [],
    nextId: 1,
    byId: new Map(),
    dev: false,
    overlay: true,
    ready: false,

    register(id, def) {
        def.id = id;
        this.defs[id] = def;
    },

    init() {
        Arsenal.onHit = (hit, shot) => this.onHit(hit, shot);
        Arsenal.onFire = shot => this.onFire(shot);
        Arsenal.onShotEnd = shot => this.onShotEnd(shot);
        CommFX.init();
        this.fx = new SporeCloud(1400);
        this.fx.setAmount(DETAIL.particles);
        this.junk = new THREE.Group();
        this.junk.name = 'enemy-debris';
        scene.add(this.junk);
        this.junk.add(this.fx.points);
        this.frustum = new THREE.Frustum();
        this.projM = new THREE.Matrix4();
        this.perf = { ms: 0, fps: 60, t: 0 };

        const hud = document.getElementById('hud');
        this.hitEl = document.createElement('div');
        this.hitEl.style.cssText = 'position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;opacity:0;' +
            'background:linear-gradient(45deg,transparent 45%,currentColor 45%,currentColor 55%,transparent 55%),linear-gradient(-45deg,transparent 45%,currentColor 45%,currentColor 55%,transparent 55%);' +
            '-webkit-mask:radial-gradient(circle,transparent 4px,#000 5px);mask:radial-gradient(circle,transparent 4px,#000 5px)';
        hud.appendChild(this.hitEl);
        this.hitT = 0;

        DevView.init(hud);
        this.ready = true;
        this.setDev(!!Settings.values.devMode);
        addEventListener('keydown', e => {
            if (e.code === 'Backquote' && !e.repeat && this.dev) {
                this.overlay = !this.overlay;
                DevView.show(this.dev && this.overlay);
            }
        });
    },

    setDev(on) {
        this.dev = on;
        if (this.ready) {
            DevView.show(on && this.overlay);
        }
    },

    load(room) {
        this.clear();
        this.room = room;
        if (!room.enemies || !room.enemies.length || !room.bounds) {
            return;
        }
        this.nav = new NavGrid(room, { radius: 0.48 });
        this.group = new THREE.Group();
        this.group.name = 'enemies';
        room.group.add(this.group);
        for (const spec of room.enemies) {
            this.populate(spec);
        }
    },

    clear() {
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        for (const d of this.debris) {
            this.junk.remove(d.mesh);
        }
        this.debris.length = 0;
        for (const e of this.list) {
            DevView.drop(e);
            e.dropBatch();
        }
        for (const e of this.dying) {
            this.junk.remove(e.root);
        }
        this.dying.length = 0;
        this.shakeAmt = 0;
        this.list.length = 0;
        this.byId.clear();
        this.nextId = 1;
        this.minds = {};
        this.group = null;
        this.nav = null;
        this.room = null;
        this.blast = null;
        this.fx.reset();
        CommFX.clear();
        DevView.reset();
    },

    populate(spec) {
        const nav = this.nav;
        const count = Array.isArray(spec.count)
            ? spec.count[0] + Math.floor(Rng.w() * (spec.count[1] - spec.count[0] + 1))
            : spec.count || 1;
        const spawnZ = this.room.spawn.z;
        const ok = i => !nav.blocked[i] && !nav.over[i] && nav.cz(i) < spawnZ - 18 &&
            this.list.every(e => Math.hypot(e.pos.x - nav.cx(i), e.pos.z - nav.cz(i)) > 2);
        const anchors = [];
        let left = count;
        while (left > 0) {
            const size = Math.min(left, RoomKit.pick(spec.clusters || [1, 2, 2, 3]));
            left -= size;
            let a = -1;
            for (let t = 0; t < 30; t++) {
                a = nav.randomCell(ok);
                if (a < 0 || anchors.every(b => Math.hypot(nav.cx(a) - nav.cx(b), nav.cz(a) - nav.cz(b)) > 10)) {
                    break;
                }
            }
            if (a < 0) {
                break;
            }
            anchors.push(a);
            for (let k = 0; k < size; k++) {
                const c = k === 0 ? a : nav.nearest(nav.cx(a) + RoomKit.rand(-3, 3), nav.cz(a) + RoomKit.rand(-3, 3), ok, 8);
                if (c >= 0) {
                    this.spawn(spec.type, nav.cx(c), nav.h[c], nav.cz(c));
                }
            }
        }
    },

    spawn(type, x, y, z) {
        const def = this.defs[type];
        const mind = this.minds[type] || (this.minds[type] = def.mind(def));
        const e = def.create(def, x, y, z);
        this.group.add(e.root);
        e.id = this.nextId++;
        this.byId.set(e.id, e);
        this.list.push(e);
        mind.add(e);
        e.root.position.copy(e.pos);
        return e;
    },

    get(id) {
        return this.byId.get(id) || null;
    },

    remove(e) {
        e.dead = true;
        this.byId.delete(e.id);
        if (e.root.parent) {
            e.root.parent.remove(e.root);
        }
        if (e.mind) {
            e.mind.remove(e);
        }
        DevView.drop(e);
    },

    kill(e) {
        e.dead = true;
        this.byId.delete(e.id);
        e.dropBatch();
        if (e.mind) {
            e.mind.remove(e);
        }
        DevView.drop(e);
        this.junk.attach(e.root);
        this.dying.push(e);
    },

    shake(amount, pos) {
        const d = pos ? pos.distanceTo(Players.local.pos) : 0;
        const k = amount * clamp01(1 - d / 14);
        if (k > this.shakeAmt) {
            this.shakeAmt = k;
        }
    },

    applyShake(dt) {
        const s = this.shakeAmt;
        if (s <= 0.001) {
            return;
        }
        camera.position.x += (Math.random() - 0.5) * s * 0.1;
        camera.position.y += (Math.random() - 0.5) * s * 0.1;
        camera.rotation.z += (Math.random() - 0.5) * s * 0.03;
        this.shakeAmt = Math.max(0, s - dt * 3);
    },

    hits(p, r, h) {
        for (const b of this.room.colliders) {
            if (!b.off && p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z &&
                p.y + h > b.min.y && p.y < colTop(b, p.x, p.z) - 1e-4) {
                return b;
            }
        }
        return null;
    },

    update(dt) {
        if (!this.nav) {
            return;
        }
        const t0 = performance.now();
        this.time += dt;
        const now = this.time;
        this.pathBudget = 3;
        this.targets = Players.active();
        this.readPlayers(dt);
        this.projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projM);

        for (const id in this.minds) {
            this.minds[id].update(dt, now);
        }
        this.separate();
        for (const e of this.list) {
            if (!e.dead) {
                this.enterLayer(e);
                e.update(dt, now);
                if (!e.dead) {
                    e.syncBatch();
                }
            }
        }
        this.enterLayer(null);
        for (let i = this.list.length - 1; i >= 0; i--) {
            if (this.list[i].dead) {
                this.list.splice(i, 1);
            }
        }
        for (let i = this.dying.length - 1; i >= 0; i--) {
            if (this.dying[i].updateDying(dt, now)) {
                this.junk.remove(this.dying[i].root);
                this.dying.splice(i, 1);
            }
        }
        this.updateDebris(dt);
        this.fx.update(dt);
        CommFX.update(dt);
        this.applyShake(dt);
        this.hitT = Math.max(0, this.hitT - dt);
        this.hitEl.style.opacity = (this.hitT / 0.18).toFixed(2);

        const P = this.perf;
        P.ms += (performance.now() - t0 - P.ms) * 0.1;
        P.fps += (1 / Math.max(dt, 1e-3) - P.fps) * 0.1;
        if (this.dev && this.overlay) {
            DevView.draw(this, now);
        }
    },

    enterLayer(e) {
        const nav = this.nav;
        if (!nav) {
            return;
        }
        const T = (e && e.target) || this.targets[0];
        let low = !(T && T.nav.top);
        if (low && e) {
            const c = nav.cell(e.pos.x, e.pos.z);
            if (e.pos.y > nav.hLow[c] + 1.2) {
                low = false;
            }
        }
        nav.setLayer(low);
        this.chaseCell = T ? T.nav.cells[low ? 1 : 0] : 0;
    },

    readPlayers(dt) {
        const nav = this.nav;
        for (const P of this.targets) {
            const pos = P.pos;
            const c0 = nav.cell(pos.x, pos.z);
            const py = P.onGround ? pos.y : this.floorAt(pos.x, pos.y, pos.z);
            P.nav.floor = py;
            P.nav.top = !!nav.deck[c0] && py > nav.hTop[c0] - 1.2;
            for (const low of [false, true]) {
                nav.setLayer(low);
                let c = c0;
                if (nav.blocked[c] || nav.over[c] || Math.abs(py - nav.h[c]) > 1.2) {
                    let n = nav.nearest(pos.x, pos.z, i => nav.open(i) && !nav.over[i] && Math.abs(nav.h[i] - py) < 1.2, 10);
                    if (n < 0) {
                        n = nav.nearest(pos.x, pos.z, i => nav.open(i) && !nav.over[i], 10);
                    }
                    if (n >= 0) {
                        c = n;
                    }
                }
                P.nav.cells[low ? 1 : 0] = c;
            }
        }
        this.enterLayer(null);

        for (const P of this.targets) {
            const s = P.step;
            const sp = Math.hypot(P.vel.x, P.vel.z);
            if (P.onGround) {
                if (!s.ground && s.vy < -9) {
                    this.noise(P.pos, 9, 'land', null, P);
                }
                s.t -= dt * sp;
                if (sp > 1 && s.t <= 0) {
                    s.t = 1.7;
                    this.noise(P.pos, P.sprinting ? 14 : 5, 'step', null, P);
                }
            } else {
                s.vy = P.vel.y;
            }
            s.ground = P.onGround;
        }
    },

    separate() {
        const L = this.list;
        for (let i = 0; i < L.length; i++) {
            const a = L[i];
            if (a.dead) {
                continue;
            }
            for (let j = i + 1; j < L.length; j++) {
                const b = L[j];
                if (b.dead || Math.abs(a.pos.y - b.pos.y) > 1.2) {
                    continue;
                }
                const dx = b.pos.x - a.pos.x;
                const dz = b.pos.z - a.pos.z;
                const min = a.radius + b.radius;
                const d2 = dx * dx + dz * dz;
                if (d2 < min * min && d2 > 1e-6) {
                    const d = Math.sqrt(d2);
                    const push = (min - d) * 3;
                    a.vel.x -= dx / d * push;
                    a.vel.z -= dz / d * push;
                    b.vel.x += dx / d * push;
                    b.vel.z += dz / d * push;
                }
            }
            for (const P of this.targets) {
                const dx = P.pos.x - a.pos.x;
                const dz = P.pos.z - a.pos.z;
                const min = a.radius + CONFIG.radius + 0.05;
                const d2 = dx * dx + dz * dz;
                if (d2 < min * min && d2 > 1e-6 && Math.abs(P.pos.y - a.pos.y) < 1.4) {
                    const d = Math.sqrt(d2);
                    const o = min - d;
                    a.vel.x -= dx / d * o * 4;
                    a.vel.z -= dz / d * o * 4;
                    if (P.local) {
                        const p = _ev2.copy(Player.pos);
                        p.x += dx / d * o * 0.6;
                        p.z += dz / d * o * 0.6;
                        if (!Player.hits(p)) {
                            Player.pos.copy(p);
                        }
                    }
                }
            }
        }
    },

    onHit(hit, shot) {
        let o = hit.object;
        let part = null;
        let e = null;
        while (o) {
            if (!part && o.userData.part) {
                part = o.userData.part;
            }
            if (o.userData.enemy) {
                e = o.userData.enemy;
                break;
            }
            o = o.parent;
        }
        if (e && !e.dead) {
            const from = shot.origin || (shot.by || Players.local).eye;
            const dir = _ev2.copy(hit.point).sub(from).normalize().clone();
            if (this.blast && this.blast.shot === shot) {
                let list = this.blast.by.get(e);
                if (!list) {
                    this.blast.by.set(e, list = []);
                }
                list.push({ part, hit, dir });
                return;
            }
            const res = e.takeHit(shot.damage, part, hit, dir, shot);
            this.hitmark(res);
            return;
        }
        if (this.nav) {
            this.noise(hit.point, 7, 'impact', shot.origin || (shot.by || Players.local).pos, shot.by || Players.local);
        }
    },

    onShotEnd(shot) {
        const b = this.blast;
        this.blast = null;
        if (!b || b.shot !== shot) {
            return;
        }
        const rank = { shell: 1, flesh: 2, break: 3, crit: 4, kill: 5 };
        let best = null;
        for (const [e, hits] of b.by) {
            if (e.dead) {
                continue;
            }
            const res = e.takeBlast ? e.takeBlast(hits, shot) : hits.map(h => e.takeHit(shot.damage, h.part, h.hit, h.dir, shot)).pop();
            if (res && (!best || rank[res] > rank[best])) {
                best = res;
            }
        }
        this.hitmark(best);
    },

    onFire(shot) {
        this.blast = shot.dirs.length > 1 ? { shot, by: new Map() } : null;
        if (!this.nav) {
            return;
        }
        const loud = { shotgun: 42, rifle: 34, pistols: 28, sniper: 58 }[shot.weapon] || 32;
        const by = shot.by || Players.local;
        this.noise(by.pos, loud, 'shot', null, by);
    },

    noise(pos, radius, kind, src, by) {
        for (const e of this.list) {
            if (e.dead) {
                continue;
            }
            const r = radius * (e.def.hearing || 1);
            const d = e.pos.distanceTo(pos);
            if (d < r) {
                e.mind.hear(e, { pos, src: src || pos, loud: 1 - d / r, kind, by: by || null }, this.time);
            }
        }
    },

    hitmark(kind) {
        if (!kind) {
            return;
        }
        this.hitEl.style.color = { shell: '#d8d2c4', break: '#ffd36b', flesh: '#7dffb5', crit: '#ff9a3c', kill: '#ff3b4e' }[kind] || '#fff';
        this.hitT = kind === 'kill' ? 0.3 : 0.18;
    },

    commFx(from, kin, color) {
        for (const k of kin) {
            CommFX.vine(from.pos, k.pos, color);
        }
    },

    detach(mesh, vel, life = 2) {
        mesh.updateWorldMatrix(true, false);
        this.junk.attach(mesh);
        mesh.userData.part = null;
        this.debris.push({
            mesh, vel: vel.clone(), life, t: 0, settled: false,
            spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9)
        });
    },

    floorAt(x, y, z) {
        let best = 0;
        if (!this.room) {
            return best;
        }
        for (const b of this.room.colliders) {
            if (b.off || x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) {
                continue;
            }
            const top = colTop(b, x, z);
            if (top <= y + 0.35 && top > best) {
                best = top;
            }
        }
        return best;
    },

    groundAt(x, z) {
        const nav = this.nav;
        if (!nav) {
            return 0;
        }
        return nav.raw[nav.cell(x, z)];
    },

    updateDebris(dt) {
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const d = this.debris[i];
            const m = d.mesh;
            d.t += dt;
            if (!d.settled) {
                d.vel.y -= GRAV * dt;
                const nx = m.position.x + d.vel.x * dt;
                const nz = m.position.z + d.vel.z * dt;
                if (this.groundAt(nx, nz) > m.position.y + 0.15) {
                    d.vel.x *= -0.4;
                    d.vel.z *= -0.4;
                } else {
                    m.position.x = nx;
                    m.position.z = nz;
                }
                m.position.y += d.vel.y * dt;
                m.rotation.x += d.spin.x * dt;
                m.rotation.y += d.spin.y * dt;
                m.rotation.z += d.spin.z * dt;
                const g = this.groundAt(m.position.x, m.position.z) + 0.03;
                if (m.position.y < g) {
                    m.position.y = g;
                    if (d.vel.y < -2) {
                        d.vel.y *= -0.28;
                        d.vel.x *= 0.5;
                        d.vel.z *= 0.5;
                        d.spin.multiplyScalar(0.5);
                    } else {
                        d.settled = true;
                    }
                }
            }
            if (d.t > d.life) {
                const k = d.t - d.life;
                m.position.y -= dt * (0.12 + k * 0.25);
                m.scale.multiplyScalar(1 - dt * 0.35);
                if (k > 2) {
                    this.junk.remove(m);
                    this.debris.splice(i, 1);
                }
            }
        }
    }
};

const CommFX = {
    init() {
        this.group = new THREE.Group();
        this.group.name = 'hive-comms';
        scene.add(this.group);
        this.ringGeo = new THREE.RingGeometry(0.88, 1, 56);
        this.list = [];
    },

    mat(color, opacity) {
        return new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
    },

    ring(pos, color, radius, dur = 0.8) {
        const m = new THREE.Mesh(this.ringGeo, this.mat(color, 0.9));
        m.position.copy(pos);
        m.scale.setScalar(0.2);
        this.group.add(m);
        this.list.push({ kind: 'ring', obj: m, t: 0, dur, radius });
    },

    thread(a, b, color, travel = 0.38) {
        const N = 30;
        const mid = a.clone().lerp(b, 0.5);
        mid.y += a.distanceTo(b) * 0.22 + 0.5;
        const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
        const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(N - 1));
        g.setDrawRange(0, 0);
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({
            color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        line.frustumCulled = false;
        this.group.add(line);
        this.list.push({ kind: 'thread', obj: line, t: 0, dur: travel + 0.55, travel, curve, N, color: new THREE.Color(color) });
    },

    ribbon(pts, w0, w1, color) {
        const n = pts.length;
        const pos = new Float32Array(n * 2 * 3);
        const idx = [];
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)];
            const b = pts[Math.min(n - 1, i + 1)];
            let sx = -(b.z - a.z);
            let sz = b.x - a.x;
            const l = Math.hypot(sx, sz) || 1;
            const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
            sx = sx / l * w;
            sz = sz / l * w;
            const p = pts[i];
            pos.set([p.x + sx, p.y, p.z + sz, p.x - sx, p.y, p.z - sz], i * 6);
            if (i < n - 1) {
                const k = i * 2;
                idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.setDrawRange(0, 0);
        const m = new THREE.Mesh(g, this.mat(color, 1));
        m.frustumCulled = false;
        m.renderOrder = 2;
        this.group.add(m);
        return { mesh: m, tris: idx.length, pts };
    },

    floorPath(a, b, wobble, seed) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const px = -dz / len;
        const pz = dx / len;
        const n = Math.max(6, Math.round(len / 0.3));
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const w = Math.sin(t * Math.PI) * (Math.sin(t * 9 + seed) * wobble + Math.sin(t * 23 + seed * 2) * wobble * 0.35);
            const x = a.x + dx * t + px * w;
            const z = a.z + dz * t + pz * w;
            pts.push(new THREE.Vector3(x, Enemies.groundAt(x, z) + 0.035, z));
        }
        return pts;
    },

    vine(from, to, color, grow = 0.45) {
        const seed = Math.random() * 10;
        const main = this.floorPath(from, to, 0.35, seed);
        const parts = [Object.assign(this.ribbon(main, 0.26, 0.1, color), { start: 0, grow })];
        for (let i = 0; i < 4; i++) {
            const at = 0.15 + Math.random() * 0.7;
            const p = main[Math.floor(at * (main.length - 1))];
            const dir = Math.atan2(to.x - from.x, to.z - from.z) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.7);
            const len = 0.6 + Math.random() * 1.2;
            const end = new THREE.Vector3(p.x + Math.sin(dir) * len, 0, p.z + Math.cos(dir) * len);
            parts.push(Object.assign(this.ribbon(this.floorPath(p, end, 0.12, seed + i), 0.13, 0.01, color), { start: at * grow, grow: grow * 0.5 }));
        }
        this.list.push({ kind: 'vine', parts, t: 0, dur: grow + 1.2, grow, color: new THREE.Color(color) });
    },

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const f = this.list[i];
            f.t += dt;
            const u = Math.min(1, f.t / f.dur);
            if (f.kind === 'vine') {
                const fade = f.t < f.grow + 0.4 ? 1 : 1 - (f.t - f.grow - 0.4) / (f.dur - f.grow - 0.4);
                for (const p of f.parts) {
                    const g = clamp01((f.t - p.start) / p.grow);
                    const e = 1 - (1 - g) * (1 - g);
                    p.mesh.geometry.setDrawRange(0, Math.floor(e * p.tris / 6) * 6);
                    p.mesh.material.opacity = Math.max(0, fade);
                    if (g > 0 && g < 1 && p.start === 0) {
                        const tip = p.pts[Math.min(p.pts.length - 1, Math.floor(e * (p.pts.length - 1)))];
                        Enemies.fx.emit(tip.x, tip.y + 0.05, tip.z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, f.color, 0.5, 0.5, 2);
                    }
                }
                if (f.t >= f.dur) {
                    for (const p of f.parts) {
                        this.group.remove(p.mesh);
                        p.mesh.geometry.dispose();
                        p.mesh.material.dispose();
                    }
                    this.list.splice(i, 1);
                }
                continue;
            }
            if (f.kind === 'ring') {
                const e = 1 - Math.pow(1 - u, 3);
                f.obj.scale.setScalar(0.2 + (f.radius - 0.2) * e);
                f.obj.quaternion.copy(camera.quaternion);
                f.obj.material.opacity = 0.9 * (1 - u) * (1 - u);
            } else {
                const head = Math.min(1, f.t / f.travel);
                const hi = Math.ceil(head * (f.N - 1)) + 1;
                const lo = head < 1 ? Math.max(0, hi - Math.floor(f.N * 0.45)) : Math.min(f.N, Math.floor((f.t - f.travel) / (f.dur - f.travel) * f.N));
                f.obj.geometry.setDrawRange(lo, Math.max(0, hi - lo));
                f.obj.material.opacity = head < 1 ? 1 : 1 - u * 0.6;
                if (head < 1) {
                    const p = f.curve.getPoint(head);
                    Enemies.fx.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, f.color, 0.45, 0, 2);
                }
            }
            if (f.t >= f.dur) {
                this.drop(f);
                this.list.splice(i, 1);
            }
        }
    },

    drop(f) {
        this.group.remove(f.obj);
        f.obj.material.dispose();
        if (f.kind === 'thread') {
            f.obj.geometry.dispose();
        }
    },

    clear() {
        if (!this.list) {
            return;
        }
        for (const f of this.list) {
            if (f.kind === 'vine') {
                for (const p of f.parts) {
                    this.group.remove(p.mesh);
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                }
            } else {
                this.drop(f);
            }
        }
        this.list.length = 0;
    }
};

const DevView = {
    init(hud) {
        this.labels = document.createElement('div');
        this.labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:11px/1.3 monospace;color:#fff';
        hud.appendChild(this.labels);
        this.panel = document.createElement('div');
        this.panel.style.cssText = 'position:fixed;right:12px;top:12px;pointer-events:none;font:12px/1.4 monospace;color:#9effc9;background:#000b;padding:6px 9px;border-radius:4px;white-space:pre';
        hud.appendChild(this.panel);
        this.group = new THREE.Group();
        this.group.name = 'dev-overlay';
        scene.add(this.group);
        this.mats = {
            calm: new THREE.LineBasicMaterial({ color: 0x46ffc8, transparent: true, opacity: 0.45 }),
            sus: new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.7 }),
            hunt: new THREE.LineBasicMaterial({ color: 0xff3b4e, transparent: true, opacity: 0.5 }),
            path: new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }),
            up: new THREE.MeshBasicMaterial({ color: 0xff8a1e, depthTest: false }),
            down: new THREE.MeshBasicMaterial({ color: 0xc07cff, depthTest: false }),
            seen: new THREE.MeshBasicMaterial({ color: 0xff3b4e, wireframe: true, depthTest: false }),
            guess: new THREE.MeshBasicMaterial({ color: 0xffa22e, wireframe: true, depthTest: false }),
            goal: new THREE.MeshBasicMaterial({ color: 0x6fd3ff, wireframe: true, depthTest: false })
        };
        this.marker = new THREE.OctahedronGeometry(0.35);
        this.arrow = new THREE.ConeGeometry(0.16, 0.42, 8);
        this.cols = {
            path: new THREE.Color(0x6fd3ff),
            stairs: new THREE.Color(0x7dff7a),
            climb: new THREE.Color(0xff8a1e),
            drop: new THREE.Color(0xc07cff)
        };
        this.cones = {};
        this.packMarks = [];
        this.show(false);
    },

    show(on) {
        this.on = on;
        this.group.visible = on;
        this.labels.style.display = on ? '' : 'none';
        this.panel.style.display = on ? '' : 'none';
    },

    coneGeo(half) {
        const key = half.toFixed(3);
        if (!this.cones[key]) {
            const pts = [new THREE.Vector3(0, 0, 0)];
            for (let i = 0; i <= 24; i++) {
                const a = -half + (2 * half * i) / 24;
                pts.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
            }
            this.cones[key] = new THREE.BufferGeometry().setFromPoints(pts);
        }
        return this.cones[key];
    },

    rig(e) {
        if (e.dev) {
            return e.dev;
        }
        const cfg = e.def.brain;
        const cone = new THREE.LineLoop(this.coneGeo(cfg.cone), this.mats.calm);
        cone.renderOrder = 999;
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(256 * 3), 3));
        pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(256 * 3), 3));
        const path = new THREE.LineSegments(pg, this.mats.path);
        path.frustumCulled = false;
        path.renderOrder = 999;
        const goal = new THREE.Mesh(this.marker, this.mats.goal);
        goal.scale.setScalar(0.5);
        this.group.add(cone, path, goal);
        const arrows = [];
        for (let i = 0; i < 4; i++) {
            const m = new THREE.Mesh(this.arrow, this.mats.up);
            m.renderOrder = 1000;
            m.visible = false;
            arrows.push(m);
            this.group.add(m);
        }
        const label = document.createElement('div');
        label.style.cssText = 'position:absolute;transform:translate(-50%,-100%);white-space:pre;text-align:left;background:#000b;padding:3px 6px;border-radius:3px;border-left:3px solid #46ffc8';
        this.labels.appendChild(label);
        e.dev = { cone, path, goal, label, arrows };
        return e.dev;
    },

    drop(e) {
        const d = e.dev;
        if (!d) {
            return;
        }
        this.group.remove(d.cone, d.path, d.goal, ...d.arrows);
        d.path.geometry.dispose();
        d.label.remove();
        e.dev = null;
    },

    reset() {
        for (const m of this.packMarks) {
            this.group.remove(m.seen, m.guess);
        }
        this.packMarks.length = 0;
        this.labels.innerHTML = '';
    },

    drawPath(e, d, nav, now) {
        const geo = d.path.geometry;
        const pos = geo.attributes.position.array;
        const col = geo.attributes.color.array;
        const C = this.cols;
        let n = 0;
        let ai = 0;
        const seg = (x0, y0, z0, x1, y1, z1, c) => {
            if (n + 6 > pos.length) {
                return;
            }
            pos[n] = x0;
            pos[n + 1] = y0 + 0.15;
            pos[n + 2] = z0;
            pos[n + 3] = x1;
            pos[n + 4] = y1 + 0.15;
            pos[n + 5] = z1;
            for (let k = 0; k < 6; k += 3) {
                col[n + k] = c.r;
                col[n + k + 1] = c.g;
                col[n + k + 2] = c.b;
            }
            n += 6;
        };
        const arrow = (x, y, z, up) => {
            const m = d.arrows[ai++];
            if (!m) {
                return;
            }
            m.visible = true;
            m.material = up ? this.mats.up : this.mats.down;
            m.rotation.x = up ? 0 : Math.PI;
            m.position.set(x, y + 0.15 + Math.sin(now * 6 + ai) * 0.08, z);
        };
        const a = e.action;
        const mantling = a && a.name === 'mantle';
        let note = '';
        let px = e.pos.x;
        let py = e.pos.y;
        let pz = e.pos.z;
        if (mantling) {
            const phase = ['approach', 'reach', 'pull up', 'mantle', 'stand'][a.phase] || '';
            note = `CLIMBING ${a.H.toFixed(1)}m  (${phase})`;
            seg(px, py, pz, a.A.x, a.oy, a.A.z, C.climb);
            seg(a.A.x, a.oy, a.A.z, a.A.x, a.top, a.A.z, C.climb);
            seg(a.A.x, a.top, a.A.z, a.L.x, a.top, a.L.z, C.climb);
            arrow(a.A.x, a.oy + a.H * 0.5, a.A.z, true);
            px = a.L.x;
            py = a.top;
            pz = a.L.z;
        } else if (a && a.air && a.land) {
            note = `${a.name.toUpperCase()}  (jump)`;
            seg(px, py, pz, a.land.x, a.land.y, a.land.z, a.land.y > py + Nav.STEP ? C.climb : C.drop);
        }
        if (e.dbgCells && (mantling || Math.hypot(e.vel.x, e.vel.z) > 0.05)) {
            let dist = 0;
            let stairs = false;
            for (let i = mantling ? e.dbgCells.length : e.dbgI; i < e.dbgCells.length; i++) {
                const c = e.dbgCells[i];
                const x = nav.cx(c);
                const z = nav.cz(c);
                const y = nav.h[c];
                const dh = y - py;
                if (dh > Nav.STEP) {
                    seg(px, py, pz, px, y, pz, C.climb);
                    seg(px, y, pz, x, y, z, C.climb);
                    arrow(px, py + dh * 0.5, pz, true);
                    if (!note) {
                        note = `next: climb ${dh.toFixed(1)}m in ${dist.toFixed(1)}m`;
                    }
                } else if (dh < -Nav.STEP) {
                    seg(px, py, pz, x, py, z, C.drop);
                    seg(x, py, z, x, y, z, C.drop);
                    arrow(x, y - dh * 0.5, z, false);
                    if (!note) {
                        note = `next: drop ${(-dh).toFixed(1)}m in ${dist.toFixed(1)}m`;
                    }
                } else {
                    const onRamp = nav.ramp[c] && Math.abs(dh) > 0.05;
                    stairs = stairs || onRamp;
                    seg(px, py, pz, x, y, z, onRamp ? C.stairs : C.path);
                }
                dist += Math.hypot(x - px, z - pz);
                px = x;
                py = y;
                pz = z;
            }
            if (!note && stairs) {
                note = 'route: stairs';
            }
        }
        for (; ai < d.arrows.length; ai++) {
            d.arrows[ai].visible = false;
        }
        geo.setDrawRange(0, n / 3);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        return note;
    },

    draw(E, now) {
        const w = innerWidth;
        const h = innerHeight;
        const nav = E.nav;
        for (const e of E.list) {
            if (e.dead) {
                continue;
            }
            const d = this.rig(e);
            const cfg = e.def.brain;
            d.cone.position.set(e.pos.x, e.pos.y + 0.06, e.pos.z);
            d.cone.rotation.y = e.yaw;
            d.cone.scale.setScalar(cfg.sight);
            d.cone.material = e.engaged ? this.mats.hunt : e.alert > 0.05 ? this.mats.sus : this.mats.calm;

            E.enterLayer(e);
            const note = this.drawPath(e, d, nav, now);
            E.enterLayer(null);
            d.goal.visible = e.goalSet;
            d.goal.position.set(e.goal.x, e.goal.y + 0.4, e.goal.z);

            _ev.set(e.pos.x, e.pos.y + e.height + 0.6, e.pos.z).project(camera);
            if (_ev.z > 1 || !e.onScreen) {
                d.label.style.display = 'none';
                continue;
            }
            d.label.style.display = '';
            d.label.style.left = ((_ev.x + 1) / 2 * w) + 'px';
            d.label.style.top = ((1 - _ev.y) / 2 * h) + 'px';
            d.label.style.borderLeftColor = e.engaged ? '#ff3b4e' : e.alert > 0.05 ? '#ffd34d' : '#46ffc8';
            const txt = e.debugText(now);
            const lines = e.pos.distanceTo(Players.local.pos) < 12 ? txt : txt.split('\n').slice(0, 2).join('\n');
            d.label.textContent = note ? lines + '\n' + note : lines;
            d.label.style.zIndex = String(1000 - Math.round(e.pos.distanceTo(Players.local.pos)));
        }

        let k = 0;
        for (const id in E.minds) {
            for (const p of E.minds[id].packs) {
                const tr = p.mem.freshest();
                if (!tr) {
                    continue;
                }
                let m = this.packMarks[k];
                if (!m) {
                    m = { seen: new THREE.Mesh(this.marker, this.mats.seen), guess: new THREE.Mesh(this.marker, this.mats.guess) };
                    this.group.add(m.seen, m.guess);
                    this.packMarks.push(m);
                }
                m.seen.visible = m.guess.visible = true;
                m.seen.position.copy(tr.pos).y += 1;
                p.mem.predict(tr, now, m.guess.position).y += 1;
                m.seen.rotation.y = m.guess.rotation.y = now * 2;
                k++;
            }
        }
        for (; k < this.packMarks.length; k++) {
            this.packMarks[k].seen.visible = this.packMarks[k].guess.visible = false;
        }

        E.perf.t -= 1 / 60;
        if (E.perf.t <= 0) {
            E.perf.t = 0.25;
            const alive = E.list.filter(e => !e.dead);
            let meshes = 0;
            if (alive[0]) {
                alive[0].root.traverse(o => {
                    if (o.isMesh) {
                        meshes++;
                    }
                });
            }
            this.panel.textContent =
                `DEV MODE  (\` hides overlay)\n` +
                `fps ${E.perf.fps.toFixed(0)}   enemy AI+anim ${E.perf.ms.toFixed(2)} ms\n` +
                `enemies ${alive.length}   meshes/enemy ${meshes}   packs ${Object.values(E.minds).reduce((a, m) => a + m.packs.length, 0)}\n` +
                `red = last seen   orange = predicted   blue = path/goal\n` +
                `path: green = stairs   orange ^ = climb   purple v = drop`;
        }
    }
};
