/**
 * equ-inherit.js
 * 继承券，支持真镶嵌
 * 弹窗消息，需要233.dll或登录器支持，也可以换成普通消息————将 api_CUser_SendAlertPacketMessage 换成 api_CUser_SendNotiPacketMessage
 * 20250921 by Tim
 */

/** 模块配置 */
var _config = {
    itemId: 9999,               // 装备ID
    minEquLevelLimt: 50,        // 装备可继承的最低等级限制（指定等级及以上可继承） 
    minEquRarityLimt: 3,        // 装备可继承的最低品阶限制（指定品阶及以上可继承 稀有度0-5 白蓝紫粉橙红）
    sourceEquSlot: 9,           // 继承中提供数值的装备位置（9 是第一个）
    targetEquSlot: 10,          // 继承中继承数值的装备位置（10 是第二个） 
    isCanDiffEquType: false,      // 继承是否可以使用不同类型装备，true 可以 false 不可以
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { api_ScheduleOnMainThread_Delay } = context.system.thread;

const { api_CUser_AddItem,
    api_CUser_SendNotiPacketMessage,
    api_CUser_SendAlertPacketMessage } = context.utils.cuser;

const { CUser_SendUpdateEqu_JewelSocket } = context.utils.cuserEx;

const { CUserCharacInfo_GetCurCharacInvenW } = context.utils.cuserCharacInfo;

const { INVENTORY_TYPE_BODY,
    INVENTORY_TYPE_ITEM,
    INVENTORY_TYPE_AVARTAR,
    INVENTORY_TYPE_CREATURE } = context.utils.cinven.INVENTORY_TYPE;

const { getItemInfoByInvenAndSlot } = context.utils.cinven;

const { api_GameWorld_Find_User_From_World_ByAccid } = context.utils.gameWorld;

/** 装备职业 */
// var CEquipItem_GetSubType = new NativeFunction(ptr(0x833eecc), 'int', ['pointer'], { "abi": "sysv" });


////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/**
 * 装备继承(装备栏第一格和第二格)支持真镶嵌
 * @param user 
 * @param item_id 
 */
function _equInherit_New(user) {
    var inven = CUserCharacInfo_GetCurCharacInvenW(user);

    let sourceItemInfo = getItemInfoByInvenAndSlot(inven, INVENTORY_TYPE_ITEM, _config.sourceEquSlot);
    if (!sourceItemInfo)
        return false;

    if (sourceItemInfo.rarity < _config.minEquRarityLimt) {
        // 装备品级必须要求粉色以上，继承装备不满足要求
        api_CUser_SendAlertPacketMessage(user, '继承失败：原装备品级不满足要求!');
        return false;
    }
    if (sourceItemInfo.useLevel < _config.minEquLevelLimt) {
        // 装备等级要大于50级以上，继承装备不满足要求
        api_CUser_SendAlertPacketMessage(user, '继承失败：原装备等级不满足要求(' + sourceItemInfo.useLevel + ')!');
        return false;
    }

    let targetItemInfo = getItemInfoByInvenAndSlot(inven, INVENTORY_TYPE_ITEM, _config.targetEquSlot);
    if (!targetItemInfo)
        return false;

    if (!_config.isCanDiffEquType && sourceItemInfo.type !== targetItemInfo.type) {
        api_CUser_SendAlertPacketMessage(user, '继承失败：装备继承必须是同类型!');
        return false;
    }
    if (targetItemInfo.rarity < _config.minEquRarityLimt) {
        // 装备品级必须要求粉色以上，继承装备不满足要求
        api_CUser_SendAlertPacketMessage(user, '继承失败：目标装备品级不满足要求!');
        return false;
    }
    if (targetItemInfo.useLevel < _config.minEquLevelLimt) {
        // 装备等级要大于50级以上，继承装备不满足要求
        api_CUser_SendAlertPacketMessage(user, '继承失败：目标装备等级不满足要求(' + targetItemInfo.useLevel + ')!');
        return false;
    }
    if (targetItemInfo.upgrade > sourceItemInfo.upgrade) {
        api_CUser_SendAlertPacketMessage(user, '继承失败：目标装备不能大于原装备的强化等级!');
        return false;
    }

    // 徽章
    const p0 = sourceItemInfo.context.add(37).add(0).readU8();
    const p1 = sourceItemInfo.context.add(37).add(3).readU8();
    const p2 = sourceItemInfo.context.add(37).add(6).readU8();
    const p3 = sourceItemInfo.context.add(37).add(1).readU8();
    const p4 = sourceItemInfo.context.add(37).add(2).readU8();
    const p5 = sourceItemInfo.context.add(37).add(4).readU8();
    const p6 = sourceItemInfo.context.add(37).add(5).readU8();
    const p7 = sourceItemInfo.context.add(37).add(7).readU8();
    const p8 = sourceItemInfo.context.add(37).add(8).readU8();

    // 提升强化/增幅等级 
    targetItemInfo.context.add(6).writeU8(sourceItemInfo.upgrade);
    targetItemInfo.context.add(17).writeU16(sourceItemInfo.increase);
    targetItemInfo.context.add(51).writeU8(sourceItemInfo.forge);
    targetItemInfo.context.add(13).writeU32(sourceItemInfo.pearl);
    // 真镶嵌   
    targetItemInfo.context.add(25).writeU32(sourceItemInfo.inlay);
    // 赋予词条封印词条数量
    targetItemInfo.context.add(37).add(0).writeU8(p0);
    targetItemInfo.context.add(37).add(3).writeU8(p1);
    targetItemInfo.context.add(37).add(6).writeU8(p2);
    targetItemInfo.context.add(37).add(1).writeU8(p3);
    targetItemInfo.context.add(37).add(2).writeU8(p4);
    targetItemInfo.context.add(37).add(4).writeU8(p5);
    targetItemInfo.context.add(37).add(5).writeU8(p6);
    targetItemInfo.context.add(37).add(7).writeU8(p7);
    targetItemInfo.context.add(37).add(8).writeU8(p8);

    // 将原装备清除
    sourceItemInfo.context.add(6).writeU8(0);
    sourceItemInfo.context.add(17).writeU16(0);
    sourceItemInfo.context.add(51).writeU8(0);
    sourceItemInfo.context.add(13).writeU32(0);
    sourceItemInfo.context.add(37).add(0).writeU8(0);
    sourceItemInfo.context.add(37).add(3).writeU8(0);
    sourceItemInfo.context.add(37).add(6).writeU8(0);
    sourceItemInfo.context.add(37).add(1).writeU8(0);
    sourceItemInfo.context.add(37).add(2).writeU8(0);
    sourceItemInfo.context.add(37).add(4).writeU8(0);
    sourceItemInfo.context.add(37).add(5).writeU8(0);
    sourceItemInfo.context.add(37).add(7).writeU8(0);
    sourceItemInfo.context.add(37).add(8).writeU8(0);
    sourceItemInfo.context.add(25).writeU32(0);

    //通知客户端更新装备
    // CUser_SendUpdateItemList(user, 1, 0, 10);
    // CUser_SendUpdateItemList(user, 1, 0, 9);
    CUser_SendUpdateEqu_JewelSocket(user, _config.sourceEquSlot);
    CUser_SendUpdateEqu_JewelSocket(user, _config.targetEquSlot);

    api_CUser_SendAlertPacketMessage(user, '继承成功!');
    return true;
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

                if (item_id !== _config.itemId)
                    return;

                let result = false;
                try {
                    result = _equInherit_New(user);
                } catch (error) {
                    log(ERROR, module.name, error.stack);
                    api_CUser_SendNotiPacketMessage(user, '操作异常，请检查Log!', 8);
                } finally {
                    if (!result)
                        api_ScheduleOnMainThread_Delay(api_CUser_AddItem, [user, item_id, 1], 100);// 失败返回道具
                }
            },
            onLeave(retval) {

            }
        },
    ]
};
