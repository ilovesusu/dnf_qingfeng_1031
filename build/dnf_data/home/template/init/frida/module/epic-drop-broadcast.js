/**
 * epic-drop-broadcast.js
 * 史诗掉落超链接彩色播报、深渊“多黄”连爆大奖与每日首爆系统
 * 功能：
 *  1. 副本掉落拾取史诗（reason=4, rarity=4）即时全服超链接高亮播报；
 *  2. 副本结算汇总本局爆出的全部史诗（可点击查看属性），2黄~10黄+ 发放阶梯点券与深渊票/无色大奖并弹窗；
 *  3. 每日随机 50 件史诗首爆奖池（持久化于 frida.first_drop_pool / first_drop_claimed）：
 *     全服每日首位爆出池内史诗的玩家额外斩获首爆点券与道具大奖；
 *     聊天输入“查询首爆”查看今日首爆进度；GM 输入 //resetfirstdrop 手动刷新今日首爆池。
 */

var _config = {
    gmAuth: context.config.gmCid,

    enableSingleDropBroadcast: true,    // 单件史诗拾取即时彩色超链接播报
    enableClearSummaryBroadcast: true,  // 副本结算史诗汇总超链接播报
    enableMultiEpicReward: true,        // 2黄~10黄+ 多黄连爆阶梯奖励

    multiEpicCeraPerCount: 666,         // 多黄每件史诗折算点券基数（如 2黄=1332，3黄=1998...）
    multiEpicInviteItemId: 3330,        // 多黄奖励道具ID（3330=深渊派对邀请函）
    multiEpicInviteStepCount: 5,        // 多黄奖励邀请函阶梯基数

    // 每日史诗首爆配置
    firstDrop: {
        enabled: true,
        poolSize: 50,                   // 每日随机抽取首爆史诗数量
        minEquipLevel: 45,              // 自动扫描 PVF 史诗装备的最低穿戴等级
        scanIdRanges: [                 // 自动扫描 PVF 装备 ID 区间（无外部 JSON 时自动构建奖池）
            [10000, 60000],
            [100000, 150000],
        ],
        externalJsonPath: '',           // 可选外部首爆配置文件路径（如 '/plugins/frida/month_card_equip_gifts.json'，留空自动扫描 PVF）
        defaultRewardCera: 188,         // 默认每件首爆奖励点券
        defaultRewardItems: [           // 默认每件首爆奖励道具列表
            [3330, 20],
            [3037, 200],
        ],
        resetHourUtc: 16,               // 每日自动刷新首爆时间（UTC 16点 = 北京时间 00:00）
        resetCmd: 'resetfirstdrop',     // GM 手动重置首爆指令: //resetfirstdrop
    }
};

const { log, readFile } = context.main;
const { INFO, WARN } = context.main.LOG_LEVELS;

const MULTI_EPIC_TITLES = {
    2: { title: '二龙戏珠', color: [255, 255, 0, 255] },
    3: { title: '三羊开泰', color: [128, 255, 250, 255] },
    4: { title: '四喜临门', color: [255, 80, 80, 255] },
    5: { title: '五福临门', color: [255, 2, 180, 255] },
    6: { title: '六六大顺', color: [255, 140, 0, 255] },
    7: { title: '七星高照', color: [158, 247, 69, 255] },
    8: { title: '千载难逢', color: [65, 118, 251, 255] },
    9: { title: '万中无一', color: [255, 0, 240, 255] },
    10: { title: '披靡众生', color: [255, 50, 50, 255] },
};

// 记录每位角色单次副本内拾取的史诗: characNo -> { dgnId, dgnName, items: Map<itemId, count> }
const _runEpicRecords = new Map();

// 今日首爆内存态缓存
let _firstDropPool = {};        // itemId -> { cera: number, items: [[id, cnt], ...] }
let _firstDropClaimed = {};     // itemId -> { characNo, characName, claimTime }
let _cachedPvfEpics = null;

let _initTimerId = null;
let _dailyResetTimerId = null;

function _escapeSql(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _todayDateStr() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _formatDateTime(tsMs) {
    const d = new Date(tsMs);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function _ensureTables() {
    let mysql = null;
    try {
        mysql = context.mysql.dbConnector.getConFromConfig('frida');
    } catch (e) {
        return null;
    }
    if (!mysql)
        return null;
    const { api_MySQL_Exec_Safe } = context.mysql.dbUtils;
    api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS first_drop_pool (
        pool_date varchar(16) NOT NULL,
        pool_json mediumtext NOT NULL,
        PRIMARY KEY (pool_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    api_MySQL_Exec_Safe(mysql, `CREATE TABLE IF NOT EXISTS first_drop_claimed (
        pool_date varchar(16) NOT NULL,
        item_id int NOT NULL,
        charac_no int NOT NULL,
        charac_name varchar(64) NOT NULL,
        claim_ts bigint NOT NULL,
        PRIMARY KEY (pool_date, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    return mysql;
}

/** 扫描 PVF 或读取外部 JSON 获取候选史诗池 */
function _collectCandidateEpics() {
    // 1. 若存在外部 JSON 配置则优先解析
    if (_config.firstDrop.externalJsonPath) {
        try {
            const raw = readFile(_config.firstDrop.externalJsonPath, 'r', 4 * 1024 * 1024);
            if (raw) {
                const parsed = JSON.parse(raw);
                const keys = Object.keys(parsed);
                if (keys.length > 0) {
                    return { fromJson: true, map: parsed };
                }
            }
        } catch (e) {
            // 忽略缺失文件，自动走 PVF 扫描
        }
    }

    // 2. 自动扫描 PVF 中的史诗装备（仅首次扫描后缓存）
    if (!_cachedPvfEpics) {
        _cachedPvfEpics = [];
        const cdata = context.utils.cdataManager;
        const citem = context.utils.citem;
        const dm = cdata.G_CDataManager();
        const findItem = cdata.CDataManager_Find_Item;
        const minLv = _config.firstDrop.minEquipLevel || 45;
        if (dm && !dm.isNull()) {
            for (const [startId, endId] of _config.firstDrop.scanIdRanges) {
                for (let id = startId; id <= endId; id++) {
                    const ptrItem = findItem(dm, id);
                    if (!ptrItem || ptrItem.isNull())
                        continue;
                    if (citem.CItem_Is_Stackable(ptrItem))
                        continue;
                    if (citem.CItem_GetRarity(ptrItem) !== 4)
                        continue;
                    if (citem.CItem_GetUsableLevel(ptrItem) < minLv)
                        continue;
                    _cachedPvfEpics.push(id);
                }
            }
        }
        log(INFO, `[${module.name}] Scanned PVF candidate epics: ${_cachedPvfEpics.length}.`);
    }
    return { fromJson: false, list: _cachedPvfEpics };
}

/** 生成新一期 50 件今日首爆奖池并写入数据库 */
function _generateNewFirstDropPool(forceDateStr = null) {
    const mysql = _ensureTables();
    const dateStr = forceDateStr || _todayDateStr();
    _firstDropPool = {};
    _firstDropClaimed = {};

    const candidates = _collectCandidateEpics();
    const poolSize = _config.firstDrop.poolSize || 50;

    if (candidates.fromJson) {
        const keys = Object.keys(candidates.map);
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        const pickCnt = Math.min(poolSize, keys.length);
        for (let i = 0; i < pickCnt; i++) {
            const k = keys[i];
            const val = candidates.map[k];
            if (Array.isArray(val)) {
                // 兼容 [itemId, count] 或 [[id, cnt], ...]
                const items = Array.isArray(val[0]) ? val : [[parseInt(val[0], 10) || 3037, parseInt(val[1], 10) || 1]];
                _firstDropPool[k] = { cera: _config.firstDrop.defaultRewardCera, items };
            } else if (val && typeof val === 'object') {
                _firstDropPool[k] = {
                    cera: val.cera ?? _config.firstDrop.defaultRewardCera,
                    items: val.items ?? _config.firstDrop.defaultRewardItems
                };
            } else {
                _firstDropPool[k] = {
                    cera: _config.firstDrop.defaultRewardCera,
                    items: _config.firstDrop.defaultRewardItems
                };
            }
        }
    } else {
        const arr = [...candidates.list];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const pickCnt = Math.min(poolSize, arr.length);
        for (let i = 0; i < pickCnt; i++) {
            _firstDropPool[arr[i]] = {
                cera: _config.firstDrop.defaultRewardCera,
                items: _config.firstDrop.defaultRewardItems
            };
        }
    }

    if (mysql) {
        const { api_MySQL_Exec_Safe } = context.mysql.dbUtils;
        api_MySQL_Exec_Safe(mysql, `DELETE FROM first_drop_pool WHERE pool_date <> '${_escapeSql(dateStr)}';`);
        api_MySQL_Exec_Safe(mysql, `DELETE FROM first_drop_claimed;`);
        const jsonStr = _escapeSql(JSON.stringify(_firstDropPool));
        api_MySQL_Exec_Safe(mysql, `REPLACE INTO first_drop_pool (pool_date, pool_json) VALUES ('${_escapeSql(dateStr)}', '${jsonStr}');`);
    }
    log(INFO, `[${module.name}] Generated daily first-drop pool for ${dateStr} (${Object.keys(_firstDropPool).length} items).`);
}

/** 启动时从数据库恢复今日首爆池与领取记录（不存在则自动初始化） */
function _loadOrInitFirstDropFromDb() {
    if (!_config.firstDrop.enabled)
        return;

    const mysql = _ensureTables();
    const dateStr = _todayDateStr();
    if (!mysql) {
        _generateNewFirstDropPool(dateStr);
        return;
    }

    const { api_MySQL_Exec_Safe, MySQL_Get_N_Rows, MySQL_Fetch, api_MySQL_Get_Str, api_MySQL_Get_Int } = context.mysql.dbUtils;
    let loaded = false;
    if (api_MySQL_Exec_Safe(mysql, `SELECT pool_json FROM first_drop_pool WHERE pool_date = '${_escapeSql(dateStr)}';`)) {
        if (MySQL_Get_N_Rows(mysql) === 1 && MySQL_Fetch(mysql)) {
            const jsonStr = api_MySQL_Get_Str(mysql, 0);
            if (jsonStr) {
                try {
                    _firstDropPool = JSON.parse(jsonStr);
                    loaded = Object.keys(_firstDropPool).length > 0;
                } catch (e) {
                    loaded = false;
                }
            }
        }
    }

    if (!loaded) {
        _generateNewFirstDropPool(dateStr);
        return;
    }

    _firstDropClaimed = {};
    if (api_MySQL_Exec_Safe(mysql, `SELECT item_id, charac_no, charac_name, claim_ts FROM first_drop_claimed WHERE pool_date = '${_escapeSql(dateStr)}';`)) {
        const rows = MySQL_Get_N_Rows(mysql);
        for (let i = 0; i < rows; i++) {
            if (MySQL_Fetch(mysql)) {
                const itemId = api_MySQL_Get_Int(mysql, 0);
                const characNo = api_MySQL_Get_Int(mysql, 1);
                const characName = api_MySQL_Get_Str(mysql, 2) || '';
                const claimTs = parseInt(api_MySQL_Get_Str(mysql, 3) || '0', 10);
                _firstDropClaimed[itemId] = { characNo, characName, claimTs };
            }
        }
    }
}

function _scheduleNextFirstDropReset() {
    if (!_config.firstDrop.enabled)
        return;
    const curSec = context.system.time.api_CSystemTime_getCurSec();
    let delaySec = (3600 * _config.firstDrop.resetHourUtc) - (curSec % (3600 * 24));
    if (delaySec <= 0) {
        delaySec += 3600 * 24;
    }
    context.system.thread.api_ClearScheduleDelay(_dailyResetTimerId);
    _dailyResetTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
        _dailyResetTimerId = null;
        _generateNewFirstDropPool();
        context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage('<每日首爆> 今日 50 件史诗首爆奖池已刷新！聊天输入“查询首爆”可查看名单！', 14);
        _scheduleNextFirstDropReset();
    }, null, delaySec * 1000);
}

/** 检查并发放今日史诗首爆大奖 */
function _checkAndGrantFirstDrop(user, characNo, characName, itemId) {
    if (!_config.firstDrop.enabled)
        return;
    if (!Object.prototype.hasOwnProperty.call(_firstDropPool, itemId))
        return;
    if (Object.prototype.hasOwnProperty.call(_firstDropClaimed, itemId))
        return;

    const nowMs = Date.now();
    _firstDropClaimed[itemId] = { characNo, characName, claimTs: nowMs };

    const mysql = _ensureTables();
    if (mysql) {
        const dateStr = _escapeSql(_todayDateStr());
        const safeName = _escapeSql(characName);
        context.mysql.dbUtils.api_MySQL_Exec_Safe(
            mysql,
            `REPLACE INTO first_drop_claimed (pool_date, item_id, charac_no, charac_name, claim_ts) VALUES ('${dateStr}', ${itemId}, ${characNo}, '${safeName}', ${nowMs});`
        );
    }

    const rewardCfg = _firstDropPool[itemId];
    const cera = rewardCfg.cera || 0;
    const items = Array.isArray(rewardCfg.items) ? rewardCfg.items : [];

    if (cera > 0) {
        context.utils.cuser.api_Recharge_Cash_Cera(user, cera);
    }
    if (items.length > 0) {
        context.utils.cuserEx.api_CUser_AddItemListWithWindow(user, items);
    }

    context.utils.gameWorldEx.api_GameWorld_SendHyperLinkChatMsg_Emoji([
        ['str', '【今日首爆】恭喜玩家 ', [255, 255, 0, 255]],
        ['str', `[${characName}]`, [255, 0, 255, 255]],
        ['str', ' 全服首位爆出首爆史诗 ', [255, 255, 0, 255]],
        ['item', itemId, [255, 170, 0, 255]],
        ['str', ` 额外斩获首爆大奖：${cera}点券！`, [158, 247, 69, 255]],
    ], 14, 35);
}

/** 玩家聊天输入“查询首爆” */
function _handleQueryFirstDrop(user) {
    const keys = Object.keys(_firstDropPool);
    if (keys.length === 0) {
        context.utils.cuser.api_CUser_SendNotiPacketMessage(user, '今日首爆奖池暂未生成或未启用。', 2);
        return;
    }
    const citem = context.utils.citem;
    const sendMsg = context.utils.cuser.api_CUser_SendNotiPacketMessage;
    const claimedCnt = Object.keys(_firstDropClaimed).length;
    sendMsg(user, `====== 今日史诗首爆名单 (已领 ${claimedCnt}/${keys.length}) ======`, 8);
    for (const k of keys) {
        const itemId = parseInt(k, 10);
        const name = citem.api_CItem_GetItemName(itemId) || itemId;
        const claim = _firstDropClaimed[itemId];
        if (!claim) {
            sendMsg(user, `[${name}] -> 今日首爆未领取`, 2);
        } else {
            sendMsg(user, `[${name}] -> 已被 [${claim.characName}] 领取 (${_formatDateTime(claim.claimTs)})`, 1);
        }
    }
}

/** 副本通关/退出时汇总本局爆出的史诗并发放多黄连爆奖励 */
function _onDungeonClearSummary(user, characNo) {
    const rec = _runEpicRecords.get(characNo);
    _runEpicRecords.delete(characNo);
    if (!rec || rec.items.size === 0)
        return;

    let totalEpicCount = 0;
    for (const cnt of rec.items.values()) {
        totalEpicCount += cnt;
    }
    if (totalEpicCount <= 0)
        return;

    const characName = context.utils.cuserCharacInfo.api_CUserCharacInfo_GetCurCharacName(user);
    const dgnName = rec.dgnName || (rec.dgnId ? context.utils.cdungeon.api_CDungeon_GetDungeonName(rec.dgnId) : '地下城');
    const sendWorldLink = context.utils.gameWorldEx.api_GameWorld_SendHyperLinkChatMsg_Emoji;

    if (_config.enableClearSummaryBroadcast) {
        sendWorldLink([
            ['str', '恭喜玩家 ： ', [255, 2, 180, 255]],
            ['str', `[${characName}]`, [255, 0, 255, 255]],
            ['str', ' 在 ', [255, 255, 0, 255]],
            ['str', `[${dgnName}]`, [255, 0, 128, 255]],
        ], 14, 0);

        let first = true;
        for (const [itemId, cnt] of rec.items.entries()) {
            sendWorldLink([
                ['str', first ? '爆出 ： ' : '   - ', first ? [194, 63, 179, 255] : [255, 255, 0, 255]],
                ['item', itemId, [255, 170, 0, 255]],
                ['str', ` x${cnt}`, [255, 255, 0, 255]],
            ], 14, 0);
            first = false;
        }
    }

    // 多黄阶梯奖励（2黄 ~ 10黄+）
    if (_config.enableMultiEpicReward && totalEpicCount >= 2) {
        const tierKey = Math.min(10, totalEpicCount);
        const tierMeta = MULTI_EPIC_TITLES[tierKey];
        const bonusCera = totalEpicCount * _config.multiEpicCeraPerCount;
        const bonusInviteCnt = (totalEpicCount - 1) * _config.multiEpicInviteStepCount;
        const bonusCubeCnt = totalEpicCount * 10;

        sendWorldLink([
            ['str', `----------↑↑${tierMeta.title}(${totalEpicCount}黄)奖励↑↑----------奖励 `, tierMeta.color],
            ['str', `${bonusCera}`, [255, 255, 255, 255]],
            ['str', ' 点券 + ', [255, 255, 0, 255]],
            ['item', _config.multiEpicInviteItemId, [255, 170, 0, 255]],
            ['str', ` x${bonusInviteCnt}`, [255, 255, 0, 255]],
        ], 14, 0);

        if (bonusCera > 0) {
            context.utils.cuser.api_Recharge_Cash_Cera(user, bonusCera);
        }
        const rewardList = [];
        if (bonusInviteCnt > 0) {
            rewardList.push([_config.multiEpicInviteItemId, bonusInviteCnt]);
        }
        if (bonusCubeCnt > 0) {
            rewardList.push([3037, bonusCubeCnt]);
        }
        if (rewardList.length > 0) {
            context.utils.cuserEx.api_CUser_AddItemListWithWindow(user, rewardList);
        }
    }
}

function _registerGmHelp() {
    if (!context.gmHelpRegistry || !_config.firstDrop.enabled) {
        if (!context.gmHelpRegistry) {
            context.gmHelpRegistry = new Map();
        }
    }
    if (_config.firstDrop.enabled) {
        context.gmHelpRegistry.set(_config.firstDrop.resetCmd, {
            cmd: _config.firstDrop.resetCmd,
            params: '',
            desc: '重置并重新抽取今日50件史诗首爆奖池',
            moduleName: module.name
        });
    }
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
        _registerGmHelp();
        _initTimerId = context.system.thread.api_ScheduleOnMainThread_Delay(() => {
            _initTimerId = null;
            _loadOrInitFirstDropFromDb();
            _scheduleNextFirstDropReset();
        }, null, 250);
    },
    dispose() {
        context.system?.thread?.api_ClearScheduleDelay(_initTimerId);
        context.system?.thread?.api_ClearScheduleDelay(_dailyResetTimerId);
        _initTimerId = null;
        _dailyResetTimerId = null;
        _runEpicRecords.clear();
        _unregisterGmHelp();
    },
    hooks: [
        // 监听进图、史诗拾取与通关结算日志 (cHistoryTrace::operator())
        {
            address: '0x854F990',
            onEnter(args) {
                const historyLog = args[1].readUtf8String(-1);
                const group = historyLog.split(',');
                if (!group[13])
                    return;
                const gameEvent = group[13].slice(1);

                if (gameEvent !== 'DungeonEnter' && gameEvent !== 'Item+' && gameEvent !== 'DungeonClearInfo')
                    return;

                const accId = parseInt(group[1], 10);
                const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                if (!user || user.isNull())
                    return;

                const cinfo = context.utils.cuserCharacInfo;
                const cdungeon = context.utils.cdungeon;
                const characNo = cinfo.CUserCharacInfo_GetCurCharacNo(user);

                if (gameEvent === 'DungeonEnter') {
                    const dgnId = cdungeon.CDungeon_GetDungeonIdxAfterClear(user);
                    const dgnName = (group[14] || '').replace(/"/g, '') || cdungeon.api_CDungeon_GetDungeonName(dgnId);
                    _runEpicRecords.set(characNo, { dgnId, dgnName, items: new Map() });
                    return;
                }

                if (gameEvent === 'Item+') {
                    const reason = parseInt(group[18], 10);
                    if (reason !== 4)
                        return;
                    const itemId = parseInt(group[15], 10);
                    const itemData = context.utils.cdataManager.api_CDataManager_Find_Item(itemId);
                    if (!itemData || itemData.isNull())
                        return;
                    const rarity = context.utils.citem.CItem_GetRarity(itemData);
                    if (rarity !== 4)
                        return;

                    let rec = _runEpicRecords.get(characNo);
                    if (!rec) {
                        const dgnId = cdungeon.CDungeon_GetDungeonIdxAfterClear(user);
                        rec = { dgnId, dgnName: cdungeon.api_CDungeon_GetDungeonName(dgnId), items: new Map() };
                        _runEpicRecords.set(characNo, rec);
                    }
                    rec.items.set(itemId, (rec.items.get(itemId) || 0) + 1);

                    const characName = cinfo.api_CUserCharacInfo_GetCurCharacName(user);
                    if (_config.enableSingleDropBroadcast) {
                        context.utils.gameWorldEx.api_GameWorld_SendHyperLinkChatMsg_Emoji([
                            ['str', '欧皇降临！玩家 ', [255, 255, 0, 255]],
                            ['str', `[${characName}]`, [255, 0, 255, 255]],
                            ['str', ` 在 [${rec.dgnName}] 中获得了 `, [255, 255, 0, 255]],
                            ['item', itemId, [255, 170, 0, 255]],
                            ['str', ' x1！', [255, 255, 0, 255]],
                        ], 14, 0);
                    }

                    _checkAndGrantFirstDrop(user, characNo, characName, itemId);
                    return;
                }

                if (gameEvent === 'DungeonClearInfo') {
                    _onDungeonClearSummary(user, characNo);
                }
            }
        },
        // 监听聊天“查询首爆”
        {
            address: '0x086C9638',
            onEnter(args) {
                if (!_config.firstDrop.enabled)
                    return;
                const user = args[1];
                if (!user || user.isNull())
                    return;
                if (args[2].toInt32() !== 3)
                    return;
                const msg = (args[3].readUtf8String(-1) || '').trim();
                if (msg === '查询首爆') {
                    _handleQueryFirstDrop(user);
                }
            }
        },
        // 监听 GM 手动重置今日首爆命令 //resetfirstdrop
        {
            address: '0x820BBDE',
            onEnter(args) {
                if (!_config.firstDrop.enabled)
                    return;
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                if (!Array.isArray(_config.gmAuth) || !_config.gmAuth.includes(characNo))
                    return;
                const rawBuf = context.system.packet.api_PacketBuf_Get_Buf(args[2]);
                const msgLen = rawBuf.readInt();
                const cmd = rawBuf.add(4).readUtf8String(msgLen).slice(2).trim();
                if (cmd === _config.firstDrop.resetCmd) {
                    _generateNewFirstDropPool();
                    context.utils.cuser.api_CUser_SendNotiPacketMessage(user, 'GM: 今日史诗首爆奖池已重新随机刷新！', 1);
                    context.utils.gameWorld.api_GameWorld_SendNotiPacketMessage('<每日首爆> GM已刷新今日史诗首爆奖池，输入“查询首爆”查看最新名单！', 14);
                }
            }
        }
    ]
};
