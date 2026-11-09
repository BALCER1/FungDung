const Settings = {
    key: 'fungdung.settings',
    values: {
        renderScale: 1,
        upscale: 'smooth',
        fov: CONFIG.fov,
        sensitivity: 4,
        fullscreen: false,
        darkMode: false,
        devMode: false
    },

    init() {
        try {
            Object.assign(this.values, JSON.parse(localStorage.getItem(this.key)) || {});
        } catch (e) {
        }

        const $ = id => document.getElementById(id);
        this.el = {
            scale: $('setScale'),
            scaleOut: $('setScaleOut'),
            upscale: $('setUpscale'),
            fov: $('setFov'),
            fovOut: $('setFovOut'),
            fullscreen: $('setFullscreen'),
            sens: $('sens'),
            sensOut: $('sensOut'),
            res: $('setRes'),
            dark: $('setDark'),
            dev: $('setDev')
        };

        document.querySelectorAll('#optionsMenu .tabs button').forEach(btn => {
            btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
        });

        this.el.scale.value = this.values.renderScale;
        this.el.upscale.value = this.values.upscale;
        this.el.fov.value = this.values.fov;
        this.el.sens.value = this.values.sensitivity;
        this.el.dark.checked = this.values.darkMode;

        this.el.scale.oninput = () => this.set('renderScale', +this.el.scale.value);
        this.el.upscale.onchange = () => this.set('upscale', this.el.upscale.value);
        this.el.fov.oninput = () => this.set('fov', +this.el.fov.value);
        this.el.sens.oninput = () => this.set('sensitivity', +this.el.sens.value);
        this.el.dark.onchange = () => this.set('darkMode', this.el.dark.checked);
        this.el.dev.checked = this.values.devMode;
        this.el.dev.onchange = () => this.set('devMode', this.el.dev.checked);

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
        this.applyResolution();
        renderer.domElement.style.imageRendering = v.upscale === 'sharp' ? 'pixelated' : 'auto';
        document.documentElement.classList.toggle('dark', v.darkMode);

        CONFIG.fov = v.fov;
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
        CONFIG.sensitivity = v.sensitivity * 0.0005;
        if (typeof Enemies !== 'undefined' && Enemies.ready) {
            Enemies.setDev(v.devMode);
        }

        this.el.scaleOut.textContent = Math.round(v.renderScale * 100) + '%';
        this.el.fovOut.textContent = v.fov + '°';
        this.el.sensOut.textContent = v.sensitivity;
    },

    applyResolution() {
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * this.values.renderScale);
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
