/**
 * share-seria-room.js
 * 赛丽亚房间玩家互相可见
 * 功能：挂载 Area::insert_user (0x086C25A6) 修改赛丽亚旅馆私有隔离标志位，使同一频道玩家在赛丽亚房间内互相可见。
 */

module.exports = {
    hooks: [
        {
            address: '0x086C25A6',
            onEnter(args) {
                args[0].add(0x68).writeInt(0);
            }
        }
    ]
};
