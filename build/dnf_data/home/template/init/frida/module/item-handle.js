/**
 * item-handle.js
 * 常用物品使用
 * 20250911 by Tim
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid, // GM权限ID，用于权限验证（全局配置文件'frida_config.json'中设置）
    item: {
        '主线任务完成券': 9999,
        '异二入场券': 9999,
        '异三入场券': 9999,
        '时装清除券': 9999,
        '全副本难度解锁券': 10000113,
    },
    delteFashionCount: 5,   //时装清除券每次删除的格子数
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { UPDATE_TYPE_INVENTORY,
    UPDATE_TYPE_AVATAR,
    UPDATE_TYPE_CREATURE,
    UPDATE_TYPE_BODY } = context.utils.cuser.UPDATE_TYPE;
const { QUEST_GRADE_COMMON_UNIQUE,
    QUEST_GRADE_NORMALY_REPEAT,
    QUEST_GRADE_DAILY,
    QUEST_GRADE_EPIC,
    QUEST_GRADE_ACHIEVEMENT } = context.utils.cuser.QUEST_GRADE;
const { CUser_GetCurCharacQuestW,
    CUser_Get_State,

    CUser_Send_Clear_Quest_List,
    CUser_SendCharacQp,
    CUser_SendCharacQuestPiece,
    CUser_SendUpdateItemList,
    CUser_SendNotiPacket,

    api_DoUserDefineCommand_Unlock_Dungeon,
    api_CUser_Gain_Exp_Sp,
    api_CUser_SendAlertPacketMessage,
    api_CUser_SendNotiPacketMessage,
    api_CUser_Send_Updata_Quest_Info } = context.utils.cuser;

const { CUserCharacInfo_Get_Charac_Level,
    CUserCharacInfo_GetCurCharacInvenW } = context.utils.cuserCharacInfo;

const { INVENTORY_TYPE_BODY,
    INVENTORY_TYPE_ITEM,
    INVENTORY_TYPE_AVARTAR,
    INVENTORY_TYPE_CREATURE } = context.utils.cinven.INVENTORY_TYPE;
const { CInventory_Gain_Money,
    CInventory_Delete_Item } = context.utils.cinven;

const { G_CDataManager,
    CDataManager_Find_Quest } = context.utils.cdataManager;

const { api_GameWorld_Find_User_From_World_ByAccid } = context.utils.gameWorld;



/**任务是否已完成*/
var WongWork_CQuestClear_IsClearedQuest = new NativeFunction(ptr(0x808BAE0), 'int', ['pointer', 'int'], { "abi": "sysv" });
/**设置任务为已完成状态*/
var WongWork_CQuestClear_SetClearedQuest = new NativeFunction(ptr(0x808BA78), 'int', ['pointer', 'int'], { "abi": "sysv" });

/**计算任务基础奖励(不包含道具奖励)*/
var CUser_Quest_Basic_Reward = new NativeFunction(ptr(0x866E7A8), 'int', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
var CUserCharacInfo_SetDemensionInoutValue = new NativeFunction(ptr(0x0822f184), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });
var CDataManager_Get_DimensionInout = new NativeFunction(ptr(0x0822b612), 'int', ['pointer', 'int'], { "abi": "sysv" });


////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/**
 * 重置异界次数
 * @param user
 * @param index
 */
function _resetDimensionInout(user, index) {
    var dimensionInout = CDataManager_Get_DimensionInout(G_CDataManager(), index);
    CUserCharacInfo_SetDemensionInoutValue(user, index, dimensionInout);
    api_CUser_SendNotiPacketMessage(user, '异界次数已重置！', 1);
}

/**删除指定数量的时装 */
function _deleteFashion(user, count) {
    var inven = CUserCharacInfo_GetCurCharacInvenW(user);
    for (var i = 0; i < count; i++) {
        CInventory_Delete_Item(inven, INVENTORY_TYPE_AVARTAR, i, 1, 5, 1);
        CUser_SendUpdateItemList(user, 1, UPDATE_TYPE_AVATAR, i);
    }
}

/**
 * 清除主线和史诗任务任务。 完成角色当前可接的所有任务(仅发送金币/经验/QP等基础奖励 无道具奖励)
 */
function _clearQuestByCharacterWithLevelAndEpic(user) {
    //玩家任务信息
    var user_quest = CUser_GetCurCharacQuestW(user);
    //玩家已完成任务信息
    var WongWork_CQuestClear = user_quest.add(4);
    //玩家当前等级
    var charac_lv = CUserCharacInfo_Get_Charac_Level(user);
    //本次完成任务数量
    var clear_quest_cnt = 0;
    //pvf数据
    var data_manager = G_CDataManager();
    //完成当前等级所有任务总经验奖励
    var total_exp_bonus = 0;
    //完成当前等级所有任务总金币奖励
    var total_gold_bonus = 0;
    //任务点奖励
    var total_quest_point_bonus = 0;
    var total_quest_piece_bonus = 0;
    //任务最大编号: 29999
    for (var quest_id = 1; quest_id < 30000; quest_id++) {
        //跳过已完成的任务
        if (WongWork_CQuestClear_IsClearedQuest(WongWork_CQuestClear, quest_id)) continue;
        //获取任务数据
        var quest = CDataManager_Find_Quest(data_manager, quest_id);
        if (!quest.isNull()) {
            //任务类型
            var quest_grade = quest.add(8).readInt();
            var jobchange = quest.add(28).readInt();
            //跳过grade为[common unique]类型的任务(转职等任务)
            //跳过可重复提交的任务
            //跳过每日任务
            if ((quest_grade != QUEST_GRADE_COMMON_UNIQUE) && (quest_grade != QUEST_GRADE_NORMALY_REPEAT)
                && (quest_grade != QUEST_GRADE_DAILY) && (quest_grade != QUEST_GRADE_ACHIEVEMENT)) {

                if (jobchange > 0) continue;

                var quest_min_lv = quest.add(0x20).readInt();
                if (quest_min_lv <= charac_lv) {
                    //获取该任务的基础奖励
                    var exp_bonus = Memory.alloc(4);
                    var gold_bonus = Memory.alloc(4);
                    var quest_point_bonus = Memory.alloc(4);
                    var quest_piece_bonus = Memory.alloc(4);
                    //QP奖励已直接发送到角色 经验/金币只返回结果  需要手动发送
                    CUser_Quest_Basic_Reward(user, quest, exp_bonus, gold_bonus, quest_point_bonus, quest_piece_bonus, 1);
                    //统计本次自动完成任务的基础奖励
                    var exp = exp_bonus.readInt();
                    var gold = gold_bonus.readInt();
                    var quest_point = quest_point_bonus.readInt();
                    var quest_piece = quest_piece_bonus.readInt();
                    if (exp > 0)
                        total_exp_bonus += exp;
                    if (gold > 0)
                        total_gold_bonus += gold;
                    if (quest_point > 0) total_quest_point_bonus += quest_point; //没有[quest point]字段的任务quest_point=10000
                    if (quest_piece > 0) total_quest_piece_bonus += quest_piece;
                    //将该任务设置为已完成状态
                    WongWork_CQuestClear_SetClearedQuest(user_quest.add(4), quest_id);
                    //本次自动完成任务计数
                    clear_quest_cnt++;
                }
            }
        }
    }
    //通知客户端更新
    if (clear_quest_cnt > 0) {
        //发送任务经验奖励
        if (total_exp_bonus > 0) api_CUser_Gain_Exp_Sp(user, total_exp_bonus);
        //发送任务金币奖励
        if (total_gold_bonus > 0) CInventory_Gain_Money(CUserCharacInfo_GetCurCharacInvenW(user), total_gold_bonus, 0, 0, 0);
        //通知客户端更新奖励数据
        if (CUser_Get_State(user) == 3) {
            CUser_SendNotiPacket(user, 0, 2, 0);
            CUser_SendNotiPacket(user, 1, 2, 1);
            CUser_SendUpdateItemList(user, 1, UPDATE_TYPE_INVENTORY, 0);
            CUser_SendCharacQp(user);
            CUser_SendCharacQuestPiece(user);
        }
        //通知客户端更新已完成任务列表
        CUser_Send_Clear_Quest_List(user);
        //通知客户端更新任务列表
        api_CUser_Send_Updata_Quest_Info(user);

        //公告通知客户端本次自动完成任务数据
        api_CUser_SendNotiPacketMessage(user, '已自动完成当前等级任务数量: ' + clear_quest_cnt, 8);
        api_CUser_SendNotiPacketMessage(user, '任务经验奖励: ' + total_exp_bonus, 1);
        api_CUser_SendNotiPacketMessage(user, '任务金币奖励: ' + total_gold_bonus, 1);
        api_CUser_SendNotiPacketMessage(user, '任务QuestPoint奖励: ' + total_quest_point_bonus, 1);
        api_CUser_SendNotiPacketMessage(user, '任务QuestPiece奖励: ' + total_quest_piece_bonus, 1);
    }
    return;
}

function _handleUseItem(user, itemId) {

    switch (itemId) {
        case _config.item['主线任务完成券']:
            _clearQuestByCharacterWithLevelAndEpic(user);
            break;
        case _config.item['异二入场券']:
            _resetDimensionInout(user, 0);
            _resetDimensionInout(user, 1);
            _resetDimensionInout(user, 2);
            break;
        case _config.item['异三入场券']:
            _resetDimensionInout(user, 3);
            _resetDimensionInout(user, 4);
            _resetDimensionInout(user, 5);
            break;
        case _config.item['时装清除券']:
            _deleteFashion(user, _config.delteFashionCount);
            break;
        case _config.item['全副本难度解锁券']:
            api_DoUserDefineCommand_Unlock_Dungeon(user);
            api_CUser_SendNotiPacketMessage(user, '系统通知：已开放所有副本全难度（王图），请当前角色小退重进后生效！', 1);
            api_CUser_SendAlertPacketMessage(user, '已开放所有副本王图难度，请重新选择角色生效！');
            break;
        default:
            break;
    } 
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

//module.name 获取模块名
module.exports = {
    hooks: [
        {
            address: '0x854F990',
            onEnter(args) {

                // 解析日志内容: "18000008",18000008,D,145636,"nickname",1,72,8,0,192.168.200.1,192.168.200.1,50963,11, DungeonLeave,"龍人之塔",0,0,"aabb","aabb","N/A","N/A","N/A"
                const history_log = args[1].readUtf8String(-1);
                const group = history_log.split(',');
                // 事件类型
                const game_event = group[13].slice(1);
                if (game_event !== 'Item-')
                    return;
                // 本次操作原因      
                const reason = parseInt(group[18]);
                // 3是使用道具
                if (reason !== 3)
                    return;

                const account_id = parseInt(group[1]);
                const item_id = parseInt(group[15]); // 本次操作道具id
                const item_cnt = parseInt(group[17]); // 本次操作道具数量
                const user = api_GameWorld_Find_User_From_World_ByAccid(account_id);
                if (!user || user.isNull())
                    return;

                _handleUseItem(user, item_id);
            },
            onLeave(retval) {

            }
        },
    ]
};
