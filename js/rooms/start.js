Rooms.register('start', {
    name: 'Start',
    color: 0xf2f2f2,
    build(b, node) {
        const { W, L, H } = RoomKit.basicRoom(b, { color: this.color, width: 18, length: 28, height: 6 });
        const pal = RoomKit.palette(this.color);
        for (const x of [-1, 1]) {
            RoomKit.pillar(b, x * (W - 3), -L / 3, 1.2, H, pal.pillar);
            RoomKit.pillar(b, x * (W - 3), L / 3, 1.2, H, pal.pillar);
        }
        // a few steps up to a little platform to test movement on
        RoomKit.stairs(b, -W + 2, 3, 3, 1.6, 0, -1, pal.stairs);
        b.box(-W + 2, 0, -1.4, 3, 1.6, 4, pal.raised);
        RoomKit.crates(b, W - 3, 0, 3, 5, pal.crate);
    }
});
