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
    version: '1.0',
    netVersion: 14,
    coopEnemyCount: 0.3,
    coopEnemyDamage: 0.3,
    coopEnemyHealth: 0,
    netRate: 20,
    travelCountdown: 15,
    maxPlayers: 4,
    downed: {
        bleedout: 30,
        reviveTime: 10,
        reviveRange: 2,
        reviveHp: 0.3,
        eye: 0.45
    },
    // Crouch. Stealth only applies to enemies that have not engaged yet; once one has spotted you,
    // crouching changes nothing about how it sees or hears you.
    crouch: {
        speed: 3.2,         // move speed while crouched (walk is 6)
        eye: 1.1,           // camera height while crouched
        rate: 10,           // how fast the camera moves between standing and crouched
        sight: 0.6,         // unaware enemy's sight range is multiplied by this
        near: 0.5,          // its close-range "felt you behind me" radius is multiplied by this
        vision: 0.5,        // how fast its suspicion builds is multiplied by this
        step: 2             // footstep noise radius for unaware enemies (walk 5, sprint 14)
    },
    god: {
        damage: 1000000
    },
    // Floating damage numbers (Settings > Display). Cosmetic only.
    damageNumbers: {
        life: 0.9,          // seconds a number stays up after its last hit
        merge: 0.5,         // "Stacked": hits on the same enemy within this many seconds add up
        rise: 46,           // pixels it floats up over its life
        spread: 14,         // random sideways offset in pixels, so numbers do not sit on top of each other
        size: 16,
        bigSize: 21,        // crits and kills
        max: 30
    },
    vending: {
        uses: 1,
        hp: 1,
        range: 2
    },
    lobby: {
        heartbeat: 15,
        refresh: 4,
        connectTimeout: 15,
        pingEvery: 4,
        pingTimeout: 16,
        stun: 'stun:stun.l.google.com:19302',
        stunTimeout: 3
    },
    relay: {
        fn: 'turn',
        timeout: 4,
        refresh: 6 * 3600,
        retry: 60
    },
    // Capling colony workers: how many appear in each room. Their combat numbers (HP, damage,
    // speed, brain) are in the enemy def in js/enemies/capling.js, like the Shellcap's.
    caplings: {
        combat: [6, 10],            // workers in a combat room
        combatShellcaps: [2, 3],    // Shellcaps alongside them (3-5 before workers existed)
        elite: [6, 10],
        eliteShellcaps: [4, 5],     // (5-7 before workers existed)
        colonyChance: 0.25,         // chance a combat room is workers only
        colony: [8, 10],            // workers in a workers-only combat room
        clusters: [3, 4, 5]         // workers spawn in groups of this size
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
    remoteGuns: 'medium',

    // Settings > Graphics > Graphics quality. Each preset sets every graphics option at once, so
    // players never have to balance them. `pixelCap` limits the screen's pixel ratio (a laptop at
    // 200% scaling renders 4x the pixels at 2, 2.25x at 1.5); Render scale multiplies on top.
    // `remoteGuns` is the detail of teammates' guns in co-op.
    presets: {
        high: { enemies: 'high', guns: 'high', lighting: 'high', particles: 'high', deathFx: 'full', antialias: true, pixelCap: 1.5, remoteGuns: 'medium' },
        medium: { enemies: 'medium', guns: 'medium', lighting: 'medium', particles: 'medium', deathFx: 'full', antialias: false, pixelCap: 1, remoteGuns: 'medium' },
        low: { enemies: 'potato', guns: 'potato', lighting: 'low', particles: 'low', deathFx: 'simple', antialias: false, pixelCap: 1, remoteGuns: 'potato' }
    },
    preset(name) {
        return DETAIL.presets[name] || DETAIL.presets.high;
    },

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
// The first renderer's antialiasing comes from the saved quality preset (see `rebuildRenderer`).
DETAIL.antialias = DETAIL.preset(BOOT.quality ||
    (BOOT.gunDetail === 'potato' ? 'low' : BOOT.gunDetail === 'medium' ? 'medium' : 'high')).antialias;
