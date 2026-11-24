Rooms.register('combat', {
    name: 'Combat',
    color: 0xd9534f,
    build(b, node) {
        RoomKit.arena(b, { color: this.color, width: 40, length: 60, height: 9 });
        const C = CONFIG.caplings;
        b.enemies = RoomKit.rand(0, 1) < C.colonyChance
            ? [{ type: 'capling', count: C.colony, clusters: C.clusters }]
            : [{ type: 'shellcap', count: C.combatShellcaps }, { type: 'capling', count: C.combat, clusters: C.clusters }];
    }
});
