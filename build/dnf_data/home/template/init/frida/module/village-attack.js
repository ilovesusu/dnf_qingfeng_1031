/**
 * village-attack.js
 * 怪物攻城活动（三阶段定制版：动态难度、连杀、世界BOSS、奖惩与数据库持久化）
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid,       // GM权限角色ID列表
    startHourUtc: 12,                   // 每日开启时间（UTC小时，12 = 北京时间 20:00）
    targetScores: [100, 200, 300],      // P1 / P2 / P3 各阶段目标 PT
    totalTimeSec: 3600,                 // 活动总时长（秒）
    defendFailPenalty: true,            // 防守失败时是否开启惩罚（随机扣金币及 7% 概率损毁穿戴装备）
    cmd: {
        start: 'attackstart',           // GM主动开启怪物攻城命令: //attackstart
        end: 'attackend',               // GM主动关闭怪物攻城命令: //attackend [win|fail]
    }
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

/** 怪物攻城底层函数与全局变量 */
const Inter_VillageAttackedStart_dispatch_sig = new NativeFunction(ptr(0x84DF47A), 'pointer', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
const village_attacked_CVillageMonsterMgr_OnDestroyVillageMonster = new NativeFunction(ptr(0x086B43D4), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
const GetCurVAttackCount = new NativeFunction(ptr(0x084EC216), 'int', ['pointer'], { "abi": "sysv" });

const GlobalData_s_villageMonsterMgr = ptr(0x941F77C);
const ADDR_VILLAGEATTACK_DIFFICULT = ptr(0x085B9605);

////////////////////////////////////////////////////////////////////////
// 常量与变量
////////////////////////////////////////////////////////////////////////

const VILLAGEATTACK_STATE_P1 = 0;       // 一阶段
const VILLAGEATTACK_STATE_P2 = 1;       // 二阶段
const VILLAGEATTACK_STATE_P3 = 2;       // 三阶段
const VILLAGEATTACK_STATE_END = 3;      // 活动已结束

const TAU_CAPTAIN_MONSTER_ID = 50071;   // 牛头统帅（P1阶段击杀提升活动难度等级）
const GBL_POPE_MONSTER_ID = 262;        // GBL教主教（P2/P3阶段存活时持续减少PT点数）
const TAU_META_COW_MONSTER_ID = 17;     // 机械牛（P3阶段世界BOSS）

let _villageAttackEventInfo = {
    state: VILLAGEATTACK_STATE_END,
    score: 0,
    start_time: 0,
    difficult: 0,
    next_village_monster_id: 0,
    last_killed_monster_id: 0,
    p2_last_killed_monster_time: 0,
    p2_kill_combo: 0,
    gbl_cnt: 0,
    defend_success: 0,
    user_pt_info: {},
};

let _stateOnFighting = false;
let _onFightingVillageMonsterId = 0;

let _initTimerId = null;
let _startTimerId = null;
let _tickTimerId = null;
let _origDifficultInt = null;

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

function _escapeSqlString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _clearTimers() {
    const thread = context.system?.thread;
    if (thread) {
        thread.api_ClearScheduleDelay(_initTimerId);
        thread.api_ClearScheduleDelay(_startTimerId);
        thread.api_ClearScheduleDelay(_tickTimerId);
    }
    _initTimerId = null;
    _startTimerId = null;
    _tickTimerId = null;
}

/** 设置怪物攻城副本难度 (0-4: 普通-英雄) */
function _setDungeonDifficult(difficult) {
    Memory.protect(ADDR_VILLAGEATTACK_DIFFICULT, 4, 'rwx');
    ADDR_VILLAGEATTACK_DIFFICULT.writeInt(difficult);
}

/** 计算活动剩余时间(秒) */
function _getRemainTime() {
    const curTime = context.system.time.api_CSystemTime_getCurSec();
    const endTime = _villageAttackEventInfo.start_time + _config.totalTimeSec;
    return endTime - curTime;
}

/** 存档活动状态到 frida.game_event */
function _saveEventToDb() {
    try {
        const mysql = context.mysql.dbConnector.getConFromConfig('frida');
        if (!mysql)
            return;
        const jsonStr = _escapeSqlString(JSON.stringify(_villageAttackEventInfo));
        context.mysql.dbUtils.api_MySQL_Exec_Safe(
            mysql,
            `REPLACE INTO game_event (event_id, event_info) VALUES ('villageattack', '${jsonStr}');`
        );
    } catch (error) {
        log(WARN, `[${module.name}] Save villageattack event failed: ${error}`);
    }
}

/** 从 frida.game_event 加载活动状态 */
function _loadEventFromDb() {
    try {
        const mysql = context.mysql.dbConnector.getConFromConfig('frida');
        if (!mysql)
            return;
        const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Str } = context.mysql.dbUtils;
        api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS game_event (
            event_id varchar(30) NOT NULL,
            event_info mediumtext NULL,
            PRIMARY KEY (event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);

        if (api_MySQL_Exec_Safe(mysql, "SELECT event_info FROM game_event WHERE event_id = 'villageattack';")) {
            if (MySQL_Get_N_Rows(mysql) === 1 && MySQL_Fetch(mysql)) {
                const info = api_MySQL_Get_Str(mysql, 0);
                if (info) {
                    _villageAttackEventInfo = JSON.parse(info);
                }
            }
        }
    } catch (error) {
        log(WARN, `[${module.name}] Load villageattack event failed: ${error}`);
    }
}

/** 世界广播怪物攻城当前阶段与难度 */
function _broadcastDifficult() {
    if (_villageAttackEventInfo.state !== VILLAGEATTACK_STATE_END) {
        context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
            `<怪物攻城活动> 当前阶段:${_villageAttackEventInfo.state + 1}, 当前难度等级: ${_villageAttackEventInfo.difficult}`,
            14
        );
    }
}

/** 广播更新频道内怪物攻城总进度（协议 247） */
function _broadcastScore() {
    const remainTime = _getRemainTime();
    if (remainTime <= 0 || _villageAttackEventInfo.state === VILLAGEATTACK_STATE_END)
        return;

    const pkt = context.system.packet;
    const packetGuard = pkt.api_PacketGuard_PacketGuard();
    try {
        pkt.InterfacePacketBuf_Put_Header(packetGuard, 0, 247);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, remainTime);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, _villageAttackEventInfo.score);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, _config.targetScores[2]);
        pkt.InterfacePacketBuf_Finalize(packetGuard, 1);
        context.utils.gameWorld.api_GameWorld_Send_All(packetGuard);
    } finally {
        pkt.Destroy_PacketGuard_PacketGuard(packetGuard);
    }
}

/** 通知单个玩家打开攻城 UI 并同步个人 PT（协议 248） */
function _notifyUserScore(user) {
    const remainTime = _getRemainTime();
    if (remainTime <= 0 || _villageAttackEventInfo.state === VILLAGEATTACK_STATE_END)
        return;

    const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user).toString();
    let userPt = 0;
    if (characNo in _villageAttackEventInfo.user_pt_info) {
        userPt = _villageAttackEventInfo.user_pt_info[characNo][1];
    }

    const pkt = context.system.packet;
    const packetGuard = pkt.api_PacketGuard_PacketGuard();
    try {
        pkt.InterfacePacketBuf_Put_Header(packetGuard, 0, 248);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, remainTime);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, _villageAttackEventInfo.score);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, _config.targetScores[2]);
        pkt.InterfacePacketBuf_Put_Int(packetGuard, userPt);
        pkt.InterfacePacketBuf_Finalize(packetGuard, 1);
        context.utils.cuser.CUser_Send(user, packetGuard);
    } finally {
        pkt.Destroy_PacketGuard_PacketGuard(packetGuard);
    }
}

/** 重置新一轮攻城活动数据 */
function _resetEventInfo() {
    _villageAttackEventInfo.state = VILLAGEATTACK_STATE_P1;
    _villageAttackEventInfo.score = 0;
    _villageAttackEventInfo.difficult = 0;
    _villageAttackEventInfo.next_village_monster_id = TAU_CAPTAIN_MONSTER_ID;
    _villageAttackEventInfo.last_killed_monster_id = 0;
    _villageAttackEventInfo.p2_last_killed_monster_time = 0;
    _villageAttackEventInfo.p2_kill_combo = 0;
    _villageAttackEventInfo.gbl_cnt = 0;
    _villageAttackEventInfo.defend_success = 0;
    _villageAttackEventInfo.user_pt_info = {};
    _setDungeonDifficult(_villageAttackEventInfo.difficult);
    _villageAttackEventInfo.start_time = context.system.time.api_CSystemTime_getCurSec();
}

/** 触发服务端底层开启怪物攻城刷怪 */
function _triggerNativeStart() {
    const a3 = Memory.alloc(100);
    a3.add(10).writeInt(_config.totalTimeSec);
    a3.add(14).writeInt(_villageAttackEventInfo.score);
    a3.add(18).writeInt(_config.targetScores[2]);
    Inter_VillageAttackedStart_dispatch_sig(ptr(0), ptr(0), a3);
}

/** 触发服务端底层销毁城镇攻城怪物 */
function _triggerNativeEnd() {
    village_attacked_CVillageMonsterMgr_OnDestroyVillageMonster(GlobalData_s_villageMonsterMgr.readPointer(), 2);
}

/** 计算并设定下一轮怪物攻城开启倒计时 */
function _scheduleNextEventStart() {
    const curTime = context.system.time.api_CSystemTime_getCurSec();
    let delaySec = (3600 * _config.startHourUtc) - (curTime % (3600 * 24));
    if (delaySec <= 0) {
        delaySec += 3600 * 24;
    }
    log(INFO, `[${module.name}] Next village attack starts in ${delaySec}s.`);
    context.system.thread.api_ClearScheduleDelay(_startTimerId);
    _startTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(_onStartEvent, null, delaySec * 1000);
}

/** 正式开始一轮怪物攻城活动 */
function _onStartEvent() {
    _startTimerId = null;
    _resetEventInfo();
    _triggerNativeStart();
    context.system.thread.api_ClearScheduleDelay(_tickTimerId);
    _tickTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(_onEventTick, null, 5000);
    _broadcastDifficult();
}

/** 每5秒执行一次活动状态轮询（结束判定、GBL主教与世界BOSS回血扣PT） */
function _onEventTick() {
    _tickTimerId = null;
    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_END)
        return;

    const remainTime = _getRemainTime();
    if (remainTime <= 0) {
        _onEndEvent();
        return;
    }

    const getRandomInt = context.system.common.getRandomInt;
    let damage = 0;

    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P2 || _villageAttackEventInfo.state === VILLAGEATTACK_STATE_P3) {
        for (let i = 0; i < _villageAttackEventInfo.gbl_cnt; ++i) {
            if (getRandomInt(0, 100) < (4 + _villageAttackEventInfo.difficult)) {
                damage += 1;
            }
        }
    }
    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P3) {
        if (getRandomInt(0, 100) < (6 + _villageAttackEventInfo.difficult)) {
            damage += 1;
        }
    }

    if (damage > 0) {
        _villageAttackEventInfo.score -= damage;
        const floorScore = _villageAttackEventInfo.state > 0 ? _config.targetScores[_villageAttackEventInfo.state - 1] : 0;
        if (_villageAttackEventInfo.score < floorScore) {
            _villageAttackEventInfo.score = floorScore;
        }
        _broadcastScore();
    }

    if (_villageAttackEventInfo.state !== VILLAGEATTACK_STATE_END) {
        _tickTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(_onEventTick, null, 5000);
    }
}

/** 结束怪物攻城活动并结算全服奖惩 */
function _onEndEvent() {
    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_END)
        return;

    _villageAttackEventInfo.state = VILLAGEATTACK_STATE_END;
    context.system.thread.api_ClearScheduleDelay(_tickTimerId);
    _tickTimerId = null;
    _triggerNativeEnd();

    const getRandomInt = context.system.common.getRandomInt;
    const gameWorld = context.utils.gameWorld;
    const cuser = context.utils.cuser;
    const cinfo = context.utils.cuserCharacInfo;
    const cinven = context.utils.cinven;

    if (_villageAttackEventInfo.defend_success) {
        const diff = _villageAttackEventInfo.difficult;
        const rewardGold = 1000000 * (1 + diff);
        const rewardItemList = [
            [7745, 5 * (1 + diff)],     // 士气冲天
            [2600028, 5 * (1 + diff)],  // 天堂痊愈
            [42, 5 * (1 + diff)],       // 复活币
            [3314, 1 + diff],           // 绝望之塔通关奖章
        ];
        context.utils.gameWorldEx.api_GameWorld_SendMail('<怪物攻城活动>', '恭喜勇士!', rewardGold, rewardItemList);

        // 在线玩家特殊奖励：绝望之塔直达100层 + 随机强化一件身上穿戴的装备
        gameWorld.api_GameWorld_Foreach((user) => {
            cuser.api_TOD_UserState_SetEnterLayer(user, 99);
            const inven = cinfo.CUserCharacInfo_GetCurCharacInvenW(user);
            const slot = getRandomInt(10, 21);
            const equ = cinven.CInventory_GetInvenRef(inven, cinven.INVENTORY_TYPE.INVENTORY_TYPE_BODY, slot);
            if (cinven.Inven_Item_GetKey(equ)) {
                let upgradeLevel = equ.add(6).readU8();
                if (upgradeLevel < 31) {
                    const bonusLevel = getRandomInt(1, 1 + diff);
                    upgradeLevel = Math.min(31, upgradeLevel + bonusLevel);
                    equ.add(6).writeU8(upgradeLevel);
                    cuser.CUser_SendUpdateItemList(user, 1, cuser.UPDATE_TYPE.UPDATE_TYPE_BODY, slot);
                }
            }
        }, null);

        // 个人积分点券奖励与榜一额外大奖
        let rankFirstCharacNo = 0;
        let rankFirstAccId = 0;
        let maxPt = 0;
        for (const characNo in _villageAttackEventInfo.user_pt_info) {
            const [accId, pt] = _villageAttackEventInfo.user_pt_info[characNo];
            const userPtr = gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
            if (userPtr && !userPtr.isNull()) {
                cuser.api_Recharge_Cash_Cera(userPtr, pt * 10);
            }
            if (pt > maxPt) {
                rankFirstCharacNo = characNo;
                rankFirstAccId = accId;
                maxPt = pt;
            }
        }

        gameWorld.api_GameWorld_SendNotiPacketMessage('<怪物攻城活动> 防守成功, 奖励已发送!', 14);
        if (rankFirstCharacNo) {
            const topUserPtr = gameWorld.api_GameWorld_Find_User_From_World_ByAccid(rankFirstAccId);
            if (topUserPtr && !topUserPtr.isNull()) {
                cuser.api_Recharge_Cash_Cera(topUserPtr, maxPt * 10);
            }
            const topName = context.mysql.gameService.getCharacNameByCharacNo(parseInt(rankFirstCharacNo, 10));
            gameWorld.api_GameWorld_SendNotiPacketMessage(
                `<怪物攻城活动> 恭喜勇士 【${topName}】 成为个人积分排行榜第一名(${maxPt}pt)!`,
                14
            );
        }
    } else {
        if (_config.defendFailPenalty) {
            gameWorld.api_GameWorld_Foreach((user) => {
                const inven = cinfo.CUserCharacInfo_GetCurCharacInvenW(user);
                if (getRandomInt(0, 100) < 7) {
                    const slot = getRandomInt(10, 21);
                    const equ = cinven.CInventory_GetInvenRef(inven, cinven.INVENTORY_TYPE.INVENTORY_TYPE_BODY, slot);
                    if (cinven.Inven_Item_GetKey(equ)) {
                        cinven.Inven_Item_Reset(equ);
                        cuser.CUser_SendNotiPacket(user, 1, 2, 3);
                    }
                }
                const rate = getRandomInt(1, 11);
                const curGold = cinven.CInventory_Get_Money(inven);
                const tax = Math.floor((rate / 100) * curGold);
                if (tax > 0) {
                    cinven.CInventory_Use_Money(inven, tax, 0, 0);
                    cuser.CUser_SendUpdateItemList(user, 1, cuser.UPDATE_TYPE.UPDATE_TYPE_INVENTORY, 0);
                }
            }, null);
        }
        gameWorld.api_GameWorld_SendNotiPacketMessage('<怪物攻城活动> 防守失败, 请勇士们再接再厉!', 14);
    }

    _villageAttackEventInfo.user_pt_info = {};
    _saveEventToDb();
    _scheduleNextEventStart();
}

/** 按累计击杀攻城怪次数给玩家发送邮件奖励 */
function _sendKillCountRewardMail(user) {
    const count = GetCurVAttackCount(user);
    const rewardTable = {
        1: [3037, 5], 2: [3037, 5], 3: [3037, 5],
        4: [1085, 2], 5: [1085, 5], 6: [1085, 2],
        7: [8, 2], 8: [8, 5], 9: [8, 2],
        10: [36, 1], 11: [36, 1], 12: [15, 1], 13: [15, 1],
        14: [3037, 10], 15: [3262, 2], 16: [3262, 3],
        17: [2600261, 1], 18: [2600261, 1], 19: [3037, 5],
        20: [1031, 2], 21: [8, 2], 22: [1085, 2], 23: [8, 5],
        24: [15, 1], 25: [15, 2], 26: [3262, 5], 27: [3262, 2],
        28: [8, 5], 29: [1085, 2], 30: [10000160, 1],
        31: [3037, 5], 32: [3037, 5], 33: [8, 2], 34: [1085, 2],
        35: [2600261, 1], 36: [10000161, 1]
    };
    const [itemId, itemCnt] = rewardTable[count] || [3037, 5];
    context.utils.cuserEx.api_SendSystemMailSingleItem(user, '居民代表', '击杀怪物奖励：', itemId, itemCnt, 0, 30);
}

/** 初始化加载存档并启动对应定时器 */
function _bootstrapEvent() {
    _initTimerId = null;
    _loadEventFromDb();
    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_END) {
        _scheduleNextEventStart();
    } else {
        _setDungeonDifficult(_villageAttackEventInfo.difficult);
        _tickTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(_onEventTick, null, 5000);
    }
}

/** 攻城副本内刷怪处理器（注册到 game-utils 统一分发器） */
function _handleAddMob(mapInfo, monster, MapInfo_Add_Mob_Orig) {
    if (!_stateOnFighting || _villageAttackEventInfo.state === VILLAGEATTACK_STATE_END)
        return undefined;

    const getRandomInt = context.system.common.getRandomInt;
    const diff = _villageAttackEventInfo.difficult;

    if (_onFightingVillageMonsterId === TAU_META_COW_MONSTER_ID && _villageAttackEventInfo.state === VILLAGEATTACK_STATE_P3) {
        const bossChance = (_villageAttackEventInfo.score - _config.targetScores[1]) + (6 * diff);
        if (getRandomInt(0, 100) < bossChance) {
            monster.add(0xc).writeUInt(TAU_META_COW_MONSTER_ID);
        }
    }

    if (diff === 0) {
        return MapInfo_Add_Mob_Orig(mapInfo, monster);
    } else if (diff === 1) {
        monster.add(16).writeU8(100);
        return MapInfo_Add_Mob_Orig(mapInfo, monster);
    } else if (diff === 2) {
        monster.add(16).writeU8(110);
        if (monster.add(8).readU8() !== 3 && getRandomInt(0, 100) < 50) {
            monster.add(8).writeU8(1);
        }
        return MapInfo_Add_Mob_Orig(mapInfo, monster);
    } else if (diff === 3) {
        monster.add(16).writeU8(120);
        if (monster.add(8).readU8() !== 3 && getRandomInt(0, 100) < 75) {
            monster.add(8).writeU8(2);
        }
        MapInfo_Add_Mob_Orig(mapInfo, monster);
        monster.writeUInt(monster.readUInt() + 1000);
        monster.add(4).writeUInt(monster.add(4).readUInt() + 1000);
        return MapInfo_Add_Mob_Orig(mapInfo, monster);
    } else if (diff === 4) {
        monster.add(16).writeU8(127);
        if (monster.add(8).readU8() !== 3) {
            monster.add(8).writeU8(getRandomInt(1, 3));
        }
        MapInfo_Add_Mob_Orig(mapInfo, monster);
        let ret = 0;
        for (let c = 0; c < 3; c++) {
            monster.writeUInt(monster.readUInt() + 1000);
            monster.add(4).writeUInt(monster.add(4).readUInt() + 1000);
            ret = MapInfo_Add_Mob_Orig(mapInfo, monster);
        }
        return ret;
    }
    return MapInfo_Add_Mob_Orig(mapInfo, monster);
}

/** 注册怪物攻城 GM 指令帮助 */
function _registerGmHelp() {
    if (!context.gmHelpRegistry) {
        context.gmHelpRegistry = new Map();
    }
    context.gmHelpRegistry.set(_config.cmd.start, {
        cmd: _config.cmd.start,
        params: '',
        desc: '主动开启怪物攻城活动',
        moduleName: module.name
    });
    context.gmHelpRegistry.set(_config.cmd.end, {
        cmd: _config.cmd.end,
        params: '[win|fail]',
        desc: '主动结束怪物攻城活动(可选指定防守成功win或失败fail)',
        moduleName: module.name
    });
}

function _unregisterGmHelp() {
    if (!context.gmHelpRegistry)
        return;
    for (const [key, val] of context.gmHelpRegistry.entries()) {
        if (val.moduleName === module.name) {
            context.gmHelpRegistry.delete(key);
        }
    }
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    init() {
        _origDifficultInt = ADDR_VILLAGEATTACK_DIFFICULT.readInt();
        context.utils.cdungeon.registerAddMobHandler(module.name, _handleAddMob);
        _registerGmHelp();
        _initTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(_bootstrapEvent, null, 150);
    },
    dispose() {
        _clearTimers();
        context.utils.cdungeon.unregisterAddMobHandler(module.name);
        _unregisterGmHelp();
        if (_origDifficultInt !== null) {
            Memory.protect(ADDR_VILLAGEATTACK_DIFFICULT, 4, 'rwx');
            ADDR_VILLAGEATTACK_DIFFICULT.writeInt(_origDifficultInt);
            _origDifficultInt = null;
        }
    },
    hooks: [
        // GM 主动开启/关闭怪物攻城指令
        {
            address: '0x820BBDE',
            onEnter(args) {
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                if (!Array.isArray(_config.gmAuth) || !_config.gmAuth.includes(characNo))
                    return;

                const rawPacketBuf = context.system.packet.api_PacketBuf_Get_Buf(args[2]);
                const msgLen = rawPacketBuf.readInt();
                const msg = rawPacketBuf.add(4).readUtf8String(msgLen).slice(2).trim();
                if (!msg)
                    return;

                const parts = msg.split(/\s+/);
                const cmdName = parts[0];
                const arg1 = (parts[1] || '').toLowerCase();

                if (cmdName === _config.cmd.start) {
                    if (_villageAttackEventInfo.state !== VILLAGEATTACK_STATE_END && arg1 !== 'force') {
                        context.utils.cuser.api_CUser_SendNotiPacketMessage(user, 'GM: 怪物攻城活动正在进行中！如需强制重开请输入 //attackstart force', 8);
                        return;
                    }
                    if (_villageAttackEventInfo.state !== VILLAGEATTACK_STATE_END) {
                        _villageAttackEventInfo.state = VILLAGEATTACK_STATE_END;
                        _triggerNativeEnd();
                    }
                    _onStartEvent();
                    _saveEventToDb();
                    context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage('<怪物攻城活动> GM已开启怪物攻城活动，请勇士们火速前往城镇迎战！', 14);
                    context.utils.cuser.api_CUser_SendNotiPacketMessage(user, 'GM: 已主动开启怪物攻城活动！', 1);
                } else if (cmdName === _config.cmd.end) {
                    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_END) {
                        context.utils.cuser.api_CUser_SendNotiPacketMessage(user, 'GM: 当前怪物攻城活动尚未开启！', 8);
                        return;
                    }
                    if (arg1 === 'win') {
                        _villageAttackEventInfo.defend_success = 1;
                    } else if (arg1 === 'fail') {
                        _villageAttackEventInfo.defend_success = 0;
                    }
                    _onEndEvent();
                    context.utils.cuser.api_CUser_SendNotiPacketMessage(user, 'GM: 已主动结束怪物攻城活动并完成结算！', 1);
                }
            }
        },
        // 怪物攻城副本奖励回调
        {
            address: '0x086B34A0',
            onEnter(args) {
                this._vaRewardUser = args[1];
            },
            onLeave(retval) {
                if (retval.toInt32() === 0 && this._vaRewardUser && !this._vaRewardUser.isNull()) {
                    _sendKillCountRewardMail(this._vaRewardUser);
                }
            }
        },
        // 挑战攻城怪物副本结算更新各阶段状态（CVillageMonster::SendVillageMonsterFightResult）
        {
            address: '0x086B330A',
            onEnter(args) {
                this._vaMonster = args[0];
                this._vaFightUser = args[1];
                this._vaResult = args[2].toInt32();
            },
            onLeave(retval) {
                if (this._vaResult !== 1 || _villageAttackEventInfo.state === VILLAGEATTACK_STATE_END)
                    return;

                const cuser = context.utils.cuser;
                const cinfo = context.utils.cuserCharacInfo;
                const cparty = context.utils.cparty;

                const monsterId = this._vaMonster.add(2).readUShort();
                const bonusPt = 2 ** _villageAttackEventInfo.difficult;
                const party = cuser.CUser_GetParty(this._vaFightUser);
                if (party.isNull())
                    return;

                // 更新小队成员个人 PT
                for (let i = 0; i < 4; ++i) {
                    const member = cparty.CParty_Get_User(party, i);
                    if (!member.isNull()) {
                        const characNo = cinfo.CUserCharacInfo_GetCurCharacNo(member).toString();
                        if (!(characNo in _villageAttackEventInfo.user_pt_info)) {
                            _villageAttackEventInfo.user_pt_info[characNo] = [cuser.CUser_Get_Acc_Id(member), 0];
                        }
                        _villageAttackEventInfo.user_pt_info[characNo][1] += bonusPt;
                        if (monsterId === TAU_META_COW_MONSTER_ID && _villageAttackEventInfo.state === VILLAGEATTACK_STATE_P3) {
                            _villageAttackEventInfo.user_pt_info[characNo][1] += 1000 * (1 + _villageAttackEventInfo.difficult);
                        }
                    }
                }

                // 阶段推进逻辑
                if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P1) {
                    _villageAttackEventInfo.score += bonusPt;
                    if (_villageAttackEventInfo.score < _config.targetScores[0]) {
                        if (monsterId === TAU_CAPTAIN_MONSTER_ID && _villageAttackEventInfo.difficult < 4) {
                            _villageAttackEventInfo.difficult += 1;
                            _setDungeonDifficult(_villageAttackEventInfo.difficult);
                            _villageAttackEventInfo.next_village_monster_id = TAU_CAPTAIN_MONSTER_ID;
                            _broadcastDifficult();
                        }
                    } else {
                        _villageAttackEventInfo.state = VILLAGEATTACK_STATE_P2;
                        _villageAttackEventInfo.score = _config.targetScores[0];
                        _villageAttackEventInfo.p2_last_killed_monster_time = 0;
                        _villageAttackEventInfo.last_killed_monster_id = 0;
                        _villageAttackEventInfo.p2_kill_combo = 0;
                        _broadcastDifficult();
                    }
                } else if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P2) {
                    const curTime = context.system.time.api_CSystemTime_getCurSec();
                    const diffTime = curTime - _villageAttackEventInfo.p2_last_killed_monster_time;
                    if (diffTime < 60 && monsterId === _villageAttackEventInfo.last_killed_monster_id) {
                        _villageAttackEventInfo.p2_kill_combo += 1;
                        if (_villageAttackEventInfo.p2_kill_combo >= 3) {
                            _villageAttackEventInfo.score += 33;
                            _villageAttackEventInfo.last_killed_monster_id = 0;
                            _villageAttackEventInfo.p2_kill_combo = 0;
                        }
                    } else {
                        _villageAttackEventInfo.last_killed_monster_id = monsterId;
                        _villageAttackEventInfo.p2_kill_combo = 1;
                    }
                    _villageAttackEventInfo.p2_last_killed_monster_time = curTime;
                    if (_villageAttackEventInfo.score >= _config.targetScores[1]) {
                        _villageAttackEventInfo.state = VILLAGEATTACK_STATE_P3;
                        _villageAttackEventInfo.score = _config.targetScores[1];
                        _villageAttackEventInfo.next_village_monster_id = TAU_META_COW_MONSTER_ID;
                        _broadcastDifficult();
                    }
                } else if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P3) {
                    if (monsterId === TAU_META_COW_MONSTER_ID) {
                        _villageAttackEventInfo.score += 25;
                        _villageAttackEventInfo.next_village_monster_id = TAU_META_COW_MONSTER_ID;
                        const killerName = cinfo.api_CUserCharacInfo_GetCurCharacName(this._vaFightUser);
                        context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
                            `<怪物攻城活动> 世界BOSS已被【${killerName}】击杀!`,
                            14
                        );
                        if (_villageAttackEventInfo.score >= _config.targetScores[2]) {
                            _villageAttackEventInfo.defend_success = 1;
                            context.system.thread.api_ScheduleOnMainThread(_onEndEvent, null);
                            return;
                        }
                    }
                }

                _broadcastScore();
                for (let i = 0; i < 4; ++i) {
                    const member = cparty.CParty_Get_User(party, i);
                    if (!member.isNull()) {
                        _notifyUserScore(member);
                    }
                }
                if (monsterId === GBL_POPE_MONSTER_ID && _villageAttackEventInfo.gbl_cnt > 0) {
                    _villageAttackEventInfo.gbl_cnt -= 1;
                }
            }
        },
        // 控制城镇刷新的下一只攻城怪物 ID（CVillageMonsterArea::GetAttackedMonster）
        {
            address: '0x086B3AEA',
            onLeave(retval) {
                if (retval.isNull())
                    return;
                const getRandomInt = context.system.common.getRandomInt;
                const nextMonster = ptr(retval);
                const nextMonsterId = nextMonster.readUShort();

                if (nextMonsterId === TAU_META_COW_MONSTER_ID || nextMonsterId === TAU_CAPTAIN_MONSTER_ID) {
                    nextMonster.writeUShort(getRandomInt(1, 17));
                }
                if (_villageAttackEventInfo.next_village_monster_id) {
                    if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P1 || _villageAttackEventInfo.state === VILLAGEATTACK_STATE_P2) {
                        nextMonster.writeUShort(_villageAttackEventInfo.next_village_monster_id);
                        _villageAttackEventInfo.next_village_monster_id = 0;
                    } else if (_villageAttackEventInfo.state === VILLAGEATTACK_STATE_P3) {
                        if (getRandomInt(0, 100) < 44) {
                            nextMonster.writeUShort(_villageAttackEventInfo.next_village_monster_id);
                            _villageAttackEventInfo.next_village_monster_id = 0;
                            context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
                                '<怪物攻城活动> 世界BOSS已刷新, 请勇士们前往挑战!',
                                14
                            );
                        }
                    }
                }
                if (nextMonster.readUShort() === GBL_POPE_MONSTER_ID) {
                    _villageAttackEventInfo.gbl_cnt += 1;
                }
            }
        },
        // 标记正在进入挑战攻城怪物流程（CParty::OnFightVillageMonster）
        {
            address: '0x085B9596',
            onEnter(args) {
                _stateOnFighting = true;
                _onFightingVillageMonsterId = 0;
            },
            onLeave(retval) {
                _onFightingVillageMonsterId = 0;
                _stateOnFighting = false;
            }
        },
        // 记录当前被挑战的攻城怪物 ID（CVillageMonster::OnFightVillageMonster）
        {
            address: '0x086B3240',
            onEnter(args) {
                if (_stateOnFighting) {
                    _onFightingVillageMonsterId = args[0].add(2).readU16();
                }
            }
        },
        // 每次挑战通关额外给予小队全员当前升级所需经验 0%~0.1%（CVillageMonsterMgr::OnKillVillageMonster）
        {
            address: '0x086B4866',
            onEnter(args) {
                this._vaKillUser = args[1];
                this._vaKillResult = args[2].toInt32();
            },
            onLeave(retval) {
                if (retval.toInt32() === 0 && this._vaKillResult) {
                    const cuser = context.utils.cuser;
                    const cinfo = context.utils.cuserCharacInfo;
                    const party = cuser.CUser_GetParty(this._vaKillUser);
                    if (party.isNull())
                        return;
                    const getRandomInt = context.system.common.getRandomInt;
                    for (let i = 0; i < 4; ++i) {
                        const member = context.utils.cparty.CParty_Get_User(party, i);
                        if (!member.isNull()) {
                            const curLv = cinfo.CUserCharacInfo_Get_Charac_Level(member);
                            const lvUpExp = cinfo.CUserCharacInfo_Get_Level_Up_Exp(member, curLv);
                            const rewardExp = Math.floor(lvUpExp * getRandomInt(0, 1000) / 1000000);
                            cuser.api_CUser_Gain_Exp_Sp(member, rewardExp);
                            cuser.api_CUser_SendNotiPacketMessage(member, `怪物攻城挑战成功, 获取额外经验奖励${rewardExp}`, 0);
                        }
                    }
                }
            }
        },
        // 玩家上线时若怪物攻城进行中，自动下发活动 UI 并同步进度（GameWorld::reach_game_world）
        {
            address: '0x86C4E50',
            onEnter(args) {
                this._vaLoginUser = args[1];
            },
            onLeave(retval) {
                if (_villageAttackEventInfo.state !== VILLAGEATTACK_STATE_END && this._vaLoginUser && !this._vaLoginUser.isNull()) {
                    _notifyUserScore(this._vaLoginUser);
                    _broadcastDifficult();
                }
            }
        }
    ]
};
