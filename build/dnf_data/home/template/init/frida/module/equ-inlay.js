/**
 * equ-inlay.js
 * 真·装备镶嵌（需要DLL或登录器支持）
 * 20250927 by Tim
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

const { api_PacketBuf_Get_Buf,
    api_PacketBuf_Get_Byte,
    api_PacketBuf_Get_Short,
    api_PacketBuf_Get_Int,
    InterfacePacketBuf_Put_Packet,
    InterfacePacketBuf_Put_Header,
    InterfacePacketBuf_Put_Int,
    InterfacePacketBuf_Put_Byte,
    InterfacePacketBuf_Put_Short,
    InterfacePacketBuf_Put_Binary,
    InterfacePacketBuf_Finalize,

    Destroy_PacketGuard_PacketGuard,
    api_PacketGuard_PacketGuard, } = context.system.packet;

const { api_ScheduleOnMainThread, api_ScheduleOnMainThread_Delay } = context.system.thread;

const { api_MySQL_Exec_Safe } = context.mysql.dbUtils;

const { getConFromConfig } = context.mysql.dbConnector;

const { api_Get_Jewel_Socket_Data,
    api_Exit_Jewel_Data,
    api_Insert_Jewel_Socket_Data,
    api_Update_Equiment_Socket } = context.mysql.fridaService;

const { CUser_Get_State,
    CUser_CheckItemLock,
    CUser_Send,
    CUser_SendCmdErrorPacket,
    CUser_SendUpdateItemList,
    api_CUser_SendNotiPacketMessage,
    api_CUser_SendAlertPacketMessage } = context.utils.cuser;

const { CUser_SendUpdateEqu_JewelSocket } = context.utils.cuserEx;

const { CUserCharacInfo_GetCurCharacNo,
    CUserCharacInfo_GetCurCharacInvenW } = context.utils.cuserCharacInfo;

const { CInventory_GetInvenRef,
    CInventory_Delete_Item,
    Inven_Item_GetKey,
    Inven_Item_IsEmpty } = context.utils.cinven;

const { CItem_Is_Stackable } = context.utils.citem;

const { CStackableItem_GetItemType,
    CStackableItem_GetJewelTargetSocket } = context.utils.cstackableItem;

const { api_CDataManager_Find_Item } = context.utils.cdataManager;

//所要用到的函数 
var CEquipItem_GetItemType = new NativeFunction(ptr(0x08514D26), 'int', ['pointer'], { "abi": "sysv" });
var CItem_GetItemGroupName = new NativeFunction(ptr(0x80F1312), 'int', ['pointer'], { "abi": "sysv" });
/**获取时装管理器*/
var CInventory_GetAvatarItemMgrR = new NativeFunction(ptr(0x80DD576), 'pointer', ['pointer'], { "abi": "sysv" });
/**获取时装插槽数据*/
var WongWork_CAvatarItemMgr_GetJewelSocketData = new NativeFunction(ptr(0x82F98F8), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
/**时装镶嵌数据存盘*/
var DB_UpdateAvatarJewelSlot_MakeRequest = new NativeFunction(ptr(0x843081C), 'pointer', ['int', 'int', 'pointer'], { "abi": "sysv" });


////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

function _lengthCutting(str, ystr, num, maxLength) {//ByteArray转十六进制文本数据
    var strArr = '';
    var length = str.length;
    while (str.length < maxLength) {
        str = '0'.concat(str)
    }
    for (var i = 0; i < str.length; i += num) {
        strArr = str.slice(i, i + num).concat(strArr)
    }
    return ystr + strArr;
}

function _set_JewelSocketData(jewelSocketData, slot, emblem_item_id) {
    if (!jewelSocketData.isNull()) {
        //每个槽数据长6个字节: 2字节槽类型+4字节徽章item_id
        //镶嵌不改变槽类型, 这里只修改徽章id
        jewelSocketData.add(slot * 6 + 2).writeInt(emblem_item_id);
    }
    return;
}

/**0代表开孔失败 成功返回标识 */
function _add_equiment_socket(equipment_type) {//0代表开孔失败 成功返回标识
    /*
    武器10
    称号11
    上衣12
    头肩13
    下衣14
    鞋子15
    腰带16
    项链17
    手镯18
    戒指19
    辅助装备20
    魔法石21
    */

    /*
    红色:'010000000000010000000000000000000000000000000000000000000000'	A
    黄色:'020000000000020000000000000000000000000000000000000000000000'	B
    绿色:'040000000000040000000000000000000000000000000000000000000000'	C
    蓝色:'080000000000080000000000000000000000000000000000000000000000'	D
    白金:'100000000000100000000000000000000000000000000000000000000000'
    */
    var DB_JewelsocketData = '';
    switch (equipment_type) {
        case 10://武器10	SS
            DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
            break;
        case 11://称号11	SS
            DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
            break;
        case 12://上衣12 	C
            DB_JewelsocketData = '040000000000040000000000000000000000000000000000000000000000'
            break;
        case 13://头肩13	B
            DB_JewelsocketData = '020000000000020000000000000000000000000000000000000000000000'
            break;
        case 14://下衣14	C
            DB_JewelsocketData = '040000000000040000000000000000000000000000000000000000000000'
            break;
        case 15://鞋子15	D
            DB_JewelsocketData = '080000000000080000000000000000000000000000000000000000000000'
            break;
        case 16://腰带16	A
            DB_JewelsocketData = '010000000000010000000000000000000000000000000000000000000000'
            break;
        case 17://项链17	B
            DB_JewelsocketData = '020000000000020000000000000000000000000000000000000000000000'
            break;
        case 18://手镯18	D
            DB_JewelsocketData = '080000000000080000000000000000000000000000000000000000000000'
            break;
        case 19://戒指19	A
            DB_JewelsocketData = '010000000000010000000000000000000000000000000000000000000000'
            break;
        case 20://辅助装备20	S
            DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
            break;
        case 21://魔法石21		S
            DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
            break;
        default:
            DB_JewelsocketData = '000000000000000000000000000000000000000000000000000000000000'
            break;
    }
    return api_Insert_Jewel_Socket_Data(DB_JewelsocketData);
}

function _andonglishanbai_Equipment_inlay() {//装备镶嵌
    var CTitleBook_putItemData = new NativeFunction(ptr(0x08641A6A), 'int', ['pointer', 'pointer', 'int', 'pointer'], { "abi": "sysv" });	//称号回包
    Interceptor.replace(ptr(0x08641A6A), new NativeCallback(function (CTitleBook, PacketGuard, a3, Inven_Item) {
        var JewelSocketData = Memory.alloc(30);
        var ret = CTitleBook_putItemData(CTitleBook, PacketGuard, a3, Inven_Item);
        JewelSocketData = api_Get_Jewel_Socket_Data(Inven_Item.add(25).readU32())
        if (JewelSocketData && JewelSocketData.add(0).readU8() != 0) {
            InterfacePacketBuf_Put_Binary(PacketGuard, JewelSocketData, 30);
            return ret;
        }
        return ret
    }, 'int', ['pointer', 'pointer', 'int', 'pointer']));

    var CUser_copyItemOption = new NativeFunction(ptr(0x08671EB2), 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });//设计图继承
    Interceptor.replace(ptr(0x08671EB2), new NativeCallback(function (CUser, Inven_Item1, Inven_Item2) {
        var jewelSocketID = Inven_Item2.add(25).readU32()
        Inven_Item1.add(25).writeU32(jewelSocketID)
        return CUser_copyItemOption(CUser, Inven_Item1, Inven_Item2);
    }, 'int', ['pointer', 'pointer', 'pointer']));


    var Dispatcher_AddSocketToAvatar_dispatch_sig = new NativeFunction(ptr(0x0821A412), 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x0821A412), new NativeCallback(function (Dispatcher_AddSocketToAvatar, CUser, PacketBuf) {//装备开孔
        var pack = Memory.alloc(0x20000)
        Memory.copy(pack, PacketBuf, 1000)
        var ret = 0;
        try {
            var equ_slot = api_PacketBuf_Get_Short(pack);//装备所在位置
            var equitem_id = api_PacketBuf_Get_Int(pack);//装备代码

            var item = api_CDataManager_Find_Item(equitem_id);//取出pvf文件
            var ItemType = CEquipItem_GetItemType(item)	//这个地方是获取标识的 10是武器 11是称号
            if (ItemType == 10) {
                api_CUser_SendAlertPacketMessage(CUser, '武器类型的装备暂不支持打孔。', 1);
                CUser_SendCmdErrorPacket(CUser, 209, 0);//回包防假死  
                return 0;
            } else if (ItemType == 11) {
                api_CUser_SendAlertPacketMessage(CUser, '称号类型的装备暂不支持打孔。', 1);
                CUser_SendCmdErrorPacket(CUser, 209, 0);//回包防假死，注意称号不要关闭，不然扔到称号铺炸数据！
                return 0;

            }

            var sta_slot = api_PacketBuf_Get_Short(pack);//道具所在位置
            var CurCharacInvenW = CUserCharacInfo_GetCurCharacInvenW(CUser);//获取人物背包
            var inven_item = CInventory_GetInvenRef(CurCharacInvenW, 1, equ_slot);//获取背包对应槽位的装备物品对象
            //var is_equ = inven_item.add(1).readU8()//是否为装备物品
            if (equ_slot > 56) {//修改后：大于56则是时装装备   原：如果不是装备文件就调用原逻辑
                equ_slot = equ_slot - 57;
                var C_PacketBuf = api_PacketBuf_Get_Buf(PacketBuf)//获取原始封包数据
                C_PacketBuf.add(0).writeShort(equ_slot)//修改掉装备位置信息 时装类镶嵌从57开始。
                return Dispatcher_AddSocketToAvatar_dispatch_sig(Dispatcher_AddSocketToAvatar, CUser, PacketBuf);

            }
            var equ_id = inven_item.add(25).readU32()
            if (api_Exit_Jewel_Data(equ_id) == 1) {//判断是否存在数据槽位
                CUser_SendCmdErrorPacket(CUser, 209, 19);
                return 0;
            }

            var id = _add_equiment_socket(ItemType)//生成槽位
            CInventory_Delete_Item(CurCharacInvenW, 1, sta_slot, 1, 8, 1);//删除打孔道具
            inven_item.add(25).writeU32(id)//写入槽位标识
            CUser_SendUpdateItemList(CUser, 1, 0, equ_slot);
            var packet_guard = api_PacketGuard_PacketGuard();
            InterfacePacketBuf_Put_Header(packet_guard, 1, 209);
            InterfacePacketBuf_Put_Byte(packet_guard, 1);
            InterfacePacketBuf_Put_Short(packet_guard, equ_slot + 104);//装备槽位 从104开始返回给本地处理显示正确的装备
            InterfacePacketBuf_Put_Short(packet_guard, sta_slot);//道具槽位
            InterfacePacketBuf_Finalize(packet_guard, 1);
            CUser_Send(CUser, packet_guard);
            Destroy_PacketGuard_PacketGuard(packet_guard);
        } catch (error) {
            log(ERROR, `[${module.name}]`, error);
        }
        return 0;
    }, 'int', ['pointer', 'pointer', 'pointer']));
    Interceptor.attach(ptr(0x8217BD6), {//装备镶嵌和时装镶嵌
        onEnter: function (args) {

            try {
                var user = args[1];
                var packet_buf = args[2];
                var state = CUser_Get_State(user);
                if (state != 3) {
                    return;
                }
                //解析packet_buf
                var avartar_inven_slot = api_PacketBuf_Get_Short(packet_buf); //时装所在的背包槽
                var avartar_item_id = api_PacketBuf_Get_Int(packet_buf);//时装item_id
                var emblem_cnt = api_PacketBuf_Get_Byte(packet_buf);//本次镶嵌徽章数量

                //下面是参照原时装镶嵌的思路写的。个别点标记出来。
                if (avartar_inven_slot > 104) {//为了不与时装镶嵌冲突,用孔位来判断,小于104是时装装备

                    var equipment_inven_slot = avartar_inven_slot - 104;//取出真实装备所在背包位置值
                    var inven = CUserCharacInfo_GetCurCharacInvenW(user);
                    var equipment = CInventory_GetInvenRef(inven, 1, equipment_inven_slot);
                    if (Inven_Item_IsEmpty(equipment) || (Inven_Item_GetKey(equipment) != avartar_item_id)) {
                        CUser_SendCmdErrorPacket(user, 204, 22); //缺少镶嵌媒介
                        return;
                    }
                    if (CUser_CheckItemLock(user, 1, equipment_inven_slot)) {
                        CUser_SendCmdErrorPacket(user, 204, 213);// 213 物品锁定
                        return;
                    }

                    var id = equipment.add(25).readU32();
                    var JewelSocketData = Memory.alloc(30);//空字节数据
                    JewelSocketData = api_Get_Jewel_Socket_Data(id)//取出原有的孔位以及徽章数据
                    if (JewelSocketData && JewelSocketData.isNull()) {//为空则不进行镶嵌
                        CUser_SendCmdErrorPacket(user, 204, 4); // 缺少孔位
                        return;
                    }

                    if (emblem_cnt <= 3) {
                        var emblems = {};
                        for (var i = 0; i < emblem_cnt; i++) {
                            var emblem_inven_slot = api_PacketBuf_Get_Short(packet_buf);
                            var emblem_item_id = api_PacketBuf_Get_Int(packet_buf);
                            var equipment_socket_slot = api_PacketBuf_Get_Byte(packet_buf);
                            var emblem = CInventory_GetInvenRef(inven, 1, emblem_inven_slot);
                            if (Inven_Item_IsEmpty(emblem) || (Inven_Item_GetKey(emblem) != emblem_item_id) || (equipment_socket_slot >= 3)) {
                                CUser_SendCmdErrorPacket(user, 204, 17);
                                return;
                            }

                            var citem = api_CDataManager_Find_Item(emblem_item_id);
                            if (citem && citem.isNull()) {
                                CUser_SendCmdErrorPacket(user, 204, 17);
                                return;
                            }

                            if (!CItem_Is_Stackable(citem) || (CStackableItem_GetItemType(citem) != 20)) {
                                CUser_SendCmdErrorPacket(user, 204, 17);
                                return;
                            }

                            var emblem_socket_type = CStackableItem_GetJewelTargetSocket(citem);
                            var avartar_socket_type = JewelSocketData.add(equipment_socket_slot * 6).readU16();

                            if (!(emblem_socket_type & avartar_socket_type)) {
                                CUser_SendCmdErrorPacket(user, 204, 17);
                                return;
                            }

                            emblems[equipment_socket_slot] = [emblem_inven_slot, emblem_item_id];
                        }
                    }

                    for (var equipment_socket_slot in emblems) {
                        var emblem_inven_slot = emblems[equipment_socket_slot][0];
                        CInventory_Delete_Item(inven, 1, emblem_inven_slot, 1, 8, 1);
                        var emblem_item_id = emblems[equipment_socket_slot][1];
                        JewelSocketData.add(2 + 6 * equipment_socket_slot).writeU32(emblem_item_id)
                    }
                    var DB_JewelSocketData = '';//用于生成镶嵌后的数据
                    for (var i = 0; i <= 4; i++) {
                        DB_JewelSocketData = _lengthCutting(JewelSocketData.add(i * 6).readU16().toString(16), DB_JewelSocketData, 2, 4)
                        DB_JewelSocketData = _lengthCutting(JewelSocketData.add(2 + i * 6).readU32().toString(16), DB_JewelSocketData, 2, 8)
                    }
                    var a = api_Update_Equiment_Socket(DB_JewelSocketData, id)//保存数据,向数据库中写入数据
                    if (a == 0) {//0为失败
                        CUser_SendCmdErrorPacket(user, 204, 17);
                        return;
                    }
                    CUser_SendUpdateEqu_JewelSocket(user, equipment_inven_slot);//用于更新镶嵌后的装备显示,这里用的是带镶嵌数据的更新背包函数,并非CUser_SendUpdateItemList
                    var packet_guard = api_PacketGuard_PacketGuard();
                    InterfacePacketBuf_Put_Header(packet_guard, 1, 209);//呼出弹窗
                    InterfacePacketBuf_Put_Byte(packet_guard, 1);
                    InterfacePacketBuf_Put_Short(packet_guard, equipment_inven_slot + 104);//装备槽位+104发送回本地让本地处理正确的数据 
                    InterfacePacketBuf_Finalize(packet_guard, 1);
                    CUser_Send(user, packet_guard);
                    Destroy_PacketGuard_PacketGuard(packet_guard);
                    return;
                }
                //以下是fr自带的嵌入逻辑
                //获取时装道具
                var inven = CUserCharacInfo_GetCurCharacInvenW(user);
                var avartar = CInventory_GetInvenRef(inven, 2, avartar_inven_slot);

                //校验时装 数据是否合法
                if (Inven_Item_IsEmpty(avartar) || (Inven_Item_GetKey(avartar) != avartar_item_id)) {
                    CUser_SendCmdErrorPacket(user, 204, 22); //缺少镶嵌媒介
                    return;
                }
                if (CUser_CheckItemLock(user, 2, avartar_inven_slot)) {
                    CUser_SendCmdErrorPacket(user, 204, 213);// 213 物品锁定
                    return;
                }

                //获取时装插槽数据
                var avartar_add_info = avartar.add(7).readInt();
                var inven_avartar_mgr = CInventory_GetAvatarItemMgrR(inven);
                var jewel_socket_data = WongWork_CAvatarItemMgr_GetJewelSocketData(inven_avartar_mgr, avartar_add_info);
                //log('jewel_socket_data=' + jewel_socket_data + ':' + bin2hex(jewel_socket_data, 30));

                if (jewel_socket_data.isNull()) {
                    CUser_SendCmdErrorPacket(user, 204, 4); // 缺少孔位
                    return;
                }

                //最多只支持3个插槽
                if (emblem_cnt <= 3) {
                    var emblems = {};

                    for (var i = 0; i < emblem_cnt; i++) {
                        //徽章所在的背包槽
                        var emblem_inven_slot = api_PacketBuf_Get_Short(packet_buf);
                        //徽章item_id
                        var emblem_item_id = api_PacketBuf_Get_Int(packet_buf);
                        //该徽章镶嵌的时装插槽id
                        var avartar_socket_slot = api_PacketBuf_Get_Byte(packet_buf);

                        //log('emblem_inven_slot=' + emblem_inven_slot + ', emblem_item_id=' + emblem_item_id + ', avartar_socket_slot=' + avartar_socket_slot);

                        //获取徽章道具
                        var emblem = CInventory_GetInvenRef(inven, 1, emblem_inven_slot);

                        //校验徽章及插槽数据是否合法
                        if (Inven_Item_IsEmpty(emblem) || (Inven_Item_GetKey(emblem) != emblem_item_id) || (avartar_socket_slot >= 3)) {
                            CUser_SendCmdErrorPacket(user, 204, 17);
                            return;
                        }

                        //校验徽章是否满足时装插槽颜色要求

                        //获取徽章pvf数据
                        var citem = api_CDataManager_Find_Item(emblem_item_id);
                        if (citem && citem.isNull()) {
                            CUser_SendCmdErrorPacket(user, 204, 17);
                            return;
                        }

                        //校验徽章类型
                        if (!CItem_Is_Stackable(citem) || (CStackableItem_GetItemType(citem) != 20)) {
                            CUser_SendCmdErrorPacket(user, 204, 17);
                            return;
                        }

                        //获取徽章支持的插槽
                        var emblem_socket_type = CStackableItem_GetJewelTargetSocket(citem);

                        //获取要镶嵌的时装插槽类型
                        var avartar_socket_type = jewel_socket_data.add(avartar_socket_slot * 6).readShort();

                        if (!(emblem_socket_type & avartar_socket_type)) {
                            //插槽类型不匹配
                            //log('socket type not match!');
                            CUser_SendCmdErrorPacket(user, 204, 17);
                            return;
                        }

                        emblems[avartar_socket_slot] = [emblem_inven_slot, emblem_item_id];
                    }

                    //开始镶嵌
                    for (var avartar_socket_slot in emblems) {
                        //删除徽章
                        var emblem_inven_slot = emblems[avartar_socket_slot][0];
                        CInventory_Delete_Item(inven, 1, emblem_inven_slot, 1, 8, 1);

                        //设置时装插槽数据
                        var emblem_item_id = emblems[avartar_socket_slot][1];
                        _set_JewelSocketData(jewel_socket_data, avartar_socket_slot, emblem_item_id);

                        //log('徽章item_id=' + emblem_item_id + '已成功镶嵌进avartar_socket_slot=' + avartar_socket_slot + '的槽内!');
                    }

                    //时装插槽数据存档
                    DB_UpdateAvatarJewelSlot_MakeRequest(CUserCharacInfo_GetCurCharacNo(user), avartar.add(7).readInt(), jewel_socket_data);

                    //通知客户端时装数据已更新
                    CUser_SendUpdateItemList(user, 1, 1, avartar_inven_slot);

                    //回包给客户端
                    var packet_guard = api_PacketGuard_PacketGuard();
                    InterfacePacketBuf_Put_Header(packet_guard, 1, 204);
                    InterfacePacketBuf_Put_Int(packet_guard, 1);
                    InterfacePacketBuf_Finalize(packet_guard, 1);
                    CUser_Send(user, packet_guard);
                    Destroy_PacketGuard_PacketGuard(packet_guard);

                    //log('镶嵌请求已处理完成!');
                }


            } catch (error) {
                log(ERROR, `[${module.name}]`, 'fix_use_emblem throw Exception:' + error);
            }


        },
        onLeave: function (retval) {
            //返回值改为0  不再踢线
            retval.replace(0);
        }
    });

    Interceptor.replace(ptr(0x0815098e), new NativeCallback(function (PacketBuf, Inven_Item) {//额外数据包,发送装备镶嵌数据给本地处理
        var ret = InterfacePacketBuf_Put_Packet(PacketBuf, Inven_Item);
        if (Inven_Item.add(1).readU8() == 1) {
            var JewelSocketData = Memory.alloc(30);
            JewelSocketData = api_Get_Jewel_Socket_Data(Inven_Item.add(25).readU32())
            if (JewelSocketData && JewelSocketData.add(0).readU8() != 0) {
                InterfacePacketBuf_Put_Binary(PacketBuf, JewelSocketData, 30);
                return ret;
            }
        }
        return ret;
    }, 'int', ['pointer', 'pointer']));
    var Inter_AuctionResultMyRegistedItems_dispatch_sig = new NativeFunction(ptr(0x084D7758), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D7758), new NativeCallback(function (Inter_AuctionResultMyRegistedItems, CUser, src, a4) {//上架显示
        //每个物品占117字节 所以每个物品的偏移量是117
        var JewelSocketData = Memory.alloc(30)
        var count = src.add(5).readU8()//获取上架物品数量
        for (var i = 0; i < count; i++) {//遍历写入数据
            var item_id = src.add(37 + 117 * i).readU32();
            var item = api_CDataManager_Find_Item(item_id);
            var item_groupname = CItem_GetItemGroupName(item)
            if (item_groupname > 0 && item_groupname < 59) {//1-58是装备
                JewelSocketData = api_Get_Jewel_Socket_Data(src.add(59 + i * 117).readU32())
                Memory.copy(src.add(89 + i * 117), JewelSocketData, 30);
            }
        }
        var ret = Inter_AuctionResultMyRegistedItems_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser, src, a4)
        return ret;
    }, 'int', ['pointer', 'pointer', 'pointer', 'int']));
    var Inter_AuctionResultItemList_dispatch_sig = new NativeFunction(ptr(0x084D75BC), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D75BC), new NativeCallback(function (Inter_AuctionResultMyRegistedItems, CUser, src, a4) {//搜索显示
        //每个物品占137字节 所以每个物品的偏移量是137
        var JewelSocketData = Memory.alloc(30)
        var count = src.add(5).readU8()//获取上架物品数量
        for (var i = 0; i < count; i++) {//遍历写入数据
            var item_id = src.add(54 + 137 * i).readU32();
            var item = api_CDataManager_Find_Item(item_id);
            var item_groupname = CItem_GetItemGroupName(item)
            if (item_groupname > 0 && item_groupname < 59) {//1-58是装备
                JewelSocketData = api_Get_Jewel_Socket_Data(src.add(76 + i * 137).readU32())
                Memory.copy(src.add(106 + i * 137), JewelSocketData, 30);
            }
        }
        var ret = Inter_AuctionResultItemList_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser, src, a4)
        return ret;
    }, 'int', ['pointer', 'pointer', 'pointer', 'int']));
    var Inter_AuctionResultMyBidding_dispatch_sig = new NativeFunction(ptr(0x084D78F4), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D78F4), new NativeCallback(function (Inter_AuctionResultMyRegistedItems, CUser, src, a4) {//竞拍显示
        //每个物品占125字节 所以每个物品的偏移量是125
        var JewelSocketData = Memory.alloc(30)
        var count = src.add(5).readU8()//获取上架物品数量
        for (var i = 0; i < count; i++) {//遍历写入数据
            var item_id = src.add(46 + 125 * i).readU32();
            var item = api_CDataManager_Find_Item(item_id);
            var item_groupname = CItem_GetItemGroupName(item)
            if (item_groupname > 0 && item_groupname < 59) {//1-58是装备
                JewelSocketData = api_Get_Jewel_Socket_Data(src.add(68 + i * 125).readU32())
                Memory.copy(src.add(98 + i * 125), JewelSocketData, 30);
            }
        }
        var ret = Inter_AuctionResultMyBidding_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser, src, a4)
        return ret;
    }, 'int', ['pointer', 'pointer', 'pointer', 'int']));
    Interceptor.replace(ptr(0x0814A62E), new NativeCallback(function (Inven_Item, CInven_Item) {//装备全字节复制
        Memory.copy(Inven_Item, CInven_Item, 61)
        return Inven_Item;
    }, 'pointer', ['pointer', 'pointer']));
    Interceptor.replace(ptr(0x080CB7D8), new NativeCallback(function (Inven_Item) {//装备全字节删除
        var MReset = Memory.alloc(61)
        Memory.copy(Inven_Item, MReset, 61)
        return Inven_Item;
    }, 'pointer', ['pointer']));
    Memory.patchCode(ptr(0x085A6563), 72, function (code) {//装备掉落全字节保存
        var cw = new X86Writer(code, { pc: ptr(0x085A6563) });
        cw.putLeaRegRegOffset('eax', 'ebp', -392);//lea eax, [ebp-188h]
        cw.putLeaRegRegOffset('ebx', 'ebp', -213);//lea ebx, [ebp-0D5h]
        cw.putMovRegOffsetPtrU32('esp', 8, 61)
        cw.putMovRegOffsetPtrReg('esp', 4, 'eax')
        cw.putMovRegOffsetPtrReg('esp', 0, 'ebx')
        cw.putCallAddress(ptr(0x0807d880))
        cw.putLeaRegRegOffset('eax', 'ebp', -392);//lea eax, [ebp-188h]
        cw.putLeaRegRegOffset('ebx', 'ebp', -300);//
        cw.putAddRegImm('ebx', 0x10)//add ebx,0x10
        cw.putMovRegOffsetPtrU32('esp', 8, 61)//mov [esp+8],61
        cw.putMovRegOffsetPtrReg('esp', 4, 'eax')
        cw.putMovRegOffsetPtrReg('esp', 0, 'ebx')
        cw.putCallAddress(ptr(0x0807d880))
        cw.putNop()
        cw.putNop()
        cw.putNop()
        cw.putNop()
        cw.putNop()
        cw.flush();
    });
    //	Memory.patchCode(ptr(0x0820154E), 12, function (code) {//装备调整箱强制最上级,我用的功能,你不用可以删除掉
    //       var cw = new X86Writer(code, { pc: ptr(0x0820154E)});
    //        cw.putMovRegU32('eax',0x5);
    //		cw.putNop()
    //		cw.putNop()
    //		cw.putMovRegU32('eax',0x5);
    //        cw.flush();
    //    });
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

//module.name 获取模块名
module.exports = {
    init() {

        // 初始化数据库
        api_ScheduleOnMainThread_Delay(() => {
            const mysql = getConFromConfig('frida');
            if (mysql) {// 创建徽章数据库表
                const result = api_MySQL_Exec_Safe(mysql, 'CREATE TABLE IF NOT EXISTS data (\
            equ_id int(11) AUTO_INCREMENT, jewel_data blob NOT NULL,andonglishanbai_flag int(11),date datetime,\
            PRIMARY KEY  (equ_id)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8,AUTO_INCREMENT = 150;');//创建数据库，排序从150开始，也可以从大一点的数值开始
                log(`[${module.name}]`, 'Init DataBase ', result ? 'Success' : 'Error', '!');
            }
        }, null, 100);

        // 模块初始化时调用，可选
        _andonglishanbai_Equipment_inlay();
    },

};
