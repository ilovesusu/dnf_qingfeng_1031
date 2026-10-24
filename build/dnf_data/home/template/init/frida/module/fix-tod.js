/**
 * fix-tod.js
 * 绝望之塔修复（门票重复挑战、跳过每10层玩家APC、修复扣金币异常）
 */

/** 模块配置 */
var _config = {
    skipUserApc: true,          // 为 true 时跳过 10/20/.../90 层的玩家 APC（防止角色不足10个无法进入）
    allowTicketRepeat: true,    // 通关后允许继续使用门票挑战
    freeGoldEntry: true,        // 修复进入绝望之塔扣除金币异常
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const CParty_UseAncientDungeonItems = new NativeFunction(ptr(0x859EAC2), 'int', ['pointer', 'pointer', 'pointer', 'pointer'], { "abi": "sysv" });

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    hooks: [
        // 挑战成功后可以继续使用门票挑战
        {
            address: '0x0864387E',
            onLeave(retval) {
                if (_config.allowTicketRepeat) {
                    retval.replace(0);
                }
            }
        },
        // 跳过 10/20/.../90 层玩家 APC（TOD_UserState::getTodayEnterLayer）
        {
            address: '0x0864383E',
            onEnter(args) {
                if (!_config.skipUserApc)
                    return;
                var todayEnterLayer = args[1].add(0x14).readShort();
                if (((todayEnterLayer % 10) === 9) && (todayEnterLayer > 0) && (todayEnterLayer < 99)) {
                    args[1].add(0x14).writeShort(todayEnterLayer + 1);
                }
            }
        },
        // 修复绝望之塔金币扣除异常（CParty::UseAncientDungeonItems）
        {
            address: '0x859EAC2',
            replace(party, dungeon, invenItem, a4) {
                if (_config.freeGoldEntry) {
                    var dungeonIndex = context.utils.cdungeon.CDungeon_Get_Index(dungeon);
                    if (dungeonIndex >= 11008 && dungeonIndex <= 11107) {
                        return 1;
                    }
                }
                return CParty_UseAncientDungeonItems(party, dungeon, invenItem, a4);
            },
            retType: 'int',
            argTypes: ['pointer', 'pointer', 'pointer', 'pointer'],
        }
    ]
};
