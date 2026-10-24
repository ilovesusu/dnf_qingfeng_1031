/**
 * allow-dungeon-stall.js
 * 副本门口允许摆摊
 * 功能：挂载 CPrivateStore::IsAreaNearEntranceDungeon (0x085C5082) 强制返回 1，解除地下城入口附近禁止开设个人商店限制。
 */

module.exports = {
    hooks: [
        {
            address: '0x085C5082',
            onLeave(retval) {
                retval.replace(1);
            }
        }
    ]
};
