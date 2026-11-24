const Arsenal = {
    weapons: {},
    current: null,
    view: null,
    ray: new THREE.Raycaster(),
    hud: null,
    hands: null,
    onHit: null,
    onFire: null,
    onShotEnd: null,
    onLocalShot: null,
    onLocalSwing: null,
    firing: false,

    init() {
        scene.add(camera);
        this.ray.layers.enable(BATCH_LAYER);
        this.view = new WeaponView(camera, { fov: 55 });
        this.view.shareLights(scene);
        this.view.addLights();
        this.scope = new ScopeOverlay();
        this.hands = new Hands();
        const look = Player.look.bind(Player);
        Player.look = (dx, dy) => {
            const k = this.scope.sensitivity(this.current);
            look(dx * k, dy * k);
        };
        this.buildWeapons();
        this.setupMuzzleLights();
        this.makeHud();
        this.cross = document.getElementById('cross');
        this.select(Weapons.order[0]);

        const playing = () => typeof Game !== 'undefined' && Game.state === 'playing' && !(Players.local && Players.local.down);
        const press = (id, fn) => Keys.onPress(id, e => {
            if (playing() && !e.repeat) {
                fn();
            }
        });
        press('fire', () => {
            this.firing = true;
            this.current.setTrigger(true);
        });
        press('alt', () => this.current.setAlt(true));
        Keys.onRelease('fire', () => {
            this.firing = false;
            this.current.setTrigger(false);
        });
        Keys.onRelease('alt', () => this.current.setAlt(false));
        addEventListener('contextmenu', e => {
            if (playing()) {
                e.preventDefault();
            }
        });
        const cycle = step => {
            const i = Weapons.order.indexOf(this.current.id);
            const n = Weapons.order.length;
            this.select(Weapons.order[(i + step + n) % n]);
        };
        press('nextWeapon', () => cycle(1));
        press('prevWeapon', () => cycle(-1));
        for (let n = 1; n <= 6; n++) {
            press('weapon' + n, () => {
                if (n <= Weapons.order.length) {
                    this.select(Weapons.order[n - 1]);
                }
            });
        }
        press('reload', () => this.current.reload());
        press('inspect', () => this.current.inspect());
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement) {
                this.firing = false;
                this.current.setTrigger(false);
                this.current.setAlt(false);
                this.current.zoom = 0;
                this.scope.update(this.current, camera, CONFIG.fov);
            }
        });
    },

    buildWeapons() {
        for (const id of Weapons.order) {
            const w = new Weapon(id, {
                worldParent: scene,
                trace: (origin, dir, range) => this.trace(origin, dir, range),
                onShot: shot => this.shoot(shot),
                onSwing: (weapon, o) => {
                    if (this.onLocalSwing) {
                        this.onLocalSwing(weapon, o);
                    }
                }
            });
            this.view.attach(w);
            this.weapons[id] = w;
        }
    },

    rebuild() {
        if (!this.current) {
            return;
        }
        const ammo = {};
        for (const id in this.weapons) {
            ammo[id] = this.weapons[id].ammo;
            this.weapons[id].dispose();
        }
        const id = this.current.id;
        this.current = null;
        this.buildWeapons();
        this.setupMuzzleLights();
        for (const k in ammo) {
            this.weapons[k].ammo = ammo[k];
            this.weapons[k].reloadFrom = ammo[k];
        }
        this.select(id);
    },

    select(id) {
        if (this.current && this.current.id === id) {
            return;
        }
        if (this.current) {
            camera.remove(this.current.root);
            this.current.setTrigger(false);
            this.current.setAlt(false);
            this.current.clearEffects();
            this.current.setHands(null);
        }
        this.current = this.weapons[id];
        camera.add(this.current.root);
        this.current.setHands(this.hands);
        this.current.equip();
        if (this.firing) {
            this.current.setTrigger(true);
        }
        this.updateHud();
    },

    reset() {
        const w = this.current;
        this.firing = false;
        w.setTrigger(false);
        w.setAlt(false);
        w.clearEffects();
        w.equip();
        this.scope.update(w, camera, CONFIG.fov);
        this.updateHud();
    },

    update(dt) {
        const speed = Math.hypot(Player.vel.x, Player.vel.z);
        const moving = Keys.held('forward') || Keys.held('back') || Keys.held('left') || Keys.held('right');
        this.current.update(dt, {
            speed,
            sprinting: Keys.held('sprint') && moving && speed > CONFIG.walk + 0.5,
            grounded: Player.onGround
        });
        const m = this.current.def.move ? this.current.def.move(this.current) : null;
        Player.moveScale = m ? m.scale : 1;
        Player.noJump = !!(m && m.noJump);
        const z = this.scope.update(this.current, camera, CONFIG.fov);
        const cross = this.cross;
        if (cross) {
            const hide = z > 0.6 || Players.local.down;
            if (cross.hidden !== hide) {
                cross.hidden = hide;
            }
        }
        this.syncMuzzleLights();
        this.updateHud();
    },

    // Muzzle flash lights. A fixed number of point lights stays on the camera whatever gun is held
    // (pistols have two flashes, the spear and hammer none), so switching guns or scoping in never
    // changes the scene's light count. Each frame they copy the held gun's flash lights. Only with
    // Lighting on High, as before.
    setupMuzzleLights() {
        for (const l of this.muzzleLights || []) {
            camera.remove(l);
            l.dispose();
        }
        this.muzzleLights = [];
        if (DETAIL.lighting !== 'high') {
            return;
        }
        let n = 0;
        for (const id in this.weapons) {
            n = Math.max(n, (this.weapons[id].parts.flashes || []).length);
        }
        for (let i = 0; i < n; i++) {
            const l = new THREE.PointLight(0xffffff, 0, 2.5, 2);
            l.layers.enable(0);
            l.layers.enable(this.view.layer);
            camera.add(l);
            this.muzzleLights.push(l);
        }
    },

    syncMuzzleLights() {
        const w = this.current;
        const flashes = w.parts.flashes || [];
        // Hidden gun (scoped in): no flash light, as when the light lived inside the gun.
        const shown = w.root.visible && w.root.parent === camera;
        for (let i = 0; i < this.muzzleLights.length; i++) {
            const slot = this.muzzleLights[i];
            const f = flashes[i];
            if (!shown || !f || !(f.light.intensity > 0)) {
                slot.intensity = 0;
                continue;
            }
            f.group.getWorldPosition(slot.position);
            camera.worldToLocal(slot.position);
            slot.color.copy(f.light.color);
            slot.distance = f.light.distance;
            slot.decay = f.light.decay;
            slot.intensity = f.light.intensity;
        }
    },

    render() {
        renderer.render(scene, camera);
        if (!Players.local.down) {
            this.view.render(renderer, scene);
        }
    },

    trace(origin, dir, range) {
        const room = typeof Game !== 'undefined' && Game.room;
        if (!room) {
            return null;
        }
        this.ray.set(origin, dir);
        this.ray.far = range;
        const hit = this.ray.intersectObject(room.group, true)[0];
        if (!hit) {
            return null;
        }
        const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
        return { point: hit.point, normal, object: hit.object, distance: hit.distance };
    },

    shoot(shot) {
        shot.by = Players.local;
        if (Settings.god()) {
            shot.damage = CONFIG.god.damage;
        }
        if (this.onLocalShot && shot.dirs.length) {
            this.onLocalShot(shot);
        }
        if (this.onFire && shot.dirs.length) {
            this.onFire(shot);
        }
        if (!this.onHit || !shot.hits) {
            return;
        }
        shot.hits.forEach(hit => {
            if (hit) {
                this.onHit(hit, shot);
            }
        });
        if (this.onShotEnd) {
            this.onShotEnd(shot);
        }
    },

    makeHud() {
        const hud = document.getElementById('hud');
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;right:16px;bottom:14px;text-align:right;color:#fff;font:600 14px system-ui,sans-serif;text-shadow:0 1px 3px #000a';
        const shield = '<svg data-g viewBox="0 0 16 18" style="width:13px;height:15px;vertical-align:-2px;margin-right:5px;display:none">' +
            '<path d="M8 1 L15 4 V9 C15 13 12 16 8 17 C4 16 1 13 1 9 V4 Z" fill="#9fc3d8" fill-opacity=".35" stroke="#cfe6f2" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        el.innerHTML = '<div data-n style="opacity:.8"></div><div><span data-a style="font-size:30px"></span> ' + shield + '<span data-m style="opacity:.6"></span></div>' +
            '<div style="height:3px;background:#fff3;margin-top:4px"><i data-r style="display:block;height:100%;width:0"></i></div>';
        (hud || document.body).appendChild(el);
        this.hudEl = el;
        this.hud = {
            name: el.querySelector('[data-n]'),
            ammo: el.querySelector('[data-a]'),
            mag: el.querySelector('[data-m]'),
            guard: el.querySelector('[data-g]'),
            bar: el.querySelector('[data-r]')
        };
    },

    updateHud() {
        const w = this.current;
        if (!this.hud || !w) {
            return;
        }
        // Every write is skipped when nothing changed: setting text forces the page to lay out again.
        const h = this.hud;
        const put = (key, el, value) => {
            if (h['_' + key] !== value) {
                h['_' + key] = value;
                el.textContent = value;
            }
        };
        const display = Players.local && Players.local.down ? 'none' : '';
        if (h._display !== display) {
            h._display = display;
            this.hudEl.style.display = display;
        }
        put('name', h.name, w.name + (w.def.altName ? '  ·  RMB ' + w.def.altName : ''));
        put('ammo', h.ammo, w.melee ? '' : String(w.ammo));
        put('mag', h.mag, w.melee ? (w.def.status ? w.def.status(w) : '') : '/ ' + w.stats.mag);
        const guard = !!(w.def.damageTaken && w.def.damageTaken(w) < 1);
        if (guard !== h.guardShown) {
            h.guardShown = guard;
            h.guard.style.display = guard ? 'inline' : 'none';
        }
        const charge = w.def.meter ? w.def.meter(w) : w.state === 'charge' ? w.data.charge : 0;
        const width = (Math.max(w.reloadProgress, charge) * 100).toFixed(1) + '%';
        if (h._width !== width) {
            h._width = width;
            h.bar.style.width = width;
        }
        if (h._color !== w.def.color) {
            h._color = w.def.color;
            h.bar.style.background = '#' + new THREE.Color(w.def.color).getHexString();
        }
    }
};
