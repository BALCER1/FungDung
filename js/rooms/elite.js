Rooms.register('elite', {
    name: 'Elite',
    color: 0xe67e22,
    build(b, node) {
        RoomKit.arena(b, {
            color: this.color,
            width: 46,
            length: 66,
            height: 10,
            ledges: RoomKit.pick([[-1], [1], [-1, 1]]),
            features: { pillars: 3, cover: 4, wall: 3, mound: 2, crates: 2, balcony: 3, empty: 1 }
        });
    }
});
