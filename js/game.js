const Game = {
    state: 'menu',
    room: null,
    def: null,
    optionsBack: 'menu',
    roomKey: '',
    present: false,
    liveStates: { paused: true, options: true, mapview: true, entering: true, map: true },
    el: {},

    init() {
        for (const id of ['mainMenu', 'multiMenu', 'hostMenu', 'joinMenu', 'lobbyMenu', 'profileMenu', 'optionsMenu', 'pauseMenu', 'mapScreen', 'endScreen', 'deadScreen', 'deadInfo', 'quitScreen', 'hud', 'tip', 'mapBackBtn', 'stageLabel', 'warn', 'pauseTitle', 'pauseNote']) {
            this.el[id] = document.getElementById(id);
        }
        Input.init();
        Settings.init();
        Profile.init();
        Net.init();
        Lobby.init();
        Coop.init();
        Arsenal.init();
        Vitals.init();
        Players.init();
        Enemies.init();
        MapView.init();

        const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
        on('singleBtn', () => this.startRun());
        on('multiBtn', () => Lobby.openMulti());
        on('profileBtn', () => Profile.open());
        on('profileBackBtn', () => this.setState('menu'));
        on('optionsBtn', () => this.openOptions('menu'));
        on('quitBtn', () => this.quit());
        on('resumeBtn', () => this.lock());
        on('pauseOptionsBtn', () => this.openOptions('paused'));
        on('abandonBtn', () => this.toMenu());
        on('optionsBackBtn', () => this.setState(this.optionsBack));
        on('endMenuBtn', () => this.toMenu());
        on('deadMenuBtn', () => this.toMenu());
        on('quitBackBtn', () => this.setState('menu'));
        on('mapBackBtn', () => this.closeBrowse());

        addEventListener('keydown', e => {
            if (e.code === 'Escape' && this.state === 'playing') {
                document.exitPointerLock();
            }
            if (e.code === 'KeyM' && !e.repeat) {
                if (this.state === 'playing') {
                    this.browseMap();
                } else if (this.state === 'mapview') {
                    this.closeBrowse();
                }
            }
            if (e.code === 'KeyE' && this.state === 'playing' && this.room.door && this.room.door.near(Player.pos)) {
                this.room.door.open();
            }
        });
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === renderer.domElement) {
                Input.resetLook();
                this.setState('playing');
            } else if (this.state === 'playing') {
                this.setState('paused');
            }
        });
        document.addEventListener('pointerlockerror', () => {
            this.setState('paused');
            this.el.warn.hidden = false;
        });
        document.addEventListener('mousemove', e => {
            if (this.state !== 'playing') {
                return;
            }
            const d = Input.lookDelta(e);
            if (d) {
                Player.look(d.x, d.y);
                Arsenal.current.look(d.x, d.y);
            }
        });

        this.setState('intro');
        Intro.play(() => this.setState('menu'));
        this.last = performance.now();
        requestAnimationFrame(t => this.loop(t));
    },

    setState(s) {
        this.state = s;
        const screens = {
            menu: 'mainMenu',
            multi: 'multiMenu',
            host: 'hostMenu',
            join: 'joinMenu',
            lobby: 'lobbyMenu',
            profile: 'profileMenu',
            options: 'optionsMenu',
            paused: 'pauseMenu',
            map: 'mapScreen',
            mapview: 'mapScreen',
            complete: 'endScreen',
            dead: 'deadScreen',
            quit: 'quitScreen'
        };
        for (const id of new Set(Object.values(screens))) {
            this.el[id].hidden = id !== screens[s];
        }
        this.el.mapBackBtn.hidden = s !== 'mapview';
        this.el.hud.hidden = s !== 'playing';
        this.el.warn.hidden = true;
        this.el.pauseTitle.textContent = Coop.running ? 'Menu' : 'Paused';
        this.el.pauseNote.hidden = !Coop.running;
    },

    openOptions(back) {
        this.optionsBack = back;
        this.setState('options');
    },

    lock() {
        const el = renderer.domElement;
        let req;
        try {
            req = el.requestPointerLock({ unadjustedMovement: true });
        } catch (err) {
            el.requestPointerLock();
            return;
        }
        if (req && req.catch) {
            req.catch(err => {
                if (err && err.name === 'NotSupportedError') {
                    el.requestPointerLock();
                }
            });
        }
    },

    startRun(seed) {
        this.unloadRoom();
        Vitals.reset();
        if (seed === undefined && Settings.values.devMode) {
            seed = Rng.parse(document.getElementById('setSeed').value);
        }
        Rng.start(seed === undefined || seed === null ? Rng.fresh() : seed);
        Rng.use('map');
        RunMap.generate(CONFIG.stages);
        this.openMap();
    },

    openMap() {
        this.setState('map');
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        const here = RunMap.current;
        const animate = !here || here.type === 'boss';
        if (Coop.running && Net.isGuest) {
            this.unloadRoom();
            MapView.open({ readOnly: true, info: Coop.WAIT_TEXT, animate });
        } else if (Coop.running) {
            MapView.open({ onPick: node => Coop.hostPick(node), animate });
        } else {
            this.unloadRoom();
            MapView.open({ onPick: node => this.enterRoom(node), animate });
        }
    },

    browseMap() {
        this.setState('mapview');
        document.exitPointerLock();
        MapView.open({ browse: true });
    },

    closeBrowse() {
        MapView.close();
        this.setState('entering');
        this.lock();
    },

    enterRoom(node) {
        this.unloadRoom();
        RunMap.visit(node);
        this.def = Rooms.get(node.type);
        const b = new RoomBuilder();
        const key = node.layer + ':' + node.index;
        Rng.use('room/' + key);
        this.def.build(b, node);
        this.room = b;
        this.roomKey = key;
        this.present = true;
        Player.reset(b);
        Arsenal.reset();
        Rng.use('spawn/' + key);
        Rng.think('ai/' + key);
        if (Coop.running && Net.isGuest) {
            Enemies.loadPuppets(b);
            Coop.askEnemies();
        } else {
            Enemies.load(b);
        }
        scene.background = new THREE.Color(b.background);
        scene.fog = b.fog;
        this.el.stageLabel.textContent = `Stage ${node.layer + 1} / ${RunMap.layers.length} - ${this.def.name}` +
            (Settings.values.devMode ? ` - seed ${Rng.seed}` : '');
        if (document.pointerLockElement === renderer.domElement) {
            Input.resetLook();
            this.setState('playing');
        } else {
            this.setState('entering');
            this.lock();
        }
    },

    unloadRoom() {
        Enemies.clear();
        this.roomKey = '';
        this.present = false;
        if (this.room) {
            this.room.dispose();
            this.room = null;
            this.def = null;
        }
    },

    leaveRoom() {
        if (Coop.running) {
            Coop.atDoor();
            return;
        }
        if (RunMap.current.next.length) {
            this.openMap();
            return;
        }
        this.finishRun();
    },

    finishRun() {
        MapView.close();
        this.setState('complete');
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        this.unloadRoom();
    },

    toMenu() {
        Coop.end();
        if (Net.active) {
            Net.leave();
        }
        this.unloadRoom();
        this.setState('menu');
    },

    die() {
        const node = RunMap.current;
        this.el.deadInfo.textContent = node ? `Consumed on stage ${node.layer + 1} of ${RunMap.layers.length}.` : '';
        this.setState('dead');
        document.exitPointerLock();
        this.unloadRoom();
    },

    quit() {
        window.close();
        this.setState('quit');
    },

    updateRoom(dt) {
        if (this.def.update) {
            this.def.update(dt, this.room);
        }
        const door = this.room.door;
        if (!door) {
            return;
        }
        door.update(dt);
        if (!this.present) {
            return;
        }
        this.el.tip.hidden = door.isOpen || !door.near(Player.pos);
        if (door.passed(Player.pos)) {
            this.leaveRoom();
        }
    },

    loop(now) {
        const start = performance.now();
        const interval = now - this.last;
        const dt = Math.min(interval / 1000, 0.05);
        this.last = now;
        const coop = Coop.running;
        if (this.room && (this.state === 'playing' || (coop && this.liveStates[this.state]))) {
            if (this.state !== 'playing') {
                Input.keys = {};
            }
            if (this.present) {
                Player.update(dt);
            }
            Players.update(dt);
            Enemies.update(dt);
            this.updateRoom(dt);
            Arsenal.update(dt);
            Vitals.update(dt);
            if (Vitals.dead) {
                this.die();
            }
        }
        if (coop) {
            Coop.frame(interval / 1000);
        }
        if (this.room && this.state !== 'mapview' && this.state !== 'map') {
            Arsenal.render();
        }
        Perf.frame(interval, performance.now() - start);
        requestAnimationFrame(t => this.loop(t));
    }
};

Game.init();
