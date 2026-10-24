/**
 * avatar-hidden-option.js
 * 时装潜能（装扮隐藏属性随机赋予）
 */

/** 模块配置 */
var _config = {
    minOptionId: 1,     // 潜能属性起始编号（含）
    maxOptionId: 64,    // 潜能属性结束编号（不含，默认随机范围 1 ~ 63）
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const ADDR_DISABLE_SYS_ASSIGN = ptr(0x08509D49);
const ADDR_HIDDEN_OPT_VALUE = ptr(0x08509D34);

////////////////////////////////////////////////////////////////////////
// 变量
////////////////////////////////////////////////////////////////////////

let _origSysAssignBytes = null;
let _origHiddenOptBytes = null;

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

function _applyHiddenOption() {
    // 关闭系统默认分配属性
    Memory.protect(ADDR_DISABLE_SYS_ASSIGN, 3, 'rwx');
    ADDR_DISABLE_SYS_ASSIGN.writeByteArray([0xEB]);

    // 随机下发时装潜能属性 (1 ~ 63)
    const randOpt = context.system.common.getRandomInt(_config.minOptionId, _config.maxOptionId);
    Memory.protect(ADDR_HIDDEN_OPT_VALUE, 3, 'rwx');
    ADDR_HIDDEN_OPT_VALUE.writeUShort(randOpt);
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    init() {
        _origSysAssignBytes = ADDR_DISABLE_SYS_ASSIGN.readByteArray(1);
        _origHiddenOptBytes = ADDR_HIDDEN_OPT_VALUE.readByteArray(2);
    },
    dispose() {
        if (_origSysAssignBytes) {
            Memory.protect(ADDR_DISABLE_SYS_ASSIGN, 3, 'rwx');
            ADDR_DISABLE_SYS_ASSIGN.writeByteArray(_origSysAssignBytes);
            _origSysAssignBytes = null;
        }
        if (_origHiddenOptBytes) {
            Memory.protect(ADDR_HIDDEN_OPT_VALUE, 3, 'rwx');
            ADDR_HIDDEN_OPT_VALUE.writeByteArray(_origHiddenOptBytes);
            _origHiddenOptBytes = null;
        }
    },
    hooks: [
        {
            address: '0x08509B9E',
            onEnter(args) {
                _applyHiddenOption();
            }
        },
        {
            address: '0x0817EDEC',
            onLeave(retval) {
                retval.replace(1);
            }
        }
    ]
};
