Rooms.register('boss', {
    name: 'Boss',
    color: 0x8e1b1b,
    build(b, node) {
        // symmetric arena with an open middle for the fight
        const { W, L, H } = RoomKit.basicRoom(b, { color: this.color, width: 56, length: 72, height: 12 });
        const pal = RoomKit.palette(this.color);
        RoomKit.ledge(b, -1, W, L, 5, 3.5, pal);
        RoomKit.ledge(b, 1, W, L, 5, 3.5, pal);
        for (const x of [-1, 1]) {
            for (const z of [-1, 1]) {
                RoomKit.pillar(b, x * W * 0.42, z * L * 0.3, 2.4, H, pal.pillar);
                RoomKit.cover(b, x * W * 0.22, z * L * 0.18, 5, true, pal.cover);
            }
            RoomKit.cover(b, x * W * 0.35, 0, 6, false, pal.cover);
        }
        RoomKit.mound(b, 0, 0, 12, 12, 2, pal.mound);
    }
});
