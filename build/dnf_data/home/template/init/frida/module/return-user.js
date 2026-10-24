/**
 * return-user.js
 * 勇士归来（回归勇士触发天数设置）
 */

/** 模块配置 */
var _config = {
    returnDays: 15,     // 离线满多少天触发勇士归来（默认 15 天）
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const ADDR_RETURN_USER_SECONDS = ptr(0x84C753D);

////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////

let _origSeconds = null;

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    init() {
        _origSeconds = ADDR_RETURN_USER_SECONDS.readU32();
        const targetSeconds = _config.returnDays * 86400;
        Memory.protect(ADDR_RETURN_USER_SECONDS, 32, 'rwx');
        ADDR_RETURN_USER_SECONDS.writeU32(targetSeconds);
    },
    dispose() {
        if (_origSeconds !== null) {
            Memory.protect(ADDR_RETURN_USER_SECONDS, 32, 'rwx');
            ADDR_RETURN_USER_SECONDS.writeU32(_origSeconds);
            _origSeconds = null;
        }
    }
};
