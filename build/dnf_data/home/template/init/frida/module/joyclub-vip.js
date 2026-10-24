/**
 * joyclub-vip.js
 * 心悦会员成长体系（任务晋升 VIP + 专属上线彩色横幅）
 * 功能：
 *  1. 完成指定晋升任务后提升角色心悦 VIP 等级（持久化于 frida.joyclub_vip）并全服播报；
 *  2. 心悦 VIP1 / VIP2 / VIP3 玩家进入世界时全服发送专属配色与图标的超链接欢迎横幅。
 */

var _config = {
    maxVipLevel: 3,
    // 指定任务直接晋升到对应心悦等级并发送全服贺电
    milestoneQuests: {
        1016: 1,
        20001: 2,
        20232: 3,
    },
    // 兼容原版任务区间递进规则（设为 null 可仅按 milestoneQuests 晋升）
    incrementalQuestRange: [1016, 4414],
};

let _initTimerId = null;
const _vipCache = new Map();

function _ensureTable() {
    let mysql = null;
    try {
        mysql = context.mysql.dbConnector.getConFromConfig('frida');
    } catch (e) {
        return null;
    }
    if (!mysql)
        return null;
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS joyclub_vip (
        charac_no int(11) NOT NULL,
        quest int(11) NOT NULL DEFAULT 0,
        vip int(11) NOT NULL DEFAULT 0,
        PRIMARY KEY (charac_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    return mysql;
}

function _getOrInitUserVip(characNo) {
    if (!characNo)
        return 0;
    if (_vipCache.has(characNo))
        return _vipCache.get(characNo);

    const mysql = _ensureTable();
    if (!mysql)
        return 0;

    const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Int } = context.mysql.dbUtils;
    let vip = 0;
    if (api_MySQL_Exec_Safe(mysql, `SELECT vip FROM joyclub_vip WHERE charac_no = ${characNo};`)) {
        if (MySQL_Get_N_Rows(mysql) === 1 && MySQL_Fetch(mysql)) {
            vip = parseInt(api_MySQL_Get_Int(mysql, 0), 10) || 0;
        } else {
            api_MySQL_Exec_Safe(mysql, `INSERT IGNORE INTO joyclub_vip (charac_no, quest, vip) VALUES (${characNo}, 0, 0);`);
        }
    }
    _vipCache.set(characNo, vip);
    return vip;
}

function _setUserVip(characNo, questId, newVip) {
    const clampedVip = Math.min(_config.maxVipLevel, Math.max(0, newVip));
    _vipCache.set(characNo, clampedVip);
    const mysql = _ensureTable();
    if (!mysql)
        return;
    context.mysql.dbUtils.api_MySQL_Exec_Safe(
        mysql,
        `REPLACE INTO joyclub_vip (charac_no, quest, vip) VALUES (${characNo}, ${questId}, ${clampedVip});`
    );
}

function _broadcastVipLoginBanner(user, vip) {
    if (vip <= 0)
        return;

    const characName = context.utils.cuserCharacInfo.api_CUserCharacInfo_GetCurCharacName(user);
    let color = [158, 247, 69, 255];
    let symbol = 36;
    if (vip === 2) {
        color = [65, 118, 251, 255];
        symbol = 37;
    } else if (vip >= 3) {
        color = [250, 89, 0, 255];
        symbol = 38;
    }

    context.utils.gameWorldEx.api_GameWorld_SendHyperLinkChatMsg_Emoji([
        ['str', '欢迎尊贵的', [255, 255, 0, 255]],
        ['str', `[心悦${vip}]`, color],
        ['str', '玩家', [255, 255, 0, 255]],
        ['str', `[${characName}]`, color],
    ], 14, symbol);
}

module.exports = {
    init() {
        _initTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
            _initTimerId = null;
            _ensureTable();
        }, null, 200);
    },
    dispose() {
        context.system?.thread?.api_ClearScheduleDelay(_initTimerId);
        _initTimerId = null;
        _vipCache.clear();
    },
    hooks: [
        // 角色进入游戏世界时展示心悦会员上线横幅 (GameWorld::reach_game_world)
        {
            address: '0x86C4E50',
            onEnter(args) {
                this._jcLoginUser = args[1];
            },
            onLeave(retval) {
                const user = this._jcLoginUser;
                this._jcLoginUser = null;
                if (!user || user.isNull())
                    return;
                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                const vip = _getOrInitUserVip(characNo);
                if (vip >= 1) {
                    _broadcastVipLoginBanner(user, vip);
                }
            }
        },
        // 角色完成晋升任务时更新心悦 VIP 等级 (cHistoryTrace::operator())
        {
            address: '0x854F990',
            onEnter(args) {
                const historyLog = args[1].readUtf8String(-1);
                const group = historyLog.split(',');
                if (!group[13] || group[13].slice(1) !== 'QuestComplete')
                    return;

                const questId = parseInt(group[14], 10);
                if (!questId)
                    return;

                const accId = parseInt(group[1], 10);
                const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                if (!user || user.isNull())
                    return;

                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                const curVip = _getOrInitUserVip(characNo);
                let nextVip = curVip;

                if (Object.prototype.hasOwnProperty.call(_config.milestoneQuests, questId)) {
                    nextVip = Math.max(nextVip, _config.milestoneQuests[questId]);
                } else if (
                    Array.isArray(_config.incrementalQuestRange) &&
                    questId >= _config.incrementalQuestRange[0] &&
                    questId <= _config.incrementalQuestRange[1]
                ) {
                    nextVip = Math.min(_config.maxVipLevel, curVip + 1);
                }

                if (nextVip > curVip) {
                    _setUserVip(characNo, questId, nextVip);
                    const characName = context.utils.cuserCharacInfo.api_CUserCharacInfo_GetCurCharacName(user);
                    context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage(
                        `恭喜玩家[${characName}]成为尊贵的心悦vip${nextVip}`,
                        0
                    );
                }
            }
        }
    ]
};
