/**
 * dungeon-clear-broadcast.js
 * 副本通关用时全服播报系统（纯净版：不含任何秒杀检测与踢人逻辑）
 * 功能：记录每位角色进入副本时间与击杀领主时间，通关或中途离开副本时全服播报地下城名称、难度（普通~英雄）与耗时。
 */

var _config = {
    maxBroadcastClearSec: 1000,         // 通关耗时小于多少秒时全服播报
    enableRetreatBroadcast: true,       // 未通关中途退出副本时是否播报
    maxBroadcastRetreatSec: 300,        // 未通关离开副本耗时小于多少秒时播报
    prefixLabel: '[地下城战报] [',      // 播报前缀
};

const DIFFICULTY_NAMES = {
    0: '普通级',
    1: '冒险级',
    2: '勇士级',
    3: '王者级',
    4: '英雄级',
};

// 按角色 characNo 独立存储进图与通关秒数（修复原版全局共享变量覆盖及跨零点时间负数问题）
const _characDungeonTimer = new Map();

module.exports = {
    dispose() {
        _characDungeonTimer.clear();
    },
    hooks: [
        // cHistoryTrace::operator() (0x854F990)
        {
            address: '0x854F990',
            onEnter(args) {
                const historyLog = args[1].readUtf8String(-1);
                const group = historyLog.split(',');
                if (!group[13])
                    return;
                const gameEvent = group[13].slice(1);

                if (gameEvent !== 'DungeonEnter' && gameEvent !== 'KillMob' && gameEvent !== 'DungeonClearInfo')
                    return;

                const accId = parseInt(group[1], 10);
                const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                if (!user || user.isNull())
                    return;

                const cinfo = context.utils.cuserCharacInfo;
                const characNo = cinfo.CUserCharacInfo_GetCurCharacNo(user);
                const curSec = context.system.time.api_CSystemTime_getCurSec();

                if (gameEvent === 'DungeonEnter') {
                    const dgnName = (group[14] || '').replace(/"/g, '');
                    const diff = parseInt(group[15], 10);
                    _characDungeonTimer.set(characNo, {
                        enterSec: curSec,
                        dgnName,
                        diff: Number.isNaN(diff) ? 0 : diff,
                        bossClearSec: 0,
                    });
                    return;
                }

                if (gameEvent === 'KillMob') {
                    const mobBossFlag = parseInt(group[22], 10);
                    if (mobBossFlag === 3) {
                        const rec = _characDungeonTimer.get(characNo);
                        if (rec && rec.bossClearSec === 0) {
                            rec.bossClearSec = Math.max(1, curSec - rec.enterSec);
                        }
                    }
                    return;
                }

                if (gameEvent === 'DungeonClearInfo') {
                    const rec = _characDungeonTimer.get(characNo);
                    _characDungeonTimer.delete(characNo);
                    if (!rec)
                        return;

                    const characName = cinfo.api_CUserCharacInfo_GetCurCharacName(user);
                    const diffLabel = DIFFICULTY_NAMES[rec.diff] || '未知难度';

                    if (rec.bossClearSec > 0) {
                        if (rec.bossClearSec < _config.maxBroadcastClearSec) {
                            const mins = Math.floor(rec.bossClearSec / 60);
                            const secs = rec.bossClearSec % 60;
                            context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
                                `${_config.prefixLabel}${characName}] 通关 ${rec.dgnName}(${diffLabel})\n用时 ${mins}分${secs}秒`,
                                0
                            );
                        }
                    } else if (_config.enableRetreatBroadcast) {
                        const elapsed = Math.max(1, curSec - rec.enterSec);
                        if (elapsed < _config.maxBroadcastRetreatSec) {
                            const mins = Math.floor(elapsed / 60);
                            const secs = elapsed % 60;
                            context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
                                `${_config.prefixLabel}${characName}] 未通关 ${rec.dgnName}(${diffLabel}) 并离开副本\n用时 ${mins}分${secs}秒`,
                                0
                            );
                        }
                    }
                }
            }
        }
    ]
};
