Rooms.register('shop', {
    name: 'Shop',
    icon: '$',
    color: 0x2ecc71,
    build(b, node) {
        const { W, L, H } = RoomKit.basicRoom(b, { color: this.color, width: 20, length: 28, height: 5 });
        const pal = RoomKit.palette(this.color);
        RoomKit.cover(b, -W / 2 - 0.5, -1, W - 3, true, pal.cover, 1.1);
        RoomKit.cover(b, W / 2 + 0.5, -1, W - 3, true, pal.cover, 1.1);
        for (const s of [-1, 1]) {
            b.box(s * (W - 0.6), 0, -L / 2 + 1, 1.2, 2.6, 8, pal.wall);
            b.box(s * (W - 0.6), 0, L / 2 - 3, 1.2, 2.6, 5, pal.wall);
        }
        RoomKit.pillar(b, -W / 2, L / 2 - 1, 1, H, pal.pillar);
        RoomKit.pillar(b, W / 2, L / 2 - 1, 1, H, pal.pillar);
        RoomKit.crates(b, -W + 3, -L + 3, 3, 2.5, pal.crate);
    }
});
