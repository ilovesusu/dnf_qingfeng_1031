/**
 * sp-tp-return.js
 * 洗点自动邮件返还已吃过的 SP/TP 技能书
 * 功能：
 *  1. 监听 CUser::increase_status(short) 记录角色使用过的 SP 技能书（1031/1038）与 TP 技能书（1204/1205）到 frida.init_sp_tp；
 *  2. 监听玩家触发洗点（CP / SkillInit 事件）时，自动通过系统邮件全额返还累计使用过的 SP/TP 技能书并清空当轮计数。
 */

var _config = {
    spBookItemIds: [1031, 1038],        // SP 技能书道具 ID 列表
    tpBookItemIds: [1204, 1205],        // TP 技能书道具 ID 列表
    spMailTitle: 'SP书补偿邮件',
    spMailText: '这是您累计用过的所有SP技能书，请注意查收！',
    tpMailTitle: 'TP书补偿邮件',
    tpMailText: '这是您累计用过的所有TP技能书，请注意查收！',
};

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
    context.mysql.dbUtils.api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS init_sp_tp (
        id int NOT NULL AUTO_INCREMENT,
        charac_no varchar(255) NULL,
        sp_item text NULL,
        tp_item text NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    return mysql;
}

function _buildDefaultFlatList(ids) {
    const res = [];
    for (const id of ids) {
        res.push(id, 0);
    }
    return res;
}

function _incrementFlatList(flatList, targetId, addCnt) {
    let found = false;
    for (let i = 0; i + 1 < flatList.length; i += 2) {
        if (flatList[i] === targetId) {
            flatList[i + 1] = (parseInt(flatList[i + 1], 10) || 0) + addCnt;
            found = true;
            break;
        }
    }
    if (!found) {
        flatList.push(targetId, addCnt);
    }
}

/** 记录角色吃过的一本 SP 或 TP 技能书 */
function _recordBookUsage(characNo, spItemId, tpItemId) {
    const mysql = _ensureTable();
    if (!mysql || !characNo)
        return;

    const safeCharac = _escapeSql(characNo);
    const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Int, api_MySQL_Get_Str } = context.mysql.dbUtils;

    if (!api_MySQL_Exec_Safe(mysql, `SELECT id, charac_no, sp_item, tp_item FROM init_sp_tp WHERE charac_no = '${safeCharac}';`))
        return;

    if (MySQL_Get_N_Rows(mysql) >= 1 && MySQL_Fetch(mysql)) {
        const id = api_MySQL_Get_Int(mysql, 0);
        let spArr = _buildDefaultFlatList(_config.spBookItemIds);
        let tpArr = _buildDefaultFlatList(_config.tpBookItemIds);
        try {
            const sJson = api_MySQL_Get_Str(mysql, 2);
            if (sJson) spArr = JSON.parse(sJson);
            const tJson = api_MySQL_Get_Str(mysql, 3);
            if (tJson) tpArr = JSON.parse(tJson);
        } catch (e) {
            // 解析异常则回退默认数组
        }

        if (spItemId) _incrementFlatList(spArr, spItemId, 1);
        if (tpItemId) _incrementFlatList(tpArr, tpItemId, 1);

        const spStr = _escapeSql(JSON.stringify(spArr));
        const tpStr = _escapeSql(JSON.stringify(tpArr));
        api_MySQL_Exec_Safe(mysql, `REPLACE INTO init_sp_tp (id, charac_no, sp_item, tp_item) VALUES (${id}, '${safeCharac}', '${spStr}', '${tpStr}');`);
    } else {
        const spArr = _buildDefaultFlatList(_config.spBookItemIds);
        const tpArr = _buildDefaultFlatList(_config.tpBookItemIds);
        if (spItemId) _incrementFlatList(spArr, spItemId, 1);
        if (tpItemId) _incrementFlatList(tpArr, tpItemId, 1);

        const spStr = _escapeSql(JSON.stringify(spArr));
        const tpStr = _escapeSql(JSON.stringify(tpArr));
        api_MySQL_Exec_Safe(mysql, `INSERT INTO init_sp_tp (charac_no, sp_item, tp_item) VALUES ('${safeCharac}', '${spStr}', '${tpStr}');`);
    }
}

/** 洗点时查询并邮件返还全部累计 SP / TP 书 */
function _refundSpTpBooks(user) {
    const mysql = _ensureTable();
    if (!mysql)
        return;

    const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
    if (!characNo)
        return;

    const safeCharac = _escapeSql(characNo);
    const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Str } = context.mysql.dbUtils;

    if (!api_MySQL_Exec_Safe(mysql, `SELECT id, charac_no, sp_item, tp_item FROM init_sp_tp WHERE charac_no = '${safeCharac}';`))
        return;
    if (MySQL_Get_N_Rows(mysql) === 0 || !MySQL_Fetch(mysql))
        return;

    let spArr = [];
    let tpArr = [];
    try {
        spArr = JSON.parse(api_MySQL_Get_Str(mysql, 2) || '[]');
        tpArr = JSON.parse(api_MySQL_Get_Str(mysql, 3) || '[]');
    } catch (e) {
        return;
    }

    api_MySQL_Exec_Safe(mysql, `DELETE FROM init_sp_tp WHERE charac_no = '${safeCharac}';`);

    let refunded = false;

    // 返还 SP 技能书（多附件一封邮件）
    const spMailItems = [];
    for (let i = 0; i + 1 < spArr.length; i += 2) {
        const itemId = parseInt(spArr[i], 10);
        const count = parseInt(spArr[i + 1], 10);
        if (itemId > 0 && count > 0) {
            spMailItems.push([itemId, count]);
        }
    }
    if (spMailItems.length > 0) {
        context.utils.cuserEx.api_SendSystemMultiMail(characNo, _config.spMailTitle, _config.spMailText, 0, spMailItems);
        refunded = true;
    }

    // 返还 TP 技能书（TP书单格不可叠加时逐本发邮件，确保不超堆叠上限）
    for (let i = 0; i + 1 < tpArr.length; i += 2) {
        const itemId = parseInt(tpArr[i], 10);
        const count = parseInt(tpArr[i + 1], 10);
        if (itemId > 0 && count > 0) {
            for (let k = 0; k < count; k++) {
                context.utils.cuserEx.api_SendSystemMultiMail(characNo, _config.tpMailTitle, _config.tpMailText, 0, [[itemId, 1]]);
            }
            refunded = true;
        }
    }

    if (refunded) {
        context.utils.cuser.api_CUser_SendNotiPacketMessage(user, '系统通知：洗点成功，您累计使用过的 SP/TP 技能书已通过邮件全额返还，请查收邮箱！', 1);
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
        // CUser::increase_status(short) (0x086657FC)：捕获使用 SP/TP 技能书
        {
            address: '0x086657FC',
            onEnter(args) {
                this._spCharacNo = 0;
                this._spBookId = 0;
                this._tpBookId = 0;

                const user = args[0];
                if (!user || user.isNull())
                    return;

                const slot = args[1].toInt32();
                const invenR = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacInvenR(user);
                if (!invenR || invenR.isNull())
                    return;

                const itemRef = context.utils.cinven.CInventory_GetInvenRef(invenR, 1, slot);
                if (!itemRef || itemRef.isNull())
                    return;

                const itemId = context.utils.cinven.Inven_Item_GetKey(itemRef);
                if (_config.spBookItemIds.includes(itemId)) {
                    this._spCharacNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                    this._spBookId = itemId;
                } else if (_config.tpBookItemIds.includes(itemId)) {
                    this._spCharacNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                    this._tpBookId = itemId;
                }
            },
            onLeave(retval) {
                if (this._spCharacNo && (this._spBookId || this._tpBookId)) {
                    _recordBookUsage(this._spCharacNo, this._spBookId, this._tpBookId);
                    this._spCharacNo = 0;
                    this._spBookId = 0;
                    this._tpBookId = 0;
                }
            }
        },
        // cHistoryTrace::operator() (0x854F990)：捕获洗点事件 CP / SkillInit
        {
            address: '0x854F990',
            onEnter(args) {
                const historyLog = args[1].readUtf8String(-1);
                const group = historyLog.split(',');
                if (!group[13])
                    return;
                const gameEvent = group[13].slice(1);
                if (gameEvent !== 'CP' && gameEvent !== 'SkillInit')
                    return;

                const accId = parseInt(group[1], 10);
                const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                if (!user || user.isNull())
                    return;

                _refundSpTpBooks(user);
            }
        }
    ]
};
