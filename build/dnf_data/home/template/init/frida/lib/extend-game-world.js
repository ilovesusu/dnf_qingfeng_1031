/**
 * extend-game-world.js
 * GameWorld 相关模块(拓展模块)
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid // GM权限ID，用于权限验证（全局配置文件'frida_config.json'中设置）
}

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

const { strlen, get_rand_int } = context.system.common;

const { CUser_Send,
    CUser_SendPacket,
    CUser_SendUpdateItemList } = context.utils.cuser;

const { api_CItem_GetItemName,
    CItem_Is_Stackable } = context.utils.citem;

const { CEquipItem_Get_Endurance } = context.utils.cequipItem;

const { api_CDataManager_Find_Item } = context.utils.cdataManager;

const { api_GameWorld_Send_All_With_State,
    api_GameWorld_Foreach } = context.utils.gameWorld;

const { CUserCharacInfo_GetCurCharacNo } = context.utils.cuserCharacInfo;

const { api_SendSystemMultiMail } = context.utils.cuserEx;


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
    api_GameWorld_SendHyperLinkChatMsg_Emoji(strarr, msgtype, Symbol) {
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
            api_GameWorld_Send_All_With_State(packet_guard, 3);
        } finally {
            // 清理数据包
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }

    },
    /**
     * 多表情超链接高亮消息
     * @param {*} user  用户
     * @param {*} strarr 消息数组【消息类型str/其他，消息，rgba，Symbol】 
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
     */
    api_GameWorld_SendHyperLinkChatMsg_Multi_Emoji(strarr, msgtype) {
        const bufferSize = 2048;
        const strptr = Memory.alloc(bufferSize);
        let startlen = 0;
        let cnt = 0;

        // 准备表情符号数据
        const emojiBytes1 = [0xc2, 0x80, 0x20];
        strptr.add(startlen).writeByteArray(emojiBytes1);
        startlen += emojiBytes1.length;

        // 处理消息字符串数组
        for (const item of strarr) {
            const [strtype, msgContent, flags, symbol] = item;

            // strptr.add(startlen).writeByteArray([0xc2, 0x80]);
            // startlen += 2; // 更新起始长度

            // 准备表情符号数据
            const emojiBytes = symbol >= 1 ? [0xc2, 0x80, 0x20, 0x1e, 0x20, symbol, 0x1f] : [0xc2, 0x80, 0x20];
            strptr.add(startlen).writeByteArray(emojiBytes);
            startlen += emojiBytes.length;

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
                const [_, msgdetail, flags,] = item;
                if (flags[3] === 255) {
                    const RbgInfoptr = Memory.alloc(104);
                    RbgInfoptr.writeByteArray(flags);
                    // 处理消息类型
                    if (typeof msgdetail === 'number') {
                        RbgInfoptr.add(0x4).writeU32(msgdetail);
                        const Citem = api_CDataManager_Find_Item(msgdetail);
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
            api_GameWorld_Send_All_With_State(packet_guard, 3); // 只给状态 >= 3 的玩家发送公告

        } finally {
            // 清理数据包
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }
    },
    /**
     * 给频道内所有在线玩家发送多附件系统邮件
     * @param {string} title 邮件标题
     * @param {string} text 邮件正文
     * @param {number} gold 金币数量
     * @param {Array<[number, number]>} itemList 道具列表 [[itemId, count], ...]
     */
    api_GameWorld_SendMail(title, text, gold, itemList) {
        api_GameWorld_Foreach((user) => {
            var characNo = CUserCharacInfo_GetCurCharacNo(user);
            api_SendSystemMultiMail(characNo, title, text, gold, itemList);
        }, null);
    }
}

//module.name 获取模块名
module.exports = {
    api
};
