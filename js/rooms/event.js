Rooms.register('event', {
    name: 'Event',
    color: 0x9b59b6,
    build(b, node) {
        RoomKit.arena(b, {
            color: this.color,
            width: 30,
            length: 42,
            height: 7,
            ledges: RoomKit.pick([[], [-1], [1]]),
            ledgeHeight: 2.4,
            cell: 10,
            features: { pillars: 3, cover: 2, mound: 2, crates: 2, empty: 3 }
        });
    }
});
