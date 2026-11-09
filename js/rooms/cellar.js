Rooms.register('cellar', {
    name: 'Cellar',
    color: 0x8b5a2b,
    build(b, node) {
        // low ceiling and tight, so no ledges or balconies, just a forest of pillars and junk
        RoomKit.arena(b, {
            color: this.color,
            width: 30,
            length: 44,
            height: 4.5,
            ledges: [],
            cell: 7,
            doorClear: 5,
            spawnClear: 6,
            features: { pillars: 5, cover: 2, crates: 4, mound: 1, empty: 2 }
        });
    }
});
