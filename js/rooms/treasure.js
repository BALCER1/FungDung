Rooms.register('treasure', {
    name: 'Treasure',
    color: 0xf1c40f,
    build(b, node) {
        const { W, L, H } = RoomKit.basicRoom(b, { color: this.color, width: 24, length: 32, height: 6 });
        const pal = RoomKit.palette(this.color);
        // stepped dais in the middle for the loot, ringed by pillars
        RoomKit.mound(b, 0, -1, 7, 7, 3, pal.mound);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            RoomKit.pillar(b, Math.cos(a) * 7, -1 + Math.sin(a) * 7, 1.1, H, pal.pillar);
        }
        RoomKit.crates(b, -W + 2.5, -L + 4, 3, 4, pal.crate);
        RoomKit.crates(b, W - 2.5, -L + 4, 3, 4, pal.crate);
    }
});
