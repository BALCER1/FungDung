Rooms.register('rest', {
    name: 'Rest',
    color: 0x3498db,
    build(b, node) {
        const { W, L, H } = RoomKit.basicRoom(b, { color: this.color, width: 20, length: 28, height: 5 });
        const pal = RoomKit.palette(this.color);
        // low dais in the centre to rest on, four pillars around it
        RoomKit.mound(b, 0, 0, 6, 6, 2, pal.mound);
        for (const x of [-1, 1]) {
            for (const z of [-1, 1]) {
                RoomKit.pillar(b, x * 5.5, z * 5.5, 1, H, pal.pillar);
            }
        }
        RoomKit.cover(b, -W + 1, L / 2, 4, false, pal.cover, 0.6);
        RoomKit.cover(b, W - 1, -L / 2, 4, false, pal.cover, 0.6);
    }
});
