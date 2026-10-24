/**
 * equ-transfer.js
 * 跨界石
 * 20250921 by Tim
 */

/** 模块配置 */
var _config = {
    itemId: 9999,               // 装备ID
    itemSlot: 9,                // 需要跨界的装备位置（9 是第一个）
    minLevelLimt: 50,           // 可跨界的最小等级
    maxLevelLimt: 110,          // 可跨界的最大等级
    minRarityLimt: 4,           // 可跨界的最小品阶（稀有度0-5 白蓝紫粉橙红）
    maxRarityLimt: 5,           // 可跨界的最大品阶（稀有度0-5 白蓝紫粉橙红）
    isEpuTypeLimt: true,        // 限制跨界的装备类型，true 禁止跨界称号，false 允许跨界称号
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { api_ScheduleOnMainThread_Delay } = context.system.thread;

const { UPDATE_TYPE_INVENTORY,
    UPDATE_TYPE_AVATAR,
    UPDATE_TYPE_CREATURE,
    UPDATE_TYPE_BODY } = context.utils.cuser.UPDATE_TYPE;
const { CUser_GetAccountCargo,
    CUser_SendUpdateItemList,
    api_CUser_AddItem,
    api_CUser_SendNotiPacketMessage,
    api_CUser_SendAlertPacketMessage } = context.utils.cuser;

const { CUserCharacInfo_GetCurCharacInvenW } = context.utils.cuserCharacInfo;

const { INVENTORY_TYPE_BODY,
    INVENTORY_TYPE_ITEM,
    INVENTORY_TYPE_AVARTAR,
    INVENTORY_TYPE_CREATURE } = context.utils.cinven.INVENTORY_TYPE;

const { CInventory_GetInvenRef,

    Inven_Item_GetKey,
    Inven_Item_Reset,
    getItemInfoByInvenAndSlot } = context.utils.cinven;

const { getItemPvfInfoById } = context.utils.citem;

const { CAccountCargo_GetEmptySlot,
    CAccountCargo_InsertItem,
    CAccountCargo_SendItemList } = context.utils.caccountCargo;

const { api_GameWorld_Find_User_From_World_ByAccid } = context.utils.gameWorld;

////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/**
 * 跨界石
 * @param {*} user  
 * @returns 返回跨界结果
 */
function _equipment_Transfer(user) {
    var inven = CUserCharacInfo_GetCurCharacInvenW(user);
    var equ = CInventory_GetInvenRef(inven, INVENTORY_TYPE_ITEM, _config.itemSlot);
    var item_id = Inven_Item_GetKey(equ);

    let itemPvfInfo = getItemPvfInfoById(item_id);
    if (!itemPvfInfo) {
        api_CUser_SendAlertPacketMessage(user, '跨界失败：当前位置没有装备!');
        return false;
    }

    var dimension1 = equ.add(31).readU8();//异界气息
    var dimension2 = equ.add(32).readU8();
    if (dimension1 || dimension2) {
        api_CUser_SendAlertPacketMessage(user, '跨界失败：装备拥有异界气息无法跨界!');
        return false;
    }

    if (itemPvfInfo.type == 11) {
        api_CUser_SendAlertPacketMessage(user, '跨界失败：称号类装备不可跨界!');
        return false;
    }

    if (itemPvfInfo.useLevel < _config.minLevelLimt || itemPvfInfo.useLevel > _config.maxLevelLimt) {
        api_CUser_SendAlertPacketMessage(user, '跨界失败：当前装备等级不在可跨界范围内!');
        return false;
    }

    if (itemPvfInfo.rarity < _config.minRarityLimt || itemPvfInfo.rarity > _config.maxRarityLimt) {
        api_CUser_SendAlertPacketMessage(user, '跨界失败：当前装备品阶不在可跨界范围内!');
        return false;
    }

    var accountCargo = CUser_GetAccountCargo(user);
    var emptyIndex = CAccountCargo_GetEmptySlot(accountCargo);

    var tag = CAccountCargo_InsertItem(accountCargo, equ, emptyIndex);
    if (tag == -1) {
        api_CUser_SendAlertPacketMessage(user, '跨界失败：账金库未开或没有空位置!');
        return false;
    }
    Inven_Item_Reset(equ);
    CUser_SendUpdateItemList(user, 1, UPDATE_TYPE_INVENTORY, _config.itemSlot);
    CAccountCargo_SendItemList(accountCargo);
    api_CUser_SendAlertPacketMessage(user, '装备已存入第' + (emptyIndex + 1) + '格');
    return true;
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

//module.name 获取模块名
module.exports = {
    init() {
        // 模块初始化时调用，可选
    },
    dispose() {
        // 模块卸载时调用，可选
    },
    // Frida hooks配置，可选
    // 支持attach模式(onEnter/onLeave)和replace模式
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
                    result = _equipment_Transfer(user);
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
