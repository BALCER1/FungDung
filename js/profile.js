const Profile = {
    el: {},
    mode: null,
    nameDirty: false,

    init() {
        for (const id of [
            'menuLead', 'menuName', 'menuTag', 'menuNotice',
            'profStatus', 'profNameForm', 'profName', 'profNameMsg',
            'profGuest', 'profSaveBtn', 'profLoginBtn',
            'profSaveForm', 'profSaveEmail', 'profSavePass',
            'profLoginForm', 'profLoginEmail', 'profLoginPass',
            'profPending', 'profPendingText', 'profCheckBtn',
            'profPassForm', 'profNewPass',
            'profSaved', 'profLogoutBtn',
            'profOffline', 'profRetryBtn', 'profMsg'
        ]) {
            this.el[id] = document.getElementById(id);
        }
        const e = this.el;
        document.getElementById('menuVersion').textContent = 'v' + CONFIG.version;

        e.profName.addEventListener('input', () => {
            this.nameDirty = true;
            this.say(e.profNameMsg, '');
        });
        e.profNameForm.addEventListener('submit', ev => {
            ev.preventDefault();
            this.saveName();
        });
        e.profSaveBtn.addEventListener('click', () => this.setMode('save'));
        e.profLoginBtn.addEventListener('click', () => this.setMode('login'));
        for (const btn of document.querySelectorAll('#profileMenu [data-cancel]')) {
            btn.addEventListener('click', () => this.setMode(null));
        }
        e.profSaveForm.addEventListener('submit', ev => {
            ev.preventDefault();
            this.saveAccount();
        });
        e.profLoginForm.addEventListener('submit', ev => {
            ev.preventDefault();
            this.logIn();
        });
        e.profPassForm.addEventListener('submit', ev => {
            ev.preventDefault();
            this.setPassword();
        });
        e.profCheckBtn.addEventListener('click', () => this.checkConfirmed(false));
        e.profLogoutBtn.addEventListener('click', () => this.logOut());
        e.profRetryBtn.addEventListener('click', () => DB.connect());
        addEventListener('focus', () => {
            if (this.showing() && this.waiting() && !DB.busy) {
                this.checkConfirmed(true);
            }
        });

        e.menuNotice.textContent = DB.notice;
        DB.onChange = () => this.refresh();
        this.refresh();
    },

    showing() {
        return typeof Game !== 'undefined' && Game.state === 'profile';
    },

    waiting() {
        return DB.online && DB.isGuest && !!DB.pendingEmail;
    },

    open() {
        Game.setState('profile');
        this.mode = null;
        this.nameDirty = false;
        this.say(this.el.profNameMsg, '');
        this.say(this.el.profMsg, DB.notice, true);
        DB.notice = '';
        this.el.menuNotice.textContent = '';
        this.refresh();
        if (this.waiting()) {
            this.checkConfirmed(true);
        }
    },

    setMode(mode) {
        this.mode = mode;
        this.say(this.el.profMsg, '');
        this.el.profSavePass.value = '';
        this.el.profLoginPass.value = '';
        this.refresh();
        if (mode === 'save') {
            this.el.profSaveEmail.focus();
        } else if (mode === 'login') {
            this.el.profLoginEmail.focus();
        }
    },

    say(el, text, good = false) {
        el.textContent = text || '';
        el.classList.toggle('ok', !!text && good);
        el.classList.toggle('err', !!text && !good);
    },

    refresh() {
        const e = this.el;
        const online = DB.online;
        const guest = DB.isGuest;
        const waiting = this.waiting();

        if (online) {
            e.menuLead.textContent = 'Playing as ';
            e.menuName.textContent = DB.name || 'Guest';
            e.menuTag.textContent = guest ? ' (guest)' : '';
        } else {
            e.menuLead.textContent = DB.status === 'offline' ? 'Offline - progress will not be saved' : 'Connecting...';
            e.menuName.textContent = '';
            e.menuTag.textContent = '';
        }

        if (!online) {
            e.profStatus.textContent = DB.status === 'offline'
                ? 'Offline. You can still play, but your name and progress are not saved.'
                : 'Connecting...';
        } else if (!guest) {
            e.profStatus.textContent = 'Signed in as ' + DB.email + '.';
        } else if (waiting) {
            e.profStatus.textContent = 'Guest account. Waiting for you to confirm ' + DB.pendingEmail + '.';
        } else {
            e.profStatus.textContent = 'Guest account. It only exists in this browser, so save it to keep your name and progress.';
        }

        if (!this.nameDirty && document.activeElement !== e.profName) {
            e.profName.value = DB.name;
        }
        e.profName.disabled = !online || !DB.profile;

        const form = online && guest ? this.mode : null;
        e.profGuest.hidden = !(online && guest && !form);
        e.profSaveForm.hidden = form !== 'save';
        e.profLoginForm.hidden = form !== 'login';
        e.profPending.hidden = !(waiting && !form);
        e.profPendingText.textContent = waiting
            ? 'We sent a confirmation link to ' + DB.pendingEmail + '. Click it, then come back here.'
            : '';
        e.profPassForm.hidden = !(online && DB.needsPassword);
        e.profSaved.hidden = !(online && !guest);
        e.profOffline.hidden = DB.status !== 'offline';

        for (const btn of document.querySelectorAll('#profileMenu .panel button')) {
            btn.disabled = DB.busy > 0;
        }
    },

    async saveName() {
        const e = this.el;
        const res = await DB.setName(e.profName.value);
        if (res.ok) {
            this.nameDirty = false;
            e.profName.value = res.name;
            this.say(e.profNameMsg, 'Name saved.', true);
        } else {
            this.say(e.profNameMsg, res.error);
        }
    },

    async saveAccount() {
        const e = this.el;
        const email = e.profSaveEmail.value.trim();
        const password = e.profSavePass.value;
        if (password.length < DB.MIN_PASSWORD) {
            this.say(e.profMsg, 'Passwords need at least ' + DB.MIN_PASSWORD + ' characters.');
            return;
        }
        const res = await DB.saveAccount(email, password);
        if (!res.ok) {
            this.say(e.profMsg, res.error);
            return;
        }
        this.setMode(null);
        if (res.pending) {
            this.say(e.profMsg, 'Almost done. Check your inbox for the confirmation link.', true);
        } else {
            this.say(e.profMsg, 'Account saved. You can now log in on other devices with this email.', true);
        }
    },

    async checkConfirmed(quiet) {
        const res = await DB.refreshUser();
        if (res.ok && res.saved) {
            this.say(this.el.profMsg, 'Email confirmed. Your account is saved.', true);
        } else if (!quiet) {
            this.say(this.el.profMsg, res.ok ? 'Not confirmed yet. Click the link in the email first.' : res.error);
        }
    },

    async setPassword() {
        const e = this.el;
        const password = e.profNewPass.value;
        if (password.length < DB.MIN_PASSWORD) {
            this.say(e.profMsg, 'Passwords need at least ' + DB.MIN_PASSWORD + ' characters.');
            return;
        }
        const res = await DB.setPassword(password);
        e.profNewPass.value = '';
        this.say(e.profMsg, res.ok ? 'Password set.' : res.error, res.ok);
    },

    async logIn() {
        const e = this.el;
        const res = await DB.logIn(e.profLoginEmail.value.trim(), e.profLoginPass.value);
        if (!res.ok) {
            this.say(e.profMsg, res.error);
            return;
        }
        this.nameDirty = false;
        this.setMode(null);
        this.say(e.profMsg, 'Logged in.', true);
    },

    async logOut() {
        const res = await DB.logOut();
        this.nameDirty = false;
        this.say(this.el.profNameMsg, '');
        this.refresh();
        if (!res.ok) {
            this.say(this.el.profMsg, res.error || 'Logged out, but the server could not be reached for a new guest account.');
        } else {
            this.say(this.el.profMsg, 'Logged out. You are now playing as a new guest.', true);
        }
    }
};
