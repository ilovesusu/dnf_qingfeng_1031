/**
 * rank-statue.js
 * 战力榜前三名城镇站街雕像展示
 */

/** 模块配置 */
var _config = {
    dbName: 'frida',            // 战力表所在的数据库名（本地花枝: frida，偏爱: d_starsky，暴雨: d_baoyu）
    tableName: 'battle',        // 战力表表名（本地花枝: battle，偏爱/暴雨: zhanli）
    rankColName: 'ZLZ',         // 战力字段名
    cidColName: 'CID',          // 角色ID字段名（RS为 ZID）
    broadcastOnLogin: true,     // 玩家上线时是否向全频道同步雕像数据（false 则仅发给当前上线玩家）
    persistToDb: true,          // 是否将前三名雕像数据持久化到 frida.game_event 表
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////

/** 默认战力榜前三名占位数据 */
let _rankList = {
    "1": {
        "rank": 100,
        "characname": "虚位以待",
        "job": 0,
        "lev": 85,
        "Grow": 17,
        "Guilkey": 1,
        "Guilname": "",
        "str": "111！",
        "equip": [101531433, 101551558, 101501731, 101571413, 101561697, 101521488, 101511859, 101541622, 0, -1, 101040146]
    },
    "2": {
        "rank": 90,
        "characname": "虚位以待",
        "job": 1,
        "lev": 85,
        "Grow": 17,
        "Guilkey": 1,
        "Guilname": "",
        "str": "222！",
        "equip": [45486, 43101, 44757, 43879, 43541, 44283, 45155, 45935, 0, -1, 102040100]
    },
    "3": {
        "rank": 80,
        "characname": "虚位以待",
        "job": 4,
        "lev": 85,
        "Grow": 17,
        "Guilkey": 1,
        "Guilname": "",
        "str": "333！",
        "equip": [57519, 55153, 56754, 55922, 55533, 56332, 57147, 57946, 0, -1, 108030043]
    }
};

let _initTimerId = null;

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

function _escapeSqlString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** 初始化并从 frida.game_event 加载已保存的前三名雕像数据 */
function _loadRankInfoFromDb() {
    if (!_config.persistToDb)
        return;
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

        if (api_MySQL_Exec_Safe(mysql, "SELECT event_info FROM game_event WHERE event_id = 'rankinfo';")) {
            if (MySQL_Get_N_Rows(mysql) === 1 && MySQL_Fetch(mysql)) {
                const info = api_MySQL_Get_Str(mysql, 0);
                if (info) {
                    _rankList = JSON.parse(info);
                }
            }
        }
    } catch (error) {
        log(WARN, `[${module.name}] Failed to load rankinfo from db: ${error}`);
    }
}

/** 将前三名雕像数据保存到 frida.game_event */
function _saveRankInfoToDb() {
    if (!_config.persistToDb)
        return;
    try {
        const mysql = context.mysql.dbConnector.getConFromConfig('frida');
        if (!mysql)
            return;
        const jsonStr = _escapeSqlString(JSON.stringify(_rankList));
        context.mysql.dbUtils.api_MySQL_Exec_Safe(
            mysql,
            `REPLACE INTO game_event (event_id, event_info) VALUES ('rankinfo', '${jsonStr}');`
        );
    } catch (error) {
        log(WARN, `[${module.name}] Failed to save rankinfo to db: ${error}`);
    }
}

/** 查询角色战力分数 */
function _getRankScore(characNo) {
    try {
        const mysql = context.mysql.dbConnector.getConFromConfig('taiwan_cain');
        if (!mysql)
            return 0;
        const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Str } = context.mysql.dbUtils;
        const sql = `SELECT ${_config.rankColName} FROM ${_config.dbName}.${_config.tableName} WHERE ${_config.cidColName}='${characNo}';`;
        if (api_MySQL_Exec_Safe(mysql, sql)) {
            if (MySQL_Get_N_Rows(mysql) === 1 && MySQL_Fetch(mysql)) {
                const val = parseInt(api_MySQL_Get_Str(mysql, 0), 10);
                return Number.isNaN(val) ? 0 : val;
            }
        }
    } catch (error) {
        log(WARN, `[${module.name}] Query battle score failed: ${error}`);
    }
    return 0;
}

/** 采集当前角色排行与时装外观信息 */
function _getMyEquipInfo(user) {
    const cinfo = context.utils.cuserCharacInfo;
    const cuser = context.utils.cuser;
    const cinven = context.utils.cinven;

    const characNo = cinfo.CUserCharacInfo_GetCurCharacNo(user);
    const rankScore = _getRankScore(characNo);
    let guildName = cuser.api_CUser_GetGuildName(user);
    if (!guildName) {
        guildName = '未加入公会';
    }

    const myInfo = {
        rank: rankScore,
        characname: cinfo.api_CUserCharacInfo_GetCurCharacName(user) + '',
        job: cinfo.CUserCharacInfo_Get_Charac_Job(user),
        lev: cinfo.CUserCharacInfo_Get_Charac_Level(user),
        Grow: cinfo.CUserCharacInfo_GetCurCharacGrowType(user),
        Guilkey: cinfo.CUserCharacInfo_Get_Charac_GuildKey(user),
        Guilname: guildName,
        str: '',
        equip: []
    };

    const invenW = cinfo.CUserCharacInfo_GetCurCharacInvenW(user);
    for (let i = 0; i <= 10; i++) {
        if (i !== 9) {
            const invenItem = cinven.CInventory_GetInvenRef(invenW, cinven.INVENTORY_TYPE.INVENTORY_TYPE_BODY, i);
            const itemId = cinven.Inven_Item_GetKey(invenItem);
            myInfo.equip.push(itemId);
        } else {
            myInfo.equip.push(-1);
        }
    }
    return myInfo;
}

/** 玩家下线时更新前三名榜单 */
function _updateRanking(user) {
    const myInfo = _getMyEquipInfo(user);
    if (!myInfo.rank)
        return;

    const existingIndex = Object.values(_rankList).findIndex(item => item.characname === myInfo.characname);
    if (existingIndex !== -1) {
        _rankList[(existingIndex + 1).toString()] = myInfo;
    } else {
        _rankList["4"] = myInfo;
    }

    const rankArray = Object.values(_rankList);
    rankArray.sort((a, b) => b.rank - a.rank);

    const topThree = rankArray.slice(0, 3);
    const nextRankList = {};
    topThree.forEach((item, index) => {
        nextRankList[(index + 1).toString()] = item;
    });
    _rankList = nextRankList;
    _saveRankInfoToDb();
}

/** 下发 182 号站街雕像协议包 */
function _sendRankList(user, broadcastAll) {
    const pkt = context.system.packet;
    const packetGuard = pkt.api_PacketGuard_PacketGuard();
    try {
        pkt.InterfacePacketBuf_Put_Header(packetGuard, 0, 182);
        pkt.InterfacePacketBuf_Put_Byte(packetGuard, Object.keys(_rankList).length);
        for (const key in _rankList) {
            if (Object.prototype.hasOwnProperty.call(_rankList, key)) {
                const entry = _rankList[key];
                pkt.api_InterfacePacketBuf_Put_String(packetGuard, entry.characname);
                pkt.InterfacePacketBuf_Put_Byte(packetGuard, entry.lev);
                pkt.InterfacePacketBuf_Put_Byte(packetGuard, entry.job);
                pkt.InterfacePacketBuf_Put_Byte(packetGuard, entry.Grow);
                pkt.api_InterfacePacketBuf_Put_String(packetGuard, entry.Guilname);
                pkt.InterfacePacketBuf_Put_Int(packetGuard, entry.Guilkey);
                for (let i = 0; i < entry.equip.length; i++) {
                    const itemId = (i !== 9) ? entry.equip[i] : -1;
                    pkt.InterfacePacketBuf_Put_Int(packetGuard, itemId);
                }
            }
        }
        pkt.InterfacePacketBuf_Finalize(packetGuard, 1);
        if (broadcastAll) {
            context.utils.gameWorld.api_GameWorld_Send_All(packetGuard);
        } else if (user && !user.isNull()) {
            context.utils.cuser.CUser_Send(user, packetGuard);
        }
    } finally {
        pkt.Destroy_PacketGuard_PacketGuard(packetGuard);
    }
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    init() {
        _initTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(_loadRankInfoFromDb, null, 150);
    },
    dispose() {
        context.system?.thread?.api_ClearScheduleDelay(_initTimerId);
        _initTimerId = null;
    },
    hooks: [
        // 角色进入游戏世界：下发站街雕像数据（GameWorld::reach_game_world）
        {
            address: '0x86C4E50',
            onEnter(args) {
                this._rsUser = args[1];
            },
            onLeave(retval) {
                if (this._rsUser && !this._rsUser.isNull()) {
                    context.system.thread.api_ScheduleOnMainThread(_sendRankList, [this._rsUser, _config.broadcastOnLogin]);
                }
            }
        },
        // 角色离开游戏世界：结算更新战力榜（GameWorld::leave_game_world）
        {
            address: '0x86C5288',
            onEnter(args) {
                const user = args[1];
                if (user && !user.isNull()) {
                    _updateRanking(user);
                }
            }
        }
    ]
};
