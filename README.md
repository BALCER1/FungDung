# FungDung

**a fungi dungeon roguelite** — first person shooter where you fight through a branching dungeon with guns grown out of mushrooms

## About

FungDung runs straight in the browser. You start a run, pick your path through a randomly generated map of rooms and then walk into each one in first person. Get through 12 stages and beat the boss and thats a run.

Built with plain JavaScript and three.js, no frameworks or build step.

## Inspiration

- **[Castanzakannon](https://github.com/BALCER1/Castanzakannon)** — a top down roguelike I made last year with Niall Concannon and Giuseppe Castagna. FungDung is me taking that kind of game into 3D
- **Slay the Spire** — the branching run map where you choose your route through combat, elite, shop and rest rooms
- **Risk of Rain 2** — fast movement and weapons with a primary and alt fire that play completely differently
- **mushroom themed games** — the glowy bioluminescent spore look that the whole game is based around

## Weapons

| Weapon | Type | Alt fire |
|---|---|---|
| Puffcap Blunderbuss | shotgun | hold to charge a bigger blast |
| Morel Carbine | auto rifle | 3 round burst |
| Amanita Longshot | sniper | scope in |
| Chanterelle Eagles | dual pistols | throw them like boomerangs |

Each gun is modelled and animated fully in code and shows its ammo on the gun itself, like the spore vial on the carbine draining as you shoot.

## Controls

| Key | Action |
|---|---|
| WASD | move |
| Shift | sprint |
| Space | jump |
| Left / Right click | fire / alt fire |
| R | reload |
| F | inspect |
| 1-4 / scroll | switch weapon |
| E | open door |
| M | map |
| Esc | pause |

## Running it

```
git clone https://github.com/BALCER1/Final-Proj-WIP.git
```

Open `index.html` in a browser and hit Singleplayer. You need internet the first time since three.js loads from a CDN. If the mouse wont lock open it in its own tab.

## Current state

**Working:** movement, full run loop from menu to boss, random map, all 4 weapons, settings (render scale, FOV, dark mode, fullscreen), player health and death, Shellcap enemies in combat and elite rooms

**Still to do:** more enemy types (swarmers, bloaters, throwers), real rooms, items, healing, shop/events, sound, the boss

## Author

**Daniel Balcerzak** — [GitHub](https://github.com/BALCER1)
**3d Models and animations created with the help of Claude Code**
