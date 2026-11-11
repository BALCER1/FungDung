// Supabase Edge Function "turn"
//
// Hands out short-lived Cloudflare TURN (relay) credentials to signed-in players. Guests count as
// signed in. The game uses the relay only when two devices cannot reach each other directly, for
// example on a college or hotel network that stops devices on it from talking to each other.
//
// The Cloudflare TURN key and its API token are secrets. They live only in this function's
// secrets (CF_TURN_KEY_ID, CF_TURN_API_TOKEN) and are never sent to the game. The game only ever
// receives credentials that expire after TTL seconds.
//
// Set up (once):
//   1. Cloudflare dashboard > Realtime > TURN Server: create a TURN key. Note its Key ID and
//      API token.
//   2. Supabase dashboard > Edge Functions > Deploy a new function > Via editor. Name it "turn",
//      paste this whole file, deploy.
//   3. In the function's Details/Settings, turn OFF "Verify JWT with legacy secret". This file
//      checks the player's session itself, which also works with the new publishable keys.
//   4. Edge Functions > Secrets: add CF_TURN_KEY_ID and CF_TURN_API_TOKEN.
// Until this is done the game falls back to PeerJS's default servers, as before.

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// 24 hours. Cloudflare allows up to 48.
const TTL = 86400;

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS });
    }
    if (req.method !== 'POST') {
        return reply(405, { error: 'method_not_allowed' });
    }

    const keyId = Deno.env.get('CF_TURN_KEY_ID');
    const apiToken = Deno.env.get('CF_TURN_API_TOKEN');
    if (!keyId || !apiToken) {
        return reply(503, { error: 'relay_not_configured' });
    }

    // Only players with a Supabase session (guest or account) may get credentials.
    const auth = req.headers.get('Authorization') || '';
    const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!auth.startsWith('Bearer ')) {
        return reply(401, { error: 'not_signed_in' });
    }
    try {
        const who = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
            headers: { Authorization: auth, apikey }
        });
        if (!who.ok) {
            return reply(401, { error: 'not_signed_in' });
        }
    } catch (_err) {
        return reply(502, { error: 'auth_unreachable' });
    }

    let data: { iceServers?: unknown };
    try {
        const res = await fetch(
            'https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(keyId) +
                '/credentials/generate-ice-servers',
            {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttl: TTL })
            }
        );
        if (!res.ok) {
            console.error('Cloudflare TURN returned', res.status, await res.text());
            return reply(502, { error: 'relay_failed' });
        }
        data = await res.json();
    } catch (err) {
        console.error('Cloudflare TURN unreachable', err);
        return reply(502, { error: 'relay_failed' });
    }

    // Browsers block port 53, so those URLs would only time out.
    const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    const iceServers = list
        .filter((s): s is { urls: string | string[] } => !!s && typeof s === 'object' && 'urls' in s)
        .map(s => ({ ...s, urls: ([] as string[]).concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) }))
        .filter(s => s.urls.length > 0);

    return reply(200, { iceServers, ttl: TTL });
});
