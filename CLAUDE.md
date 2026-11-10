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
| `js/enemies/nav.js` | `NavGrid`: grid, A*, flow fields, line of sight |
| `js/enemies/enemy-kit.js` | `Memory`, `Enemy`, `Pack`, `HiveMind`, `Enemies`, `CommFX`, `DevView` |
| `js/enemies/shellcap.js` | `ShellcapKit`, `Shellcap` (model, damage, animation), `ShellcapMind` (AI) |
| `js/map.js` | `RunMap` (run graph), `MapView` (2D map screen) |
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
