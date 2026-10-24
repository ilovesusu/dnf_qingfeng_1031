/**
 * fourteen-keys.js
 * 真·14键（需要DLL或登录器支持）
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

////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

/**真·14键 */
function _fourteenButtons() {
    Memory.protect(ptr(0x08604B1E), 4, 'rwx');
    ptr(0x08604B1E).writeByteArray([0x83, 0x7D, 0xEC, 0x07]);
    Memory.protect(ptr(0x08604B8C), 7, 'rwx');
    ptr(0x08604B8C).writeByteArray([0xC7, 0x45, 0xE4, 0x08, 0x00, 0x00, 0x00]);
    Memory.protect(ptr(0x08604A09), 4, 'rwx');
    ptr(0x08604A09).writeByteArray([0x83, 0x7D, 0x0C, 0x07]);
    Memory.protect(ptr(0x086050b1), 7, 'rwx');
    ptr(0x086050b1).writeByteArray([0xC7, 0x45, 0xEC, 0x08, 0x00, 0x00, 0x00]);
    Memory.protect(ptr(0x0860511c), 7, 'rwx');
    ptr(0x0860511c).writeByteArray([0xC7, 0x45, 0xE8, 0x08, 0x00, 0x00, 0x00]);
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

//module.name 获取模块名
module.exports = {
    init() {
        _fourteenButtons();
    },

};
