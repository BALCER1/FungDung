const CONFIG = {
    walk: 6,
    sprint: 11,
    accel: 12,
    gravity: 25,
    jump: 8,
    eye: 1.7,
    height: 1.8,
    radius: 0.3,
    step: 0.5,
    fov: 75,
    sensitivity: 0.002,
    stages: 12,
    netVersion: 3,
    coopEnemyCount: 0.3,
    coopEnemyDamage: 0.3,
    coopEnemyHealth: 0,
    netRate: 20,
    travelCountdown: 15,
    remoteGunDetail: 'medium',
    maxPlayers: 4,
    lobby: {
        heartbeat: 15,
        refresh: 4,
        connectTimeout: 15,
        pingEvery: 4,
        pingTimeout: 16
    },
    targeting: {
        hold: 3,
        stick: 12,
        seen: 40,
        attacker: 25,
        attackerFor: 6
    }
};

const DETAIL = {
    names: ['high', 'medium', 'potato'],
    scale: { high: 1, medium: 0.5, potato: 0.25 },
    guns: 'high',
    enemies: 'high',
    lighting: 'high',
    particles: 1,
    particleLevels: { high: 1, medium: 0.5, low: 0.25 },
    deathFx: 'full',

    seg(level, n, min = 3) {
        return Math.max(min, Math.round(n * (DETAIL.scale[level] || 1)));
    },

    skip() {
        return DETAIL.particles < 1 && Math.random() > DETAIL.particles;
    },

    litMaterial(opts) {
        const o = Object.assign({ roughness: 0.75, metalness: 0 }, opts);
        if (DETAIL.lighting === 'high') {
            return new THREE.MeshStandardMaterial(o);
        }
        const rough = o.roughness;
        const metal = o.metalness;
        delete o.roughness;
        delete o.metalness;
        if (DETAIL.lighting === 'medium') {
            o.shininess = 4 + 60 * (1 - rough) * (1 - rough);
            o.specular = new THREE.Color(0xffffff).multiplyScalar(0.04 + 0.25 * (1 - rough) + 0.2 * metal);
            return new THREE.MeshPhongMaterial(o);
        }
        delete o.flatShading;
        return new THREE.MeshLambertMaterial(o);
    }
};

const BOOT = (() => {
    try {
        return JSON.parse(localStorage.getItem('fungdung.settings')) || {};
    } catch (e) {
        return {};
    }
})();
DETAIL.antialias = BOOT.antialias !== false;
