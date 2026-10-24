/**
 * cdk-redeem.js
 * 聊天输入口令码（CDK）领礼包 + 客户端获得物品弹窗系统
 * 功能：普通聊天频道输入预设口令码领取礼包，每账号每口令限领一次（持久化于 frida.account_reward），并发放客户端获得物品弹窗（协议 163）。
 */

var _config = {
    // 口令码礼包配置: 口令文本 -> [物品ID1, 数量1, 物品ID2, 数量2, ...]
    cdkRewards: {
        'tiankong': [8386, 1],
        'vip111': [3330, 300],
        'vip666': [122140005, 1, 36, 50],
        'vip888': [3330, 300],
        'vip999': [3209, 10, 4343, 10, 4176, 10, 4083, 10, 3037, 500],
        'fuli666': [1205, 2, 10096249, 10],
    }
};

const { log } = context.main;
const { WARN } = context.main.LOG_LEVELS;

let _initTimerId = null;

function _escapeSql(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS account_reward (
        user_no varchar(255) NOT NULL,
        msg mediumtext NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    return mysql;
}

function _redeemCdk(user, msg) {
    const rewardCfg = _config.cdkRewards[msg];
    if (!Array.isArray(rewardCfg) || rewardCfg.length < 2)
        return;

    const mysql = _ensureTable();
    if (!mysql) {
        log(WARN, `[${module.name}] frida DB connection unavailable.`);
        return;
    }

    const accId = context.utils.cuser.CUser_Get_Acc_Id(user);
    const safeAccId = _escapeSql(accId);
    const safeMsg = _escapeSql(msg);
    const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows } = context.mysql.dbUtils;

    if (!api_MySQL_Exec_Safe(mysql, `SELECT user_no FROM account_reward WHERE user_no = '${safeAccId}' AND msg = '${safeMsg}';`))
        return;

    if (MySQL_Get_N_Rows(mysql) > 0) {
        context.utils.cuser.api_CUser_SendNotiPacketMessage(user, '当前账号已经领取过这个奖励了，勇士请不要贪心哦!', 6);
        return;
    }

    const itemList = [];
    for (let i = 0; i + 1 < rewardCfg.length; i += 2) {
        const itemId = parseInt(rewardCfg[i], 10);
        const count = parseInt(rewardCfg[i + 1], 10);
        if (itemId > 0 && count > 0) {
            itemList.push([itemId, count]);
            const itemName = context.utils.citem.api_CItem_GetItemName(itemId) || itemId;
            context.utils.cuser.api_CUser_SendNotiPacketMessage(user, `恭喜您获得 ${itemName} ${count} 个`, 6);
        }
    }

    if (itemList.length > 0) {
        context.utils.cuserEx.api_CUser_AddItemListWithWindow(user, itemList);
        api_MySQL_Exec_Safe(mysql, `INSERT INTO account_reward (user_no, msg) VALUES ('${safeAccId}', '${safeMsg}');`);
    }
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
    },
    hooks: [
        // 监听普通聊天输入 CDK 口令码 (GameWorld::WriteLogChatMsg)
        {
            address: '0x086C9638',
            onEnter(args) {
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const reason = args[2].toInt32();
                if (reason !== 3)
                    return;
                const msg = (args[3].readUtf8String(-1) || '').trim();
                if (msg && Object.prototype.hasOwnProperty.call(_config.cdkRewards, msg)) {
                    _redeemCdk(user, msg);
                }
            }
        }
    ]
};
