const DB = {
    url: 'https://rnmlyejuwfdqnlgohzhm.supabase.co',
    key: 'sb_publishable_HWd2ca96IzPa4L58eM2CUQ__SOOjg-L',
    client: null,
    user: null,
    profile: null,
    status: 'connecting',
    notice: '',
    busy: 0,
    onChange: null,
    watchers: [],
    token: '',
    reconnectT: 0,
    NAME_RULE: /^[A-Za-z0-9_]+( [A-Za-z0-9_]+)*$/,
    MIN_PASSWORD: 6,

    get online() {
        return this.status === 'online';
    },
    get name() {
        return this.profile ? this.profile.display_name : '';
    },
    get isGuest() {
        return !this.user || !!this.user.is_anonymous;
    },
    get email() {
        return (this.user && this.user.email) || '';
    },
    get pendingEmail() {
        return (this.user && this.user.new_email) || '';
    },
    get needsPassword() {
        return !!this.user && !this.isGuest && (this.user.user_metadata || {}).has_password === false;
    },

    init() {
        this.readRedirect();
        addEventListener('online', () => {
            if (this.status === 'offline' && !this.busy) {
                this.connect();
            }
        });
        return this.connect();
    },

    readRedirect() {
        const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
        const failed = hash.get('error_description');
        if (failed) {
            this.notice = failed + '. Open Profile to try again.';
            history.replaceState(null, '', location.pathname + location.search);
        } else if (hash.get('type') === 'email_change') {
            this.notice = 'Email confirmed. Your account is saved.';
        }
    },

    returnUrl() {
        return location.href.split(/[?#]/)[0];
    },

    changed() {
        if (this.onChange) {
            this.onChange();
        }
        for (const fn of this.watchers) {
            fn();
        }
    },

    watch(fn) {
        this.watchers.push(fn);
    },

    async rpc(name, args) {
        if (!this.online) {
            return { error: 'You are offline.' };
        }
        try {
            const { data, error } = await this.client.rpc(name, args || {});
            return error ? { error: this.explain(error) } : { data };
        } catch (err) {
            return { error: this.explain(err) };
        }
    },

    beacon(name) {
        if (!this.token) {
            return;
        }
        try {
            fetch(this.url + '/rest/v1/rpc/' + name, {
                method: 'POST',
                keepalive: true,
                headers: { apikey: this.key, Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
                body: '{}'
            }).catch(() => {});
        } catch (e) {
        }
    },

    async run(fn) {
        this.busy++;
        this.changed();
        try {
            return await fn();
        } catch (err) {
            return { ok: false, error: this.explain(err) };
        } finally {
            this.busy--;
            this.changed();
        }
    },

    connect() {
        return this.run(async () => {
            this.status = 'connecting';
            this.changed();
            try {
                if (typeof supabase === 'undefined') {
                    throw new Error('the Supabase script did not load');
                }
                if (!this.client) {
                    this.client = supabase.createClient(this.url, this.key);
                    this.client.auth.onAuthStateChange((event, session) => {
                        setTimeout(() => this.onAuth(session), 0);
                    });
                }
                const auth = this.client.auth;
                let res = await auth.getSession();
                if (res.error) {
                    res = await auth.getSession();
                }
                if (res.error) {
                    throw res.error;
                }
                let user = res.data.session ? res.data.session.user : null;
                this.token = res.data.session ? res.data.session.access_token : '';
                if (!user) {
                    const made = await auth.signInAnonymously();
                    if (made.error) {
                        throw made.error;
                    }
                    user = made.data.user;
                    this.token = made.data.session ? made.data.session.access_token : '';
                }
                this.user = user;
                await this.loadProfile();
                this.status = 'online';
            } catch (err) {
                console.warn('DB offline:', (err && err.message) || err);
                this.status = 'offline';
            }
            return { ok: this.status === 'online' };
        });
    },

    onAuth(session) {
        if (session) {
            this.token = session.access_token;
        }
        if (this.busy || !this.online) {
            return;
        }
        clearTimeout(this.reconnectT);
        const user = session ? session.user : null;
        if (!user) {
            this.reconnectT = setTimeout(() => {
                if (!this.busy) {
                    this.connect();
                }
            }, 1500);
            return;
        }
        const swapped = !this.user || this.user.id !== user.id;
        this.user = user;
        if (swapped) {
            this.run(() => this.loadProfile());
        } else {
            this.changed();
        }
    },

    async loadProfile() {
        this.profile = null;
        const { data, error } = await this.client.rpc('ensure_profile');
        if (error) {
            if (!error.code) {
                throw error;
            }
            console.warn('Profile not loaded:', error.message);
            return;
        }
        this.profile = data;
    },

    cleanName(raw) {
        return String(raw || '').replace(/\s+/g, ' ').trim();
    },

    nameProblem(name) {
        if (name.length < 3) {
            return 'Names need at least 3 characters.';
        }
        if (name.length > 16) {
            return 'Names can be at most 16 characters.';
        }
        if (!this.NAME_RULE.test(name)) {
            return 'Use only letters, numbers, underscores and spaces.';
        }
        return '';
    },

    setName(raw) {
        return this.run(async () => {
            const name = this.cleanName(raw);
            const problem = this.nameProblem(name);
            if (problem) {
                return { ok: false, error: problem };
            }
            if (!this.online) {
                return { ok: false, error: 'You are offline, so the name cannot be saved.' };
            }
            const { data, error } = await this.client.rpc('set_display_name', { new_name: name });
            if (error) {
                return { ok: false, error: this.explain(error) };
            }
            this.profile = Object.assign(this.profile || { id: this.user.id }, { display_name: data });
            return { ok: true, name: data };
        });
    },

    saveAccount(email, password) {
        return this.run(async () => {
            const auth = this.client.auth;
            const opts = { emailRedirectTo: this.returnUrl() };
            let res = await auth.updateUser({ email, password, data: { has_password: true } }, opts);
            if (res.error && res.error.code === 'validation_failed' && /password/i.test(res.error.message)) {
                res = await auth.updateUser({ email, data: { has_password: false } }, opts);
            }
            if (res.error) {
                return { ok: false, error: this.explain(res.error) };
            }
            this.user = res.data.user;
            return { ok: true, pending: this.isGuest };
        });
    },

    refreshUser() {
        return this.run(async () => {
            const { data, error } = await this.client.auth.refreshSession();
            if (error) {
                return { ok: false, error: this.explain(error) };
            }
            this.user = data.user;
            return { ok: true, saved: !this.isGuest };
        });
    },

    setPassword(password) {
        return this.run(async () => {
            const { data, error } = await this.client.auth.updateUser({ password, data: { has_password: true } });
            if (error) {
                return { ok: false, error: this.explain(error) };
            }
            this.user = data.user;
            return { ok: true };
        });
    },

    logIn(email, password) {
        return this.run(async () => {
            const { data, error } = await this.client.auth.signInWithPassword({ email, password });
            if (error) {
                return { ok: false, error: this.explain(error) };
            }
            this.user = data.user;
            await this.loadProfile();
            return { ok: true };
        });
    },

    logOut() {
        return this.run(async () => {
            const { error } = await this.client.auth.signOut({ scope: 'local' });
            if (error) {
                return { ok: false, error: this.explain(error) };
            }
            this.user = null;
            this.profile = null;
            return this.connect();
        });
    },

    explain(error) {
        const code = (error && error.code) || '';
        const text = (error && error.message) || '';
        const known = {
            name_taken: 'That name is already taken.',
            name_invalid: 'Names are 3-16 characters: letters, numbers, underscores and single spaces.',
            no_profile: 'Your profile was not found. Reload the page and try again.',
            not_signed_in: 'You are not signed in. Reload the page and try again.',
            PGRST202: 'The server is missing an update. The latest database migration has not been run yet.',
            lobby_name_invalid: 'Lobby names are 3-24 characters: letters, numbers, spaces and simple punctuation.',
            lobby_password_invalid: 'Lobby passwords need 4 to 64 characters.',
            lobby_peer_invalid: 'Could not set up the connection. Try again.',
            lan_unavailable: 'LAN lobbies are not available right now because the server could not see your network. Host an Online lobby instead.',
            invalid_credentials: 'Wrong email or password.',
            email_exists: 'That email already has an account. Use Log in instead.',
            user_already_exists: 'That email already has an account. Use Log in instead.',
            email_not_confirmed: 'That email is not confirmed yet. Click the link in the confirmation email, then log in.',
            email_address_not_authorized: 'The server is not set up to send email to that address yet.',
            email_address_invalid: 'That email address does not look right.',
            over_email_send_rate_limit: 'Too many emails have been sent. Try again in an hour.',
            over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
            anonymous_provider_disabled: 'Guest accounts are switched off on the server.',
            email_provider_disabled: 'Email accounts are switched off on the server.',
            same_password: 'That is already your password.'
        };
        if (known[text] || known[code]) {
            return known[text] || known[code];
        }
        if (!code && (!text || /fetch|network/i.test(text))) {
            return 'Could not reach the server. Check your connection and try again.';
        }
        return text || 'Something went wrong. Try again.';
    }
};

DB.init();
