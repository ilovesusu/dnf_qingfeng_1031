/**
 * base-cuser.js
 * CUser 相关模块（基础模块）
 * 20250914 by Tim
 */

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { InterfacePacketBuf_Put_Header,
    InterfacePacketBuf_Put_Byte,
    InterfacePacketBuf_Put_Short,
    InterfacePacketBuf_Finalize,
    InterfacePacketBuf_Clear,
    Destroy_PacketGuard_PacketGuard,

    api_PacketGuard_PacketGuard,
    api_PacketBuf_Get_Buf,
    api_InterfacePacketBuf_Put_String } = context.system.packet;

const { api_ScheduleOnMainThread } = context.system.thread;

/** 发送道具*/
var CUser_AddItem = new NativeFunction(ptr(0x867B6D4), 'int', ['pointer', 'int', 'int', 'int', 'pointer', 'int'], { "abi": "sysv" });
/** 角色增加经验*/
var CUser_Gain_Exp_Sp = new NativeFunction(ptr(0x866A3FE), 'int', ['pointer', 'int', 'pointer', 'pointer', 'int', 'int', 'int'], { "abi": "sysv" });
/** 获取角色状态*/
var CUser_Get_State = new NativeFunction(ptr(0x80DA38C), 'int', ['pointer'], { "abi": "sysv" });
/** 获取角色账号id */
var CUser_Get_Acc_Id = new NativeFunction(ptr(0x80DA36E), 'int', ['pointer'], { "abi": "sysv" });
/** 获取角色所在队伍 */
var CUser_GetParty = new NativeFunction(ptr(0x0865514C), 'pointer', ['pointer'], { "abi": "sysv" });
/** 获取角色扩展数据 */
var CUser_GetCharacExpandData = new NativeFunction(ptr(0x080DD584), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
/** 获取角色所在大区 */
var CUser_GetServerGroup = new NativeFunction(ptr(0x080CBC90), 'int', ['pointer'], { "abi": "sysv" });
/** 获取公会名 */
var CUser_GetGuildName = new NativeFunction(ptr(0x869742A), 'pointer', ['pointer'], { "abi": "sysv" });
/**获取账号金库*/
var CUser_GetAccountCargo = new NativeFunction(ptr(0x0822fc22), 'pointer', ['pointer'], { "abi": "sysv" });
/** 获取角色点券余额 */
var CUser_GetCera = new NativeFunction(ptr(0x080FDF7A), 'int', ['pointer'], { "abi": "sysv" });
/** 获取角色代币券余额 */
var CUser_GetCeraPoint = new NativeFunction(ptr(0x08692AF6), 'int', ['pointer'], { "abi": "sysv" });
/** 检查角色身上道具冷却Buff状态 */
var CUser_CheckCoolTimeItem = new NativeFunction(ptr(0x0865E994), 'int', ['pointer', 'int'], { "abi": "sysv" });
/** 通知客户端刷新指定物品栏空间 */
var CUser_Send_ItemSpace = new NativeFunction(ptr(0x0865DB6C), 'int', ['pointer', 'int'], { "abi": "sysv" });

/** 绝望之塔层数 */
var TOD_Layer_TOD_Layer = new NativeFunction(ptr(0x085FE7B4), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
var TOD_UserState_SetEnterLayer = new NativeFunction(ptr(0x086438FC), 'pointer', ['pointer', 'pointer'], { "abi": "sysv" });

/** 点券/代币充值 */
var WongWork_IPG_CIPGHelper_IPGInput = new NativeFunction(ptr(0x80FFCA4), 'int', ['pointer', 'pointer', 'int', 'int', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer'], { "abi": "sysv" });
var WongWork_IPG_CIPGHelper_IPGQuery = new NativeFunction(ptr(0x8100790), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var WongWork_IPG_CIPGHelper_IPGInputPoint = new NativeFunction(ptr(0x80FFFC0), 'int', ['pointer', 'pointer', 'int', 'int', 'pointer', 'pointer'], { "abi": "sysv" });

/** 获取玩家任务信息*/
var CUser_GetCurCharacQuestW = new NativeFunction(ptr(0x814AA5E), 'pointer', ['pointer'], { "abi": "sysv" });
/** 任务相关操作(第二个参数为协议编号: 33=接受任务, 34=放弃任务, 35=任务完成条件已满足, 36=提交任务领取奖励)*/
var CUser_Quest_Action = new NativeFunction(ptr(0x0866DA8A), 'int', ['pointer', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
/** 通知客户端更新已完成任务列表*/
var CUser_Send_Clear_Quest_List = new NativeFunction(ptr(0x868B044), 'int', ['pointer'], { "abi": "sysv" });
/** 通知客户端更新角色任务列表*/
var UserQuest_Get_Quest_Info = new NativeFunction(ptr(0x86ABBA8), 'int', ['pointer', 'pointer'], { "abi": "sysv" });

/**道具是否被锁*/
var CUser_CheckItemLock = new NativeFunction(ptr(0x8646942), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });

/** 给角色发消息*/
var CUser_SendNotiPacketMessage = new NativeFunction(ptr(0x86886CE), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
/** 通知客户端道具更新  
 * 
 * (客户端指针,   
 * 通知方式[仅客户端=1, 世界广播=0, 小队=2, war room=3]  
 *  itemSpace[0:物品 1:时装 2:宠物 3:身上]  
 *  道具所在的背包槽)*/
var CUser_SendUpdateItemList = new NativeFunction(ptr(0x867C65A), 'int', ['pointer', 'int', 'int', 'int'], { "abi": "sysv" });
/** 通知客户端角色属性更新*/
var CUser_SendNotiPacket = new NativeFunction(ptr(0x867BA5C), 'int', ['pointer', 'int', 'int', 'int'], { "abi": "sysv" });
/** 通知客户端QP更新*/
var CUser_SendCharacQp = new NativeFunction(ptr(0x868AC24), 'int', ['pointer'], { "abi": "sysv" });
/** 通知客户端QuestPiece更新*/
var CUser_SendCharacQuestPiece = new NativeFunction(ptr(0x868AF2C), 'int', ['pointer'], { "abi": "sysv" });
var CUser_SendPacket = new NativeFunction(ptr(0x867B8FE), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
/** 发包给客户端*/
var CUser_Send = new NativeFunction(ptr(0x86485BA), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var CUser_SendCmdErrorPacket = new NativeFunction(ptr(0x0867bf42), 'int', ['pointer', 'int', 'uint8'], { "abi": "sysv" });
/** 返回选择角色界面 */
var CUser_ReturnToSelectCharacList = new NativeFunction(ptr(0x8686FEE), 'int', ['pointer', 'int'], { "abi": "sysv" });
/** 设置GM完成任务模式(无条件完成任务)*/
var CUser_SetGmQuestFlag = new NativeFunction(ptr(0x822FC8E), 'int', ['pointer', 'int'], { "abi": "sysv" });
/** 执行debug命令*/
var DoUserDefineCommand = new NativeFunction(ptr(0x0820BA90), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });

////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

/**任务脚本中[grade]字段对应的常量定义 可以在importQuestScript函数中找到  
 * 
 * [common unique]类型的任务(转职等任务)   
 * 可重复提交的重复任务   
 * 每日任务   
 * 史诗任务   
 * 成就任务  
 */
const QUEST_GRADE = {
    QUEST_GRADE_COMMON_UNIQUE: 5,                  // 任务脚本中[grade]字段对应的常量定义 可以在importQuestScript函数中找到
    QUEST_GRADE_NORMALY_REPEAT: 4,                 // 可重复提交的重复任务
    QUEST_GRADE_DAILY: 3,                          // 每日任务
    QUEST_GRADE_EPIC: 0,                           // 史诗任务
    QUEST_GRADE_ACHIEVEMENT: 2                    // 成就任务
}

/** 通知客户端更新背包栏（对象）   
* 物品栏
* 时装栏
* 仓库
* 宠物栏
* 账号仓库
*/
const ITEMSPACE_TYPE = {
    ITEMSPACE_TYPE_INVENTORY: 0,       // 物品栏
    ITEMSPACE_TYPE_AVATAR: 1,          // 时装栏
    ITEMSPACE_TYPE_CARGO: 2,           // 仓库
    ITEMSPACE_TYPE_CREATURE: 7,       // 宠物栏
    ITEMSPACE_TYPE_ACCOUNT_CARGO: 12   // 账号仓库
}

/** 通知客户端道具更新  
 * 0:物品  
 * 1:时装   
 * 2:宠物   
 * 3:身上
*/
const UPDATE_TYPE={
    UPDATE_TYPE_INVENTORY: 0,       // 物品栏
    UPDATE_TYPE_AVATAR: 1,          // 时装栏
    UPDATE_TYPE_CREATURE: 2,       // 宠物栏
    UPDATE_TYPE_BODY: 3,         //身上穿的装备 
}

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

/** 基础模块的API接口，会被添加到全局context中 */
const api = {
    CUser_GetAccountCargo,
    CUser_GetCera,
    CUser_GetCeraPoint,
    CUser_CheckCoolTimeItem,
    CUser_Send_ItemSpace,
    CUser_Get_State,
    CUser_Get_Acc_Id,
    CUser_GetParty,
    CUser_GetCharacExpandData,
    CUser_GetServerGroup,
    CUser_GetGuildName,
    CUser_GetCurCharacQuestW,
    CUser_Quest_Action,
    CUser_SetGmQuestFlag,

    CUser_CheckItemLock,

    CUser_Send,
    CUser_SendPacket,
    CUser_SendCmdErrorPacket,
    CUser_Send_Clear_Quest_List,
    CUser_SendCharacQp,
    CUser_SendCharacQuestPiece,
    CUser_SendUpdateItemList,
    CUser_SendNotiPacket,

    QUEST_GRADE,
    ITEMSPACE_TYPE,
    UPDATE_TYPE,

    /** 临时开GM权限*/
    setGameMasterModeTemp(user, enable) {
        var old_gm_mode = user.add(463320).readU8();
        user.add(463320).writeU8(enable);
        // 返回旧权限
        return old_gm_mode;
    },
    /** 所有副本开王图*/
    api_DoUserDefineCommand_Unlock_Dungeon(user) {
        var a3 = Memory.allocUtf8String('3');   // 副本解锁难度: 0-3
        DoUserDefineCommand(user, 120, a3);
    },
    /** 
     * 给角色发道具
     * @param {*} user 
     * @param {*} item_id 
     * @param {*} item_cnt 
     * @returns 
     */
    api_CUser_AddItem(user, item_id, item_cnt) {
        var item_space = Memory.alloc(4);
        var slot = CUser_AddItem(user, item_id, item_cnt, 6, item_space, 0);
        if (slot >= 0) {
            // 通知客户端有游戏道具更新
            CUser_SendUpdateItemList(user, 1, item_space.readInt(), slot);
        }
        return;
    },
    /** 
     * 给角色发经验
     * @param {*} user 
     * @param {*} exp 
     */
    api_CUser_Gain_Exp_Sp(user, exp) {
        var a2 = Memory.alloc(4);
        var a3 = Memory.alloc(4);
        CUser_Gain_Exp_Sp(user, exp, a2, a3, 0, 0, 0);
    },
    /** 返回选择角色界面*/
    api_CUser_ReturnToSelectCharacList(user) {
        api_ScheduleOnMainThread(CUser_ReturnToSelectCharacList, [user, 1]);
    },
    /** 踢人*/
    api_CUser_Kill_The_Game(user) {
        var packet_guard = api_PacketGuard_PacketGuard();
        try {
            InterfacePacketBuf_Clear(packet_guard);
            InterfacePacketBuf_Put_Header(packet_guard, 1, 3);
            InterfacePacketBuf_Put_Byte(packet_guard, 1);
            InterfacePacketBuf_Finalize(packet_guard, 1);
            CUser_Send(user, packet_guard);
        } finally {
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }
    },
    /** 更新用户任务列表 */
    api_CUser_Send_Updata_Quest_Info(user) {
        let user_quest = CUser_GetCurCharacQuestW(user);

        // 通知客户端更新任务列表
        let packet_guard = api_PacketGuard_PacketGuard();
        try {
            UserQuest_Get_Quest_Info(user_quest, packet_guard);
            CUser_Send(user, packet_guard);
        } finally {
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }
    },
    /** 
     * 发送公告对话框 
     * @param {*} user 
     * @param {*} msg  
     */
    api_CUser_SendAlertPacketMessage(user, msg) {
        var packet_guard = api_PacketGuard_PacketGuard();
        try {
            InterfacePacketBuf_Put_Header(packet_guard, 0, 233);
            InterfacePacketBuf_Put_Byte(packet_guard, 1);
            InterfacePacketBuf_Put_Byte(packet_guard, msg.length);
            api_InterfacePacketBuf_Put_String(packet_guard, msg);

            InterfacePacketBuf_Finalize(packet_guard, 1);
            CUser_Send(user, packet_guard);
        } finally {
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }
    },
    /** 
     * 给角色发消息   
     * @param {*} user 
     * @param {*} msg 
     * @param {*} msg_type   
    0.上方系统公告栏   
    1.绿(私聊)  
    2.蓝(组队)  
    3.白(普通)  
    6.粉(公会)  
    8.橙(师徒)  
    14.管理员(喇叭)  
    16.系统消息  
    * @returns 
    */
    api_CUser_SendNotiPacketMessage(user, msg, msg_type) {
        var p = Memory.allocUtf8String(msg);
        CUser_SendNotiPacketMessage(user, p, msg_type);
        return;
    },
    /** 获取角色公会名称 */
    api_CUser_GetGuildName(user) {
        var p = CUser_GetGuildName(user);
        if (p.isNull()) {
            return '';
        }
        return p.readUtf8String(-1);
    },
    /** 点券充值（通过IPG接口调用存储过程，严禁直接写billing库） */
    api_Recharge_Cash_Cera(user, amount) {
        if (!user || user.isNull() || amount <= 0)
            return;
        WongWork_IPG_CIPGHelper_IPGInput(ptr(0x941F734).readPointer(), user, 5, amount, ptr(0x8C7FA20), ptr(0x8C7FA20),
            Memory.allocUtf8String('GM'), ptr(0), ptr(0), ptr(0));
        WongWork_IPG_CIPGHelper_IPGQuery(ptr(0x941F734).readPointer(), user);
    },
    /** 代币券充值 */
    api_Recharge_Cash_Cera_Point(user, amount) {
        if (!user || user.isNull() || amount <= 0)
            return;
        WongWork_IPG_CIPGHelper_IPGInputPoint(ptr(0x941F734).readPointer(), user, amount, 4, ptr(0), ptr(0));
        WongWork_IPG_CIPGHelper_IPGQuery(ptr(0x941F734).readPointer(), user);
    },
    /** 设置角色绝望之塔当前层数 */
    api_TOD_UserState_SetEnterLayer(user, layer) {
        var tod_layer = Memory.alloc(100);
        TOD_Layer_TOD_Layer(tod_layer, layer);
        var expand_data = CUser_GetCharacExpandData(user, 13);
        TOD_UserState_SetEnterLayer(expand_data, tod_layer);
    },
}

//module.name 获取模块名
module.exports = {
    // 当api属性是唯一导出内容时，可以省略api包装
    api
};
