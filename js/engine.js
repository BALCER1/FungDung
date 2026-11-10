const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(CONFIG.fov, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: DETAIL.antialias });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d0d0, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.45);
sun.position.set(6, 10, 4);
scene.add(sun);

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

const Input = {
    keys: {},
    lookSkip: 0,
    lastLook: 0,

    lookDelta(e) {
        const x = e.movementX || 0;
        const y = e.movementY || 0;
        if (this.lookSkip > 0) {
            this.lookSkip--;
            return null;
        }
        const m = Math.hypot(x, y);
        if (m > 400 && m > this.lastLook * 4 + 100) {
            return null;
        }
        this.lastLook = m;
        return { x, y };
    },

    resetLook() {
        this.lookSkip = 1;
        this.lastLook = 0;
    },

    init() {
        addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (e.code === 'Space' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
                e.preventDefault();
            }
        });
        addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
        addEventListener('blur', () => {
            this.keys = {};
        });
    }
};

function snapDown(p, body, reach) {
    const y = p.y;
    p.y = y - reach;
    const h = body.hits(p);
    p.y = y;
    if (!h) {
        return false;
    }
    const top = colTop(h, p.x, p.z);
    if (top > y + 1e-3 || top < y - reach) {
        return false;
    }
    p.y = top;
    body.vel.y = 0;
    body.onGround = true;
    return true;
}

function colTop(c, x, z) {
    const s = c.slope;
    if (!s) {
        return c.max.y;
    }
    const h = s.base + ((s.axis === 'x' ? x : z) - s.start) * s.dir * s.k;
    return h < 0 ? 0 : h > s.top ? s.top : h;
}

const Player = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    onGround: false,
    room: null,

    reset(room) {
        const spawn = room.spawn;
        this.room = room;
        this.pos.set(spawn.x, 0, spawn.z);
        this.vel.set(0, 0, 0);
        this.yaw = spawn.yaw;
        this.pitch = 0;
        this.stun = 0;
        this.syncCamera();
    },

    stun: 0,
    knock(dir, power, stun) {
        this.vel.x += dir.x * power;
        this.vel.z += dir.z * power;
        this.vel.y = Math.max(this.vel.y, power * 0.3);
        this.stun = Math.max(this.stun, stun);
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + 0.12));
        this.yaw += (Math.random() - 0.5) * 0.16;
    },

    look(dx, dy) {
        this.yaw -= dx * CONFIG.sensitivity;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * CONFIG.sensitivity));
    },

    hits(p) {
        const r = CONFIG.radius;
        const h = CONFIG.height;

        for (const b of this.room.colliders) {
            if (
                !b.off &&
                p.x + r > b.min.x &&
                p.x - r < b.max.x &&
                p.z + r > b.min.z &&
                p.z - r < b.max.z &&
                p.y + h > b.min.y &&
                p.y < colTop(b, p.x, p.z) - 1e-4
            ) {
                return b;
            }
        }
        return null;
    },

    slide(p, axis) {
        const b = this.hits(p);
        if (!b) {
            return;
        }
        if (b.slope && (this.onGround || this.vel.y <= 0)) {
            const y = p.y;
            const top = colTop(b, p.x, p.z);
            if (top - y <= 0.65) {
                p.y = top;
                if (!this.hits(p)) {
                    return;
                }
                p.y = y;
            }
        }
        if (this.onGround) {
            const y = p.y;
            p.y = y + CONFIG.step;
            if (!this.hits(p)) {
                return;
            }
            p.y = y;
        }
        p[axis] = this.pos[axis];
        this.vel[axis] = 0;
    },

    update(dt) {
        const k = Input.keys;
        const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
        const str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
        const speed = k.ShiftLeft || k.ShiftRight ? CONFIG.sprint : CONFIG.walk;

        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        let wx = str * cos - fwd * sin;
        let wz = -str * sin - fwd * cos;
        const len = Math.hypot(wx, wz);
        if (len > 0) {
            wx = wx / len * speed;
            wz = wz / len * speed;
        }

        let accel = CONFIG.accel;
        if (this.stun > 0) {
            this.stun -= dt;
            wx *= 0.25;
            wz *= 0.25;
            accel = 2.5;
        }
        const t = 1 - Math.exp(-accel * dt);
        this.vel.x += (wx - this.vel.x) * t;
        this.vel.z += (wz - this.vel.z) * t;

        if (k.Space && this.onGround) {
            this.vel.y = CONFIG.jump;
            this.onGround = false;
        }
        this.vel.y -= CONFIG.gravity * dt;

        const p = this.pos.clone();
        p.x += this.vel.x * dt;
        this.slide(p, 'x');
        p.z += this.vel.z * dt;
        this.slide(p, 'z');
        p.y += this.vel.y * dt;
        const wasGround = this.onGround;
        this.onGround = false;
        const hit = this.hits(p);
        if (hit) {
            if (this.vel.y < 0) {
                p.y = colTop(hit, p.x, p.z);
                this.onGround = true;
            } else {
                p.y = this.pos.y;
            }
            this.vel.y = 0;
        }
        if (!this.onGround && wasGround && this.vel.y <= 0 && p.y > 0) {
            snapDown(p, this, 0.45);
        }
        if (p.y <= 0) {
            p.y = 0;
            this.vel.y = 0;
            this.onGround = true;
        }
        this.pos.copy(p);
        this.syncCamera();
    },

    syncCamera() {
        camera.position.set(this.pos.x, this.pos.y + CONFIG.eye, this.pos.z);
        camera.rotation.set(this.pitch, this.yaw, 0);
    }
};

class RoomBuilder {
    constructor() {
        this.group = new THREE.Group();
        this.colliders = [];
        this.door = null;
        this.spawn = { x: 0, z: 0, yaw: 0 };
        this.background = 0x000000;
        this.fog = null;
        scene.add(this.group);
    }
    mat(color) {
        return new THREE.MeshLambertMaterial({ color });
    }
    deco(x, y, z, w, h, d, color) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
        mesh.position.set(x, y + h / 2, z);
        this.group.add(mesh);
        return mesh;
    }
    solid(x, y, z, w, h, d) {
        const c = {
            min: new THREE.Vector3(x - w / 2, y, z - d / 2),
            max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
            off: false
        };
        this.colliders.push(c);
        return c;
    }
    ramp(x0, x1, z0, z1, slope) {
        const c = {
            min: new THREE.Vector3(Math.min(x0, x1), 0, Math.min(z0, z1)),
            max: new THREE.Vector3(Math.max(x0, x1), slope.top, Math.max(z0, z1)),
            off: false,
            slope
        };
        this.colliders.push(c);
        return c;
    }
    box(x, y, z, w, h, d, color) {
        this.solid(x, y, z, w, h, d);
        return this.deco(x, y, z, w, h, d, color);
    }
    dark(x, y, z, w, h, d, isSolid = true) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        mesh.position.set(x, y + h / 2, z);
        this.group.add(mesh);
        if (isSolid) {
            this.solid(x, y, z, w, h, d);
        }
        return mesh;
    }
    dispose() {
        scene.remove(this.group);
        this.group.traverse(o => {
            if (o.geometry) {
                o.geometry.dispose();
            }
            if (o.material) {
                o.material.dispose();
            }
        });
        this.colliders.length = 0;
    }
}
