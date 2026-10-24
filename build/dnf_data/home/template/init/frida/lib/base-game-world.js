/**
 * base-game-world.js
 * GameWorld 相关模块(基础模块)
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

/** 获取GameWorld实例*/
var G_GameWorld = new NativeFunction(ptr(0x80DA3A7), 'pointer', [], { "abi": "sysv" });
// 将协议发给所有在线玩家(慎用! 广播类接口必须限制调用频率, 防止CC攻击)
/** 除非必须使用, 否则改用对象更加明确的CParty::send_to_party/GameWorld::send_to_area*/
var GameWorld_Send_All = new NativeFunction(ptr(0x86C8C14), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var GameWorld_Send_All_With_State = new NativeFunction(ptr(0x86C9184), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
/** 根据账号查找已登录角色 */
var GameWorld_Find_User_From_World_ByAccid = new NativeFunction(ptr(0x86C4D40), 'pointer', ['pointer', 'int'], { "abi": "sysv" });

/** 在线玩家列表(用于std::map遍历) */
var GameWorld_User_Map_Begin = new NativeFunction(ptr(0x80F78A6), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var GameWorld_User_Map_End = new NativeFunction(ptr(0x80F78CC), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var GameWorld_User_Map_Not_Equal = new NativeFunction(ptr(0x80F78F2), 'bool', ['pointer', 'pointer'], { "abi": "sysv" });
var GameWorld_User_Map_Get = new NativeFunction(ptr(0x80F7944), 'pointer', ['pointer'], { "abi": "sysv" });
var GameWorld_User_Map_Next = new NativeFunction(ptr(0x80F7906), 'pointer', ['pointer', 'pointer'], { "abi": "sysv" });


////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

/** 基础模块的API接口，会被添加到全局context中 */
const api = {
    G_GameWorld,

    api_GameWorld_Send_All(packet_guard) {
        GameWorld_Send_All(G_GameWorld(), packet_guard);
    },
    api_GameWorld_Send_All_With_State(packet_guard, state) {
        GameWorld_Send_All_With_State(G_GameWorld(), packet_guard, state);  //只给state >= 3 的玩家发公告
    },
    /** 遍历频道内所有已登录角色(state >= 3)执行回调 */
    api_GameWorld_Foreach(callback, args) {
        var it = Memory.alloc(4);
        var end = Memory.alloc(4);
        var next = Memory.alloc(4);
        GameWorld_User_Map_Begin(it, G_GameWorld().add(308));
        GameWorld_User_Map_End(end, G_GameWorld().add(308));

        while (GameWorld_User_Map_Not_Equal(it, end)) {
            var user = GameWorld_User_Map_Get(it).add(4).readPointer();
            if (!user.isNull() && context.utils.cuser.CUser_Get_State(user) >= 3) {
                callback(user, args);
            }
            GameWorld_User_Map_Next(next, it);
        }
    },
    /** 根据账号获取已登录角色 */
    api_GameWorld_Find_User_From_World_ByAccid(accId) {
        if (!accId)
            return null;
        return GameWorld_Find_User_From_World_ByAccid(G_GameWorld(), accId);
    },
    /** 
     * 发送公告对话框 
     * @param {*} user 
     * @param {*} msg  
     */
    api_GameWorld_SendAlertPacketMessage(user, msg) {
        var packet_guard = api_PacketGuard_PacketGuard();
        try {
            InterfacePacketBuf_Put_Header(packet_guard, 0, 233);
            InterfacePacketBuf_Put_Byte(packet_guard, 1);
            InterfacePacketBuf_Put_Byte(packet_guard, msg.length);
            api_InterfacePacketBuf_Put_String(packet_guard, msg);

            InterfacePacketBuf_Finalize(packet_guard, 1);
            GameWorld_Send_All_With_State(G_GameWorld(), packet_guard, 3);  //只给state >= 3 的玩家发公告
        } finally {
            Destroy_PacketGuard_PacketGuard(packet_guard);
        }
    },
    /** 
     * 世界广播（频道内消息）
     * @param {*} msg 
     * @param {*} msg_type 
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
    api_GameWorld_SendNotiPacketMessage(msg, msg_type) {
        var packet_guard = api_PacketGuard_PacketGuard();
        try {
            InterfacePacketBuf_Put_Header(packet_guard, 0, 12);
            InterfacePacketBuf_Put_Byte(packet_guard, msg_type);
            InterfacePacketBuf_Put_Short(packet_guard, 0);
            InterfacePacketBuf_Put_Byte(packet_guard, 0);
            api_InterfacePacketBuf_Put_String(packet_guard, msg);
            InterfacePacketBuf_Finalize(packet_guard, 1);
            GameWorld_Send_All_With_State(G_GameWorld(), packet_guard, 3);  // 只给state >= 3 的玩家发公告
        } finally { Destroy_PacketGuard_PacketGuard(packet_guard); }
    },
}


//module.name 获取模块名
module.exports = {
    // 当api属性是唯一导出内容时，可以省略api包装
    api
};
