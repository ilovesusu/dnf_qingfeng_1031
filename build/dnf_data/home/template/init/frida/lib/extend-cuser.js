/**
 * extend-cuser.js
 * cuser 相关模块（拓展模块）
 */

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { InterfacePacketBuf_Put_Header,
    InterfacePacketBuf_Put_Byte,
    InterfacePacketBuf_Put_Short,
    InterfacePacketBuf_Put_Int,
    InterfacePacketBuf_Put_Str,
    InterfacePacketBuf_Put_Binary,
    InterfacePacketBuf_Finalize,

    Destroy_PacketGuard_PacketGuard,
    api_PacketGuard_PacketGuard, } = context.system.packet;

const { strlen,get_rand_int } = context.system.common;

const { api_Get_Jewel_Socket_Data } = context.mysql.fridaService;

const { UPDATE_TYPE_INVENTORY,
    UPDATE_TYPE_AVATAR,
    UPDATE_TYPE_CREATURE,
    UPDATE_TYPE_BODY } = context.utils.cuser.UPDATE_TYPE;
const { CUser_Send,
    CUser_SendPacket,
    CUser_SendUpdateItemList,
    CUser_GetServerGroup,
    api_CUser_AddItem } = context.utils.cuser;

const { CUserCharacInfo_GetCurCharacInvenW,
    CUserCharacInfo_GetCurCharacNo } = context.utils.cuserCharacInfo;

const { INVENTORY_TYPE_BODY,
    INVENTORY_TYPE_ITEM,
    INVENTORY_TYPE_AVARTAR,
    INVENTORY_TYPE_CREATURE } = context.utils.cinven.INVENTORY_TYPE;

const { Inven_Item_Inven_Item,
    Inven_Item_Reset,
    Inven_Item_GetKey,
    Inven_Item_IsEquipableItemType,
    CInventory_GetInvenRef,
    CInventory_Delete_Item,
    CInventory_MakeItemPacket } = context.utils.cinven;

const { api_CItem_GetItemName,
    CItem_GetItemIndex,
    CItem_Is_Stackable } = context.utils.citem;

const { CEquipItem_Get_Endurance } = context.utils.cequipItem;

const { G_CDataManager,
    api_CDataManager_Find_Item } = context.utils.cdataManager;

/** 服务端原生道具构造器（自动初始化装备品级/耐久度/堆叠数量/时装宠物属性） */
var CItemList_create_item = new NativeFunction(ptr(0x08511FB8), 'int', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });

/** 发系统邮件(单道具/多道具) */
var ReqDBSendNewSystemMail = new NativeFunction(ptr(0x085555E8), 'int', ['pointer', 'pointer', 'int', 'int', 'pointer', 'int', 'int', 'int', 'char', 'char'], { "abi": "sysv" });
var WongWork_CMailBoxHelper_ReqDBSendNewSystemMultiMail = new NativeFunction(ptr(0x8556B68), 'int', ['pointer', 'pointer', 'int', 'int', 'int', 'pointer', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
var WongWork_CMailBoxHelper_MakeSystemMultiMailPostal = new NativeFunction(ptr(0x8556A14), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });

/** std::vector<std::pair<int, int>> 相关操作 */
var std_vector_std_pair_int_int_vector = new NativeFunction(ptr(0x81349D6), 'pointer', ['pointer'], { "abi": "sysv" });
var std_vector_std_pair_int_int_clear = new NativeFunction(ptr(0x817A342), 'pointer', ['pointer'], { "abi": "sysv" });
var std_make_pair_int_int = new NativeFunction(ptr(0x81B8D41), 'pointer', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
var std_vector_std_pair_int_int_push_back = new NativeFunction(ptr(0x80DD606), 'pointer', ['pointer', 'pointer'], { "abi": "sysv" });

 
////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

const api = {
    /** 刷新带镶嵌装备 */
    CUser_SendUpdateEqu_JewelSocket(CUser, Slot) {
        var v4 = CUserCharacInfo_GetCurCharacInvenW(CUser);
        var equipment = CInventory_GetInvenRef(v4, INVENTORY_TYPE_ITEM, Slot);
        if (Inven_Item_IsEquipableItemType(equipment))//判断是否是装备
        {
            var id = equipment.add(25).readU32();
            var JewelSocketData = Memory.alloc(30);//空字节数据
            JewelSocketData = api_Get_Jewel_Socket_Data(id)//取出原有的孔位以及徽章数据

            if (JewelSocketData && !JewelSocketData.isNull()) {//如果有镶嵌则发送镶嵌数据
                var v10 = api_PacketGuard_PacketGuard();
                try {
                    InterfacePacketBuf_Put_Header(v10, 0, 14);
                    InterfacePacketBuf_Put_Byte(v10, 0);
                    InterfacePacketBuf_Put_Short(v10, 1);
                    CInventory_MakeItemPacket(v4, 1, Slot, v10);
                    InterfacePacketBuf_Put_Binary(v10, JewelSocketData, 30);
                    InterfacePacketBuf_Finalize(v10, 1);
                    CUser_Send(CUser, v10);
                } finally {
                    Destroy_PacketGuard_PacketGuard(v10);
                }
                return;
            }
        }
        CUser_SendUpdateItemList(CUser, 1, UPDATE_TYPE_INVENTORY, Slot);
    },
    /**
    * 超链接高亮消息
    * @param {*} user  用户
    * @param {*} strarr 消息数组【消息类型str/其他，消息，rgba】 
    * @param {*} msgtype 广播类型
    0.为上方系统公告栏   
    1.为下方对话框/绿色  
    2.为下方对话框/蓝色  
    3.为下方对话框/白色  
    5.为下方对话框/白色  
    6.为下方对话框/紫色  
    7.为下方对话框/绿色  
    8.为下方对话框/橙色  
    9.为下方对话框/蓝色  
    10.为喇叭，但是会乱码      
    11.为喇叭  
    12.为喇叭  
    13.为喇叭  
    14.为喇叭  
    * @param {*} Symbol 表情
    */
    api_CUser_SendHyperLinkChatMsg_Emoji(user, strarr, msgtype, Symbol) {
        const bufferSize = 2048;
        const strptr = Memory.alloc(bufferSize);
        let startlen = 0;
        let cnt = 0;

        // 准备表情符号数据
        const emojiBytes = Symbol >= 1 ? [0xc2, 0x80, 0x20, 0x1e, 0x20, Symbol, 0x1f] : [0xc2, 0x80, 0x20];
        strptr.add(startlen).writeByteArray(emojiBytes);
        startlen += emojiBytes.length;

        // 处理消息字符串数组
        for (const item of strarr) {
            const [strtype, msgContent, flags] = item;

            strptr.add(startlen).writeByteArray([0xc2, 0x80]);
            startlen += 2; // 更新起始长度 

            const msgstr = (strtype === 'str') ? msgContent + '' : '[' + api_CItem_GetItemName(parseInt(msgContent)) + ']';
            const str_ptr = Memory.allocUtf8String(msgstr);
            const str_len = strlen(str_ptr);
            strptr.add(startlen).writeByteArray(str_ptr.readByteArray(str_len));
            startlen += str_len;

            // 检查是否需要添加额外的字节 
            if (flags[3] === 255) {
                strptr.add(startlen).writeByteArray([0xc2, 0x80]);
                startlen += 2;
                cnt++;
            }
        }
        // 结束字符串并准备数据包
        strptr.add(startlen).writeByteArray([0xc2, 0x80]);
        startlen += 2;
        const packet_guard = api_PacketGuard_PacketGuard();
        try {
            InterfacePacketBuf_Put_Header(packet_guard, 0, 370);
            InterfacePacketBuf_Put_Byte(packet_guard, msgtype);
            InterfacePacketBuf_Put_Short(packet_guard, 0);
            InterfacePacketBuf_Put_Byte(packet_guard, 0);
            InterfacePacketBuf_Put_Int(packet_guard, startlen);
            InterfacePacketBuf_Put_Str(packet_guard, strptr, startlen);
            InterfacePacketBuf_Put_Byte(packet_guard, cnt);
            // 处理附加信息
            for (const item of strarr) {
                const [_, msgtype, flags] = item;
                if (flags[3] === 255) {
                    const RbgInfoptr = Memory.alloc(104);
                    RbgInfoptr.writeByteArray(flags);
                    // 处理消息类型
                    if (typeof msgtype === 'number') {
                        RbgInfoptr.add(0x4).writeU32(msgtype);
                        const Citem = api_CDataManager_Find_Item(msgtype);
                        if (!CItem_Is_Stackable(Citem)) {
                            RbgInfoptr.add(0x8).writeU32(get_rand_int(0));
                            RbgInfoptr.add(0xe).writeU16(CEquipItem_Get_Endurance(Citem));
                        }
                    }
                    InterfacePacketBuf_Put_Binary(packet_guard, RbgInfoptr, 104);
                }
            }
            // 完成数据包
            InterfacePacketBuf_Finalize(packet_guard, 1);
            // 发送数据包
            CUser_SendPacket(user, 1, packet_guard);
        } finally {
            // 清理数据包
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }

    },
    /**
     * 发送单道具系统邮件给指定角色（支持传入在线 CUser* 指针，或 { characNo, serverGroup } 对象支持离线发送）
     * @param {*} userOrTarget 在线角色指针 CUser*，或 { characNo: number, serverGroup: number }
     * @param {string} title 发件人名称
     * @param {string} text 邮件正文
     * @param {number} itemId 道具ID
     * @param {number} itemCount 道具数量
     * @param {number} gold 金币数量
     * @param {number} mailDate 有效天数
     * @returns {boolean} 是否成功提交邮件请求
     */
    api_SendSystemMailSingleItem(userOrTarget, title, text, itemId, itemCount, gold = 0, mailDate = 30) {
        if (!userOrTarget)
            return false;

        var retItem = api_CDataManager_Find_Item(itemId);
        if (!retItem || retItem.isNull())
            return false;

        var characNo = 0;
        var serverGroup = 0;
        if (typeof userOrTarget === 'object' && typeof userOrTarget.characNo === 'number') {
            characNo = userOrTarget.characNo;
            serverGroup = userOrTarget.serverGroup ?? 0;
        } else {
            if (typeof userOrTarget.isNull === 'function' && userOrTarget.isNull())
                return false;
            characNo = CUserCharacInfo_GetCurCharacNo(userOrTarget);
            serverGroup = CUser_GetServerGroup(userOrTarget);
        }
        if (!characNo)
            return false;

        var invenItemPtr = Memory.alloc(100);
        Inven_Item_Inven_Item(invenItemPtr);
        Inven_Item_Reset(invenItemPtr);
        var realItemId = CItem_GetItemIndex(retItem);
        invenItemPtr.add(2).writeInt(realItemId);

        // 调用服务端原生 CItemList::create_item 初始化耐久度、随机品级、堆叠数或时装/宠物属性
        var itemListPtr = G_CDataManager().add(0xC).readPointer();
        if (itemListPtr && !itemListPtr.isNull()) {
            CItemList_create_item(itemListPtr, 0, invenItemPtr, itemCount);
        } else {
            var itemType = retItem.add(8).readU8();
            invenItemPtr.writeU8(itemType);
            invenItemPtr.add(7).writeInt(itemCount);
        }

        var titlePtr = Memory.allocUtf8String(title);
        var txtPtr = Memory.allocUtf8String(text);
        var txtLen = strlen(txtPtr);
        ReqDBSendNewSystemMail(titlePtr, invenItemPtr, gold, characNo, txtPtr, txtLen, mailDate, serverGroup, 0, 0);
        return true;
    },
    /**
     * 发送多道具附件系统邮件（最多10格附件）
     * @param {number} targetCharacNo 目标角色charac_no
     * @param {string} title 邮件标题/发件人
     * @param {string} text 邮件正文
     * @param {number} gold 金币数量
     * @param {Array<[number, number]>} itemList 道具数组 [[itemId, count], ...]
     */
    api_SendSystemMultiMail(targetCharacNo, title, text, gold, itemList) {
        var vector = Memory.alloc(100);
        std_vector_std_pair_int_int_vector(vector);
        std_vector_std_pair_int_int_clear(vector);

        for (var i = 0; i < itemList.length; ++i) {
            var itemIdPtr = Memory.alloc(4);
            var itemCntPtr = Memory.alloc(4);
            itemIdPtr.writeInt(itemList[i][0]);
            itemCntPtr.writeInt(itemList[i][1]);
            var pair = Memory.alloc(100);
            std_make_pair_int_int(pair, itemIdPtr, itemCntPtr);
            std_vector_std_pair_int_int_push_back(vector, pair);
        }

        var additionSlots = Memory.alloc(1000);
        for (var j = 0; j < 10; ++j) {
            Inven_Item_Inven_Item(additionSlots.add(j * 61));
        }
        WongWork_CMailBoxHelper_MakeSystemMultiMailPostal(vector, additionSlots, 10);
        var titlePtr = Memory.allocUtf8String(title);
        var textPtr = Memory.allocUtf8String(text);
        var textLen = strlen(textPtr);
        WongWork_CMailBoxHelper_ReqDBSendNewSystemMultiMail(titlePtr, additionSlots, itemList.length, gold, targetCharacNo, textPtr, textLen, 0, 99, 1);
    },
    /**
     * 发送客户端获得道具弹窗通知（协议 163）
     * @param {*} user 在线玩家指针
     * @param {Array<[number, number]>} itemList 道具列表 [[itemId, count], ...]
     */
    api_SendItemWindowNotification(user, itemList) {
        if (!user || user.isNull() || !Array.isArray(itemList) || itemList.length === 0)
            return;
        const packetGuard = api_PacketGuard_PacketGuard();
        try {
            InterfacePacketBuf_Put_Header(packetGuard, 1, 163);
            InterfacePacketBuf_Put_Byte(packetGuard, 1);
            InterfacePacketBuf_Put_Short(packetGuard, 0);
            InterfacePacketBuf_Put_Int(packetGuard, 0);
            InterfacePacketBuf_Put_Short(packetGuard, itemList.length);
            for (let i = 0; i < itemList.length; i++) {
                InterfacePacketBuf_Put_Int(packetGuard, itemList[i][0]);
                InterfacePacketBuf_Put_Int(packetGuard, itemList[i][1]);
            }
            InterfacePacketBuf_Finalize(packetGuard, 1);
            CUser_Send(user, packetGuard);
        } finally {
            Destroy_PacketGuard_PacketGuard(packetGuard);
        }
    },
    /**
     * 批量添加物品到角色背包并弹出客户端获得物品提示窗口
     * @param {*} user 在线玩家指针
     * @param {Array<[number, number]>} itemList 道具列表 [[itemId, count], ...]
     */
    api_CUser_AddItemListWithWindow(user, itemList) {
        if (!user || user.isNull() || !Array.isArray(itemList) || itemList.length === 0)
            return;
        for (let i = 0; i < itemList.length; i++) {
            api_CUser_AddItem(user, itemList[i][0], itemList[i][1]);
        }
        api.api_SendItemWindowNotification(user, itemList);
    }
}

//module.name 获取模块名
module.exports = {
    api
};
