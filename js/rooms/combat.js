Rooms.register('combat', {
    name: 'Combat',
    color: 0xd9534f,
    build(b, node) {
        RoomKit.arena(b, { color: this.color, width: 40, length: 60, height: 9 });
    }
});
