/**
 * magic-seal-enhance.js
 * 魔法封印增强三件套 + 史诗魔封洗练券
 * 功能：
 *  1. 魔法封印装备入包自动解封（CInventory::insertItemIntoInventory）；
 *  2. 魔法封印属性变换保底继承高数值 + 不足3词条时概率扩展新词条槽且不锁定词条（CRandomOptionItemHandle::change_option）；
 *  3. 刷图击杀怪物时穿戴中的魔法封印装备概率自动升级词条等级（KillMob）；
 *  4. 使用史诗魔法封印变换券（默认道具 ID 1230）一键重洗物品栏第一排（槽位 9..16）所有史诗装备的魔法封印词条。
 */

var _config = {
    enableAutoUnseal: true,             // 1. 魔法封印装备入包自动解封
    enableInheritOnChange: true,        // 2. 魔封转换数值保底继承 + 解除单槽锁定限制
    enableKillMobBoost: true,           // 3. 刷图杀怪概率提升穿戴中魔封装备词条等级
    enableEpicRerollTicket: true,       // 4. 史诗魔法封印洗练券
    epicRerollTicketItemId: 1230,       // 史诗魔封洗练券道具 ID
};

// random_option::CRandomOptionItemHandle::give_option (0x085F2CC6)
const CRandomOptionItemHandle_Give_Option = new NativeFunction(
    ptr(0x085F2CC6),
    'int',
    ['pointer', 'uint', 'int', 'int', 'int', 'int', 'pointer'],
    { "abi": "sysv" }
);
// GlobalData::g_randomOptionHandle (0x0941F820)
const GlobalData_g_randomOptionHandle = ptr(0x0941F820);

/** 单件穿戴装备概率升级魔法封印词条等级 */
function _tryBoostEquippedMagicSeal(invenItem) {
    const cinven = context.utils.cinven;
    if (!invenItem || invenItem.isNull() || cinven.Inven_Item_IsEmpty(invenItem))
        return false;

    const getRandomInt = context.system.common.getRandomInt;
    const randomOption = invenItem.add(37);
    const optionSlot = getRandomInt(0, 3);
    if (!randomOption.add(3 * optionSlot).readU8())
        return false;

    const valueSlot = getRandomInt(1, 3);
    const curLevel = randomOption.add(3 * optionSlot + valueSlot).readU8();
    if (curLevel < 0xFF && getRandomInt(curLevel, 100000) < 1000) {
        randomOption.add(3 * optionSlot + valueSlot).writeU8(curLevel + 1);
        return true;
    }
    return false;
}

/** 杀怪时遍历穿戴栏装备尝试升级词条 */
function _boostUserEquippedMagicSeals(user) {
    const cinven = context.utils.cinven;
    const inven = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacInvenW(user);
    for (let slot = 10; slot <= 21; slot++) {
        const invenItem = cinven.CInventory_GetInvenRef(inven, cinven.INVENTORY_TYPE.INVENTORY_TYPE_BODY, slot);
        if (_tryBoostEquippedMagicSeal(invenItem)) {
            context.utils.cuser.CUser_SendUpdateItemList(user, 1, 3, slot);
        }
    }
}

/** 使用史诗魔封洗练券重置物品栏第一排(槽位 9..16)史诗装备的魔法封印 */
function _rerollFirstRowEpicMagicSeal(user) {
    const cinven = context.utils.cinven;
    const citem = context.utils.citem;
    const cequip = context.utils.cequipItem;
    const cdata = context.utils.cdataManager;
    const cuser = context.utils.cuser;

    const handlePtr = GlobalData_g_randomOptionHandle.readPointer();
    if (!handlePtr || handlePtr.isNull())
        return;

    const inven = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacInvenW(user);
    let rerolledCount = 0;

    for (let slot = 9; slot <= 16; slot++) {
        const equIn = cinven.CInventory_GetInvenRef(inven, cinven.INVENTORY_TYPE.INVENTORY_TYPE_ITEM, slot);
        if (!equIn || equIn.isNull() || !cinven.Inven_Item_IsEquipableItemType(equIn))
            continue;

        const itemId = cinven.Inven_Item_GetKey(equIn);
        if (!itemId)
            continue;

        const itemData = cdata.api_CDataManager_Find_Item(itemId);
        if (!itemData || itemData.isNull())
            continue;

        if (citem.CItem_GetRarity(itemData) !== 4)
            continue;

        const equType = itemData.add(141 * 4).readU32();
        if (equType === 11) // 跳过称号
            continue;

        // 清空全部 14 字节魔法封印数据 (offset 37..50)
        for (let offset = 37; offset <= 50; offset++) {
            equIn.add(offset).writeU8(0);
        }

        const ok = CRandomOptionItemHandle_Give_Option(
            handlePtr,
            itemId,
            citem.CItem_GetRarity(itemData),
            citem.CItem_GetUsableLevel(itemData),
            citem.CItem_GetItemGroupName(itemData),
            cequip.CEquipItem_GetRandomOptionGrade(itemData),
            equIn.add(37)
        );
        if (ok) {
            cuser.CUser_SendUpdateItemList(user, 1, 0, slot);
            rerolledCount++;
        }
    }

    if (rerolledCount > 0) {
        cuser.api_CUser_SendNotiPacketMessage(user, `魔法封印洗练完成：已重置第一排 ${rerolledCount} 件史诗装备的魔法封印属性！`, 1);
    } else {
        cuser.api_CUser_SendNotiPacketMessage(user, '提示：物品栏第一排未检测到可洗练魔法封印的史诗装备（不含称号）。', 8);
    }
}

module.exports = {
    hooks: [
        // 1. 魔法封印自动解封：CInventory::insertItemIntoInventory (0x08502D86)
        {
            address: '0x08502D86',
            onEnter(args) {
                this._msInsertUser = args[0].readPointer();
            },
            onLeave(retval) {
                const user = this._msInsertUser;
                this._msInsertUser = null;
                if (!_config.enableAutoUnseal || !user || user.isNull())
                    return;

                const slot = retval.toInt32();
                if (slot <= 0)
                    return;

                const cinven = context.utils.cinven;
                const citem = context.utils.citem;
                const cequip = context.utils.cequipItem;
                const cdata = context.utils.cdataManager;

                const inven = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacInvenW(user);
                const invenItem = cinven.CInventory_GetInvenRef(inven, cinven.INVENTORY_TYPE.INVENTORY_TYPE_ITEM, slot);
                if (!invenItem || invenItem.isNull() || !cinven.Inven_Item_IsEquipableItemType(invenItem))
                    return;

                const itemId = cinven.Inven_Item_GetKey(invenItem);
                const citemPtr = cdata.api_CDataManager_Find_Item(itemId);
                if (!citemPtr || citemPtr.isNull() || !cequip.CEquipItem_IsRandomOption(citemPtr))
                    return;

                // 若已有魔法封印词条（如暗黑刷宝模块已写入），则跳过不覆盖
                const randomOption = invenItem.add(37);
                if (randomOption.readU32() || randomOption.add(4).readU32() || randomOption.add(8).readShort())
                    return;

                const handlePtr = GlobalData_g_randomOptionHandle.readPointer();
                if (!handlePtr || handlePtr.isNull())
                    return;

                const ret = CRandomOptionItemHandle_Give_Option(
                    handlePtr,
                    itemId,
                    citem.CItem_GetRarity(citemPtr),
                    citem.CItem_GetUsableLevel(citemPtr),
                    citem.CItem_GetItemGroupName(citemPtr),
                    cequip.CEquipItem_GetRandomOptionGrade(citemPtr),
                    randomOption
                );
                if (ret) {
                    context.utils.cuser.CUser_SendUpdateItemList(user, 1, 0, slot);
                }
            }
        },
        // 2. 魔法封印变换数值继承与槽位扩展：CRandomOptionItemHandle::change_option (0x085F3340)
        {
            address: '0x085F3340',
            onEnter(args) {
                if (!_config.enableInheritOnChange) {
                    this._msRandOpt = null;
                    return;
                }
                const randOpt = args[7];
                const idx = args[6].toInt32();
                this._msRandOpt = randOpt;
                this._msChangeIdx = idx;
                this._msOrigVal1 = randOpt.add(3 * idx + 1).readU8();
                this._msOrigVal2 = randOpt.add(3 * idx + 2).readU8();
            },
            onLeave(retval) {
                const randOpt = this._msRandOpt;
                this._msRandOpt = null;
                if (!_config.enableInheritOnChange || !randOpt || randOpt.isNull())
                    return;

                if (retval.toInt32() === 1) {
                    let emptyIdx = -1;
                    if (randOpt.add(0).readU8() === 0) emptyIdx = 0;
                    else if (randOpt.add(3).readU8() === 0) emptyIdx = 1;
                    else if (randOpt.add(6).readU8() === 0) emptyIdx = 2;

                    // 词条数不足3条且洗出低等级词条时，直接开新词条槽附魔进去
                    if (emptyIdx >= 0 && randOpt.add(11).readU8() <= 5 && randOpt.add(12).readU8() <= 5) {
                        randOpt.add(3 * emptyIdx).writeU8(randOpt.add(10).readU8());
                        randOpt.add(3 * emptyIdx + 1).writeU8(randOpt.add(11).readU8());
                        randOpt.add(3 * emptyIdx + 2).writeU8(randOpt.add(12).readU8());
                        randOpt.add(10).writeInt(0);
                        return;
                    }

                    // 覆盖新词条种类，数值取历史最高值保底继承，并清空单槽变换锁定记录
                    const idx = this._msChangeIdx;
                    randOpt.add(3 * idx).writeU8(randOpt.add(10).readU8());
                    if (randOpt.add(11).readU8() > this._msOrigVal1) {
                        randOpt.add(3 * idx + 1).writeU8(randOpt.add(11).readU8());
                    } else {
                        randOpt.add(3 * idx + 1).writeU8(this._msOrigVal1);
                    }
                    if (randOpt.add(12).readU8() > this._msOrigVal2) {
                        randOpt.add(3 * idx + 2).writeU8(randOpt.add(12).readU8());
                    } else {
                        randOpt.add(3 * idx + 2).writeU8(this._msOrigVal2);
                    }
                    randOpt.add(10).writeInt(0);
                }
            }
        },
        // 3 & 4. 杀怪词条升级 + 史诗魔封洗练券：cHistoryTrace::operator() (0x854F990)
        {
            address: '0x854F990',
            onEnter(args) {
                const historyLog = args[1].readUtf8String(-1);
                const group = historyLog.split(',');
                if (!group[13])
                    return;
                const gameEvent = group[13].slice(1);

                if (gameEvent === 'KillMob' && _config.enableKillMobBoost) {
                    const accId = parseInt(group[1], 10);
                    const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                    if (user && !user.isNull()) {
                        _boostUserEquippedMagicSeals(user);
                    }
                    return;
                }

                if (gameEvent === 'Item-' && _config.enableEpicRerollTicket) {
                    const reason = parseInt(group[18], 10);
                    const itemId = parseInt(group[15], 10);
                    if (reason === 3 && itemId === _config.epicRerollTicketItemId) {
                        const accId = parseInt(group[1], 10);
                        const user = context.utils.gameWorld.api_GameWorld_Find_User_From_World_ByAccid(accId);
                        if (user && !user.isNull()) {
                            _rerollFirstRowEpicMagicSeal(user);
                        }
                    }
                }
            }
        }
    ]
};
