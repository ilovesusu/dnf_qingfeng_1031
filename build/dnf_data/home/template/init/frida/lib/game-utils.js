/** 
 * game-utils.js
 * 游戏通用工具模块（基础模块，后面慢慢整理）
 * 20250901 by Tim
 */

/** 模块配置 */
var _config = {
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

// --------------- CInventory 相关接口 ------------------

/**获取背包对应槽位的装备物品对象 (背包，背包栏类型，格子) */
var CInventory_GetInvenRef = new NativeFunction(ptr(0x84FC1DE), 'pointer', ['pointer', 'int', 'int'], { "abi": "sysv" });
/**获取角色当前持有金币数量*/
var CInventory_Get_Money = new NativeFunction(ptr(0x81347D6), 'int', ['pointer'], { "abi": "sysv" });
/**增加金币*/
var CInventory_Gain_Money = new NativeFunction(ptr(0x84FF29C), 'int', ['pointer', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
/**减少金币*/
var CInventory_Use_Money = new NativeFunction(ptr(0x84FF54C), 'int', ['pointer', 'int', 'int', 'int'], { "abi": "sysv" });
/**背包中删除道具(背包指针, 背包类型, 槽, 数量, 删除原因, 记录删除日志)*/
var CInventory_Delete_Item = new NativeFunction(ptr(0x850400C), 'int', ['pointer', 'int', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
var CInventory_MakeItemPacket = new NativeFunction(ptr(0x084FC6BC), 'int', ['pointer', 'int', 'int', 'pointer'], { "abi": "sysv" });
/**获取指定背包栏已占用格子数*/
var CInventory_Get_Item_Count = new NativeFunction(ptr(0x084FB3E4), 'int', ['pointer', 'int'], { "abi": "sysv" });
/**获取指定背包栏中某消耗品ID的堆叠总数*/
var CInventory_Get_Item_Count_By_Id = new NativeFunction(ptr(0x084FB500), 'int', ['pointer', 'int', 'uint'], { "abi": "sysv" });

// --------------- Inven_Item 相关接口 ------------------

/**初始化背包道具结构*/
var Inven_Item_Inven_Item = new NativeFunction(ptr(0x80CB854), 'pointer', ['pointer'], { "abi": "sysv" });
/**检查背包中道具是否为空*/
var Inven_Item_IsEmpty = new NativeFunction(ptr(0x811ED66), 'int', ['pointer'], { "abi": "sysv" });
/**获取背包中道具item_id*/
var Inven_Item_GetKey = new NativeFunction(ptr(0x850D14E), 'int', ['pointer'], { "abi": "sysv" });
/**道具是否是装备*/
var Inven_Item_IsEquipableItemType = new NativeFunction(ptr(0x08150812), 'int', ['pointer'], { "abi": "sysv" });
/**删除背包槽中的道具*/
var Inven_Item_Reset = new NativeFunction(ptr(0x080CB7D8), 'int', ['pointer'], { "abi": "sysv" });

// --------------- CItem 相关接口 ------------------

var CItem_GetRarity = new NativeFunction(ptr(0x80f12d6), 'int', ['pointer'], { "abi": "sysv" });
var CItem_GetUsableLevel = new NativeFunction(ptr(0x80f12ee), 'int', ['pointer'], { "abi": "sysv" });
var CItem_GetItemName = new NativeFunction(ptr(0x811ed82), 'int', ['pointer'], { "abi": "sysv" });
var CItem_GetItemIndex = new NativeFunction(ptr(0x08110C48), 'int', ['pointer'], { "abi": "sysv" });
/**道具是否为消耗品*/
var CItem_Is_Stackable = new NativeFunction(ptr(0x80F12FA), 'int', ['pointer'], { "abi": "sysv" });
/**获取道具分组名标识*/
var CItem_GetItemGroupName = new NativeFunction(ptr(0x080F1312), 'int', ['pointer'], { "abi": "sysv" });

// --------------- CEquipItem 相关接口 ------------------
/** 获取耐久度 */
var CEquipItem_Get_Endurance = new NativeFunction(ptr(0x811ED98), 'int', ['pointer'], { "abi": "sysv" });
/** 判断装备是否为魔法封印装备 */
var CEquipItem_IsRandomOption = new NativeFunction(ptr(0x08514E5E), 'int', ['pointer'], { "abi": "sysv" });
/** 获取装备魔法封印品级 */
var CEquipItem_GetRandomOptionGrade = new NativeFunction(ptr(0x08514E6E), 'int', ['pointer'], { "abi": "sysv" });

// --------------- CStackableItem 相关接口 ------------------

// /**获取消耗品类型*/
var CStackableItem_GetItemType = new NativeFunction(ptr(0x8514A84), 'int', ['pointer'], { "abi": "sysv" });
// /**获取徽章支持的镶嵌槽类型*/
var CStackableItem_GetJewelTargetSocket = new NativeFunction(ptr(0x0822CA28), 'int', ['pointer'], { "abi": "sysv" });

// --------------- CAccountCargo 相关接口 ------------------

/**获取账号金库一个空的格子*/
var CAccountCargo_GetEmptySlot = new NativeFunction(ptr(0x0828a580), 'int', ['pointer'], { "abi": "sysv" });
/**将物品移动到某个格子 第一个账号金库，第二个移入的物品，第三个格子位置*/
var CAccountCargo_InsertItem = new NativeFunction(ptr(0x08289c82), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
/**向客户端发送账号金库列表*/
var CAccountCargo_SendItemList = new NativeFunction(ptr(0x0828a88a), 'int', ['pointer'], { "abi": "sysv" });

// --------------- CGameManager 相关接口 ------------------

var G_CGameManager = new NativeFunction(ptr(0x080cc18e), 'pointer', [], { "abi": "sysv" });
/**  * 根据AccId获取User [CGameManager,AccId]*/
var CGameManager_GetUserByAccId = new NativeFunction(ptr(0x082948C6), 'pointer', ['pointer', 'int'], { 'abi': 'sysv' });

// --------------- CDungeon 相关接口 ------------------

/** 获取CDungeon对象的副本ID */
var CDungeon_Get_Index = new NativeFunction(ptr(0x080FDCF0), 'int', ['pointer'], { "abi": "sysv" });
/** 读取角色所在副本id*/
var CDungeon_GetDungeonIdxAfterClear = new NativeFunction(ptr(0x0867CB90), 'int', ['pointer'], { "abi": "sysv" });
/** 根据副本ID获取副本名称*/
var CDungeon_GetDungeonName = new NativeFunction(ptr(0x81455A6), 'pointer', ['pointer'], { "abi": "sysv" });

// --------------- CDataManager 相关接口 ------------------

/** 获取DataManager实例 用于处理pvf的*/
var G_CDataManager = new NativeFunction(ptr(0x80CC19B), 'pointer', [], { "abi": "sysv" });
/** 获取pvf数据*/
var CDataManager_Find_Dungeon = new NativeFunction(ptr(0x835F9F8), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
/**从pvf中获取任务数据*/
var CDataManager_Find_Quest = new NativeFunction(ptr(0x835FDC6), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
/**获取装备pvf数据*/
var CDataManager_Find_Item = new NativeFunction(ptr(0x835FA32), 'pointer', ['pointer', 'int'], { "abi": "sysv" });

// --------------- CParty 相关接口 ------------------
 
//获取队伍中玩家
const CParty_Get_User = new NativeFunction(ptr(0x08145764), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
/** 检查队伍槽位是否为有效玩家 */
const CParty_CheckValidUser = new NativeFunction(ptr(0x08145868), 'int', ['pointer', 'int'], { "abi": "sysv" });

// --------------- MapInfo 刷怪分发接口 ------------------
/** 地图刷怪底层原函数（由本基础模块统一 replace 分发，避免多模块 replace 冲突） */
const MapInfo_Add_Mob_Orig = new NativeFunction(ptr(0x08151612), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
const _addMobHandlers = new Map();


////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////

/**获取背包槽中的道具（对象）
  * 
  * 身上穿的装备(0-26)[0-9时装][10-21装备][22宠物]
  * 
  * 物品栏(0-311)
  * 
  * 时装栏(0-104)
  * 
  * 宠物装备(0-241)
  * 
  * 3-8快捷栏 9-56装备栏 57-104消耗品栏 105-152材料栏153-200任务栏 201-248副职业栏 249-311徽章栏
  */
const INVENTORY_TYPE = {
    INVENTORY_TYPE_BODY: 0,         //身上穿的装备(0-26)
    INVENTORY_TYPE_ITEM: 1,            //物品栏(0-311)
    INVENTORY_TYPE_AVARTAR: 2,         //时装栏(0-104)
    INVENTORY_TYPE_CREATURE: 3       //宠物装备(0-241)
}

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

/** CInventory 相关 */
const cinven = {
    CInventory_GetInvenRef,
    CInventory_Get_Money,
    CInventory_Gain_Money,
    CInventory_Use_Money,
    CInventory_Delete_Item,
    CInventory_MakeItemPacket,
    CInventory_Get_Item_Count,
    CInventory_Get_Item_Count_By_Id,

    INVENTORY_TYPE,

    Inven_Item_Inven_Item,
    Inven_Item_IsEmpty,
    Inven_Item_IsEquipableItemType,
    Inven_Item_GetKey,
    Inven_Item_Reset,

    /**
     * 统计背包物品栏(3..311)中指定 itemId 的总持有数量（兼容消耗品堆叠与装备单件）
     */
    getItemCountInItemInven(invenContext, itemId) {
        if (!invenContext || invenContext.isNull() || !itemId)
            return 0;
        let total = 0;
        for (let slot = 3; slot <= 311; slot++) {
            const ref = CInventory_GetInvenRef(invenContext, INVENTORY_TYPE.INVENTORY_TYPE_ITEM, slot);
            if (!ref || ref.isNull())
                continue;
            if (Inven_Item_GetKey(ref) !== itemId)
                continue;
            if (Inven_Item_IsEquipableItemType(ref)) {
                total += 1;
            } else {
                const cnt = ref.add(7).readInt();
                total += cnt > 0 ? cnt : 1;
            }
        }
        return total;
    },

    /**
     * 从角色物品栏(3..311)中扣除指定数量的 itemId，并同步客户端槽位刷新
     */
    deductItemFromItemInven(user, invenContext, itemId, needCount) {
        if (!user || user.isNull() || !invenContext || invenContext.isNull() || !itemId || needCount <= 0)
            return 0;
        let remain = needCount;
        for (let slot = 3; slot <= 311 && remain > 0; slot++) {
            const ref = CInventory_GetInvenRef(invenContext, INVENTORY_TYPE.INVENTORY_TYPE_ITEM, slot);
            if (!ref || ref.isNull())
                continue;
            if (Inven_Item_GetKey(ref) !== itemId)
                continue;
            const slotCnt = Inven_Item_IsEquipableItemType(ref) ? 1 : Math.max(1, ref.add(7).readInt());
            const delCnt = Math.min(remain, slotCnt);
            CInventory_Delete_Item(invenContext, INVENTORY_TYPE.INVENTORY_TYPE_ITEM, slot, delCnt, 5, 1);
            if (context.utils?.cuser?.CUser_SendUpdateItemList) {
                context.utils.cuser.CUser_SendUpdateItemList(user, 1, context.utils.cuser.UPDATE_TYPE.UPDATE_TYPE_INVENTORY, slot);
            }
            remain -= delCnt;
        }
        return needCount - remain;
    },

    /**
    * 根据背包类型以及所在位置返回物品信息
    * @param {*} invenContext 背包指针
    * @param {*} invenType 背包类型
    * @param {*} slot 物品所在背包位置
    * @returns 
    */
    getItemInfoByInvenAndSlot(invenContext, invenType, slot) {
        const validTypes = Object.values(INVENTORY_TYPE);
        if (!validTypes.includes(invenType))
            return null;
        let item = CInventory_GetInvenRef(invenContext, invenType, slot);
        if (!item)
            return null;
        let itemId = Inven_Item_GetKey(item);
        let baseInfo = citem.getItemPvfInfoById(itemId);
        if (!baseInfo)
            return null;

        baseInfo.context = item; // item 对象

        // 这里需要判断一下是不是装备
        if (Inven_Item_IsEquipableItemType(item)) {
            baseInfo.upgrade = item.add(6).readU8();// 强化等级
            baseInfo.increase = item.add(17).readU16();        // 增幅
            baseInfo.forge = item.add(51).readU8(); // 锻造
            baseInfo.inlay = item.add(25).readU32();// 真装备镶嵌
            baseInfo.pearl = item.add(13).readU32();// 宝珠

            // 使用职业，暂时不要了
            // baseInfo.useJob = "";
            // for (var i = 60; i <= 70; i++) {
            //     baseInfo.useJob += itemData.add(i).readU8();
            // }
        }
        return baseInfo;
    }
}

/** CItem 相关 */
const citem = {
    CItem_Is_Stackable,
    CItem_GetRarity,
    CItem_GetUsableLevel,
    CItem_GetItemIndex,
    CItem_GetItemGroupName,

    /**获取道具名字*/
    api_CItem_GetItemName(item_id) {
        if (!item_id)
            return null;
        var citem = cdataManager.api_CDataManager_Find_Item(item_id);
        if (citem && !citem.isNull()) {
            return ptr(CItem_GetItemName(citem)).readUtf8String(-1);
        }
        return item_id.toString();
    },
    /**
     * 根据物品ID返回PVF中的信息
     * @param {*} itemId 
     * @returns 
     */
    getItemPvfInfoById(itemId) {
        if (!itemId)
            return null;
        var itemData = cdataManager.api_CDataManager_Find_Item(itemId);
        if (!itemData || itemData.isNull())
            return null;
        var itemType = itemData.add(141 * 4).readU32(); // 装备类型
        var itemRarity = CItem_GetRarity(itemData); // 稀有度   
        var itemLevel = CItem_GetUsableLevel(itemData);  //等级

        return {
            id: itemId,
            type: itemType,
            rarity: itemRarity,
            useLevel: itemLevel
        };
    },
}

/** CEquipItem 相关 */
const cequipItem = {
    CEquipItem_Get_Endurance,
    CEquipItem_IsRandomOption,
    CEquipItem_GetRandomOptionGrade
}

/** CStackableItem 相关 */
const cstackableItem = {
    CStackableItem_GetItemType,
    CStackableItem_GetJewelTargetSocket
}

/** CGameManager 相关 */
const cgameManager = {
    /** 
     * 根据账号ID获取User
     * @param {*} accId 账号ID
     */
    api_CGameManager_GetUserByAccId(accId) {
        if (!accId)
            return null;
        return CGameManager_GetUserByAccId(G_CGameManager(), accId);
    }
}

/** CAccountCargo 相关 */
const caccountCargo = {
    CAccountCargo_GetEmptySlot,
    CAccountCargo_InsertItem,
    CAccountCargo_SendItemList
}

/** CDataManager 相关 */
const cdataManager = {
    G_CDataManager,
    CDataManager_Find_Quest,
    CDataManager_Find_Item,

    api_CDataManager_Find_Item(itemId) {
        if (!itemId)
            return null;
        return CDataManager_Find_Item(G_CDataManager(), itemId);
    }
}

/** CDungeon 相关 */
const cdungeon = {
    CDungeon_Get_Index,
    CDungeon_GetDungeonIdxAfterClear,
    MapInfo_Add_Mob_Orig,
    /**
     * 注册 MapInfo::Add_Mob 处理器；回调返回数值则短路返回，返回 undefined/null 则继续后续处理器或原函数
     */
    registerAddMobHandler(name, fn) {
        if (name && typeof fn === 'function') {
            _addMobHandlers.set(name, fn);
        }
    },
    unregisterAddMobHandler(name) {
        _addMobHandlers.delete(name);
    },
    /** 
     * 根据副本ID获取副本名字
     * @param {*} dungeon_id 
     * @returns 
     */
    api_CDungeon_GetDungeonName(dungeon_id) {
        var cdungeon = CDataManager_Find_Dungeon(G_CDataManager(), dungeon_id);
        if (!cdungeon.isNull()) {
            return ptr(CDungeon_GetDungeonName(cdungeon)).readUtf8String(-1);
        }
        return dungeon_id.toString();
    },
}

/** CParty 相关 */
const cparty = {
    CParty_Get_User,
    CParty_CheckValidUser,
    /** 获取当前队伍有效成员数量 */
    api_GetPartyMemberNumber(party) {
        if (!party || party.isNull())
            return 1;
        let memberCnt = 0;
        for (let i = 0; i <= 3; i++) {
            memberCnt += CParty_CheckValidUser(party, i);
        }
        return memberCnt;
    }
}

const api = {
    cinven,
    citem,
    cequipItem,
    cstackableItem,
    caccountCargo,
    cgameManager,
    cdataManager,
    cdungeon,
    cparty
};

module.exports = {
    api,
    dispose() {
        _addMobHandlers.clear();
    },
    hooks: [
        // 统一接管 MapInfo::Add_Mob (0x08151612)，分发给怪物攻城、副本增强等多个功能模块，消除 replace 冲突与递归死循环
        {
            address: '0x08151612',
            replace(mapInfo, monster) {
                for (const [, handler] of _addMobHandlers.entries()) {
                    try {
                        const ret = handler(mapInfo, monster, MapInfo_Add_Mob_Orig);
                        if (typeof ret === 'number') {
                            return ret;
                        }
                    } catch (err) {
                        context.main.log(context.main.LOG_LEVELS.ERROR, `[game-utils] AddMob handler error: ${err}`);
                    }
                }
                return MapInfo_Add_Mob_Orig(mapInfo, monster);
            },
            retType: 'int',
            argTypes: ['pointer', 'pointer'],
        }
    ]
};
