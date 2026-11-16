// Rebindable controls. Every action has two slots, each holding one input code: a keyboard
// `KeyboardEvent.code`, `Mouse<button>`, `WheelUp` or `WheelDown`. A code belongs to at most one
// action. Handlers subscribe with `Keys.onPress` / `Keys.onRelease`; held state is `Keys.held`.
const Keys = {
    storeKey: 'fungdung.keys',
    groups: [
        ['Movement', [
            ['forward', 'Move forward', 'KeyW', 'ArrowUp'],
            ['back', 'Move back', 'KeyS', 'ArrowDown'],
            ['left', 'Move left', 'KeyA', 'ArrowLeft'],
            ['right', 'Move right', 'KeyD', 'ArrowRight'],
            ['jump', 'Jump', 'Space'],
            ['sprint', 'Sprint', 'ShiftLeft', 'ShiftRight'],
            ['crouch', 'Crouch (hold)', 'KeyC']
        ]],
        ['Combat', [
            ['fire', 'Fire', 'Mouse0'],
            ['alt', 'Alt fire / aim', 'Mouse2'],
            ['reload', 'Reload', 'KeyR'],
            ['inspect', 'Inspect weapon', 'KeyF']
        ]],
        ['Weapons', [
            ['weapon1', 'Weapon 1', 'Digit1', 'Numpad1'],
            ['weapon2', 'Weapon 2', 'Digit2', 'Numpad2'],
            ['weapon3', 'Weapon 3', 'Digit3', 'Numpad3'],
            ['weapon4', 'Weapon 4', 'Digit4', 'Numpad4'],
            ['nextWeapon', 'Next weapon', 'WheelDown'],
            ['prevWeapon', 'Previous weapon', 'WheelUp']
        ]],
        ['Other', [
            ['interact', 'Interact / revive', 'KeyE'],
            ['map', 'Map', 'KeyM'],
            ['travel', 'Travel now (co-op)', 'KeyT'],
            ['devOverlay', 'Dev overlay (dev mode)', 'Backquote']
        ]]
    ],
    names: {
        Space: 'Space',
        ShiftLeft: 'L Shift',
        ShiftRight: 'R Shift',
        ControlLeft: 'L Ctrl',
        ControlRight: 'R Ctrl',
        AltLeft: 'L Alt',
        AltRight: 'R Alt',
        MetaLeft: 'L Meta',
        MetaRight: 'R Meta',
        CapsLock: 'Caps Lock',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
        Mouse0: 'LMB',
        Mouse1: 'MMB',
        Mouse2: 'RMB',
        Mouse3: 'Mouse 4',
        Mouse4: 'Mouse 5',
        WheelUp: 'Wheel up',
        WheelDown: 'Wheel down'
    },
    defaults: {},
    labels: {},
    binds: {},
    byCode: {},
    press: {},
    release: {},
    layout: null,
    waiting: null,
    swallow: false,
    el: {},

    load() {
        for (const [, list] of this.groups) {
            for (const [id, name, a, b] of list) {
                this.defaults[id] = [a || null, b || null];
                this.labels[id] = name;
            }
        }
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(this.storeKey)) || {};
        } catch (e) {
        }
        for (const id in this.defaults) {
            const s = saved[id];
            const ok = Array.isArray(s) && s.length === 2 && s.every(c => c === null || typeof c === 'string');
            this.binds[id] = ok ? s.slice() : this.defaults[id].slice();
        }
        this.index();
    },

    save() {
        try {
            localStorage.setItem(this.storeKey, JSON.stringify(this.binds));
        } catch (e) {
        }
    },

    index() {
        this.byCode = {};
        for (const id in this.binds) {
            for (const c of this.binds[id]) {
                if (c) {
                    this.byCode[c] = id;
                }
            }
        }
    },

    // The binding code for a keyboard, mouse or wheel event.
    code(e) {
        if (e.type === 'wheel') {
            return e.deltaY < 0 ? 'WheelUp' : e.deltaY > 0 ? 'WheelDown' : null;
        }
        if (e.type.startsWith('mouse')) {
            return 'Mouse' + e.button;
        }
        return e.code || null;
    },

    held(id) {
        const b = this.binds[id];
        const k = Input.keys;
        return !!((b[0] && k[b[0]]) || (b[1] && k[b[1]]));
    },

    onPress(id, fn) {
        (this.press[id] = this.press[id] || []).push(fn);
    },

    onRelease(id, fn) {
        (this.release[id] = this.release[id] || []).push(fn);
    },

    emit(table, e) {
        const id = this.byCode[this.code(e)];
        const fns = id && table[id];
        if (fns) {
            fns.forEach(fn => fn(e));
        }
        return id;
    },

    // Readable name of one code, using the keyboard layout when the browser exposes it.
    name(code) {
        if (!code) {
            return '—';
        }
        if (this.names[code]) {
            return this.names[code];
        }
        const ch = this.layout && this.layout.get(code);
        if (ch && ch.trim()) {
            return ch.toUpperCase();
        }
        if (/^Key[A-Z]$/.test(code)) {
            return code.slice(3);
        }
        if (/^Digit\d$/.test(code)) {
            return code.slice(5);
        }
        if (/^Numpad/.test(code)) {
            return 'Num ' + code.slice(6);
        }
        if (/^Mouse\d+$/.test(code)) {
            return 'Mouse ' + (+code.slice(5) + 1);
        }
        return code.replace(/(Left|Right)$/, ' $1');
    },

    // Name of the key an action is bound to, for hints like "E: open door".
    key(id) {
        const b = this.binds[id];
        return b[0] || b[1] ? this.name(b[0] || b[1]) : 'unbound';
    },

    init() {
        this.load();
        const playing = () => typeof Game !== 'undefined' && Game.state === 'playing';

        // Capture phase: while waiting for a new binding, eat the input before the game sees it.
        addEventListener('keydown', e => {
            if (!this.waiting) {
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.repeat) {
                return;
            }
            if (e.code === 'Escape') {
                this.stopWaiting();
            } else if (e.code === 'Backspace' || e.code === 'Delete') {
                this.assign(null);
            } else {
                this.assign(e.code);
            }
        }, true);
        addEventListener('mousedown', e => {
            if (!this.waiting) {
                this.swallow = false;
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            this.swallow = true;
            this.assign(this.code(e));
        }, true);
        addEventListener('wheel', e => {
            if (!this.waiting) {
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            const c = this.code(e);
            if (c) {
                this.assign(c);
            }
        }, { capture: true, passive: false });
        // After a mouse button was captured, its mouseup/click must not press whatever is under
        // the cursor, open the context menu or navigate back (mouse 4/5).
        for (const type of ['mouseup', 'click', 'auxclick', 'contextmenu']) {
            addEventListener(type, e => {
                if (this.swallow) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (type === 'mouseup') {
                        setTimeout(() => {
                            this.swallow = false;
                        }, 50);
                    }
                }
            }, true);
        }

        addEventListener('keydown', e => {
            const id = this.emit(this.press, e);
            if (id && playing() && e.code !== 'Escape') {
                e.preventDefault();
            }
        });
        addEventListener('keyup', e => this.emit(this.release, e));
        addEventListener('mousedown', e => {
            const id = this.emit(this.press, e);
            if (id && playing()) {
                e.preventDefault();
            }
        });
        addEventListener('mouseup', e => {
            const id = this.emit(this.release, e);
            if (id && playing()) {
                e.preventDefault();
            }
        });
        addEventListener('wheel', e => this.emit(this.press, e));

        if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
            try {
                navigator.keyboard.getLayoutMap().then(map => {
                    this.layout = map;
                    this.refresh();
                }).catch(() => {});
            } catch (e) {
            }
        }

        this.buildUi();
    },

    buildUi() {
        const $ = id => document.getElementById(id);
        this.el = { list: $('bindList'), msg: $('bindMsg'), reset: $('bindReset'), rows: {} };
        if (!this.el.list) {
            return;
        }
        for (const [title, list] of this.groups) {
            const head = document.createElement('div');
            head.className = 'bindHead';
            head.textContent = title;
            this.el.list.appendChild(head);
            for (const [id] of list) {
                const row = document.createElement('div');
                row.className = 'row bind';
                const label = document.createElement('span');
                label.textContent = this.labels[id];
                const ctl = document.createElement('span');
                ctl.className = 'ctl';
                const btns = [0, 1].map(slot => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'key';
                    btn.addEventListener('click', () => this.startWaiting(id, slot));
                    ctl.appendChild(btn);
                    return btn;
                });
                row.append(label, ctl);
                this.el.list.appendChild(row);
                this.el.rows[id] = { label, btns };
            }
        }
        this.el.reset.addEventListener('click', () => {
            this.stopWaiting();
            for (const id in this.defaults) {
                this.binds[id] = this.defaults[id].slice();
            }
            this.changed('Controls reset to defaults.');
        });
        // Leaving the Controls tab or the Settings screen cancels a pending rebind.
        document.querySelectorAll('#optionsMenu .tabs button, #optionsBackBtn').forEach(b => {
            b.addEventListener('click', () => this.stopWaiting());
        });
        this.refresh();
    },

    startWaiting(id, slot) {
        this.stopWaiting();
        this.waiting = { id, slot };
        const btn = this.el.rows[id].btns[slot];
        btn.blur();
        btn.classList.add('wait');
        btn.textContent = 'Press…';
        this.el.msg.textContent = `Press a key, mouse button or scroll for "${this.labels[id]}". Esc cancels, Backspace clears.`;
    },

    stopWaiting() {
        if (!this.waiting) {
            return;
        }
        this.waiting = null;
        this.el.msg.textContent = '';
        this.refresh();
    },

    assign(code) {
        const { id, slot } = this.waiting;
        this.waiting = null;
        let note = '';
        if (code) {
            for (const other in this.binds) {
                const b = this.binds[other];
                for (let i = 0; i < 2; i++) {
                    if (b[i] === code && !(other === id && i === slot)) {
                        b[i] = null;
                        if (other !== id) {
                            note = ` (removed from "${this.labels[other]}")`;
                        }
                    }
                }
            }
        }
        this.binds[id][slot] = code;
        this.changed(code ? `${this.labels[id]}: ${this.name(code)}${note}` : `${this.labels[id]}: slot cleared`);
    },

    changed(msg) {
        this.index();
        this.save();
        Input.keys = {};
        this.el.msg.textContent = msg;
        this.refresh();
    },

    // Redraw the bindings list and every in-game hint that names a key (`data-key="<action>"`).
    refresh() {
        for (const id in this.el.rows || {}) {
            const row = this.el.rows[id];
            const b = this.binds[id];
            row.btns.forEach((btn, i) => {
                btn.classList.remove('wait');
                btn.classList.toggle('empty', !b[i]);
                btn.textContent = this.name(b[i]);
            });
            row.label.classList.toggle('unbound', !b[0] && !b[1]);
        }
        document.querySelectorAll('[data-key]').forEach(el => {
            el.textContent = this.key(el.dataset.key);
        });
    }
};
