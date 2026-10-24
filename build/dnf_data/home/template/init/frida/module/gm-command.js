/**
 * gm-command.js
 * GM指令，通过下方 模块配置 中的 cmd 触发响应功能
 * 20250901 by Tim
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid, // 权限认证采用全局配置文件中的
    mailSender: 'GM系统邮件',     // 邮件发物品发件人名称
    mailContent: 'GM为您发放了道具，请注意查收！', // 邮件发物品正文
    mailExpireDays: 30,           // 邮件有效天数
    cmd: {
        '帮助命令': 'help',         //例：//help [关键字]

        '全服消息命令': 'notice',   //例：//notice 这是消息
        '全服公告命令': 'alert',    //例：//alert 这是公告
        '踢人命令': 'kick',         //例：//kick 张三

        '获取物品命令': 'item',     //例：//item 3340 100              (直接发到GM自己背包)
        '邮件发物品命令': 'mail',   //例：//mail 张三 3340 [数量] [金币] (邮件发给指定玩家，填 me 发给自己)
        '增加经验命令': 'exp',      //例：//exp 1000000
        '调整等级命令': 'lv',       //例：//lv 70                      (注意最大只能70级且调到70级会闪退)

        '完成任务命令': 'rwwc',     //例：//rwwc                       (完成全部已接任务，只领取不需要选择的任务奖励)
        '解锁王图命令': 'unlkdgn',  //例：//unlkdgn
        '副本信息命令': 'dgninfo',  //例：//dgninfo
        '用户位置命令': 'pos',      //例：//pos                        (获取用户位置，不包括PVP)

        '重新初始化命令': 'reinit',   //例：//reinit                   (重新初始化除了会重新读取配置文件，还会根据配置文件重新加载基础模块)
        '重新加载模块命令': 'reload', //例：//reload [cfg|moduleName]
        //reload moduleName cfg
    }
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { getAccIdByCharacName,
    getCharacInfoByCharacName } = context.mysql.gameService;

const { api_PacketBuf_Get_Buf } = context.system.packet;

const { api_GameWorld_Find_User_From_World_ByAccid,
    api_GameWorld_SendNotiPacketMessage,
    api_GameWorld_SendAlertPacketMessage } = context.utils.gameWorld;

const { UPDATE_TYPE_INVENTORY } = context.utils.cuser.UPDATE_TYPE;
const { CUser_GetCurCharacQuestW,
    CUser_Quest_Action,
    CUser_SetGmQuestFlag,
    CUser_Get_State,
    CUser_GetServerGroup,
    CUser_Send_Clear_Quest_List,
    CUser_SendCharacQp,
    CUser_SendCharacQuestPiece,

    CUser_SendUpdateItemList,
    CUser_SendNotiPacket,

    setGameMasterModeTemp,

    api_DoUserDefineCommand_Unlock_Dungeon,
    api_CUser_Kill_The_Game,
    api_CUser_AddItem,
    api_CUser_Gain_Exp_Sp,
    api_CUser_Send_Updata_Quest_Info,
    api_CUser_SendAlertPacketMessage,
    api_CUser_SendNotiPacketMessage } = context.utils.cuser;

const { CUserCharacInfo_GetCurCharacNo,
    api_CUserCharacInfo_GetCurCharacName,
    getUserPosition } = context.utils.cuserCharacInfo;

const { api_SendSystemMailSingleItem } = context.utils.cuserEx;

const { api_CItem_GetItemName } = context.utils.citem;

const { CDungeon_GetDungeonIdxAfterClear, api_CDungeon_GetDungeonName } = context.utils.cdungeon;


/** 设置角色等级(最高70级)*/
var DisPatcher_DebugCommand__DebugCommandSetLevel = new NativeFunction(ptr(0x0858EFDE), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });//需要临时开GM权限

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/** 注册本模块的 GM 帮助信息（基于 Map 按指令词自动去重） */
function _registerGmHelp() {
    if (!context.gmHelpRegistry) {
        context.gmHelpRegistry = new Map();
    }
    const defs = [
        { cmd: _config.cmd['帮助命令'], params: '[关键字]', desc: '查看GM指令列表(支持关键字过滤)' },
        { cmd: _config.cmd['获取物品命令'], params: '<物品ID> <数量>', desc: '直接发物品到自己背包' },
        { cmd: _config.cmd['邮件发物品命令'], params: '<角色名|me> <物品ID> [数量] [金币]', desc: '邮件发物品给指定玩家(支持在线/离线)' },
        { cmd: _config.cmd['增加经验命令'], params: '<经验值>', desc: '增加自身角色经验值' },
        { cmd: _config.cmd['调整等级命令'], params: '<等级>', desc: '调整自身角色等级(上限70)' },
        { cmd: _config.cmd['完成任务命令'], params: '', desc: '一键完成当前全部已接任务' },
        { cmd: _config.cmd['解锁王图命令'], params: '[角色名]', desc: '为自己或指定在线玩家解锁全副本王图并发送通知' },
        { cmd: _config.cmd['副本信息命令'], params: '', desc: '查看当前所在副本ID与名称' },
        { cmd: _config.cmd['用户位置命令'], params: '', desc: '查看当前角色坐标与区域编号' },
        { cmd: _config.cmd['全服消息命令'], params: '<内容>', desc: '发送全服喇叭消息' },
        { cmd: _config.cmd['全服公告命令'], params: '<内容>', desc: '发送全服弹窗与喇叭公告' },
        { cmd: _config.cmd['踢人命令'], params: '<角色名>', desc: '将指定在线玩家踢下线' },
        { cmd: _config.cmd['重新初始化命令'], params: '', desc: '重载全局配置与基础模块' },
        { cmd: _config.cmd['重新加载模块命令'], params: '[cfg|模块名]', desc: '热重载全部或指定模块' },
    ];
    for (const item of defs) {
        if (item.cmd) {
            context.gmHelpRegistry.set(item.cmd, { ...item, moduleName: module.name });
        }
    }
}

/** 卸载本模块的 GM 帮助信息 */
function _unregisterGmHelp() {
    if (!context.gmHelpRegistry)
        return;
    for (const [key, val] of context.gmHelpRegistry.entries()) {
        if (val.moduleName === module.name) {
            context.gmHelpRegistry.delete(key);
        }
    }
}

/** 向 GM 客户端输出去重后的指令帮助列表 */
function _sendGmHelp(user, keyword = '') {
    if (!context.gmHelpRegistry || context.gmHelpRegistry.size === 0) {
        _registerGmHelp();
    }
    const kw = keyword.trim().toLowerCase();
    const seen = new Set();
    const list = [];
    for (const [cmdKey, info] of context.gmHelpRegistry.entries()) {
        if (!cmdKey || seen.has(cmdKey))
            continue;
        if (kw && !cmdKey.toLowerCase().includes(kw) && !info.desc.toLowerCase().includes(kw))
            continue;
        seen.add(cmdKey);
        list.push(info);
    }

    if (list.length === 0) {
        api_CUser_SendNotiPacketMessage(user, `GM: 未找到包含 [${keyword}] 的指令，输入 //${_config.cmd['帮助命令']} 查看全部指令。`, 8);
        return;
    }

    const titleSuffix = kw ? ` (筛选: ${keyword}, 共 ${list.length} 条)` : ` (共 ${list.length} 条)`;
    api_CUser_SendNotiPacketMessage(user, `========== GM 指令帮助${titleSuffix} ==========`, 8);
    for (const info of list) {
        const usage = info.params ? `//${info.cmd} ${info.params}` : `//${info.cmd}`;
        api_CUser_SendNotiPacketMessage(user, `  ${usage} - ${info.desc}`, 1);
    }
}

/** 
 * 设置角色等级(最高70级)
 * @param {*} user 
 * @param {*} new_level 
 */
function api_DisPatcher_DebugCommand__DebugCommandSetLevel(user, new_level) {
    // 为该角色临时开通GM权限
    var old_gm_mode = setGameMasterModeTemp(user, 1);

    DisPatcher_DebugCommand__DebugCommandSetLevel(ptr(0), user, new_level);

    // 恢复原始GM权限
    setGameMasterModeTemp(user, old_gm_mode);
}

/** 
 * 无条件完成指定任务并领取奖励
*/
function _clearUserQuestById(user, quest_id) {
    // 设置GM完成任务模式(无条件完成任务)
    CUser_SetGmQuestFlag(user, 1);

    // 接受任务
    CUser_Quest_Action(user, 33, quest_id, 0, 0);

    // 完成任务
    CUser_Quest_Action(user, 35, quest_id, 0, 0);

    // 领取任务奖励(倒数第二个参数表示领取奖励的编号, -1=领取不需要选择的奖励; 0=领取可选奖励中的第1个奖励; 1=领取可选奖励中的第二个奖励)
    CUser_Quest_Action(user, 36, quest_id, -1, 1);

    // 服务端有反作弊机制: 任务完成时间间隔不能小于1秒.  这里将上次任务完成时间清零 可以连续提交任务
    user.add(0x79644).writeInt(0);

    // 关闭GM完成任务模式(不需要材料直接完成)
    CUser_SetGmQuestFlag(user, 0);

    return;
}

/** 
 * 完成当前已接任务并领取奖励
*/
function _clearUserQuestList(user) {
    // 玩家任务信息
    var user_quest = CUser_GetCurCharacQuestW(user);

    // 遍历20个已接任务
    // 任务列表(保存任务id): user_quest.add(4 * (i + 7500 + 2))
    // 任务完成状态(0=已满足任务条件): user_quest.add(4 * (i + 7520 + 2))
    for (var i = 0; i < 20; i++) {
        // 任务id
        var quest_id = user_quest.add(4 * (i + 7500 + 2)).readInt();

        if (quest_id > 0) {
            // 无条件完成任务并领取奖励
            _clearUserQuestById(user, quest_id);
        }
    }

    // 通知客户端更新已完成任务列表
    CUser_Send_Clear_Quest_List(user);

    // 通知客户端更新任务列表
    api_CUser_Send_Updata_Quest_Info(user);
}

/**
 * 处理GM指令
 */
function _handleGmCommand(user, msg) {
    if (!msg)
        return;

    const parts = msg.split(/\s+/);
    const cmdName = parts[0];
    const cmdArgs = parts.slice(1);

    // 帮助命令: //help [关键字]
    if (cmdName === _config.cmd['帮助命令']) {
        _sendGmHelp(user, cmdArgs.join(' '));
        return;
    }

    // 重新初始化(重新读取配置文件、utils模块)
    if (cmdName === _config.cmd['重新初始化命令']) {
        context.main.module.reinit();
        api_CUser_SendNotiPacketMessage(user, '已重新初始化！', 8);
        return;
    }

    // 判断模块相关
    if (cmdName === _config.cmd['重新加载模块命令']) {
        let result = false;
        let message = '';

        switch (parts.length) {
            case 1: // reload
                result = context.main.module.reload();
                message = result ? '已重新加载全部模块！' : '部分模块可能卸载失败，请查看日志！';
                break;
            case 2: // reload [cfg|moduleName]
                if (parts[1] === 'cfg') {
                    context.main.module.reinit();
                    result = context.main.module.reload();
                    message = result ? '已更新配置并重载全部模块！' : '部分模块可能卸载失败，请查看日志！';
                } else {
                    result = context.main.module.reload(parts[1]);
                    message = result ? `已重新加载 [${parts[1]}] 模块！` : `模块 [${parts[1]}] 不存在或未启用！`;
                }
                break;
            case 3: // reload moduleName cfg
                if (parts[2] === 'cfg') {
                    context.main.module.reinit();
                    result = context.main.module.reload(parts[1]);
                    message = result ? `已更新配置并重载 [${parts[1]}] 模块！` : `模块 [${parts[1]}] 不存在或未启用！`;
                } else {
                    message = '无效的 reload 命令格式！';
                }
                break;
            default:
                message = '无效的 reload 命令！';
        }
        api_CUser_SendNotiPacketMessage(user, message, 8);
        return;
    }

    // 全服消息命令
    if (cmdName === _config.cmd['全服消息命令']) {
        const content = cmdArgs.join(' ');
        if (!content) {
            api_CUser_SendNotiPacketMessage(user, `GM: 命令格式错误: //${cmdName} 消息内容`, 8);
            return;
        }
        api_GameWorld_SendNotiPacketMessage(content, 14);
        api_CUser_SendNotiPacketMessage(user, 'GM: 消息发送成功！', 1);
        return;
    }

    // 全服公告命令
    if (cmdName === _config.cmd['全服公告命令']) {
        const content = cmdArgs.join(' ');
        if (!content) {
            api_CUser_SendNotiPacketMessage(user, `GM: 命令格式错误: //${cmdName} 消息内容`, 8);
            return;
        }
        api_GameWorld_SendAlertPacketMessage(user, content, 0);//弹窗
        api_GameWorld_SendNotiPacketMessage(content, 14);//公告
        api_CUser_SendNotiPacketMessage(user, 'GM: 公告发送成功！', 1);
        return;
    }

    // 获取物品命令（直接发到 GM 自己背包）
    if (cmdName === _config.cmd['获取物品命令']) {
        if (cmdArgs.length < 2) {
            api_CUser_SendNotiPacketMessage(user, `GM: 命令格式错误: //${cmdName} 物品id 数量`, 8);
            return;
        }
        var item_id = parseInt(cmdArgs[0], 10);
        var item_cnt = parseInt(cmdArgs[1], 10);
        if (!Number.isInteger(item_id) || item_id <= 0 || !Number.isInteger(item_cnt) || item_cnt <= 0) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 物品ID与数量必须为正整数！', 8);
            return;
        }
        // 发送道具到玩家背包
        api_CUser_AddItem(user, item_id, item_cnt);
        api_CUser_SendNotiPacketMessage(user, 'GM: 物品已发放到背包！', 1);
        return;
    }

    // 邮件发物品命令（调用 api_SendSystemMailSingleItem 发给指定玩家或自己）
    if (cmdName === _config.cmd['邮件发物品命令']) {
        if (cmdArgs.length < 2) {
            api_CUser_SendNotiPacketMessage(user, `GM: 格式错误: //${cmdName} <角色名|me> <物品ID> [数量=1] [金币=0]`, 8);
            return;
        }
        const targetArg = cmdArgs[0];
        const itemId = parseInt(cmdArgs[1], 10);
        const itemCnt = cmdArgs.length >= 3 ? parseInt(cmdArgs[2], 10) : 1;
        const gold = cmdArgs.length >= 4 ? parseInt(cmdArgs[3], 10) : 0;

        if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(itemCnt) || itemCnt <= 0 || !Number.isInteger(gold) || gold < 0) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 参数错误，物品ID和数量须为正整数，金币不能为负数！', 8);
            return;
        }

        let mailTarget = null;
        let onlineTargetUser = null;
        let displayTargetName = targetArg;

        if (targetArg.toLowerCase() === 'me') {
            mailTarget = user;
            onlineTargetUser = user;
            displayTargetName = api_CUserCharacInfo_GetCurCharacName(user) || '自己';
        } else {
            const characInfo = getCharacInfoByCharacName(targetArg);
            if (!characInfo || !characInfo.characNo) {
                api_CUser_SendNotiPacketMessage(user, `GM: 未找到角色 [${targetArg}]，请确认角色名！`, 8);
                return;
            }
            const foundUser = api_GameWorld_Find_User_From_World_ByAccid(characInfo.accId);
            if (foundUser && !foundUser.isNull() && CUser_Get_State(foundUser) >= 3 && CUserCharacInfo_GetCurCharacNo(foundUser) === characInfo.characNo) {
                mailTarget = foundUser;
                onlineTargetUser = foundUser;
            } else {
                mailTarget = {
                    characNo: characInfo.characNo,
                    serverGroup: CUser_GetServerGroup(user)
                };
            }
        }

        const sent = api_SendSystemMailSingleItem(
            mailTarget,
            _config.mailSender,
            _config.mailContent,
            itemId,
            itemCnt,
            gold,
            _config.mailExpireDays
        );
        if (!sent) {
            api_CUser_SendNotiPacketMessage(user, `GM: 物品ID [${itemId}] 不存在，邮件发送失败！`, 8);
            return;
        }

        const itemName = api_CItem_GetItemName(itemId) || itemId;
        const goldDesc = gold > 0 ? ` + ${gold}金币` : '';
        const statusTag = onlineTargetUser ? '在线' : '离线';
        api_CUser_SendNotiPacketMessage(user, `GM: 已向 [${displayTargetName}](${statusTag}) 发送邮件: [${itemName}] x${itemCnt}${goldDesc}！`, 1);
        if (onlineTargetUser && !onlineTargetUser.equals(user)) {
            api_CUser_SendNotiPacketMessage(onlineTargetUser, `系统提示: 收到一封GM发送的系统邮件([${itemName}] x${itemCnt}${goldDesc})，请查收！`, 1);
        }
        return;
    }

    if (cmdName === _config.cmd['增加经验命令']) {
        if (cmdArgs.length < 1) {
            api_CUser_SendNotiPacketMessage(user, `GM: 格式错误: //${cmdName} 经验值`, 8);
            return;
        }
        api_CUser_Gain_Exp_Sp(user, parseInt(cmdArgs[0], 10));
        // 通知客户端更新奖励数据
        if (CUser_Get_State(user) == 3) {
            CUser_SendNotiPacket(user, 0, 2, 0);
            CUser_SendNotiPacket(user, 1, 2, 1);
            CUser_SendUpdateItemList(user, 1, UPDATE_TYPE_INVENTORY, 0);
            CUser_SendCharacQp(user);
            CUser_SendCharacQuestPiece(user);
        }
        api_CUser_SendNotiPacketMessage(user, 'GM: 经验已发放！', 1);
        return;
    }

    if (cmdName === _config.cmd['调整等级命令']) {
        if (cmdArgs.length < 1) {
            api_CUser_SendNotiPacketMessage(user, `GM: 格式错误: //${cmdName} 等级`, 8);
            return;
        }
        api_DisPatcher_DebugCommand__DebugCommandSetLevel(user, parseInt(cmdArgs[0], 10));
        api_CUser_SendNotiPacketMessage(user, 'GM: 等级已调整！', 1);
        return;
    }

    if (cmdName === _config.cmd['踢人命令']) {
        if (cmdArgs.length < 1) {
            api_CUser_SendNotiPacketMessage(user, `GM: 格式错误: //${cmdName} 角色名`, 8);
            return;
        }
        var accountId = getAccIdByCharacName(cmdArgs[0]);
        if (!accountId) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 未找到账号ID， 请确认角色名！', 8);
            return;
        }
        var targetUser = api_GameWorld_Find_User_From_World_ByAccid(accountId);
        if (!targetUser || targetUser.isNull()) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 玩家当前不在线， 请确认角色名！', 8);
            return;
        }
        if (CUser_Get_State(targetUser) < 3) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 当前角色未登录！', 8);
            return;
        }
        api_CUser_Kill_The_Game(targetUser);
        api_CUser_SendNotiPacketMessage(user, `GM: ${cmdArgs[0]} 已踢出！`, 1);
        return;
    }

    if (cmdName === _config.cmd['完成任务命令']) {
        _clearUserQuestList(user);
        api_CUser_SendNotiPacketMessage(user, 'GM: 已完成全部已接任务！', 1);
        return;
    }

    if (cmdName === _config.cmd['解锁王图命令']) {
        let targetUser = user;
        let targetName = api_CUserCharacInfo_GetCurCharacName(user) || '自己';
        if (cmdArgs.length >= 1 && cmdArgs[0].toLowerCase() !== 'me') {
            const accId = getAccIdByCharacName(cmdArgs[0]);
            if (!accId) {
                api_CUser_SendNotiPacketMessage(user, `GM: 未找到角色 [${cmdArgs[0]}]，请确认角色名！`, 8);
                return;
            }
            const foundUser = api_GameWorld_Find_User_From_World_ByAccid(accId);
            if (!foundUser || foundUser.isNull() || CUser_Get_State(foundUser) < 3) {
                api_CUser_SendNotiPacketMessage(user, `GM: 玩家 [${cmdArgs[0]}] 当前不在线！`, 8);
                return;
            }
            targetUser = foundUser;
            targetName = cmdArgs[0];
        }
        api_DoUserDefineCommand_Unlock_Dungeon(targetUser);
        api_CUser_SendNotiPacketMessage(targetUser, '系统通知：已为您开放所有副本王图难度，请重新选择角色（小退）后生效！', 1);
        api_CUser_SendAlertPacketMessage(targetUser, '已开放所有副本王图难度，请重新选择角色生效！');
        if (!targetUser.equals(user)) {
            api_CUser_SendNotiPacketMessage(user, `GM: 已为玩家 [${targetName}] 开放所有副本王图难度并发送通知！`, 1);
        }
        return;
    }

    if (cmdName === _config.cmd['用户位置命令']) {
        var pos = getUserPosition(user);
        if (!pos) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 位置信息获取失败!', 8);
            return;
        }
        api_CUser_SendNotiPacketMessage(user, 'GM: 位置信息 -', 1);
        api_CUser_SendNotiPacketMessage(user, '\t\t\t\tX坐标: ' + pos.x, 1);
        api_CUser_SendNotiPacketMessage(user, '\t\t\t\tY坐标: ' + pos.y, 1);
        api_CUser_SendNotiPacketMessage(user, '\t\t\t\t城镇编号: ' + pos.village, 1);
        api_CUser_SendNotiPacketMessage(user, '\t\t\t\t区域编号: ' + pos.area, 1);
        return;
    }

    if (cmdName === _config.cmd['副本信息命令']) {
        var dgnid = CDungeon_GetDungeonIdxAfterClear(user);
        if (!dgnid) {
            api_CUser_SendNotiPacketMessage(user, 'GM: 请在副本中使用!', 8);
            return;
        }
        var dngName = api_CDungeon_GetDungeonName(dgnid);
        api_CUser_SendNotiPacketMessage(user, 'GM: 副本信息 -', 1);
        api_CUser_SendNotiPacketMessage(user, '\t\t\t\tID: ' + dgnid, 1);
        api_CUser_SendNotiPacketMessage(user, '\t\t\t\tName: ' + dngName, 1);
        return;
    }
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    init() {
        _registerGmHelp();
    },
    dispose() {
        _unregisterGmHelp();
    },
    hooks: [
        // GM指令
        {
            address: '0x820BBDE',
            onEnter(args) {
                // 用户信息
                var user = args[1];
                var charac_no = CUserCharacInfo_GetCurCharacNo(user);
                if (!_config.gmAuth.includes(charac_no))
                    return;

                // 获取原始封包数据
                var rawPacketBuf = api_PacketBuf_Get_Buf(args[2]);
                // 解析GM DEBUG命令
                var msgLen = rawPacketBuf.readInt();
                var msg = rawPacketBuf.add(4).readUtf8String(msgLen);
                msg = msg.slice(2);
                msg = msg.trim();
                _handleGmCommand(user, msg);
            },
            onLeave(retval) {

            }
        }
    ]
};
