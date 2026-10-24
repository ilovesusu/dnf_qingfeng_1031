/**
 * dungeon-equip-enhance.js
 * 副本增强与动态刷怪系统 + 拾取装备随机词条（暗黑刷宝模式）
 * 包含 GM 在线热开关命令：
 *   //zt                     查看当前副本增强与随机词条状态
 *   //zq [复制数] [额外等级] 开启/关闭副本增强模式（可选动态修改复制怪数量与额外等级）
 *   //sj                     开启/关闭随机刷怪模式
 *   //zb                     开启/关闭强制随机装备词条模式（开罐/取仓库也生效）
 */

var _config = {
    gmAuth: context.config.gmCid,

    // 副本增强默认状态与参数
    enhanceDungeonDefault: false,       // 开服是否默认开启增强副本模式（可通过 //zq 在线切换）
    randomMonsterDefault: false,        // 开服是否默认开启随机刷怪模式（可通过 //sj 在线切换）
    copyMonsterCount: 1,                // 开启副本增强时每只怪额外复制数量（0 表示不复制仅强化精英/等级）
    addMonsterLevel: 10,                // 开启副本增强时额外增加的怪物等级

    // 暗黑刷宝随机装备属性配置
    pickupEnhanceAlwaysOn: true,        // 副本内地面拾取装备时是否始终触发随机强化/增幅/宝珠/魔封/锻造（无需先开 //zq）
    forceEquipEnhanceDefault: false,    // 是否对所有入包装备（含仓库取出/开罐）强制触发随机属性（可通过 //zb 在线切换）
    enableRandomBreath: false,          // 是否写入随机双异界气息（注意：写入异界气息后裂魂装备不可再精炼，默认关闭更安全）

    cmd: {
        status: 'zt',
        toggleDungeon: 'zq',
        toggleRandomMob: 'sj',
        toggleForceEquip: 'zb',
    }
};

// 宝珠卡片池（提取自 20130613 PVF stackable/monstercard）
const ALL_MONSTER_CARDS = [];
for (let id = 3600; id <= 3800; id++) {
    ALL_MONSTER_CARDS.push(id);
}

// 魔法封印词条类型池（提取自 PVF etc/randomoption/randomoption.lst）
const ALL_RANDOM_OPTIONS = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
    51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 67,
    70, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
    96, 97, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    130, 131, 132, 133, 134, 140, 141, 142, 143, 144, 145, 150, 151, 152, 153,
    240, 241, 242, 243, 244, 245, 246, 247
];

// 随机普通怪池、APC池、BOSS池与清风1031跳过名单
const ALL_MONSTER_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 31, 32, 33, 34, 35, 37, 38, 39, 40, 50, 51, 52, 53, 60, 61, 63, 64, 65, 70, 72, 75, 76, 77, 78, 80, 81, 82, 83, 84, 200, 201, 202, 210, 211, 212, 220, 221, 222, 250, 251, 252, 253, 260, 261, 262, 263, 264, 265, 266, 270, 271, 272, 273, 280, 281, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 413, 420, 421, 422, 430, 500, 501, 502, 600, 601, 602, 603, 604, 605, 606, 607, 610, 700, 701, 702, 704, 705, 711, 750, 751, 752, 760, 761, 762, 770, 771, 900, 901, 902, 903, 904, 905, 906, 907, 908, 909, 1000, 1001, 1006, 1010, 1011, 1012, 1013, 1014, 1016, 1017, 1019, 1020, 1021, 1022, 1031, 1032, 1033, 1038, 1039, 1040, 1041, 1042, 1043, 1050, 1051, 1052, 1053, 1060, 1061, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1100, 1101, 3000, 3001, 3002, 3010, 3011, 3012, 3013, 3014, 3015, 3016, 3017, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 50000, 50001, 50002, 50003, 50004, 50005, 50006, 50007, 50008, 50009, 50010, 50011, 50012, 50023, 50024, 50030, 50031, 50032, 50033, 50034, 50062, 50063, 50064, 50065, 50066, 50067, 50068, 50069, 50070, 50071, 50072, 50073, 50074, 50075, 50076, 50077, 50078, 50079, 50080, 50081, 50082, 50083, 50084, 50085, 50086, 50087, 50088, 50089, 50090, 50091, 50092, 50093, 50094, 50095, 50096, 50097, 50098];
const ALL_APC_IDS = [201, 202, 203, 204, 205, 301, 305, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 500, 501, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 900, 902, 1301, 1400, 1401, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1510, 1511, 1512, 1513, 1514, 1515, 1516, 1517, 1518, 1519, 1600, 1601];
const ALL_BOSS_IDS = [15, 17, 251, 711, 1010, 3000, 61456, 62116];
const SKIP_MAP_IDS = new Set([16348, 16349, 16350, 16351, 16352, 16353, 16354, 17057, 17024, 17025, 17702, 17703, 60052, 17100, 17101]);
const SKIP_MONSTER_IDS = new Set([71, 61496, 61105, 61103, 61110, 61805, 1034, 1030, 62123, 62515, 56160, 61228, 61226, 64016, 61273]);

let _enhanceDungeon = false;
let _randomMonster = false;
let _forceEquipEnhance = false;
let _copyMonster = 1;
let _addMonsterLevel = 10;

let _curUserLevel = 60;
let _dungeonDifficult = 0;
let _killMonsterNum = 0;
let _isUserPickupItem = false;

/** 对入包装备赋予暗黑刷宝随机属性 */
function _applyRandomAffixesToEquip(invenItem, user) {
    const getRandomInt = context.system.common.getRandomInt;
    const cinven = context.utils.cinven;
    const citem = context.utils.citem;
    const cdata = context.utils.cdataManager;
    const cinfo = context.utils.cuserCharacInfo;

    const itemId = cinven.Inven_Item_GetKey(invenItem);
    const itemData = cdata.api_CDataManager_Find_Item(itemId);
    if (!itemData || itemData.isNull())
        return;

    // 1. 随机强化 +1 ~ +13
    invenItem.add(6).writeU8(getRandomInt(1, 14));

    // 2. 品质设为最上级 & 耐久度补满
    invenItem.add(7).writeUInt(0);
    invenItem.add(11).writeU16(30);

    // 3. 随机附魔宝珠
    const cardId = ALL_MONSTER_CARDS[getRandomInt(0, ALL_MONSTER_CARDS.length)];
    invenItem.add(13).writeUInt(cardId);

    // 4. 随机红字增幅属性类型（1体 2精 3力 4智，力智权重更高）
    let incType = 0;
    while (incType === 0) {
        incType = getRandomInt(3, 10) % 5;
    }
    invenItem.add(17).writeU8(incType);

    // 5. 随机增幅附加数值
    const userLevel = Math.max(1, cinfo.CUserCharacInfo_Get_Charac_Level(user));
    const equRarity = citem.CItem_GetRarity(itemData);
    const rarityRatio = 1 + equRarity / 2;
    const levelBonus = _enhanceDungeon ? _addMonsterLevel : 0;
    const userLvRatio = 1 + (userLevel + levelBonus) / 10;
    const diffRatio = 1 + _dungeonDifficult / 4;
    const baseData = getRandomInt(500, 2000) * 0.01 * rarityRatio * userLvRatio * diffRatio;
    let incVal = baseData;
    if (_enhanceDungeon && _randomMonster) {
        incVal += baseData;
    }
    if (_enhanceDungeon && _copyMonster > 0) {
        incVal += baseData * _copyMonster * 0.2;
    }
    invenItem.add(18).writeU16(Math.min(65535, Math.max(1, Math.floor(incVal))));

    // 6. 随机 4 词条魔法封印
    let opt = ALL_RANDOM_OPTIONS[getRandomInt(0, ALL_RANDOM_OPTIONS.length)];
    let optVal = getRandomInt(1, 65535);
    invenItem.add(47).writeU8(opt);
    invenItem.add(48).writeU16(optVal);
    invenItem.add(50).writeU8(3);
    for (let i = 0; i < 3; i++) {
        opt = ALL_RANDOM_OPTIONS[getRandomInt(0, ALL_RANDOM_OPTIONS.length)];
        optVal = getRandomInt(1, 65535);
        invenItem.add(37 + i * 3).writeU8(opt);
        invenItem.add(38 + i * 3).writeU16(optVal);
    }

    // 7. 可选双异界气息
    if (_config.enableRandomBreath) {
        const b1 = getRandomInt(0, 63) * 2 + 1;
        let b2 = getRandomInt(0, 63) * 2 + 1;
        while (b2 === b1) {
            b2 = getRandomInt(0, 63) * 2 + 1;
        }
        invenItem.add(31).writeU8(b1);
        invenItem.add(32).writeU8(b2);
    }

    // 8. 武器部位（equType === 10）随机锻造 +1 ~ +10
    const equType = itemData.add(141 * 4).readU32();
    if (equType === 10) {
        invenItem.add(51).writeU8(getRandomInt(1, 11));
    }
}

/** 副本刷怪增强处理器（注册到 game-utils 统一分发器，无递归死循环） */
function _handleAddMob(mapInfo, monster, MapInfo_Add_Mob_Orig) {
    if (!_enhanceDungeon)
        return undefined;

    const mapIdU16 = mapInfo.add(4).readU16();
    // 跳过怪物攻城专属地图
    if (mapIdU16 >= 40001 && mapIdU16 <= 40095)
        return undefined;

    const getRandomInt = context.system.common.getRandomInt;
    const mapIdU32 = mapInfo.add(4).readUInt();
    const monsterUidPtr = monster.add(4);
    const monsterTypePtr = monster.add(8);
    const monsterIdPtr = monster.add(12);
    const monsterLvPtr = monster.add(16);

    const newLv = Math.min(127, Math.max(1, _curUserLevel + _addMonsterLevel));
    monsterLvPtr.writeU8(newLv);

    const mType = monsterTypePtr.readU8();
    if (mType === 0) {
        // 普通怪提升为精英怪（英雄级难度4下写2粉名会客户端闪退，故固定写1橙名）
        if (_dungeonDifficult !== 4) {
            monsterTypePtr.writeU8(getRandomInt(1, 3));
        } else {
            monsterTypePtr.writeU8(1);
        }

        if (!SKIP_MONSTER_IDS.has(monsterIdPtr.readUInt()) && !SKIP_MAP_IDS.has(mapIdU32)) {
            if (_copyMonster > 0) {
                for (let c = 0; c < _copyMonster; c++) {
                    if (_randomMonster) {
                        monsterIdPtr.writeUInt(ALL_MONSTER_IDS[getRandomInt(0, ALL_MONSTER_IDS.length)]);
                    }
                    MapInfo_Add_Mob_Orig(mapInfo, monster);
                    monster.writeUInt(monster.readUInt() + 1000);
                    monsterUidPtr.writeU16((monsterUidPtr.readU16() + 1000) & 0xFFFF);
                }
            }
            if (_randomMonster) {
                monsterIdPtr.writeUInt(ALL_MONSTER_IDS[getRandomInt(0, ALL_MONSTER_IDS.length)]);
            }
        }
    } else if (mType === 3) {
        // BOSS 怪复制与随机
        if (!SKIP_MONSTER_IDS.has(monsterIdPtr.readU16()) && !SKIP_MAP_IDS.has(mapIdU32)) {
            if (_copyMonster > 0) {
                const bossExtraCnt = _copyMonster + 3;
                for (let c = 0; c < bossExtraCnt; c++) {
                    monster.writeUInt(monster.readUInt() + 1);
                    monsterUidPtr.writeU16((monsterUidPtr.readU16() + 1) & 0xFFFF);
                    if (_randomMonster) {
                        monsterIdPtr.writeUInt(ALL_BOSS_IDS[getRandomInt(0, ALL_BOSS_IDS.length)]);
                    }
                    MapInfo_Add_Mob_Orig(mapInfo, monster);
                }
            }
            if (_randomMonster) {
                monsterIdPtr.writeUInt(ALL_BOSS_IDS[getRandomInt(0, ALL_BOSS_IDS.length)]);
            }
        }
    } else if (_randomMonster) {
        // APC 类怪物（5 / 8）仅随机模型
        monsterIdPtr.writeUInt(ALL_APC_IDS[getRandomInt(0, ALL_APC_IDS.length)]);
    }

    // 返回 undefined 交由底层原函数生成最后一只主体怪
    return undefined;
}

function _registerGmHelp() {
    if (!context.gmHelpRegistry) {
        context.gmHelpRegistry = new Map();
    }
    const defs = [
        { cmd: _config.cmd.status, params: '', desc: '查看副本增强与暗黑随机词条状态' },
        { cmd: _config.cmd.toggleDungeon, params: '[复制怪数] [额外等级]', desc: '开启/关闭增强副本模式(可选指定参数)' },
        { cmd: _config.cmd.toggleRandomMob, params: '', desc: '开启/关闭副本随机刷怪模式' },
        { cmd: _config.cmd.toggleForceEquip, params: '', desc: '开启/关闭全入包装备强制随机词条模式' },
    ];
    for (const d of defs) {
        context.gmHelpRegistry.set(d.cmd, { ...d, moduleName: module.name });
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
        _enhanceDungeon = !!_config.enhanceDungeonDefault;
        _randomMonster = !!_config.randomMonsterDefault;
        _forceEquipEnhance = !!_config.forceEquipEnhanceDefault;
        _copyMonster = _config.copyMonsterCount;
        _addMonsterLevel = _config.addMonsterLevel;

        context.utils.cdungeon.registerAddMobHandler(module.name, _handleAddMob);
        _registerGmHelp();
    },
    dispose() {
        context.utils.cdungeon.unregisterAddMobHandler(module.name);
        _unregisterGmHelp();
        _isUserPickupItem = false;
    },
    hooks: [
        // GM 热开关命令 //zt, //zq, //sj, //zb
        {
            address: '0x820BBDE',
            onEnter(args) {
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const characNo = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacNo(user);
                if (!Array.isArray(_config.gmAuth) || !_config.gmAuth.includes(characNo))
                    return;

                const rawBuf = context.system.packet.api_PacketBuf_Get_Buf(args[2]);
                const msgLen = rawBuf.readInt();
                const msg = rawBuf.add(4).readUtf8String(msgLen).slice(2).trim();
                if (!msg)
                    return;

                const parts = msg.split(/\s+/);
                const cmdName = parts[0];
                const sendMsg = context.utils.cuser.api_CUser_SendNotiPacketMessage;

                if (cmdName === _config.cmd.status) {
                    sendMsg(user, '-------------------', 1);
                    sendMsg(user, `增强副本模式(//zq) : ${_enhanceDungeon}`, 1);
                    sendMsg(user, `副本拾取随机词条 : ${_config.pickupEnhanceAlwaysOn || _enhanceDungeon}`, 1);
                    sendMsg(user, `全入包强制随机词条(//zb) : ${_forceEquipEnhance}`, 1);
                    sendMsg(user, `复制怪物数量 : ${_copyMonster}`, 1);
                    sendMsg(user, `额外增加怪物等级 : ${_addMonsterLevel}`, 1);
                    sendMsg(user, `随机怪物模式(//sj) : ${_randomMonster}`, 1);
                } else if (cmdName === _config.cmd.toggleDungeon) {
                    if (parts.length >= 2) {
                        const newCopy = parseInt(parts[1], 10);
                        if (!Number.isNaN(newCopy) && newCopy >= 0 && newCopy <= 10) {
                            _copyMonster = newCopy;
                        }
                        if (parts.length >= 3) {
                            const newLv = parseInt(parts[2], 10);
                            if (!Number.isNaN(newLv) && newLv >= 0 && newLv <= 120) {
                                _addMonsterLevel = newLv;
                            }
                        }
                        _enhanceDungeon = true;
                        sendMsg(user, `已开启增强副本 (复制怪物:${_copyMonster}, 额外等级:+${_addMonsterLevel})`, 1);
                    } else {
                        _enhanceDungeon = !_enhanceDungeon;
                        sendMsg(user, _enhanceDungeon ? '开启增强副本' : '关闭增强副本', 1);
                    }
                } else if (cmdName === _config.cmd.toggleRandomMob) {
                    _randomMonster = !_randomMonster;
                    sendMsg(user, _randomMonster ? '开启随机刷怪' : '关闭随机刷怪', 1);
                } else if (cmdName === _config.cmd.toggleForceEquip) {
                    _forceEquipEnhance = !_forceEquipEnhance;
                    sendMsg(user, _forceEquipEnhance ? '开启强制随机装备属性' : '关闭强制随机装备属性', 1);
                }
            }
        },
        // DisPatcher_SelectDungeon::process (0x081C8102)：记录进图角色等级并重置杀怪计数
        {
            address: '0x081C8102',
            onEnter(args) {
                const user = args[1];
                if (user && !user.isNull()) {
                    _curUserLevel = context.utils.cuserCharacInfo.CUserCharacInfo_Get_Charac_Level(user);
                }
                _killMonsterNum = 0;
            }
        },
        // CParty::dungeon_start (0x085A0954)：记录副本难度
        {
            address: '0x085A0954',
            onEnter(args) {
                _dungeonDifficult = args[2].toInt32();
            }
        },
        // CParty::sumGainedEachExp (0x085A2488)：修正高跨级刷怪经验
        {
            address: '0x085A2488',
            onEnter(args) {
                if (!_enhanceDungeon)
                    return;
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const cinfo = context.utils.cuserCharacInfo;
                const userLv = Math.max(1, cinfo.CUserCharacInfo_Get_Charac_Level(user));
                const diffMul = 3 + _dungeonDifficult;
                const lvMul = 1 + (_addMonsterLevel / userLv) * 2;
                const rewardExp = Math.floor((cinfo.CUserCharacInfo_Get_Level_Up_Exp(user, userLv) / userLv / 300) * diffMul * lvMul);
                args[2].writeInt(Math.max(1, rewardExp));
            }
        },
        // CParty::OnKilledMonster (0x085B5A4C)：统计击杀怪物数量
        {
            address: '0x085B5A4C',
            onEnter(args) {
                _killMonsterNum++;
            }
        },
        // CParty::getClearRewardBonusExp (0x085AD278)：通关结算经验倍率补偿
        {
            address: '0x085AD278',
            onEnter(args) {
                if (!_enhanceDungeon)
                    return;
                const user = args[1];
                if (!user || user.isNull())
                    return;
                const cinfo = context.utils.cuserCharacInfo;
                const userLv = Math.max(1, cinfo.CUserCharacInfo_Get_Charac_Level(user));
                const mobMul = _killMonsterNum / 300;
                const diffMul = 3 + _dungeonDifficult;
                const lvMul = 1 + (_addMonsterLevel / userLv) * 2;
                const rewardExp = Math.floor((cinfo.CUserCharacInfo_Get_Level_Up_Exp(user, userLv) / userLv) * mobMul * diffMul * lvMul);
                args[2].writeInt(Math.max(1, rewardExp));
            }
        },
        // CParty::get_item (0x085A3B98)：标记副本内地面拾取动作
        {
            address: '0x085A3B98',
            onEnter(args) {
                _isUserPickupItem = true;
            },
            onLeave(retval) {
                _isUserPickupItem = false;
            }
        },
        // CInventory::insertItemIntoInventory (0x08502D86)：拾取或强制模式下随机赋予装备词条
        {
            address: '0x08502D86',
            onEnter(args) {
                this._deInsertUser = args[0].readPointer();
            },
            onLeave(retval) {
                const user = this._deInsertUser;
                this._deInsertUser = null;
                if (!user || user.isNull())
                    return;

                if (!_forceEquipEnhance) {
                    const allowPickup = _config.pickupEnhanceAlwaysOn || _enhanceDungeon;
                    if (!allowPickup || !_isUserPickupItem)
                        return;
                }

                const slot = retval.toInt32();
                if (slot <= 0)
                    return;

                const cinven = context.utils.cinven;
                const inven = context.utils.cuserCharacInfo.CUserCharacInfo_GetCurCharacInvenW(user);
                const invenItem = cinven.CInventory_GetInvenRef(inven, cinven.INVENTORY_TYPE.INVENTORY_TYPE_ITEM, slot);
                if (!invenItem || invenItem.isNull() || !cinven.Inven_Item_IsEquipableItemType(invenItem))
                    return;

                _applyRandomAffixesToEquip(invenItem, user);
                context.utils.cuser.CUser_SendUpdateItemList(user, 1, 0, slot);
            }
        }
    ]
};
