# FungDung

First-person roguelite in plain JavaScript + three.js r128 (global `THREE`). No build step.
Hosted on GitHub Pages at https://balcer1.github.io/FungDung/. Supabase is used for accounts,
saves and the lobby list. Co-op is host-based over PeerJS (WebRTC).

## Project rules (always follow)

- Plain JS, no build step, no frameworks. Load libraries with `<script>` tags pinned to exact
  versions (like three.js r128). Never use unpinned or "latest" URLs.
- Match the existing code style and patterns (global objects like `Game`, `Player`, `Enemies`,
  4-space indent).
- Single player must keep working after every change. Don't change how the game feels to play
  (movement, weapons, enemy behaviour) unless asked.
- Supabase: only the publishable key goes in code. Never use or ask for the secret/service_role
  key. Every new table gets row-level security and policies in the same migration. Anything that
  grants rewards, currency, items or achievements must go through server-side Postgres functions,
  never direct client writes.
- Write all SQL as files in `supabase/migrations/` (timestamped). Don't try to run them: tell the
  user to paste each one into the Supabase SQL Editor and what result to expect.
- If Supabase is unreachable, the game must still be playable (show "offline", skip saving).
- Co-op design: host-authoritative over PeerJS (WebRTC). The host runs enemy AI and spawns; guests
  run only their own movement and weapons and render enemies from host snapshots. Supabase is only
  used for accounts, saves and the lobby list, never for live gameplay traffic. Singleplayer is a
  host with nobody connected, not a separate code path.
- Co-op habits for all new code:
  - Enemies target players through a function, never `Player` directly.
  - All damage to players goes through one function.
  - Gameplay randomness (map, rooms, spawns, loot) uses the seeded RNG. Cosmetic randomness
    (particles, shake, debris) may use `Math.random`.
  - Anything spawned gets a stable id.
  - Items are data with an owner. Run items are lost on death; only permanent things are saved
    to Supabase.
- Tunable gameplay numbers (co-op scaling, timers, player limits) live in `CONFIG`, not hard-coded.
- If something is ambiguous or a change would be large or risky, ask before doing it.

## Working agreement

- Work happens in stages. After each stage: stop, summarise what changed, list exactly how to
  test it, and suggest a commit message. Don't start the next stage until told "continue".
- Don't commit or push unless asked.

## Running and checking

- Entry point is `Proj.html` (`index.html` only redirects to it). Open with VS Code Live Server
  or any static server. There is no package.json, test suite or linter.
- Syntax check a file with `node --check js/<file>.js`. Everything else is tested by playing.
- Dev mode (Settings > Developer) shows enemy AI state, paths and pack memory. Backtick toggles
  the overlay.
- God mode (Settings > Developer, needs dev mode): `Settings.god()`. Per browser, so only the
  player who ticked it. `Players.hurt` skips players with `god` (state bit 256 for remote players),
  own shots deal `CONFIG.god.damage`, and the host lets a god guest's shots past its damage clamp.

## Layout

All files are classic scripts loaded in order by `Proj.html`. They share one global scope.

| File | What it holds |
|---|---|
| `js/db.js` | `DB`: Supabase client, guest sign-in, account upgrade, login, profile name. Sets `DB.status` to `online` or `offline` |
| `js/profile.js` | `Profile`: Profile screen and the player name on the main menu |
| `js/config.js` | `CONFIG` (tunables), `DETAIL` (graphics levels), `BOOT` |
| `js/rng.js` | `Rng`: seeded random streams. `Rng.w()` for world generation, `Rng.ai()` for enemy decisions |
| `js/engine.js` | `scene`, `camera`, `renderer`, `Input`, `Player`, `RoomBuilder`, `colTop`, `snapDown` |
| `js/batch.js` | `MeshBatch`: merges a model into few draw calls (medium/potato detail) |
| `js/settings.js`, `js/perf.js`, `js/intro.js` | Settings screen, FPS counter, intro animation |
| `js/rooms/room-kit.js` | `Rooms` registry, `Door`, `RoomKit` (procedural room pieces) |
| `js/rooms/*.js` | One `Rooms.register(type, { build(b, node) })` per room type |
| `js/weapons/weapon-kit.js` | `WeaponKit`, `WeaponBuilder`, `SporeFX`, `SporeProjectiles`, `Weapon`, `WeaponView`, `ScopeOverlay`, `Weapons` registry |
| `js/weapons/{shotgun,rifle,sniper,pistols}.js` | One `Weapons.register(id, def)` each: model, pose, hand pose, effects |
| `js/hands.js` | `HandKit`, `HandShapes`, `Hand`, `Hands` (grip-driven hands) |
| `js/weapons/arsenal.js` | `Arsenal`: local player's weapons, input, HUD, two-pass render |
| `js/vitals.js` | `Vitals`: local player HP, damage flash, hit direction marks |
| `js/players.js` | `Players`: list of player records (local one mirrors `Player`/`Vitals`/`Arsenal`), `Players.hurt` (the one damage function) |
| `js/enemies/nav.js` | `NavGrid`: grid, A*, flow fields, line of sight |
| `js/enemies/enemy-kit.js` | `Memory`, `Enemy`, `Pack`, `HiveMind`, `Enemies`, `CommFX`, `DevView` |
| `js/enemies/shellcap.js` | `ShellcapKit`, `Shellcap` (model, damage, animation), `ShellcapMind` (AI) |
| `js/map.js` | `RunMap` (run graph), `MapView` (2D map screen) |
| `js/net.js` | `Net`: PeerJS connection, host and guest roles, roster, lobby heartbeat, message handlers |
| `js/lobby.js` | `Lobby`: Multiplayer, Host, Join and Lobby screens, invite links |
| `js/coop.js` | `Avatar` (remote player blob with gun and hands), `Coop`: player state sync, room travel, party indicator |
| `js/life.js` | `Life`: downed, bleed-out, spectator camera, hold-E revive, shop vending machine respawn |
| `js/game.js` | `Game`: states, screens, room lifecycle, main loop |

## Things that bite

- Global names are shared across files. Already taken: `rand`, `randInt` (map.js), `GRAV`,
  `clamp01`, `clampN`, `wrapAngle`, and scratch objects `_ev`, `_ev2`, `_sv`, `_sv2`, `_wv`, `_wq`,
  `_hp`, `_hq`, `_hs`, `_hm`, `_bm`, `_bn`, `_bv`, `_ik`, `_qa`, `_qb`, `_qf`, `_eu`. A new file
  that declares one of these with `const` breaks the page.
- `Game.state` is both "which screen is showing" and "is the simulation running". In singleplayer
  the sim only ticks in `'playing'`, and losing pointer lock sets `'paused'`. While `Coop.running`
  it also ticks in `Game.liveStates` (paused, options, mapview, entering, map), with `Input.keys`
  cleared so an open menu cannot move the player.
- `Game.present` says whether the local player is physically in the loaded room. A co-op host on
  the waiting map has a room loaded but is not present. `Game.roomKey` is `'layer:index'`.
- Headless Chrome cannot take pointer lock, so `enterRoom` ends in `'paused'` there. Tests set
  `'playing'` by hand.
- First-person guns render in a second pass: `WeaponView` uses its own 55 degree camera that sees
  only layer 1. A `Weapon` that is never passed to `WeaponView.attach` stays on layer 0 and renders
  as a normal world object.
- Medium/potato detail moves source meshes to layer 30 (`BATCH_LAYER`) and draws a merged proxy.
  Raycasts that should hit batched models must enable that layer (`Arsenal.ray` does).
- `Arsenal.trace` raycasts `Game.room.group` only. Enemies live inside it. Anything that shots
  should pass through must not be parented there.
- A `Weapon` takes `opts.lod` (detail level for that one gun) and `opts.remote` (no muzzle lights,
  never hidden by scope zoom). Without `opts.lod` it follows the global `DETAIL.guns`. Shellcap
  geometry reads `DETAIL.enemies`.
- `index.html` forwards the query string and hash to `Proj.html`. Links that must survive without
  JavaScript should point at `Proj.html` directly.
- `Input.init` blocks the default action of Space except inside form fields. New text inputs work,
  but anything else that needs Space must be handled the same way.

## Players, targeting and damage

- `Players.list` holds one record per player: `pos`, `vel`, `eye`, `aim`, `hpF`, `reloading`,
  `zoom`, `sprinting`, `onGround`, `inRoom`, `down`. The local record shares `Player.pos` and
  `Player.vel` and is refreshed by `Players.update` each frame. Remote records are filled from the
  network.
- `Enemies.targets` is the players enemies may attack this frame (`inRoom` and not `down`). Enemy
  code uses `e.target` (a player record) and never `Player`, `Vitals` or `Arsenal`. `Player` is
  still fine in code that is about the local player (movement, HUD, camera, doors).
- `HiveMind.retarget` picks `e.target`: seen and nearer players score higher, the current target
  gets a bonus, a recent attacker gets a bonus, and a switch is blocked for `CONFIG.targeting.hold`
  seconds and during locked actions. With one player it never changes.
- `Memory` keeps one track per player id. Every method takes the player: `mem.age(T, now)`,
  `mem.saw(T, pos, vel, now)`, `mem.predict(T, now, out)`, `mem.track(T).pos`.
- Chase flow fields are per player: `nav.flowTo(player, cell, now)`. Per-player nav data is in
  `player.nav`.
- All damage and knockback to a player goes through `Players.hurt(player, amount, opts)`. It
  rounds, applies `Players.damageScale`, and either applies it locally or calls
  `Players.onRemoteHurt`.
- Shots carry `shot.by` (the shooting player record). Noise carries `by` too.
- Enemies have `e.id` (1..n per room, in spawn order) and `Enemies.get(id)`. Shellcap parts have
  ids: plates use their name, other parts use an index. `e.partById(id)` returns `{ part, mesh }`.
- Singleplayer regression check: a scripted fight with a fixed seed, fixed timestep and a seeded
  `Math.random` is fully deterministic. Record it before an AI refactor and compare after.

## Networking and lobbies

- Libraries: PeerJS 1.5.5 (global `Peer`) and qrcode-generator 2.0.4 (global `qrcode`), both pinned
  in `Proj.html`. PeerJS uses its public signalling server.
- Relay: `Net.relay()` gets short-lived Cloudflare TURN credentials from the Supabase Edge Function
  `supabase/functions/turn/index.ts` (secrets `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` live only in
  Supabase) and `Net.openPeer` passes them to PeerJS. WebRTC still prefers a direct route; the
  relay is what makes networks with client isolation (college Wi-Fi, Ethernet and Wi-Fi on
  separate VLANs) work. If the function is missing or fails, PeerJS's default servers are used.
  Settings are in `CONFIG.relay`. The user deploys the function by pasting it in the dashboard.
- `Net.role` is `null`, `'host'` or `'guest'`. A player's id is their PeerJS id. `Net.roster` is
  `[{ id, name, host }]`, owned by the host and broadcast on every change.
- Messages are JSON objects `{ t: type, ... }` on one reliable connection per guest. Register a
  handler with `Net.on(type, (msg, fromId) => ...)`. `fromId` is null on guests (it came from the
  host). Send with `Net.send` (guest to host), `Net.broadcast` and `Net.sendTo` (host).
- Built-in types: `hello`, `welcome`, `reject`, `roster`, `ping`, `pong`, `bye`, `closed`, `start`.
  Bump `CONFIG.netVersion` whenever the message format or shared game rules change, so mismatched
  builds refuse to connect.
- The host checks version, started, full and password again when a guest connects, even though
  `join_lobby` already did.
- Players cannot read or write `lobbies` at all (RLS on, no policies). Server functions:
  `create_lobby`, `heartbeat_lobby`, `close_lobby`, `list_lobbies`, `get_lobby`, `join_lobby`.
  `join_lobby` returns `{ ok, error }` instead of raising, so wrong-password counts are kept.
- LAN: there is no separate LAN lobby type. Every host and every Join list or join call sends the
  public addresses STUN reports for the device (`Net.publicAddrs()`, `p_addrs`); the server adds
  the request address and compares hashes (`net_keys`: full IPv4, IPv6 /64, private addresses
  ignored). `list_lobbies` returns `on_lan` (host on the caller's network: tagged LAN, listed
  first) and `join_lobby` returns `on_lan` too. When it is true, `Net.join` calls
  `opts.beforeLan`, where `Lobby` asks for the microphone once and stops it at once: browsers only
  expose real local IPs (instead of `.local` mDNS names) to pages with media permission, so the
  devices can connect directly instead of through the relay. Lobbies with the old `is_lan` flag
  are still only listed on their own network.
- `Game.toMenu` leaves the session. `Net.onClosed` (host left or connection lost) sends a guest to
  the main menu with a message.
- Two-player tests: two separate headless Chrome instances with their own profiles connect over
  real PeerJS while `*.supabase.co` is mocked.

## Co-op run flow

- `Coop.begin()` runs when the host presses Start and when a guest receives `start`. `Coop.end()`
  runs from `Game.toMenu` and when the connection closes. While `Coop.running`, the local player
  record uses `Net.id` as its id, and remote players are added to `Players.list`.
- Only the host picks rooms. `Coop.hostPick(node)` builds the room, then broadcasts `room`. Guests
  on the waiting map enter at once. Guests still in the old room get a prompt and are moved after
  `CONFIG.travelCountdown` seconds, or as soon as they are back in `'playing'`.
- Passing the door calls `Coop.atDoor()`. A guest unloads its room and waits on a read-only map.
  The host keeps the old room loaded and simulated until it picks the next one.
- Every player sends its state `CONFIG.netRate` times a second: guests send `st` to the host, the
  host broadcasts `ps` with everyone. The array layout is in `Coop.mine` and `Coop.apply`. The
  state includes the room key, which is how `inRoom` is decided on every client.
- Remote weapons mirror the sender's weapon `state`, `altHeld` and `ammo`, and replay `fire` events
  (the options that were passed to `Weapon.fire`). They are built with no `onShot`, so they never
  deal damage.
- Avatars live in `Coop.group`, outside `Game.room.group`, so shots pass through teammates.
- Guests build rooms with `Enemies.loadPuppets` instead of `Enemies.load`.

## Downed, spectating and respawn

- Player records have `down` and `dead`. Alive: both false. Downed: `down`. Spectating: `down` and
  `dead`. Anything that skips `down` (`Players.active`, `Players.hurt`, enemy targeting) skips
  spectators too. The local player's flags are owned by `Life`; remote flags come from state bits
  64 (down) and 128 (dead).
- Reaching 0 HP calls `Life.goDown`. The host (or singleplayer) loses the run when every player in
  `Players.list` is `down`, then broadcasts `lost`. Singleplayer therefore still dies at once.
- Downed: no movement or weapons, camera at `CONFIG.downed.eye`, bleeds out after
  `CONFIG.downed.bleedout` seconds. A downed player moved on with the party becomes a spectator.
- Revive: hold E near a downed teammate for `CONFIG.downed.reviveTime`. The state array carries the
  reviver's target id and progress (fields 15 and 16). Guests send `rv`; the host checks it in
  `Life.grantRevive` and sends `up` to the target. The bleed-out timer pauses while a teammate
  is holding E on you (`Life.helper()`).
- Spectators keep `Game.present` true (so they get enemy snapshots) but never move. The camera sits
  in the watched player's `Avatar` head (body, eyes and label hidden), using the spectator's own
  FOV and graphics settings. Click to switch. Dead guests travel with the party at once. A dead host
  gets the room-pick map when a living teammate leaves through the door (`Coop.leftRoom`).
- Respawn: the shop has `RoomKit.vending` (`room.vending`). E near it sends `vend` to the host;
  `Life.vend` respawns every dead player in the room (`respawn` message), uses up a charge
  (`CONFIG.vending.uses`, 0 = unlimited) and broadcasts `vended`.

## Enemies in co-op

- The host runs all enemy AI. Guests hold "puppets": real enemy objects (same model, same part
  ids, so local hit detection works) with no mind. `Enemies.puppets` is true on guests.
- A guest entering a room sends `enq`. The host answers `en` with every live enemy (id, type,
  position, plate state, current action). Until that arrives the guest ignores `es`.
- Each net tick the host sends `es` to every guest in its room: `s` is a flat array of 15 integers
  per enemy (layout in `Enemy.packNet` / `applyNet`), `e` is a list of events.
- Events are arrays starting with a code: `h` hit, `k` kick, `d` death, `a` action, `p` plates,
  `v` comm vines. The host records them with `Enemies.emit` (only while `Enemies.record`).
- Actions: the host sends the whole action object when it is created or when a non-volatile field
  changes (`Enemies.VOLATILE` lists fields the puppet works out itself). Vector3 values survive the
  trip. The puppet advances `action.t` locally and is corrected from the snapshot.
- Puppet animation runs the normal `animate` code from replicated state. A mantle is replayed by
  the puppet's own `updateMantle` from the action data. Deaths, plate breaks, dust and debris are
  played locally on each client, so their random details differ between players.
- A new enemy type must provide: `packNet`/`applyNet` if it needs extra fields, `packState`/
  `applyState` for slow-changing state, `showHit`, `partById`, and `puppetUpdate` if it has
  special movement. Anything cosmetic that the host triggers must be an event or be derivable.
- Guest shots: the guest finds its own hits and sends one `sh` per shot (weapon, mode, damage,
  pellet count, origin, list of enemy id + part id + point). The host clamps damage and pellet
  count to the weapon's stats, rebuilds the shot and runs it through the normal hit path
  (`Enemies.remoteShot`), then replies `hm` with the hit marker kind.
- Enemy hits on a guest: `Players.hurt` on the host calls `Players.onRemoteHurt`, which sends
  `hurt`. The guest applies it with `Players.applyLocal`.
- Scaling: `Enemies.partySize` is set by `Coop.hostPick` and read once in `Enemies.load`. It sets
  `Enemies.countScale`, `Enemies.healthScale` and `Players.damageScale` for that room, from
  `CONFIG.coopEnemyCount`, `CONFIG.coopEnemyHealth` and `CONFIG.coopEnemyDamage`.

## Seeded randomness

- `Game.startRun(seed)` calls `Rng.start(seed)`. Each purpose then gets its own stream derived from
  the run seed: `map`, `room/<layer>:<index>`, `spawn/<layer>:<index>`, `ai/<layer>:<index>`.
  `Game.enterRoom` selects them, so a room looks the same whatever was visited before it.
- Use `Rng.w()` (or `RoomKit.rand/pick/weighted`) for anything that shapes the world: map, room
  layout, spawn counts and positions, loot. These must match on every client.
- Use `Rng.ai()` for enemy decisions. It runs on the host only and will not replay identically,
  because it depends on player input and frame timing.
- Bullet spread (`WeaponKit.cone`) and all effects stay on `Math.random`.
- Dev mode has a "Run seed" field (Settings > Developer). The seed shows next to the stage name.

## Supabase

- Migrations live in `supabase/migrations/`. The user pastes them into the SQL Editor by hand.
- Players cannot write to `profiles` directly. Reads are limited to their own row. All writes go
  through `security definer` functions (`ensure_profile`, `set_display_name`).
- Server functions signal expected failures with `raise exception '<token>'` (for example
  `name_taken`). `DB.explain` maps tokens and Supabase error codes to player-facing text.
- Guests are Supabase anonymous users. Their identity exists only in the browser's stored session,
  so never sign in anonymously when a session read merely failed (that would orphan the guest).
- To test database or account code without touching the real project, mock `*.supabase.co`
  requests in headless Chrome, and run migrations against PGlite with a stubbed `auth` schema.
