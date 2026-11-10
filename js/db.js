const DB = {
    client: supabase.createClient('https://rnmlyejuwfdqnlgohzhm.supabase.co', 'sb_publishable_HWd2ca96IzPa4L58eM2CUQ__SOOjg-L'),
    user: null,

    async init() {
        const { data: { session } } = await this.client.auth.getSession();
        if (session) {
            this.user = session.user;
        } else {
            const { data, error } = await this.client.auth.signInAnonymously();
            if (error) { console.warn('DB offline:', error.message); return; }
            this.user = data.user;
        }
        await this.client.from('profiles').upsert({ id: this.user.id }, { onConflict: 'id', ignoreDuplicates: true });
        console.log('Signed in as', this.user.id);
    }
};

DB.init();