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
| `js/game.js` | `Game`: states, screens, room lifecycle, main loop |

## Things that bite

- Global names are shared across files. Already taken: `rand`, `randInt` (map.js), `GRAV`,
  `clamp01`, `clampN`, `wrapAngle`, and scratch objects `_ev`, `_ev2`, `_sv`, `_sv2`, `_wv`, `_wq`,
  `_hp`, `_hq`, `_hs`, `_hm`, `_bm`, `_bn`, `_bv`, `_ik`, `_qa`, `_qb`, `_qf`, `_eu`. A new file
  that declares one of these with `const` breaks the page.
- `Game.state` is both "which screen is showing" and "is the simulation running". The sim only
  ticks in `'playing'`, and losing pointer lock sets `'paused'`.
- First-person guns render in a second pass: `WeaponView` uses its own 55 degree camera that sees
  only layer 1. A `Weapon` that is never passed to `WeaponView.attach` stays on layer 0 and renders
  as a normal world object.
- Medium/potato detail moves source meshes to layer 30 (`BATCH_LAYER`) and draws a merged proxy.
  Raycasts that should hit batched models must enable that layer (`Arsenal.ray` does).
- `Arsenal.trace` raycasts `Game.room.group` only. Enemies live inside it. Anything that shots
  should pass through must not be parented there.
- `WeaponBuilder`, `SporeFX`, `SporeProjectiles` and `Weapon.syncBatch` read the global
  `DETAIL.guns`. Shellcap geometry reads `DETAIL.enemies`.
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
  in `Proj.html`. PeerJS uses its public signalling server and its default STUN and TURN servers.
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
- `Game.toMenu` leaves the session. `Net.onClosed` (host left or connection lost) sends a guest to
  the main menu with a message.
- Two-player tests: two separate headless Chrome instances with their own profiles connect over
  real PeerJS while `*.supabase.co` is mocked.

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
