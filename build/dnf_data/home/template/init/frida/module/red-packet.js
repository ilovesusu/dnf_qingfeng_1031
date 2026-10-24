/**
 * red-packet.js
 * 口令红包与喇叭抢红包系统
 * 功能：使用指定红包道具发送全服超链接口令红包；全服玩家发服务器喇叭输入口令拼手气抢点券/代币/金币/道具；
 *       普通聊天输入“查询红包”查看未领口令；每日定时自动清理未领完红包。
 */

var _config = {
    gmAuth: context.config.gmCid,
    externalConfigPath: '', // 可选外部红包配置文件路径（如 '/plugins/frida/reward_config.json'，留空则直接使用下方内置配置）
    dailyClearHourUtc: 22, // 每日清理过期红包时间（UTC 22点 = 北京时间次日 06:00）
    clearCmd: 'clearredpacket', // GM 手动清空未领完红包命令: //clearredpacket
    // 内置红包道具配置: itemId -> [是否扣除发送者资产(0系统福利/1扣发送者), 奖励类型(1点券/2代币/3金币/其它为物品ID), 总数量, 可领人数, 红包口令, 备用口令]
    redPackets: {
        10300052: [0, 1, 1000, 5, '恭喜发财大吉大利', ''],
        10300053: [0, 2, 2000, 5, '福利代币天天领', ''],
        10300054: [0, 3, 5000000, 10, '百万金币拼手气', ''],
        10300055: [0, 3037, 1000, 10, '无色晶块大家抢', ''],
        10300056: [0, 3330, 100, 5, '深渊闪光出史诗', ''],
    }
};

const { log, readFile } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

let _mergedRedPackets = {};
let _initTimerId = null;
let _clearTimerId = null;

function _escapeSql(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _loadRedPacketConfigs() {
    _mergedRedPackets = { ..._config.redPackets };
    try {
        if (_config.externalConfigPath) {
            const raw = readFile(_config.externalConfigPath, 'r', 2 * 1024 * 1024);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    Object.assign(_mergedRedPackets, parsed);
                    log(INFO, `[${module.name}] Merged external reward_config.json (${Object.keys(parsed).length} items).`);
                }
            }
        }
    } catch (e) {
        // 外部配置文件不存在或格式异常时自动回退使用内置配置
    }
}

function _ensureTable() {
    let mysql = null;
    try {
        mysql = context.mysql.dbConnector.getConFromConfig('frida');
    } catch (e) {
        return null;
    }
    if (!mysql)
        return null;
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS reward_event (
        event_id int NOT NULL AUTO_INCREMENT,
        event_info mediumtext NULL,
        PRIMARY KEY (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    return mysql;
}

function _loadActiveRedPacketsFromDb() {
    const list = [];
    const mysql = _ensureTable();
    if (!mysql)
        return list;

    const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Str } = context.mysql.dbUtils;
    if (api_MySQL_Exec_Safe(mysql, 'SELECT event_id, event_info FROM reward_event ORDER BY event_id ASC;')) {
        const rows = MySQL_Get_N_Rows(mysql);
        for (let i = 0; i < rows; i++) {
            if (MySQL_Fetch(mysql)) {
                const id = api_MySQL_Get_Str(mysql, 0);
                const infoStr = api_MySQL_Get_Str(mysql, 1);
                if (id && infoStr) {
                    try {
                        list.push({ id, info: JSON.parse(infoStr) });
                    } catch (e) {
                        log(WARN, `[${module.name}] Invalid JSON in reward_event id=${id}: ${e}`);
                    }
                }
            }
        }
    }
    return list;
}

function _insertRedPacketToDb(recordObj) {
    const mysql = _ensureTable();
    if (!mysql)
        return;
    const jsonStr = _escapeSql(JSON.stringify(recordObj));
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `INSERT INTO reward_event (event_info) VALUES ('${jsonStr}');`);
}

function _updateRedPacketInDb(id, recordObj) {
    const mysql = _ensureTable();
    if (!mysql)
        return;
    const safeId = parseInt(id, 10);
    const jsonStr = _escapeSql(JSON.stringify(recordObj));
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `REPLACE INTO reward_event (event_id, event_info) VALUES (${safeId}, '${jsonStr}');`);
}

function _deleteRedPacketFromDb(id) {
    const mysql = _ensureTable();
    if (!mysql)
        return;
    const safeId = parseInt(id, 10);
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `DELETE FROM reward_event WHERE event_id = ${safeId};`);
}

function _clearAllRedPacketsInDb() {
    const mysql = _ensureTable();
    if (!mysql)
        return;
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, 'DELETE FROM reward_event;');
}

function _scheduleDailyCleanup() {
    const curSec = context.system.time.api_CSystemTime_getCurSec();
    let delaySec = (3600 * _config.dailyClearHourUtc) - (curSec % (3600 * 24));
    if (delaySec <= 0) {
        delaySec += 3600 * 24;
    }
    context.system.thread.api_ClearScheduleDelay(_clearTimerId);
    _clearTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
        _clearTimerId = null;
        _clearAllRedPacketsInDb();
        log(INFO, `[${module.name}] Daily expired red packets cleared.`);
        _scheduleDailyCleanup();
    }, null, delaySec * 1000);
}

/** 玩家使用口令红包道具发送全服红包 */
function _sendRedPacket(user, itemId) {
    const cfg = _mergedRedPackets[itemId];
    if (!cfg || !Array.isArray(cfg) || cfg.length < 5)
        return;

    const cuser = context.utils.cuser;
    const cinfo = context.utils.cuserCharacInfo;
    const cinven = context.utils.cinven;
    const citem = context.utils.citem;

    const deductSelf = parseInt(cfg[0], 10);
    const rewardType = parseInt(cfg[1], 10);
    const totalAmount = parseInt(cfg[2], 10);
    const maxClaimCount = parseInt(cfg[3], 10);
    const passphrase = String(cfg[4] || '');
    const altPassphrase = String(cfg[5] || '');

    if (totalAmount <= 0 || maxClaimCount <= 0 || totalAmount < maxClaimCount || !passphrase)
        return;

    let ok = false;
    let rewardLabel = '';
    let lackDesc = '';

    const inven = cinfo.CUserCharacInfo_GetCurCharacInvenW(user);

    if (rewardType === 1) {
        rewardLabel = `[${totalAmount}点券]`;
        if (deductSelf === 1) {
            if (cuser.CUser_GetCera(user) >= totalAmount) {
                ok = true;
            } else {
                lackDesc = `点券不足 ${totalAmount}`;
            }
        } else {
            ok = true;
        }
    } else if (rewardType === 2) {
        rewardLabel = `[${totalAmount}代币]`;
        if (deductSelf === 1) {
            if (cuser.CUser_GetCeraPoint(user) >= totalAmount) {
                ok = true;
            } else {
                lackDesc = `代币券不足 ${totalAmount}`;
            }
        } else {
            ok = true;
        }
    } else if (rewardType === 3) {
        rewardLabel = `[${totalAmount}金币]`;
        if (deductSelf === 1) {
            if (cinven.CInventory_Get_Money(inven) >= totalAmount) {
                cinven.CInventory_Use_Money(inven, totalAmount, 0, 0);
                cuser.CUser_Send_ItemSpace(user, 0);
                ok = true;
            } else {
                lackDesc = `金币不足 ${totalAmount}`;
            }
        } else {
            ok = true;
        }
    } else {
        const targetItemName = citem.api_CItem_GetItemName(rewardType) || rewardType;
        rewardLabel = `[${totalAmount}个${targetItemName}]`;
        if (deductSelf === 1) {
            const haveCnt = cinven.getItemCountInItemInven(inven, rewardType);
            if (haveCnt >= totalAmount) {
                cinven.deductItemFromItemInven(user, inven, rewardType, totalAmount);
                ok = true;
            } else {
                lackDesc = `背包中的 [${targetItemName}] 数量不足 ${totalAmount} 个`;
            }
        } else {
            ok = true;
        }
    }

    if (!ok) {
        const ticketName = citem.api_CItem_GetItemName(itemId) || itemId;
        cuser.api_CUser_SendNotiPacketMessage(user, `系统提示：您的${lackDesc}，[${ticketName}] 已返还到您的背包！`, 0);
        context.system.thread.api_ScheduleOnMainThread_Delay(cuser.api_CUser_AddItem, [user, itemId, 1], 10);
        return;
    }

    const characNo = cinfo.CUserCharacInfo_GetCurCharacNo(user);
    const characName = cinfo.api_CUserCharacInfo_GetCurCharacName(user);
    const entry = [
        deductSelf,
        rewardType,
        totalAmount,
        maxClaimCount,
        passphrase,
        altPassphrase,
        [],             // [6] 已领取 characNo 数组
        [],             // [7] 已领取明细 [[characNo, characName, amount], ...]
        characName      // [8] 发红包角色名
    ];
    const saveObj = { [`${characNo}_${itemId}`]: entry };
    _insertRedPacketToDb(saveObj);

    context.utils.gameWorldEx.api_GameWorld_SendHyperLinkChatMsg_Emoji([
        ['str', '玩家', [255, 255, 0, 255]],
        ['str', `[${characName}]`, [250, 0, 0, 255]],
        ['str', '发红包啦!\n', [255, 255, 0, 255]],
        ['str', '红包内容: ', [250, 255, 0, 255]],
        ['str', `${rewardLabel} `, [250, 0, 0, 255]],
        ['str', `可领取人数: ${maxClaimCount}人\n`, [255, 255, 0, 255]],
        ['str', '使用服务器喇叭输入下方口令即可领取红包:\n', [255, 255, 0, 255]],
        ['str', `${passphrase}`, [158, 247, 69, 255]],
    ], 14, 34);
}

/** 处理服务器喇叭抢红包 */
function _tryClaimRedPacket(user, characNo, characName, msg) {
    const list = _loadActiveRedPacketsFromDb();
    if (list.length === 0)
        return null;

    const cuser = context.utils.cuser;
    const cinfo = context.utils.cuserCharacInfo;
    const cinven = context.utils.cinven;
    const citem = context.utils.citem;
    const getRandomInt = context.system.common.getRandomInt;

    for (let idx = 0; idx < list.length; idx++) {
        const row = list[idx];
        const saveObj = row.info;
        const keys = Object.keys(saveObj);
        if (keys.length === 0)
            continue;

        const key = keys[0];
        const arr = saveObj[key];
        if (!Array.isArray(arr) || arr.length < 9)
            continue;

        const pass1 = arr[4];
        const pass2 = arr[5];
        if (msg !== pass1 && (!pass2 || msg !== pass2))
            continue;

        const claimedNos = Array.isArray(arr[6]) ? arr[6] : [];
        const claimedLogs = Array.isArray(arr[7]) ? arr[7] : [];
        const alreadyByName = claimedLogs.some(item => item && item[1] === characName);
        if (arr[3] <= 0 || claimedNos.includes(characNo) || alreadyByName)
            continue;

        // 拼手气金额计算：保证后续每位未领玩家至少还能分到 1
        let gain = 1;
        const remainUsers = parseInt(arr[3], 10);
        const remainTotal = parseInt(arr[2], 10);
        if (remainUsers <= 1) {
            gain = Math.max(1, remainTotal);
        } else {
            const safeMax = Math.max(1, Math.min(Math.floor(remainTotal / 2), remainTotal - (remainUsers - 1)));
            gain = getRandomInt(1, safeMax + 1);
        }

        const rewardType = parseInt(arr[1], 10);
        let notice1 = null;
        let notice2 = null;

        if (rewardType === 1) {
            cuser.api_Recharge_Cash_Cera(user, gain);
            notice1 = `玩家[${characName}]抢到了${gain}点券`;
        } else if (rewardType === 2) {
            cuser.api_Recharge_Cash_Cera_Point(user, gain);
            notice1 = `玩家[${characName}]抢到了${gain}代币`;
        } else if (rewardType === 3) {
            cinven.CInventory_Gain_Money(cinfo.CUserCharacInfo_GetCurCharacInvenW(user), gain, 0, 0, 0);
            cuser.CUser_Send_ItemSpace(user, 0);
            notice1 = `玩家[${characName}]抢到了${gain}金币`;
        } else {
            cuser.api_CUser_AddItem(user, rewardType, gain);
            const rName = citem.api_CItem_GetItemName(rewardType) || rewardType;
            notice1 = `玩家[${characName}]抢到了${gain}个${rName}`;
        }

        arr[3] = remainUsers - 1;
        arr[2] = Math.max(0, remainTotal - gain);
        claimedNos.push(characNo);
        claimedLogs.push([characNo, characName, gain]);
        arr[6] = claimedNos;
        arr[7] = claimedLogs;
        saveObj[key] = arr;

        if (arr[3] <= 0) {
            const sorted = [...claimedLogs].sort((a, b) => b[2] - a[2]);
            const luckyKing = sorted[0] ? sorted[0][1] : characName;
            notice2 = `玩家[${arr[8]}]的口令红包已被领取完毕！\n恭喜玩家[${luckyKing}]成为手气最佳！`;
            _deleteRedPacketFromDb(row.id);
        } else {
            _updateRedPacketInDb(row.id, saveObj);
        }

        return { notice1, notice2 };
    }
    return null;
}

/** 普通聊天输入“查询红包” */
function _queryUnclaimedRedPackets(user, characNo, characName) {
    const list = _loadActiveRedPacketsFromDb();
    const lines = ['当前未领取的红包口令:'];
    for (let idx = 0; idx < list.length; idx++) {
        const saveObj = list[idx].info;
        for (const k in saveObj) {
            const arr = saveObj[k];
            if (!Array.isArray(arr) || arr.length < 9 || arr[3] <= 0)
                continue;
            const claimedNos = Array.isArray(arr[6]) ? arr[6] : [];
            const claimedLogs = Array.isArray(arr[7]) ? arr[7] : [];
            const claimed = claimedNos.includes(characNo) || claimedLogs.some(x => x && x[1] === characName);
            if (!claimed && arr[4]) {
                lines.push(`  来自[${arr[8]}]的口令红包 (剩余${arr[3]}份) -> 口令：${arr[4]}`);
            }
        }
    }
    if (lines.length === 1) {
        lines.push('  暂无可领取的口令红包。');
    }
    for (const line of lines) {
        context.utils.cuser.api_CUser_SendNotiPacketMessage(user, line, 6);
    }
}

function _registerGmHelp() {
    if (!context.gmHelpRegistry) {
        context.gmHelpRegistry = new Map();
    }
    context.gmHelpRegistry.set(_config.clearCmd, {
        cmd: _config.clearCmd,
        params: '',
        desc: '清空数据库中所有未领完的口令红包',
        moduleName: module.name
    });
}

function _unregisterGmHelp() {
    if (!context.gmHelpRegistry)
        return;
    for (const [k, v] of context.gmHelpRegistry.entries()) {
        if (v.moduleName === module.name) {
            context.gmHelpRegistry.delete(k);
        }
    }
}

module.exports = {
    init() {
        _loadRedPacketConfigs();
        _registerGmHelp();
        _initTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
            _initTimerId = null;
            _ensureTable();
            _scheduleDailyCleanup();
        }, null, 200);
    },
    dispose() {
        context.system?.thread?.api_ClearScheduleDelay(_initTimerId);
        context.system?.thread?.api_ClearScheduleDelay(_clearTimerId);
        _initTimerId = null;
        _clearTimerId = null;
        _unregisterGmHelp();
    },
    hooks: [
        // 监听使用口令红包道具 (cHistoryTrace::operator())
        {
            address: '0x854F990',
            onEnter(args) {
                const historyLog = args[1].readUtf8String(-1);
                const group = historyLog.split(',');
                if (!group[13] || group[13].slice(1) !== 'Item-')
                    return;
                const reason = parseInt(group[18], 10);
                if (reason !== 3)
                    return;
                const itemId = parseInt(group[15], 10);
                if (!Object.prototype.hasOwnProperty.call(_mergedRedPackets, itemId))
                    return;
                const accId = parseInt(group[1], 10);
                const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                if (!user || user.isNull())
                    return;
                _sendRedPacket(user, itemId);
            }
        },
        // 监听聊天与服务器喇叭抢红包 (GameWorld::WriteLogChatMsg)
        {
            address: '0x086C9638',
            onEnter(args) {
                this._rpNotice1 = null;
                this._rpNotice2 = null;
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const reason = args[2].toInt32();
                const msg = (args[3].readUtf8String(-1) || '').trim();
                if (!msg)
                    return;

                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                const characName = context.utils.cuserCharacInfo.api_CUserCharacInfo_GetCurCharacName(user);

                if (reason === 11) {
                    const res = _tryClaimRedPacket(user, characNo, characName, msg);
                    if (res) {
                        this._rpNotice1 = res.notice1;
                        this._rpNotice2 = res.notice2;
                    }
                } else if (reason === 3 && msg === '查询红包') {
                    _queryUnclaimedRedPackets(user, characNo, characName);
                }
            },
            onLeave(retval) {
                if (this._rpNotice1) {
                    context.system.thread.api_ScheduleOnMainThread_Delay(
                        context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage,
                        [this._rpNotice1, 14],
                        50
                    );
                    this._rpNotice1 = null;
                }
                if (this._rpNotice2) {
                    context.system.thread.api_ScheduleOnMainThread_Delay(
                        context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage,
                        [this._rpNotice2, 14],
                        80
                    );
                    this._rpNotice2 = null;
                }
            }
        },
        // GM 手动清空红包命令
        {
            address: '0x820BBDE',
            onEnter(args) {
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                if (!Array.isArray(_config.gmAuth) || !_config.gmAuth.includes(characNo))
                    return;
                const rawBuf = context.system.packet.api_PacketBuf_Get_Buf(args[2]);
                const msgLen = rawBuf.readInt();
                const cmd = rawBuf.add(4).readUtf8String(msgLen).slice(2).trim();
                if (cmd === _config.clearCmd) {
                    _clearAllRedPacketsInDb();
                    context.utils.cuser.api_CUser_SendNotiPacketMessage(user, 'GM: 已清空所有未领完的口令红包！', 1);
                }
            }
        }
    ]
};
