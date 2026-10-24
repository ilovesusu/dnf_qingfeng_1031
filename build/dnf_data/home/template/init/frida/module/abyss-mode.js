/**
 * abyss-mode.js
 * 通过指定命令 开启/关闭 深渊模式
 * 20250901 by Tim
 */

/** 模块配置 */
var _config = {
    gmAuth: context.config.gmCid,//权限认证采用全局配置文件中的
    cmd: {
        '开启深渊命令': 'onhell',   //例：//onhell
        '关闭深渊命令': 'offhell',  //例：//offhell
    }
}

////////////////////////////////////////////////////////////////////////
// 接口
////////////////////////////////////////////////////////////////////////

const { log } = context.main;
const { INFO, WARN, ERROR } = context.main.LOG_LEVELS;

const { api_PacketBuf_Get_Buf } = context.system.packet;

const { api_CUser_SendNotiPacketMessage } = context.utils.cuser;

const { CUserCharacInfo_GetCurCharacNo } = context.utils.cuserCharacInfo;


////////////////////////////////////////////////////////////////////////
// 变量 
////////////////////////////////////////////////////////////////////////

/** 深渊模式标识 */
let _heffPartyTag = false;

////////////////////////////////////////////////////////////////////////
// 函数
////////////////////////////////////////////////////////////////////////

function _registerGmHelp() {
    if (!context.gmHelpRegistry) {
        context.gmHelpRegistry = new Map();
    }
    const entries = [
        { cmd: _config.cmd['开启深渊命令'], params: '', desc: '开启强制深渊模式' },
        { cmd: _config.cmd['关闭深渊命令'], params: '', desc: '关闭强制深渊模式' },
    ];
    for (const item of entries) {
        if (item.cmd) {
            context.gmHelpRegistry.set(item.cmd, { ...item, moduleName: module.name });
        }
    }
}

function _unregisterGmHelp() {
    if (!context.gmHelpRegistry)
        return;
    for (const [key, val] of context.gmHelpRegistry.entries()) {
        if (val.moduleName === module.name) {
            context.gmHelpRegistry.delete(key);
        }
    }
}

////////////////////////////////////////////////////////////////////////
// 导出
////////////////////////////////////////////////////////////////////////

module.exports = {
    init() {
        _registerGmHelp();
    },
    dispose() {
        _unregisterGmHelp();
    },
    hooks: [
        // 深渊模式
        {
            address: '0x085a0954',
            onEnter(args) {
                if (_heffPartyTag)
                    args[3] = ptr(1);
            }
        },
        // GM指令
        {
            address: '0x820BBDE',
            onEnter(args) {
                // 用户信息
                var user = args[1];
                var charac_no = CUserCharacInfo_GetCurCharacNo(user);

                // 验证权限
                if (!_config.gmAuth.includes(charac_no))
                    return;

                // 获取原始封包数据
                var rawPacketBuf = api_PacketBuf_Get_Buf(args[2]);
                // 解析GM DEBUG命令
                var msgLen = rawPacketBuf.readInt();
                var msg = rawPacketBuf.add(4).readUtf8String(msgLen);
                msg = msg.slice(2).trim();

                if (msg == _config.cmd['开启深渊命令']) {
                    _heffPartyTag = true;
                    api_CUser_SendNotiPacketMessage(user, 'GM：开启深渊模式成功！', 1);
                    return;
                }

                if (msg == _config.cmd['关闭深渊命令']) {
                    _heffPartyTag = false;
                    api_CUser_SendNotiPacketMessage(user, 'GM：关闭深渊模式成功！', 1);
                    return;
                }
            },
            onLeave(retval) {

            }
        }
    ]
};
