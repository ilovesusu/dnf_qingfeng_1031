/**
 * rank-notice.js
 * 战力榜上线播报（带悬赏称号，gmAuth有特殊表情）
 * 20250927 by Tim
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid,       // GM权限ID，用于权限验证（全局配置文件'frida_config.json'中设置）
    gmSymbolIndex: 58,                  // GM特殊表情
    vipAuth: context.config.vipCid,     // VIP用户数组，存储CID（全局配置文件'frida_config.json'中设置）
    dbName: 'd_starsky',                // 战力表所在的数据库名（偏爱：d_starsky，暴雨：d_baoyu）
    tableName: 'zhanli',                // 战力表表名（偏爱：zhanli，暴雨：zhanli）
    rankColName: 'ZLZ',                 // 战力表中战力的字段名（偏爱：ZLZ，暴雨：ZLZ）
    cidColName: 'CID',                  // 战力表中CID的字段名（偏爱：CID，暴雨：CID）

    topRankNotify: 9,                   // 设置战力榜前几名播报
    // 通知数组：[称号，raba，表情]
    notice: [
        ["仙尊", [128, 0, 128, 255], 57],           // 战力第一
        ["仙帝", [230, 200, 156, 255], 56],         // 战力第二
        ["仙君", [0, 128, 0, 255], 55],             // 战力第三
        ["玄仙", [0, 0, 128, 255], 54],             // 以此类推
        ["金仙", [0, 128, 128, 255], 53],
        ["天仙", [0, 136, 255, 255], 52],
        ["天仙", [0, 136, 255, 255], 51],
        ["天仙", [0, 136, 255, 255], 50],
        ["天仙", [0, 136, 255, 255], 49],
        ["天仙", [0, 136, 255, 255], 48]
    ]
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////
const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { getTimestamp } = context.system.time;

const { getConFromConfig } = context.mysql.dbConnector;

const {
    MySQL_Get_N_Rows,
    MySQL_Fetch,
    api_MySQL_Get_Str,

    api_MySQL_Exec_Safe } = context.mysql.dbUtils;

const { api_CUser_SendNotiPacketMessage } = context.utils.cuser;

const { CUserCharacInfo_GetCurCharacNo,
    api_CUserCharacInfo_GetCurCharacName } = context.utils.cuserCharacInfo;

const { api_GameWorld_SendHyperLinkChatMsg_Emoji,
    api_GameWorld_SendHyperLinkChatMsg_Multi_Emoji } = context.utils.gameWorldEx;



////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/**
 * 获得rank排名
 * 适配花枝战力值数据库，其他请按照实际表进行适配
 * @param {string} characno
 * @returns 返回对应的战力值
 */
function _getRankNumber(charac_no) {
    // 获取连接
    const mysql = getConFromConfig('taiwan_cain');
    if (!mysql)
        throw new Error("Database connection is not available.");
    var insertQuery = `
        SELECT rank FROM (
            SELECT @rank := @rank + 1 AS rank,
                ${_config.cidColName}
            FROM (SELECT @rank := 0) as rank_start, ${_config.dbName}.${_config.tableName}
            ORDER BY  ${_config.rankColName} DESC
        ) AS ranked WHERE  ${_config.cidColName} = '${charac_no}'
    `;
    if (api_MySQL_Exec_Safe(mysql, insertQuery)) {
        if (MySQL_Get_N_Rows(mysql) == 1) {
            MySQL_Fetch(mysql);
            return parseInt(api_MySQL_Get_Str(mysql, 0));
        }
    }
    return 0;
}

/** 生成战力排名通知 */
function _generateRankNotice(characNo, username, ranknum, bountyInfo) {
    // 获取排名数组索引
    let arrIndex = ranknum - 1;
    if (ranknum > _config.notice.length)// 如果排名超过维护的数组长度则选用最后一个
        arrIndex = _config.notice.length - 1;
    // 获取表情        
    let symbolIndex = 0;
    if (_config.gmAuth.includes(characNo))
        symbolIndex = 58;
    else
        symbolIndex = _config.notice[arrIndex][2];// 表情配置

    const noticeArray = [
        ['str', '恭迎', [255, 255, 0, 255]],
        ['str', '『' + _config.notice[arrIndex][0] + '』', _config.notice[arrIndex][1]],
        ['str', '玩家', [255, 255, 0, 255]],
        ['str', '[' + username + ']', _config.notice[arrIndex][1]]
    ];

    //悬赏称号
    if (bountyInfo)
        noticeArray.splice(3, 0, ['str', bountyInfo[0], bountyInfo[1]]);

    return { notice: noticeArray, symbol: symbolIndex };

}

/** 生成通用通知 */
function _generateCommonNotice(username, bountyInfo) {
    const noticeArray = [
        ['str', "玩家", [255, 255, 0, 255]],
        ['str', '【' + username + '】', [150, 255, 30, 255]],
        ['str', "上线了", [255, 255, 0, 255]]
    ];

    if (bountyInfo)
        noticeArray.splice(1, 0, ['str', bountyInfo[0], bountyInfo[1]]);


    return { notice: noticeArray, symbol: 0 };
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////


module.exports = {
    init() {
        context.userStatus = {};// 20251101 by Tim 这里初始一下userStatus对象，方面后面读取
    },
    dispose() { },
    hooks: [
        {
            address: '0x86C4E50',
            onEnter(args) {
                // 保存函数参数
                this.user = args[1];
                console.log('[GameWorld::reach_game_world] this.user=' + this.user);
            },
            onLeave(retval) {
                var charac_no = CUserCharacInfo_GetCurCharacNo(this.user);
                var username = api_CUserCharacInfo_GetCurCharacName(this.user);

                // 给角色发消息问候
                api_CUser_SendNotiPacketMessage(this.user, 'Hello ' + username + ': ' + getTimestamp(), 1);

                // 20251101 by Tim 初始化当前角色状态
                if (!context.userStatus[charac_no])
                    context.userStatus[charac_no] = {};

                // 检查悬赏
                let bountyInfo = null;
                if (context.userStatus[charac_no].bounty)
                    bountyInfo = context.userStatus[charac_no].bounty;

                let result = {};
                const ranknum = _getRankNumber(charac_no);
                if (ranknum && ranknum <= _config.topRankNotify) {
                    result = _generateRankNotice(charac_no, username, ranknum, bountyInfo);

                    // 前三名再加一个表情
                    const arrIndex = ranknum - 1;
                    if (arrIndex <= 2) {
                        let specialSymbolIndex = 75 - arrIndex;
                        api_GameWorld_SendHyperLinkChatMsg_Multi_Emoji([
                            ['str', '', [0, 0, 0, 255], specialSymbolIndex],
                            ...result.notice.map((item, index) => {
                                return [...item, index == 0 ? result.symbol : 0];
                            })
                        ], 14, 0);
                        return;
                    }
                } else
                    result = _generateCommonNotice(username, bountyInfo);

                api_GameWorld_SendHyperLinkChatMsg_Emoji(result.notice, 14, result.symbol);
            }

        }
    ]
};
