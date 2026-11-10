const Rng = {
    seed: 0,
    w: null,
    ai: null,

    make(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    hash(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        h ^= h >>> 15;
        h = Math.imul(h, 0x85ebca6b);
        h ^= h >>> 13;
        return h >>> 0;
    },

    fresh() {
        return (Math.random() * 4294967296) >>> 0;
    },

    parse(text) {
        const t = String(text || '').trim();
        if (!t) {
            return null;
        }
        return /^\d+$/.test(t) ? Number(t) >>> 0 : this.hash(t);
    },

    start(seed) {
        this.seed = seed >>> 0;
        this.use('boot');
        this.think('boot');
    },

    sub(name) {
        return this.make(this.hash(this.seed + '/' + name));
    },

    use(name) {
        this.w = this.sub(name);
    },

    think(name) {
        this.ai = this.sub(name);
    }
};

Rng.start(Rng.fresh());
