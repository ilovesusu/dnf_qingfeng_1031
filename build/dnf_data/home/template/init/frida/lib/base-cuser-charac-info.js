/**
 * base-cuser-charac-info.js
 * CUserCharacInfo 相关模块(基础模块)
 * 20250914 by Tim
 */

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

/** 获取当前角色id*/
var CUserCharacInfo_GetCurCharacNo = new NativeFunction(ptr(0x80CBC4E), 'int', ['pointer'], { "abi": "sysv" });
/** 获取角色名字*/
var CUserCharacInfo_GetCurCharacName = new NativeFunction(ptr(0x8101028), 'pointer', ['pointer'], { "abi": "sysv" });
/**获取角色等级*/
var CUserCharacInfo_Get_Charac_Level = new NativeFunction(ptr(0x80DA2B8), 'int', ['pointer'], { "abi": "sysv" });
/**获取角色当前等级升级所需经验*/
var CUserCharacInfo_Get_Level_Up_Exp = new NativeFunction(ptr(0x0864E3BA), 'int', ['pointer', 'int'], { "abi": "sysv" });
/**获取角色职业*/
var CUserCharacInfo_Get_Charac_Job = new NativeFunction(ptr(0x80FDF20), 'int', ['pointer'], { "abi": "sysv" });
/**获取角色转职/段位类型*/
var CUserCharacInfo_GetCurCharacGrowType = new NativeFunction(ptr(0x815741C), 'int', ['pointer'], { "abi": "sysv" });
/**获取角色公会ID*/
var CUserCharacInfo_Get_Charac_GuildKey = new NativeFunction(ptr(0x822F46C), 'int', ['pointer'], { "abi": "sysv" });
/** 获取角色城镇ID */
var CUserCharacInfo_GetCurCharacVill = new NativeFunction(ptr(0x08645564), 'int', ['pointer']);
/**获取角色背包(可写)*/
var CUserCharacInfo_GetCurCharacInvenW = new NativeFunction(ptr(0x80DA28E), 'pointer', ['pointer'], { "abi": "sysv" });
/**获取角色背包(只读)*/
var CUserCharacInfo_GetCurCharacInvenR = new NativeFunction(ptr(0x080DA27E), 'pointer', ['pointer'], { "abi": "sysv" });
/**获取角色本次登录时间戳(秒)*/
var CUserCharacInfo_GetLoginTick = new NativeFunction(ptr(0x0822F692), 'int', ['pointer'], { "abi": "sysv" });
/**本日已交易金币数量*/
var CUserCharacInfo_GetCurCharacTradeGoldDaily = new NativeFunction(ptr(0x08696600), 'int', ['pointer'], { "abi": "sysv" });

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
    CUserCharacInfo_GetCurCharacInvenW,
    CUserCharacInfo_GetCurCharacInvenR,
    CUserCharacInfo_GetLoginTick,
    CUserCharacInfo_GetCurCharacNo,
    CUserCharacInfo_Get_Charac_Level,
    CUserCharacInfo_Get_Level_Up_Exp,
    CUserCharacInfo_Get_Charac_Job,
    CUserCharacInfo_GetCurCharacGrowType,
    CUserCharacInfo_Get_Charac_GuildKey,
    CUserCharacInfo_GetCurCharacTradeGoldDaily,
    /** 
     * 获取角色名字
     * @param {*} user 
     * @returns 
     */
    api_CUserCharacInfo_GetCurCharacName(user) {
        var p = CUserCharacInfo_GetCurCharacName(user);
        if (p.isNull()) {
            return '';
        }
        return p.readUtf8String(-1);
    },
    /** 
    * 获取用户在游戏中的位置（不包括PVP，未做PVP检查）
    * @param {*} user 
    * @returns 
    */
    getUserPosition(user) {
        const x = user.add(577532).readU16();
        const y = user.add(577534).readU16();
        const area = user.add(577468).readS32();
        const village = CUserCharacInfo_GetCurCharacVill(user);
        return { x, y, area, village };
    },
}

//module.name 获取模块名
module.exports = {
    // 当api属性是唯一导出内容时，可以省略api包装
    api
};
