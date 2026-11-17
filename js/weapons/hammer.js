// Heavy hammer. Placeholder model (box head on a handle) with a basic swing and inspect.
Weapons.register('hammer', {
    name: 'Heavy Hammer',
    melee: true,
    noise: 16,
    offset: [0.3, -0.44, -0.55],
    sprintYaw: 0.25,
    stats: {
        mag: 0, rate: 0.85, auto: true, damage: 120, pellets: 1, spread: 0, range: 2.5,
        hitDelay: 0.27, drawTime: 0.6,
        kick: { back: 0, up: 0, roll: 0 }
    },
    color: 0xc8c2b8,
    inspect: { time: 2.6 },
    hands: { left: 'upper', right: 'lower' },

    build(b) {
        const m = {
            head: b.mat('head', { color: 0x77787c, metalness: 0.4, roughness: 0.5 }),
            handle: b.mat('handle', { color: 0x6b4a30, roughness: 0.85 })
        };
        const model = b.part(b.group(null, null, [-0.35, 0, 0.25]));
        b.mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.66, b.n(12)), m.handle, model, [0, 0.19, 0]);
        b.box(0.085, 0.095, 0.2, m.head, model, [0, 0.55, 0]);
        const muzzle = b.group(model, [0, 0.55, -0.12]);
        b.grip('lower', model, [0, -0.06, 0], { fingers: [0, 0, -1], back: [1, 0, 0], around: 0.019, curl: 0.95 });
        b.grip('upper', model, [0, 0.13, 0], { fingers: [0, 0, -1], back: [-1, 0, 0], around: 0.018, curl: 0.95 });
        return { model, muzzle };
    },

    pose(w) {
        const K = WeaponKit;
        const M = w.parts.model;
        const f = w.fireT;
        if (f < 1.1) {
            const up = K.e('outQuad', f, 0, 0.2) * (1 - K.e('inQuad', f, 0.2, 0.3));
            const down = K.e('inQuad', f, 0.2, 0.3) * (1 - K.e('inOutCubic', f, 0.5, 1.05));
            M.rotation.x += up * 0.55 - down * 1.25;
            M.rotation.z -= up * 0.15 - down * 0.2;
            M.position.y += up * 0.06 - down * 0.1;
            M.position.x -= down * 0.1;
            M.position.z += up * 0.05 - down * 0.12;
            if (f > 0.28 && f < 0.42) {
                M.position.y += Math.sin(w.time * 80) * 0.004;
            }
        }
        const it = w.inspectT;
        if (it >= 0) {
            const T = this.inspect.time;
            const env = K.e('inOutCubic', it, 0, 0.5) * (1 - K.e('inOutCubic', it, T - 0.5, T));
            M.rotation.x += env * 0.35;
            M.rotation.z -= env * 0.2;
            M.position.x -= env * 0.08;
            M.position.y += env * 0.05;
            M.rotation.y += 0.8 * K.e('inOutCubic', it, 0.5, 1.1) - 1.6 * K.e('inOutCubic', it, 1.2, 1.8) + 0.8 * K.e('inOutCubic', it, 1.8, 2.1);
        }
    }
});
