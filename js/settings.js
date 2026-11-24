const Settings = {
    key: 'fungdung.settings',
    values: {
        renderScale: 1,
        fov: CONFIG.fov,
        sensitivity: 4,
        fullscreen: false,
        darkMode: false,
        devMode: false,
        godMode: false,
        // One preset (DETAIL.presets) instead of separate detail, lighting, particle, death effect
        // and antialiasing options.
        quality: 'high',
        hitmarkers: 'color',
        damageNumbers: 'off',
        showFps: false
    },
    choices: {
        quality: ['high', 'medium', 'low'],
        hitmarkers: ['color', 'white', 'off'],
        damageNumbers: ['off', 'stack', 'each']
    },

    init() {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(this.key)) || {};
        } catch (e) {
        }
        Object.assign(this.values, saved);
        // Saves from before the quality preset: pick the preset closest to the old gun detail.
        const v = this.values;
        if (v.gunDetail && !saved.quality) {
            v.quality = v.gunDetail === 'potato' ? 'low' : v.gunDetail === 'medium' ? 'medium' : 'high';
        }
        for (const k of ['enemyDetail', 'gunDetail', 'lighting', 'particles', 'deathFx', 'antialias', 'upscale']) {
            delete v[k];
        }

        const $ = id => document.getElementById(id);
        this.el = {
            scale: $('setScale'),
            scaleOut: $('setScaleOut'),
            fov: $('setFov'),
            fovOut: $('setFovOut'),
            fullscreen: $('setFullscreen'),
            sens: $('sens'),
            sensOut: $('sensOut'),
            res: $('setRes'),
            dark: $('setDark'),
            dev: $('setDev'),
            god: $('setGod'),
            quality: $('setQuality'),
            hitmarkers: $('setHitmarkers'),
            damageNumbers: $('setDamageNumbers'),
            showFps: $('setFps')
        };

        document.querySelectorAll('#optionsMenu .tabs button').forEach(btn => {
            btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
        });

        this.el.scale.value = this.values.renderScale;
        this.el.fov.value = this.values.fov;
        this.el.sens.value = this.values.sensitivity;
        this.el.dark.checked = this.values.darkMode;

        this.el.scale.oninput = () => this.set('renderScale', +this.el.scale.value);
        this.el.fov.oninput = () => this.set('fov', +this.el.fov.value);
        this.el.sens.oninput = () => this.set('sensitivity', +this.el.sens.value);
        this.el.dark.onchange = () => this.set('darkMode', this.el.dark.checked);
        this.el.dev.checked = this.values.devMode;
        this.el.dev.onchange = () => this.set('devMode', this.el.dev.checked);
        this.el.god.checked = this.values.godMode;
        this.el.god.onchange = () => this.set('godMode', this.el.god.checked);
        for (const k in this.choices) {
            if (!this.choices[k].includes(this.values[k])) {
                this.values[k] = this.choices[k][0];
            }
            this.el[k].value = this.values[k];
            this.el[k].onchange = () => this.set(k, this.el[k].value);
        }
        for (const k of ['showFps']) {
            this.el[k].checked = this.values[k];
            this.el[k].onchange = () => this.set(k, this.el[k].checked);
        }

        this.el.fullscreen.value = this.values.fullscreen ? 'fullscreen' : 'windowed';
        this.el.fullscreen.onchange = () => this.setFullscreen(this.el.fullscreen.value === 'fullscreen');
        document.addEventListener('fullscreenchange', () => {
            const on = !!document.fullscreenElement;
            if (navigator.keyboard) {
                if (on) {
                    navigator.keyboard.lock(['Escape']).catch(() => {});
                } else {
                    navigator.keyboard.unlock();
                }
            }
            this.el.fullscreen.value = on ? 'fullscreen' : 'windowed';
            this.set('fullscreen', on);
        });
        addEventListener('resize', () => this.applyResolution());

        const restore = () => {
            if (!this.values.fullscreen || document.fullscreenElement) {
                removeEventListener('pointerdown', restore, true);
                removeEventListener('keydown', restore, true);
                return;
            }
            this.setFullscreen(true);
        };
        addEventListener('pointerdown', restore, true);
        addEventListener('keydown', restore, true);

        this.showTab('graphics');
        this.apply();
    },

    // God mode is per browser, so it only ever affects the player who turned it on.
    god() {
        return this.values.devMode && this.values.godMode;
    },

    showTab(name) {
        document.querySelectorAll('#optionsMenu .tabs button').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === name);
        });
        document.querySelectorAll('#optionsMenu .tab').forEach(t => {
            t.hidden = t.dataset.tab !== name;
        });
    },

    set(name, value) {
        this.values[name] = value;
        this.apply();
        try {
            localStorage.setItem(this.key, JSON.stringify(this.values));
        } catch (e) {
        }
    },

    apply() {
        const v = this.values;
        // Antialiasing is fixed per canvas, so a change swaps in a new renderer on the spot.
        if (DETAIL.preset(v.quality).antialias !== DETAIL.antialias) {
            rebuildRenderer(DETAIL.preset(v.quality).antialias);
        }
        this.applyResolution();
        document.documentElement.classList.toggle('dark', v.darkMode);

        CONFIG.fov = v.fov;
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
        CONFIG.sensitivity = v.sensitivity * 0.0005;
        if (typeof Enemies !== 'undefined' && Enemies.ready) {
            Enemies.setDev(v.devMode);
        }
        const P = DETAIL.preset(v.quality);
        if (DETAIL.enemies !== P.enemies) {
            DETAIL.enemies = P.enemies;
            if (typeof ShellcapKit !== 'undefined') {
                ShellcapKit.setDetail(P.enemies);
            }
        }
        const relight = DETAIL.lighting !== P.lighting;
        const remote = DETAIL.remoteGuns !== P.remoteGuns;
        if (DETAIL.guns !== P.guns || relight || remote) {
            DETAIL.guns = P.guns;
            DETAIL.lighting = P.lighting;
            DETAIL.remoteGuns = P.remoteGuns;
            if (typeof Arsenal !== 'undefined' && Arsenal.current) {
                Arsenal.rebuild();
                if (relight) {
                    Arsenal.hands.relight();
                }
                if (typeof Coop !== 'undefined') {
                    Coop.rebuildWeapons();
                }
            }
        }
        const particles = DETAIL.particleLevels[P.particles];
        if (DETAIL.particles !== particles) {
            DETAIL.particles = particles;
            if (typeof Enemies !== 'undefined' && Enemies.fx) {
                Enemies.fx.setAmount(particles);
            }
        }
        DETAIL.deathFx = P.deathFx;
        if (Perf.on !== v.showFps) {
            Perf.set(v.showFps);
        }

        this.el.scaleOut.textContent = Math.round(v.renderScale * 100) + '%';
        this.el.fovOut.textContent = v.fov + '°';
        this.el.sensOut.textContent = v.sensitivity;
    },

    applyResolution() {
        renderer.setPixelRatio(Math.min(devicePixelRatio, DETAIL.preset(this.values.quality).pixelCap) * this.values.renderScale);
        renderer.setSize(innerWidth, innerHeight);
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        this.el.res.textContent = `Rendering at ${size.x} × ${size.y}`;
    },

    setFullscreen(on) {
        const req = on
            ? document.documentElement.requestFullscreen()
            : document.fullscreenElement && document.exitFullscreen();
        Promise.resolve(req).catch(() => {
            this.el.fullscreen.value = document.fullscreenElement ? 'fullscreen' : 'windowed';
        });
    }
};
