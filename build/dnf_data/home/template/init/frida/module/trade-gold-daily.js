/**
 * trade-gold-daily.js
 * 每日金币交易限制，应该可以根据不同的用户去限制
 * 20251021 by Tim
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid, // GM权限ID，用于权限验证（全局配置文件'frida_config.json'中设置）
    limit: 1000000
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { CUserCharacInfo_GetCurCharacTradeGoldDaily } = context.utils.cuserCharacInfo;

////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

//module.name 获取模块名
module.exports = {
    hooks: [
        {
            address: '0x08646496',
            onEnter(args) {
                this.user = args[0];
                this.TradeGold = args[1].toInt32(); // 本次交易的金币数量
            },
            onLeave(retval) {
                var TradeGoldDaily = CUserCharacInfo_GetCurCharacTradeGoldDaily(this.user); // 本日已交易金币数量
                if (TradeGoldDaily + this.TradeGold <= _config.limit) {
                    retval.replace(1); // 可以交易
                } else {
                    retval.replace(0); // 不可交易
                }
            }
        }
    ]
};
