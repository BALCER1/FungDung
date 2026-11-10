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
    stages: 12
};

const DETAIL = {
    names: ['high', 'medium', 'potato'],
    scale: { high: 1, medium: 0.5, potato: 0.25 },
    guns: 'high',
    enemies: 'high',

    seg(level, n, min = 3) {
        return Math.max(min, Math.round(n * (DETAIL.scale[level] || 1)));
    }
};
